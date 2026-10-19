import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {isAssistantEngineToolAllowed} from '@creatoros/contract';
import {eq,asc,executionStreamEvents,executionCalls,executionTasks,type Db} from '@creatoros/backend';
import {agenticToolOutcomeSchema,chatWorkerInputSchema,externalToolInputProofSchema,externalTaskToolCallSchema,externalChatStartSchema,externalChatReceiptSchema,executionStreamChunkSchema} from '@creatoros/contract/execution-worker';
import {applyChatToolOutcome} from '../ai/chat-receipt-projection';
import {chatInputDigest} from '../ai/chat-turn-submission.service';
import {requireExternalChatCallTree} from '../ai/external-chat-call-tree';
import {ConflictError} from './execution.errors';
type Tx=Parameters<Parameters<Db['transaction']>[0]>[0];
type Task=typeof executionTasks.$inferSelect;
type Call=typeof executionCalls.$inferSelect;
type Json=z.infer<ReturnType<typeof z.json>>;
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
/** 原ordinary与external共用同一输出协议；只投影已结算事实，无执行权。 */
export function chatToolOutputChunks(part:Record<string,Json>,toolCallId:string,toolName:string,callId:string){
 const approvalId=(part.approval as {id?:string}|undefined)?.id??`receipt:${callId}`;
 const metadata=part.callProviderMetadata?{providerMetadata:part.callProviderMetadata}:{};
 return z.array(executionStreamChunkSchema).parse(part.state==='output-error'
  ?[{type:'tool-input-error',toolCallId,toolName,input:part.rawInput,errorText:part.errorText,...metadata}]
  :part.state==='output-denied'?[
   {type:'tool-approval-request',toolCallId,approvalId},
   {type:'tool-approval-response',approvalId,approved:false,reason:(part.approval as {reason:string}).reason},
   {type:'tool-output-denied',toolCallId}]:[{type:'tool-output-available',toolCallId,output:part.output}]);
}
/** SEMANTIC_BOUNDARY_ALLOW: 只校验冻结身份、原参数证明和效果上界，不选择内容。 */
export function externalToolCard(task:Task,calls:Call[],call:Call){
 const frozen=chatWorkerInputSchema.parse(object(task.payload).modelInput);
 if(frozen.externalToolProjectionVersion!==1||call.kind!=='external_tool'||call.status!=='settled'||!call.resultText)throw new ConflictError('外部工具投影缺少已结算的新协议回执');
 const identity=externalTaskToolCallSchema.parse(call.providerResult),parent=calls.find(row=>row.id===identity.turnCallId);
 const start=externalChatStartSchema.safeParse(parent?.providerResult),receipt=externalChatReceiptSchema.safeParse(parent?.providerResult),provider=start.success?start.data:receipt.success?receipt.data:null;
 if(!parent||!['started','settled'].includes(parent.status)||parent.inputDigest!==chatInputDigest(frozen)||!provider||provider.engine!==frozen.executionEngine||provider.turnId!==parent.id||call.parentCallId!==parent.id)throw new ConflictError('外部工具投影父回合不符');
 const expectedProtocol=frozen.externalAgentBinding?.protocolKind??(frozen.executionEngine==='codex'?'codex-app-server':'acp');
 if(!['codex','codebuddy'].includes(frozen.executionEngine??'')||(provider.protocolKind??'acp')!==expectedProtocol||provider.protocolVersion!==1)throw new ConflictError('外部工具投影协议不符');
 if(expectedProtocol==='codex-app-server'){
  const native=object(object(object(task.payload).codexCalls)[parent.id]);
  if(!provider.providerTurnId||native.threadId!==provider.sessionId||native.turnId!==provider.providerTurnId)throw new ConflictError('外部工具投影线程回合绑定不符');
 }
 requireExternalChatCallTree(task,calls,parent.id);
 const definitions=frozen.tools.filter(def=>def.name===identity.toolName),definition=definitions[0];
 const proof=externalToolInputProofSchema.parse(object(object(task.payload).externalToolInputs)[call.id]);
 if(definitions.length!==1||!definition||!['none','proposal'].includes(definition.effect)||(definition.execution??'host')!=='host'||definition.version!==identity.toolVersion||proof.toolVersion!==definition.version||proof.callId!==call.id||proof.turnCallId!==parent.id||proof.toolCallId!==identity.toolCallId||proof.toolName!==identity.toolName||proof.inputDigest!==call.inputDigest)throw new ConflictError('外部工具投影冻结定义或原参数证明不符');
 if(!isAssistantEngineToolAllowed(frozen.executionEngine as 'codex'|'codebuddy',definition,frozen.workbenchCapabilities?.find(item=>item.name===definition.name))||definition.name==='plan.update'||frozen.workbenchCapabilities?.some(item=>item.name===definition.name))throw new ConflictError('外部工具投影不是原Host短工具');
 const digest=`sha256:${chatInputDigest({turnCallId:parent.id,toolCallId:identity.toolCallId,toolName:identity.toolName,version:definition.version,input:proof.input})}`;
 const operationKey=`external-tool:${createHash('sha256').update(JSON.stringify([parent.id,identity.toolCallId])).digest('hex')}`;
 const outcome=agenticToolOutcomeSchema.parse(JSON.parse(call.resultText));
 if(call.executionTaskId!==task.id||call.inputDigest!==digest||call.operationKey!==operationKey||!['none','proposal'].includes(outcome.sideEffect)||(definition.effect==='none'&&outcome.sideEffect!=='none'))throw new ConflictError('外部工具投影效果或参数摘要不符');
 const output=outcome.data&&typeof outcome.data==='object'&&!Array.isArray(outcome.data)?outcome.data:{kind:identity.toolName,error:outcome.summary};
 const part:Record<string,Json>={type:`tool-${identity.toolName}`,toolCallId:identity.toolCallId,state:'output-available',input:proof.input,output:z.json().parse(output)};
 if(frozen.toolOutcomeProjectionVersion===1)applyChatToolOutcome(part,call.id,outcome,false,undefined,1);
 const input=executionStreamChunkSchema.parse({type:'tool-input-available',toolCallId:identity.toolCallId,toolName:identity.toolName,input:proof.input});
 return {definition,identity,parent,part,input,outputs:chatToolOutputChunks(part,identity.toolCallId,identity.toolName,call.id)};
}
/** 同一原task行锁下检查全部已有字节，再原子追加缺失；不能覆盖冲突或finish后补卡。 */
export async function ensureExternalToolCard(tx:Tx,task:Task,call:Call,card:ReturnType<typeof externalToolCard>,now:()=>string){
 const events=await tx.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,task.id)).orderBy(asc(executionStreamEvents.sequence));
 const inputs=events.filter(row=>row.chunk.toolCallId===card.identity.toolCallId&&['tool-input-available','tool-input-start'].includes(String(row.chunk.type)));
 const approvalIds=new Set(card.outputs.flatMap(chunk=>typeof chunk.approvalId==='string'?[chunk.approvalId]:[]));
 const outputs=events.filter(row=>row.callId===call.id||(row.chunk.toolCallId===card.identity.toolCallId&&!['tool-input-available','tool-input-start'].includes(String(row.chunk.type)))||(typeof row.chunk.approvalId==='string'&&approvalIds.has(row.chunk.approvalId)));
 if(inputs.length>1||inputs.some(row=>row.callId!==card.parent.id||!isDeepStrictEqual(row.chunk,card.input))||outputs.length>card.outputs.length||outputs.some((row,i)=>row.callId!==call.id||row.callIndex!==i||!isDeepStrictEqual(row.chunk,card.outputs[i]))||(outputs.length>0&&(!inputs.length||outputs.some(row=>row.sequence<=inputs[0]!.sequence))))throw new ConflictError('外部工具已保存流与完整回执不符');
 const complete=inputs.length===1&&outputs.length===card.outputs.length;
 if(complete)return {appended:false,completeBefore:true};
 if(events.some(row=>row.chunk.type==='finish'))throw new ConflictError('聊天结束后不能追加工具卡');
 const rows:Array<typeof executionStreamEvents.$inferInsert>=[];let sequence=events.at(-1)?.sequence??0;
 if(!inputs.length)rows.push({executionTaskId:task.id,sequence:++sequence,callId:card.parent.id,callIndex:Math.max(-1,...events.filter(row=>row.callId===card.parent.id).map(row=>row.callIndex))+1,chunk:card.input,createdAt:now()});
 for(let i=outputs.length;i<card.outputs.length;i++)rows.push({executionTaskId:task.id,sequence:++sequence,callId:call.id,callIndex:i,chunk:card.outputs[i]!,createdAt:now()});
 await tx.insert(executionStreamEvents).values(rows);
 return {appended:true,completeBefore:false};
}
export function chatToolDiagnostic(value:{executionTaskId:string;callId:string;attempt:number;phase:'tool_settled'|'tool_projection_appended'|'turn_finished';observedAt:string;elapsedMs?:number;inputSchemaBytes?:number;projectionTiming?:'before_finish'|'recovered_at_finish'|'deferred_proposal';result:string}){
 try{console.info('[chat-tool-timing]',JSON.stringify(value));}catch{/* 诊断不能改变原任务。 */}
}
