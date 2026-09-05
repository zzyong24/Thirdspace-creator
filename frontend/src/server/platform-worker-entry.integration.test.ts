import { createServer } from "node:http";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { describe,it,expect,vi } from "vitest";
import type { Endpoint } from "@creatoros/contract";
const fixture=vi.hoisted(()=>({url:""}));
vi.mock("@creatoros/backend/modules/ai-runtime",async original=>({...await original<typeof import("@creatoros/backend/modules/ai-runtime")>(),resolveLlmConfig:async()=>({apiFormat:"openai_chat",baseUrl:fixture.url,model:"fixture",token:"fixture",settings:{structuredOutputs:true}})}));
import { compositeTransport,__resetPersistenceForTests } from "./persistence-client";
const ctx={userId:"worker-entry-test",accountId:"worker-entry-test",requestId:"test",source:"user" as const};
const call=async(id:string,params:unknown,body?:unknown)=>(await compositeTransport.request({id} as Endpoint,{params,query:undefined,body} as never,ctx) as {data:any}).data;
describe("生产多平台创建入口",()=>{
  it("公共transport创建后由真实Worker生成，公共回读完成并可采纳",async()=>{
    const directory=mkdtempSync(resolve(tmpdir(),"t915-entry-"));vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR",resolve(directory,"db"));
    __resetPersistenceForTests();execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});
    let requests=0;
    const server=createServer((req,res)=>{req.resume();requests++;res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"fixture",object:"chat.completion",created:1,model:"fixture",choices:[{index:0,message:{role:"assistant",content:JSON.stringify({drafts:[{platform:"douyin",title:"生产入口测试",body:"通过真实Worker生成。",tags:[],coverIdea:"",auditFlags:[]}]})},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));});
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));fixture.url=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
    try{
      const project=await call("projects.create",undefined,{title:"隔离测试项目"});
      const output=await call("projects.outputs.create",{projectId:project.id},{title:"隔离测试作品"});
      const task=await call("ai.tasks.create",undefined,{taskType:"publish.platform_adapt",attemptId:"production-entry-test-attempt",inputData:{outputId:output.id,scriptText:"原始输入",platforms:["douyin"]}});
      await vi.waitFor(async()=>{const current=await call("ai.tasks.get",{taskId:task.id});expect(current.status,JSON.stringify(current)).toBe("awaiting_confirmation");},{timeout:15000,interval:100});
      const read=await call("ai.tasks.get",{taskId:task.id});expect(read.executionTaskId).toBeTruthy();expect(read.runtimeStatus).toBe("succeeded");expect(requests).toBe(1);
      expect((await call("ai.tasks.confirm",{taskId:task.id})).status).toBe("succeeded");
    }finally{
      await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();
      __resetPersistenceForTests();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});
    }
  },30000);
});
