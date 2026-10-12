import {recoverExternalChatChildren} from './external-chat-recovery';
import type {SessionNotification} from '@agentclientprotocol/sdk';
import {z} from 'zod';
import {chatWorkerInputSchema,externalChatTurnStateSchema,externalChatReceiptSchema,externalTaskToolListSchema,type WorkerPort} from '@creatoros/contract/execution-worker';
import {createCodexAcpHost} from './codex-acp-host';
import {startExternalTaskMcpBridge} from './external-task-mcp-bridge';
import {createExternalChatImages} from './external-chat-images';
import {externalAgentWorkingDirectory,externalChatPrompt} from './external-chat-worker-run';
import {createExternalChatToolConsumer} from './external-chat-tools';
import {GenerationFailure} from './generation-error';
import {CodexHostError,createControlledCodexSession} from './codex-app-server';
import {recoverCodexNativeTurn} from './codex-native-turn';
import {saveNativeChatImages} from './external-chat-native-images';
type Call=(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>;
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
/** 使用复用客户端；任务权威与入场/结算全部在原后台。 */
export async function runCodexAcpInWorker(input:z.infer<typeof chatWorkerInputSchema>,signal:AbortSignal,call:Call,onText?:(text:string)=>void|Promise<void>){
 const reservation=externalChatTurnStateSchema.parse(await call('reserveExternalChatTurn',{},signal));
 if(reservation.status==='settled')return {callId:reservation.callId};
 if((reservation.status==='started'||reservation.status==='unknown')&&reservation.protocolKind==='acp'&&reservation.sessionId&&reservation.providerTurnId){
  const binding=await call('readCodexCall',{callId:reservation.callId},signal) as {threadId?:string;turnId?:string};
  if(binding.threadId!==reservation.sessionId||binding.turnId!==reservation.providerTurnId)throw new GenerationFailure('unknown_result','CODEX_ACP_RESTORE_REQUIRES_RECONCILIATION');
  const cwd=await externalAgentWorkingDirectory(input),session=await createControlledCodexSession(cwd,signal);
  try{
   await recoverExternalChatChildren(signal,call);
   const recovered=await recoverCodexNativeTurn(session.rpc,reservation.sessionId,reservation.providerTurnId,signal),imageResult=await saveNativeChatImages(recovered,reservation.callId,signal,call,'acp');
   const receipt=externalChatReceiptSchema.parse({schemaVersion:1,engine:'codex',protocolKind:'acp',protocolVersion:reservation.protocolVersion??1,sessionId:reservation.sessionId,turnId:reservation.callId,providerTurnId:reservation.providerTurnId,stopReason:'end_turn',text:recovered.text,...imageResult,usage:null});
   const saved=externalChatTurnStateSchema.parse(await call('settleExternalChatTurn',{callId:reservation.callId,status:'settled',receipt},signal));
   if(saved.callId!==reservation.callId||saved.status!=='settled')throw new CodexHostError('CODEX_SETTLEMENT_RECEIPT_UNKNOWN');
   return {callId:reservation.callId};
  }catch(error){throw new GenerationFailure('unknown_result',error instanceof CodexHostError?error.code:'CODEX_ACP_RESTORE_REQUIRES_RECONCILIATION');}
  finally{await session.rpc.close();}
 }
 if(reservation.status!=='reserved'||reservation.sessionId)throw new GenerationFailure('unknown_result','CODEX_ACP_RESTORE_REQUIRES_RECONCILIATION');
 let owned:Awaited<ReturnType<typeof createCodexAcpHost>>|undefined,bridge:Awaited<ReturnType<typeof startExternalTaskMcpBridge>>|undefined,admitted=false,text='',updates=Promise.resolve(),images:ReturnType<typeof createExternalChatImages>|undefined,sessionId:string|undefined;
 let providerTurnId:string|undefined,hasNativeUsage=false;
 const consumer=createExternalChatToolConsumer(input,reservation.callId,signal,call);
 const bridgeCall:Call=async(port,data,s)=>{
  if(port==='executeExternalTaskTool'){const request=object(data);if(request.turnCallId!==reservation.callId)throw new CodexHostError('CODEX_TOOL_UNAVAILABLE');if(typeof request.toolName==='string'&&typeof request.toolCallId==='string'&&consumer.handles(request.toolName))return consumer.run(request.toolCallId,request.toolName,request.input,s);}
  return call(port,data,s);
 };
 async function recordTurn(raw:unknown){
  const native=object(raw),id=typeof native.turnId==='string'&&native.threadId===sessionId&&native.turnId.trim()?native.turnId:undefined;
  if(!id)return;
  if(providerTurnId===id)return;
  if(providerTurnId)throw new CodexHostError('CODEX_TURN_RECEIPT_UNKNOWN');
  const saved=externalChatTurnStateSchema.parse(await call('recordExternalChatProviderTurn',{callId:reservation.callId,providerTurnId:id}));
  if(saved.callId!==reservation.callId||saved.providerTurnId!==id)throw new CodexHostError('CODEX_TURN_RECEIPT_UNKNOWN');
  await call('bindCodexCall',{callId:reservation.callId,threadId:sessionId,turnId:id});
  providerTurnId=id;
 }
 const accept=(notification:SessionNotification)=>{
  if(notification.sessionId!==sessionId)return;
  const update=object(notification.update);
  if(update.sessionUpdate==='agent_message_chunk'&&object(update.content).type==='text'&&typeof object(update.content).text==='string'){
   const chunk=String(object(update.content).text);text+=chunk;updates=updates.then(async()=>{await onText?.(chunk);});
  }
  const native=object(object(object(update._meta).creatoros).codex);
  if(admitted&&native.threadId===sessionId){updates=updates.then(async()=>{
   await recordTurn(native);
   const usage=object(native.usage);
   if(providerTurnId&&native.turnId===providerTurnId&&['inputTokens','outputTokens','totalTokens'].every(key=>typeof usage[key]==='number'&&Number.isSafeInteger(usage[key])&&(usage[key] as number)>=0)){
    hasNativeUsage=true;const saved=await call('bindCodexCall',{callId:reservation.callId,observedUsage:{inputTokens:usage.inputTokens,outputTokens:usage.outputTokens,totalTokens:usage.totalTokens}}) as {budgetExceeded?:boolean};
    if(saved.budgetExceeded===true){await owned?.client.cancel(sessionId!);throw new CodexHostError('CODEX_TOKEN_BUDGET_EXCEEDED');}
   }
  });}
  // 回调同步排队；异常由随后 await updates 传播，避免未处理拒绝。
  void updates.catch(()=>{});
  images?.accept(notification);
 };
 const cancel=()=>{if(owned&&sessionId)void owned.client.cancel(sessionId).catch(()=>{});};
 try{
  const cwd=await externalAgentWorkingDirectory(input),inputImages:Array<{url:string}>=[],prompt=externalChatPrompt(input,inputImages);
  const promptInput=inputImages.length?[{type:'text' as const,text:prompt},...inputImages.map(({url})=>{const comma=url.indexOf(',');return {type:'image' as const,mimeType:url.slice(5,comma-7),data:url.slice(comma+1)};})]:prompt;
  const tools=externalTaskToolListSchema.parse(await call('listExternalTaskTools',{},signal)).tools;
  const profile=input.externalAgentBinding?.policy??'creatoros-acp-readonly-v1';
  if(tools.length||profile==='creatoros-acp-readonly-v1')bridge=await startExternalTaskMcpBridge({turnCallId:reservation.callId,signal,call:bridgeCall});
  owned=await createCodexAcpHost(cwd,signal,bridge?[bridge.configuration]:[],tools.map(tool=>tool.name),accept,profile);
  const session=await owned.client.createSession(cwd,{signal});sessionId=session.sessionId;
  images=createExternalChatImages({cwd,callId:reservation.callId,sessionId,signal,call});
  // 在任何 prompt 字节前等待持久入场；不能以 onRequestWritten 回调代替。
  admitted=true;
  const start=externalChatTurnStateSchema.parse(await call('startExternalChatTurn',{callId:reservation.callId,sessionId,protocolKind:'acp',protocolVersion:owned.protocolVersion},signal));
  if(start.callId!==reservation.callId||start.status!=='started'||start.sessionId!==sessionId)throw new CodexHostError('CODEX_START_RECEIPT_UNKNOWN');
  await call('bindCodexCall',{callId:reservation.callId,threadId:sessionId},signal);
  signal.addEventListener('abort',cancel,{once:true});signal.throwIfAborted();
  const result=await owned.client.prompt(sessionId,promptInput,undefined,undefined,owned.onPermissionRequest,{signal});
  // 复用客户端自己的通知排空，随后才等待宿主文字/图片队列。
  await owned.client.waitForSessionUpdatesIdle({idleMs:0,timeoutMs:120_000});
  await updates;const imageResult=await images.flush();
  await recordTurn(object(object(result._meta?.creatoros).codex));
  if(result.usage&&!hasNativeUsage){const saved=await call('bindCodexCall',{callId:reservation.callId,observedUsage:{inputTokens:result.usage.inputTokens??undefined,outputTokens:result.usage.outputTokens??undefined,totalTokens:result.usage.totalTokens??undefined}}) as {budgetExceeded?:boolean};if(saved.budgetExceeded===true)throw new CodexHostError('CODEX_TOKEN_BUDGET_EXCEEDED');}
  signal.throwIfAborted();
  if(result.stopReason==='cancelled')throw new CodexHostError('CODEX_ACP_CANCELLED');
  if(!text.trim()&&!imageResult.images.length)throw new CodexHostError('CODEX_ACP_EMPTY_OUTPUT');
  if(imageResult.imageFailures.length)text+='\n\n部分图片未能保存，请在 CreatorOS 中重新生成这些图片。';
  const receipt=externalChatReceiptSchema.parse({schemaVersion:1,engine:'codex',protocolKind:'acp',protocolVersion:owned.protocolVersion,sessionId,turnId:reservation.callId,...(providerTurnId?{providerTurnId}:{}),stopReason:result.stopReason,text,...imageResult,usage:result.usage??null});
  const saved=externalChatTurnStateSchema.parse(await call('settleExternalChatTurn',{callId:reservation.callId,status:'settled',receipt},signal));
  if(saved.status!=='settled'||saved.callId!==reservation.callId)throw new CodexHostError('CODEX_SETTLEMENT_RECEIPT_UNKNOWN');
  return {callId:reservation.callId};
 }catch(error){
  // 断线时也保留已经实际收到的 provider turn，不能重新发送未知回合。
  if(owned)await owned.client.waitForSessionUpdatesIdle({idleMs:0,timeoutMs:120_000}).catch(()=>{});
  await updates.catch(()=>{});
  const code=error instanceof CodexHostError?error.code:error instanceof GenerationFailure?error.errorCode:'CODEX_ACP_HOST_FAILED';
  try{await call('settleExternalChatTurn',admitted?{callId:reservation.callId,status:'unknown'}:{callId:reservation.callId,status:'rejected',rejectionCode:code});}catch{/* 原账本对账。 */}
  throw new GenerationFailure(admitted?'unknown_result':'waiting_user',code);
 }finally{
  signal.removeEventListener('abort',cancel);
  // 单项清理异常不能跳过其余资源，也不能改写后台已经持久的结果。
  await Promise.allSettled([owned?.client.close(),images?.flush(),bridge?.close(),consumer.close()]);
 }
}
