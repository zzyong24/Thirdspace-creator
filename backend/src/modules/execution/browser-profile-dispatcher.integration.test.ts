import {execFileSync} from "node:child_process";
import {mkdtemp,writeFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {expect,it,vi} from "vitest";
import {createDb,aiTasks,executionTasks,executionBrowserProfileLeases,eq} from "@creatoros/backend";
import {createExecutionAuthorityService} from "./execution-authority.service";
import {createPersistentTaskService} from "./persistent-task.service";
import {createExecutionBrowserProfileLeaseService} from "./execution-browser-profile-lease.service";
import {createModelWorkerDispatcher} from "./model-worker-dispatcher";
const ctx={userId:"profile-dispatch-test",accountId:"profile-dispatch-test",requestId:"test",source:"user" as const};
const budget={maxCalls:3,maxTokens:10000,deadlineMs:30000};
const alive=(pid:number)=>{try{process.kill(pid,0);return true;}catch{return false;}};
it.each(["stopped","exit"] as const)("实际Worker %s 后只在子树停止被证明时释放profile",async mode=>{
 const f=await createDb();const directory=await mkdtemp(join(tmpdir(),"t915-profile-tree-"));const pidPath=join(directory,"grandchild.pid"),entryPath=join(directory,"worker.cjs");
 await writeFile(entryPath,`
 const {spawn}=require('node:child_process');const fs=require('node:fs');let execution;
 setInterval(()=>{},1000);
 process.on('message',message=>{
  if(message.type==='run'){
   execution=message.execution;
   const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
   fs.writeFileSync(${JSON.stringify(pidPath)},String(child.pid));
   process.send({version:1,type:'call',requestId:'credential',execution,port:'resolveModelCredential',data:{capability:'fixture'}});
  }
  if(message.type==='reply' && message.requestId==='credential'){
   if(!message.ok)process.exit(9);
   if(${JSON.stringify(mode)}==='exit')process.exit(0);
   else process.send({version:1,type:'stopped',requestId:'done',execution,reason:'failed'});
  }
 });
 process.send({version:1,type:'ready',requestId:'ready',capabilities:['model.generate']});
 `);
 const profile=createExecutionBrowserProfileLeaseService(f.db);let grandchild=0;let acquired=false;const errors:string[]=[];
 const host=createModelWorkerDispatcher(f.db,{entryPath,workerId:"profile-host",budget,modelConcurrency:1,onError:code=>errors.push(code),
  async resolveModelCredential(_ctx,_capability,owner){
   const [task]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,owner.executionTaskId));
   grandchild=Number(await readFile(pidPath,"utf8"));expect(grandchild).toBeGreaterThan(0);expect(alive(grandchild)).toBe(true);
   if(!task?.fenceToken)throw new Error("真实执行租约缺少fenceToken");
   await profile.acquire({executionTaskId:task.id,attempt:task.attempt,fenceToken:task.fenceToken},"example.com");acquired=true;
   return {apiFormat:"openai_chat",baseUrl:null,model:"unused",token:"fixture"};
  },projectCandidate(){throw new Error("模型夹具不产生业务候选");},
 });
 try{
  await f.db.insert(aiTasks).values({id:"source",userId:ctx.userId,accountId:ctx.accountId,taskType:"script.draft",idempotencyKey:"source",requestedAt:new Date().toISOString()});
  await createExecutionAuthorityService(f.db).bindAiTask(ctx,"source",{requestFingerprint:"sha256:"+"0".repeat(64),budget,modelInput:{kind:"model.generate",prompt:"fixture",capability:"fixture",maxOutputTokens:100,operationKey:"fixture"}});
  await host.drainOnce();expect(acquired).toBe(true);
  const [lock]=await f.db.select().from(executionBrowserProfileLeases);expect(lock).toBeTruthy();
  if(mode==="stopped"){
   let processState="gone";try{processState=execFileSync("ps",["-p",String(grandchild),"-o","pid=,ppid=,stat=,lstart="],{encoding:"utf8"});}catch{}
   console.info("TREE_DIAGNOSTIC",JSON.stringify({lock,errors,pid:grandchild}),processState);
   await vi.waitFor(()=>expect(alive(grandchild)).toBe(false),{timeout:3000,interval:50});expect(lock!.releasedAt).not.toBeNull();
  }else{
   expect(alive(grandchild)).toBe(true);expect(lock!.releasedAt).toBeNull();
   const tasks=createPersistentTaskService(f.db);const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:"second",idempotencyKey:"second",payload:{}});
   const claim=(await tasks.claimTask({taskId:task.id,workerId:"second"}))!;
   await expect(profile.acquire({executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},"example.com")).rejects.toMatchObject({code:"BROWSER_PROFILE_BUSY"});
   expect(errors.length).toBeGreaterThan(0);
  }
 }finally{await host.stop();if(grandchild && alive(grandchild))process.kill(grandchild,"SIGKILL");await f.client.close();await rm(directory,{recursive:true,force:true});}
},15000);
