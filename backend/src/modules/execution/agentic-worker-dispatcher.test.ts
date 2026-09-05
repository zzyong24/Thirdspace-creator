import {createServer} from "node:http";
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {z} from "zod";
import {afterAll,beforeAll,describe,it,expect,vi} from "vitest";
import {createDb,aiTasks,aiTaskResults,executionTasks,executionCalls,eq,type Db} from "@creatoros/backend";
import {createExecutionAuthorityService} from "./execution-authority.service";
import {createPersistentTaskService} from "./persistent-task.service";
import {createAgenticProposalStagingService} from "../ai/agentic-proposal-staging.service";
import {createAgenticWorkerDispatcher} from "./model-worker-dispatcher";
import type {AgenticBackendTool} from "./execution-agentic-tool-ports.service";
const ctx={userId:"agent-dispatch",accountId:"agent-dispatch",requestId:"test",source:"user" as const};
const budget={maxCalls:6,maxTokens:100000,deadlineMs:30000};
const parameters=z.object({assetIds:z.array(z.string()),tag:z.string()});
const args={assetIds:["actual-fixture-asset"],tag:"真实候选"};
const { $schema:_,...jsonParameters}=z.toJSONSchema(parameters);
const modelInput={kind:"agentic.run" as const,operationKey:"agent",taskType:"agentic.material" as const,goal:"产生标签候选",systemPrompt:"调用material.organize生成候选，然后总结",capability:"material",maxOutputTokens:200,dryRun:false,tools:[{name:"material.organize",version:"1",label:"候选",description:"生成标签候选",parameters:z.record(z.string(),z.json()).parse(jsonParameters),effect:"proposal" as const}]};
describe("复用进程池的真实Agent调度宿主",()=>{
 let db:Db;let close:()=>Promise<void>;
 beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});},30000);afterAll(async()=>close?.());
 async function prepare(id:string,mode:"agent"|"model"|"unprepared"="agent"){
  await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:mode==="model"?"script.draft":"exec.agentic.material",idempotencyKey:id,requestedAt:new Date().toISOString()});
  return createExecutionAuthorityService(db).bindAiTask(ctx,id,mode==="unprepared"?undefined:{requestFingerprint:"sha256:"+"0".repeat(64),modelInput:mode==="model"?{kind:"model.generate",operationKey:"model",prompt:"正文",capability:"script",maxOutputTokens:100}:modelInput,budget});
 }
 async function server(){
  let requests=0;const http=createServer((req,res)=>{req.resume();requests++;res.writeHead(200,{"content-type":"text/event-stream"});
   const delta=requests===1?{role:"assistant",tool_calls:[{index:0,id:"t1",type:"function",function:{name:"material.organize",arguments:JSON.stringify(args)}}]}:{role:"assistant",content:"候选已生成，请确认"};
   const base={id:`m${requests}`,object:"chat.completion.chunk",created:1,model:"test"};
   res.end(`data: ${JSON.stringify({...base,choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: ${JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:requests===1?"tool_calls":"stop"}],usage:{prompt_tokens:3,completion_tokens:4,total_tokens:7}})}\n\ndata: [DONE]\n\n`);
  });await new Promise<void>(r=>http.listen(0,"127.0.0.1",r));
  return {port:(http.address() as {port:number}).port,get requests(){return requests;},async close(){http.closeAllConnections();await new Promise<void>(r=>http.close(()=>r()));}};
 }
 function host(port:number,execute:NonNullable<AgenticBackendTool["execute"]>){return createAgenticWorkerDispatcher(db,{entryPath:resolve("../ai-worker/dist/agentic-worker.cjs"),workerId:"agent-host",budget,pollMs:100,modelConcurrency:1,
  tools:{"material.organize":{version:"1",parameters,effect:"proposal",execute}},
  async resolveModelCredential(context,capability,owner){expect(context.userId).toBe(ctx.userId);expect(context.accountId).toBe(ctx.accountId);expect(capability).toBe("material");expect(owner.aiTaskId).toBeTruthy();return {apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${port}/v1`,model:"test",token:"fixture",authStyle:"bearer"};},
 });}
 it("真实Worker经持久工具端口保存候选，完整checkpoint与同事务待采纳",async()=>{
  const mapped=await prepare("complete");const http=await server();let executed=0;
  const staging=createAgenticProposalStagingService(db,{resolveLease(){throw new Error("旧入口不可用");},async prepareAssets(_context,ids){return ids.map(assetId=>({assetId,expectedVersion:"fixture-version"}));}});
  const dispatcher=host(http.port,async(context,input,scope)=>{executed++;expect(context.accountId).toBe(ctx.accountId);const data=parameters.parse(input);const proposal=await staging.stageForExecution(scope.execution,{kind:"asset.tags",...data,evidenceRefs:data.assetIds,toolCallId:scope.toolCallId},scope.signal);return {status:"ok",summary:"保存真实候选",evidence:[],data:{proposal},error:null,continuation:null,sideEffect:"proposal"};});
  try{expect(await dispatcher.drainOnce()).toBe(1);expect(http.requests).toBe(2);expect(executed).toBe(1);
   const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,mapped.executionTaskId));expect(task!.status).toBe("succeeded");expect(task!.checkpoint).toMatchObject({revision:3,messages:[{role:"assistant"},{role:"tool"},{role:"assistant"}]});
   const [business]=await db.select().from(aiTasks).where(eq(aiTasks.id,"complete"));expect(business!.status).toBe("awaiting_confirmation");
   const rows=await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,"complete"));expect(rows.map(r=>r.resultType).sort()).toEqual(["agentic_proposal_staged","agentic_proposals"]);
   expect(await dispatcher.drainOnce()).toBe(0);expect(http.requests).toBe(2);
  }finally{await dispatcher.stop();await http.close();}
 },15000);
 it("只领取Agent冻结输入，不抢普通模型或未准备任务",async()=>{
  const model=await prepare("model-only","model");const old=await prepare("unprepared","unprepared");const dispatcher=host(1,async()=>{throw new Error("不应执行");});
  try{expect(await dispatcher.drainOnce()).toBe(0);for(const task of [model,old])expect((await db.select().from(executionTasks).where(eq(executionTasks.id,task.executionTaskId)))[0]!.status).toBe("queued");}finally{await dispatcher.stop();}
 });
 it.each(["cancel","stop"] as const)("%s传递给真实后台工具handler并等待退出，不提交候选",async(mode)=>{
  const mapped=await prepare(`tool-${mode}`);const http=await server();let began=false;let aborted=false;
  const dispatcher=host(http.port,async(_context,_input,scope)=>{began=true;await new Promise<void>(r=>{const done=()=>{aborted=true;r();};if(scope.signal.aborted)done();else scope.signal.addEventListener("abort",done,{once:true});});throw new Error("已取消");});
  try{const draining=dispatcher.drainOnce();await vi.waitFor(()=>expect(began).toBe(true),{timeout:10000});
   if(mode==="cancel")await createPersistentTaskService(db).command(ctx,{taskIds:[mapped.executionTaskId],command:"cancel",idempotencyKey:`cancel-${mode}`});else await dispatcher.stop();
   await draining;expect(aborted).toBe(true);expect(http.requests).toBe(1);expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,`tool-${mode}`))).toHaveLength(0);
   const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,mapped.executionTaskId));expect(calls.find(c=>c.kind==="tool")?.status).toBe("unknown");
  }finally{await dispatcher.stop();await http.close();}
 },15000);
 it.each(["missing-pi","wrong-capability","unknown-call"] as const)("%s不会遗留运行中或自动反复启动",async(mode)=>{
  const mapped=await prepare(`unavailable-${mode}`);const directory=mkdtempSync(join(tmpdir(),"agent-unavailable-"));const starts=join(directory,"starts");const exitCode=join(directory,"exit-code");const entry=join(directory,"entry.cjs");
  const actual=resolve("../ai-worker/dist/agentic-worker.cjs");
  writeFileSync(entry,`require("node:fs").appendFileSync(${JSON.stringify(starts)},"start\\n");`+(mode==="wrong-capability"?`process.send({version:1,type:"ready",requestId:"ready",capabilities:["model.generate"]});process.on("message",()=>{});`:`process.on("exit",code=>require("node:fs").writeFileSync(${JSON.stringify(exitCode)},String(code)));process.chdir(${JSON.stringify(directory)});require(${JSON.stringify(actual)});`));
  if(mode==="unknown-call")await db.insert(executionCalls).values({id:"unavailable-old-call",executionTaskId:mapped.executionTaskId,sequence:1,operationKey:"old",kind:"model",inputDigest:"sha256:"+"a".repeat(64),status:"unknown",reservedTokens:100,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  const credential=vi.fn(async()=>{throw new Error("不应请求模型");});
  const dispatcher=createAgenticWorkerDispatcher(db,{entryPath:entry,workerId:"missing",budget,pollMs:100,modelConcurrency:1,tools:{},resolveModelCredential:credential});
  try{
   expect(await dispatcher.drainOnce()).toBe(1);
   const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,mapped.executionTaskId));
   expect(task!.status).toBe(mode==="unknown-call"?"unknown_result":"waiting_user");expect(task!.lastErrorCode).toBe(mode==="unknown-call"?"AGENT_CALL_REQUIRES_RECONCILIATION":"AGENT_RUNTIME_UNAVAILABLE");expect(task!.leaseOwner).toBeNull();
   expect(await dispatcher.drainOnce()).toBe(0);expect(readFileSync(starts,"utf8").match(/start/g)).toHaveLength(1);expect(credential).not.toHaveBeenCalled();if(mode!=="wrong-capability")expect(readFileSync(exitCode,"utf8")).toBe("78");
  }finally{await dispatcher.stop();rmSync(directory,{recursive:true,force:true});}
 },10000);
});
