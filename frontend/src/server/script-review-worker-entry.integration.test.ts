import {createServer} from "node:http";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {describe,it,expect,vi} from "vitest";
import type {Endpoint} from "@creatoros/contract";
const fixture=vi.hoisted(()=>({url:""}));
vi.mock("@creatoros/backend/modules/ai-runtime",async original=>({...await original<typeof import("@creatoros/backend/modules/ai-runtime")>(),resolveLlmConfig:async()=>({apiFormat:"openai_chat",baseUrl:fixture.url,model:"review-fixture",token:"fixture",settings:{structuredOutputs:true}})}));
import {compositeTransport,__resetPersistenceForTests} from "./persistence-client";
const ctx={userId:"review-entry-test",accountId:"review-entry-test",requestId:"review-entry-test",source:"user" as const};
const call=async(id:string,params:unknown,body?:unknown)=>(await compositeTransport.request({id} as Endpoint,{params,query:undefined,body} as never,ctx) as {data:any}).data;
describe("生产文稿审核 Worker 入口",()=>{
  it.each([{entry:"ai.tasks.create",retry:false},{entry:"scriptReviews.trigger",retry:false},{entry:"ai.tasks.create",retry:true}])("$entry retry=$retry 经真实子进程保存版本报告，无采纳候选",async ({entry,retry})=>{
    const directory=mkdtempSync(resolve(tmpdir(),"t915-review-entry-"));vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR",resolve(directory,"db"));
    __resetPersistenceForTests();execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});
    let requests=0;let requestBody="";
    const generated={verdict:"risk",summary:"需要复核原文表述",findings:[]};
    const server=createServer((req,res)=>{req.on("data",chunk=>{requestBody+=chunk.toString();});req.on("end",()=>{requests++;if(retry && requests===1){res.writeHead(503,{"content-type":"application/json"});res.end(JSON.stringify({error:{message:"temporary unavailable",type:"server_error"}}));return;}res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"fixture",object:"chat.completion",created:1,model:"review-fixture",choices:[{index:0,message:{role:"assistant",content:JSON.stringify(generated)},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));});});
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));fixture.url=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
    try{
      const project=await call("projects.create",undefined,{title:"隔离审核测试"});
      const artifact=await call("artifacts.create",{projectId:project.id},{title:"待审原稿",artifactType:"master_script",stage:"script"});
      const version=await call("artifacts.versions.create",{artifactId:artifact.id},{contentText:"这是实际待审的原文，供创作者了解技术实践。"});
      const task=entry==="scriptReviews.trigger" ? await call(entry,{projectId:project.id}) : await call(entry,undefined,{taskType:"script.review",projectId:project.id,attemptId:"review-worker-entry",inputData:{projectId:project.id,artifactId:artifact.id,artifactVersion:version.versionNumber}});
      await vi.waitFor(async()=>{const read=await call("ai.tasks.get",{taskId:task.id});expect(read.status,JSON.stringify(read)).toBe("succeeded");},{timeout:15000,interval:100});
      const read=await call("ai.tasks.get",{taskId:task.id});expect(read.executionTaskId).toBeTruthy();expect(read.runtimeStatus).toBe("succeeded");
      expect(await call("ai.tasks.results.list",{taskId:task.id})).toEqual([]);
      const report=await call("scriptReviews.getLatest",{projectId:project.id});expect(report).toMatchObject({artifactId:artifact.id,artifactVersion:version.versionNumber,verdict:"risk",summary:generated.summary,modelLabel:"review-fixture"});
      expect(requests).toBe(retry ? 2 : 1);expect(requestBody).toContain("这是实际待审的原文");
      await call("artifacts.versions.create",{artifactId:artifact.id},{contentText:"用户已经改成另一版。"});
      expect(await call("scriptReviews.getLatest",{projectId:project.id})).toMatchObject({id:report.id,artifactVersion:version.versionNumber});
    }finally{
      await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});
    }
  },40000);
});
