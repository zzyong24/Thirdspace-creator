import {configureModelFixture} from "@/test/configure-model-fixture";
import {createServer} from "node:http";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {beforeAll,expect,it,vi} from "vitest";
import type {Endpoint} from "@creatoros/contract";
import {executionTasks,executionCalls,eq,type Db} from "@creatoros/backend";
const fixture=vi.hoisted(()=>({url:"",db:null as Db|null,opens:0,candidatesBeforeRestart:-1,credentialReads:0,checkpointSaved:false,release:null as null|(()=>void)}));
vi.mock("@creatoros/backend",async original=>{const actual=await original<typeof import("@creatoros/backend")>();return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{const result=await actual.createConfiguredDb(...args);fixture.db=result.db;fixture.opens++;if(fixture.opens===2){fixture.candidatesBeforeRestart=(await result.db.select().from(actual.aiTaskResults)).length;
 const rows=await result.db.select().from(actual.executionTasks);expect(rows).toHaveLength(1);expect(rows[0]!.status).toBe("running");
 // 故障窗口的旧租约尚未过期；仅加速隔离DB的租约过期，保留deadline/账本真实状态。
 await result.db.update(actual.executionTasks).set({leaseExpiresAt:new Date(Date.now()-1000).toISOString()}).where(actual.eq(actual.executionTasks.id,rows[0]!.id));
}return result;}};});
vi.mock("@creatoros/backend/modules/ai-runtime",async original=>({...await original<typeof import("@creatoros/backend/modules/ai-runtime")>(),resolveFrozenModelCredential:async(...args:Parameters<typeof import("@creatoros/backend/modules/ai-runtime").resolveFrozenModelCredential>)=>{fixture.credentialReads++;const actual=await original<typeof import("@creatoros/backend/modules/ai-runtime")>();return actual.resolveFrozenModelCredential(...args);}}));
vi.mock("../../../backend/src/modules/execution/execution-generation-ports.service",async original=>{
 const actual=await original<typeof import("../../../backend/src/modules/execution/execution-generation-ports.service")>();
 return {...actual,createExecutionGenerationPorts:(...args:Parameters<typeof actual.createExecutionGenerationPorts>)=>{
  const service=actual.createExecutionGenerationPorts(...args);
  return {...service,settleGenerationCall:async(...input:Parameters<typeof service.settleGenerationCall>)=>{const result=await service.settleGenerationCall(...input);if(!fixture.checkpointSaved){fixture.checkpointSaved=true;await new Promise<void>(done=>{fixture.release=done;});}return result;}};
 }};
});
import {compositeTransport,__resetPersistenceForTests} from "./persistence-client";
const ctx={userId:"script-budget-user",accountId:"script-budget-account",requestId:"test",source:"user" as const};
const call=async(id:string,params:unknown,body?:unknown)=>(await compositeTransport.request({id} as Endpoint,{params,query:undefined,body} as never,ctx) as {data:any}).data;
beforeAll(()=>{execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});},30000);
it("论点模型已结算但回执丢失后真实重启，重放原调用且仅一次HTTP",async()=>{
 const directory=mkdtempSync(resolve(tmpdir(),"t915-thesis-replay-"));vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR",resolve(directory,"db"));__resetPersistenceForTests();
 const output={core:{title:"恢复真实论点",summary:"同一供应商结果无需再次调用"},branches:[]};
 const requests:string[]=[];let injectionError:unknown;
 const server=createServer(async(req,res)=>{
  try{
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));requests.push(Buffer.concat(chunks).toString());
   res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"fixture",object:"chat.completion",created:1,model:"budget-fixture",choices:[{index:0,message:{role:"assistant",content:JSON.stringify(output)},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));
  }catch(error){injectionError=error;res.writeHead(500);res.end("fixture injection failed");}
 });await new Promise<void>(done=>server.listen(0,"127.0.0.1",done));fixture.url=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
 try{
  await configureModelFixture(call,fixture.url,"budget-fixture");
  const project=await call("projects.create",undefined,{title:"隔离预算项目"});const artifact=await call("artifacts.create",{projectId:project.id},{title:"目标原稿",artifactType:"master_script",stage:"script"});
  const before=await call("artifacts.versions.list",{artifactId:artifact.id});
  const task=await call("ai.tasks.create",undefined,{taskType:"planning.thesis",attemptId:"planning-thesis-replay-entry",inputData:{projectId:project.id,artifactId:artifact.id,topic:"保留已生成结果"}});
  await vi.waitFor(()=>expect(fixture.checkpointSaved).toBe(true),{timeout:15000,interval:50});
  const rows=await fixture.db!.select().from(executionTasks).where(eq(executionTasks.userId,ctx.userId));expect(rows).toHaveLength(1);
  const execution=rows[0]!;
  const calls=await fixture.db!.select().from(executionCalls).where(eq(executionCalls.executionTaskId,execution.id));expect(calls).toHaveLength(1);expect(calls[0]!.status).toBe("settled");
  const credentialsBeforeRestart=fixture.credentialReads;
  const dispose=(globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence!;
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([dispose(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("DISPOSE_WAITED_FOR_CHECKPOINT_GATE")),8000);})]);}finally{if(timer)clearTimeout(timer);fixture.release?.();}
  __resetPersistenceForTests();
  await vi.waitFor(async()=>{expect(injectionError).toBeUndefined();const current=await call("ai.tasks.get",{taskId:task.id});expect(current.status,JSON.stringify(current)).toBe("awaiting_confirmation");},{timeout:15000,interval:100});
  expect(fixture.opens).toBe(2);expect(fixture.candidatesBeforeRestart).toBe(0);expect(fixture.credentialReads).toBeGreaterThanOrEqual(credentialsBeforeRestart);const current=await call("ai.tasks.get",{taskId:task.id});expect(current.executionTaskId).toBeTruthy();expect(current.runtimeStatus).toBe("succeeded");expect(requests).toHaveLength(1);
  const candidates=await call("ai.tasks.results.list",{taskId:task.id});expect(candidates).toHaveLength(1);expect(candidates[0].resultData.contentData.nodes).toEqual([{column:"core",...output.core}]);
  expect(await call("artifacts.versions.list",{artifactId:artifact.id})).toEqual(before);
  expect((await call("ai.tasks.confirm",{taskId:task.id})).status).toBe("succeeded");
  const artifacts=(await call("artifacts.list",{projectId:project.id})).filter((a:any)=>a.artifactType==="thesis_tree");expect(artifacts).toHaveLength(1);
  const versions=await call("artifacts.versions.list",{artifactId:artifacts[0].id});expect(versions.find((v:any)=>v.id===artifacts[0].currentVersionId)?.contentData).toEqual({nodes:candidates[0].resultData.contentData.nodes,scriptBasis:{status:"adopted"}});expect(requests).toHaveLength(1);expect(await fixture.db!.select().from(executionCalls).where(eq(executionCalls.executionTaskId,execution.id))).toHaveLength(1);
 }finally{fixture.release?.();await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});}
},45000);
