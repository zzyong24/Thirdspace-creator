import {z} from 'zod';
import {agenticToolOutcomeSchema,codexExecutionSpec,workerStartReceiptSchema,type WorkerPort} from '@creatoros/contract/execution-worker';
import {runChatGenerationInWorker} from './chat-generation-worker';
import {runChatTextNodeInWorker} from './chat-text-node-worker';
import {modelFor} from '../runtime/provider-factory';
import {GenerationFailure} from './generation-error';
type Call=(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>;
/** 只消费后端按原准备/身份/child binding审出的名单，Worker不创建恢复权限。 */
export async function recoverExternalChatChildren(signal:AbortSignal,call:Call){
 const ids=z.array(z.string().min(1));
 const checkpoint=z.object({replayableGenerationToolCallIds:ids.default([]),completableToolCallIds:ids.default([]),resumableToolCallIds:ids.default([]),replayableScriptDraftToolCallIds:ids.default([])}).parse(await call('readCheckpoint',{},signal));
 const restore=async(port:'restoreChatGeneration'|'restoreChatHooks'|'restoreChatScriptDraft',callId:string)=>{
  signal.throwIfAborted();const receipt=workerStartReceiptSchema.parse(await call(port,{callId},signal));
  if(receipt.callId!==callId)throw new GenerationFailure('unknown_result','CHAT_CHILD_RESTORE_RECEIPT_UNKNOWN');
 };
 for(const callId of checkpoint.completableToolCallIds){signal.throwIfAborted();agenticToolOutcomeSchema.parse(await call('completeChatHooks',{callId},signal));}
 // 同轮父工具先恢复当前租约；后续仍只能消费宿主核验的原准备、身份和模型回执。
 for(const callId of checkpoint.resumableToolCallIds)await restore('restoreChatHooks',callId);
 for(const callId of checkpoint.replayableGenerationToolCallIds)await restore('restoreChatGeneration',callId);
 for(const callId of checkpoint.replayableScriptDraftToolCallIds)await restore('restoreChatScriptDraft',callId);
 for(const callId of checkpoint.replayableGenerationToolCallIds)await runChatGenerationInWorker(callId,signal,call);
 for(const callId of checkpoint.resumableToolCallIds)await runChatTextNodeInWorker(callId,modelFor(codexExecutionSpec()),signal,call,'hooks');
 for(const callId of checkpoint.replayableScriptDraftToolCallIds)await runChatTextNodeInWorker(callId,modelFor(codexExecutionSpec()),signal,call,'script-draft');
}
