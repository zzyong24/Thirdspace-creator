import { afterAll,beforeAll,expect,it } from "vitest";
import { createDb, aiConversations, aiMessages, aiTasks, aiTaskResults, executionTasks, executionCalls, executionStreamEvents, eq, type Db } from "@creatoros/backend";
import { createAiRepository } from "./ai.repository";
import {chatInputDigest} from "./chat-turn-submission.service";
import {createLocalFsObjectStorage} from "../assets/localfs-object-storage";
import {mkdtemp,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
const storageRoots:string[]=[];
import {assets,assetFiles} from "@creatoros/backend";
import { createChatTurnSubmissionService } from "./chat-turn-submission.service";
import { createPersistentTaskService } from "../execution/persistent-task.service";
import { createExternalChatTurnService } from "./external-chat-turn.service";

let db:Db,close:()=>Promise<void>,counter=0;
const now=()=>"2026-09-28T10:00:00.000Z",budget={maxCalls:4,maxTokens:10000,deadlineMs:60000};
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>{await close();for(const root of storageRoots)await rm(root,{recursive:true,force:true});});
async function fixture(legacy=false,displayLegacy=false){
 const ctx={userId:"external-chat-user",accountId:`external-chat-account-${++counter}`,requestId:"test",source:"user" as const};
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId:prefix=>`${prefix}-${++counter}`});
 const conversation=await repo.createConversation({title:"会话",projectId:null,scope:"global"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"问题",attachments:[],modelMetadata:{}});
 const submission=await createChatTurnSubmissionService(db,{now,assemble:async()=>({capability:"copilot.assist",system:"策略",messages:[{role:"user",content:"问题"}],maxSteps:6,maxOutputTokens:128,tools:[]})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id,executionEngine:"codex"});
 const taskService=createPersistentTaskService(db,{now}),claim=(await taskService.claimTask({taskId:submission.executionTaskId,workerId:"worker"}))!;
 const ref={executionTaskId:submission.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 if(legacy||displayLegacy){
  // 合成旧持久输入夹具，单独核投影兼容；不伪称来自安装版历史任务。
  const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));const payload=task!.payload as any;const modelInput={...payload.modelInput};if(legacy)delete modelInput.externalAgentBinding;if(displayLegacy)delete modelInput.toolOutcomeProjectionVersion;
  await db.update(executionTasks).set({payload:{...payload,modelInput}}).where(eq(executionTasks.id,submission.executionTaskId));
  const [business]=await db.select().from(aiTasks).where(eq(aiTasks.id,submission.taskId));await db.update(aiTasks).set({inputData:{...(business!.inputData as any),modelInputDigest:chatInputDigest(modelInput)}}).where(eq(aiTasks.id,submission.taskId));
 }
 const storageRoot=await mkdtemp(join(tmpdir(),"t1060-chat-image-"));storageRoots.push(storageRoot);const storage=createLocalFsObjectStorage({rootPath:storageRoot,publicBaseUrl:"/blob"},{nextKey:()=>"unused"});const service=createExternalChatTurnService(db,{now,budget,objectStorageForCtx:async()=>storage});
 const rows=async()=>({messages:await repo.listMessages(conversation.id),results:await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,submission.taskId)),task:(await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId)))[0]!,business:(await db.select().from(aiTasks).where(eq(aiTasks.id,submission.taskId)))[0]!});
 return {ctx,repo,conversation,source,submission,ref,service,rows,storage};
}
const receipt=(callId:string)=>({schemaVersion:1 as const,engine:"codex" as const,protocolKind:"acp" as const,protocolVersion:1,sessionId:"session-real",turnId:callId,stopReason:"end_turn" as const,text:"真实 ACP 回复",usage:null});

it.each([false,true])("ACP 展示旧版=%s：失败/拒绝/部分结果与终态事件一致，完成回放不改字节",async displayLegacy=>{
 for(const status of ["error","blocked","partial","denied"] as const){
  const f=await fixture(false,displayLegacy),turn=await f.service.reserve(f.ref,{});
  await f.service.start(f.ref,{callId:turn.callId,sessionId:"session-real",protocolKind:"acp",protocolVersion:1});
  const callId=`call-projection-${++counter}`,data={kind:"context.projects",items:[],total:0,...(status==="denied"?{denied:true}:{})};
  const outcome={status:status==="denied"?"blocked":status,summary:"账号权限已变更",evidence:[],data,error:status==="partial"?null:{code:"permission",retryable:false,recovery:"重新选择有权限的账号组"},continuation:null,sideEffect:"none"};
  await db.insert(executionCalls).values({id:callId,executionTaskId:f.submission.executionTaskId,sequence:2,operationKey:`projection-${counter}`,parentCallId:turn.callId,kind:"external_tool",inputDigest:"sha256:test",status:"settled",reservedTokens:0,accountingBasis:"requests",providerResult:{schemaVersion:1,kind:"external_tool",turnCallId:turn.callId,toolCallId:"real-read",toolName:"context.projects",toolVersion:"1"},resultText:JSON.stringify(outcome),createdAt:now(),updatedAt:now()});
  await f.service.settle(f.ref,{callId:turn.callId,status:"settled",receipt:receipt(turn.callId)});
  const completed=await f.service.commit(f.ref,{callId:turn.callId}),rows=await f.rows();
  const part=(rows.messages[1]!.parts as Array<Record<string,unknown>>).find(part=>part.toolCallId==="real-read")!;
  const events=await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.submission.executionTaskId));
  if(!displayLegacy&&status==="denied"){
   expect(part.state).toBe("output-denied");expect(part).not.toHaveProperty("output");
   expect(events.map(row=>row.chunk.type)).toContain("tool-output-denied");
   expect(events.map(row=>row.chunk.type)).not.toContain("tool-output-available");
  }else{
   expect(part.state).toBe("output-available");
   expect(events.find(row=>row.chunk.type==="tool-output-available")?.chunk.output).toEqual(part.output);
   if(displayLegacy)expect(part.output).toEqual(data);
   else expect(part.output).toMatchObject({...data,__creatorosOutcome:{schemaVersion:1,callId,status,summary:outcome.summary,error:outcome.error,sideEffect:"none"}});
  }
  const before=JSON.stringify({rows,events});
  expect(await f.service.commit(f.ref,{callId:turn.callId})).toEqual(completed);
  expect(JSON.stringify({rows:await f.rows(),events:await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.submission.executionTaskId))})).toBe(before);
 }
});

it("ACP 总用量包含缓存读取时，真实模型回执仍可结算和提交",async()=>{
 const f=await fixture(),reserved=await f.service.reserve(f.ref,{});
 await f.service.start(f.ref,{callId:reserved.callId,sessionId:"session-real",protocolKind:"acp",protocolVersion:1});
 const actualUsage={inputTokens:8072,outputTokens:5,totalTokens:17933,cachedReadTokens:9856,thoughtTokens:0};
 await f.service.settle(f.ref,{callId:reserved.callId,status:"settled",receipt:{...receipt(reserved.callId),usage:actualUsage}});
 await f.service.commit(f.ref,{callId:reserved.callId});
 const rows=await f.rows();
 expect(rows.task.status).toBe("succeeded");
 expect(rows.messages[1]).toMatchObject({inputTokens:8072,outputTokens:5,cachedTokens:9856});
 const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,reserved.callId));
 expect(call?.totalTokens).toBe(17933);
 expect(call?.usage).toMatchObject(actualUsage);
});

it("预留、启动、结算与提交全程使用同一真实外部回执；并发回放仅保存一次",async()=>{
 const f=await fixture();
 const reserved=await f.service.reserve(f.ref,{});
 expect(reserved).toMatchObject({status:"reserved"});
 expect(await f.service.reserve(f.ref,{})).toEqual(reserved);
 const started=await f.service.start(f.ref,{callId:reserved.callId,sessionId:"session-real",protocolKind:"acp",protocolVersion:1});
 expect(started).toMatchObject({status:"started",sessionId:"session-real",protocolKind:"acp",protocolVersion:1});
 expect(await f.service.reserve(f.ref,{})).toEqual(started);
 const settled=await f.service.settle(f.ref,{callId:reserved.callId,status:"settled",receipt:receipt(reserved.callId)});
 expect(settled.receipt).toEqual(receipt(reserved.callId));
 const results=await Promise.all([f.service.commit(f.ref,{callId:reserved.callId}),f.service.commit(f.ref,{callId:reserved.callId})]);
 expect(results[0]).toEqual(results[1]);
 const rows=await f.rows();
 expect(rows.messages).toHaveLength(2);
 const stream=await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.submission.executionTaskId));
 expect(stream.filter(row=>(row.chunk as {type?:string}).type==="text-delta").map(row=>(row.chunk as {delta:string}).delta).join("")).toBe("真实 ACP 回复");
 expect(rows.messages[1]).toMatchObject({content:"真实 ACP 回复",inputTokens:null,outputTokens:null,cachedTokens:null,modelMetadata:{actualEngine:"codex",sessionId:"session-real"}});
 expect(rows.results).toHaveLength(1);
 expect(rows.task.status).toBe("succeeded");
 expect(rows.business.status).toBe("succeeded");
 const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,reserved.callId));
 expect(call).toMatchObject({kind:"external_agent",status:"settled",resultRef:results[0]!.resultId,totalTokens:null});
});

it("未知结果、伪造 session/turn、错账号、被改写的源消息都不能提交",async()=>{
 const f=await fixture(),reserved=await f.service.reserve(f.ref,{});
 await expect(f.service.commit(f.ref,{callId:reserved.callId})).rejects.toThrow();
 await f.service.start(f.ref,{callId:reserved.callId,sessionId:"session-real",protocolKind:"acp",protocolVersion:1});
 await expect(f.service.settle(f.ref,{callId:reserved.callId,status:"settled",receipt:{...receipt(reserved.callId),sessionId:"other"}})).rejects.toThrow();
 await expect(f.service.settle(f.ref,{callId:reserved.callId,status:"settled",receipt:{...receipt(reserved.callId),turnId:"invented"}})).rejects.toThrow();
 await expect(f.service.settle(f.ref,{callId:reserved.callId,status:"settled",receipt:{...receipt(reserved.callId),text:"  "}})).rejects.toThrow();
 await expect(f.service.settle(f.ref,{callId:reserved.callId,status:"settled",receipt:{...receipt(reserved.callId),stopReason:"cancelled"}})).rejects.toThrow();
 await f.service.settle(f.ref,{callId:reserved.callId,status:"unknown"});
 await expect(f.service.commit(f.ref,{callId:reserved.callId})).rejects.toThrow();
 await expect(f.service.settle(f.ref,{callId:reserved.callId,status:"rejected",rejectionCode:"ACP_FAILED"})).rejects.toThrow();
 await f.service.settle(f.ref,{callId:reserved.callId,status:"settled",receipt:receipt(reserved.callId)});
 await db.update(aiConversations).set({accountId:"other"}).where(eq(aiConversations.id,f.conversation.id));
 await expect(f.service.commit(f.ref,{callId:reserved.callId})).rejects.toThrow();
 await db.update(aiConversations).set({accountId:f.ctx.accountId}).where(eq(aiConversations.id,f.conversation.id));
 await db.update(aiMessages).set({content:"源消息已改变"}).where(eq(aiMessages.id,f.source.id));
 await expect(f.service.commit(f.ref,{callId:reserved.callId})).rejects.toThrow();
 expect((await f.rows()).results).toHaveLength(0);
});

it("结算回放不可改写正文或用量；旧 fence 无法预留和提交",async()=>{
 const f=await fixture(),reserved=await f.service.reserve(f.ref,{});
 await f.service.start(f.ref,{callId:reserved.callId,sessionId:"session-real",protocolKind:"acp",protocolVersion:1});
 await f.service.settle(f.ref,{callId:reserved.callId,status:"settled",receipt:receipt(reserved.callId)});
 await expect(f.service.settle(f.ref,{callId:reserved.callId,status:"settled",receipt:{...receipt(reserved.callId),text:"伪造"}})).rejects.toThrow();
 await expect(f.service.reserve({...f.ref,fenceToken:"old"},{})).rejects.toThrow();
 await expect(f.service.commit({...f.ref,fenceToken:"old"},{callId:reserved.callId})).rejects.toThrow();
 expect((await f.rows()).messages).toHaveLength(1);
});

it("已结算的外部工具候选进入原会话卡片与事件流，用户仍需在 CreatorOS 采纳",async()=>{
 const f=await fixture(),reserved=await f.service.reserve(f.ref,{});
 await f.service.start(f.ref,{callId:reserved.callId,sessionId:"session-real",protocolKind:"acp",protocolVersion:1});
 await db.insert(executionCalls).values({id:`call-${++counter}`,executionTaskId:f.submission.executionTaskId,sequence:2,
  operationKey:`external-tool-test-${counter}`,parentCallId:reserved.callId,kind:"external_tool",inputDigest:"sha256:test",status:"settled",reservedTokens:0,accountingBasis:"requests",
  providerResult:{schemaVersion:1,kind:"external_tool",turnCallId:reserved.callId,toolCallId:"mcp-2",toolName:"learning.capture",toolVersion:"1"},
  resultText:JSON.stringify({status:"ok",summary:"已生成候选",evidence:[],data:{kind:"learning.capture",suggestion:{title:"经验"}},error:null,continuation:null,sideEffect:"proposal"}),createdAt:now(),updatedAt:now()});
 await f.service.settle(f.ref,{callId:reserved.callId,status:"settled",receipt:receipt(reserved.callId)});
 await f.service.commit(f.ref,{callId:reserved.callId});
 const rows=await f.rows();
 expect(rows.messages[1]?.parts).toContainEqual(expect.objectContaining({type:"tool-learning.capture",toolCallId:"mcp-2",state:"output-available",output:expect.objectContaining({kind:"learning.capture",suggestion:{title:"经验"},__creatorosOutcome:expect.objectContaining({sideEffect:"proposal",status:"ok"})})}));
 const events=await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.submission.executionTaskId));
 expect(events.map(event=>event.chunk.type)).toEqual(["tool-input-available","tool-output-available","text-start","text-delta","text-end","finish"]);
 expect(events[1]?.chunk.output).toMatchObject({kind:"learning.capture"});
 expect(events[3]?.chunk.delta).toBe("真实 ACP 回复");
 expect(events[2]?.chunk.id).toBe(events[3]?.chunk.id);
 expect(events[4]?.chunk.id).toBe(events[3]?.chunk.id);
});


it("原生 thread 与 provider turn 分别持久，缺实际 turn 和变更 ID 都不能结算",async()=>{
 const f=await fixture(true),reserved=await f.service.reserve(f.ref,{});
 const prepared=await f.service.prepareThread(f.ref,{callId:reserved.callId,sessionId:"thread-native",protocolKind:"codex-app-server",protocolVersion:1});
 expect(prepared).toMatchObject({status:"reserved",sessionId:"thread-native",protocolKind:"codex-app-server"});
 await expect(f.service.prepareThread(f.ref,{callId:reserved.callId,sessionId:"other",protocolKind:"codex-app-server",protocolVersion:1})).rejects.toThrow();
 await f.service.start(f.ref,{callId:reserved.callId,sessionId:"thread-native",protocolKind:"codex-app-server",protocolVersion:1});
 const native={...receipt(reserved.callId),sessionId:"thread-native",protocolKind:"codex-app-server",providerTurnId:"turn-native",text:"原生真实终态"};
 await expect(f.service.settle(f.ref,{callId:reserved.callId,status:"settled",receipt:native})).rejects.toThrow();
 const acknowledged=await f.service.recordProviderTurn(f.ref,{callId:reserved.callId,providerTurnId:"turn-native"});
 expect(acknowledged.providerTurnId).toBe("turn-native");
 await expect(f.service.recordProviderTurn(f.ref,{callId:reserved.callId,providerTurnId:"other"})).rejects.toThrow();
 await expect(f.service.settle(f.ref,{callId:reserved.callId,status:"settled",receipt:{...native,providerTurnId:"other"}})).rejects.toThrow();
 await f.service.settle(f.ref,{callId:reserved.callId,status:"unknown"});
 expect(await f.service.reserve(f.ref,{})).toMatchObject({status:"unknown",sessionId:"thread-native",providerTurnId:"turn-native"});
 await f.service.settle(f.ref,{callId:reserved.callId,status:"settled",receipt:native});
 await f.service.commit(f.ref,{callId:reserved.callId});
 const rows=await f.rows();
 expect(rows.messages[1]?.modelMetadata).toMatchObject({protocolKind:"codex-app-server",providerTurnId:"turn-native"});
 expect(rows.results[0]?.resultData).toMatchObject({protocolKind:"codex-app-server",providerTurnId:"turn-native"});
});

it("新任务拒绝原生协议；旧缺绑定任务拒绝切换成 ACP",async()=>{
 const current=await fixture(),turn=await current.service.reserve(current.ref,{});
 await expect(current.service.prepareThread(current.ref,{callId:turn.callId,sessionId:'s',protocolKind:'codex-app-server',protocolVersion:1})).rejects.toThrow();
 await expect(current.service.start(current.ref,{callId:turn.callId,sessionId:'s',protocolKind:'codex-app-server',protocolVersion:1})).rejects.toThrow();
 const legacy=await fixture(true),old=await legacy.service.reserve(legacy.ref,{});
 await expect(legacy.service.start(legacy.ref,{callId:old.callId,sessionId:'s',protocolKind:'acp',protocolVersion:1})).rejects.toThrow();
});

it("纯图片使用原 pending 收据，只保存一次；错 session、旧租约和伪造引用不能保存或结算",async()=>{
 const f=await fixture(),turn=await f.service.reserve(f.ref,{});await f.service.start(f.ref,{callId:turn.callId,sessionId:'session-real',protocolKind:'acp',protocolVersion:1});
 const identity={callId:turn.callId,sessionId:'session-real',toolCallId:'real-image-tool',imageIndex:0};const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
 await expect(f.service.saveImage(f.ref,{...identity,sessionId:'wrong',mimeType:'image/png',bytes})).rejects.toThrow();
 await expect(f.service.saveImage({...f.ref,fenceToken:'stale'},{...identity,mimeType:'image/png',bytes})).rejects.toThrow();
 expect(await f.service.recoverImage(f.ref,identity)).toEqual({status:'missing'});
 const saved=await f.service.saveImage(f.ref,{...identity,mimeType:'image/png',bytes});expect(await f.service.saveImage(f.ref,{...identity,mimeType:'image/png',bytes})).toEqual(saved);expect(await f.service.recoverImage(f.ref,identity)).toEqual(saved);
 const row=(await db.select().from(assets).where(eq(assets.id,saved.receipt.assetId)))[0]!;expect(row.status).toBe('pending');expect((await db.select().from(assetFiles).where(eq(assetFiles.assetId,row.id)))).toHaveLength(1);
 const imageReceipt={...receipt(turn.callId),text:'',images:[saved.receipt]};
 await expect(f.service.settle(f.ref,{callId:turn.callId,status:'settled',receipt:{...imageReceipt,images:[{...saved.receipt,checksum:'b'.repeat(64)}]}})).rejects.toThrow();
 await f.service.settle(f.ref,{callId:turn.callId,status:'settled',receipt:imageReceipt});await f.service.commit(f.ref,{callId:turn.callId});
 const rows=await f.rows();expect(rows.messages[1]?.parts).toEqual(expect.arrayContaining([expect.objectContaining({type:'tool-native.image',output:expect.objectContaining({kind:'native.image'})})]));expect((await db.select().from(assets).where(eq(assets.id,row.id)))[0]?.status).toBe('pending');
});

it('原生聊天图片真实item/turn/字节摘要保存回放与最终回执，跨turn及摘要替换拒绝',async()=>{
 const f=await fixture(true),turn=await f.service.reserve(f.ref,{}),thread='native-image-thread',providerTurnId='native-image-turn';
 await f.service.prepareThread(f.ref,{callId:turn.callId,sessionId:thread,protocolKind:'codex-app-server',protocolVersion:1});await f.service.start(f.ref,{callId:turn.callId,sessionId:thread,protocolKind:'codex-app-server',protocolVersion:1});await f.service.recordProviderTurn(f.ref,{callId:turn.callId,providerTurnId});
 const [row]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId)),payload={...row!.payload as object,codexCalls:{[turn.callId]:{threadId:thread,turnId:providerTurnId}}};await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,row!.id));
 const {createHash}=await import('node:crypto'),bytes=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]),nativeSource={providerTurnId,itemId:'actual-imageGeneration-item',checksum:createHash('sha256').update(bytes).digest('hex')},identity={callId:turn.callId,sessionId:thread,toolCallId:nativeSource.itemId,imageIndex:0,nativeSource};
 await expect(f.service.saveImage(f.ref,{...identity,nativeSource:{...nativeSource,providerTurnId:'foreign'},mimeType:'image/png',bytes})).rejects.toThrow();await expect(f.service.saveImage(f.ref,{...identity,nativeSource:{...nativeSource,checksum:'b'.repeat(64)},mimeType:'image/png',bytes})).rejects.toThrow();
 const saved=await f.service.saveImage(f.ref,{...identity,mimeType:'image/png',bytes});expect(await f.service.recoverImage(f.ref,identity)).toEqual(saved);
 const receipt={schemaVersion:1,engine:'codex',protocolKind:'codex-app-server',protocolVersion:1,sessionId:thread,turnId:turn.callId,providerTurnId,stopReason:'end_turn',text:'',images:[saved.receipt],usage:null};
 await f.service.settle(f.ref,{callId:turn.callId,status:'settled',receipt});await f.service.commit(f.ref,{callId:turn.callId});expect((await f.rows()).messages[1]?.parts).toEqual(expect.arrayContaining([expect.objectContaining({type:'tool-native.image'})]));
});

it('原图片附件public Assets服务读取真实字节，图片不存在/跨组仍拒绝归属',async()=>{
 const {createAccountGroupService}=await import('../platform-account'),{createAssetsService,createAssetRepository,createPendingGeneratedAssetService}=await import('../assets');
 const base={userId:'chat-image-group-owner',requestId:'group-image',source:'user' as const},deps={db,now,nextId:(p:string)=>`${p}-${++counter}`},groups=createAccountGroupService(deps),a=await groups.create(base,{name:'图片所属组',idempotencyKey:'image-a'}),b=await groups.create(base,{name:'另一组',idempotencyKey:'image-b'});
 const root=await mkdtemp(join(tmpdir(),'t1238-owned-image-'));storageRoots.push(root);const storage=createLocalFsObjectStorage({rootPath:root,publicBaseUrl:'/blob'},{nextKey:()=>`owned-${++counter}`}),objectStorageForCtx=async()=>storage,pending=createPendingGeneratedAssetService({...deps,objectStorageForCtx,authorize:async()=>{}}),bytes=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]),owner={...base,groupId:a.id};
 const image=await pending.submit(owner,{operationKey:'owned-chat-image',assetType:'image',mimeType:'image/png',name:'已授权图片',bytes}),assetsService=createAssetsService(createAssetRepository(db,deps),objectStorageForCtx,deps);expect((await assetsService.getAssetBytes(owner,image.assetId))?.bytes).toEqual(bytes);await expect(assetsService.getAssetBytes({...base,groupId:b.id},image.assetId)).rejects.toThrow();await expect(assetsService.getAssetBytes(owner,'missing-image')).rejects.toThrow();
});
