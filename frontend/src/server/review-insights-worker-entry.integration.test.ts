import {createServer} from "node:http";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {describe,it,expect,vi} from "vitest";
import type {Endpoint} from "@creatoros/contract";
import {metricSnapshots,learnings,eq,type Db} from "@creatoros/backend";
const fixture=vi.hoisted(()=>({url:"",db:null as Db|null,loseReceipt:false}));
vi.mock("@creatoros/backend",async original=>{const actual=await original<typeof import("@creatoros/backend")>();return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{const result=await actual.createConfiguredDb(...args);fixture.db=result.db;return result;}};});
vi.mock("@creatoros/backend/modules/ai-runtime",async original=>({...await original<typeof import("@creatoros/backend/modules/ai-runtime")>(),resolveLlmConfig:async()=>({apiFormat:"openai_chat",baseUrl:fixture.url,model:"review-fixture",token:"fixture",settings:{structuredOutputs:true}})}));
vi.mock("@creatoros/backend/modules/learnings",async original=>{const actual=await original<typeof import("@creatoros/backend/modules/learnings")>();return {...actual,createLearningsService:(...args:Parameters<typeof actual.createLearningsService>)=>{const service=actual.createLearningsService(...args),create=service.createLearning.bind(service);service.createLearning=async(...input)=>{const result=await create(...input);if(fixture.loseReceipt){fixture.loseReceipt=false;throw new Error("LEARNING_RECEIPT_LOST");}return result;};return service;}};});
import {compositeTransport,__resetPersistenceForTests} from "./persistence-client";
const ctx={userId:"insights-entry-test",accountId:"insights-entry-test",requestId:"test",source:"user" as const};
const call=async(id:string,params:unknown,body?:unknown)=>(await compositeTransport.request({id} as Endpoint,{params,query:undefined,body} as never,ctx) as {data:any}).data;
describe("生产复盘 Worker 入口与采纳",()=>{
 it.each([{loseReceipt:false,invalid:false},{loseReceipt:true,invalid:false},{loseReceipt:false,invalid:true}])("真实复盘 lostReceipt=$loseReceipt invalid=$invalid",async ({loseReceipt,invalid})=>{
  const dir=mkdtempSync(resolve(tmpdir(),"t915-insights-"));vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR",resolve(dir,"db"));__resetPersistenceForTests();execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});
  let requests=0,requestBody="";const generated={learnings:invalid ? [] : [{title:"原文先给操作结果",insight:"观众更容易理解示范步骤。"}]};
  const server=createServer((req,res)=>{req.on("data",chunk=>{requestBody+=chunk.toString();});req.on("end",()=>{requests++;res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"fixture",object:"chat.completion",created:1,model:"review-fixture",choices:[{index:0,message:{role:"assistant",content:JSON.stringify(generated)},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));});});
  await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));fixture.url=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
  try{
   const project=await call("projects.create",undefined,{title:"真实复盘项目"});const output=await call("projects.outputs.create",{projectId:project.id},{title:"真实作品"});
   const publication=await call("outputs.publications.register",{outputId:output.id},{platform:"bilibili",externalId:"BV-fixture-insights",externalUrl:"https://www.bilibili.com/video/BV-fixture-insights",title:"实际登记的作品",publishedAt:"2026-09-05T00:00:00.000Z"});
   const stamp=new Date().toISOString();await fixture.db!.insert(metricSnapshots).values({id:"fixture-metric",userId:ctx.userId,accountId:ctx.accountId,publicationId:publication.id,capturedAt:stamp,source:"manual",rawMetrics:{views:321,likes:23},createdAt:stamp});
   const artifact=await call("artifacts.create",{projectId:project.id},{title:"原文",artifactType:"output_script",stage:"script"});await call("artifacts.versions.create",{artifactId:artifact.id},{contentText:"先展示实际操作，再解释方法。"});
   const before=await call("learnings.list",undefined);const task=await call("ai.tasks.create",undefined,{taskType:"review.analyze",projectId:project.id,attemptId:"review-insights-worker",inputData:{projectId:project.id,topic:"实操复盘"}});
   if(invalid){
    await vi.waitFor(async()=>{const read=await call("ai.tasks.get",{taskId:task.id});expect(read.status,JSON.stringify(read)).toBe("failed");expect(read.runtimeStatus).toBe("failed");},{timeout:15000,interval:100});
    expect(requests).toBeGreaterThan(0);expect(await call("ai.tasks.results.list",{taskId:task.id})).toEqual([]);expect(await call("learnings.list",undefined)).toEqual(before);return;
   }
   await vi.waitFor(async()=>{const read=await call("ai.tasks.get",{taskId:task.id});expect(read.status,JSON.stringify(read)).toBe("awaiting_confirmation");},{timeout:15000,interval:100});
   const read=await call("ai.tasks.get",{taskId:task.id});expect(read.executionTaskId).toBeTruthy();expect(read.runtimeStatus).toBe("succeeded");expect(requests).toBe(1);expect(requestBody).toContain("321");expect(requestBody).toContain("先展示实际操作");
   expect(await call("learnings.list",undefined)).toEqual(before);const results=await call("ai.tasks.results.list",{taskId:task.id});expect(results).toHaveLength(1);expect(results[0]).toMatchObject({resultType:"learning_list",resultData:{items:generated.learnings}});
   fixture.loseReceipt=loseReceipt;if(loseReceipt)await expect(call("ai.tasks.confirm",{taskId:task.id})).rejects.toThrow("LEARNING_RECEIPT_LOST");
   const confirmations=await Promise.all([call("ai.tasks.confirm",{taskId:task.id}),call("ai.tasks.confirm",{taskId:task.id})]);expect(confirmations.every(row=>row.status==="succeeded")).toBe(true);expect((await call("ai.tasks.confirm",{taskId:task.id})).status).toBe("succeeded");
   const after=await call("learnings.list",undefined);expect(after.filter((row:any)=>row.projectId===project.id)).toEqual([expect.objectContaining({title:generated.learnings[0]!.title,validationStatus:"validated"})]);
   const [stored]=await fixture.db!.select().from(learnings).where(eq(learnings.id,after.find((row:any)=>row.projectId===project.id).id));expect(stored?.evidenceStrength).toBe("grounded");
   const emptyProject=await call("projects.create",undefined,{title:"无真实指标项目"});const rejected=await call("ai.tasks.create",undefined,{taskType:"review.analyze",attemptId:"missing-real-metrics",inputData:{projectId:emptyProject.id,metrics:"用户自报999999播放"}});
   await vi.waitFor(async()=>{expect((await call("ai.tasks.get",{taskId:rejected.id})).status).toBe("failed");},{timeout:5000,interval:100});expect(requests).toBe(1);expect(await call("ai.tasks.results.list",{taskId:rejected.id})).toEqual([]);
  }finally{fixture.loseReceipt=false;await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});}
 },40000);
});
