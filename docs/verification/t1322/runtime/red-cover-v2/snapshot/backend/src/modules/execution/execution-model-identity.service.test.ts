import { beforeAll, afterAll, it, expect } from "vitest";
import { createDb, executionTasks, eq, type Db } from "@creatoros/backend";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionModelIdentityService } from "./execution-model-identity.service";
let db: Db,
  close: () => Promise<void>,
  seq = 0;
const now = () => "2026-09-06T10:00:00.000Z";
const ctx = {
  userId: "identity-u",
  accountId: "identity-a",
  requestId: "test",
  source: "user" as const,
};
const spec = {
  apiFormat: "openai_chat" as const,
  baseUrl: "https://fixture.invalid/v1",
  model: "original",
  token: "private-fixture-token",
};
beforeAll(async () => {
  const f = await createDb();
  db = f.db;
  close = () => f.client.close();
});
afterAll(async () => close());
async function fixture() {
  const tasks = createPersistentTaskService(db, { now }),
    id = `identity-${++seq}`;
  const modelInput = {
    kind: "model.generate",
    operationKey: id,
    prompt: "真实输入",
    capability: "script",
    maxOutputTokens: 128,
  };
  const task = await tasks.enqueue(ctx, {
    kind: "ai_task",
    ownerType: "ai_task",
    ownerId: id,
    idempotencyKey: id,
    payload: { modelInput, unrelated: { keep: true } },
  });
  const claim = (await tasks.claimTask({
    taskId: task.id,
    workerId: "worker",
  }))!;
  const ref = {
    executionTaskId: task.id,
    attempt: claim.lease.attempt,
    fenceToken: claim.lease.fenceToken,
  };
  return {
    tasks,
    task,
    ref,
    modelInput,
    id,
    identity: createExecutionModelIdentityService(db, { now }),
  };
}
it("身份固定不改变原请求幂等，调用者不能预设宿主模型身份", async () => {
  const f = await fixture();
  await f.identity.pin(f.ref, "script", spec);
  const request = {
    kind: "ai_task" as const,
    ownerType: "ai_task" as const,
    ownerId: f.id,
    idempotencyKey: f.id,
    payload: { modelInput: f.modelInput, unrelated: { keep: true } },
  };
  expect((await f.tasks.enqueue(ctx, request)).id).toBe(f.task.id);
  await expect(
    f.tasks.enqueue(ctx, {
      ...request,
      idempotencyKey: f.id + "-forged",
      payload: { ...request.payload, modelIdentity: { model: "forged" } },
    }),
  ).rejects.toThrow();
});
it("端点内的用户信息与查询凭据不落库，完整端点变化仍被拒绝", async () => {
  const f = await fixture(),
    privateSpec = {
      ...spec,
      baseUrl:
        "https://user:private-password@fixture.invalid/v1?key=private-query-token",
    };
  await f.identity.pin(f.ref, "script", privateSpec);
  const [row] = await db
    .select()
    .from(executionTasks)
    .where(eq(executionTasks.id, f.task.id));
  expect(JSON.stringify(row?.payload)).not.toContain("private-password");
  expect(JSON.stringify(row?.payload)).not.toContain("private-query-token");
  await expect(
    f.identity.pin(f.ref, "script", {
      ...privateSpec,
      baseUrl: privateSpec.baseUrl + "2",
    }),
  ).rejects.toThrow();
});
it("首次绑定保存无密钥模型身份，密钥轮换保持原身份和原输入", async () => {
  const f = await fixture();
  await f.identity.pin(f.ref, "script", spec);
  await f.identity.pin(f.ref, "script", {
    ...spec,
    token: "rotated-fixture-token",
  });
  expect(await f.identity.read(f.ref)).toMatchObject({
    capability: "script",
    model: "original",
    apiFormat: "openai_chat",
    customEndpoint: true,
    baseUrlDigest: expect.stringMatching(/^sha256:/),
  });
  const [row] = await db
    .select()
    .from(executionTasks)
    .where(eq(executionTasks.id, f.task.id));
  expect(row?.payload).toMatchObject({
    modelInput: f.modelInput,
    unrelated: { keep: true },
  });
  expect(JSON.stringify(row?.payload)).not.toContain("fixture-token");
});
it.each([
  { model: "changed" },
  { baseUrl: "https://other.invalid/v1" },
  { apiFormat: "anthropic" },
  { structuredOutputs: true },
  { authStyle: "x-api-key" },
])("配置变化不能覆盖原模型身份：%j", async (change) => {
  const f = await fixture();
  await f.identity.pin(f.ref, "script", spec);
  await expect(
    f.identity.pin(f.ref, "script", { ...spec, ...change }),
  ).rejects.toThrow();
  expect(((await f.identity.read(f.ref)) as {model:string}).model).toBe("original");
});
it("首次解析仍需匹配任务能力，未绑定不能凭当前配置读取", async () => {
  const f = await fixture();
  await expect(f.identity.read(f.ref)).rejects.toThrow();
  await expect(f.identity.pin(f.ref, "other", spec)).rejects.toThrow();
});
it("未设置的可选字段在持久化前后身份相同", async () => {
  const f = await fixture();
  await f.identity.pin(f.ref, "script", {
    ...spec,
    structuredOutputs: undefined,
    authStyle: undefined,
  });
  await expect(
    f.identity.pin(f.ref, "script", {
      ...spec,
      structuredOutputs: undefined,
      authStyle: undefined,
    }),
  ).resolves.toMatchObject({ model: "original" });
});
it("并发首次绑定只能选定一份身份", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([
    f.identity.pin(f.ref, "script", spec),
    f.identity.pin(f.ref, "script", { ...spec, model: "other" }),
  ]);
  expect(results.filter((value) => value.status === "fulfilled")).toHaveLength(
    1,
  );
  expect(results.filter((value) => value.status === "rejected")).toHaveLength(
    1,
  );
});
it("取消或换租约后不能返回旧执行的凭据身份", async () => {
  const f = await fixture();
  await f.identity.pin(f.ref, "script", spec);
  await f.tasks.command(ctx, {
    taskIds: [f.task.id],
    command: "pause",
    idempotencyKey: "pause",
  });
  await expect(f.identity.pin(f.ref, "script", spec)).rejects.toThrow();
  await f.tasks.acknowledgeControl({
    taskId: f.task.id,
    workerId: "worker",
    attempt: f.ref.attempt,
  });
  await f.tasks.command(ctx, {
    taskIds: [f.task.id],
    command: "resume",
    idempotencyKey: "resume",
  });
  const claim = (await f.tasks.claimTask({
    taskId: f.task.id,
    workerId: "worker",
  }))!;
  const fresh = {
    ...f.ref,
    attempt: claim.lease.attempt,
    fenceToken: claim.lease.fenceToken,
  };
  await expect(f.identity.read(f.ref)).rejects.toThrow();
  await createExecutionModelIdentityService(db, { now }).pin(fresh, "script", {
    ...spec,
    token: "rotated",
  });
  expect(((await f.identity.read(fresh)) as {model:string}).model).toBe("original");
});

// T1301：三个消费者分别用全新隔离任务验证，不恢复旧UNKNOWN或调用真实模型。
import {createHash} from 'node:crypto';
import {executionRouteV2Schema,modelRouteCatalog,structuredGenerationInputSchema} from '@creatoros/contract/execution-worker';
import {identityFromFrozenChatRoute,frozenNonChatModelBindingForCall} from './execution-model-identity.service';
import {createExecutionCallLedgerService} from './execution-call-ledger.service';
import {createExecutionCodexCallService} from './execution-codex-call.service';
function classifyRoute(source:'self'|'codex'){
 const route=executionRouteV2Schema.parse({schemaVersion:2,orchestrator:{engine:'codex',source:'preference',protocolKind:'codex-app-server',runtimeVersion:'0.159.3'},selectionRevision:3,catalogVersion:1,rootRouteDigest:'sha256:'+'a'.repeat(64),routes:Object.fromEntries(modelRouteCatalog.map(({family,...entry})=>[entry.routeKey,{...entry,source:['video','audio','embed'].includes(family)?'official':'codex',readiness:'unavailable',reasonCode:'TEST_UNCONFIGURED'}]))});
 const vision={routeKey:'vision:asset.classify',mode:'vision' as const,capability:'asset.classify',readiness:'configured' as const,...(source==='codex'?{source:'codex' as const,identity:{protocolKind:'codex-app-server' as const,runtimeVersion:'0.159.3' as const,requestedModel:'vision-only'}}:{source:'self' as const,identity:{provider:'openai',apiFormat:'openai_chat',authStyle:'bearer' as const,model:'vision-only',endpoint:'https://vision.invalid/v1',settings:{},configuration:{kind:'row' as const,id:'vision-row',capability:'asset.classify'},configIdentityDigest:'sha256:'+'b'.repeat(64)}})};
 route.routes[vision.routeKey]=vision;
 route.routes['text:copilot.assist']={routeKey:'text:copilot.assist',mode:'text',capability:'copilot.assist',source:'codex',readiness:'configured',identity:{protocolKind:'codex-app-server',runtimeVersion:'0.159.3',requestedModel:'different-text'}};
 return executionRouteV2Schema.parse(route);
}
async function classifyFixture(source:'self'|'codex',seedIdentity=false){
 const route=classifyRoute(source),vision=route.routes['vision:asset.classify']!,id=`classify-mode-${++seq}`;
 const modelInput=structuredGenerationInputSchema.parse({kind:'model.structured',operationKey:'asset.classify',capability:'asset.classify',skillId:'asset.classify',maxOutputTokens:1024,skillSnapshot:{snapshotVersion:1,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:now(),platformPolicyVersion:'1',platformPolicy:'受控分类',skills:[{skillId:'asset.classify',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'分类原图',template:'',tools:[],requiredFacets:[],contextRequirements:[],outputSchema:{type:'object',properties:{tags:{type:'array',items:{type:'string'}},description:{type:'string'}}},completionPolicy:null,completionPolicyAdapter:null}}]},facets:{__assetProcessing:JSON.stringify({taskType:'asset.classify',assetId:'owned-asset',fileId:'owned-file',checksum:'c'.repeat(64),fileName:'neutral.png',mimeType:'image/png',skipModel:false})}});
 const expected=identityFromFrozenChatRoute('asset.classify',vision),credential=source==='codex'?{engine:'codex' as const,protocolKind:'codex-app-server' as const,runtimeVersion:'0.159.3' as const,requestedModel:'vision-only'}:{apiFormat:'openai_chat' as const,authStyle:'bearer' as const,baseUrl:'https://vision.invalid/v1',model:'vision-only',token:'controlled-private'};
 const tasks=createPersistentTaskService(db,{now}),task=await tasks.enqueue(ctx,{kind:'ai_task',ownerType:'ai_task',ownerId:id,idempotencyKey:id,payload:{aiTaskId:id,modelInput,executionRoute:route}}),claim=(await tasks.claimTask({taskId:task.id,workerId:'classify-consumer-worker'}))!;
 if(seedIdentity)await db.update(executionTasks).set({payload:{aiTaskId:id,modelInput,executionRoute:route,modelIdentity:expected}}).where(eq(executionTasks.id,task.id));
 const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},identity=createExecutionModelIdentityService(db,{now});
 return {task,tasks,ref,identity,expected,credential,route,modelInput};
}
it.each(['self','codex'] as const)('T1301 %s 分类pin消费原vision键，不寻找不存在structured键',async source=>{
 const f=await classifyFixture(source);await expect(f.identity.pin(f.ref,'asset.classify',f.credential)).resolves.toEqual(f.credential);
});
it.each(['self','codex'] as const)('T1301 %s 已有合法identity的read消费原vision键',async source=>{
 const f=await classifyFixture(source,true);await expect(f.identity.read(f.ref)).resolves.toEqual(f.expected);
});
it.each(['self','codex'] as const)('T1301 %s 真实原call的非聊天binding为vision',async source=>{
 const f=await classifyFixture(source,true),ledger=createExecutionCallLedgerService(db,{now,budget:{maxCalls:8,maxTokens:100000,deadlineMs:180000}});
 const call=await ledger.reserve(f.ref,{kind:'model',operationKey:'asset.classify/model/1',inputDigest:'sha256:'+createHash('sha256').update('original request').digest('hex'),reservedTokens:2048});await ledger.start(f.ref,call.id);
 const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.task.id));
 expect(frozenNonChatModelBindingForCall(task!,call)).toMatchObject({mode:'vision',capability:'asset.classify',route:f.route.routes['vision:asset.classify']});
 expect(frozenNonChatModelBindingForCall({...task!,groupId:'foreign'},call)).toBeNull();expect(frozenNonChatModelBindingForCall(task!,{...call,operationKey:'foreign/model/1'})).toBeNull();expect(frozenNonChatModelBindingForCall(task!,{...call,executionTaskId:'foreign'})).toBeNull();
});
it('T1301 Codex原call服务接受分类vision冻结权，非null假通过',async()=>{
 const f=await classifyFixture('codex',true),ledger=createExecutionCallLedgerService(db,{now,budget:{maxCalls:8,maxTokens:100000,deadlineMs:180000}}),call=await ledger.reserve(f.ref,{kind:'model',operationKey:'asset.classify/model/1',inputDigest:'sha256:'+'c'.repeat(64),reservedTokens:2048});await ledger.start(f.ref,call.id);
 await expect(createExecutionCodexCallService(db,{now}).invoke(f.ref,'bindCodexCall',{callId:call.id,threadId:'controlled-thread',turnId:'controlled-turn'})).resolves.toMatchObject({threadId:'controlled-thread',turnId:'controlled-turn'});
});
async function changeClassifyPayload(f:Awaited<ReturnType<typeof classifyFixture>>,edit:(payload:Record<string,any>)=>void){
 const [row]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.task.id));const payload=structuredClone(row!.payload) as Record<string,any>;edit(payload);await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,f.task.id));return payload;
}
it.each(['missing-facet','malformed-facet','taskType','skillId','capability','missing-route','identity'] as const)('T1301 v2分类%s拒绝，不回退text或当前配置',async variant=>{
 const f=await classifyFixture('codex',true);
 await changeClassifyPayload(f,p=>{
  if(variant==='missing-facet')p.modelInput.facets={};
  if(variant==='malformed-facet')p.modelInput.facets.__assetProcessing='{';
  if(variant==='taskType'){const target=JSON.parse(p.modelInput.facets.__assetProcessing);target.taskType='material.extract';p.modelInput.facets.__assetProcessing=JSON.stringify(target);}
  if(variant==='skillId'){p.modelInput.skillId='material.extract';p.modelInput.skillSnapshot.skills[0].skillId='material.extract';}
  if(variant==='capability')p.modelInput.capability='script.draft';
  if(variant==='missing-route')delete p.executionRoute.routes['vision:asset.classify'];
  if(variant==='identity')p.modelIdentity.requestedModel='different-text';
 });
 await expect(f.identity.read(f.ref)).rejects.toThrow();
 await expect(f.identity.pin(f.ref,'asset.classify',f.credential)).rejects.toThrow();
 const [row]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.task.id));
 expect(frozenNonChatModelBindingForCall(row!,{executionTaskId:f.task.id,kind:'model',parentCallId:null,operationKey:'asset.classify/model/1',inputDigest:'sha256:'+'1'.repeat(64)})).toBeNull();
});
it.each(['missing','v1'] as const)('T1301 %s旧route无新facet仍按原身份兼容，不授权新v2 call',async version=>{
 const f=await classifyFixture('codex');
 await changeClassifyPayload(f,p=>{p.modelInput.facets={};if(version==='missing')delete p.executionRoute;else p.executionRoute={schemaVersion:1,engine:'codex',source:'legacy',protocolKind:'codex-app-server',runtimeVersion:'0.159.3'};});
 await expect(f.identity.pin(f.ref,'asset.classify',f.credential)).resolves.toEqual(f.credential);expect(await f.identity.read(f.ref)).toEqual(f.expected);
});
it('T1301 原request摘要唯一性与取消/旧fence仍由实际call/lease服务拒绝',async()=>{
 const f=await classifyFixture('codex'),ledger=createExecutionCallLedgerService(db,{now,budget:{maxCalls:8,maxTokens:100000,deadlineMs:180000}});
 await f.identity.pin(f.ref,'asset.classify',f.credential);
 const original={kind:'model' as const,operationKey:'asset.classify/model/1',inputDigest:'sha256:'+'1'.repeat(64),reservedTokens:2048};await ledger.reserve(f.ref,original);
 await expect(ledger.reserve(f.ref,{...original,inputDigest:'sha256:'+'2'.repeat(64)})).rejects.toThrow();
 await expect(f.identity.read({...f.ref,fenceToken:'foreign'})).rejects.toThrow();
 await f.tasks.command(ctx,{taskIds:[f.task.id],command:'cancel',idempotencyKey:'t1301-cancel'});await expect(f.identity.pin(f.ref,'asset.classify',f.credential)).rejects.toThrow();
});

it.each(['self','codex'] as const)('T1301 %s 凭据必须等于原vision身份，不能借text身份首次pin',async source=>{
 const f=await classifyFixture(source);await expect(f.identity.pin(f.ref,'asset.classify',source==='codex'?{...f.credential,requestedModel:'different-text'}:{...f.credential,model:'different-text'})).rejects.toThrow('MODEL_ROUTE_IDENTITY_CHANGED');
 const [row]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.task.id));expect(row!.payload).not.toHaveProperty('modelIdentity');
});
it.each(['topic.generate','calibration.diagnose','positioning.generate','review.insights','knowledge.distill','copilot.assist'])('T1301 %s chat原vision pin/read不受structured分类选择影响',async capability=>{
 const f=await classifyFixture('codex');await changeClassifyPayload(f,p=>{p.modelInput={kind:'chat.run',operationKey:'chat-original',userId:ctx.userId,accountId:ctx.accountId,conversationId:'chat-conv',sourceMessageId:'chat-msg',capability,executionEngine:'codex',system:'原系统',messages:[{role:'user',content:'原消息'}],tools:[],maxSteps:2,maxOutputTokens:128};p.chatModelMode='vision';const key=`vision:${capability}`;p.executionRoute.routes[key]={...p.executionRoute.routes['vision:asset.classify'],routeKey:key,capability};});
 await expect(f.identity.pin(f.ref,capability,f.credential)).resolves.toEqual(f.credential);expect(await f.identity.read(f.ref)).toMatchObject({capability,engine:'codex',requestedModel:'vision-only'});
});
