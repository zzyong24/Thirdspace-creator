import {createServer} from "node:http";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {expect,it,vi} from "vitest";
import type {Endpoint} from "@creatoros/contract";
import {executionTasks,eq,type Db} from "@creatoros/backend";
const fixture=vi.hoisted(()=>({url:"",db:null as Db|null}));
vi.mock("@creatoros/backend",async original=>{const actual=await original<typeof import("@creatoros/backend")>();return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{const result=await actual.createConfiguredDb(...args);fixture.db=result.db;return result;}};});
vi.mock("@creatoros/backend/modules/ai-runtime",async original=>({...await original<typeof import("@creatoros/backend/modules/ai-runtime")>(),resolveLlmConfig:async()=>({apiFormat:"openai_chat",baseUrl:fixture.url,model:"budget-fixture",token:"fixture",settings:{structuredOutputs:true}})}));
import {compositeTransport,__resetPersistenceForTests} from "./persistence-client";
const ctx={userId:"script-budget-user",accountId:"script-budget-account",requestId:"test",source:"user" as const};
const call=async(id:string,params:unknown,body?:unknown)=>(await compositeTransport.request({id} as Endpoint,{params,query:undefined,body} as never,ctx) as {data:any}).data;
it("口播已成功但分镜预算耗尽时零额外HTTP，完整原文仍可采纳",async()=>{
 const directory=mkdtempSync(resolve(tmpdir(),"t915-script-budget-"));vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR",resolve(directory,"db"));__resetPersistenceForTests();
 execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});
 const voiceover="已生成的完整口播必须保留。即使分镜预算不足，也应该能够采纳。";
 const requests:string[]=[];let injectionError:unknown;
 const server=createServer(async(req,res)=>{
  try{
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));requests.push(Buffer.concat(chunks).toString());
   if(requests.length===1){
    // 仅隔离PGlite故障注入：真实compose已开始，冻结其它预算和执行身份，仅降低剩余调用额度。
    const rows=await fixture.db!.select().from(executionTasks).where(eq(executionTasks.userId,ctx.userId));expect(rows).toHaveLength(1);
    const execution=rows[0]!;expect(execution.executionBudget).not.toBeNull();
    await fixture.db!.update(executionTasks).set({executionBudget:{...execution.executionBudget!,maxCalls:1}}).where(eq(executionTasks.id,execution.id));
   }
   res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"fixture",object:"chat.completion",created:1,model:"budget-fixture",choices:[{index:0,message:{role:"assistant",content:JSON.stringify({centralClaim:"保留已有口播",audienceOldBelief:"分镜失败要重写",voiceover})},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));
  }catch(error){injectionError=error;res.writeHead(500);res.end("fixture injection failed");}
 });await new Promise<void>(done=>server.listen(0,"127.0.0.1",done));fixture.url=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
 try{
  const project=await call("projects.create",undefined,{title:"隔离预算项目"});const artifact=await call("artifacts.create",{projectId:project.id},{title:"目标原稿",artifactType:"master_script",stage:"script"});
  const before=await call("artifacts.versions.list",{artifactId:artifact.id});
  const task=await call("ai.tasks.create",undefined,{taskType:"script.draft",attemptId:"script-budget-public-entry",inputData:{projectId:project.id,artifactId:artifact.id,topic:"保留已生成结果"}});
  await vi.waitFor(async()=>{expect(injectionError).toBeUndefined();const current=await call("ai.tasks.get",{taskId:task.id});expect(current.status,JSON.stringify(current)).toBe("awaiting_confirmation");},{timeout:15000,interval:100});
  const current=await call("ai.tasks.get",{taskId:task.id});expect(current.executionTaskId).toBeTruthy();expect(current.runtimeStatus).toBe("partial");expect(requests).toHaveLength(1);expect(requests[0]).toContain("口播主笔");
  const candidates=await call("ai.tasks.results.list",{taskId:task.id});expect(candidates).toHaveLength(1);expect(candidates[0].resultData.sections.map((s:any)=>s.口播).join("")).toBe(voiceover);expect(candidates[0].resultData.qualityWarnings.length).toBeGreaterThan(0);
  expect(await call("artifacts.versions.list",{artifactId:artifact.id})).toEqual(before);
  expect((await call("ai.tasks.confirm",{taskId:task.id})).status).toBe("succeeded");
  const saved=await call("artifacts.get",{artifactId:artifact.id});const versions=await call("artifacts.versions.list",{artifactId:artifact.id});expect(versions).toHaveLength(before.length+1);expect(versions.find((v:any)=>v.id===saved.currentVersionId)?.contentData).toEqual(candidates[0].resultData.contentData);expect(requests).toHaveLength(1);
 }finally{await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});}
},45000);
