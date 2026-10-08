import {randomUUID} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {and,eq,aiTaskResults,executionCalls,type Db} from "@creatoros/backend";
import {assistantAdoptionReceiptSchema,type RequestContext} from "@creatoros/contract";
import {lockWorkspaceMembership} from "../platform-account/membership-lock.service";
import {ConflictError} from "../execution/execution.errors";
import type {createChatProposalSourceService} from "./chat-proposal-source.service";

type Source=Awaited<ReturnType<ReturnType<typeof createChatProposalSourceService>["read"]>>;
type Tx=Parameters<Parameters<Db["transaction"]>[0]>[0];
type AdoptionResult={status:"adopted"|"accepted";operationId:string;result:unknown;afterCommit?:()=>Promise<void>;assertBeforeCommit?:()=>Promise<void>};
/** 原领域owner和原aiTaskResults同行提交；外部唤醒只在commit之后发生。 */
export function createAssistantActionAdoptionService(db:Db,deps:{
 source:Pick<ReturnType<typeof createChatProposalSourceService>,"read">;
 /** 必须在group锁前确定真实目标账号；只能收窄到同组，不扩工作区。 */
 resolveScope?:(ctx:RequestContext,source:Source)=>Promise<RequestContext>;
 apply:(ctx:RequestContext,source:Source,tx:Tx)=>Promise<AdoptionResult>;
 now?:()=>string;
 nextId?:(prefix:string)=>string;
}){
 const now=deps.now??(()=>new Date().toISOString()),nextId=deps.nextId??(prefix=>`${prefix}_${randomUUID()}`);
 function assertHuman(ctx:RequestContext){if(ctx.source!=="user")throw new ConflictError("候选采用需要用户的明确选择");}
 async function saved(store:Db,source:Source){
  const rows=await store.select().from(aiTaskResults).where(eq(aiTaskResults.executionCallId,source.source.callId));
  if(!rows.length)return null;
  const row=rows[0]!;
  if(rows.length!==1||row.aiTaskId!==source.aiTask.id||row.resultType!=="assistant.action.adoption")throw new ConflictError("候选来源已经绑定其它正式回执");
  const receipt=assistantAdoptionReceiptSchema.parse(row.resultData);
  if(!isDeepStrictEqual(receipt.source,source.source))throw new ConflictError("采用回执与原候选不符");
  return receipt;
 }
 return {
  async receipt(ctx:RequestContext,raw:unknown,store:Db=db){
   assertHuman(ctx);const source=await deps.source.read(ctx,raw,store);
   return {receipt:await saved(store,source)};
  },
  async adopt(ctx:RequestContext,raw:unknown){
   assertHuman(ctx);
   const observed=await deps.source.read(ctx,raw);
   const target=deps.resolveScope?await deps.resolveScope(ctx,observed):ctx;
   if(target.userId!==ctx.userId||(target.groupId??null)!==(ctx.groupId??null)||(!ctx.groupId&&(target.accountId??null)!==(ctx.accountId??null)))throw new ConflictError("候选采用目标不能扩大原工作区");
   const committed=await db.transaction(async tx=>{
    await lockWorkspaceMembership(tx,target);
    const [call]=await tx.select().from(executionCalls).where(and(eq(executionCalls.id,observed.source.callId),eq(executionCalls.executionTaskId,observed.executionTask.id))).for("update");
    if(!call||call.status!=="settled"||call.resultText!==observed.call.resultText||call.inputDigest!==observed.call.inputDigest)throw new ConflictError("采用期间原候选来源已变化");
    const source=await deps.source.read(ctx,raw,tx as unknown as Db);
    if(!isDeepStrictEqual(source.source,observed.source))throw new ConflictError("采用期间原候选来源已变化");
    const replay=await saved(tx as unknown as Db,source);
    // 同源回放先返回原正式响应，不重新保存或覆盖后来的编辑。
    if(replay)return {receipt:replay,afterCommit:undefined};
    const applied=await deps.apply(target,source,tx);
    const receipt=assistantAdoptionReceiptSchema.parse({source:source.source,status:applied.status,operationId:applied.operationId,result:applied.result,adoptedAt:now()});
    await tx.insert(aiTaskResults).values({id:nextId("ai-result"),executionCallId:source.source.callId,aiTaskId:source.aiTask.id,resultType:"assistant.action.adoption",resultData:receipt});
    await applied.assertBeforeCommit?.();
    return {receipt,afterCommit:applied.afterCommit};
   });
   // 唤醒失败不反写已提交回执；原task的恢复仍走相同ID。
   if(committed.afterCommit)await committed.afterCommit();
   return committed.receipt;
  },
 };
}
