import {afterAll,beforeAll,expect,it} from "vitest";
import {createHash,randomUUID} from "node:crypto";
import {drizzle} from "drizzle-orm/pglite";
import {createDb,aiMessages,executionCalls,executionTasks,workbenchArtifactLineages,workbenchArtifactLineageVersions,eq,type Db} from "@creatoros/backend";
import {createAiRepository,createChatTurnSubmissionService} from "../ai";
import {createPersistentTaskService} from "./persistent-task.service";
import {createWorkbenchArtifactService,createWorkbenchArtifactReadService} from "./workbench-artifact.service";
import {agenticToolOperationKey} from "./agentic-tool-binding";
import {startWorkbenchArtifactReconciler} from "./workbench-artifact-reconciler";

let db:Db,close:()=>Promise<void>;
const queries:string[]=[];
beforeAll(async()=>{const opened=await createDb();db=drizzle(opened.client,{logger:{logQuery(query){queries.push(query);}}}) as Db;close=()=>opened.client.close();});
afterAll(async()=>close?.());

const sha=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");

async function fixture(clock?:{value:string},options:{dbBackedBlobRead?:boolean}={}){
 const nonce=randomUUID(),ctx={userId:`lineage-u-${nonce}`,accountId:`lineage-a-${nonce}`,requestId:nonce,source:"user" as const};
 const currentNow=()=>clock?.value??new Date().toISOString();
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now:currentNow,nextId:prefix=>`${prefix}-${randomUUID()}`}),conversation=await repo.createConversation({title:"跨回合产物",projectId:null,scope:"global"});
 const files=new Map<string,{bytes:Uint8Array;version:number}>(),objects=new Map<string,Uint8Array>();
 const failedSubmits=new Set<string>();
 let onRead:((input:{taskId:string;operationId:string;hash:string})=>Promise<void>)|undefined;
 const service=createWorkbenchArtifactService(db,{async readTaskFile(scope,path){const file=files.get(`${scope.taskId}:${path}`);if(!file)throw Error("FILE_NOT_FOUND");return {bytes:new Uint8Array(file.bytes),version:file.version};},blobs:{
  async submit(_ctx,input){if(failedSubmits.has(input.operationId))throw Error("STORE_RESULT_LOST");const hash=sha(input.bytes);objects.set(`${input.taskId}:${input.operationId}:${hash}`,new Uint8Array(input.bytes));return {hash,size:input.bytes.byteLength};},
  async read(_ctx,input){
   // 正式 objectStorageForCtx 会先从根 db 读取存储设置；此探针复现相同边界，防止
   // commit/reconcile 再把 Blob 回读放进 PGlite 独占事务。
   if(options.dbBackedBlobRead)await db.select({id:executionTasks.id}).from(executionTasks).limit(1);
   await onRead?.(input);
   const bytes=objects.get(`${input.taskId}:${input.operationId}:${input.hash}`);if(!bytes)throw Error("BLOB_NOT_FOUND");return new Uint8Array(bytes);
  },
  async inspect(_ctx,input){return objects.has(`${input.taskId}:${input.operationId}:${input.hash}`)?"present" as const:"absent" as const;},
 },now:currentNow});
 async function operation(taskId:string,ref:{executionTaskId:string;attempt:number;fenceToken:string},sequence:number,toolName="artifact.register"){
  const operationId=`artifact-call-${randomUUID()}`,claimId=`claim-${randomUUID()}`,modelId=`model-${randomUUID()}`,toolCallId=`tool-${randomUUID()}`,stamp=new Date().toISOString();
  await db.insert(executionCalls).values({id:modelId,executionTaskId:taskId,sequence:sequence*2-1,operationKey:`model:${modelId}`,
   kind:"model",inputDigest:`sha256:${"b".repeat(64)}`,status:"settled",reservedTokens:1,accountingBasis:"tokens",startedAttempt:ref.attempt,
   usage:{totalTokens:1},totalTokens:1,providerResult:{content:[{type:"tool-call",toolCallId,toolName:toolName.replaceAll(".","_"),input:"{}"}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:1},outputTokens:{total:0}},warnings:[]},createdAt:stamp,updatedAt:stamp});
  await db.insert(executionCalls).values({id:operationId,executionTaskId:taskId,sequence:sequence*2,operationKey:agenticToolOperationKey(modelId,toolCallId),
   kind:"tool",inputDigest:`sha256:${"a".repeat(64)}`,status:"started",reservedTokens:0,accountingBasis:"tokens",startedAttempt:ref.attempt,
   toolExecutionClaimId:claimId,createdAt:stamp,updatedAt:stamp});
  return {taskId,ref,operationId,claimId,toolCallId};
 }
 async function turn(label:string,target=conversation.id,toolName="artifact.register"){
  const source=await repo.createMessage(target,{role:"user",content:label,attachments:[],modelMetadata:{}});
  const submitted=await createChatTurnSubmissionService(db,{assemble:async()=>({capability:"copilot.assist",system:"产物测试",messages:[{role:"user",content:label}],tools:[],maxSteps:4,maxOutputTokens:128})}).submit(ctx,{conversationId:target,sourceMessageId:source.id});
  const [saved]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));const payload=saved!.payload as Record<string,unknown>,modelInput=payload.modelInput as Record<string,unknown>;
  await db.update(executionTasks).set({payload:{...payload,modelInput:{...modelInput,tools:[{name:"artifact.register"},{name:"artifact.copy"}]}}}).where(eq(executionTasks.id,submitted.executionTaskId));
  const claim=(await createPersistentTaskService(db).claimTask({taskId:submitted.executionTaskId,workerId:`worker-${label}`}))!;
  const ref={executionTaskId:submitted.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  return operation(submitted.executionTaskId,ref,1,toolName);
 }
 const finish=async(t:Awaited<ReturnType<typeof turn>>,metadata:Awaited<ReturnType<typeof service.register>>,toolName="artifact.register")=>{
  const workbench={operationId:t.operationId,status:"succeeded" as const,artifactRefs:[`${metadata.artifactId}@${metadata.version}`],progressCursor:null,
   content:[{type:"text" as const,text:JSON.stringify(metadata)}]};
  const outcome={status:"ok" as const,summary:JSON.stringify(metadata),evidence:[],data:{workbench},error:null,continuation:null,sideEffect:"committed" as const};
  return service.commitAndSettleArtifact(t.ref,{operationId:t.operationId,claimId:t.claimId,toolName,toolCallId:t.toolCallId,outcome});
 };
 return {ctx,repo,conversation,files,objects,failedSubmits,service,turn,operation,finish,setReadHook:(hook:typeof onRead)=>{onRead=hook;}};
}

async function legacyArtifact(f:Awaited<ReturnType<typeof fixture>>,label:string,content:string,settlement:"settled"|"started"|"mismatch",mime:"text/markdown"|"text/html"|"image/png"="text/markdown"){
 const turn=await f.turn(label),[task]=await db.select().from(executionTasks).where(eq(executionTasks.id,turn.taskId)),payload=task!.payload as Record<string,unknown>;
 await db.update(executionTasks).set({payload:{...payload,artifactProtocolVersion:1}}).where(eq(executionTasks.id,turn.taskId));
 const path=`${label}.${mime==="text/html"?"html":mime==="image/png"?"png":"md"}`;
 f.files.set(`${turn.taskId}:${path}`,{bytes:Buffer.from(content),version:1});
 const metadata=await f.service.register(turn.ref,turn.operationId,{path,mime});
 if(settlement!=="started"){
  const workbench={operationId:turn.operationId,status:"succeeded",artifactRefs:[`${metadata.artifactId}@${metadata.version}`],progressCursor:null,content:[{type:"text",text:JSON.stringify(metadata)}]};
  const output={status:"ok",summary:JSON.stringify(metadata),evidence:[],data:{workbench},error:null,continuation:null,sideEffect:"committed"};
  const receipt={schemaVersion:1,kind:"tool",toolCallId:turn.toolCallId,toolName:"artifact.register",output:settlement==="mismatch"?{...output,data:{workbench:{...workbench,artifactRefs:["wrong@1"]}}}:output};
  await db.update(executionCalls).set({status:"settled",resultText:JSON.stringify(receipt),usage:{totalTokens:0},totalTokens:0}).where(eq(executionCalls.id,turn.operationId));
 }
 return {turn,metadata};
}

it("同一会话跨回合提交不可变版本，当前任务能发现并读取两版真实字节",async()=>{
 const f=await fixture(),first=await f.turn("第一回合");
 f.files.set(`${first.taskId}:报告.md`,{bytes:Buffer.from("第一版"),version:1});
 const v1=await f.service.register(first.ref,first.operationId,{path:"报告.md",mime:"text/markdown"});
 await f.finish(first,v1);
 const second=await f.turn("第二回合");
 f.files.set(`${second.taskId}:报告.md`,{bytes:Buffer.from("第二版"),version:1});
 const v2=await f.service.register(second.ref,second.operationId,{path:"报告.md",mime:"text/markdown",artifactId:v1.artifactId,
  expectedVersion:1,baseArtifactRef:{artifactId:v1.artifactId,version:1}});
 await f.finish(second,v2);
 expect(v2).toMatchObject({artifactId:v1.artifactId,version:2,taskId:second.taskId,baseArtifactRef:{artifactId:v1.artifactId,version:1}});
 const [old,current]=await Promise.all([
  f.service.read(f.ctx,second.taskId,v1.artifactId,1,0,100),f.service.read(f.ctx,second.taskId,v1.artifactId,2,0,100),
 ]);
 expect(Buffer.from(old.bytes).toString()).toBe("第一版");expect(Buffer.from(current.bytes).toString()).toBe("第二版");
 await expect(f.service.read({...f.ctx,accountId:"other-account"},second.taskId,v1.artifactId,1,0,100)).rejects.toThrow();
 const listing=await f.service.versions(f.ctx,second.taskId,{artifactId:v1.artifactId,limit:50});
 expect(listing.items.map(item=>({version:item.version,taskId:item.taskId}))).toEqual([{version:1,taskId:first.taskId},{version:2,taskId:second.taskId}]);
 const page1=await f.service.versions(f.ctx,second.taskId,{artifactId:v1.artifactId,limit:1});expect(page1.nextCursor).toMatch(/^v1:/);
 const page2=await f.service.versions(f.ctx,second.taskId,{artifactId:v1.artifactId,limit:1,cursor:page1.nextCursor!});expect(page2.items).toEqual([expect.objectContaining({version:2})]);
 const calls=await db.select().from(executionCalls).where(eq(executionCalls.id,second.operationId));
 expect(calls[0]).toMatchObject({status:"settled",toolExecutionClaimId:second.claimId});
});

it("聊天消息到业务任务的绑定被篡改后拒绝进入 v2 产物协议",async()=>{
 const f=await fixture(),turn=await f.turn("映射篡改"),[task]=await db.select().from(executionTasks).where(eq(executionTasks.id,turn.taskId)),sourceMessageId=((task!.payload as Record<string,unknown>).modelInput as Record<string,unknown>).sourceMessageId as string;
 await db.update(aiMessages).set({modelMetadata:{chatTaskId:"forged-task"}}).where(eq(aiMessages.id,sourceMessageId));
 f.files.set(`${turn.taskId}:报告.md`,{bytes:Buffer.from("不应登记"),version:1});
 await expect(f.service.register(turn.ref,turn.operationId,{path:"报告.md",mime:"text/markdown"})).rejects.toThrow("映射无效");
});

it("不同会话不能修订或读取谱系，并发回合只有一个能占有下一版本",async()=>{
 const f=await fixture(),first=await f.turn("第一回合");
 f.files.set(`${first.taskId}:报告.md`,{bytes:Buffer.from("第一版"),version:1});
 const v1=await f.service.register(first.ref,first.operationId,{path:"报告.md",mime:"text/markdown"});await f.finish(first,v1);
 const [a,b]=await Promise.all([f.turn("并发 A"),f.turn("并发 B")]);
 f.files.set(`${a.taskId}:报告.md`,{bytes:Buffer.from("A"),version:1});f.files.set(`${b.taskId}:报告.md`,{bytes:Buffer.from("B"),version:1});
 const results=await Promise.allSettled([a,b].map(t=>f.service.register(t.ref,t.operationId,{path:"报告.md",mime:"text/markdown",artifactId:v1.artifactId,expectedVersion:1,baseArtifactRef:{artifactId:v1.artifactId,version:1}})));
 expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);expect(results.filter(result=>result.status==="rejected")).toHaveLength(1);
 const other=await f.repo.createConversation({title:"另一个会话",projectId:null,scope:"global"}),foreign=await f.turn("越权修订",other.id);
 f.files.set(`${foreign.taskId}:报告.md`,{bytes:Buffer.from("伪造"),version:1});
 await expect(f.service.register(foreign.ref,foreign.operationId,{path:"报告.md",mime:"text/markdown",artifactId:v1.artifactId,expectedVersion:1,baseArtifactRef:{artifactId:v1.artifactId,version:1}})).rejects.toThrow();
 await expect(f.service.read(f.ctx,foreign.taskId,v1.artifactId,1,0,100)).rejects.toThrow();
 await expect(f.service.versions(f.ctx,foreign.taskId,{limit:1,cursor:`v1:${"0".repeat(32)}`})).rejects.toThrow("游标");
});

it("复制只接受同一会话的已登记 PNG，并以当前任务的新产物和真实来源落库",async()=>{
 const f=await fixture(),sourceTurn=await f.turn("登记图片"),png=Buffer.from("registered-png-bytes");
 f.files.set(`${sourceTurn.taskId}:图/chart.png`,{bytes:png,version:1});
 const source=await f.service.register(sourceTurn.ref,sourceTurn.operationId,{path:"图/chart.png",mime:"image/png"});await f.finish(sourceTurn,source);
 const copyTurn=await f.turn("复制图片",f.conversation.id,"artifact.copy");
 const copied=await f.service.copy(copyTurn.ref,copyTurn.operationId,{sourceArtifactId:source.artifactId,sourceVersion:1,targetPath:"新版/chart.png"});
 await f.finish(copyTurn,copied,"artifact.copy");
 expect(copied).toMatchObject({version:1,taskId:copyTurn.taskId,relativePath:"新版/chart.png",mime:"image/png",
  copiedFrom:{artifactId:source.artifactId,version:1,taskId:sourceTurn.taskId,hash:source.hash}});
 expect(copied.artifactId).not.toBe(source.artifactId);
 const page=await f.service.read(f.ctx,copyTurn.taskId,copied.artifactId,1,0,100);expect(Buffer.from(page.bytes)).toEqual(png);
});

it("HTML 冻结登记时的精确图片版本，同路径图片后来更新也不替换旧清单",async()=>{
 const f=await fixture(),turn=await f.turn("图文报告"),image1=Buffer.from("png-version-one"),image2=Buffer.from("png-version-two");
 f.files.set(`${turn.taskId}:报告/chart.png`,{bytes:image1,version:1});
 const png1=await f.service.register(turn.ref,turn.operationId,{path:"报告/chart.png",mime:"image/png"});await f.finish(turn,png1);
 const htmlCall=await f.operation(turn.taskId,turn.ref,2);
 f.files.set(`${turn.taskId}:报告/index.html`,{bytes:Buffer.from('<h1>报告</h1><img src="./chart.png">'),version:1});
 const html=await f.service.register(turn.ref,htmlCall.operationId,{path:"报告/index.html",mime:"text/html"});await f.finish(htmlCall,html);
 expect(html.htmlResources).toEqual([{path:"报告/chart.png",artifactId:png1.artifactId,version:1,taskId:turn.taskId,hash:png1.hash,size:image1.byteLength}]);
 const image2Call=await f.operation(turn.taskId,turn.ref,3);f.files.set(`${turn.taskId}:报告/chart.png`,{bytes:image2,version:2});
 const png2=await f.service.register(turn.ref,image2Call.operationId,{path:"报告/chart.png",mime:"image/png",artifactId:png1.artifactId,
  expectedVersion:1,baseArtifactRef:{artifactId:png1.artifactId,version:1}});await f.finish(image2Call,png2);
 const before=await artifactDatabaseSnapshot();
 const frozen=await readOnlyFor(f).readRelativeImage(f.ctx,turn.taskId,"报告/chart.png",html);
 expect(Buffer.from(frozen!.bytes)).toEqual(image1);expect(frozen!.metadata.version).toBe(1);
 expect(await artifactDatabaseSnapshot()).toEqual(before);
});

it("Blob 已准备但正式结算未知时保持占位，版本列表不把它伪装成完成版",async()=>{
 const f=await fixture(),turn=await f.turn("未知提交");f.files.set(`${turn.taskId}:报告.md`,{bytes:Buffer.from("待核对"),version:1});
 const pending=await f.service.register(turn.ref,turn.operationId,{path:"报告.md",mime:"text/markdown"});
 await f.service.markUnknown(turn.ref,{operationId:turn.operationId,claimId:turn.claimId,toolCallId:turn.toolCallId,toolName:"artifact_register"});
 const listing=await f.service.versions(f.ctx,turn.taskId,{limit:50});expect(listing.items).toEqual([]);
 expect(listing.lineages).toEqual([expect.objectContaining({artifactId:pending.artifactId,currentVersion:0,status:"unknown",lastErrorCode:"artifact_result_unknown"})]);
 const next=await f.operation(turn.taskId,turn.ref,2);f.files.set(`${turn.taskId}:报告.md`,{bytes:Buffer.from("另一次"),version:2});
 await expect(f.service.register(turn.ref,next.operationId,{path:"报告.md",mime:"text/markdown",artifactId:pending.artifactId,expectedVersion:0})).rejects.toThrow();
 await db.update(executionTasks).set({fenceToken:`replacement-${randomUUID()}`,leaseExpiresAt:"2020-01-01T00:00:00.000Z"}).where(eq(executionTasks.id,turn.taskId));
 await db.update(workbenchArtifactLineages).set({state:"reconciling",reconciliationClaimId:"dead-process",reconciliationLeaseExpiresAt:"2020-01-01T00:00:00.000Z"}).where(eq(workbenchArtifactLineages.pendingOperationId,turn.operationId));
 const reconciler=startWorkbenchArtifactReconciler(db,f.service,{intervalMs:60_000,startImmediately:false});expect(await reconciler.scan()).toBe(1);reconciler.stop();
 const recovered=await f.service.versions(f.ctx,turn.taskId,{limit:50});expect(recovered.items).toEqual([expect.objectContaining({artifactId:pending.artifactId,version:1,status:"ready"})]);
});

it("产物自动对账的存储设置读取在事务外完成，前台数据库读取不会被永久阻塞",async()=>{
 const f=await fixture(undefined,{dbBackedBlobRead:true}),turn=await f.turn("恢复数据库活性");
 f.files.set(`${turn.taskId}:播放量报告.html`,{bytes:Buffer.from("<h1>真实报告</h1>"),version:1});
 const pending=await f.service.register(turn.ref,turn.operationId,{path:"播放量报告.html",mime:"text/html"});
 await f.service.markUnknown(turn.ref,{operationId:turn.operationId,claimId:turn.claimId,toolCallId:turn.toolCallId,toolName:"artifact_register"});
 await db.update(executionTasks).set({status:"unknown_result",fenceToken:`replacement-${randomUUID()}`,leaseOwner:null,leaseExpiresAt:"2020-01-01T00:00:00.000Z"}).where(eq(executionTasks.id,turn.taskId));
 await db.update(workbenchArtifactLineages).set({state:"reconciling",reconciliationClaimId:"dead-process",reconciliationLeaseExpiresAt:"2020-01-01T00:00:00.000Z"}).where(eq(workbenchArtifactLineages.pendingOperationId,turn.operationId));
 const tasks=createPersistentTaskService(db);
 const reconciler=startWorkbenchArtifactReconciler(db,f.service,{intervalMs:60_000,startImmediately:false,
  afterReconciled:async()=>{await tasks.recoverExpiredLeases({includeSafeUnknownResults:true});}});
 const recovery=reconciler.scan();
 await expect(Promise.race([
  db.select({id:executionTasks.id}).from(executionTasks).where(eq(executionTasks.id,turn.taskId)),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error("DB_READ_STALLED")),1000)),
 ])).resolves.toHaveLength(1);
 await expect(recovery).resolves.toBe(1);reconciler.stop();
 const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,turn.operationId));
 expect(call).toMatchObject({status:"settled",toolExecutionClaimId:turn.claimId});
 const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,turn.taskId));
 expect(task).toMatchObject({status:"queued",leaseOwner:null,leaseExpiresAt:null});
 const recovered=await f.service.versions(f.ctx,turn.taskId,{limit:50});
 expect(recovered.items).toEqual([expect.objectContaining({artifactId:pending.artifactId,version:1,status:"ready"})]);
});

it("升级时逐谱系核对旧回执；started 原调用按同一 ID 结算，坏回执只显示旧版只读卡",async()=>{
 const f=await fixture(),settled=await legacyArtifact(f,"旧已结算","旧版一","settled"),unsettled=await legacyArtifact(f,"旧待结算","旧版二","started"),blocked=await legacyArtifact(f,"旧坏回执","旧版三","mismatch");
 const current=await f.turn("升级后的当前回合"),listing=await f.service.versions(f.ctx,current.taskId,{limit:50});
 expect(listing.items).toEqual(expect.arrayContaining([
  expect.objectContaining({artifactId:settled.metadata.artifactId,version:1,status:"ready"}),
  expect.objectContaining({artifactId:unsettled.metadata.artifactId,version:1,status:"ready"}),
 ]));
 expect(listing.items.some(item=>item.artifactId===blocked.metadata.artifactId)).toBe(false);
 expect(listing.lineages).toEqual(expect.arrayContaining([expect.objectContaining({artifactId:blocked.metadata.artifactId,status:"migration_blocked",migrationReason:"legacy_receipt_mismatch"})]));
 const [reconciled]=await db.select().from(executionCalls).where(eq(executionCalls.id,unsettled.turn.operationId));expect(reconciled).toMatchObject({status:"settled",toolExecutionClaimId:unsettled.turn.claimId});
 const ui=await f.service.listConversation(f.ctx,f.conversation.id,{limit:50});
 expect(ui.legacyItems).toEqual([expect.objectContaining({artifactId:blocked.metadata.artifactId,status:"legacyReadOnly"})]);
});

it("权威无 Blob 需在旧 writer 失权后复核两次，才以 confirmedNoCommit 释放占位",async()=>{
 const clock={value:new Date().toISOString()},f=await fixture(clock),turn=await f.turn("存储结果丢失");
 f.files.set(`${turn.taskId}:失败.md`,{bytes:Buffer.from("不会落库"),version:1});f.failedSubmits.add(turn.operationId);
 await expect(f.service.register(turn.ref,turn.operationId,{path:"失败.md",mime:"text/markdown"})).rejects.toThrow("STORE_RESULT_LOST");
 const [pendingLineage]=await db.select().from(workbenchArtifactLineages).where(eq(workbenchArtifactLineages.pendingOperationId,turn.operationId)),pending=pendingLineage!.pendingMetadata as {artifactId:string};
 await f.service.markUnknown(turn.ref,{operationId:turn.operationId,claimId:turn.claimId,toolCallId:turn.toolCallId,toolName:"artifact_register"});
 await db.update(executionTasks).set({fenceToken:`replacement-${randomUUID()}`}).where(eq(executionTasks.id,turn.taskId));
 const reconciler=startWorkbenchArtifactReconciler(db,f.service,{now:()=>new Date(clock.value),intervalMs:60_000,startImmediately:false});
 expect(await reconciler.scan()).toBe(1);
 let status=await f.service.listConversation(f.ctx,f.conversation.id,{limit:50});expect(status.lineages).toEqual([expect.objectContaining({artifactId:pending.artifactId,status:"unknown",lastErrorCode:"artifact_blob_absent_recheck"})]);
 clock.value=new Date(Date.parse(clock.value)+31_000).toISOString();expect(await reconciler.scan()).toBe(1);reconciler.stop();
 status=await f.service.listConversation(f.ctx,f.conversation.id,{limit:50});expect(status.lineages).toEqual([expect.objectContaining({artifactId:pending.artifactId,status:"failed_confirmed",lastErrorCode:"artifact_blob_absent"})]);
 const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,turn.operationId)),receipt=JSON.parse(call!.resultText!);
 expect(call?.status).toBe("settled");expect(receipt.output).toMatchObject({status:"error",sideEffect:"none",data:{workbench:{status:"failed",error:{dispatched:true,confirmedNoCommit:true}}}});
 const retry=await f.turn("重新修订");f.files.set(`${retry.taskId}:失败.md`,{bytes:Buffer.from("安全重试"),version:1});
 const recovered=await f.service.register(retry.ref,retry.operationId,{path:"失败.md",mime:"text/markdown",artifactId:pending.artifactId,expectedVersion:0});expect(recovered.version).toBe(1);
});

function readOnlyFor(f:Awaited<ReturnType<typeof fixture>>){
 return createWorkbenchArtifactReadService(db,{blobs:{
  async submit(){throw new Error("只读端口不得提交对象");},
  async read(_ctx,input){
   await db.select({id:executionTasks.id}).from(executionTasks).limit(1);
   const bytes=f.objects.get(`${input.taskId}:${input.operationId}:${input.hash}`);
   if(!bytes)throw new Error("BLOB_NOT_FOUND");return new Uint8Array(bytes);
  },
 }});
}

it("精确HTML复制沿原图片tuple与解析基准跨任务换目录及嵌套复制，不触及原lineage",async()=>{
 const f=await fixture(undefined,{dbBackedBlobRead:true}),first=await f.turn("精确HTML源");
 const png=Buffer.from("frozen-image-one"),htmlBytes=Buffer.from('<p>原字节\r\n中文</p><img src="./chart.png">');
 f.files.set(`${first.taskId}:原目录/chart.png`,{bytes:png,version:1});
 const image=await f.service.register(first.ref,first.operationId,{path:"原目录/chart.png",mime:"image/png"});await f.finish(first,image);
 const htmlCall=await f.operation(first.taskId,first.ref,2);f.files.set(`${first.taskId}:原目录/index.html`,{bytes:htmlBytes,version:1});
 const source=await f.service.register(first.ref,htmlCall.operationId,{path:"原目录/index.html",mime:"text/html"});await f.finish(htmlCall,source);
 const before=await db.select().from(workbenchArtifactLineageVersions);
 const copiedTurn=await f.turn("精确HTML副本",f.conversation.id,"artifact.copy");
 const input={sourceArtifactId:source.artifactId,sourceVersion:1,targetPath:"副本/report.html"};
 const copied=await f.service.copy(copiedTurn.ref,copiedTurn.operationId,input);await f.finish(copiedTurn,copied,"artifact.copy");
 expect(copied).toMatchObject({version:1,hash:source.hash,htmlResourceBasePath:"原目录/index.html",htmlResources:source.htmlResources});
 expect(await f.service.copy(copiedTurn.ref,copiedTurn.operationId,input)).toEqual(copied);
 await expect(f.service.copy(copiedTurn.ref,copiedTurn.operationId,{...input,targetPath:"other.html"})).rejects.toThrow();
 const nestedTurn=await f.turn("精确HTML嵌套",f.conversation.id,"artifact.copy");
 const nested=await f.service.copy(nestedTurn.ref,nestedTurn.operationId,{sourceArtifactId:copied.artifactId,sourceVersion:1,targetPath:"另处/nested.html"});await f.finish(nestedTurn,nested,"artifact.copy");
 expect(nested).toMatchObject({htmlResourceBasePath:"原目录/index.html",htmlResources:source.htmlResources});
 expect(Buffer.from((await readOnlyFor(f).readAll(f.ctx,nestedTurn.taskId,nested.artifactId,1)).bytes)).toEqual(htmlBytes);
 expect(Buffer.from((await readOnlyFor(f).readRelativeImage(f.ctx,nestedTurn.taskId,"原目录/chart.png",nested))!.bytes)).toEqual(png);
 const after=await db.select().from(workbenchArtifactLineageVersions);expect(after.filter(row=>before.some(old=>old.id===row.id))).toEqual(before);
 expect([...f.files.keys()].some(key=>key.startsWith(copiedTurn.taskId)||key.startsWith(nestedTurn.taskId))).toBe(false);
});

async function rewriteArtifact(metadata:Awaited<ReturnType<ReturnType<typeof createWorkbenchArtifactService>["register"]>>){
 const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,metadata.taskId));
 const payload=task!.payload as {workbenchArtifactVersions:Array<{metadata:typeof metadata}>};
 await db.update(executionTasks).set({payload:{...payload,workbenchArtifactVersions:payload.workbenchArtifactVersions.map(row=>row.metadata.artifactId===metadata.artifactId&&row.metadata.version===metadata.version?{...row,metadata}:row)}}).where(eq(executionTasks.id,metadata.taskId));
 const rows=await db.select().from(workbenchArtifactLineageVersions).where(eq(workbenchArtifactLineageVersions.artifactId,metadata.artifactId));
 for(const row of rows.filter(row=>row.version===metadata.version))await db.update(workbenchArtifactLineageVersions).set({metadata}).where(eq(workbenchArtifactLineageVersions.id,row.id));
}

it("旧HTML无manifest精确复制不补猜图片，伪造读入metadata不能授权任意同账号图片",async()=>{
 const f=await fixture(),sourceTurn=await f.turn("旧无清单HTML");f.files.set(`${sourceTurn.taskId}:old.html`,{bytes:Buffer.from('<img src="./chart.png">'),version:1});
 const source=await f.service.register(sourceTurn.ref,sourceTurn.operationId,{path:"old.html",mime:"text/html"});await f.finish(sourceTurn,source);
 const {htmlResources:_manifest,...legacy}=source;await rewriteArtifact(legacy);
 const target=await f.turn("旧无清单复制",f.conversation.id,"artifact.copy"),copy=await f.service.copy(target.ref,target.operationId,{sourceArtifactId:source.artifactId,sourceVersion:1,targetPath:"copy.html"});await f.finish(target,copy,"artifact.copy");
 expect(copy.htmlResources).toBeUndefined();expect(await readOnlyFor(f).readRelativeImage(f.ctx,target.taskId,"chart.png",copy)).toBeNull();
 await expect(readOnlyFor(f).readRelativeImage(f.ctx,target.taskId,"chart.png",{...copy,htmlResources:[{path:"chart.png",artifactId:"fake",version:1,taskId:sourceTurn.taskId,hash:"a".repeat(64),size:1}]})).rejects.toThrow("正式版本");
});

it.each(["root","image","tuple","foreign","during_read"] as const)("复制来源 %s 核验失败不产生目标占位或版本",async(fault)=>{
 const f=await fixture(),first=await f.turn("损坏来源"),png=Buffer.from('original-image');
 f.files.set(`${first.taskId}:chart.png`,{bytes:png,version:1});const image=await f.service.register(first.ref,first.operationId,{path:"chart.png",mime:"image/png"});await f.finish(first,image);
 const htmlCall=await f.operation(first.taskId,first.ref,2);f.files.set(`${first.taskId}:root.html`,{bytes:Buffer.from('<img src="./chart.png">'),version:1});
 const source=await f.service.register(first.ref,htmlCall.operationId,{path:"root.html",mime:"text/html"});await f.finish(htmlCall,source);
 if(fault==="root")f.objects.set(`${first.taskId}:${htmlCall.operationId}:${source.hash}`,Buffer.from('bad'));
 if(fault==="image")f.objects.set(`${first.taskId}:${first.operationId}:${image.hash}`,Buffer.from('bad'));
 if(fault==="tuple")await rewriteArtifact({...source,htmlResources:source.htmlResources!.map(item=>({...item,size:item.size+1}))});
 if(fault==="foreign"){
  const other=await f.repo.createConversation({title:"其他会话",projectId:null,scope:"global"}),turn=await f.turn("外部图片",other.id);
  f.files.set(`${turn.taskId}:chart.png`,{bytes:png,version:1});const foreign=await f.service.register(turn.ref,turn.operationId,{path:"chart.png",mime:"image/png"});await f.finish(turn,foreign);
  await rewriteArtifact({...source,htmlResources:[{path:"chart.png",artifactId:foreign.artifactId,version:1,taskId:foreign.taskId,hash:foreign.hash,size:foreign.size}]});
 }
 if(fault==="during_read")f.setReadHook(async input=>{if(input.operationId===htmlCall.operationId){f.setReadHook(undefined);await rewriteArtifact({...source,relativePath:"changed.html"});}});
 const target=await f.turn("拒绝不确定复制",f.conversation.id,"artifact.copy");
 await expect(f.service.copy(target.ref,target.operationId,{sourceArtifactId:source.artifactId,sourceVersion:1,targetPath:"copy.html"})).rejects.toThrow();
 expect(await db.select().from(workbenchArtifactLineages).where(eq(workbenchArtifactLineages.pendingOperationId,target.operationId))).toHaveLength(0);
 expect(await db.select().from(workbenchArtifactLineageVersions).where(eq(workbenchArtifactLineageVersions.taskId,target.taskId))).toHaveLength(0);
});

it("HTML复制Blob已写未结算由原对账提交同call一次，源版本和未知费用不改",async()=>{
 const f=await fixture(undefined,{dbBackedBlobRead:true}),first=await f.turn("HTML故障源");f.files.set(`${first.taskId}:root.html`,{bytes:Buffer.from('<h1>stable</h1>'),version:1});
 const source=await f.service.register(first.ref,first.operationId,{path:"root.html",mime:"text/html"});await f.finish(first,source);
 const target=await f.turn("HTML失联",f.conversation.id,"artifact.copy"),args={sourceArtifactId:source.artifactId,sourceVersion:1,targetPath:"copy.html"};
 const pending=await f.service.copy(target.ref,target.operationId,args);
 await f.service.markUnknown(target.ref,{operationId:target.operationId,claimId:target.claimId,toolCallId:target.toolCallId,toolName:"artifact_copy"});
 await db.update(executionTasks).set({status:"paused",leaseOwner:null,leaseExpiresAt:null,fenceToken:`revoked-${randomUUID()}`}).where(eq(executionTasks.id,target.taskId));
 const reconciler=startWorkbenchArtifactReconciler(db,f.service,{startImmediately:false,intervalMs:60000});
 try{const done=await reconciler.reconcile(f.ctx,f.conversation.id,target.operationId);expect(done.status).toBe('committed');expect(await reconciler.reconcile(f.ctx,f.conversation.id,target.operationId)).toEqual(done);}finally{reconciler.stop();}
 const rows=await db.select().from(workbenchArtifactLineageVersions).where(eq(workbenchArtifactLineageVersions.taskId,target.taskId));expect(rows).toHaveLength(1);expect(rows[0]!.metadata).toEqual(pending);
 const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,target.taskId));expect(task!.status).toBe('paused');
 const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,target.operationId));expect(call).toMatchObject({status:'settled',toolExecutionClaimId:target.claimId});
});
it.each([{mime:"image/png" as const,extension:"png",limit:2*1024*1024},{mime:"text/markdown" as const,extension:"md",limit:20*1024*1024}])("精确复制 $mime 保留大小边界且超限不占位",async({mime,extension,limit})=>{
 const f=await fixture(),sourceTurn=await f.turn("大小边界"),bytes=Buffer.alloc(limit,65),path=`source.${extension}`;
 f.files.set(`${sourceTurn.taskId}:${path}`,{bytes,version:1});const source=await f.service.register(sourceTurn.ref,sourceTurn.operationId,{path,mime});await f.finish(sourceTurn,source);
 const target=await f.turn("上限精确复制",f.conversation.id,"artifact.copy"),copy=await f.service.copy(target.ref,target.operationId,{sourceArtifactId:source.artifactId,sourceVersion:1,targetPath:`copy.${extension}`});await f.finish(target,copy,"artifact.copy");
 expect(copy.size).toBe(limit);expect(copy.hash).toBe(sha(bytes));expect(Buffer.from((await readOnlyFor(f).readAll(f.ctx,target.taskId,copy.artifactId,1)).bytes).equals(bytes)).toBe(true);
 await rewriteArtifact({...source,size:limit+1});const tooLarge=await f.turn("超限拒绝",f.conversation.id,"artifact.copy");
 await expect(f.service.copy(tooLarge.ref,tooLarge.operationId,{sourceArtifactId:source.artifactId,sourceVersion:1,targetPath:`large.${extension}`})).rejects.toThrow("大小");
 expect(await db.select().from(workbenchArtifactLineages).where(eq(workbenchArtifactLineages.pendingOperationId,tooLarge.operationId))).toHaveLength(0);
 expect([...f.objects.keys()].some(key=>key.startsWith(tooLarge.taskId))).toBe(false);
});

it("正式迁移旧HTML只允许空清单规范化差异，源历史不变且其他差异仍拒绝",async()=>{
 const f=await fixture(),old=await legacyArtifact(f,"迁移HTML",'<img src="./chart.png">',"settled","text/html");
 const target=await f.turn("复制迁移HTML",f.conversation.id,"artifact.copy");
 await f.service.versions(f.ctx,target.taskId,{limit:50});
 const before=await artifactDatabaseSnapshot();
 const copied=await f.service.copy(target.ref,target.operationId,{sourceArtifactId:old.metadata.artifactId,sourceVersion:1,targetPath:"copy.html"});await f.finish(target,copied,"artifact.copy");
 expect(copied.htmlResources).toEqual([]);expect(copied.htmlResourceBasePath).toBe(old.metadata.relativePath);
 const after=await artifactDatabaseSnapshot();expect(after.tasks.find(t=>t.id===old.turn.taskId)).toEqual(before.tasks.find(t=>t.id===old.turn.taskId));
 expect(after.versions.filter(v=>v.taskId===old.turn.taskId)).toEqual(before.versions.filter(v=>v.taskId===old.turn.taskId));
 const [saved]=await db.select().from(workbenchArtifactLineageVersions).where(eq(workbenchArtifactLineageVersions.artifactId,old.metadata.artifactId));
 await db.update(workbenchArtifactLineageVersions).set({metadata:{...saved!.metadata as object,htmlResourceBasePath:"forged.html"}}).where(eq(workbenchArtifactLineageVersions.id,saved!.id));
 const next=await f.turn("拒绝扩大迁移等价",f.conversation.id,"artifact.copy");
 await expect(f.service.copy(next.ref,next.operationId,{sourceArtifactId:old.metadata.artifactId,sourceVersion:1,targetPath:"other.html"})).rejects.toThrow("索引不匹配");
});

it("旧v1冻结复制保留正式迁移PNG路径，新v2不会迁移未登记正式版本",async()=>{
 const f=await fixture(),old=await legacyArtifact(f,"旧PNG",'legacy PNG',"settled","image/png"),target=await f.turn("旧复制",f.conversation.id,"artifact.copy");
 const input={sourceArtifactId:old.metadata.artifactId,sourceVersion:1,targetPath:"copy.png"};
 await expect(f.service.copy(target.ref,target.operationId,input,2)).rejects.toThrow("正式产物版本不存在");
 const copy=await f.service.copy(target.ref,target.operationId,input,1);await f.finish(target,copy,"artifact.copy");expect(copy.hash).toBe(old.metadata.hash);
});

it.each(["remove_snapshot","change_kind"] as const)("结算锁外核验期间%s不可降级复制冻结来源检查",async(change)=>{
 const f=await fixture(),sourceTurn=await f.turn("快照不可降级" );f.files.set(`${sourceTurn.taskId}:root.html`,{bytes:Buffer.from('<h1>safe</h1>'),version:1});
 const source=await f.service.register(sourceTurn.ref,sourceTurn.operationId,{path:"root.html",mime:"text/html"});await f.finish(sourceTurn,source);
 const target=await f.turn("降级失败",f.conversation.id,"artifact.copy"),copy=await f.service.copy(target.ref,target.operationId,{sourceArtifactId:source.artifactId,sourceVersion:1,targetPath:"copy.html"});
 f.setReadHook(async input=>{if(input.operationId!==target.operationId)return;f.setReadHook(undefined);
  const [row]=await db.select().from(workbenchArtifactLineages).where(eq(workbenchArtifactLineages.pendingOperationId,target.operationId)),binding={...row!.pendingSource as Record<string,unknown>};
  if(change==="remove_snapshot")delete binding.sourceSnapshot;else binding.kind="taskFile";
  await db.update(workbenchArtifactLineages).set({pendingSource:binding}).where(eq(workbenchArtifactLineages.id,row!.id));
 });
 await expect(f.finish(target,copy,"artifact.copy")).rejects.toThrow();
 expect(await db.select().from(workbenchArtifactLineageVersions).where(eq(workbenchArtifactLineageVersions.taskId,target.taskId))).toHaveLength(0);
 const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,target.operationId));expect(call!.status).toBe("started");
});

async function artifactDatabaseSnapshot(){
 return {
  tasks:await db.select().from(executionTasks),calls:await db.select().from(executionCalls),
  lineages:await db.select().from(workbenchArtifactLineages),versions:await db.select().from(workbenchArtifactLineageVersions),
 };
}

it("T1026 只读列表及跨回合字节读取兼容 legacy，不迁移或结算原调用",async()=>{
 const f=await fixture(),old=await legacyArtifact(f,"只读旧版","原字节","started"),current=await f.turn("只读新回合"),reader=readOnlyFor(f);
 const before=await artifactDatabaseSnapshot();
 const listed=await reader.listConversation(f.ctx,f.conversation.id,{limit:1});
 const taskListed=await reader.versions(f.ctx,current.taskId,{limit:1});
 const page=await reader.read(f.ctx,current.taskId,old.metadata.artifactId,1,0,100);
 const all=await reader.readAll(f.ctx,current.taskId,old.metadata.artifactId,1);
 expect(await artifactDatabaseSnapshot()).toEqual(before);
 expect(listed.legacyItems).toEqual([expect.objectContaining({artifactId:old.metadata.artifactId,status:"legacyReadOnly"})]);
 expect(taskListed.items).toEqual([]);
 expect(Buffer.from(page.bytes).toString()).toBe("原字节");expect(all.metadata).toEqual(old.metadata);
 await expect(reader.readAll({...f.ctx,accountId:"other"},current.taskId,old.metadata.artifactId,1)).rejects.toThrow();
 const other=await f.repo.createConversation({title:"不可串会话",projectId:null,scope:"global"}),foreign=await f.turn("另一会话",other.id);
 await expect(reader.readAll(f.ctx,foreign.taskId,old.metadata.artifactId,1)).rejects.toThrow();
 await expect(reader.listConversation({...f.ctx,accountId:"other"},f.conversation.id,{limit:1})).rejects.toThrow();
 // 既有写工作流仍可迁移并结算，不能由只读修复悄悄移除。
 await f.service.versions(f.ctx,current.taskId,{limit:50});
 const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,old.turn.operationId));expect(call?.status).toBe("settled");
});

it("T1026 只读列表混合新旧版本分页，坏 Blob 不伪装为旧版可读产物",async()=>{
 const f=await fixture(),a=await legacyArtifact(f,"旧 A","A","settled"),b=await legacyArtifact(f,"旧 B","B","mismatch"),missing=await legacyArtifact(f,"旧缺字节","缺失","started");
 f.objects.delete(`${missing.turn.taskId}:${missing.turn.operationId}:${missing.metadata.hash}`);
 const turn=await f.turn("新版"),reader=readOnlyFor(f);f.files.set(`${turn.taskId}:新.md`,{bytes:Buffer.from("新"),version:1});
 const current=await f.service.register(turn.ref,turn.operationId,{path:"新.md",mime:"text/markdown"});await f.finish(turn,current);
 const before=await artifactDatabaseSnapshot(),seen:string[]=[];let cursor:string|undefined,firstCursor:string|undefined;
 do{
  const page=await reader.listConversation(f.ctx,f.conversation.id,{limit:1,...(cursor?{cursor}:{})});
  const items=[...page.items,...page.legacyItems];expect(items.length).toBeLessThanOrEqual(1);
  seen.push(...items.map(item=>item.artifactId));cursor=page.nextCursor??undefined;firstCursor??=cursor;
 }while(cursor);
 expect(await artifactDatabaseSnapshot()).toEqual(before);
 expect(seen.sort()).toEqual([a.metadata.artifactId,b.metadata.artifactId,current.artifactId].sort());
 await expect(reader.listConversation(f.ctx,f.conversation.id,{limit:1,cursor:firstCursor,artifactId:a.metadata.artifactId})).rejects.toThrow("游标");
 await expect(reader.readAll(f.ctx,turn.taskId,missing.metadata.artifactId,1)).rejects.toThrow("BLOB_NOT_FOUND");
});

it("T1026 对账按原 operationId 重读成功版本，后续版本和新占位不改变旧结果",async()=>{
 const f=await fixture(),first=await f.turn("对账第一版");f.files.set(`${first.taskId}:报告.md`,{bytes:Buffer.from("一"),version:1});
 const v1=await f.service.register(first.ref,first.operationId,{path:"报告.md",mime:"text/markdown"});
 const reconciler=startWorkbenchArtifactReconciler(db,f.service,{startImmediately:false,intervalMs:60_000});
 try{
  const firstResult=await reconciler.reconcile(f.ctx,f.conversation.id,first.operationId);
  expect(firstResult).toMatchObject({artifactId:v1.artifactId,status:"committed",lastErrorCode:null});
  expect(await reconciler.reconcile(f.ctx,f.conversation.id,first.operationId)).toEqual(firstResult);
  const second=await f.turn("对账第二版");f.files.set(`${second.taskId}:报告.md`,{bytes:Buffer.from("二"),version:1});
  const v2=await f.service.register(second.ref,second.operationId,{path:"报告.md",mime:"text/markdown",artifactId:v1.artifactId,expectedVersion:1,baseArtifactRef:{artifactId:v1.artifactId,version:1}});
  expect(await reconciler.reconcile(f.ctx,f.conversation.id,first.operationId)).toEqual(firstResult);
  await f.finish(second,v2);
  const before=await artifactDatabaseSnapshot();
  expect(await reconciler.reconcile(f.ctx,f.conversation.id,first.operationId)).toEqual(firstResult);
  expect(await artifactDatabaseSnapshot()).toEqual(before);
  await expect(reconciler.reconcile({...f.ctx,accountId:"other"},f.conversation.id,first.operationId)).rejects.toThrow();
  const other=await f.repo.createConversation({title:"另一会话",projectId:null,scope:"global"});
  await expect(reconciler.reconcile(f.ctx,other.id,first.operationId)).rejects.toThrow();
 }finally{reconciler.stop();}
});

it("T1026 PGlite 对账领取的真实 SQL 先锁任务再锁谱系",async()=>{
 const f=await fixture(),turn=await f.turn("锁顺序");f.files.set(`${turn.taskId}:报告.md`,{bytes:Buffer.from("锁顺序"),version:1});
 await f.service.register(turn.ref,turn.operationId,{path:"报告.md",mime:"text/markdown"});
 const reconciler=startWorkbenchArtifactReconciler(db,f.service,{startImmediately:false,intervalMs:60_000});
 try{
  const start=queries.length;await reconciler.reconcile(f.ctx,f.conversation.id,turn.operationId);
  const locks=queries.slice(start).filter(query=>query.includes('for update'));
  expect(locks[0]).toContain('from "execution_tasks"');
  expect(locks[1]).toContain('from "workbench_artifact_lineages"');
 }finally{reconciler.stop();}
});

it("T1026 并发对账只领取原操作一次，成功重放不重复触发恢复回调",async()=>{
 const f=await fixture(),turn=await f.turn("并发对账");f.files.set(`${turn.taskId}:报告.md`,{bytes:Buffer.from("并发"),version:1});
 await f.service.register(turn.ref,turn.operationId,{path:"报告.md",mime:"text/markdown"});
 let entered!:()=>void,release!:()=>void,calls=0,recovered=0;
 const started=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
 const reconciler=startWorkbenchArtifactReconciler(db,{async reconcileArtifactOperation(...args){calls++;entered();await gate;return f.service.reconcileArtifactOperation(...args);}},
  {startImmediately:false,intervalMs:60_000,afterReconciled:async()=>{recovered++;}});
 const first=reconciler.reconcile(f.ctx,f.conversation.id,turn.operationId);
 try{
  await started;
  expect(await reconciler.reconcile(f.ctx,f.conversation.id,turn.operationId)).toMatchObject({status:"reconciling"});
  expect(calls).toBe(1);release();
  const result=await first;expect(result.status).toBe("committed");
  expect(await reconciler.reconcile(f.ctx,f.conversation.id,turn.operationId)).toEqual(result);
  expect(calls).toBe(1);expect(recovered).toBe(1);
 }finally{release();await first;reconciler.stop();}
});

it("T1026 旧任务图片只读兼容：原图可取，无冻结清单的 HTML 不猜测图片版本",async()=>{
 const f=await fixture(),turn=await f.turn("旧图片"),[task]=await db.select().from(executionTasks).where(eq(executionTasks.id,turn.taskId));
 await db.update(executionTasks).set({payload:{...task!.payload as Record<string,unknown>,artifactProtocolVersion:1}}).where(eq(executionTasks.id,turn.taskId));
 f.files.set(`${turn.taskId}:报告/chart.png`,{bytes:Buffer.from("旧登记图"),version:1});
 const png=await f.service.register(turn.ref,turn.operationId,{path:"报告/chart.png",mime:"image/png"});
 const htmlCall=await f.operation(turn.taskId,turn.ref,2);f.files.set(`${turn.taskId}:报告/index.html`,{bytes:Buffer.from('<img src="./chart.png">'),version:1});
 const html=await f.service.register(turn.ref,htmlCall.operationId,{path:"报告/index.html",mime:"text/html"}),reader=readOnlyFor(f),before=await artifactDatabaseSnapshot();
 expect((await reader.readRelativeImage(f.ctx,turn.taskId,"报告/chart.png"))?.metadata).toEqual(png);
 expect(await reader.readRelativeImage(f.ctx,turn.taskId,"报告/chart.png",html)).toBeNull();
 expect((await reader.readAll(f.ctx,turn.taskId,html.artifactId,1)).metadata).toEqual(html);
 expect(await artifactDatabaseSnapshot()).toEqual(before);
});
