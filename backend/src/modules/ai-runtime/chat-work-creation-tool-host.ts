import type {RequestContext,WorkCreationTarget,WorkCreationReadResult,WorkCreationProposalInput,WorkCreationProposalResult} from '@creatoros/contract';
import {workCreationTarget} from '@creatoros/contract';
import type {ExecutionRef} from '@creatoros/contract/execution-worker';
import {workspaceKey} from '../../workspace-scope';
import type {createChatHostContextReader} from '../ai/chat-host-context.service';
import type {ChatWorkerDispatcherDeps} from '../execution/model-worker-dispatcher';
import {buildChatTools,type ChatToolDeps} from './chat-tools';
import {prepareChatToolDefinitions} from './chat-tool-definitions';
import {createChatHostToolAdapter} from './chat-host-tool-adapter';
import {canonicalJson} from '../ai/canonical-json';
import {resolveWorkCreationProtocol} from './chat-work-creation-protocol';

export interface ChatWorkCreationToolPorts {
 read(ctx:RequestContext,target:WorkCreationTarget):Promise<WorkCreationReadResult>;
 propose(ctx:RequestContext,target:WorkCreationTarget,input:WorkCreationProposalInput):Promise<WorkCreationProposalResult>;
}
/** 当前原任务的短读取/提案；不持有正式写端口或模型调用权。 */
export function createChatWorkCreationToolHost(reader:Pick<ReturnType<typeof createChatHostContextReader>,'read'>,ports:ChatWorkCreationToolPorts):NonNullable<ChatWorkerDispatcherDeps['resolveTools']>{
 const effects={'work.creation.read':'none','work.creation.propose':'proposal'} as const;
 async function resolve(ctx:RequestContext,execution:ExecutionRef,signal?:AbortSignal){
  signal?.throwIfAborted();
  const frozen=structuredClone(await reader.read({...execution}));
  const actual=workspaceKey(frozen.context),requested=workspaceKey(ctx);
  if(frozen.context.userId!==ctx.userId||(frozen.context.accountId??null)!==(ctx.accountId??null)||(frozen.context.groupId??null)!==(ctx.groupId??null)||actual.kind!==requested.kind||actual.id!==requested.id)throw new Error('联合创作与当前任务的账号组不符。');
  const definitions=frozen.modelInput.tools.filter(tool=>Object.hasOwn(effects,tool.name));
  if(!definitions.length)return {tools:{},toolFailureReceiptVersion:frozen.toolFailureReceiptVersion};
  const context=frozen.hostContext.chatContext as unknown as Record<string,unknown>;
  const target=workCreationTarget.parse(context.creationTarget);
  if(context.surface!=='project'||context.projectId!==target.projectId)throw new Error('联合创作未绑定当前确认脚本与作品组合。');
  const definitionOptions=resolveWorkCreationProtocol(definitions,target,frozen.hostContext.resolvedWritingContext);
  const tools=buildChatTools(definitions.map(tool=>tool.name),{
   humanizeError:()=>null,
   creationTarget:target,
   readWorkCreation:async(input?:{targetDigest?:string})=>{
    const result=await ports.read(frozen.context,target);
    if(input?.targetDigest&&input.targetDigest!==result.targetDigest)throw new Error('联合创作目标摘要不符。');
    return {...result,...(frozen.hostContext.resolvedWritingContext?{resolvedWritingContext:structuredClone(frozen.hostContext.resolvedWritingContext)}:{})};
   },
   proposeWorkCreation:(input:WorkCreationProposalInput)=>ports.propose(frozen.context,target,input),
  } as unknown as ChatToolDeps);
  const current=(await prepareChatToolDefinitions(tools,definitionOptions)).definitions;
  if(canonicalJson(current)!==canonicalJson(definitions))throw new Error('联合创作工具定义已变化，不能沿用旧任务执行。');
  signal?.throwIfAborted();return {tools,toolFailureReceiptVersion:frozen.toolFailureReceiptVersion,definitionOptions};
 }
 return async(ctx,_input,execution,signal)=>{
  const frozen=await resolve(ctx,execution,signal);
  return Object.keys(frozen.tools).length?createChatHostToolAdapter(frozen.tools,async(context,currentExecution,currentSignal)=>(await resolve(context,currentExecution,currentSignal)).tools,effects,{toolFailureReceiptVersion:frozen.toolFailureReceiptVersion,definitionOptions:frozen.definitionOptions}):{};
 };
}
