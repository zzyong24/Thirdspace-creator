// @vitest-environment node
import {it,expect,vi} from "vitest";
import {createHash} from "node:crypto";
import {createServer} from "node:http";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {execFileSync} from "node:child_process";
import type {Endpoint,RequestContext} from "@creatoros/contract";
import type {Db} from "@creatoros/backend";
const fixture=vi.hoisted(()=>({url:"",db:undefined as Db|undefined}));
vi.mock("@creatoros/backend",async original=>{const actual=await original<typeof import("@creatoros/backend")>();return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{const value=await actual.createConfiguredDb(...args);fixture.db=value.db;return value;}};});
vi.mock("@creatoros/backend/modules/assets",async original=>{const actual=await original<typeof import("@creatoros/backend/modules/assets")>();return {...actual,migrateStorageRoot:async()=>{throw new Error("本测试禁止迁移媒体目录");}};});
vi.mock("@creatoros/backend/modules/ai-runtime",async original=>{const actual=await original<typeof import("@creatoros/backend/modules/ai-runtime")>();return {...actual,resolveLlmConfig:async()=>({apiFormat:"openai_chat",baseUrl:fixture.url,model:"fixture",token:"fixture"})};});
import {getChatRuntime,compositeTransport,__resetPersistenceForTests} from "./persistence-client";
it.each(["fresh","restart","legacy"])("正式整稿派发 %s：保真候选零模型且仅采纳后改稿",async mode=>{
 const interrupted=mode==="restart",legacy=mode==="legacy";
 execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});
 const directory=mkdtempSync(resolve(tmpdir(),"t915-script-submit-"));
 vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR",resolve(directory,"db"));__resetPersistenceForTests();
 let requests=0;
 const server=createServer((_req,res)=>{requests++;res.writeHead(500);res.end("保真模式不应调用模型");});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));fixture.url=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
 const ctx:RequestContext={userId:"script-submit",accountId:"a",requestId:"test",source:"user"};
 const call=async(id:string,params:unknown,body?:unknown)=>(await compositeTransport.request({id} as Endpoint,{params,body} as never,ctx) as {data:any}).data;
 try{
  let runtime=await getChatRuntime();const project=await call("projects.create",undefined,{title:"保真提交"});
  const source="  第一行原文，保留开场。\n\n错别子、空格及结尾也保留。  ";
  const input={projectId:project.id,attemptId:"script-production-original-attempt",draftMode:"verbatim" as const,verbatimSourceRef:"message:original",verbatimSourceText:source,verbatimSourceLength:source.length,verbatimSourceSha256:createHash("sha256").update(source).digest("hex")};
  const legacyArtifact=legacy?await call("artifacts.create",{projectId:project.id},{title:"历史稿",artifactType:"master_script",stage:"script"}):null;
  const {attemptId,...sourceInput}=input;
  const prior=legacy?await runtime.ai.createTask(ctx,{taskType:"script.draft",attemptId,inputData:{...sourceInput,artifactId:legacyArtifact.id}}):interrupted?await runtime.ai.createScriptDraftTask(ctx,input):null;
  if(interrupted){await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();runtime=await getChatRuntime();}
  const [a,b]=await Promise.all([runtime.dispatchScriptDraft(ctx,input),runtime.dispatchScriptDraft(ctx,input)]);
  expect(a.taskId).toBe(b.taskId);if(prior)expect(a.taskId).toBe(prior.id);
  await vi.waitFor(async()=>{const current=await runtime.ai.getTask(ctx,a.taskId);expect(current.status,JSON.stringify(current)).toBe("awaiting_confirmation");},{timeout:15000});
  const tasks=await runtime.ai.listTasks(ctx,{taskType:"script.draft",limit:100,offset:0});expect(tasks.rows).toHaveLength(1);
  const {artifacts,artifactVersions,eq}=await import("@creatoros/backend"),db=fixture.db!;
  const rows=await db.select().from(artifacts).where(eq(artifacts.projectId,project.id));expect(rows.filter(row=>row.artifactType==="output_script")).toHaveLength(legacy?0:1);
  const artifact=rows.find(row=>row.artifactType===(legacy?"master_script":"output_script"))!;
  expect((await db.select().from(artifactVersions).where(eq(artifactVersions.id,artifact.currentVersionId!)))[0]!.contentText).toBe("");
  const results=await call("ai.tasks.results.list",{taskId:a.taskId});expect(results).toHaveLength(1);expect(results[0].resultData).toMatchObject({body:source,draftMode:"verbatim",canAdopt:true});
  await runtime.ai.confirmTask(ctx,a.taskId);
  const current=await db.select().from(artifacts).where(eq(artifacts.id,artifact.id));
  expect((await db.select().from(artifactVersions).where(eq(artifactVersions.id,current[0]!.currentVersionId!)))[0]!.contentText).toBe(source);
  expect((await runtime.dispatchScriptDraft(ctx,input)).taskId).toBe(a.taskId);expect(requests).toBe(0);
 }finally{await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});}
},30000);
