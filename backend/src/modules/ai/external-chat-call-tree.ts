import {chatWorkerInputSchema,chatToolProviderName,checkpointToolCallSchema,externalChatReceiptSchema,externalChatStartSchema,externalTaskToolCallSchema} from '@creatoros/contract/execution-worker';
import {isAssistantEngineToolAllowed} from '@creatoros/contract';
import type {executionCalls,executionTasks} from '@creatoros/backend';
import {agenticToolOperationKey} from '../execution/agentic-tool-binding';
import {ConflictError} from '../execution/execution.errors';
type Task=typeof executionTasks.$inferSelect;type Call=typeof executionCalls.$inferSelect;
const object=(raw:unknown):Record<string,unknown>=>raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
/** 仅验证真实外部根、冻结工具、两种原账本及其子模型关系；不决定业务内容。 */
export function requireExternalChatCallTree(task:Task,rows:Call[],callId:string){
 const root=rows.find(call=>call.id===callId),frozen=chatWorkerInputSchema.parse(object(task.payload).modelInput);
 if(!root||root.executionTaskId!==task.id||root.kind!=='external_agent'||root.parentCallId||rows.filter(row=>row.kind==='external_agent').length!==1)throw new ConflictError('外部聊天回执引用无效');
 const native=object(object(object(task.payload).codexCalls)[root.id]);
 const source=(root.status==='settled'?externalChatReceiptSchema:externalChatStartSchema).safeParse(root.providerResult);
 const sourceKnown=frozen.executionEngine==='codex'&&source.success&&source.data.engine==='codex'&&source.data.turnId===root.id&&source.data.sessionId===native.threadId&&(['acp','codex-app-server'].includes(source.data.protocolKind??''))&&(!native.turnId||native.turnId===source.data.providerTurnId)&&(source.data.protocolKind!=='codex-app-server'||Boolean(source.data.providerTurnId&&native.turnId===source.data.providerTurnId));
 for(const call of rows.filter(row=>row.id!==root.id)){
  if(call.kind==='external_tool'){
   const identity=externalTaskToolCallSchema.safeParse(call.providerResult);
   if(call.parentCallId!==root.id||!identity.success||identity.data.turnCallId!==root.id)throw new ConflictError('外部短读工具归属无效');
   continue;
  }
  if(!sourceKnown)throw new ConflictError('混合工具账本缺少真实Codex回合');
  if(call.kind==='tool'&&!call.parentCallId){
   const parts=Object.values(object(native.tools)).map(raw=>checkpointToolCallSchema.safeParse({type:'tool-call',...object(raw)})).filter(part=>part.success&&agenticToolOperationKey(root.id,part.data.toolCallId)===call.operationKey);
   if(parts.length!==1||!parts[0]!.success)throw new ConflictError('外部工具缺少唯一真实调用来源');
   const proposed=parts[0]!.data;
   const def=frozen.tools.find(def=>chatToolProviderName(def.name)===proposed.toolName);
   if(!def||!isAssistantEngineToolAllowed('codex',def,frozen.workbenchCapabilities?.find(item=>item.name===def.name))||((def.execution??'host')==='host'&&def.effect!=='committed'&&def.name!=='plan.update'&&!frozen.workbenchCapabilities?.some(item=>item.name===def.name)))throw new ConflictError('普通工具不在已审Codex执行白名单');
   continue;
  }
  if(call.kind==='model'&&call.parentCallId){
   const parent=rows.find(row=>row.id===call.parentCallId);
   if(!parent||parent.kind!=='tool'||parent.parentCallId)throw new ConflictError('外部聊天子模型缺少原工具');
   const identity=object(object(object(task.payload).chatModelIdentities)[parent.id]);
   if(object(identity.identity).engine!=='codex'||identity.inputDigest!==parent.inputDigest)throw new ConflictError('外部聊天子模型没有冻结Codex身份');
   if(call.status==='settled'){const childNative=object(object(object(task.payload).codexCalls)[call.id]),metadata=object(object(object(call.providerResult).providerMetadata).codex);if(!childNative.threadId||!childNative.turnId||metadata.threadId!==childNative.threadId||metadata.turnId!==childNative.turnId)throw new ConflictError('子模型已结算回执缺少真实Codex线程回合');}
   continue;
  }
  throw new ConflictError('外部聊天混入未授权调用树');
 }
 return root;
}
