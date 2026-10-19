import type {RequestContext,AssistantReadCatalogVersion,AssistantActionCatalogVersion} from '@creatoros/contract';
import {assistantActionCandidateSchema,canvasCreateCandidateSchema,canvasGenerateUnsignedCandidateSchema} from '@creatoros/contract';
import type {ExecutionRef} from '@creatoros/contract/execution-worker';
import {agenticToolOutcomeSchema} from '@creatoros/contract/execution-worker';
import type {ChatWorkerDispatcherDeps} from '../execution/model-worker-dispatcher';
import type {createChatHostContextReader} from '../ai/chat-host-context.service';
import {sealChatProposal} from '../ai/chat-proposal-source.service';
import {canonicalJson} from '../ai/canonical-json';
import {workspaceKey} from '../../workspace-scope';
import {buildChatTools,type ChatToolDeps} from './chat-tools';
import {prepareChatToolDefinitions} from './chat-tool-definitions';
import {createChatHostToolAdapter} from './chat-host-tool-adapter';

export const ASSISTANT_SYSTEM_TOOL_EFFECTS=Object.freeze({'system.features':'none','system.read':'none','system.action.propose':'proposal','canvas.create.propose':'proposal','canvas.generate.propose':'proposal'} as const);
type Host=Awaited<ReturnType<ReturnType<typeof createChatHostContextReader>['read']>>;
type Ports=NonNullable<ChatToolDeps['assistantSystem']>;
export type ChatSystemToolPorts={ [K in keyof Ports]:Ports[K] extends ((input:infer I)=>Promise<infer R>)|undefined?(ctx:RequestContext,input:I,host:Host)=>Promise<R>:never };
/** SEMANTIC_BOUNDARY_ALLOW:固定已知原型的完整协议身份相等；不从任务 schema 造执行器或授予新权限。 */
export async function matchFrozenAssistantSystemCatalog(all:Host['modelInput']['tools']):Promise<{assistantReadCatalogVersion:AssistantReadCatalogVersion|null;assistantActionCatalogVersion:AssistantActionCatalogVersion}>{
 if(all.some(tool=>tool.name.startsWith('system.')&&!Object.hasOwn(ASSISTANT_SYSTEM_TOOL_EFFECTS,tool.name)))throw Error('系统工具定义与冻结任务不符');
 const definitions=all.filter(tool=>Object.hasOwn(ASSISTANT_SYSTEM_TOOL_EFFECTS,tool.name));
 const names=definitions.map(tool=>tool.name);
 if(new Set(names).size!==names.length)throw Error('系统工具定义与冻结任务不符');
 // whitelist原本按调用方顺序装配合法子集；不能新设全局排序反杀旧任务。
 // 原型按冻结顺序逐字段比较，不排序；实际顺序篡改由原modelInputDigest映射拒绝。
 if(!definitions.length)return {assistantReadCatalogVersion:null,assistantActionCatalogVersion:2};
 for(const assistantReadCatalogVersion of [2,1] as const)for(const assistantActionCatalogVersion of [2,1] as const){
  const tools=buildChatTools(definitions.map(tool=>tool.name),{humanizeError:()=>null,assistantReadCatalogVersion,assistantActionCatalogVersion} as unknown as ChatToolDeps);
  const current=(await prepareChatToolDefinitions(tools)).definitions;
  if(canonicalJson(current)===canonicalJson(definitions))return {assistantReadCatalogVersion:definitions.some(tool=>tool.name==='system.read')?assistantReadCatalogVersion:null,assistantActionCatalogVersion};
 }
 throw Error('系统工具定义与冻结任务不符');
}
/** 保持原read消费者接口，仍先验证完整已知系统工具组合。 */
export async function matchFrozenAssistantReadCatalog(all:Host['modelInput']['tools']):Promise<AssistantReadCatalogVersion|null>{
 return (await matchFrozenAssistantSystemCatalog(all)).assistantReadCatalogVersion;
}
/** 真实冻结宿主上下文与原业务端口；仅新候选从执行scope盖来源。 */
export function createChatSystemToolHost(reader:Pick<ReturnType<typeof createChatHostContextReader>,'read'>,ports:ChatSystemToolPorts):NonNullable<ChatWorkerDispatcherDeps['resolveTools']>{
 async function resolve(ctx:RequestContext,execution:ExecutionRef,signal?:AbortSignal){
  signal?.throwIfAborted();const host=structuredClone(await reader.read({...execution}));
  if(host.context.userId!==ctx.userId||workspaceKey(host.context).kind!==workspaceKey(ctx).kind||workspaceKey(host.context).id!==workspaceKey(ctx).id||(host.context.accountId??null)!==(ctx.accountId??null))throw Error('系统工具范围与真实任务不符');
  const catalog=await matchFrozenAssistantSystemCatalog(host.modelInput.tools);
  const definitions=host.modelInput.tools.filter(tool=>Object.hasOwn(ASSISTANT_SYSTEM_TOOL_EFFECTS,tool.name));
  if(!definitions.length)return {};
  const assistantSystem:Ports={
   features:input=>ports.features(host.context,input,host),read:input=>ports.read(host.context,input,host),
   propose:input=>ports.propose(host.context,input,host),createCanvas:input=>ports.createCanvas(host.context,input,host),
   ...(ports.generateCanvas?{generateCanvas:(input:Parameters<NonNullable<Ports['generateCanvas']>>[0])=>ports.generateCanvas!(host.context,input,host)}:{}),
  };
  const tools=buildChatTools(definitions.map(tool=>tool.name),{humanizeError:()=>null,assistantSystem,assistantReadCatalogVersion:catalog.assistantReadCatalogVersion??2,assistantActionCatalogVersion:catalog.assistantActionCatalogVersion} as unknown as ChatToolDeps);
  const current=(await prepareChatToolDefinitions(tools)).definitions;
  if(canonicalJson(current)!==canonicalJson(definitions))throw Error('系统工具定义与冻结任务不符');
  signal?.throwIfAborted();return tools;
 }
 return async(ctx,_input,execution,signal)=>{
  const prototypes=await resolve(ctx,execution,signal);
  const adapted=await createChatHostToolAdapter(prototypes,resolve,ASSISTANT_SYSTEM_TOOL_EFFECTS);
  for(const [name,tool] of Object.entries(adapted))if(ASSISTANT_SYSTEM_TOOL_EFFECTS[name as keyof typeof ASSISTANT_SYSTEM_TOOL_EFFECTS]==='proposal'){
   const execute=tool.execute!;
   tool.execute=async(c,input,scope)=>{
    const outcome=await execute(c,input,scope);
    if(outcome.status!=='ok'||outcome.sideEffect!=='proposal'||outcome.error)return outcome;
    try{
     const candidate=name==='system.action.propose'?assistantActionCandidateSchema.omit({source:true}).parse(outcome.data):name==='canvas.create.propose'?canvasCreateCandidateSchema.omit({source:true}).parse(outcome.data):canvasGenerateUnsignedCandidateSchema.parse(outcome.data);
     if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||!('request' in candidate))throw Error('候选缺少原始严格参数');
     return {...outcome,data:sealChatProposal({taskId:scope.aiTaskId,callId:scope.callId,toolCallId:scope.toolCallId},candidate as Parameters<typeof sealChatProposal>[1])};
    }catch{
     // 纯候选验证失败没有执行正式写入，不应抛出后被外部引擎判为未知副作用。
     const message='候选内容未通过完整校验，请重新读取目标后准备候选';
     return agenticToolOutcomeSchema.parse({status:'error',summary:message,evidence:[],data:{kind:outcome.data&&typeof outcome.data==='object'&&!Array.isArray(outcome.data)?outcome.data.kind:name,error:message},error:{code:'no_evidence',retryable:false,recovery:message},continuation:null,sideEffect:'none'});
    }
   };
  }
  return adapted;
 };
}
