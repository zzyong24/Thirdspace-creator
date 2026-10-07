import type {WorkEditorReadInput,WorkEditorProposeInput,RequestContext} from '@creatoros/contract';
import {workEditorTarget} from '@creatoros/contract';
import type {ExecutionRef} from '@creatoros/contract/execution-worker';
import type {ChatWorkerDispatcherDeps} from '../execution/model-worker-dispatcher';
import type {createChatHostContextReader} from '../ai/chat-host-context.service';
import {buildChatTools,type ChatToolDeps} from './chat-tools';
import {prepareChatToolDefinitions} from './chat-tool-definitions';
import {createChatHostToolAdapter} from './chat-host-tool-adapter';
import {canonicalJson} from '../ai/canonical-json';
import {createWorkEditorCandidateService,type WorkEditorPorts} from './work-editor-candidate';
/** 原execution冻结target与三维owner，只短读取/候选，无owner写权限。 */
export function createChatWorkEditorToolHost(reader:Pick<ReturnType<typeof createChatHostContextReader>,'read'>,ports:WorkEditorPorts):NonNullable<ChatWorkerDispatcherDeps['resolveTools']>{
 const service=createWorkEditorCandidateService(ports),effects={'work.editor.read':'none','work.editor.propose':'proposal'} as const;
 async function resolve(ctx:RequestContext,execution:ExecutionRef,signal?:AbortSignal){
  signal?.throwIfAborted();const frozen=structuredClone(await reader.read({...execution}));
  if(frozen.context.userId!==ctx.userId||(frozen.context.accountId??null)!==(ctx.accountId??null)||(frozen.context.groupId??null)!==(ctx.groupId??null))throw new Error('编导目标与当前任务的账号组不符');
  const definitions=frozen.modelInput.tools.filter(tool=>Object.hasOwn(effects,tool.name));if(!definitions.length)return {};
  const context=frozen.hostContext.chatContext,target=workEditorTarget.parse(context.editorTarget);
  if(context.surface!=='project'||context.projectId!==target.projectId)throw new Error('编导工具未绑定当前明确保存的作品');
  const tools=buildChatTools(definitions.map(tool=>tool.name),{humanizeError:()=>null,editorTarget:target,readWorkEditor:(input:WorkEditorReadInput)=>service.read(frozen.context,target,input),proposeWorkEditor:(input:WorkEditorProposeInput)=>service.propose(frozen.context,target,input)} as unknown as ChatToolDeps);
  if(canonicalJson((await prepareChatToolDefinitions(tools)).definitions)!==canonicalJson(definitions))throw new Error('编导工具定义与任务快照不符');
  signal?.throwIfAborted();return tools;
 }
 return async(ctx,_input,execution,signal)=>{const prototypes=await resolve(ctx,execution,signal);return Object.keys(prototypes).length?createChatHostToolAdapter(prototypes,resolve,effects):{};};
}
