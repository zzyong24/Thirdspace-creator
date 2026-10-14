import {prepareScriptDraftInput} from '../ai-runtime/chat-script-draft-preparation';
import type {executionEvidence} from "../../schema/intelligence";
import {readChatWebReadEvidence} from "./chat-web-read-evidence";
import type {executionCalls,executionTasks} from "@creatoros/backend";
import {chatWorkerInputSchema,checkpointToolCallSchema,workerProviderReceiptSchema,chatToolProviderName,workerToolResultReceiptSchema,agenticToolOutcomeSchema} from "@creatoros/contract/execution-worker";
import {agenticToolOperationKey} from "./agentic-tool-binding";
import {agenticModelToolParts} from './agentic-tool-binding';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {chatStructuredNodeSchema,workerSkillSnapshotSchema} from '@creatoros/contract/execution-worker';
import {generationRequestDigest} from '@creatoros/ai-worker/chat';
import {executionModelIdentitySchema} from './execution-model-identity.service';
import {originalCodexReadBinding} from './codex-read-recovery';
import {canonicalJson} from '../ai/canonical-json';
type Call=typeof executionCalls.$inferSelect;
type Task=typeof executionTasks.$inferSelect;
const recoverableModelFailure=(call:Call)=>call.status==="superseded" || (call.status==="rejected" && call.rejectionCode!=="STRUCTURED_PROTOCOL_UNSUPPORTED");
const preparationSchema=z.object({node:chatStructuredNodeSchema,discovery:z.object({sessionId:z.string().min(1),candidateId:z.string().min(1),candidateRevision:z.number().int()}).strict().nullable(),maxOutputTokens:z.number().int().positive().max(65536),skillSnapshot:workerSkillSnapshotSchema}).strict();
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
/** 私有命名恢复证明：仅原结构化提案的最后原生子模型可以只读对账。不是通用工具重发许可。 */
function recoverableCodexNodeParents(task:Task,calls:readonly Call[],node:'structured'|'hooks'|'script-draft'):string[]{
 try{
  const payload=object(task.payload),input=chatWorkerInputSchema.parse(payload.modelInput),v2=object(payload.executionRoute).schemaVersion===2;
  if(task.kind!=='ai_task'||task.ownerType!=='ai_task'||payload.aiTaskId!==task.ownerId||(!v2&&input.executionEngine!=='codex')||
   input.userId!==task.userId||input.accountId!==task.accountId||(input.groupId??null)!==(task.groupId??null)||
   calls.some(call=>call.executionTaskId!==task.id)||new Set(calls.map(call=>call.id)).size!==calls.length)return [];
  const root=[...calls].filter(call=>!call.parentCallId&&['model','external_agent'].includes(call.kind)).sort((a,b)=>a.sequence-b.sequence).at(-1);
  if(!root)return [];
  if(root.kind==='external_agent'&&!originalCodexReadBinding(task,root))return [];
  if(root.kind==='model'&&(root.status!=='settled'||root.totalTokens===null||!workerProviderReceiptSchema.safeParse(root.providerResult).success))return [];
  const proposals=agenticModelToolParts(task,root,{readonlyRecovery:true}).map(part=>checkpointToolCallSchema.safeParse(part)).filter(part=>part.success).map(part=>part.data);
  const recovered:string[]=[];
  for(const parent of calls){
   if(parent.kind!=='tool'||parent.parentCallId||parent.status!=='started'||parent.toolExecutionClaimId||parent.resultText||parent.providerJob||parent.startedAttempt===null||parent.startedAttempt>task.attempt||parent.sequence<=root.sequence)continue;
   const proposal=proposals.filter(part=>agenticToolOperationKey(root.id,part.toolCallId)===parent.operationKey);
   if(proposal.length!==1)continue;
   const definitions=input.tools.filter(tool=>chatToolProviderName(tool.name)===proposal[0]!.toolName);
   const definition=definitions[0];
   if(definitions.length!==1||!definition)continue;
   if(node==='structured'?(definition.effect!=='proposal'||definition.execution!=='worker.structured-node'):node==='hooks'?(definition.name!=='script.hooks'||definition.effect!=='proposal'||definition.execution!=='worker.script-hooks'):(definition.name!=='script.draft'||definition.effect!=='committed'||definition.execution!=='worker.script-draft'))continue;
   const proposedInput=z.json().parse(JSON.parse(proposal[0]!.input));
   const digest=`sha256:${createHash('sha256').update(JSON.stringify([root.id,proposal[0]!.toolCallId,proposal[0]!.toolName,definition.version,definition.effect,proposedInput,{execution:definition.execution}])).digest('hex')}`;
   if(parent.inputDigest!==digest)continue;
   const entry=object(object(payload.nodePreparations)[parent.id]);
   if(entry.schemaVersion!==1||entry.inputDigest!==parent.inputDigest||entry.nodeVersion!==(node==='structured'?'chat.structured.v1':node==='hooks'?'script.hooks.v1':'script.draft.v1')||
    entry.digest!==`sha256:${createHash('sha256').update(canonicalJson({inputDigest:entry.inputDigest,nodeVersion:entry.nodeVersion,value:entry.value})).digest('hex')}`)continue;
   const identityEntry=object(object(payload.chatModelIdentities)[parent.id]),identity=executionModelIdentitySchema.parse(identityEntry.identity);
   if(identityEntry.inputDigest!==parent.inputDigest||!('engine' in identity)||identity.engine!=='codex'||identity.capability!==(node==='structured'?(definition.name==='review.analyze'?'review.insights':definition.name):v2?definition.name:input.capability))continue;
   let key:string;
   if(node==='structured'){
    const prepared=preparationSchema.parse(entry.value);
    if(prepared.node.capability!==definition.name||!isDeepStrictEqual(prepared.skillSnapshot,object(payload.hostContext).skillSnapshot))continue;
    key=`structured:${parent.id}:${generationRequestDigest({inputDigest:parent.inputDigest,...prepared,identity}).slice(7)}`;
   }else{
    const prepared=z.record(z.string(),z.json()).parse(entry.value);
    if(typeof prepared.prompt!=='string'||typeof prepared.system!=='string')continue;
    if(node==='hooks')z.object({prompt:z.string(),system:z.string(),grounding:z.array(z.string())}).strict().parse(prepared);
    else{
     const host=object(payload.hostContext),sources=z.array(z.object({ref:z.string(),label:z.string(),text:z.string(),truncated:z.boolean(),sourceType:z.enum(['message','attachment','project_text']).optional(),sourceId:z.string().optional()}).strict()).parse(host.trustedScriptSources);
     const expected=prepareScriptDraftInput(object(proposedInput),sources,z.string().parse(object(host.scriptDraftContext).latestUserInstruction));
     if(prepared.mode!=='verbatim'||expected.mode!=='verbatim'||!isDeepStrictEqual(prepared.draft,expected)||!isDeepStrictEqual(expected.authorization,{prompt:prepared.prompt,system:prepared.system})||prepared.error!==undefined)continue;
    }
    const maxOutputTokens=node==='hooks'?z.number().int().positive().parse(object(object(payload.hostContext).scriptHooksGeneration).maxOutputTokens):input.maxOutputTokens;
    key=`${node}:${parent.id}:${generationRequestDigest({binding:parent.inputDigest,...prepared,maxOutputTokens,modelIdentity:identity}).slice(7)}`;
   }
   const children=calls.filter(call=>call.parentCallId===parent.id).sort((a,b)=>a.sequence-b.sequence);
   if(!children.length||(node!=='structured'&&children.length!==1)||children.some((child,index)=>child.kind!=='model'||child.sequence<=parent.sequence||child.retryOfCallId!==null||child.operationKey!==`${key}/model/${index+1}`))continue;
   if(children.slice(0,-1).some(child=>!(child.status==='settled'&&child.totalTokens!==null&&workerProviderReceiptSchema.safeParse(child.providerResult).success)&&!(child.status==='rejected'&&child.rejectionCode==='STRUCTURED_PROTOCOL_UNSUPPORTED')))continue;
   const tail=children.at(-1)!;
   if(!originalCodexReadBinding(task,tail.status==='settled'?{...tail,status:'started'}:tail))continue;
   if(tail.status==='settled'&&(tail.totalTokens===null||!workerProviderReceiptSchema.safeParse(tail.providerResult).success))continue;
   recovered.push(parent.id);
  }
  return recovered;
 }catch{return [];}
}
export function recoverableCodexStructuredParents(task:Task,calls:readonly Call[]){return recoverableCodexNodeParents(task,calls,'structured');}
export function recoverableCodexTextParents(task:Task,calls:readonly Call[],node:'hooks'|'script-draft'){return recoverableCodexNodeParents(task,calls,node);}
export function recoverableCodexProposalParents(task:Task,calls:readonly Call[]){return [...recoverableCodexStructuredParents(task,calls),...recoverableCodexTextParents(task,calls,'hooks'),...recoverableCodexTextParents(task,calls,'script-draft')];}
/** 已结算原节点只允许投影/读取已有结果；不取得新提交权。 */
export function recoverableCodexSettledProposalParents(task:Task,calls:readonly Call[]){
 const proven:string[]=[];
 for(const parent of calls){
  if(parent.kind!=='tool'||parent.status!=='settled'||parent.parentCallId||parent.totalTokens!==0||parent.toolExecutionClaimId||!parent.resultText)continue;
  let raw:unknown;try{raw=JSON.parse(parent.resultText);}catch{continue;}const receipt=workerToolResultReceiptSchema.safeParse(raw);
  if(!receipt.success||!agenticToolOutcomeSchema.safeParse(receipt.data.output).success)continue;
  const restored={...parent,status:'started' as const,resultText:null};
  if(recoverableCodexProposalParents(task,calls.map(call=>call.id===parent.id?restored:call)).includes(parent.id))proven.push(parent.id);
 }
 return proven;
}
/** 只识别有已确认前缀的父工具；是否完成及下一请求仍由原节点与账本验证。 */
export function recoverableChatNodeParents(task:Task,calls:Call[],evidence:(typeof executionEvidence.$inferSelect)[]=[]){
 const empty=()=>({completedHooks:[] as string[],resumableHooks:[] as string[],structured:[] as string[],scriptDrafts:[] as string[],webReads:[] as string[]});
 const input=chatWorkerInputSchema.safeParse((task.payload as {modelInput?:unknown}|null)?.modelInput);
 if(task.kind!=="ai_task" || task.ownerType!=="ai_task" || !input.success || input.data.userId!==task.userId || input.data.accountId!==task.accountId)return empty();
 if(calls.some(call=>call.executionTaskId!==task.id || call.status==="unknown" || (call.status==="settled" && (call.totalTokens===null || (call.kind==="model" && !workerProviderReceiptSchema.safeParse(call.providerResult).success)))))return empty();
 const v2=object(object(task.payload).executionRoute).schemaVersion===2;
 const model=calls.filter(call=>!call.parentCallId&&(call.kind==='model'||v2&&call.kind==='external_agent')).sort((a,b)=>a.sequence-b.sequence).at(-1);
 if(!model)return empty();
 let proposed:Array<z.infer<typeof checkpointToolCallSchema>>;
 if(model.kind==='external_agent'){
  if(!originalCodexReadBinding(task,model))return empty();
  proposed=agenticModelToolParts(task,model,{readonlyRecovery:true}).map(part=>checkpointToolCallSchema.safeParse(part)).filter(value=>value.success).map(value=>value.data);
 }else{
  if(model.status!=='settled')return empty();
  const receipt=workerProviderReceiptSchema.safeParse(model.providerResult);
  if(!receipt.success||receipt.data.finishReason.unified!=='tool-calls')return empty();
  proposed=receipt.data.content.map(part=>checkpointToolCallSchema.safeParse(part)).filter(value=>value.success).map(value=>value.data);
 }
 const result=empty();
 for(const parent of calls){
  if(parent.kind!=="tool" || parent.parentCallId || parent.status!=="started" || parent.toolExecutionClaimId || parent.resultText || parent.sequence<=model.sequence)continue;
  const matched=proposed.filter(part=>agenticToolOperationKey(model.id,part.toolCallId)===parent.operationKey);
  if(matched.length!==1)continue;
  const definitions=input.data.tools.filter(tool=>chatToolProviderName(tool.name)===matched[0]!.toolName);
  if(definitions.length!==1)continue;
  if(definitions[0]!.name === "web.read" && definitions[0]!.execution === "worker.web-read" && definitions[0]!.effect === "committed") {
    const rows = evidence.filter(row => row.originCallId === parent.id);
    if(rows.length === 1 && !calls.some(call => call.parentCallId === parent.id)) {
      try { readChatWebReadEvidence(rows[0]!, { taskId: task.id, callId: parent.id, inputDigest: parent.inputDigest }); result.webReads.push(parent.id); } catch { /* 损坏事实保持待对账。 */ }
    }
    continue;
  }
  const draft=definitions[0]!.name==="script.draft" && definitions[0]!.execution==="worker.script-draft" && definitions[0]!.effect==="committed";
  if(draft && !calls.some(call=>call.parentCallId===parent.id)) {result.scriptDrafts.push(parent.id);continue;}
  if(!draft && definitions[0]!.effect!=="proposal")continue;
  const definition=definitions[0]!,hooks=definition.name==="script.hooks" && definition.execution==="worker.script-hooks";
  if(!hooks && !draft && definition.execution!=="worker.structured-node")continue;
  const children=calls.filter(call=>call.parentCallId===parent.id).sort((a,b)=>a.sequence-b.sequence);
  if(!children.length)continue;
  const prefix=`${draft?"script-draft":hooks?"hooks":"structured"}:${parent.id}:`,key=children[0]!.operationKey.split("/model/")[0]!;
  if(!key.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(key.slice(prefix.length)))continue;
  const groups:Call[][]=[];let invalid=false;
  for(const child of children){
   const suffix=child.operationKey.startsWith(`${key}/model/`)?child.operationKey.slice(`${key}/model/`.length):"";
   if(child.kind!=="model" || child.sequence<=parent.sequence || !/^[1-9][0-9]*$/.test(suffix) || ["reserved","started","unknown"].includes(child.status)){invalid=true;break;}
   const index=Number(suffix);
   if((hooks || draft) && index!==1){invalid=true;break;}
   if(index===groups.length+1){if(child.retryOfCallId){invalid=true;break;}groups.push([child]);}
   else if(index===groups.length && groups.length){
    const previous=groups[index-1]!.at(-1)!;
    if(!recoverableModelFailure(previous) || child.retryOfCallId!==previous.id || child.inputDigest!==previous.inputDigest){invalid=true;break;}
    groups[index-1]!.push(child);
   }else {invalid=true;break;}
  }
  if(invalid)continue;
  const last=groups.at(-1)!.at(-1)!;
  const known=(call:Call)=>call.status==="settled" || (!hooks && !draft && call.status==="rejected" && call.rejectionCode==="STRUCTURED_PROTOCOL_UNSUPPORTED");
  if(groups.slice(0,-1).some(group=>!known(group.at(-1)!)))continue;
  const retry=recoverableModelFailure(last) && last.id===task.retryOfCallId;
  if(!known(last) && !retry)continue;
  if(draft)result.scriptDrafts.push(parent.id);
  else if(hooks)(retry?result.resumableHooks:result.completedHooks).push(parent.id);
  else result.structured.push(parent.id);
 }
 // 同轮多个合法父工具一起核对，不能互相误判成未知的在途模型。
 const allowed=new Set([...result.completedHooks,...result.resumableHooks,...result.structured,...result.webReads,...result.scriptDrafts]);
 return calls.some(call=>call.status==="started" && !allowed.has(call.id))?empty():result;
}
