import {it,expect,vi} from "vitest";
import type {Endpoint,RequestContext} from "@creatoros/contract";
import {createServer} from "node:http";
import {resolve} from "node:path";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
const fixture=vi.hoisted(()=>({url:""}));
vi.mock("@creatoros/backend/modules/ai-runtime",async original=>({...await original<typeof import("@creatoros/backend/modules/ai-runtime")>(),resolveLlmConfig:async()=>({apiFormat:"openai_chat",baseUrl:fixture.url,model:"fixture",token:"fixture",settings:{structuredOutputs:true}})}));
import {getChatRuntime,compositeTransport,__resetPersistenceForTests} from "./persistence-client";
it("聊天论点提交沿原 attempt 恢复并继续真实派发，同键不同主题拒绝",async()=>{
 execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});
 const directory=mkdtempSync(resolve(tmpdir(),"t915-chat-submission-"));
 vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR",resolve(directory,"db"));__resetPersistenceForTests();
 let requests=0;
 const server=createServer(async(req,res)=>{for await(const _ of req){}requests++;res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"fixture",object:"chat.completion",created:1,model:"fixture",choices:[{index:0,message:{role:"assistant",content:JSON.stringify({core:{title:"原任务论点",summary:"验证同一提交恢复"},branches:[]})},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));fixture.url=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
 const ctx:RequestContext={userId:"chat-submit",accountId:"a",source:"user",requestId:"test"};
 const call=async(id:string,params:unknown,body?:unknown)=>(await compositeTransport.request({id} as Endpoint,{params,body} as never,ctx) as {data:any}).data;
 try{
  const runtime=await getChatRuntime(),project=await call("projects.create",undefined,{title:"提交恢复项目"});
  const input={projectId:project.id,topic:"原主题",attemptId:"chat-planning-original-attempt"};
  const [first,again]=await Promise.all([runtime.dispatchPlanningThesis(ctx,input),runtime.dispatchPlanningThesis(ctx,input)]);
  expect(again.taskId).toBe(first.taskId);
  await expect(runtime.dispatchPlanningThesis(ctx,{...input,topic:"另一个意图"})).rejects.toMatchObject({code:"ATTEMPT_PAYLOAD_MISMATCH"});
  await vi.waitFor(async()=>{const task=await call("ai.tasks.get",{taskId:first.taskId});expect(task.status,JSON.stringify(task)).toBe("awaiting_confirmation");},{timeout:15000});
  expect((await runtime.dispatchPlanningThesis(ctx,input)).taskId).toBe(first.taskId);
  expect(requests).toBe(1);
  const tasks=await runtime.ai.listTasks(ctx,{taskType:"planning.thesis",limit:100,offset:0});expect(tasks.rows).toHaveLength(1);
 }finally{
  await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});
 }
},30000);
