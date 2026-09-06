import {createDb,aiTasks,aiTaskResults,executionTasks,assets,assetFiles,eq} from "@creatoros/backend";
import {workerPortInputSchemas} from "@creatoros/contract/execution-worker";
import {createExecutionAuthorityService} from "./execution-authority.service";
import {createPersistentTaskService} from "./persistent-task.service";
import {createExecutionLeaseService} from "./execution-lease.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {createExecutionAssetPorts} from "./execution-asset-ports.service";
import {createExecutionCandidateService} from "../ai/execution-candidate.service";
import {createLocalFsObjectStorage} from "../assets/localfs-object-storage";
import {it,expect} from "vitest";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createWorkerSupervisor} from "./worker-supervisor";
const execution={executionTaskId:"binary",attempt:1,fenceToken:"current"};
it("真实子进程回复保留 Uint8Array 的零字节和高位字节",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"t915-binary-")),entry=join(dir,"worker.cjs");
 await writeFile(entry,`process.on('message',m=>{if(m.type==='run'){process.send({version:1,type:'call',requestId:'binary-call',execution:m.execution,port:'readTaskContext',data:{}});}if(m.type==='reply'){const b=m.data;process.send({version:1,type:'stopped',requestId:'done',execution:${JSON.stringify(execution)},reason:b instanceof Uint8Array&&b.length===4&&b[0]===0&&b[1]===255?'completed':'failed'});}});process.send({version:1,type:'ready',requestId:'ready',capabilities:[]});`);
 const supervisor=createWorkerSupervisor({entryPath:entry,ports:{validate:async()=>{},invoke:async()=>new Uint8Array([0,255,128,1])}});
 try{expect(await supervisor.run(execution,Date.now()+10000)).toBe("completed");}finally{await supervisor.stop();await rm(dir,{recursive:true,force:true});}
});

it("真实子进程保存大于10MB的二进制，丢失回执后只恢复原素材并提交候选",async()=>{
 const opened=await createDb(),db=opened.db,dir=await mkdtemp(join(tmpdir(),"t915-asset-port-")),entry=join(dir,"asset-worker.cjs");
 const ctx={userId:"binary-owner",accountId:"binary-account",requestId:"test",source:"user" as const},id="binary-task",now=()=>new Date().toISOString();
 const input={kind:"asset.generate",mediaKind:"video",capability:"video.generate",operationKey:"asset/original",prompt:"真实二进制传输测试",provider:"minimax",model:"MiniMax-H3",baseUrl:null};
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"asset.generate",idempotencyKey:id,inputData:{kind:"video",prompt:input.prompt},requestedAt:now()});
 const mapped=await createExecutionAuthorityService(db).bindAiTask(ctx,id);await db.update(executionTasks).set({payload:{aiTaskId:id,modelInput:input}}).where(eq(executionTasks.id,mapped.executionTaskId));
 const tasks=createPersistentTaskService(db),claim=(await tasks.claimTask({taskId:mapped.executionTaskId,workerId:"test-worker"}))!;
 const ref={executionTaskId:mapped.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const storage=createLocalFsObjectStorage({rootPath:join(dir,"objects"),publicBaseUrl:"/blob"},{nextKey:()=>"unused"}),budget={maxCalls:3,maxTokens:100000,deadlineMs:60000};
 const ports=createExecutionAssetPorts({db,now,budget,objectStorageForCtx:async()=>storage}),leases=createExecutionLeaseService(db),ledger=createExecutionCallLedgerService(db,{budget});
 const candidates=createExecutionCandidateService(db,{projectCandidate:()=>{throw new Error("不能旁路");}});
 let loseAck=true,saveCalls=0;
 await writeFile(entry,`let n=0,pending=new Map();function call(execution,port,data){return new Promise((resolve,reject)=>{const requestId=String(++n);pending.set(requestId,{resolve,reject});process.send({version:1,type:'call',requestId,execution,port,data});});}process.on('message',async m=>{if(m.type==='reply'){const p=pending.get(m.requestId);pending.delete(m.requestId);m.ok?p.resolve(m.data):p.reject(new Error(m.errorCode));return;}if(m.type!=='run')return;let reason='unknown_result';try{const ref=m.execution,r=await call(ref,'reserveAssetCall',{});let receipt;if(r.status==='reserved'){await call(ref,'startAssetCall',{callId:r.callId});await call(ref,'recordAssetProviderJob',{callId:r.callId,job:{schemaVersion:1,provider:'minimax',model:'MiniMax-H3',baseUrl:null,jobId:'original-job'}});const bytes=new Uint8Array(11*1024*1024+3);for(let i=0;i<bytes.length;i++)bytes[i]=i%256;receipt=await call(ref,'saveAssetResult',{callId:r.callId,bytes});}else{const restored=await call(ref,'recoverAssetResult',{callId:r.callId});if(restored.status!=='committed')throw Error('missing');receipt=restored.receipt;}await call(ref,'commitResult',{outcome:'succeeded',callId:r.callId,text:JSON.stringify(receipt)});reason='completed';}catch{}process.send({version:1,type:'stopped',requestId:m.requestId,execution:m.execution,reason});});process.send({version:1,type:'ready',requestId:'ready',capabilities:['asset-port-fixture']});`);
 const make=()=>createWorkerSupervisor({entryPath:entry,ports:{validate:async(ref,mode)=>{await leases.withLease(ref,mode,async()=>{});},invoke:async(ref,port,data)=>{
  if(port==="commitResult")return candidates.commitResult(ref,data);
  if(port==="saveAssetResult")saveCalls++;
  const result=await ports.invoke(ref,port,data);
  if(port==="saveAssetResult" && loseAck){loseAck=false;throw new Error("模拟提交已完成但回执丢失");}
  return result;
 }}});
 let supervisor=make();try{
  expect(await supervisor.run(ref,Date.now()+30000)).toBe("unknown_result");await supervisor.stop();supervisor=make();
  expect(await supervisor.run(ref,Date.now()+30000)).toBe("completed");expect(saveCalls).toBe(1);
  const files=await db.select().from(assetFiles),saved=await storage.getObject(files[0]!.storageKey);expect(saved.length).toBe(11*1024*1024+3);
  for(let i=0;i<saved.length;i++)if(saved[i]!==i%256)throw new Error("原字节损坏");
  expect(await db.select().from(assets)).toHaveLength(1);expect(await db.select().from(aiTaskResults)).toHaveLength(1);
  const state=await ledger.inspect(ref);expect(state.calls).toHaveLength(1);expect(state.calls[0]).toMatchObject({status:"settled",providerJob:{jobId:"original-job"},totalTokens:null});
 }finally{await supervisor.stop();await opened.client.close();await rm(dir,{recursive:true,force:true});}
},30000);
it.each([{callId:"c",bytes:[0,255]},{callId:"c",bytes:new Uint8Array()},{callId:"c",bytes:new Uint8Array([0]),accountId:"foreign"}])("素材端口拒绝非法载荷 %j",raw=>{
 expect(workerPortInputSchemas.saveAssetResult.safeParse(raw).success).toBe(false);
});
