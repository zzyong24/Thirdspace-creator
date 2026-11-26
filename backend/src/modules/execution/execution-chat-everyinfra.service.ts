import { asc, eq, executionCalls, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  everyInfraQuerySchema, everyInfraQueryErrorMessages, type EveryInfraCredentials,
} from "@creatoros/contract/internal/everyinfra";
import {
  agenticToolOutcomeSchema, workerPortInputSchemas, workerToolResultReceiptSchema, type ExecutionRef,
} from "@creatoros/contract/execution-worker";
import { createChatHostContextReader } from "../ai/chat-host-context.service";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createAgenticToolBinding } from "./agentic-tool-binding";
import { readExecutionChatTask, type ChatBackendTool } from "./execution-chat-tool-ports.service";
import { ConflictError } from "./execution.errors";

export function createExecutionChatEveryInfraService(db: Db, deps: {
  now?: () => string;
  budget: { maxCalls: number; maxTokens: number; deadlineMs: number };
  tools: Record<string, ChatBackendTool>;
  resolveCredential?: (context: RequestContext) => Promise<EveryInfraCredentials | null>;
  check: (ref: ExecutionRef, raw: unknown, signal?: AbortSignal) => Promise<{ status: string }>;
}) {
  const leases = createExecutionLeaseService(db, deps);
  const ledger = createExecutionCallLedgerService(db, deps);
  const binding = createAgenticToolBinding(deps.tools);
  const reader = createChatHostContextReader(db, deps);

  function find(task: Parameters<typeof binding.forCall>[0], calls: Parameters<typeof binding.forCall>[1], callId: string) {
    const parent = calls.find(call => call.id === callId);
    if (!parent || parent.parentCallId || parent.toolExecutionClaimId) throw new ConflictError("查询调用身份不符");
    const bound = binding.forCall(task, calls, parent);
    if (bound.validationOutcome || bound.execution !== "worker.everyinfra" ||
        bound.executionToolName !== "everyinfra.query" || bound.effect !== "committed") {
      throw new ConflictError("当前调用不是万有引擎查询");
    }
    return { parent, bound };
  }

  async function current(ref: ExecutionRef, callId: string, mode: "admission" | "settlement") {
    return leases.withLease(ref, mode, async ({ tx, task }) => {
      const calls = await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId, task.id))
        .orderBy(asc(executionCalls.sequence));
      return find(task, calls, callId);
    });
  }

  return {
    async prepare(ref: ExecutionRef, raw: unknown, signal?: AbortSignal) {
      const { callId } = workerPortInputSchemas.prepareChatEveryInfra.parse(raw);
      signal?.throwIfAborted();
      await readExecutionChatTask(db, ref, deps.now);
      const before = await current(ref, callId, "admission");
      if (before.parent.status !== "started" || before.parent.startedAttempt !== ref.attempt) {
        throw new ConflictError("查询调用尚未取得执行权");
      }
      const decision = await deps.check(ref, { modelCallId: before.bound.modelCallId, toolCallId: before.bound.toolCallId }, signal);
      if (decision.status !== "not-applicable") throw new ConflictError("查询调用授权不可用");
      const restored = await reader.read(ref);
      signal?.throwIfAborted();
      const credential = await deps.resolveCredential?.(restored.context);
      signal?.throwIfAborted();
      const after = await current(ref, callId, "admission");
      if (after.parent.status !== "started" || after.parent.startedAttempt !== ref.attempt ||
          before.bound.inputDigest !== after.bound.inputDigest) {
        throw new ConflictError("万有引擎查询准备期间执行权改变");
      }
      return { input: everyInfraQuerySchema.parse(before.bound.input), credential: credential ?? null };
    },

    async settle(ref: ExecutionRef, raw: unknown) {
      const { callId, observation } = workerPortInputSchemas.settleChatEveryInfra.parse(raw);
      const found = await current(ref, callId, "settlement");
      if (found.parent.status === "settled") {
        return agenticToolOutcomeSchema.parse(workerToolResultReceiptSchema.parse(JSON.parse(found.parent.resultText!)).output);
      }
      if (found.parent.status !== "started" || found.parent.startedAttempt !== ref.attempt) {
        throw new ConflictError("查询结果不属于当前已启动调用");
      }
      const query = everyInfraQuerySchema.parse(found.bound.input);
      if (observation.status === "ok" && (observation.result.platform !== query.platform ||
          observation.result.action !== query.action ||
          observation.result.hits.some(hit => hit.platform !== query.platform || hit.action !== query.action))) {
        throw new ConflictError("万有引擎查询结果与请求不符");
      }
      const replayBlocked = observation.status === "error" && observation.automaticReplayBlocked === true;
      const retryable = observation.status === "error" && !replayBlocked &&
        (observation.code === "EVERYINFRA_RATE_LIMIT" || observation.code === "EVERYINFRA_UPSTREAM");
      const summary = observation.status === "ok" ? "万有引擎查询已返回"
        : replayBlocked ? "请先在万有引擎确认本次请求结果，再继续查询。"
          : everyInfraQueryErrorMessages[observation.code];
      const output = agenticToolOutcomeSchema.parse({
        status: observation.status,
        summary,
        evidence: [],
        data: { kind: "everyinfra.query", ...observation },
        error: observation.status === "ok" ? null : { code: retryable ? "transient" : "no_evidence", retryable, recovery: summary },
        continuation: null,
        sideEffect: observation.status === "ok" ? "committed" : "none",
      });
      const resultText = JSON.stringify(workerToolResultReceiptSchema.parse({
        schemaVersion: 1, kind: "tool", toolCallId: found.bound.toolCallId, toolName: found.bound.toolName, output,
      }));
      await ledger.settle(ref, callId, { status: "settled", usage: { totalTokens: 0 }, resultText }, undefined, (calls, task) => {
        const actual = find(task, calls, callId);
        if (actual.parent.status !== "started" || actual.parent.startedAttempt !== ref.attempt ||
            actual.bound.inputDigest !== found.bound.inputDigest) {
          throw new ConflictError("万有引擎查询结算期间执行权改变");
        }
      });
      return output;
    },
  };
}
