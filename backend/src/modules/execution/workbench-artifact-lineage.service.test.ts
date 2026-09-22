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
 const service=createWorkbenchArtifactService(db,{async readTaskFile(scope,path){const file=files.get(`${scope.taskId}:${path}`);if(!file)throw Error("FILE_NOT_FOUND");return {bytes:new Uint8Array(file.bytes),version:file.version};},blobs:{
  async submit(_ctx,input){if(failedSubmits.has(input.operationId))throw Error("STORE_RESULT_LOST");const hash=sha(input.bytes);objects.set(`${input.taskId}:${input.operationId}:${hash}`,new Uint8Array(input.bytes));return {hash,size:input.bytes.byteLength};},
  async read(_ctx,input){
   // 正式 objectStorageForCtx 会先从根 db 读取存储设置；此探针复现相同边界，防止
   // commit/reconcile 再把 Blob 回读放进 PGlite 独占事务。
   if(options.dbBackedBlobRead)await db.select({id:executionTasks.id}).from(executionTasks).limit(1);
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
 return {ctx,repo,conversation,files,objects,failedSubmits,service,turn,operation,finish};
}

async function legacyArtifact(f:Awaited<ReturnType<typeof fixture>>,label:string,content:string,settlement:"settled"|"started"|"mismatch"){
 const turn=await f.turn(label),[task]=await db.select().from(executionTasks).where(eq(executionTasks.id,turn.taskId)),payload=task!.payload as Record<string,unknown>;
 await db.update(executionTasks).set({payload:{...payload,artifactProtocolVersion:1}}).where(eq(executionTasks.id,turn.taskId));
 f.files.set(`${turn.taskId}:${label}.md`,{bytes:Buffer.from(content),version:1});
 const metadata=await f.service.register(turn.ref,turn.operationId,{path:`${label}.md`,mime:"text/markdown"});
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
