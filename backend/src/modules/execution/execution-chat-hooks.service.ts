import {createExecutionWorkerOutcomeService} from "./execution-worker-outcome.service";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { asc, eq, executionCalls, type Db } from "@creatoros/backend";
import {
  agenticToolOutcomeSchema,
  workerPortInputSchemas,
  workerToolResultReceiptSchema,
  type ExecutionRef,
} from "@creatoros/contract/execution-worker";
import {
  replayTextGeneration,
  prepareScriptHooks,
  finalizeHookItems,
} from "@creatoros/ai-worker/chat";
import { clampExtraBrief } from "../ai-runtime/chat-tools";
import { canonicalJson } from "../ai/canonical-json";
import { createChatHostContextReader } from "../ai/chat-host-context.service";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import {
  createAgenticToolBinding,
  type AgenticBackendTool,
} from "./agentic-tool-binding";
import { ConflictError } from "./execution.errors";
import { createExecutionModelIdentityService } from "./execution-model-identity.service";
import { providerIdentityFor } from "@creatoros/ai-worker/model-identity";
const parentRequest=workerPortInputSchemas.prepareChatHooks;
const reserveRequest=workerPortInputSchemas.reserveChatHooksModel;
const argsSchema = z
  .object({
    topic: z.string().optional(),
    direction: z.string().optional(),
    extraBrief: z.string().optional(),
  })
  .strict();
const digest = (value: unknown) =>
  `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
type Call = typeof executionCalls.$inferSelect;
/** 仅处理开场候选：模型在 Worker 执行，宿主从原回执确定性重建结果。 */
export function createExecutionChatHooksService(
  db: Db,
  deps: Parameters<typeof createExecutionCallLedgerService>[1] & {
    tools: Record<string, AgenticBackendTool>;
    check(
      ref: ExecutionRef,
      input: { modelCallId: string; toolCallId: string },
      signal?: AbortSignal,
    ): Promise<{ status: string }>;
  },
) {
  const leases = createExecutionLeaseService(db, deps),
    ledger = createExecutionCallLedgerService(db, deps),
    reader = createChatHostContextReader(db, deps),
    binding = createAgenticToolBinding(deps.tools);
  const findParent = (
    task: Parameters<typeof binding.forCall>[0],
    calls: Call[],
    callId: string,
  ) => {
    const parent = calls.find((call) => call.id === callId);
    if (
      !parent ||
      parent.kind !== "tool" ||
      parent.parentCallId ||
      parent.toolExecutionClaimId
    )
      throw new ConflictError("开场调用缺少独立 Worker 父工具");
    const bound = binding.forCall(task, calls, parent);
    if (
      bound.executionToolName !== "script.hooks" || bound.execution!=="worker.script-hooks" ||
      bound.effect !== "proposal" ||
      bound.validationOutcome
    )
      throw new ConflictError("当前调用不是有效开场生成");
    return { parent, bound };
  };
  const assertCurrentRound = (
    calls: Call[],
    found: ReturnType<typeof findParent>,
  ) => {
    if (!["started", "settled"].includes(found.parent.status))
      throw new ConflictError("父工具尚不可准备生成");
    if (
      found.parent.status !== "settled" &&
      calls.filter((call) => call.kind === "model" && !call.parentCallId).at(-1)
        ?.id !== found.bound.modelCallId
    )
      throw new ConflictError("开场父工具不属于当前回合");
  };
  async function prepare(
    ref: ExecutionRef,
    raw: unknown,
    signal?: AbortSignal,
  ) {
    const input = parentRequest.parse(raw);
    signal?.throwIfAborted();
    const frozen = await reader.read(ref);
    const modelIdentity = await createExecutionModelIdentityService(
      db,
      deps,
    ).read(ref);
    if (!frozen.hostContext.scriptHooksContext)
      throw new ConflictError("原任务缺少开场生成上下文");
    if (!frozen.hostContext.scriptHooksGeneration)
      throw new ConflictError("原任务缺少冻结开场生成配置");
    const { maxOutputTokens } = frozen.hostContext.scriptHooksGeneration;
    const scope = await leases.withLease(
      ref,
      "admission",
      async ({ tx, task }) => {
        const calls = await tx
          .select()
          .from(executionCalls)
          .where(eq(executionCalls.executionTaskId, task.id))
          .orderBy(asc(executionCalls.sequence));
        const found = findParent(task, calls, input.callId);
        assertCurrentRound(calls, found);
        const retry=calls.find(call=>call.id===task.retryOfCallId && call.parentCallId===found.parent.id && call.status==="rejected");
        return {...found,...(retry?{retryOfCallId:retry.id}:{})};
      },
    );
    const decision = await deps.check(
      ref,
      {
        modelCallId: scope.bound.modelCallId,
        toolCallId: scope.bound.toolCallId,
      },
      signal,
    );
    if (decision.status !== "not-applicable")
      throw new ConflictError("开场生成尚未获得宿主授权");
    signal?.throwIfAborted();
    await leases.withLease(ref, "admission", async ({ tx, task }) => {
      const calls = await tx
        .select()
        .from(executionCalls)
        .where(eq(executionCalls.executionTaskId, task.id))
        .orderBy(asc(executionCalls.sequence));
      assertCurrentRound(calls, findParent(task, calls, input.callId));
    });
    const args = argsSchema.parse(scope.bound.input);
    const prepared = prepareScriptHooks(frozen.hostContext.scriptHooksContext, {
      ...args,
      extraBrief: clampExtraBrief(args.extraBrief),
    });
    const operationKey = `hooks:${input.callId}:${digest({ binding: scope.bound.inputDigest, ...prepared, maxOutputTokens, modelIdentity }).slice(7)}`;
    return {
      ...prepared,
      operationKey,
      modelIdentity,
      maxOutputTokens,
      retryOfCallId:scope.retryOfCallId,
      parent: scope.parent,
      bound: scope.bound,
    };
  }
  const childrenFor = (
    calls: Call[],
    parentId: string,
    operationKey: string,
  ) => {
    const children = calls.filter((call) => call.parentCallId === parentId);
    if (
      !children.length ||
      children.some(
        (call) =>
          call.kind !== "model" ||
          call.operationKey !== `${operationKey}/model/1`,
      )
    )
      throw new ConflictError("开场内部调用与原生成输入不符");
    const last = children.at(-1)!;
    if (
      children.slice(0, -1).some((call) => call.status !== "rejected") ||
      last.status !== "settled" ||
      last.totalTokens === null ||
      !last.providerResult
    )
      throw new ConflictError("开场内部调用仍须对账");
    return { children, last };
  };
  const rejectedChildren = (calls:Call[],parentId:string,operationKey:string) => {
    const children=calls.filter(call=>call.parentCallId===parentId).sort((a,b)=>a.sequence-b.sequence);
    if(!children.length || children.some(call=>call.kind!=="model" || call.status!=="rejected" || call.operationKey!==`${operationKey}/model/1`))throw new ConflictError("内部模型缺少完整明确拒绝事实");
    return children;
  };
  return {
    async fail(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
      const {callId,...failure}=workerPortInputSchemas.failChatHooks.parse(raw);
      const replay=await leases.withLease(ref,"settlement",async({tx,task})=>{
        if(!["waiting_user","retry_wait","failed"].includes(task.status))return null;
        const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
        const found=findParent(task,calls,callId),children=calls.filter(call=>call.parentCallId===callId);
        if(found.parent.status!=="started" || !children.length || children.some(call=>call.status!=="rejected") || children.at(-1)!.id!==calls.at(-1)!.id || children.at(-1)!.startedAttempt!==ref.attempt)throw new ConflictError("挂起回执不匹配原执行");
        const budgetExhausted=task.status==="failed" && failure.outcome==="retry_wait" && task.lastErrorCode==="RETRY_BUDGET_EXHAUSTED";
        if(!budgetExhausted && (task.status!==failure.outcome || task.lastErrorCode!==failure.errorCode || (task.status!=="failed" && task.retryOfCallId!==children.at(-1)!.id)))throw new ConflictError("挂起结果与原回执不符");
        return {status:task.status,retryAt:task.retryAt};
      });
      if(replay)return replay;
      const prepared=await prepare(ref,{callId},signal);
      return createExecutionWorkerOutcomeService(db,deps).recordFailure(ref,failure,(calls,task)=>{
        const found=findParent(task,calls,callId);assertCurrentRound(calls,found);
        const children=rejectedChildren(calls,callId,prepared.operationKey);
        if(found.parent.status!=="started" || found.parent.startedAttempt!==ref.attempt || children.at(-1)!.id!==calls.reduce((a,b)=>a.sequence>b.sequence?a:b).id || children.at(-1)!.startedAttempt!==ref.attempt)throw new ConflictError("开场失败不属于当前执行");
        return [callId];
      });
    },
    async restore(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
      const {callId}=workerPortInputSchemas.restoreChatHooks.parse(raw);
      const prepared=await prepare(ref,{callId},signal);
      return leases.withLease(ref,"admission",async({tx,task})=>{
        const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
        const found=findParent(task,calls,callId);assertCurrentRound(calls,found);
        const children=rejectedChildren(calls,callId,prepared.operationKey);
        if(found.parent.status!=="started" || task.retryOfCallId!==children.at(-1)!.id || calls.some(call=>call.status==="unknown" || (call.status==="started" && call.id!==callId)))throw new ConflictError("原任务没有可恢复的开场拒绝记录");
        signal?.throwIfAborted();
        await tx.update(executionCalls).set({startedAttempt:ref.attempt,updatedAt:(deps.now??(()=>new Date().toISOString()))()}).where(eq(executionCalls.id,callId));
        return {callId,status:"started" as const};
      });
    },
    async prepare(ref: ExecutionRef, raw: unknown, signal?: AbortSignal) {
      const { prompt, system, operationKey, maxOutputTokens, retryOfCallId } = await prepare(
        ref,
        raw,
        signal,
      );
      return { prompt, system, operationKey, maxOutputTokens, ...(retryOfCallId?{retryOfCallId}:{}) };
    },
    async reserve(ref: ExecutionRef, raw: unknown, signal?: AbortSignal) {
      const input = reserveRequest.parse(raw),
        prepared = await prepare(ref, { callId: input.callId }, signal);
      const { maxOutputTokens } = prepared;
      const expectedModel = providerIdentityFor(prepared.modelIdentity);
      const expected = await replayTextGeneration({ ...expectedModel, system: prepared.system, prompt: prepared.prompt, maxOutputTokens, receipts: [], signal });
      // 旧文本协议允许省略默认 auto；除此之外逐字段核对真实节点产出的请求。
      const normalized = (request: Record<string, unknown>) => {
        const copy = { ...request };
        if (isDeepStrictEqual(copy.toolChoice, { type: "auto" })) delete copy.toolChoice;
        return copy;
      };
      if (
        input.operationKey !== `${prepared.operationKey}/model/1` ||
        expected.status !== "next-request" ||
        !isDeepStrictEqual(normalized(input.request), normalized(expected.request))
      )
        throw new ConflictError("开场模型请求不符合冻结输入");
      const call = await ledger.reserve(
        ref,
        {
          operationKey: input.operationKey,
          kind: "model",
          parentCallId: input.callId,
          inputDigest: digest(input.request),
          reservedTokens:
            Buffer.byteLength(JSON.stringify(input.request)) +
            1024 +
            maxOutputTokens,
          ...(input.retryOfCallId
            ? { retryOfCallId: input.retryOfCallId }
            : {}),
        },
        (calls, task) => {
          const current = findParent(task, calls, input.callId);
          assertCurrentRound(calls, current);
          if(input.retryOfCallId){
            const source=calls.find(call=>call.id===input.retryOfCallId);
            if(task.retryOfCallId!==input.retryOfCallId || source?.parentCallId!==input.callId || source.status!=="rejected" || source.startedAttempt===ref.attempt || current.parent.startedAttempt!==ref.attempt)throw new ConflictError("子模型重试尚未获得任务恢复许可");
          }
          if (current.bound.inputDigest !== prepared.bound.inputDigest)
            throw new ConflictError("开场工具绑定已改变");
        },
      );
      return {
        callId: call.id,
        status: call.status,
        ...(call.providerResult ? { providerResult: call.providerResult } : {}),
        ...(call.rejectionCode ? { rejectionCode: call.rejectionCode } : {}),
      };
    },
    async start(ref: ExecutionRef, raw: unknown, signal?: AbortSignal) {
      const { callId } = parentRequest.parse(raw),
        state = await ledger.inspect(ref),
        call = state.calls.find((call) => call.id === callId);
      if (!call?.parentCallId) throw new ConflictError("当前调用不是内部模型");
      const prepared = await prepare(
        ref,
        { callId: call.parentCallId },
        signal,
      );
      const started = await ledger.start(ref, callId, (child, calls, task) => {
        assertCurrentRound(calls, findParent(task, calls, child.parentCallId!));
        if (child.operationKey !== `${prepared.operationKey}/model/1`)
          throw new ConflictError("内部模型操作键改变");
      });
      return { callId: started.id, status: started.status };
    },
    async settle(ref: ExecutionRef, raw: unknown) {
      const { callId, ...input } =
        workerPortInputSchemas.settleChatHooksModel.parse(raw);
      const settled = await ledger.settle(
        ref,
        callId,
        input,
        (call) => {
          if (call.kind !== "model" || !call.parentCallId)
            throw new ConflictError("当前调用不是内部模型");
          // 普通执行回执不具备对账权；新租约不能猜测旧请求是否已提交。
          if (call.status === "unknown" && input.status !== "unknown")
            throw new ConflictError("未知模型结果必须经独立对账确认");
          if (call.status === "started" && call.startedAttempt !== ref.attempt)
            throw new ConflictError("不能结算旧租约的在途模型");
        },
        (calls, task) => {
          const child = calls.find((call) => call.id === callId)!;
          findParent(task, calls, child.parentCallId!);
        },
      );
      return { callId: settled.id, status: settled.status };
    },
    async complete(ref: ExecutionRef, raw: unknown, signal?: AbortSignal) {
      const { callId } = parentRequest.parse(raw),
        prepared = await prepare(ref, { callId }, signal);
      const state = await ledger.inspect(ref),
        { children, last } = childrenFor(
          state.calls,
          callId,
          prepared.operationKey,
        );
      const receipt = last.providerResult as {
        content: unknown[];
        finishReason: { unified: string };
      };
      const unsupported =
        receipt.content.some(
          (part) =>
            !part ||
            typeof part !== "object" ||
            !("type" in part) ||
            !["text", "reasoning"].includes(String(part.type)),
        ) || !["stop", "length"].includes(receipt.finishReason.unified);
      const text = receipt.content
        .filter((part): part is { type: "text"; text: string } =>
          Boolean(
            part &&
            typeof part === "object" &&
            "type" in part &&
            part.type === "text" &&
            "text" in part &&
            typeof part.text === "string",
          ),
        )
        .map((part) => part.text)
        .join("");
      // 请求已有确认回执，内容不适用不等于提交未知；保留用量并确定性结束父工具。
      const output = agenticToolOutcomeSchema.parse(
        unsupported
          ? {
              status: "error",
              summary: "模型未返回可用的开场文本",
              evidence: [],
              error: {
                code: "no_evidence",
                retryable: false,
                recovery: "检查模型返回格式后重新发起生成",
              },
              continuation: null,
              sideEffect: "none",
            }
          : {
              status: "ok",
              summary: "开场候选已生成",
              evidence: [],
              data: {
                kind: "script.hooks",
                items: finalizeHookItems(text, prepared.grounding),
              },
              error: null,
              continuation: null,
              sideEffect: "proposal",
            },
      );
      const resultText = JSON.stringify(
        workerToolResultReceiptSchema.parse({
          schemaVersion: 1,
          kind: "tool",
          toolCallId: prepared.bound.toolCallId,
          toolName: prepared.bound.toolName,
          output,
        }),
      );
      await ledger.settle(
        ref,
        callId,
        { status: "settled", usage: { totalTokens: 0 }, resultText },
        undefined,
        (calls, task) => {
          const current = findParent(task, calls, callId),
            fresh = childrenFor(calls, callId, prepared.operationKey);
          assertCurrentRound(calls, current);
          if (
            current.bound.inputDigest !== prepared.bound.inputDigest ||
            digest(fresh.children) !== digest(children)
          )
            throw new ConflictError("开场完成前调用事实已变化");
        },
      );
      return output;
    },
  };
}
