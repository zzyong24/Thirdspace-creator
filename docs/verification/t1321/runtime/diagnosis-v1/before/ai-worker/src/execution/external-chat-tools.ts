import {z} from 'zod';
import {isAssistantEngineToolAllowed} from '@creatoros/contract';
import {agenticToolOutcomeSchema,agenticToolReservationSchema,chatToolApprovalReceiptSchema,chatToolProviderName,chatWorkerInputSchema,codexExecutionSpec,executionModelSpecSchema,externalTaskToolResultSchema,type WorkerPort} from '@creatoros/contract/execution-worker';
import {runDurableAgenticTool} from './durable-agentic-tool';
import {runChatGenerationInWorker} from './chat-generation-worker';
import {runChatTextNodeInWorker} from './chat-text-node-worker';
import {createChatResearchResources,runChatResearchInWorker} from './chat-research-worker';
import {createChatWebReadResources} from './chat-web-read-resources';
import {runChatRedfoxInWorker} from './chat-redfox-worker';
import {modelFor} from '../runtime/provider-factory';
import {GenerationFailure} from './generation-error';
type Call=(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>;
/** 外部Codex仍消费原工具Worker与Host端口，不伪造额外根模型或绕过审批。 */
export function createExternalChatToolConsumer(input:z.infer<typeof chatWorkerInputSchema>,rootCallId:string,parentSignal:AbortSignal,call:Call){
 let webRead:ReturnType<typeof createChatWebReadResources>|undefined;
 let research:Awaited<ReturnType<typeof createChatResearchResources>>|undefined;
 const definition=(name:string)=>input.tools.find(tool=>tool.name===name);
 const handles=(name:string)=>{const def=definition(name);return input.executionEngine==='codex'&&Boolean(def&&isAssistantEngineToolAllowed('codex',def,input.workbenchCapabilities?.find(item=>item.name===def.name))&&((def.execution??'host')!=='host'||def.effect==='committed'||def.name==='plan.update'||input.workbenchCapabilities?.some(item=>item.name===def.name)));};
 return {handles,
  async run(toolCallId:string,toolName:string,args:unknown,requestSignal?:AbortSignal){
   const signal=requestSignal?AbortSignal.any([parentSignal,requestSignal]):parentSignal;
   const def=definition(toolName);if(!def||!handles(toolName))throw new GenerationFailure('waiting_user','CODEX_TOOL_UNAVAILABLE');
   signal.throwIfAborted();
   await call('recordCodexToolCall',{callId:rootCallId,toolCallId,toolName:chatToolProviderName(toolName),input:JSON.stringify(args)},signal);
   const approval=chatToolApprovalReceiptSchema.parse(await call('checkChatToolApproval',{modelCallId:rootCallId,toolCallId},signal));
   if(approval.status==='user-approval'||approval.status==='unavailable')throw new GenerationFailure('waiting_user','CHAT_TOOL_REQUIRES_USER');
   let callId:string|undefined;
   const outcome=await runDurableAgenticTool({modelCallId:rootCallId,toolCallId},{signal,call:async(port,data,s)=>{
    const result=await call(port,data,s);
    if(port==='reserveAgenticTool'){const reserved=agenticToolReservationSchema.parse(result);if(reserved.toolName!==chatToolProviderName(toolName))throw Error('工具回执身份不符');callId=reserved.callId;}
    return result;
   },execute:async()=>{
    if(!callId)throw Error('工具入场缺失');
    if(approval.status==='denied')return agenticToolOutcomeSchema.parse({status:'blocked',summary:'用户未允许本次操作',evidence:[],data:{denied:true},error:{code:'permission',retryable:false,recovery:'用户已拒绝，本次不执行。'},continuation:null,sideEffect:'none'});
    if(def.execution==='worker.web-read'){webRead??=createChatWebReadResources(parentSignal,call);return webRead.run(callId,signal);}
    if(def.execution==='worker.redfox')return runChatRedfoxInWorker(callId,signal,call);
    if(def.execution==='worker.structured-node')return runChatGenerationInWorker(callId,signal,call);
    if(def.execution==='worker.script-hooks'||def.execution==='worker.script-draft'){
     const node=def.execution==='worker.script-hooks'?'hooks':'script-draft';
     if(input.modelRoutingVersion!==2)return runChatTextNodeInWorker(callId,modelFor(codexExecutionSpec()),signal,call,node);
     const prepared=await call(node==='hooks'?'prepareChatHooks':'prepareChatScriptDraft',{callId},signal) as {noModel?:boolean};
     if(prepared.noModel)return agenticToolOutcomeSchema.parse(await call(node==='hooks'?'completeChatHooks':'completeChatScriptDraft',{callId},signal));
     const selected=executionModelSpecSchema.parse(await call('resolveChatGenerationCredential',{callId},signal));
     return runChatTextNodeInWorker(callId,modelFor(selected),signal,call,node);
    }
    if(def.execution==='worker.research'){research??=await createChatResearchResources(parentSignal,call);return runChatResearchInWorker(callId,signal,call,research);}
    if(def.execution==='host.task-submit'||(def.execution??'host')==='host')return agenticToolOutcomeSchema.parse(await call('executeAgenticTool',{callId},signal));
    throw new GenerationFailure('waiting_user','CODEX_TOOL_UNAVAILABLE');
   }});
   if(!callId)throw Error('工具回执缺失');
   return externalTaskToolResultSchema.parse({turnCallId:rootCallId,toolCallId,callId,status:'settled',outcome});
  },async close(){await Promise.allSettled([research?.close(),webRead?.close()]);}
 };
}
