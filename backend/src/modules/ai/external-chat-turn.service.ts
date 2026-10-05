import { createHash,randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, asc, eq, aiTasks, aiMessages, aiConversations, aiTaskResults, executionTasks, executionCalls, executionStreamEvents, type Db } from "@creatoros/backend";
import { agenticToolOutcomeSchema, chatWorkerInputSchema, externalChatReceiptSchema, externalChatStartSchema, externalChatTurnStateSchema, externalTaskToolCallSchema, executionBudgetSchema, workerPortInputSchemas, type ExecutionRef } from "@creatoros/contract/execution-worker";
import { createExecutionLeaseService } from "../execution/execution-lease.service";
import { ConflictError, ExecutionBudgetError } from "../execution/execution.errors";
import { createAiRepository } from "./ai.repository";
import {createPendingGeneratedAssetService,type ObjectStorageForCtx} from "../assets";
import {readCommittedGeneratedAssetFile} from "../assets/generated-asset-candidate.service";
import { chatHistoryDigest, chatInputDigest } from "./chat-turn-submission.service";

const object=(value:unknown):Record<string,unknown>=>value && typeof value==="object" && !Array.isArray(value)?value as Record<string,unknown>:{};
type Tx=Parameters<Parameters<Db["transaction"]>[0]>[0];
type Task=typeof executionTasks.$inferSelect;
type Context={userId:string;accountId?:string|null};

/** 外部引擎使用独立真实回执；旧ACP仍可读，原生协议不可冒称Pi/ACP。 */
export function createExternalChatTurnService(db:Db,deps:{now?:()=>string;budget:{maxCalls:number;maxTokens:number;deadlineMs:number};objectStorageForCtx?:ObjectStorageForCtx}){
 const now=deps.now??(()=>new Date().toISOString()),leases=createExecutionLeaseService(db,{now});
 async function owner(tx:Tx,task:Task,context:Context,checkHistory=false){
  const payload=object(task.payload),frozen=chatWorkerInputSchema.parse(payload.modelInput),engine=frozen.executionEngine;
  if(task.kind!=="ai_task"||task.ownerType!=="ai_task"||(engine!=="codex"&&engine!=="codebuddy")||frozen.userId!==context.userId||frozen.accountId!==context.accountId)throw new ConflictError("外部聊天任务来源无效");
  const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),eq(aiTasks.accountId,context.accountId!))).for("update");
  const sourceInput=object(business?.inputData);
  if(!business||business.taskType!=="copilot.assist"||payload.aiTaskId!==business.id||sourceInput.kind!=="chat.run"||sourceInput.conversationId!==frozen.conversationId||sourceInput.sourceMessageId!==frozen.sourceMessageId||sourceInput.modelInputDigest!==chatInputDigest(frozen))throw new ConflictError("外部聊天冻结映射无效");
  if(!checkHistory)return {frozen,engine,business};
  const [conversation]=await tx.select().from(aiConversations).where(and(eq(aiConversations.id,frozen.conversationId),eq(aiConversations.userId,context.userId),eq(aiConversations.accountId,context.accountId!))).for("update");
  if(!conversation||conversation.projectId!==business.projectId)throw new ConflictError("外部聊天会话归属已变化");
  const messages=await tx.select().from(aiMessages).where(eq(aiMessages.conversationId,conversation.id)).orderBy(asc(aiMessages.createdAt));
  const sourceIndex=messages.findIndex(message=>message.id===frozen.sourceMessageId),source=messages[sourceIndex],history=messages.slice(0,sourceIndex+1);
  if(!source||source.role!=="user"||object(source.modelMetadata).chatTaskId!==business.id||JSON.stringify(history.map(message=>message.id))!==JSON.stringify(sourceInput.historyMessageIds)||chatHistoryDigest({conversation,messages:history,sourceMessage:source})!==sourceInput.historyDigest)throw new ConflictError("外部聊天会话来源已变化");
  return {frozen,engine,business,conversation,messages,source};
 }
 // SEMANTIC_BOUNDARY_ALLOW: 稳定事件摘要只固定幂等身份，不作内容选择。
 const imageKey=(callId:string,toolCallId:string,imageIndex:number)=>`chat-image-${createHash("sha256").update(JSON.stringify([callId,toolCallId,imageIndex])).digest("hex")}`;
 function imageAssets(ref:ExecutionRef,request:{callId:string;sessionId:string;toolCallId:string;imageIndex:number}){
  if(!deps.objectStorageForCtx)throw new ConflictError("聊天图片保存服务未就绪");
  const key=`execution-asset:${imageKey(request.callId,request.toolCallId,request.imageIndex)}`;
  return {key,service:createPendingGeneratedAssetService({db,now,objectStorageForCtx:deps.objectStorageForCtx,authorize:async(ctx,operationKey,tx)=>{
   if(key!==operationKey)throw new ConflictError("图片操作键不符");
   await createExecutionLeaseService(tx as unknown as Db,{now}).withLease(ref,"admission",async scope=>{await imageOwner(scope.tx,scope.task,scope.context,request);if(scope.context.userId!==ctx.userId||scope.context.accountId!==ctx.accountId)throw new ConflictError("图片账户不符");});
  }})};
 }
 async function imageOwner(tx:Tx,task:Task,context:Context,request:{callId:string;sessionId:string}){
  const {frozen}=await owner(tx,task,context,true),call=requireCall(await calls(tx,task.id),request.callId,task),start=externalChatStartSchema.parse(call.providerResult);
  if(!frozen.externalAgentBinding||start.protocolKind!=="acp"||start.sessionId!==request.sessionId||start.turnId!==call.id||!["started","unknown"].includes(call.status))throw new ConflictError("图片缺少本聊天原回合归属");
 }
 const calls=(tx:Tx,taskId:string)=>tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,taskId)).orderBy(asc(executionCalls.sequence));
 function state(call:typeof executionCalls.$inferSelect){
  const result=object(call.providerResult),receipt=call.status==="settled"?externalChatReceiptSchema.parse(call.providerResult):undefined;
  return externalChatTurnStateSchema.parse({callId:call.id,status:call.status,...(typeof result.sessionId==="string"?{sessionId:result.sessionId}:{}),...(typeof result.protocolVersion==="number"?{protocolVersion:result.protocolVersion}:{}),...(result.protocolKind?{protocolKind:result.protocolKind}:{}),...(result.providerTurnId?{providerTurnId:result.providerTurnId}:{}),...(receipt?{receipt}:{})});
 }
 function requireCall(rows:Awaited<ReturnType<typeof calls>>,callId:string,task:Task){
  const call=rows.find(row=>row.id===callId);
  if(!call||call.executionTaskId!==task.id||call.kind!=="external_agent"||call.parentCallId||rows.some(row=>row.id!==callId&&(row.kind!=="external_tool"||row.parentCallId!==callId)))throw new ConflictError("外部聊天回执引用无效");
  return call;
 }
 return {
  async reserve(ref:ExecutionRef,raw:unknown){
   workerPortInputSchemas.reserveExternalChatTurn.parse(raw);
   return leases.withLease(ref,"admission",async({tx,task,context})=>{
    const {frozen,business}=await owner(tx,task,context,true),existing=await calls(tx,task.id),key=`${frozen.operationKey}/external-turn/1`,digest=chatInputDigest(frozen);
    if(existing.length){const call=existing[0]!;if(call.kind!=="external_agent"||call.operationKey!==key||call.inputDigest!==digest||call.parentCallId||existing.some(row=>row.id!==call.id&&(row.kind!=="external_tool"||row.parentCallId!==call.id)))throw new ConflictError("外部聊天账本不一致");return state(call);}
    if(!["queued","running"].includes(business.status))throw new ConflictError("外部聊天任务已结束");
    const budget=executionBudgetSchema.parse(task.executionBudget??deps.budget);
    if(budget.maxCalls!==null&&budget.maxCalls<1)throw new ExecutionBudgetError("外部聊天调用预算不足");
    const stamp=now(),[call]=await tx.insert(executionCalls).values({id:`call_${randomUUID()}`,executionTaskId:task.id,sequence:1,operationKey:key,inputDigest:digest,kind:"external_agent",status:"reserved",reservedTokens:0,accountingBasis:"requests",createdAt:stamp,updatedAt:stamp}).returning();
    if(!call)throw new ConflictError("外部聊天回执预留失败");
    return state(call);
   });
  },
  async prepareThread(ref:ExecutionRef,raw:unknown){
   const request=workerPortInputSchemas.prepareExternalChatThread.parse(raw);
   return leases.withLease(ref,"admission",async({tx,task,context})=>{
    const {engine,frozen}=await owner(tx,task,context,true),call=requireCall(await calls(tx,task.id),request.callId,task);
    if(frozen.externalAgentBinding||engine!=="codex"||call.status!=="reserved")throw new ConflictError("原生线程只能预备未启动的Codex调用");
    const saved=object(call.providerResult);
    const prepared={schemaVersion:1,engine,sessionId:request.sessionId,protocolKind:request.protocolKind,protocolVersion:request.protocolVersion,status:"prepared"};
    if(Object.keys(saved).length && !isDeepStrictEqual(saved,prepared))throw new ConflictError("预备线程不可替换");
    const [updated]=await tx.update(executionCalls).set({providerResult:prepared,updatedAt:now()}).where(eq(executionCalls.id,call.id)).returning();
    return state(updated!);
   });
  },
  async recordProviderTurn(ref:ExecutionRef,raw:unknown){
   const request=workerPortInputSchemas.recordExternalChatProviderTurn.parse(raw);
   return leases.withLease(ref,"settlement",async({tx,task,context})=>{
    await owner(tx,task,context);const call=requireCall(await calls(tx,task.id),request.callId,task);
    const start=externalChatStartSchema.parse(call.providerResult);
    if(!["started","unknown"].includes(call.status)||!["codex-app-server","acp"].includes(start.protocolKind??"")||start.engine!=="codex"||(start.providerTurnId && start.providerTurnId!==request.providerTurnId))throw new ConflictError("原生回合ID不可替换或缺少入场回执");
    const [updated]=await tx.update(executionCalls).set({providerResult:{...start,providerTurnId:request.providerTurnId},updatedAt:now()}).where(eq(executionCalls.id,call.id)).returning();
    return state(updated!);
   });
  },
  async start(ref:ExecutionRef,raw:unknown){
   const request=workerPortInputSchemas.startExternalChatTurn.parse(raw);
   return leases.withLease(ref,"admission",async({tx,task,context})=>{
    const {engine,frozen}=await owner(tx,task,context,true),call=requireCall(await calls(tx,task.id),request.callId,task);
    if(engine==="codex"&&!frozen.externalAgentBinding&&request.protocolKind!=="codex-app-server")throw new ConflictError("旧任务冻结原生协议不可替换");
    if(frozen.externalAgentBinding && (request.protocolKind!=="acp"||request.protocolVersion!==1))throw new ConflictError("任务冻结ACP协议不可替换");
    if(call.status!=="reserved")throw new ConflictError("外部聊天调用不可重复启动");
    const prepared=object(call.providerResult);
    if(request.protocolKind==="codex-app-server" && (engine!=="codex"||prepared.status!=="prepared"||prepared.sessionId!==request.sessionId||prepared.protocolVersion!==request.protocolVersion||prepared.protocolKind!==request.protocolKind))throw new ConflictError("原生线程预备回执缺失或不匹配");
    if(prepared.protocolKind==="codex-app-server"&&request.protocolKind!=="codex-app-server")throw new ConflictError("不能将原生回执降为旧协议");
    const start=externalChatStartSchema.parse({schemaVersion:1,engine,...(request.protocolKind?{protocolKind:request.protocolKind}:{}),protocolVersion:request.protocolVersion,sessionId:request.sessionId,turnId:call.id,status:"started"});
    const [updated]=await tx.update(executionCalls).set({status:"started",startedAttempt:ref.attempt,providerResult:start,updatedAt:now()}).where(eq(executionCalls.id,call.id)).returning();
    return state(updated!);
   });
  },
  async saveImage(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
   const request=workerPortInputSchemas.saveExternalChatImage.parse(raw);
   const context=await leases.withLease(ref,"admission",async({tx,task,context})=>{await imageOwner(tx,task,context,request);return context;});
   const {service,key}=imageAssets(ref,request);
   const receipt=await service.submit(context,{operationKey:key,assetType:"image",mimeType:request.mimeType,name:"Codex 生成图片",bytes:request.bytes},signal);
   return {status:"committed",receipt:{toolCallId:request.toolCallId,imageIndex:request.imageIndex,...receipt}};
  },
  async recoverImage(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
   const request=workerPortInputSchemas.recoverExternalChatImage.parse(raw);
   const context=await leases.withLease(ref,"settlement",async({tx,task,context})=>{await imageOwner(tx,task,context,request);return context;});
   const {service,key}=imageAssets(ref,request),saved=await service.recover(context,key,signal);
   return saved.status==="committed"?{status:"committed",receipt:{toolCallId:request.toolCallId,imageIndex:request.imageIndex,...saved.receipt}}:saved;
  },
  async settle(ref:ExecutionRef,raw:unknown){
   const request=workerPortInputSchemas.settleExternalChatTurn.parse(raw);
   return leases.withLease(ref,"settlement",async({tx,task,context})=>{
    const {engine,frozen}=await owner(tx,task,context),call=requireCall(await calls(tx,task.id),request.callId,task);
    if(call.inputDigest!==chatInputDigest(frozen))throw new ConflictError("外部聊天调用输入已变化");
    if(call.status==="reserved"){
      if(request.status!=="rejected")throw new ConflictError("外部聊天尚未启动，不能结算");
      const [updated]=await tx.update(executionCalls).set({status:"rejected",rejectionCode:request.rejectionCode,updatedAt:now()}).where(eq(executionCalls.id,call.id)).returning();
      return state(updated!);
    }
    if(call.status==="settled"){
      if(request.status!=="settled"||!isDeepStrictEqual(call.providerResult,request.receipt))throw new ConflictError("已结算的外部回执不可改写");
      return state(call);
    }
    if(call.status==="rejected"){
      if(request.status!=="rejected"||request.rejectionCode!==call.rejectionCode)throw new ConflictError("已拒绝的外部回执不可改写");
      return state(call);
    }
    const start=externalChatStartSchema.parse(call.providerResult);
    if(start.engine!==engine||start.turnId!==call.id)throw new ConflictError("外部聊天启动回执无效");
    if(request.status==="settled"){
      const receipt=externalChatReceiptSchema.parse(request.receipt);
      if(receipt.engine!==engine||receipt.turnId!==call.id||receipt.protocolVersion!==start.protocolVersion||receipt.sessionId!==start.sessionId||receipt.stopReason==="cancelled")throw new ConflictError("外部聊天最终回执与启动事实不符");
      if(receipt.protocolKind!==start.protocolKind||receipt.providerTurnId!==start.providerTurnId||(start.protocolKind==="codex-app-server"&&!start.providerTurnId))throw new ConflictError("供应商原生回合尚未核验或被替换");
      const imageIds=new Set<string>();
      for(const image of receipt.images??[]){
       const {toolCallId,imageIndex,...assetReceipt}=image,key=imageKey(call.id,toolCallId,imageIndex);
       if(start.protocolKind!=="acp"||!frozen.externalAgentBinding||imageIds.has(key))throw new ConflictError("图片回执协议或事件不符");imageIds.add(key);
       await readCommittedGeneratedAssetFile(tx as unknown as Db,context as import("@creatoros/contract").RequestContext,key,assetReceipt);
      }
      if((await calls(tx,task.id)).some(row=>row.id!==call.id&&!["settled","rejected"].includes(row.status)))throw new ConflictError("子工具回执尚未确认");
      // ACP Usage 仍为协议不稳定字段；totalTokens 是所有 token 类型之和，
      // 真实 Codex 会把 cachedReadTokens 单列，不能强制 input+output==total。
      const usage=receipt.usage,totalTokens=usage?.totalTokens??null;
      const [updated]=await tx.update(executionCalls).set({status:"settled",providerResult:receipt,resultText:receipt.text,usage,totalTokens,updatedAt:now()}).where(eq(executionCalls.id,call.id)).returning();
      return state(updated!);
    }
    if(request.status==="rejected"&&call.status!=="started")throw new ConflictError("结果未知后不能宣称未执行拒绝");
    const [updated]=await tx.update(executionCalls).set({status:request.status,rejectionCode:request.status==="rejected"?request.rejectionCode:null,updatedAt:now()}).where(eq(executionCalls.id,call.id)).returning();
    return state(updated!);
   });
  },
  async commit(ref:ExecutionRef,raw:unknown){
   const {callId}=workerPortInputSchemas.commitExternalChatResult.parse(raw);
   return leases.withLease(ref,"settlement",async({tx,task,context})=>{
    const {frozen,engine,business,conversation,messages,source}=await owner(tx,task,context,true);
    if(!conversation||!messages||!source)throw new ConflictError("外部聊天来源不完整");
    const allCalls=await calls(tx,task.id),call=requireCall(allCalls,callId,task),receipt=externalChatReceiptSchema.parse(call.providerResult);
    const toolCards:Array<{callId:string;toolCallId:string;toolName:string;output:unknown;part:Record<string,unknown>}>=[];
    for(const tool of allCalls.filter(row=>row.id!==call.id)){
      if(tool.status!=="settled"||!tool.resultText)throw new ConflictError("外部聊天工具结果尚未确认");
      const identity=externalTaskToolCallSchema.parse(tool.providerResult),outcome=agenticToolOutcomeSchema.parse(JSON.parse(tool.resultText));
      if(identity.turnCallId!==call.id||tool.parentCallId!==call.id||!["none","proposal"].includes(outcome.sideEffect))throw new ConflictError("外部聊天工具回执归属或效果无效");
      // 候选与读取结果来自已结算的宿主工具回执，不能只依赖 Agent 正文自述。
      const output=outcome.data && typeof outcome.data==="object" && !Array.isArray(outcome.data)
        ? outcome.data : {kind:identity.toolName,error:outcome.summary};
      toolCards.push({callId:tool.id,toolCallId:identity.toolCallId,toolName:identity.toolName,output,
        part:{type:`tool-${identity.toolName}`,toolCallId:identity.toolCallId,state:"output-available",input:{},output}});
    }
    if(call.status!=="settled"||call.inputDigest!==chatInputDigest(frozen)||receipt.engine!==engine||receipt.turnId!==call.id||call.resultText!==receipt.text)throw new ConflictError("外部聊天缺少已结算的真实回执");
    const resultId=`chat:${business.id}`,messageId=`chat:${source.id}`,outcome=receipt.stopReason==="end_turn"?"succeeded" as const:"partial" as const;
    for(const image of receipt.images??[]){const key=imageKey(call.id,image.toolCallId,image.imageIndex),output={kind:"native.image",asset:{id:image.assetId,name:image.name,previewUrl:null,sourceUrl:""},fileId:image.fileId};toolCards.push({callId:call.id,toolCallId:key,toolName:"native.image",output,part:{type:"tool-native.image",toolCallId:key,state:"output-available",input:{},output}});}
    const parts=[{type:"step-start"},...toolCards.map(card=>card.part),{type:"text",text:receipt.text,state:"done"}],metadata={chatTaskId:business.id,sourceMessageId:source.id,actualEngine:engine,protocolVersion:receipt.protocolVersion,...(receipt.protocolKind?{protocolKind:receipt.protocolKind}:{}),...(receipt.providerTurnId?{providerTurnId:receipt.providerTurnId}:{}),sessionId:receipt.sessionId,turnId:receipt.turnId,stopReason:receipt.stopReason,completeness:outcome==="succeeded"?"completed":"partial"};
    const resultData={conversationId:conversation.id,sourceMessageId:source.id,messageId,actualEngine:engine,protocolVersion:receipt.protocolVersion,...(receipt.protocolKind?{protocolKind:receipt.protocolKind}:{}),...(receipt.providerTurnId?{providerTurnId:receipt.providerTurnId}:{}),sessionId:receipt.sessionId,turnId:receipt.turnId,stopReason:receipt.stopReason,completeness:metadata.completeness};
    const [existing]=await tx.select().from(aiTaskResults).where(eq(aiTaskResults.id,resultId));
    if(existing){const saved=messages.find(message=>message.id===messageId);if(existing.aiTaskId!==business.id||existing.executionCallId!==call.id||chatInputDigest(existing.resultData)!==chatInputDigest(resultData)||!saved||saved.role!=="assistant"||saved.content!==receipt.text||chatInputDigest(saved.parts)!==chatInputDigest(parts)||chatInputDigest(saved.modelMetadata)!==chatInputDigest(metadata)||call.resultRef!==resultId||business.status!==outcome||task.status!==outcome)throw new ConflictError("外部聊天完成回执不一致");return {resultId,aiTaskId:business.id,messageId,outcome};}
    const stamp=now();if(call.resultRef||task.status!=="running"||!task.leaseOwner||!task.leaseExpiresAt||Date.parse(task.leaseExpiresAt)<=Date.parse(stamp)||(task.deadlineAt&&Date.parse(task.deadlineAt)<=Date.parse(stamp))||!["queued","running"].includes(business.status))throw new ConflictError("外部聊天当前不可提交");
    const events=await tx.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,task.id)).orderBy(asc(executionStreamEvents.sequence));
    if(events.some(event=>object(event.chunk).type==="finish"))throw new ConflictError("外部聊天结束事件已存在");
    const repo=createAiRepository(tx as unknown as Db,{now:()=>stamp,nextId:()=>messageId,userId:context.userId,accountId:context.accountId!});
    await repo.createMessage(conversation.id,{role:"assistant",content:receipt.text,parts,attachments:[],modelMetadata:metadata,usage:{inputTokens:receipt.usage?.inputTokens??null,outputTokens:receipt.usage?.outputTokens??null,cachedTokens:receipt.usage?.cachedReadTokens??null}});
    await tx.insert(aiTaskResults).values({id:resultId,aiTaskId:business.id,resultType:"conversation_reply",executionCallId:call.id,resultData});
    await tx.update(executionCalls).set({resultRef:resultId,updatedAt:stamp}).where(eq(executionCalls.id,call.id));
    await tx.update(aiTasks).set({status:outcome,completedAt:stamp,errorMessage:null,leaseOwner:null,leaseToken:null,leaseExpiresAt:null}).where(eq(aiTasks.id,business.id));
    let sequence=events.at(-1)?.sequence??0;
    const indices=new Map<string,number>();
    for(const event of events)indices.set(event.callId,Math.max(indices.get(event.callId)??-1,event.callIndex));
    const append=(callId:string,chunk:Record<string,unknown>)=>({executionTaskId:task.id,sequence:++sequence,callId,callIndex:(indices.set(callId,(indices.get(callId)??-1)+1),indices.get(callId)!),chunk,createdAt:stamp});
    const streamRows=toolCards.flatMap(card=>[
      append(call.id,{type:"tool-input-available",toolCallId:card.toolCallId,toolName:card.toolName,input:{}}),
      append(card.callId,{type:"tool-output-available",toolCallId:card.toolCallId,output:card.output}),
    ]);
    // 实际正文沿UI消息协议交付；进程 progress 仅用于任务进度，不能代替正文事件。
    const textId=`external-${call.id}`;
    streamRows.push(append(call.id,{type:"text-start",id:textId}),append(call.id,{type:"text-delta",id:textId,delta:receipt.text}),append(call.id,{type:"text-end",id:textId}));
    streamRows.push(append(call.id,{type:"finish",finishReason:receipt.stopReason==="end_turn"?"stop":receipt.stopReason==="max_tokens"?"length":"other",messageMetadata:metadata}));
    await tx.insert(executionStreamEvents).values(streamRows);
    await tx.update(executionTasks).set({status:outcome,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,retryAt:null,retryOfCallId:null,lastErrorCode:null,lastErrorMessage:null,updatedAt:stamp}).where(eq(executionTasks.id,task.id));
    return {resultId,aiTaskId:business.id,messageId,outcome};
   });
  },
 };
}
