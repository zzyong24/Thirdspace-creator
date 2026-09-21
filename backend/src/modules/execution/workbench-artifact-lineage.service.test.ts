import {afterAll,beforeAll,expect,it} from "vitest";
import {createHash,randomUUID} from "node:crypto";
import {createDb,aiMessages,executionCalls,executionTasks,workbenchArtifactLineages,eq,type Db} from "@creatoros/backend";
import {createAiRepository,createChatTurnSubmissionService} from "../ai";
import {createPersistentTaskService} from "./persistent-task.service";
import {createWorkbenchArtifactService} from "./workbench-artifact.service";
import {agenticToolOperationKey} from "./agentic-tool-binding";
import {startWorkbenchArtifactReconciler} from "./workbench-artifact-reconciler";

let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
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
 const frozen=await f.service.readRelativeImage(f.ctx,turn.taskId,"报告/chart.png",html);
 expect(Buffer.from(frozen!.bytes)).toEqual(image1);expect(frozen!.metadata.version).toBe(1);
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
