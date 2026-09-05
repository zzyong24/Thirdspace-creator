import { createHash } from "node:crypto";
import type { Db } from "@creatoros/backend";
import { workerStructuredResultSchema,workerPortInputSchemas,structuredGenerationInputSchema,type ExecutionRef } from "@creatoros/contract/execution-worker";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { ConflictError } from "./execution.errors";

/** 结构化节点的逐次供应商调用端口；后端拥有总预算和不可变请求摘要。 */
export function createExecutionGenerationPorts(db:Db,deps:Parameters<typeof createExecutionCallLedgerService>[1]){
  const leases=createExecutionLeaseService(db,deps);
  const ledger=createExecutionCallLedgerService(db,deps);
  return {
    async reserveGenerationCall(ref:ExecutionRef,raw:unknown){
      const request=workerPortInputSchemas.reserveGenerationCall.parse(raw);
      const scope=await leases.withLease(ref,"admission",async({task,context})=>{
        const input=structuredGenerationInputSchema.parse((task.payload as Record<string,unknown>).modelInput);
        if(task.kind!=="ai_task" || input.skillSnapshot.userId!==context.userId || input.skillSnapshot.accountId!==context.accountId)throw new ConflictError("结构化执行归属不符");
        return {input,retryOfCallId:task.retryOfCallId};
      });
      const prefix=`${scope.input.operationKey}/model/`;
      const suffix=request.operationKey.slice(prefix.length);
      if(!request.operationKey.startsWith(prefix) || !/^[1-9][0-9]*$/.test(suffix))throw new ConflictError("结构化调用键不符");
      const limit=request.request.maxOutputTokens;
      if(limit!==scope.input.maxOutputTokens)throw new ConflictError("结构化输出预算与冻结值不符");
      if("headers" in request.request || "abortSignal" in request.request)throw new ConflictError("请求含非持久协议字段");
      const encoded=JSON.stringify(request.request);
      const previous=(await ledger.inspect(ref)).calls.filter(call=>call.operationKey===request.operationKey).at(-1);
      const retryOfCallId=scope.retryOfCallId && (previous?.id===scope.retryOfCallId || previous?.retryOfCallId===scope.retryOfCallId) ? scope.retryOfCallId : undefined;
      const call=await ledger.reserve(ref,{operationKey:request.operationKey,kind:"model",inputDigest:`sha256:${createHash("sha256").update(encoded).digest("hex")}`,reservedTokens:Buffer.byteLength(encoded)+1024+scope.input.maxOutputTokens,...(retryOfCallId ? {retryOfCallId} : {})});
      return {callId:call.id,status:call.status,...(call.providerResult ? {providerResult:call.providerResult} : {}),...(call.rejectionCode ? {rejectionCode:call.rejectionCode} : {})};
    },
    async settleGenerationCall(ref:ExecutionRef,raw:unknown){
      const {callId,...input}=workerPortInputSchemas.settleGenerationCall.parse(raw);
      const call=await ledger.settle(ref,callId,input, call=>{if(call.kind!=="model")throw new ConflictError("模型端口不能结算工具调用");});
      return {callId:call.id,status:call.status};
    },
    async saveGenerationResult(ref:ExecutionRef,raw:unknown){
      const input=workerPortInputSchemas.saveGenerationResult.parse(raw);
      workerStructuredResultSchema.parse(JSON.parse(input.text));
      // 这里只补充原调用的已验证节点结果，保留原始回执与真实用量；候选仍经业务采纳。
      const state=await ledger.inspect(ref);
      const last=state.calls.at(-1);
      if(last?.id!==input.callId || last.status!=="settled" || !last.providerResult)throw new ConflictError("结构化结果缺少最后调用证据");
      const call=await ledger.settle(ref,input.callId,{status:"settled",usage:{},resultText:input.text});
      return {callId:call.id};
    },
  };
}
