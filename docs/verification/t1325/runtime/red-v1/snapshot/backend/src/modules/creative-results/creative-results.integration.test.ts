import {describe, expect, it} from "vitest";
import {createDb, projects, contentOutputs, type Db} from "@creatoros/backend";
import {accountGroups} from "../../schema/account-groups";
import {ENDPOINTS} from "@creatoros/contract";
import {createCreativeResultsTransport} from "./creative-results.transport";
import type {RequestContext} from "@creatoros/contract";
import {createCreativeResultsService, type CreativeResultAdapter} from "./creative-results.service";

const context = (accountId: string): RequestContext => ({userId: "u-1029", accountId, requestId: "r-1029", source: "user"});
const output = {id: "out-1029", projectId: "project-1029", contentType: "image", targetPlatform: "xiaohongshu"};

async function seedOwnedParents(db:Db){
 const now='2026-10-01T00:00:00.000Z';
 await db.insert(projects).values({id:output.projectId,userId:'u-1029',accountId:'a',groupId:null,title:'原测试真实父',creationMode:'script',status:'active',currentStage:'planning',startedAt:now,createdAt:now,updatedAt:now});
 await db.insert(contentOutputs).values([{id:output.id,projectId:output.projectId,contentType:'image',title:'原图文',status:'draft',targetPlatform:'xiaohongshu',createdAt:now,updatedAt:now},{id:'article-1029',projectId:output.projectId,contentType:'article',title:'原文章',status:'draft',targetPlatform:'wechatOfficialAccount',createdAt:now,updatedAt:now}]);
}

describe("T-1029 result ownership and partial delivery", () => {
  it("persists an article image candidate's selected section across result and bundle reads", async () => {
    const opened = await createDb();await seedOwnedParents(opened.db);
    let sequence = 0;
    const articleOutput = {id: "article-1029", projectId: "project-1029", contentType: "article", targetPlatform: "wechatOfficialAccount"};
    const seen: string[] = [];
    const adapter: CreativeResultAdapter = {
      owner: "wechat_article",
      async probe() { return {state: "supported", reasonCode: null, lastVerifiedAt: "2026-10-01T00:00:00.000Z"}; },
      async enqueue(_ctx, input) {
        seen.push(input.targetSectionId ?? "missing");
        return {candidateId: `candidate-${seen.length}`, taskId: `task-${seen.length}`, baseVersionId: "v1",
          ruleSnapshotRef: null, appliedRules: "not_applied", sourceRefs: [], status: "queued"};
      },
      async read() { return {status: "queued", value: null, errorCode: null}; },
      async adopt() { return {versionId: "v2"}; },
    };
    const service = createCreativeResultsService(opened.db, {
      projects: {async getOutput() { return articleOutput as never; }, async getProject() { return {id: articleOutput.projectId} as never; }},
      adapters: {wechat_article: adapter}, now: () => "2026-10-01T00:00:00.000Z", nextId: () => `result-${++sequence}`,
    });
    try {
      const result = await service.generate(context("a"), {outputId: articleOutput.id, kind: "image_card",
        targetSectionId: "section-one", clientRequestId: "section-request-one"});
      expect(result.targetSectionId).toBe("section-one");
      expect((await service.list(context("a"), {outputId: articleOutput.id})).items[0]?.targetSectionId).toBe("section-one");
      const bundle = await service.createBundle(context("a"), {outputId: articleOutput.id,
        items: [{kind: "image_card", targetSectionId: "section-two"}], clientRequestId: "section-bundle-one"});
      expect(bundle.items[0]?.targetSectionId).toBe("section-two");
      expect(seen).toEqual(["section-one", "section-two"]);
      await expect(service.generate(context("a"), {outputId: articleOutput.id, kind: "image_card",
        targetSectionId: "section-other", clientRequestId: "section-request-one"})).rejects.toThrow();
    } finally { await opened.client.close(); }
  });

  it("keeps a successful item when another bundle item fails, and denies cross-account reads", async () => {
    const opened = await createDb();await seedOwnedParents(opened.db);
    let sequence = 0;
    const adapter: CreativeResultAdapter = {
      owner: "graphic_post",
      async probe() { return {state: "supported", reasonCode: null, lastVerifiedAt: "2026-10-01T00:00:00.000Z"}; },
      async enqueue(_ctx, input) {
        if (input.kind === "tags") throw Object.assign(new Error("model failed"), {code: "MODEL_UNAVAILABLE"});
        return {candidateId: `candidate-${input.kind}`, taskId: `task-${input.kind}`, baseVersionId: "v1",
          ruleSnapshotRef: "rule-v1", appliedRules: "applied" as const, sourceRefs: [], status: "succeeded" as const};
      },
      async read() { return {status: "succeeded", value: "标题候选", errorCode: null}; },
      async adopt() { return {versionId: "v2"}; },
    };
    const service = createCreativeResultsService(opened.db, {
      projects: {
        async getOutput(ctx) { if (ctx.accountId !== "a") throw Object.assign(new Error("missing"), {code: "OwnershipError"}); return output as never; },
        async getProject(ctx) { if (ctx.accountId !== "a") throw Object.assign(new Error("missing"), {code: "OwnershipError"}); return {id: output.projectId} as never; },
      },
      adapters: {graphic_post: adapter},
      now: () => "2026-10-01T00:00:00.000Z",
      nextId: () => `result-${++sequence}`,
    });
    try {
      const bundle = await service.createBundle(context("a"), {outputId: output.id,
        items: [{kind: "title"}, {kind: "tags"}], clientRequestId: "bundle-one"});
      expect(bundle.status).toBe("partial_completed");
      expect(bundle.items.map((item) => item.status)).toEqual(["succeeded", "failed"]);
      const listed = await service.list(context("a"), {outputId: output.id});
      expect(listed.items).toHaveLength(2);
      expect(listed.items.find((item) => item.kind === "title")?.value).toBe("标题候选");
      await expect(service.getBundle(context("b"), bundle.bundleId)).rejects.toThrow();
      await expect(service.list(context("b"), {outputId: output.id})).rejects.toThrow();
    } finally { await opened.client.close(); }
  });
});


describe("重试保留数据库读回的冻结来源", () => {
  it("字段顺序不影响重试，真实来源变化和跨账号仍拒绝，重复请求不新增任务", async () => {
    const opened = await createDb();await seedOwnedParents(opened.db);
    let sequence = 0, retries = 0, changeSource = false;
    const refs = [{kind: "project", id: "project-1029", versionId: "project-v1"}];
    const frozen = {baseVersionId: "v1", ruleSnapshotRef: "rule-v1", appliedRules: "applied" as const, sourceRefs: refs};
    const adapter: CreativeResultAdapter = {
      owner: "graphic_post",
      async probe() { return {state: "supported", reasonCode: null, lastVerifiedAt: null}; },
      async enqueue() { return {...frozen, candidateId: "old", taskId: "old-task", status: "failed"}; },
      async read(_ctx, id) { return {status: id === "old" ? "failed" : "queued", value: null, errorCode: null}; },
      async retryFrozen() { retries++; return {...frozen, candidateId: `new-${retries}`, taskId: `new-task-${retries}`,
        sourceRefs: [{versionId: changeSource ? "changed" : "project-v1", id: "project-1029", kind: "project"}], status: "queued"}; },
      async adopt() { return {versionId: "v2"}; },
    };
    const service = createCreativeResultsService(opened.db, {projects: {
      async getOutput() { return output as never; }, async getProject() { return {id: output.projectId} as never; }},
      adapters: {graphic_post: adapter}, nextId: () => `retry-result-${++sequence}`});
    try {
      const old = await service.generate(context("a"), {outputId: output.id, kind: "tags", clientRequestId: "first-failed-request"});
      const retried = await service.retry(context("a"), old.resultId, "retry-same-snapshot");
      expect(retried).toMatchObject({retryOf: old.resultId, status: "queued", sourceRefs: refs, baseVersionId: "v1", ruleSnapshotRef: "rule-v1"});
      expect((await service.retry(context("a"), old.resultId, "retry-same-snapshot")).resultId).toBe(retried.resultId);
      expect(retries).toBe(1);
      changeSource = true;
      await expect(service.retry(context("a"), old.resultId, "retry-changed-source")).rejects.toThrow("重试任务未保留原始资料和规则快照");
      await expect(service.retry(context("b"), old.resultId, "retry-other-account")).rejects.toThrow();
    } finally { await opened.client.close(); }
  });
});

it("转换提交丢回执仍保留原预约，并携带完整冻结意图恢复同一任务",async()=>{
 const opened=await createDb();await seedOwnedParents(opened.db);let calls=0;
 const conversion={request:{sourceOutputId:"article-source",sourceVersionId:"source-v",targetType:"image" as const,mode:"whole" as const,clientRequestId:"conversion-request-original",reuseImages:[]},
  sourceAnchor:{kind:"output_version" as const,sourceOutputId:"article-source",artifactId:"source-artifact",versionId:"source-v",sourceType:"article" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}}};
 const adapter:CreativeResultAdapter={owner:"graphic_post",probe:async()=>({state:"supported",reasonCode:null,lastVerifiedAt:null}),
  enqueue:async(_ctx,input)=>{expect(input.conversion).toEqual(conversion);calls++;if(calls===1)throw Error("提交已发生但回复丢失");return {candidateId:"original-candidate",taskId:"original-task",baseVersionId:"v1",ruleSnapshotRef:null,appliedRules:"not_applied",sourceRefs:[conversion.sourceAnchor],status:"queued"};},
  read:async()=>({status:"queued",value:null,errorCode:null}),adopt:async()=>({versionId:"v2"})};
 const service=createCreativeResultsService(opened.db,{projects:{getOutput:async()=>output as never,getProject:async()=>({id:output.projectId}) as never},adapters:{graphic_post:adapter},nextId:()=>"conversion-reserved-result"});
 const input={outputId:output.id,kind:"body" as const,clientRequestId:"conversion-field-body",conversion};
 try{
  await expect(service.generate(context("a"),input)).rejects.toThrow();
  expect(await service.get(context("a"),"conversion-reserved-result")).toMatchObject({status:"queued",taskId:null,errorCode:"GENERATION_SUBMISSION_UNKNOWN"});
  expect(await service.generate(context("a"),input)).toMatchObject({resultId:"conversion-reserved-result",taskId:"original-task",status:"queued",errorCode:null});
  expect(calls).toBe(2);
  await expect(service.generate(context("a"),{...input,conversion:{...conversion,request:{...conversion.request,reuseImages:[{assetId:"changed",assetFileId:"file"}]}}})).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
 }finally{await opened.client.close();}
},20000);

it("转换所有字段先落原账本预约，随后生成恢复其原 result ID",async()=>{
 const opened=await createDb();await seedOwnedParents(opened.db);let seq=0,calls=0;
 const conversion={request:{sourceOutputId:"article-source",sourceVersionId:"v",targetType:"image" as const,mode:"whole" as const,clientRequestId:"conversion-all-fields-request",reuseImages:[]},sourceAnchor:{kind:"output_version" as const,sourceOutputId:"article-source",artifactId:"article-artifact",versionId:"v",sourceType:"article" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}}};
 const {creativeResultBundles}=await import("@creatoros/backend");
 const adapter:CreativeResultAdapter={owner:"graphic_post",probe:async()=>({state:"supported",reasonCode:null,lastVerifiedAt:null}),enqueue:async(_c,input)=>{calls++;expect((await service.list(context("a"),{outputId:output.id})).items).toHaveLength(3);return {candidateId:`candidate-${input.kind}`,taskId:`task-${input.kind}`,baseVersionId:"base",ruleSnapshotRef:null,appliedRules:"not_applied",sourceRefs:[conversion.sourceAnchor],status:"queued"};},read:async()=>({status:"queued",value:null,errorCode:null}),adopt:async()=>({versionId:"saved"})};
 const service=createCreativeResultsService(opened.db,{projects:{getOutput:async()=>output as never,getProject:async()=>({id:output.projectId}) as never},adapters:{graphic_post:adapter},nextId:()=>`reserved-${++seq}`});
 try{
  await opened.db.insert(creativeResultBundles).values({id:"conversion-bundle",userId:"u-1029",accountId:"a",projectId:output.projectId,outputId:output.id,items:[],requestDigest:"durable-intent",clientRequestId:conversion.request.clientRequestId,conversionContext:conversion,targetCreationKey:"actual-target-creation",createdAt:"2026-10-02T00:00:00Z"});
  const plans=await service.reserveConversionFields(context("a"),"conversion-bundle");
  expect(plans.map(p=>p.kind)).toEqual(["title","body","cardBriefs"]);expect(calls).toBe(0);
  expect(await service.reserveConversionFields(context("a"),"conversion-bundle")).toEqual(plans);
  const result=await service.generate(context("a"),{outputId:output.id,kind:"body",targetPlatform:output.targetPlatform as "xiaohongshu",clientRequestId:plans[1]!.clientRequestId,conversion});
  expect(result.resultId).toBe(plans[1]!.resultId);expect(calls).toBe(1);
 }finally{await opened.client.close();}
},20000);

it("转换回执按持久字段映射读取真实生成与独立采用，不凭作品内容猜采用",async()=>{
 const opened=await createDb();await seedOwnedParents(opened.db);let seq=0;
 const conversion={request:{sourceOutputId:"article-source",sourceVersionId:"v",targetType:"image" as const,mode:"whole" as const,clientRequestId:"receipt-original-request",reuseImages:[]},sourceAnchor:{kind:"output_version" as const,sourceOutputId:"article-source",artifactId:"article-artifact",versionId:"v",sourceType:"article" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}}};
 const {creativeResultBundles}=await import("@creatoros/backend");
 const adapter:CreativeResultAdapter={owner:"graphic_post",probe:async()=>({state:"supported",reasonCode:null,lastVerifiedAt:null}),enqueue:async(_c,input)=>({candidateId:`candidate-${input.kind}`,taskId:`task-${input.kind}`,baseVersionId:"base",ruleSnapshotRef:null,appliedRules:"not_applied",sourceRefs:[conversion.sourceAnchor],status:"succeeded"}),read:async()=>({status:"succeeded",value:"标题",errorCode:null}),adopt:async()=>({versionId:"actual-adopted-version"})};
 const service=createCreativeResultsService(opened.db,{projects:{getOutput:async()=>output as never,getProject:async()=>({id:output.projectId}) as never},adapters:{graphic_post:adapter},nextId:()=>`receipt-${++seq}`});
 try{
  await opened.db.insert(creativeResultBundles).values({id:"receipt-bundle",userId:"u-1029",accountId:"a",projectId:output.projectId,outputId:output.id,items:[],requestDigest:"intent",clientRequestId:conversion.request.clientRequestId,conversionContext:conversion,targetCreationKey:"creation-receipt",createdAt:"2026-10-02T00:00:00Z"});
  const plans=await service.reserveConversionFields(context("a"),"receipt-bundle");
  expect((await service.getConversionReceipt(context("a"),"receipt-bundle")).items.every(i=>i.taskId===null&&i.adoption.status==="not_adopted")).toBe(true);
  await service.generate(context("a"),{outputId:output.id,kind:"title",targetPlatform:"xiaohongshu",clientRequestId:plans[0]!.clientRequestId,conversion});
  await service.adopt(context("a"),{resultId:plans[0]!.resultId,expected:{owner:"graphic_post",versionId:"base"},editedValue:"人工标题",clientRequestId:"actual-field-adoption"});
  const receipt=await service.getConversionReceipt(context("a"),"receipt-bundle");
  expect(receipt.items[0]).toMatchObject({targetField:"title",taskId:"task-title",adoption:{status:"adopted",versionId:"actual-adopted-version",clientRequestId:"actual-field-adoption"}});
  expect(receipt.items.slice(1).every(i=>i.adoption.status==="not_adopted")).toBe(true);
 }finally{await opened.client.close();}
},20000);

it("转换 owner 的已知输入拒绝不能标成提交未知",async()=>{
 const opened=await createDb();await seedOwnedParents(opened.db);
 const conversion={request:{sourceOutputId:"source",sourceVersionId:"v",targetType:"image" as const,mode:"whole" as const,clientRequestId:"bad-input-conversion",reuseImages:[]},sourceAnchor:{kind:"output_version" as const,sourceOutputId:"source",artifactId:"artifact",versionId:"v",sourceType:"article" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}}};
 const adapter:CreativeResultAdapter={owner:"graphic_post",probe:async()=>({state:"supported",reasonCode:null,lastVerifiedAt:null}),enqueue:async()=>{throw Object.assign(Error("原冻结来源失效"),{code:"SOURCE_SELECTION_INVALID"});},read:async()=>({status:"queued",value:null,errorCode:null}),adopt:async()=>({versionId:"v"})};
 const service=createCreativeResultsService(opened.db,{projects:{getOutput:async()=>output as never,getProject:async()=>({id:output.projectId}) as never},adapters:{graphic_post:adapter},nextId:()=>"bad-input-result"});
 try{await expect(service.generate(context("a"),{outputId:output.id,kind:"title",clientRequestId:"bad-input-field",conversion})).rejects.toMatchObject({code:"SOURCE_SELECTION_INVALID"});expect(await service.get(context("a"),"bad-input-result")).toMatchObject({status:"failed",taskId:null,errorCode:"SOURCE_SELECTION_INVALID"});}
 finally{await opened.client.close();}
},20000);

it.each(["success","error"])("迟到的转换提交%s不覆盖先完成的真实采用回执",async(late)=>{
 const opened=await createDb();await seedOwnedParents(opened.db);let calls=0;
 let resolveFirst!:()=>void,resolveSecond!:()=>void,entered!:()=>void;
 const firstGate=new Promise<void>(resolve=>{resolveFirst=resolve;}),secondGate=new Promise<void>(resolve=>{resolveSecond=resolve;}),bothEntered=new Promise<void>(resolve=>{entered=resolve;});
 const conversion={request:{sourceOutputId:"source",sourceVersionId:"v",targetType:"image" as const,mode:"whole" as const,clientRequestId:"late-submit-conversion",reuseImages:[]},sourceAnchor:{kind:"output_version" as const,sourceOutputId:"source",artifactId:"source-artifact",versionId:"v",sourceType:"article" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}}};
 const adapter:CreativeResultAdapter={owner:"graphic_post",probe:async()=>({state:"supported",reasonCode:null,lastVerifiedAt:null}),enqueue:async()=>{const index=++calls;if(index===1)await firstGate;else{entered();await secondGate;if(late==="error")throw Error("迟到网络回复失败");}return {candidateId:"original-candidate",taskId:"original-task",baseVersionId:"base",ruleSnapshotRef:null,appliedRules:"not_applied",sourceRefs:[conversion.sourceAnchor],status:"succeeded"};},read:async()=>({status:"succeeded",value:"标题",errorCode:null}),adopt:async()=>({versionId:"adopted-version"})};
 const service=createCreativeResultsService(opened.db,{projects:{getOutput:async()=>output as never,getProject:async()=>({id:output.projectId}) as never},adapters:{graphic_post:adapter},nextId:()=>"late-result"});
 const input={outputId:output.id,kind:"title" as const,clientRequestId:"late-field-request",conversion};
 try{
  const first=service.generate(context("a"),input),second=service.generate(context("a"),input);
  const secondObserved=second.then(value=>({value,error:null}),error=>({value:null,error}));
  await bothEntered;resolveFirst();const one=await first;
  await service.adopt(context("a"),{resultId:one.resultId,expected:{owner:"graphic_post",versionId:"base"},editedValue:"人工标题",clientRequestId:"late-adoption-request"});
  resolveSecond();const observed=await secondObserved;
  expect(observed.error).toBeNull();expect(observed.value).toMatchObject({status:"adopted",taskId:"original-task",errorCode:null});
  expect(await service.get(context("a"),one.resultId)).toMatchObject({status:"adopted",taskId:"original-task",errorCode:null});
 }finally{resolveFirst();resolveSecond();await opened.client.close();}
},20000);
it("重试先预约套装结果，原 owner 已运行而回复丢失时恢复原请求；读取不执行",async()=>{
 const opened=await createDb();await seedOwnedParents(opened.db);let sequence=0,resumeCalls=0,status:"failed"|"running"="failed";
 const frozen={baseVersionId:"base",ruleSnapshotRef:null,sourceRefs:[],appliedRules:"not_applied" as const};
 const adapter:CreativeResultAdapter={owner:"graphic_post",probe:async()=>({state:"supported",reasonCode:null,lastVerifiedAt:null}),enqueue:async()=>({...frozen,candidateId:"original-candidate",taskId:"original-task",status:"failed"}),
  read:async()=>({status,value:null,errorCode:status==="failed"?"MODEL_FAILED":null}),adopt:async()=>({versionId:"unused"}),
  retryFrozen:async(_c,input)=>{expect(input).toEqual({candidateId:"original-candidate",clientRequestId:"pending-retry-request"});resumeCalls++;status="running";if(resumeCalls===1)throw Error("原任务恢复但回复丢失");return {...frozen,candidateId:"original-candidate",taskId:"original-task",status};}};
 const service=createCreativeResultsService(opened.db,{projects:{getOutput:async()=>output as never,getProject:async()=>({id:output.projectId}) as never},adapters:{graphic_post:adapter},nextId:()=>`pending-result-${++sequence}`});
 try{
  const bundle=await service.createBundle(context("a"),{outputId:output.id,items:[{kind:"title"}],clientRequestId:"pending-retry-bundle"});const old=bundle.items[0]!.resultId;
  await expect(service.retry(context("a"),old,"pending-retry-request")).rejects.toThrow("回复丢失");
  const afterLost=await service.getBundle(context("a"),bundle.bundleId);expect(afterLost.items[0]!.resultId).not.toBe(old);
  const pending=await service.get(context("a"),afterLost.items[0]!.resultId);expect(pending).toMatchObject({retryOf:old,taskId:null,typedCandidateRef:null,status:"queued"});expect(resumeCalls).toBe(1);
  const recovered=await service.retry(context("a"),old,"pending-retry-request");expect(recovered).toMatchObject({resultId:pending.resultId,taskId:"original-task",status:"running",retryOf:old});
  expect((await service.getBundle(context("a"),bundle.bundleId)).items[0]!.resultId).toBe(recovered.resultId);
  expect((await service.retry(context("a"),old,"pending-retry-request")).resultId).toBe(recovered.resultId);expect(resumeCalls).toBe(2);
  await expect(service.retry(context("a"),old,"another-pending-retry")).rejects.toThrow();
 }finally{await opened.client.close();}
},20000);

it("纯空组通过正式创作能力 transport，账号筛选不充当 owner，其他组拒绝",async()=>{
 const opened=await createDb();await seedOwnedParents(opened.db);const at="2026-10-05T00:00:00.000Z";
 try{await opened.db.insert(accountGroups).values({id:"creative-empty-group",userId:"u-1029",name:"真实空组",status:"active",version:1,createdAt:at,updatedAt:at});
 const unused=async():Promise<never>=>{throw new Error("本请求未选择父项");};const service=createCreativeResultsService(opened.db,{projects:{getOutput:unused,getProject:unused},adapters:{},now:()=>at});const transport=createCreativeResultsTransport(()=>service),ctx:RequestContext={userId:"u-1029",groupId:"creative-empty-group",accountId:null,source:"user",requestId:"empty-group-capabilities"};
 const request=async(c:RequestContext,query:unknown)=>ENDPOINTS.listCreativeCapabilities.response.parse((await transport.request(ENDPOINTS.listCreativeCapabilities,{params:undefined,body:undefined,query:ENDPOINTS.listCreativeCapabilities.query.parse(query)},c) as {data:unknown}).data);
 expect((await request(ctx,{})).items.length).toBeGreaterThan(0);expect((await request({...ctx,accountId:"platform-filter"},{accountId:"platform-filter"})).items).toEqual((await request(ctx,{})).items);
 await expect(request({...ctx,groupId:"foreign-group"},{})).rejects.toThrow();
 }finally{await opened.client.close();}
});
