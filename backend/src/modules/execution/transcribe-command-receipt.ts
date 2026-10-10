import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {and,eq,aiTasks,executionTasks,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {workspaceFilter} from '../../workspace-scope';
import {bindTranscribeExecution} from './transcribe-execution-binding';
import {ConflictError} from './execution.errors';

type Transaction=Parameters<Parameters<Db['transaction']>[0]>[0];
type Task=typeof executionTasks.$inferSelect;
type Command='pause'|'resume'|'cancel'|'retry';
export const TRANSCRIBE_COMMAND_RECEIPTS='__transcribeCommandReceiptsV1';
const digestSchema=z.string().regex(/^sha256:[a-f0-9]{64}$/);
const receiptsSchema=z.record(z.string().regex(/^[a-f0-9]{64}$/),z.object({
 schemaVersion:z.literal(1),command:z.enum(['pause','resume','cancel','retry']),
 targetDigest:digestSchema,inputDigest:digestSchema,
 acceptedAttempt:z.number().int().nonnegative(),acceptedAt:z.string().datetime({offset:true}),
}).strict());
type Receipts=z.infer<typeof receiptsSchema>;
function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>JSON.stringify(key)+':'+canonical(item)).join(',')+'}';
 const encoded=JSON.stringify(value);
 if(encoded===undefined)throw new ConflictError('转写控制输入不是完整JSON');
 return encoded;
}
function digest(value:unknown){return 'sha256:'+createHash('sha256').update(canonical(value)).digest('hex');}
export function transcribeCommandKeyDigest(key:string){return createHash('sha256').update(key).digest('hex');}
const record=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
export function isTranscribeCommandInput(payload:Record<string,unknown>){return record(payload.modelInput)?.kind==='transcribe.douyin';}
/** mixed只检查已存在的同key；无该记录的旧mixed/其它kind不扩成新的幂等协议。 */
export function inspectTranscribeCommand(task:Task,taskIds:string[],key:string):boolean{
 if(task.kind!=='ai_task'||task.ownerType!=='ai_task')return false;
 const payload=record(task.payload),receipts=record(payload?.[TRANSCRIBE_COMMAND_RECEIPTS]);
 if(receipts&&Object.hasOwn(receipts,transcribeCommandKeyDigest(key)))return true;
 return taskIds.length===1&&!!payload&&!Object.hasOwn(payload,'parentExecutionTaskId')&&!Object.hasOwn(payload,'__scheduledChild');
}
/** 此处只选择事务包装；锁内仍重读真实映射，不能用预查询授予执行权。 */
export async function routeTranscribeCommand(store:Pick<Db,'select'>,context:RequestContext,rows:Task[],taskIds:string[],key:string):Promise<boolean>{
 for(const task of rows){
  if(!inspectTranscribeCommand(task,taskIds,key))continue;
  const [business]=await store.select({taskType:aiTasks.taskType}).from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.userId,context.userId),workspaceFilter(aiTasks,context)));
  if(business?.taskType==='transcribe.douyin'||isTranscribeCommandInput(record(task.payload)??{}))return true;
 }
 return false;
}
export type TranscribeCommandBinding={payload:Record<string,unknown>;receipts:Receipts;inputDigest:string;delegated:boolean};
/** 只按真实业务映射判定；通用任务不能仅凭Worker payload冒领转写控制。 */
export async function readTranscribeCommandBinding(tx:Transaction,task:Task,context:RequestContext):Promise<TranscribeCommandBinding|null>{
 if(task.kind!=='ai_task'||task.ownerType!=='ai_task')return null;
 const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.userId,context.userId),workspaceFilter(aiTasks,context)));
 const payload=record(task.payload);
 if(business?.taskType!=='transcribe.douyin'&&(!payload||!isTranscribeCommandInput(payload)))return null;
 const first=record(payload?.modelInput)?.awemeIds;
 if(!payload||!Array.isArray(first)||typeof first[0]!=='string')throw new ConflictError('转写控制缺少原作品输入');
 const bound=await bindTranscribeExecution({tx,task,context},first[0]);
 if(bound.business.accountId!==task.accountId||bound.business.groupId!==task.groupId||bound.business.groupVersion!==task.groupVersion||bound.business.membershipVersion!==task.membershipVersion)throw new ConflictError('转写控制与原冻结归属不符');
 const parsed=receiptsSchema.safeParse(Object.hasOwn(payload,TRANSCRIBE_COMMAND_RECEIPTS)?payload[TRANSCRIBE_COMMAND_RECEIPTS]:{});
 if(!parsed.success)throw new ConflictError('转写控制回执不完整，请保留原任务核对');
 // 保留原冻结值；不与当前groupVersion比较，不纳入可初始化的运行预算/attempt/status。
 const inputDigest=digest({executionTaskId:task.id,userId:task.userId,groupId:task.groupId,accountId:task.accountId,
  groupVersion:task.groupVersion,membershipVersion:task.membershipVersion,kind:task.kind,ownerType:task.ownerType,ownerId:task.ownerId,
  aiTaskId:bound.business.id,requestFingerprint:bound.business.requestFingerprint,inputData:bound.business.inputData,modelInput:payload.modelInput});
 const delegated=Object.hasOwn(payload,'parentExecutionTaskId')||Object.hasOwn(payload,'__scheduledChild');
 return {payload,receipts:parsed.data,inputDigest,delegated};
}
export function isTranscribeCommandReplay(binding:TranscribeCommandBinding,key:string,command:Command,taskIds:string[]):boolean {
 const nonce=transcribeCommandKeyDigest(key);
 if(!Object.hasOwn(binding.receipts,nonce))return false;
 const previous=binding.receipts[nonce]!;
 if(binding.delegated||!isDeepStrictEqual({command:previous.command,targetDigest:previous.targetDigest,inputDigest:previous.inputDigest},
  {command,targetDigest:digest([...taskIds].sort()),inputDigest:binding.inputDigest}))throw new ConflictError('原转写控制key对应另一命令、完整目标或冻结输入');
 return true;
}
export function appendTranscribeCommandReceipt(binding:TranscribeCommandBinding,payload:Record<string,unknown>,key:string,command:Command,taskIds:string[],attempt:number,stamp:string){
 const nonce=transcribeCommandKeyDigest(key);
 if(Object.hasOwn(binding.receipts,nonce))throw new ConflictError('原转写控制回执已存在');
 return {...payload,[TRANSCRIBE_COMMAND_RECEIPTS]:{...binding.receipts,[nonce]:{schemaVersion:1,command,targetDigest:digest([...taskIds].sort()),inputDigest:binding.inputDigest,acceptedAttempt:attempt,acceptedAt:stamp}}};
}
