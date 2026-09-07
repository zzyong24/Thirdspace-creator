import type {ChatHostContext} from "../ai/chat-host-context";
import {createServer} from "node:http";
import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {z} from "zod";
import {createDb,type Db} from "@creatoros/backend";
import {createAiService} from "../ai/ai.service";
import {createChatTurnSubmissionService} from "../ai/chat-turn-submission.service";
import {createPersistentTaskService} from "./persistent-task.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {createExecutionAgenticToolPorts} from "./execution-agentic-tool-ports.service";
import {createExecutionModelIdentityService} from "./execution-model-identity.service";
import {createExecutionChatGenerationService} from "./execution-chat-generation.service";
import {replayStructuredGeneration} from "@creatoros/ai-worker/chat";
import {getTemplate,runWithEffectiveSkillSnapshot,modelFor,runStructuredNode,registerOfficialCompletionPolicyAdapter} from "@creatoros/ai-worker";
import {createDurableGenerationModel} from "@creatoros/ai-worker/durable-generation";
let db:Db,close:()=>void,seq=0;
const now=()=>"2026-09-06T10:00:00.000Z",budget={maxCalls:20,maxTokens:200000,deadlineMs:600000};
beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();});afterAll(()=>close());
async function fixture(repair=false,name:"topic.enrich"|"positioning.generate"|"calibration.diagnose"="topic.enrich") {
  const ctx = {
    userId: "structured-u",
    accountId: `structured-a-${++seq}`,
    requestId: "test",
    source: "user" as const,
  };
  const unexpectedWrite = async (): Promise<never> => {
    throw new Error("测试不允许候选采纳写入");
  };
  const ai = createAiService({
    db,
    now,
    nextId: (prefix) => `${prefix}-${++seq}`,
    artifacts: { createVersion: unexpectedWrite },
    knowledge: { createKnowledge: unexpectedWrite },
    candidate: {
      createFromAIResult: unexpectedWrite,
      enrichCard: unexpectedWrite,
    },
    learnings: { createLearning: unexpectedWrite },
    publishing: { createPublicationFromDraft: unexpectedWrite },
    materialLinks: { link: unexpectedWrite },
    positioning: {
      upsertProfile: unexpectedWrite,
      createStatementVersion: unexpectedWrite,
    },
    calibration: { createDraftPrediction: unexpectedWrite },
  });
  const conversation = await ai.createConversation(ctx, {
    title: "开场",
    projectId: null,
    scope: "global",
  });
  const source = await ai.createMessage(ctx, conversation.id, {
    content: "生成开场",
    attachments: [],
  });
  const hostContext:ChatHostContext = {
    schemaVersion: 1 as const,
    chatContext: { surface: "topics" },
    mediaRoute: null,
    positioningScratch: false,
    trustedScriptSources: [],
    scriptHooksGeneration: { version: 1 as const, maxOutputTokens: 2048 },
    scriptHooksContext: {
      selectionTitle: "真实选题",
      positioningBrief: "原定位",
      projectBriefHard: "",
      userMaterialHardBrief: "",
      userMaterialRefBrief: "",
      knowledgeBrief: "",
    },
    skillSnapshot: {
      snapshotVersion: 1 as const,
      userId: ctx.userId,
      accountId: ctx.accountId,
      resolvedAt: "fixed",
      platformPolicyVersion: "1",
      platformPolicy: "候选",
      skills: [
        {
          skillId: "chatbox.topic",
          baseVersion: "1",
          overlayRevision: null,
          overlayVersion: null,
          effective: {
            methodSystem: "策略",
            template: "",
            tools: [name],
            requiredFacets: [],
            contextRequirements: [],
            outputSchema: null,
            completionPolicy: null,
            completionPolicyAdapter: null,
          },
        },
      ],
    },
  };
  hostContext.skillSnapshot.skills.push({...structuredClone(hostContext.skillSnapshot.skills[0]!),skillId:name,effective:{...hostContext.skillSnapshot.skills[0]!.effective,template:"{{title}}",requiredFacets:["title"],outputSchema:{type:"object",properties:{oneLiner:{type:"string"}},required:["oneLiner"],additionalProperties:false}}});
  if(name==="calibration.diagnose") hostContext.skillSnapshot.skills.at(-1)!.effective.outputSchema={type:"object",properties:{dimensions:{type:"array",items:{type:"object",properties:{key:{type:"string"},score:{type:"number"}},required:["key","score"],additionalProperties:false}}},required:["dimensions"],additionalProperties:false};
  if(repair){
   registerOfficialCompletionPolicyAdapter({id:"test.chat-generation-repair",version:"1",supportsSchema:()=>true,toSegments:value=>(value as {oneLiner:string}).oneLiner.split("|").map(()=>({role:"body"}))});
   const skill=hostContext.skillSnapshot.skills.at(-1)!;
   skill.effective.completionPolicy={schemaVersion:1,minSegments:2,maxSegments:null,requiredSequence:[],repairAttempts:1};
   skill.effective.completionPolicyAdapter={id:"test.chat-generation-repair",version:"1"};
  }
  hostContext.skillSnapshot.skills.sort((a,b)=>a.skillId.localeCompare(b.skillId));
  const prepareGeneration=vi.fn(async()=>({node:name==="topic.enrich"?{capability:name,facets:{title:"原题目"},candidateId:"candidate-original"}:{capability:name,facets:{title:"原定位"}},discovery:name==="positioning.generate"?{sessionId:"session",candidateId:"poscand:session:7:direct",candidateRevision:7}:null,maxOutputTokens:2048}));
  const check=vi.fn(async()=>({status:"not-applicable" as const}));
  const tools={[name]:{version:"structured-v1",effect:"proposal" as const,execution:"worker.structured-node" as const,parameters:z.object({topic:z.string().optional()}).strict(),approve:check,prepareGeneration}};
  const task = await createChatTurnSubmissionService(db, {
    now,
    assemble: async () => ({
      system: "策略",
      messages: [{ role: "user", content: "生成开场" }],
      capability: "copilot.assist",
      maxSteps: 6,
      maxOutputTokens: 128,
      tools: [
        {
          name,
          version: "structured-v1",
          description: "开场",
          parameters: { type: "object" },
          effect: "proposal",
          execution:"worker.structured-node",
        },
      ],
      hostContext,
    }),
  }).submit(ctx, {
    conversationId: conversation.id,
    sourceMessageId: source.id,
  });
  const tasks = createPersistentTaskService(db, { now }),
    claim = (await tasks.claimTask({
      taskId: task.executionTaskId,
      workerId: "worker",
    }))!;
  const ref = {
    executionTaskId: task.executionTaskId,
    attempt: claim.lease.attempt,
    fenceToken: claim.lease.fenceToken,
  };
  await createExecutionModelIdentityService(db, { now }).pin(
    ref,
    "copilot.assist",
    {
      apiFormat: "openai_chat",
      baseUrl: null,
      model: "fixture",
      token: "fixture",
    },
  );
  const ledger = createExecutionCallLedgerService(db, { now, budget }),
    ports = createExecutionAgenticToolPorts(db, { now, budget, tools });
  const model = await ledger.reserve(ref, {
    operationKey: "root",
    kind: "model",
    inputDigest: "sha256:" + "a".repeat(64),
    reservedTokens: 20,
  });
  await ledger.start(ref, model.id);
  await ledger.settle(ref, model.id, {
    status: "settled",
    usage: {},
    providerResult: {
      content: [
        {
          type: "tool-call",
          toolCallId: "hooks",
          toolName: name.replaceAll(".","_"),
          input: '{"topic":" "}',
        },
      ],
      finishReason: { unified: "tool-calls" },
      usage: { inputTokens: { total: 2 }, outputTokens: { total: 3 } },
      warnings: [],
    },
  });
  const parent = await ports.reserve(ref, {
    modelCallId: model.id,
    toolCallId: "hooks",
  });
  await ports.start(ref, { callId: parent.callId });
  const resolveCredential=vi.fn(async()=>({apiFormat:"openai_chat" as const,baseUrl:null as string|null,model:"fixture",token:"fixture-secret"}));
  const make=()=>createExecutionChatGenerationService(db,{now,budget,tools,check,resolveCredential});
  const service=make();
  return {ctx,ref,parent,ledger,service,check,tasks,task,prepareGeneration,resolveCredential,make};
}
async function next(f:Awaited<ReturnType<typeof fixture>>,receipts:Parameters<typeof replayStructuredGeneration>[0]["receipts"]=[]) {
 await f.service.resolveCredential(f.ref,{callId:f.parent.callId});
 const prepared=await f.service.prepare(f.ref,{callId:f.parent.callId});
 const result=await runWithEffectiveSkillSnapshot(prepared.skillSnapshot,()=>replayStructuredGeneration({modelId:"fixture",provider:"openai.chat",receipts},{template:getTemplate(prepared.node.capability),facets:prepared.node.facets,maxOutputTokens:prepared.maxOutputTokens}));
 if(result.status!=="next-request")throw new Error("expected next request");
 return {callId:f.parent.callId,operationKey:`${prepared.operationKey}/model/${result.consumed+1}`,request:result.request};
}
const success={status:"settled" as const,usage:{},providerResult:{content:[{type:"text",text:'{"oneLiner":"原模型候选"}'}],finishReason:{unified:"stop"},usage:{inputTokens:{total:4},outputTokens:{total:3}},warnings:[]}};
it("共享结构化账本按真实回执完成候选，重建服务不重复准备或预留",async()=>{
 const f=await fixture(),request=await next(f),child=await f.service.reserve(f.ref,request);
 await f.service.start(f.ref,{callId:child.callId});await f.service.settle(f.ref,{callId:child.callId,...success});
 const restored=f.make(),out=await restored.complete(f.ref,{callId:f.parent.callId});
 expect(out.data).toMatchObject({kind:"topic.card",candidateId:"candidate-original",card:{oneLiner:"原模型候选"}});
 expect(await restored.complete(f.ref,{callId:f.parent.callId})).toEqual(out);
 expect(f.prepareGeneration).toHaveBeenCalledTimes(1);expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(3);
});
it.each([{modelId:"forged"},{temperature:2},{prompt:[]}])("拒绝被改写的实际模型请求 %j",async change=>{
 const f=await fixture(),request=await next(f);
 await expect(f.service.reserve(f.ref,{...request,request:{...request.request,...change}})).rejects.toThrow();
 expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(2);
});
it("协议拒绝后只允许原节点推导的下一请求，拒绝跳号",async()=>{
 const f=await fixture(),request=await next(f),child=await f.service.reserve(f.ref,request);
 await f.service.start(f.ref,{callId:child.callId});await f.service.settle(f.ref,{callId:child.callId,status:"rejected",rejectionCode:"STRUCTURED_PROTOCOL_UNSUPPORTED"});
 const row=(await f.ledger.inspect(f.ref)).calls.find(c=>c.id===child.callId)!;
 const second=await next(f,[{inputDigest:row.inputDigest,status:"rejected",rejectionCode:row.rejectionCode}]);
 await expect(f.service.reserve(f.ref,{...second,operationKey:second.operationKey.replace("/model/2","/model/3")})).rejects.toThrow();
 const fallback=await f.service.reserve(f.ref,second);await f.service.start(f.ref,{callId:fallback.callId});await f.service.settle(f.ref,{callId:fallback.callId,...success});
 expect((await f.service.complete(f.ref,{callId:f.parent.callId})).status).toBe("ok");
});
it.each(["unknown","rejected"] as const)("%s 回执不能变成候选或推进新逻辑调用",async status=>{
 const f=await fixture(),request=await next(f),child=await f.service.reserve(f.ref,request);
 await f.service.start(f.ref,{callId:child.callId});await f.service.settle(f.ref,{callId:child.callId,status});
 await expect(f.service.complete(f.ref,{callId:f.parent.callId})).rejects.toThrow();
 await expect(f.service.reserve(f.ref,{...request,operationKey:request.operationKey.replace("/model/1","/model/2")})).rejects.toThrow();
});
it("坏结构回执和 Worker 自报候选均不能伪造成完成",async()=>{
 const f=await fixture(),request=await next(f),child=await f.service.reserve(f.ref,request);
 await f.service.start(f.ref,{callId:child.callId});await f.service.settle(f.ref,{callId:child.callId,...success,providerResult:{...success.providerResult,content:[{type:"text",text:"不是有效对象"}]}});
 await expect(f.service.complete(f.ref,{callId:f.parent.callId,object:{oneLiner:"伪造"}})).rejects.toThrow();
 await expect(f.service.complete(f.ref,{callId:f.parent.callId})).rejects.toThrow();
 const row=(await f.ledger.inspect(f.ref)).calls.find(call=>call.id===child.callId)!;
 const second=await next(f,[{inputDigest:row.inputDigest,status:"settled",providerResult:row.providerResult}]);
 const fallback=await f.service.reserve(f.ref,second);await f.service.start(f.ref,{callId:fallback.callId});
 await f.service.settle(f.ref,{callId:fallback.callId,...success,providerResult:{...success.providerResult,content:[{type:"text",text:"仍然不是有效对象"}]}});
 expect(await f.service.complete(f.ref,{callId:f.parent.callId})).toMatchObject({status:"error",sideEffect:"none",error:{code:"no_evidence"}});
 expect((await f.ledger.inspect(f.ref)).calls.find(call=>call.id===f.parent.callId)).toMatchObject({status:"settled"});
});
it("准备后取消不能启动子模型，跨任务父调用不能取凭据",async()=>{
 const f=await fixture(),other=await fixture(),request=await next(f),child=await f.service.reserve(f.ref,request);
 await expect(f.service.resolveCredential(f.ref,{callId:other.parent.callId})).rejects.toThrow();
 await f.tasks.command(f.ctx,{taskIds:[f.task.executionTaskId],command:"cancel",idempotencyKey:"cancel"});
 await expect(f.service.start(f.ref,{callId:child.callId})).rejects.toThrow();
});
it("真实 SDK 请求经共享端口结算，重建节点零额外 HTTP 调用",async()=>{
 const bodies:unknown[]=[],server=createServer(async(req,res)=>{
  let body="";for await(const chunk of req)body+=chunk.toString();bodies.push(JSON.parse(body));
  res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"fixture",object:"chat.completion",created:1,model:"fixture",choices:[{index:0,message:{role:"assistant",content:'{"oneLiner":"HTTP 原候选"}'},finish_reason:"stop"}],usage:{prompt_tokens:4,completion_tokens:3,total_tokens:7}}));
 });
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
  const f=await fixture();f.resolveCredential.mockResolvedValue({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture-secret"});
  const run=async()=>{
   const service=f.make(),spec=await service.resolveCredential(f.ref,{callId:f.parent.callId}),prepared=await service.prepare(f.ref,{callId:f.parent.callId});
   const model=createDurableGenerationModel({model:modelFor(spec),operationKey:prepared.operationKey,ports:{reserve:input=>service.reserve(f.ref,JSON.parse(JSON.stringify({...input,callId:f.parent.callId}))),start:async callId=>{await service.start(f.ref,{callId});},settle:async(callId,input)=>{await service.settle(f.ref,{callId,...input});}}});
   await runWithEffectiveSkillSnapshot(prepared.skillSnapshot,()=>runStructuredNode({model,template:getTemplate(prepared.node.capability),facets:prepared.node.facets,maxOutputTokens:prepared.maxOutputTokens}));
   return service.complete(f.ref,{callId:f.parent.callId});
  };
  expect((await run()).data).toMatchObject({card:{oneLiner:"HTTP 原候选"}});await run();
  expect(bodies).toHaveLength(1);expect(f.prepareGeneration).toHaveBeenCalledTimes(1);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
it("并发预留同请求只产生一个子调用，鉴权恢复后沿原逻辑序号重试",async()=>{
 const f=await fixture(),request=await next(f);
 const [a,b]=await Promise.all([f.service.reserve(f.ref,request),f.service.reserve(f.ref,request)]);expect(a.callId).toBe(b.callId);
 await f.service.start(f.ref,{callId:a.callId});await f.service.settle(f.ref,{callId:a.callId,status:"rejected"});
 const failure={callId:f.parent.callId,outcome:"waiting_user",errorCode:"auth_401"};
 expect(await f.service.fail(f.ref,failure)).toEqual(await f.service.fail(f.ref,failure));
 await f.tasks.command(f.ctx,{taskIds:[f.task.executionTaskId],command:"resume",idempotencyKey:"configured"});
 const claim=(await f.tasks.claimTask({taskId:f.task.executionTaskId,workerId:"worker"}))!;
 f.ref={...f.ref,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 await f.service.restore(f.ref,{callId:f.parent.callId});
 expect(await f.service.prepare(f.ref,{callId:f.parent.callId})).toMatchObject({retryOfCallId:a.callId,retryOperationKey:request.operationKey});
 const retry=await f.service.reserve(f.ref,{...request,retryOfCallId:a.callId});expect(retry.callId).not.toBe(a.callId);
 await f.service.start(f.ref,{callId:retry.callId});await f.service.settle(f.ref,{callId:retry.callId,...success});
 expect((await f.service.complete(f.ref,{callId:f.parent.callId})).status).toBe("ok");expect(f.prepareGeneration).toHaveBeenCalledTimes(1);
});
it("成功前缀后的修复拒绝已挂起，丢 ACK 的 unknown 不污染父工具且能恢复",async()=>{
 const f=await fixture(true),first=await next(f),child=await f.service.reserve(f.ref,first);
 await f.service.start(f.ref,{callId:child.callId});await f.service.settle(f.ref,{callId:child.callId,...success});
 const row=(await f.ledger.inspect(f.ref)).calls.find(call=>call.id===child.callId)!;
 const second=await next(f,[{inputDigest:row.inputDigest,status:"settled",providerResult:row.providerResult}]);
 const repair=await f.service.reserve(f.ref,second);await f.service.start(f.ref,{callId:repair.callId});await f.service.settle(f.ref,{callId:repair.callId,status:"rejected"});
 await f.service.fail(f.ref,{callId:f.parent.callId,outcome:"waiting_user",errorCode:"auth_401"});
 await expect(f.ledger.settle(f.ref,f.parent.callId,{status:"unknown"})).rejects.toThrow("已挂起");
 await f.tasks.command(f.ctx,{taskIds:[f.task.executionTaskId],command:"resume",idempotencyKey:"repair-configured"});
 const claim=(await f.tasks.claimTask({taskId:f.task.executionTaskId,workerId:"worker"}))!;
 f.ref={...f.ref,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};await f.service.restore(f.ref,{callId:f.parent.callId});
 const retried=await f.service.reserve(f.ref,{...second,retryOfCallId:repair.callId});
 await f.service.start(f.ref,{callId:retried.callId});await f.service.settle(f.ref,{callId:retried.callId,...success,providerResult:{...success.providerResult,content:[{type:"text",text:'{"oneLiner":"第一段|第二段"}'}]}});
 expect((await f.service.complete(f.ref,{callId:f.parent.callId})).data).toMatchObject({card:{oneLiner:"第一段|第二段"}});
 expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(5);expect(f.prepareGeneration).toHaveBeenCalledTimes(1);
});

it("定位节点按专属能力重建原 normalizer 结果并保留前采候选身份",async()=>{
 const f=await fixture(false,"positioning.generate"),request=await next(f),child=await f.service.reserve(f.ref,request);
 await f.service.start(f.ref,{callId:child.callId});await f.service.settle(f.ref,{callId:child.callId,...success});
 expect((await f.service.complete(f.ref,{callId:f.parent.callId})).data).toMatchObject({kind:"positioning.suggestion",suggestion:{oneLiner:"原模型候选",keywords:["","",""]},discovery:{sessionId:"session",candidateId:"poscand:session:7:direct",candidateRevision:7}});
 expect(f.resolveCredential).toHaveBeenCalledWith({...f.ctx,source:"ai",requestId:`execution:${f.ref.executionTaskId}:${f.ref.attempt}`},"positioning.generate",f.ref,undefined);
});

it.each([true,false])("聊天诊断从原模型回执恢复，有效评分=%s",async valid=>{
 const f=await fixture(false,"calibration.diagnose"),request=await next(f),child=await f.service.reserve(f.ref,request);
 await f.service.start(f.ref,{callId:child.callId});
 await f.service.settle(f.ref,{callId:child.callId,...success,providerResult:{...success.providerResult,content:[{type:"text",text:JSON.stringify({dimensions:[{key:valid?"hook":"forged",score:4}]})}]}});
 const restored=f.make(),out=await restored.complete(f.ref,{callId:f.parent.callId});
 if(valid) expect(out).toMatchObject({status:"ok",sideEffect:"proposal",data:{kind:"calibration.diagnosis",diagnosis:{dimensions:[{key:"hook",score:4}],verdict:"",mainIssues:[],priorityFixes:[]}}});
 else expect(out).toMatchObject({status:"error",sideEffect:"none",error:{code:"no_evidence"}});
 expect(await restored.complete(f.ref,{callId:f.parent.callId})).toEqual(out);
 expect(f.prepareGeneration).toHaveBeenCalledTimes(1);
 expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(3);
});
