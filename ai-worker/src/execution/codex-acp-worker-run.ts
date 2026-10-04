import type {SessionNotification} from '@agentclientprotocol/sdk';
import {z} from 'zod';
import {chatWorkerInputSchema,externalChatTurnStateSchema,externalChatReceiptSchema,externalTaskToolListSchema,type WorkerPort} from '@creatoros/contract/execution-worker';
import {createCodexAcpHost} from './codex-acp-host';
import {startExternalTaskMcpBridge} from './external-task-mcp-bridge';
import {createExternalChatImages} from './external-chat-images';
import {externalAgentWorkingDirectory,externalChatPrompt} from './external-chat-worker-run';
import {GenerationFailure} from './generation-error';
import {CodexHostError} from './codex-app-server';
type Call=(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>;
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
/** 使用复用客户端；任务权威与入场/结算全部在原后台。 */
export async function runCodexAcpInWorker(input:z.infer<typeof chatWorkerInputSchema>,signal:AbortSignal,call:Call,onText?:(text:string)=>void|Promise<void>){
 const reservation=externalChatTurnStateSchema.parse(await call('reserveExternalChatTurn',{},signal));
 if(reservation.status==='settled')return {callId:reservation.callId};
 if(reservation.status!=='reserved'||reservation.sessionId)throw new GenerationFailure('unknown_result','CODEX_ACP_RESTORE_REQUIRES_RECONCILIATION');
 let owned:Awaited<ReturnType<typeof createCodexAcpHost>>|undefined,bridge:Awaited<ReturnType<typeof startExternalTaskMcpBridge>>|undefined,admitted=false,text='',updates=Promise.resolve(),images:ReturnType<typeof createExternalChatImages>|undefined,sessionId:string|undefined;
 let providerTurnId:string|undefined;
 async function recordTurn(raw:unknown){
  const native=object(raw),id=typeof native.turnId==='string'&&native.threadId===sessionId&&native.turnId.trim()?native.turnId:undefined;
  if(!id)return;
  if(providerTurnId===id)return;
  if(providerTurnId)throw new CodexHostError('CODEX_TURN_RECEIPT_UNKNOWN');
  const saved=externalChatTurnStateSchema.parse(await call('recordExternalChatProviderTurn',{callId:reservation.callId,providerTurnId:id}));
  if(saved.callId!==reservation.callId||saved.providerTurnId!==id)throw new CodexHostError('CODEX_TURN_RECEIPT_UNKNOWN');
  providerTurnId=id;
 }
 const accept=(notification:SessionNotification)=>{
  if(notification.sessionId!==sessionId)return;
  const update=object(notification.update);
  if(update.sessionUpdate==='agent_message_chunk'&&object(update.content).type==='text'&&typeof object(update.content).text==='string'){
   const chunk=String(object(update.content).text);text+=chunk;updates=updates.then(async()=>{await onText?.(chunk);});
  }
  const native=object(object(object(update._meta).creatoros).codex);
  if(admitted&&native.threadId===sessionId){updates=updates.then(()=>recordTurn(native));}
  // 回调同步排队；异常由随后 await updates 传播，避免未处理拒绝。
  void updates.catch(()=>{});
  images?.accept(notification);
 };
 const cancel=()=>{if(owned&&sessionId)void owned.client.cancel(sessionId).catch(()=>{});};
 try{
  const cwd=await externalAgentWorkingDirectory(input),prompt=externalChatPrompt(input);
  bridge=await startExternalTaskMcpBridge({turnCallId:reservation.callId,signal,call});
  const tools=externalTaskToolListSchema.parse(await call('listExternalTaskTools',{},signal)).tools;
  owned=await createCodexAcpHost(cwd,signal,[bridge.configuration],tools.map(tool=>tool.name),accept);
  const session=await owned.client.createSession(cwd,{signal});sessionId=session.sessionId;
  images=createExternalChatImages({cwd,callId:reservation.callId,sessionId,signal,call});
  // 在任何 prompt 字节前等待持久入场；不能以 onRequestWritten 回调代替。
  admitted=true;
  const start=externalChatTurnStateSchema.parse(await call('startExternalChatTurn',{callId:reservation.callId,sessionId,protocolKind:'acp',protocolVersion:owned.protocolVersion},signal));
  if(start.callId!==reservation.callId||start.status!=='started'||start.sessionId!==sessionId)throw new CodexHostError('CODEX_START_RECEIPT_UNKNOWN');
  signal.addEventListener('abort',cancel,{once:true});signal.throwIfAborted();
  const result=await owned.client.prompt(sessionId,prompt,undefined,undefined,async()=>({outcome:'cancel'}),{signal});
  // 复用客户端自己的通知排空，随后才等待宿主文字/图片队列。
  await owned.client.waitForSessionUpdatesIdle({idleMs:0,timeoutMs:10_000});
  await updates;const imageResult=await images.flush();
  await recordTurn(object(object(result._meta?.creatoros).codex));
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
  if(owned)await owned.client.waitForSessionUpdatesIdle({idleMs:0,timeoutMs:10_000}).catch(()=>{});
  await updates.catch(()=>{});
  const code=error instanceof CodexHostError?error.code:error instanceof GenerationFailure?error.errorCode:'CODEX_ACP_HOST_FAILED';
  try{await call('settleExternalChatTurn',admitted?{callId:reservation.callId,status:'unknown'}:{callId:reservation.callId,status:'rejected',rejectionCode:code});}catch{/* 原账本对账。 */}
  throw new GenerationFailure(admitted?'unknown_result':'waiting_user',code);
 }finally{
  signal.removeEventListener('abort',cancel);
  // 单项清理异常不能跳过其余资源，也不能改写后台已经持久的结果。
  await Promise.allSettled([owned?.client.close(),images?.flush(),bridge?.close()]);
 }
}
