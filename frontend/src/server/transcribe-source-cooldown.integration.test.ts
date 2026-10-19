// @vitest-environment node
import {beforeAll,afterAll,afterEach,it,expect,vi} from "vitest";
import {Socket} from "node:net";
import {createHash} from "node:crypto";
import type {Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {asrRequestSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import {localWhisperSpec} from "@creatoros/ai-worker";
import {createDb,OwnershipError,aiTaskSteps,aiTasks,executionTasks,executionCalls,eq,asc,sql} from "@creatoros/backend";
import {createAiService} from "../../../backend/src/modules/ai/ai.service";
import {createPlatformAccountService} from "../../../backend/src/modules/platform-account/platform-account.service";
import {createProjectsService} from "../../../backend/src/modules/projects/projects.service";
import {createProjectRepository} from "../../../backend/src/modules/projects/projects.repository";
import {createPersistentTaskService} from "../../../backend/src/modules/execution/persistent-task.service";
import {createTranscribeBusinessExecutionService} from "../../../backend/src/modules/ai-runtime/transcribe-business-execution.service";
import {createExecutionTranscribeSourceService} from "../../../backend/src/modules/execution/execution-transcribe-source.service";
import {createExecutionTranscribeWorkflowService} from "../../../backend/src/modules/execution/execution-transcribe-workflow.service";
import {createExecutionTranscribeAudioService} from "../../../backend/src/modules/execution/execution-transcribe-audio.service";
import {createExecutionTranscribePreparationService} from "../../../backend/src/modules/execution/execution-transcribe-preparation.service";
import {createExecutionAsrPorts} from "../../../backend/src/modules/execution/execution-asr-ports.service";
import {createExecutionTranscribePostprocessService} from "../../../backend/src/modules/execution/execution-transcribe-postprocess.service";
import {createTranscriptArtifactService} from "../../../backend/src/modules/projects/transcript-artifact.service";
import {createMockObjectStorage} from "../../../backend/src/modules/assets/object-storage";
import {DouyinRequestGateway,DouyinCooldownActiveError} from "./ingestion/douyin-request-gateway";
import {DOUYIN_THROTTLE_DEFAULTS} from "./ingestion/douyin-throttle-config";
import {createPgliteThrottleStatePort} from "./ingestion/douyin-throttle-state-port.pglite";

type Transaction=Parameters<Parameters<Db["transaction"]>[0]>[0];
let opened:Awaited<ReturnType<typeof createDb>>|undefined;
let ai:ReturnType<typeof createAiService>;
let accounts:ReturnType<typeof createPlatformAccountService>;
let projects:ReturnType<typeof createProjectsService>;
let sequence=0,networkAttempts=0;
const preparations:Array<ReturnType<typeof createTranscribeBusinessExecutionService>>=[];
const nextId=(prefix:string)=>`${prefix}-t213-${++sequence}`;
const wallNow=()=>new Date().toISOString();
const failNetwork=()=>{networkAttempts++;throw Error("T213测试禁止真实网络/provider/浏览器连接");};
const rejectUnused=async():Promise<never>=>{throw Error("T213未准入无关业务端口，不伪造成功");};
let fetchSpy:{mockRestore():void}|undefined;
let socketSpy:{mockRestore():void}|undefined;

beforeAll(async()=>{
 // 不初始化persistence-client，不启动dispatcher、sweep、恢复扫描或模型探针。
 // createDb()明确使用内存PGlite；不选createConfiguredDb，不消费DATABASE_URL/数据目录。
 fetchSpy=vi.spyOn(globalThis,"fetch").mockImplementation(async()=>failNetwork());
 socketSpy=vi.spyOn(Socket.prototype,"connect").mockImplementation(()=>failNetwork());
 opened=await createDb();
 const deps={db:opened.db,now:wallNow,nextId};
 accounts=createPlatformAccountService(deps);
 projects=createProjectsService(createProjectRepository(opened.db),{now:wallNow,nextId});
 ai=createAiService({...deps,
  // 未涉及的采纳端口拒绝；实际AiRepository/requireTask与workspace守卫不mock。
  artifacts:{createVersion:rejectUnused},knowledge:{createKnowledge:rejectUnused},
  candidate:{createFromAIResult:rejectUnused,enrichCard:rejectUnused},
  learnings:{createLearning:rejectUnused},publishing:{createPublicationFromDraft:rejectUnused},
  materialLinks:{link:rejectUnused},positioning:{upsertProfile:rejectUnused,createStatementVersion:rejectUnused},
  calibration:{createDraftPrediction:rejectUnused},
 });
 expect(networkAttempts).toBe(0);
}); // 沿本package原20s hookTimeout，不加超时。
afterEach(()=>expect(networkAttempts).toBe(0));
afterAll(async()=>{
 try{
  // 只停止本测试创建的prepare控制器；没有后台dispatcher或未知全局runtime。
  for(const preparation of preparations)preparation.stop();
  await opened?.client.close(); // 自产内存库实际dispose，不用fire-and-forget reset。
 }finally{fetchSpy?.mockRestore();socketSpy?.mockRestore();}
});
const db=()=>{if(!opened)throw Error("真实DB未初始化");return opened.db;};
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
const digest=(bytes:Uint8Array)=>`sha256:${createHash("sha256").update(bytes).digest("hex")}`;

// 仅包装ai_task_steps真实SQL的await后时点；不替代交易/锁/查询或写入结果。
function afterRealStepInsert(original:Db,after:()=>void):Db{
 const wrapBuilder=(builder:object):object=>new Proxy(builder,{get(target,key){
  if(key==="then")return(resolveValue:(value:unknown)=>unknown,rejectValue:(error:unknown)=>unknown)=>
   Promise.resolve(target as PromiseLike<unknown>).then(value=>{after();return value;}).then(resolveValue,rejectValue);
  const value=Reflect.get(target,key);
  if(typeof value!=="function")return value;
  return(...args:unknown[])=>{const result=Reflect.apply(value,target,args);return result&&typeof result==="object"?wrapBuilder(result):result;};
 }});
 const wrapTransaction=(transaction:Transaction):Transaction=>new Proxy(transaction,{get(target,key){
  if(key==="insert")return(table:unknown)=>{
   const builder=Reflect.apply(target.insert,target,[table]);
   return table===aiTaskSteps?wrapBuilder(builder):builder;
  };
  const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;
 }});
 return new Proxy(original,{get(target,key){
  if(key==="transaction")return(work:(transaction:Transaction)=>Promise<unknown>)=>target.transaction(transaction=>work(wrapTransaction(transaction)));
  const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;
 }});
}

async function fixture(ids:string[],missing:string[]=[]){
 let epoch=Date.now();const now=()=>new Date(epoch).toISOString();
 const user:RequestContext={userId:nextId("owner"),accountId:null,requestId:nextId("request"),source:"user"};
 const account=await accounts.createAccount(user,{platform:"douyin",accountHandle:nextId("account"),idempotencyKey:nextId("account-command")});
 const ctx={...user,accountId:account.id};
 const projectIds=new Map<string,string>();
 for(const awemeId of ids.filter(id=>!missing.includes(id))){
  const project=await projects.createProject(ctx,{title:"来源冷却隔离作品",source:"imported",platformRef:{platform:"douyin",externalId:awemeId},creationMode:"talking_head"});
  projectIds.set(awemeId,project.id);
 }
 const business=await ai.createTask(ctx,{taskType:"transcribe.douyin",attemptId:`t213-submission-${++sequence}`,inputData:{awemeIds:ids}});
 const budget={maxCalls:20,maxTokens:100000,deadlineMs:120000};
 const preparation=createTranscribeBusinessExecutionService(db(),{now,budget,resolveSpec:async()=>localWhisperSpec()});
 preparations.push(preparation);
 const mapped=await preparation.prepare(ctx,business.id);if(!mapped.executionTaskId)throw Error("真实prepare未产生执行绑定");
 const tasks=createPersistentTaskService(db(),{now,nextId});
 const claim=await tasks.claimTask({taskId:mapped.executionTaskId,workerId:"t213-isolated-host",leaseSeconds:300});
 if(!claim)throw Error("真实claim失败，不构造lease凭证");
 const ref:ExecutionRef={executionTaskId:mapped.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const artifact=createTranscriptArtifactService({db:db(),now,nextId});
 const post=createExecutionTranscribePostprocessService(db(),{now,budget,resolveModelSpec:async()=>null,readContext:async()=>({title:"合成原作品"})});
 const workflow=createExecutionTranscribeWorkflowService(db(),{now,nextId,postprocess:post,hasTranscriptArtifact:(context,awemeId)=>artifact.hasExisting(context,awemeId)});
 const source=async(onCooldown?:(error:DouyinCooldownActiveError)=>Promise<void>,database:Db=db())=>{
  const port=createPgliteThrottleStatePort(db(),now);
  await port.save("iesdouyin",{cooldownUntil:epoch+960000,consecutiveThrottles:1,lastRequestAt:null});
  const gateway=new DouyinRequestGateway({config:DOUYIN_THROTTLE_DEFAULTS,port,now:()=>epoch,sleep:async()=>{throw Error("本例不允许真实或伪造等待");},jitter:value=>value});
  let observations=0;
  const host=createExecutionTranscribeSourceService(database,{now,
   resolveProfile:async()=>{throw Error("本例不启动浏览器档案");},
   acquireChannel:async(_ctx,channel,signal)=>{
    signal?.throwIfAborted();
    try{await gateway.acquire(channel);}catch(error){
     if(!(error instanceof DouyinCooldownActiveError))throw error;
     observations++;if(onCooldown)await onCooldown(error);throw error;
    }
    signal?.throwIfAborted();
   },
   reportChannel:async()=>{throw Error("本例不提交平台请求结果");},
  });
  return {host,gateway,get observations(){return observations;}};
 };
 const publicSteps=()=>ai.listSteps(ctx,business.id);
 const rows=async()=>({
  execution:(await db().select().from(executionTasks).where(eq(executionTasks.id,ref.executionTaskId)))[0]!,
  business:(await db().select().from(aiTasks).where(eq(aiTasks.id,business.id)))[0]!,
  calls:await db().select().from(executionCalls).where(eq(executionCalls.executionTaskId,ref.executionTaskId)).orderBy(asc(executionCalls.sequence)),
  steps:await db().select().from(aiTaskSteps).where(eq(aiTaskSteps.aiTaskId,business.id)).orderBy(asc(aiTaskSteps.stepNo),asc(aiTaskSteps.id)),
 });
 const saveAlbum=async(currentRef:ExecutionRef,awemeId:string)=>{
  await workflow.recordSource(currentRef,{awemeId,source:{kind:"image-album"}});
  return workflow.saveArtifact(currentRef,{awemeId});
 };
 const saveConfirmedText=async(currentRef:ExecutionRef,awemeId:string)=>{
  // 合成音频/ASR叶子IO；plan/identity/账本/后处理/工件全部真实，不改payload。
  const audioBytes=new Uint8Array([1,2,3,4]),objects=new Map<string,Uint8Array>();
  const base=createMockObjectStorage({nextKey:()=>nextId("audio")});
  const storage={...base,getObject:async(key:string)=>{const value=objects.get(key);if(!value)throw Object.assign(Error("isolated missing"),{code:"ENOENT"});return Uint8Array.from(value);},putObject:async(input:Parameters<typeof base.putObject>[0])=>{objects.set(input.storageKey,Uint8Array.from(input.bytes));await base.putObject(input);}};
  const audio=createExecutionTranscribeAudioService(db(),{now,objectStorageForCtx:async()=>storage});
  const asr=createExecutionAsrPorts(db(),{now,budget});
  const prepare=createExecutionTranscribePreparationService(db(),{now,audio,asr,resolveSpec:async()=>localWhisperSpec(),prepareSpec:async()=>{throw Error("本地fixture不申请云凭据");}});
  await workflow.recordSource(currentRef,{awemeId,source:{kind:"video",playUrl:"https://example.invalid/synthetic.mp4"}});
  await audio.save(currentRef,{awemeId,bytes:audioBytes});
  const prepared=await prepare.prepare(currentRef,awemeId);if(prepared.status!=="prepared")throw Error("预期首次真实ASR plan");
  const {plan}=prepared,chunkDigest=digest(audioBytes);
  const request=asrRequestSchema.parse({...plan.identity,audioDigest:plan.audioDigest,audioByteLength:plan.audioByteLength,chunks:[{digest:chunkDigest,byteLength:audioBytes.byteLength}],chunkDigest,chunkByteLength:audioBytes.byteLength,chunkIndex:0,chunkCount:1});
  const reserved=await asr.reserve(currentRef,{awemeId,request});
  await asr.start(currentRef,{awemeId,callId:reserved.callId});
  await asr.settle(currentRef,{awemeId,callId:reserved.callId,status:"settled",result:{text:"真实Host保存的合成逐字稿",language:"zh"}});
  expect(await post.prepare(currentRef,{awemeId})).toMatchObject({status:"restored",result:{applied:false,transcript:"真实Host保存的合成逐字稿"}});
  return workflow.saveArtifact(currentRef,{awemeId});
 };
 return {ctx,business,ref,tasks,workflow,source,publicSteps,rows,saveAlbum,saveConfirmedText,projectIds,now,advanceTo:(value:number)=>{epoch=value;}};
}
const cooldownInput=(awemeId:string)=>({awemeId,channel:"iesdouyin"as const});

it("真实Gateway冷却经Host持久化，后续图集/summary公开末步骤替代旧冷却且本人scope拒绝跨域",async()=>{
 const f=await fixture(["album"]),source=await f.source();
 expect(await source.host.invoke(f.ref,"acquireTranscribeChannel",cooldownInput("album"))).toEqual({sourceFailure:{outcome:"retry_wait",errorCode:"TRANSCRIBE_SOURCE_COOLDOWN",retryAfterMs:960000}});
 expect(source.observations).toBe(1);
 const first=await f.publicSteps();expect(first).toHaveLength(1);expect(first[0]?.text).toBe("作品 1：当时抖音来源限流冷却。");
 await source.host.invoke(f.ref,"acquireTranscribeChannel",cooldownInput("album"));expect(await f.publicSteps()).toEqual(first);
 expect(await f.saveAlbum(f.ref,"album")).toMatchObject({status:"image-album",projectId:f.projectIds.get("album")});
 expect(await f.workflow.complete(f.ref,{})).toEqual({status:"succeeded"});
 const steps=await f.publicSteps();expect(steps.map(step=>step.stepNo)).toEqual([1,2,3]);
 expect(steps.at(-1)?.text).toBe("转写完成 0 条，已有逐字稿跳过 0 条，图集跳过 1 条，转写失败 0 条，未找到对应作品 0 条");
 const before=await f.rows();expect(before.calls).toHaveLength(0);expect(await f.workflow.complete(f.ref,{})).toEqual({status:"succeeded"});expect(await f.rows()).toEqual(before);
 await expect(ai.listSteps({...f.ctx,userId:"different-owner"},f.business.id)).rejects.toBeInstanceOf(OwnershipError);
 const account=await accounts.createAccount({...f.ctx,accountId:null},{platform:"douyin",accountHandle:nextId("other"),idempotencyKey:nextId("other-command")});
 await expect(ai.listSteps({...f.ctx,accountId:account.id},f.business.id)).rejects.toBeInstanceOf(OwnershipError);
});

it("组合后原公开retry保saved事实/原ASR键/旧summary，新attempt冷却与最新summary按真实追加排序",async()=>{
 const f=await fixture(["keep","repair"]),source=await f.source();
 await source.host.invoke(f.ref,"acquireTranscribeChannel",cooldownInput("repair"));
 expect(await f.saveConfirmedText(f.ref,"keep")).toMatchObject({status:"saved"});
 await f.workflow.recordSource(f.ref,{awemeId:"repair",source:{kind:"image-album"}});
 await f.workflow.failItem(f.ref,{awemeId:"repair",error:"合成已确认作品失败"});
 expect(await f.workflow.complete(f.ref,{})).toEqual({status:"failed"});const old=await f.rows();
 expect(old.calls.map(call=>({key:call.operationKey,status:call.status}))).toEqual([{key:"transcribe:keep/local-asr/1",status:"settled"}]);
 const oldSummary=old.steps.find(step=>step.id===`transcribe:${f.ref.executionTaskId}:summary`)!;expect(oldSummary).toBeDefined();
 const retry={taskIds:[f.ref.executionTaskId],command:"retry"as const,idempotencyKey:nextId("retry")};
 await f.tasks.command(f.ctx,retry);
 const claim=await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"same-task-recovery",leaseSeconds:300});if(!claim)throw Error("原retry未取得真实lease");
 const ref={executionTaskId:f.ref.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};expect(ref.attempt).toBe(f.ref.attempt+1);
 await expect(source.host.invoke(f.ref,"acquireTranscribeChannel",cooldownInput("repair"))).rejects.toThrow();
 await source.host.invoke(ref,"acquireTranscribeChannel",cooldownInput("repair"));
 expect(await f.workflow.saveArtifact(ref,{awemeId:"keep"})).toMatchObject({status:"saved"});
 expect(await f.workflow.saveArtifact(ref,{awemeId:"repair"})).toMatchObject({status:"image-album"});
 expect(await f.workflow.complete(ref,{})).toEqual({status:"succeeded"});const current=await f.rows();
 expect(current.calls).toEqual(old.calls);expect(current.execution.deadlineAt).toBe(old.execution.deadlineAt);
 expect((current.execution.payload as {transcribeItems?:Record<string,unknown>}).transcribeItems?.keep).toEqual((old.execution.payload as {transcribeItems?:Record<string,unknown>}).transcribeItems?.keep);
 expect(current.steps.find(step=>step.id===oldSummary.id)).toEqual(oldSummary);
 expect(current.steps.map(step=>step.stepNo)).toEqual([1,2,3,4,5,6,7]);
 expect(current.steps.at(-1)?.id).toBe(`transcribe:${ref.executionTaskId}:summary:attempt:${ref.attempt}`);
 expect((await f.publicSteps()).at(-1)?.text).toBe("转写完成 1 条，已有逐字稿跳过 0 条，图集跳过 1 条，转写失败 0 条，未找到对应作品 0 条");
 expect(await f.workflow.complete(ref,{})).toEqual({status:"succeeded"});expect(await f.rows()).toEqual(current);
});

it.each(["saved","image-album","no-project"]as const)("实际%s作品已确认后，晚Gateway冷却不追加过期说明或改原typed响应",async(status)=>{
 const f=await fixture(["done","pending"],status==="no-project"?["done"]:[]),entered=deferred(),release=deferred();
 const source=await f.source(async()=>{entered.resolve();await release.promise;});
 const pending=source.host.invoke(f.ref,"acquireTranscribeChannel",cooldownInput("done"));
 try{
  await entered.promise;
  const receipt=status==="saved"?await f.saveConfirmedText(f.ref,"done"):await f.saveAlbum(f.ref,"done");expect(receipt.status).toBe(status);
  const before=await f.rows();expect(before.execution.status).toBe("running");const publicBefore=await f.publicSteps();
  release.resolve();expect(await pending).toEqual({sourceFailure:{outcome:"retry_wait",errorCode:"TRANSCRIBE_SOURCE_COOLDOWN",retryAfterMs:960000}});
  expect(source.observations).toBe(1);expect(await f.publicSteps()).toEqual(publicBefore);expect(await f.rows()).toEqual(before);
 }finally{release.resolve();await pending.catch(()=>{});}
});

it("无signal时真实insert await跨原deadline，Control Conflict使本交易新增note完整回滚",async()=>{
 const f=await fixture(["expiry"]),before=await f.rows();let inserts=0;
 const delayed=afterRealStepInsert(db(),()=>{inserts++;f.advanceTo(Date.parse(before.execution.deadlineAt!)+1);});
 const source=await f.source(undefined,delayed);
 await expect(source.host.invoke(f.ref,"acquireTranscribeChannel",cooldownInput("expiry"))).rejects.toThrow("当前执行已停止或租约到期，不能启动新动作");
 expect(inserts).toBe(1);expect(source.observations).toBe(1);expect(await f.rows()).toEqual(before);expect(await f.publicSteps()).toEqual([]);
});

it("真实insert完成后的signal取消仍传播AbortError，note零提交且不伪造普通来源成功",async()=>{
 const f=await fixture(["abort"]),before=await f.rows(),controller=new AbortController();let inserts=0;
 const delayed=afterRealStepInsert(db(),()=>{inserts++;controller.abort(new DOMException("隔离取消","AbortError"));});
 const source=await f.source(undefined,delayed);
 await expect(source.host.invoke(f.ref,"acquireTranscribeChannel",cooldownInput("abort"),controller.signal)).rejects.toMatchObject({name:"AbortError"});
 expect(inserts).toBe(1);expect(await f.rows()).toEqual(before);expect(await f.publicSteps()).toEqual([]);
});

it("真实临时CHECK拒绝note插入保持未知错误传播，解除精确故障后原键恢复不重排",async()=>{
 const f=await fixture(["insert"]),source=await f.source(),before=await f.rows();
 const id=`transcribe-cooldown:${f.ref.executionTaskId}:${f.ref.attempt}:insert:iesdouyin`,quoted=id.replace(/'/g,"''");
 await db().execute(sql.raw(`ALTER TABLE ai_task_steps ADD CONSTRAINT t213_block_exact_note CHECK (id <> '${quoted}')`));
 try{
  const error=await source.host.invoke(f.ref,"acquireTranscribeChannel",cooldownInput("insert")).catch((failure:unknown)=>failure);
  expect(error).toBeInstanceOf(Error);expect(error).not.toHaveProperty("sourceFailure");
  // Drizzle保留原PG错误为cause；不能因SQL包装正文不同误判已吞未知。
  const failure=error as Error&{cause?:unknown};
  expect([failure.message,failure.cause instanceof Error?failure.cause.message:""].join("\n")).toContain("t213_block_exact_note");
  expect(await f.rows()).toEqual(before);expect(await f.publicSteps()).toEqual([]);
 }finally{await db().execute(sql.raw("ALTER TABLE ai_task_steps DROP CONSTRAINT t213_block_exact_note"));}
 expect(await source.host.invoke(f.ref,"acquireTranscribeChannel",cooldownInput("insert"))).toMatchObject({sourceFailure:{errorCode:"TRANSCRIBE_SOURCE_COOLDOWN"}});
 const steps=await f.publicSteps();expect(steps).toHaveLength(1);expect(steps[0]?.text).toBe("作品 1：当时抖音来源限流冷却。");
 const recovered=await f.rows();expect(recovered.calls).toEqual(before.calls);expect(recovered.execution.payload).toEqual(before.execution.payload);
 await source.host.invoke(f.ref,"acquireTranscribeChannel",cooldownInput("insert"));expect(await f.rows()).toEqual(recovered);
});
