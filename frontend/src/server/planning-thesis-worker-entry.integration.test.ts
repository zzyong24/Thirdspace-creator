import {configureModelFixture} from "@/test/configure-model-fixture";
import {createServer} from "node:http";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {beforeAll,expect,it,vi} from "vitest";
import type {Endpoint} from "@creatoros/contract";
const fixture=vi.hoisted(()=>({url:""}));
import {compositeTransport,__resetPersistenceForTests} from "./persistence-client";
const ctx={userId:"thesis-entry-user",accountId:"thesis-entry-account",requestId:"test",source:"user" as const};
const call=async(id:string,params:unknown,body?:unknown,context=ctx)=>(await compositeTransport.request({id} as Endpoint,{params,query:undefined,body} as never,context) as {data:any}).data;
beforeAll(()=>{execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});},30000);
it.each([false,true])("论点树真实Worker公共生成与采纳，明确429重试=%s",async retry=>{
 const directory=mkdtempSync(resolve(tmpdir(),"t915-thesis-entry-"));vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR",resolve(directory,"db"));__resetPersistenceForTests();
 const requests:string[]=[];
 const generated={core:{title:"先验证真实结果",summary:"先演示再解释。"},branches:[{column:"证据",title:"待核实数据",summary:"脚手架里有 22 个 AI 智能体互相盯着写代码"}]};
 const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));requests.push(Buffer.concat(chunks).toString());if(retry && requests.length===1){res.writeHead(429,{"content-type":"application/json","retry-after":"0"});res.end(JSON.stringify({error:{message:"fixture rate limit",type:"rate_limit_error"}}));return;}res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"fixture",object:"chat.completion",created:1,model:"thesis-fixture",choices:[{index:0,message:{role:"assistant",content:JSON.stringify(generated)},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));});
 await new Promise<void>(done=>server.listen(0,"127.0.0.1",done));fixture.url=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
 try{
  await configureModelFixture(call,fixture.url,"thesis-fixture");
  const coreMessage="本项目真实硬锚：先演示实际操作再解释方法";
  const project=await call("projects.create",undefined,{title:"隔离论点项目",briefDetail:{coreMessage}});
  expect((await call("artifacts.list",{projectId:project.id})).filter((a:any)=>a.artifactType==="thesis_tree")).toEqual([]);
  const task=await call("ai.tasks.create",undefined,{taskType:"planning.thesis",attemptId:"planning-thesis-public-worker",inputData:{projectId:project.id,topic:"本期真实选题"}});
  await vi.waitFor(async()=>{const current=await call("ai.tasks.get",{taskId:task.id});expect(current.status,JSON.stringify(current)).toBe("awaiting_confirmation");},{timeout:20000,interval:100});
  const current=await call("ai.tasks.get",{taskId:task.id});expect(current.executionTaskId).toBeTruthy();expect(current.runtimeStatus).toBe("succeeded");expect(requests).toHaveLength(retry?2:1);expect(requests.at(-1)).toContain(coreMessage);expect(requests.at(-1)).toContain("本期真实选题");
  const results=await call("ai.tasks.results.list",{taskId:task.id});expect(results).toHaveLength(1);expect(results[0]).toMatchObject({resultType:"artifact_version",artifactId:null});
  const nodes=results[0].resultData.contentData.nodes;expect(nodes[0]).toMatchObject({column:"core",title:generated.core.title});expect(nodes[1]).toMatchObject({column:"evidence",summary:expect.stringContaining("22 个 AI 智能体")});expect(nodes[1].summary).toContain("未溯源");expect(results[0].resultData.contentData).not.toHaveProperty("scriptBasis");
  expect((await call("artifacts.list",{projectId:project.id})).filter((a:any)=>a.artifactType==="thesis_tree")).toEqual([]);
  await expect(call("ai.tasks.confirm",{taskId:task.id},undefined,{...ctx,accountId:"other-account"})).rejects.toThrow();
  expect((await call("ai.tasks.get",{taskId:task.id})).status).toBe("awaiting_confirmation");
  const confirmations=await Promise.all([call("ai.tasks.confirm",{taskId:task.id}),call("ai.tasks.confirm",{taskId:task.id})]);expect(confirmations.every(t=>t.status==="succeeded")).toBe(true);
  const artifacts=(await call("artifacts.list",{projectId:project.id})).filter((a:any)=>a.artifactType==="thesis_tree");expect(artifacts).toHaveLength(1);
  const versions=await call("artifacts.versions.list",{artifactId:artifacts[0].id});const adopted=versions.find((v:any)=>v.id===artifacts[0].currentVersionId);expect(adopted.contentData).toEqual({nodes,scriptBasis:{status:"adopted"}});expect(adopted.contentText).toBe(results[0].resultData.body);
  const edit=await call("artifacts.versions.create",{artifactId:artifacts[0].id},{contentText:"用户后续编辑"});
  expect((await call("ai.tasks.confirm",{taskId:task.id})).status).toBe("succeeded");expect((await call("artifacts.get",{artifactId:artifacts[0].id})).currentVersionId).toBe(edit.id);expect(await call("artifacts.versions.list",{artifactId:artifacts[0].id})).toHaveLength(versions.length+1);expect(requests).toHaveLength(retry?2:1);
 }finally{await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});}
},45000);
