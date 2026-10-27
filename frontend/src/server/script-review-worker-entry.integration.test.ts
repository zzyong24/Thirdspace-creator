import {configureModelFixture} from "@/test/configure-model-fixture";
import {createServer} from "node:http";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {describe,it,expect,vi} from "vitest";
import {ENDPOINTS,type RequestContext} from "@creatoros/contract";
const fixture=vi.hoisted(()=>({url:""}));
import {compositeTransport,__resetPersistenceForTests} from "./persistence-client";
describe("生产文稿审核 Worker 入口",()=>{
  it.each([{entry:"ai.tasks.create",retry:false,semantic:"neutral"},{entry:"scriptReviews.trigger",retry:false,semantic:"keyboard"},{entry:"ai.tasks.create",retry:true,semantic:"contact"}])("$entry retry=$retry semantic=$semantic 经真实子进程保存版本报告，无采纳候选",async ({entry,retry,semantic})=>{
    const directory=mkdtempSync(resolve(tmpdir(),"t915-review-entry-"));vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR",resolve(directory,"db"));
    __resetPersistenceForTests();execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});
    let ctx:RequestContext={userId:"review-entry-test",accountId:null,requestId:`review-entry-${semantic}`,source:"user"};
    const call=async(id:string,params:unknown,body?:unknown,query?:unknown):Promise<unknown>=>{
      const endpoint=Object.values(ENDPOINTS).find(value=>value.id===id);
      if(!endpoint)throw new Error(`unknown operation: ${id}`);
      return (await compositeTransport.request(endpoint,{params,query,body} as never,ctx) as {data:unknown}).data;
    };
    let requests=0;let requestBody="";
    const script=semantic==="keyboard" ? "按QQ键释放技能，再移动角色。" : semantic==="contact" ? "加我QQ领取资料，再联系报名。" : "这是实际待审的原文，供创作者了解技术实践。";
    // Fixture 只模拟语义模型输出，公共入口、冻结上下文、Worker 和报告落库均为实际链路。
    const generated=semantic==="keyboard" ? {verdict:"pass",summary:"按键操作无站外联络意图",findings:[]} : semantic==="contact" ? {verdict:"block",summary:"明确引导站外联系",findings:[{quote:"加我QQ领取资料",category:"导流",severity:"block",reason:"要求站外联系领取资料",suggestion:null,ruleRef:"公约34"}]} : {verdict:"risk",summary:"需要复核原文表述",findings:[]};
    const server=createServer((req,res)=>{req.on("data",chunk=>{requestBody+=chunk.toString();});req.on("end",()=>{requests++;if(retry && requests===1){res.writeHead(503,{"content-type":"application/json"});res.end(JSON.stringify({error:{message:"temporary unavailable",type:"server_error"}}));return;}// Pi provider 的 doGenerate 也读取流，fixture 必须模拟实际 SSE 协议。
    res.writeHead(200,{"content-type":"text/event-stream"});res.end(`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:1,model:"review-fixture",choices:[{index:0,delta:{role:"assistant",content:JSON.stringify(generated)},finish_reason:null}]})}\n\ndata: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:1,model:"review-fixture",choices:[{index:0,delta:{},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}})}\n\ndata: [DONE]\n\n`);});});
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));fixture.url=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
    try{
      const account=ENDPOINTS.createAccount.response.parse(await call("accounts.create",undefined,{platform:"douyin",accountHandle:`隔离审核账号-${semantic}`,idempotencyKey:`review-entry-account-${semantic}`}));
      const groups=ENDPOINTS.listAccountGroups.response.array().parse(await call("accountGroups.list",undefined,undefined,{page:1,pageSize:100}));
      const memberships=groups.flatMap(group=>group.members.filter(member=>member.accountId===account.id&&member.leftAt===null).map(member=>({group,member})));
      expect(memberships).toHaveLength(1);const selected=memberships[0]!;
      ctx={...ctx,accountId:account.id,groupId:selected.group.id,groupVersion:selected.group.version,membershipVersion:selected.member.version};
      await configureModelFixture(call,fixture.url,"review-fixture");
      const project=ENDPOINTS.createProject.response.parse(await call("projects.create",undefined,{title:"隔离审核测试"}));
      expect(ENDPOINTS.getProject.response.parse(await call("projects.get",{projectId:project.id}))).toMatchObject({id:project.id,userId:ctx.userId});
      const rule=semantic!=="neutral" ? ENDPOINTS.createReviewRule.response.parse(await call("reviewRules.create",undefined,{tier:"official_hard",category:"导流",matchType:"word",pattern:"QQ",note:"复核是否引导站外联系",source:"manual",status:"active"})) : null;
      if(rule)expect(rule).toMatchObject({groupId:ctx.groupId,scope:"group"});
      const artifact=ENDPOINTS.createArtifact.response.parse(await call("artifacts.create",{projectId:project.id},{title:"待审原稿",artifactType:"master_script",stage:"script"}));
      const version=ENDPOINTS.createArtifactVersion.response.parse(await call("artifacts.versions.create",{artifactId:artifact.id},{contentText:script}));
      const task=ENDPOINTS.createAITask.response.parse(entry==="scriptReviews.trigger" ? await call(entry,{projectId:project.id}) : await call(entry,undefined,{taskType:"script.review",projectId:project.id,attemptId:"review-worker-entry",inputData:{projectId:project.id,artifactId:artifact.id,artifactVersion:version.versionNumber}}));
      expect(task.groupId).toBe(ctx.groupId);
      await vi.waitFor(async()=>{const read=ENDPOINTS.getTask.response.parse(await call("ai.tasks.get",{taskId:task.id}));expect(read.status,JSON.stringify(read)).toBe("succeeded");},{timeout:15000,interval:100});
      const read=ENDPOINTS.getTask.response.parse(await call("ai.tasks.get",{taskId:task.id}));expect(read.executionTaskId).toBeTruthy();expect(read.runtimeStatus).toBe("succeeded");
      expect(await call("ai.tasks.results.list",{taskId:task.id})).toEqual([]);
      const report=ENDPOINTS.getLatestScriptReview.response.parse(await call("scriptReviews.getLatest",{projectId:project.id}));expect(report).toMatchObject({artifactId:artifact.id,artifactVersion:version.versionNumber,verdict:generated.verdict,summary:generated.summary,modelLabel:"review-fixture"});
      expect(requests).toBe(retry ? 2 : 1);expect(requestBody).toContain(script);
      expect(requestBody).toContain("不是已确认违规");
      if(semantic!=="neutral")expect(report.lintFindings).toEqual(expect.arrayContaining([expect.objectContaining({quote:"QQ",tier:"official_hard"})]));
      if(rule)expect(report.lintFindings.some(finding=>finding.ruleId===rule.id)).toBe(true);
      expect(report.llmFindings).toEqual(generated.findings);
      await call("artifacts.versions.create",{artifactId:artifact.id},{contentText:"用户已经改成另一版。"});
      expect(await call("scriptReviews.getLatest",{projectId:project.id})).toMatchObject({id:report.id,artifactVersion:version.versionNumber});
    }finally{
      await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();
      server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});
    }
  },40000);
});
