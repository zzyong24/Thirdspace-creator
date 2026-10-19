import { createServer } from "node:http";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { beforeAll,afterAll,describe,it,expect,vi } from "vitest";
import { createDb,projects,contentOutputs,platformAccounts,type Db } from "@creatoros/backend";
import { getOfficialSkillBase,type PlatformAdaptOutput } from "@creatoros/ai-worker";
import {createAccountGroupService} from "../platform-account/account-group.service";
import { createAiRepository } from "./ai.repository";
import { createAiService } from "./ai.service";
import { createPublishingService } from "../publishing/publishing.service";
import { createModelWorkerDispatcher } from "../execution/model-worker-dispatcher";
import { createPlatformAdaptExecutionService } from "../ai-runtime/platform-adapt-execution.service";
import { projectPlatformAdaptCandidate } from "../ai-runtime/platform-adapt-context";
import { createPlatformDraftAdoptionPort } from "../ai-runtime/platform-draft-adoption";
const ctx={userId:"platform-worker",accountId:"platform-worker",requestId:"test",source:"user" as const};
const budget={maxCalls:4,maxTokens:100000,deadlineMs:180000};
describe("多平台改写正式Skill到发布草稿",()=>{
  let db:Db;let close:()=>Promise<void>;
  beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();
    const stamp=new Date().toISOString();let seedSequence=0;
    await db.insert(platformAccounts).values({id:ctx.accountId,userId:ctx.userId,platform:"douyin",accountHandle:"原合法发布账号",createdAt:stamp,updatedAt:stamp});
    await createAccountGroupService({db,now:()=>stamp,nextId:prefix=>`${prefix}-original-parent-${++seedSequence}`}).ensureLegacyGroups(ctx);
    const groupId=`grp_legacy_${ctx.accountId}`;
    await db.insert(projects).values({id:"fixture-project",userId:ctx.userId,accountId:ctx.accountId,groupId,title:"原平台改写父项目",creationMode:"free",status:"active",currentStage:"publishing",startedAt:stamp,createdAt:stamp,updatedAt:stamp});
    await db.insert(contentOutputs).values({id:"fixture-output",projectId:"fixture-project",groupId,title:"原平台改写作品",contentType:"video",status:"drafting",createdAt:stamp,updatedAt:stamp});
    execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe",timeout:180000});},180000);
  afterAll(async()=>close?.(),180000);
  it("公共创建→冻结业务上下文→真实Worker→公共采纳→发布服务回读",async()=>{
    let seq=0;const nextId=(prefix:string)=>`${prefix}-${++seq}`;const now=()=>new Date().toISOString();
    const notUsed=vi.fn(async()=>{throw new Error("UNEXPECTED_EXTERNAL_ACTION");});
    const publishing=createPublishingService({db,now,nextId,publisher:{publish:notUsed,remove:notUsed}});
    const base=getOfficialSkillBase("platform.adapt")!;
    const {skillId,baseVersion,methodSystem,template,tools,requiredFacets,contextRequirements,outputSchema,completionPolicy,completionPolicyAdapter}=base;
    let loseReceipt=true;
    const adoption=createPlatformDraftAdoptionPort(publishing);
    const ai=createAiService({db,now,nextId,artifacts:{createVersion:notUsed},knowledge:{createKnowledge:notUsed},candidate:{createFromAIResult:notUsed,enrichCard:notUsed},learnings:{createLearning:notUsed},publishing:{async createPublicationFromDraft(...args){const result=await adoption.createPublicationFromDraft(...args);if(loseReceipt){loseReceipt=false;throw new Error("ADOPTION_RECEIPT_LOST");}return result;}},materialLinks:{link:notUsed},positioning:{upsertProfile:notUsed,createStatementVersion:notUsed},calibration:{createDraftPrediction:notUsed},
      async resolveTaskRuntimeData(){return {skillSnapshot:{snapshotVersion:1,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:now(),platformPolicyVersion:"test",platformPolicy:"遵守当前用户输入。",skills:[{skillId,baseVersion,overlayRevision:null,overlayVersion:null,effective:{methodSystem,template,tools,requiredFacets,contextRequirements,outputSchema,completionPolicy,completionPolicyAdapter}}]}};},
    });
    const task=await ai.createTask(ctx,{taskType:"publish.platform_adapt",attemptId:"platform-test-attempt-001",inputData:{outputId:"fixture-output",scriptText:"这是一份真实测试正文。",platforms:["douyin"]}});
    const reader=vi.fn(async()=>({profile:null,currentStatement:null}));
    const prepare=createPlatformAdaptExecutionService(db,{budget,maxOutputTokens:2048,positioning:{getPositioningCenter:reader},learnings:{getSuggestions:async()=>[]}});
    const mapped=await prepare.prepare(ctx,task.id);const reads=reader.mock.calls.length;
    expect(await prepare.prepare(ctx,task.id)).toEqual(mapped);expect(reader).toHaveBeenCalledTimes(reads);
    await expect(prepare.prepare({...ctx,accountId:"other"},task.id)).rejects.toThrow();
    let requests=0;const server=createServer((req,res)=>{req.resume();requests++;res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"test",object:"chat.completion",created:1,model:"test",choices:[{index:0,message:{role:"assistant",content:JSON.stringify({drafts:[{platform:"douyin",title:"测试标题",body:"第一段。\n\n第二段。",tags:[" 测试 "],coverIdea:"原稿截图",auditFlags:["保留真实事实"]}]})},finish_reason:"stop"}],usage:{prompt_tokens:3,completion_tokens:5,total_tokens:8}}));});
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
    const host=createModelWorkerDispatcher(db,{entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),workerId:"platform-host",budget,async resolveModelCredential(_ctx,capability){expect(capability).toBe("script.rewrite");return {apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"test",token:"fixture",structuredOutputs:true};},projectCandidate(_ctx,input){return projectPlatformAdaptCandidate(input.inputData as Record<string,unknown>,JSON.parse(input.text) as PlatformAdaptOutput);}});
    try{
      await host.drainOnce();expect(requests).toBe(1);
      await expect(ai.confirmTask(ctx,task.id)).rejects.toThrow("ADOPTION_RECEIPT_LOST");
      const results=await Promise.all([ai.confirmTask(ctx,task.id),ai.confirmTask(ctx,task.id)]);expect(results.every(result=>result.status==="succeeded")).toBe(true);
      expect((await ai.confirmTask(ctx,task.id)).status).toBe("succeeded");
      const publications=await publishing.listPublications(ctx,"fixture-output",{limit:20,offset:0});
      expect(publications).toHaveLength(1);
      const read=await publishing.getPublication(ctx,publications[0]!.id);expect(read.platform).toBe("douyin");
      const revisions=await publishing.listRevisions(ctx,read.id,{limit:20,offset:0});expect(revisions).toHaveLength(1);expect(revisions[0]).toMatchObject({title:"测试标题",description:"第一段。 第二段。",platformTags:["测试"]});
      expect(notUsed).not.toHaveBeenCalled();
      const queued=await ai.createTask(ctx,{taskType:"publish.platform_adapt",attemptId:"recover-before-bind",inputData:{outputId:"fixture-output",scriptText:"恢复任务",platforms:["douyin"]}});
      const repo=createAiRepository(db,{now,nextId,userId:ctx.userId,accountId:ctx.accountId});
      const stale=await repo.requireTask(queued.id);
      const onFailure=vi.fn(async()=>{});
      await prepare.recoverQueued(onFailure);
      expect(onFailure).not.toHaveBeenCalled();
      expect((await ai.getTask(ctx,queued.id)).executionTaskId).toBeTruthy();
      // 模拟旧取消/失败在读取未绑定快照后暂停，此间启动恢复已成功绑定。
      for(const status of ["cancelled","failed"] as const){
        expect(await repo.updateUnboundTaskStatus(queued.id,stale.status,{status})).toBeNull();
      }
      await ai.markFailed(ctx,queued.id,"过期的准备错误");
      expect((await ai.getTask(ctx,queued.id)).status).toBe("queued");
      expect((await ai.cancelTask(ctx,queued.id)).runtimeStatus).toBe("cancelled");
      expect((await ai.listTasks(ctx,{limit:20,offset:0} )).rows.find(item=>item.id===queued.id)?.status).toBe("cancelled");
    }finally{await host.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  },180000);
});
