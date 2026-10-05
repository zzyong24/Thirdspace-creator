import {createHash} from 'node:crypto';
import {lstat,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {z} from 'zod';
import {chatWorkerInputSchema,chatToolProviderName,externalChatTurnStateSchema,externalChatReceiptSchema,externalTaskToolListSchema,externalTaskToolResultSchema,type WorkerPort} from '@creatoros/contract/execution-worker';
import {createControlledCodexSession,CodexHostError} from './codex-app-server';
import {runCodexNativeTurn,recoverCodexNativeTurn} from './codex-native-turn';
import {runCodexAcpInWorker} from './codex-acp-worker-run';
import {GenerationFailure} from './generation-error';
type ChatInput=z.infer<typeof chatWorkerInputSchema>;
type Call=(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>;
/** 私有空cwd避免项目文件自动进入上下文；不把目录本身当权限边界。 */
export async function externalAgentWorkingDirectory(input:Pick<ChatInput,'userId'|'accountId'|'sourceMessageId'>){
 const key=createHash('sha256').update(JSON.stringify([input.userId,input.accountId,input.sourceMessageId])).digest('hex');
 const root=join(tmpdir(),'creatoros-native-codex-workspaces');
 for(const path of [root,join(root,key)]){
  try{await mkdir(path,{mode:0o700});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  const stat=await lstat(path);
  if(!stat.isDirectory()||(process.getuid&&stat.uid!==process.getuid())||(stat.mode&0o077)!==0)throw new GenerationFailure('waiting_user','CODEX_WORKSPACE_UNSAFE');
 }
 return join(root,key);
}
export function externalChatPrompt(input:ChatInput){
 const blocks=['CreatorOS 本地编导：仅依据本轮动态工具和真实回执说明动作。不要输出内部推理、编造系统配置故障或称未采纳候选已正式保存。工具缺失时说明当前动作未完成并给下一步。',`任务说明：\n${input.system}`];
 for(const message of input.messages){
  const content=message.content;
  if(typeof content!=='string'&&(!Array.isArray(content)||content.some(part=>!part||typeof part!=='object'||(part as {type?:unknown}).type!=='text'||typeof (part as {text?:unknown}).text!=='string')))throw new GenerationFailure('waiting_user','CODEX_INPUT_MODALITY_UNSUPPORTED');
  blocks.push(`${message.role}：\n${typeof content==='string'?content:(content as {text:string}[]).map(part=>part.text).join('\n')}`);
 }
 return blocks.join('\n\n');
}
export async function runExternalChatInWorker(raw:ChatInput,signal:AbortSignal,call:Call,onText?:(text:string)=>void|Promise<void>):Promise<{callId:string}>{
 const input=chatWorkerInputSchema.parse(raw);
 if(input.externalAgentBinding)return runCodexAcpInWorker(input,signal,call,onText);
 if(input.executionEngine!=='codex')throw new GenerationFailure('waiting_user','CODEX_ENGINE_UNAVAILABLE');
 const prompt=externalChatPrompt(input),cwd=await externalAgentWorkingDirectory(input);
 const reservation=externalChatTurnStateSchema.parse(await call('reserveExternalChatTurn',{},signal));
 if(reservation.status==='settled')return {callId:reservation.callId};
 if(reservation.status==='rejected')throw new GenerationFailure('waiting_user','CODEX_PREVIOUS_TURN_REJECTED');
 if(reservation.status==='reserved'&&reservation.sessionId)throw new GenerationFailure('waiting_user','CODEX_PREPARED_THREAD_REQUIRES_RECONCILIATION');
 const owned=await createControlledCodexSession(cwd,signal);
 let admission=false;
 try{
  let result;
  if(reservation.status==='started'||reservation.status==='unknown'){
   admission=true;
   if(reservation.protocolKind!=='codex-app-server'||!reservation.sessionId||!reservation.providerTurnId)throw new CodexHostError('CODEX_TURN_RESULT_UNKNOWN');
   result=await recoverCodexNativeTurn(owned.rpc,reservation.sessionId,reservation.providerTurnId);
  }else{
   if(!owned.authenticated)throw new CodexHostError('CODEX_LOGIN_REQUIRED');
   const definitions=externalTaskToolListSchema.parse(await call('listExternalTaskTools',{},signal)).tools;
   const tools=definitions.map(tool=>({name:chatToolProviderName(tool.name),description:tool.description,inputSchema:tool.inputSchema}));
   const names=new Map(definitions.map(tool=>[chatToolProviderName(tool.name),tool.name]));
   result=await runCodexNativeTurn({rpc:owned.rpc,mcpNames:owned.mcpNames,cwd,prompt,signal,tools,
    onThread:async sessionId=>{const saved=externalChatTurnStateSchema.parse(await call('prepareExternalChatThread',{callId:reservation.callId,sessionId,protocolKind:'codex-app-server',protocolVersion:1},signal));if(saved.callId!==reservation.callId||saved.sessionId!==sessionId||saved.status!=='reserved')throw new CodexHostError('CODEX_THREAD_RECEIPT_UNKNOWN');},
    onAdmission:async sessionId=>{admission=true;const saved=externalChatTurnStateSchema.parse(await call('startExternalChatTurn',{callId:reservation.callId,sessionId,protocolKind:'codex-app-server',protocolVersion:1},signal));if(saved.callId!==reservation.callId||saved.status!=='started')throw new CodexHostError('CODEX_START_RECEIPT_UNKNOWN');},
    onTurn:async providerTurnId=>{const saved=externalChatTurnStateSchema.parse(await call('recordExternalChatProviderTurn',{callId:reservation.callId,providerTurnId},signal));if(saved.callId!==reservation.callId||saved.providerTurnId!==providerTurnId)throw new CodexHostError('CODEX_TURN_RECEIPT_UNKNOWN');},
    onTool:async(toolCallId,name,toolInput)=>{
     const toolName=names.get(name);if(!toolName)throw new CodexHostError('CODEX_TOOL_UNAVAILABLE');
     const saved=externalTaskToolResultSchema.parse(await call('executeExternalTaskTool',{turnCallId:reservation.callId,toolCallId,toolName,input:toolInput},signal));
     if(saved.turnCallId!==reservation.callId||saved.toolCallId!==toolCallId||saved.status!=='settled'||!saved.outcome)throw new CodexHostError('CODEX_TOOL_RESULT_UNKNOWN');
     return {text:JSON.stringify(saved.outcome),success:saved.outcome.status==='ok'||saved.outcome.status==='partial'};
    },onText});
  }
  signal.throwIfAborted();const receipt=externalChatReceiptSchema.parse({schemaVersion:1,engine:'codex',protocolKind:'codex-app-server',protocolVersion:1,turnId:reservation.callId,stopReason:'end_turn',...result});
  const saved=externalChatTurnStateSchema.parse(await call('settleExternalChatTurn',{callId:reservation.callId,status:'settled',receipt},signal));
  if(saved.callId!==reservation.callId||saved.status!=='settled')throw new CodexHostError('CODEX_SETTLEMENT_RECEIPT_UNKNOWN');
  return {callId:reservation.callId};
 }catch(error){
  const errorCode=error instanceof CodexHostError?error.code:'CODEX_HOST_FAILED';
  try{await call('settleExternalChatTurn',admission?{callId:reservation.callId,status:'unknown'}:{callId:reservation.callId,status:'rejected',rejectionCode:errorCode});}catch{/* 原始故障与账本留给宿主对账。 */}
  throw new GenerationFailure(admission?'unknown_result':'waiting_user',errorCode);
 }finally{await owned.rpc.close();}
}
