import { z } from "zod";
import {
  and,
  eq,
  asc,
  aiTasks,
  executionCalls,
  type Db,
} from "@creatoros/backend";
import {
  browserObserveInputSchema,
  browserActInputSchema,
  browserObservationSchema,
  browserAuthorizationSnapshotSchema,
  agenticToolOutcomeSchema,
  type BrowserObserveInput,
  type BrowserActInput,
  type BrowserAuthorizationSnapshot,
  type AgenticToolOutcome,
  type ExecutionRef,
} from "@creatoros/contract/execution-worker";
import { assertBrowserAuthorization } from "../ai-runtime/browser-authorization";
import {
  createAgenticToolBinding,
  type AgenticBackendTool,
} from "./agentic-tool-binding";
import { createExecutionLeaseService } from "./execution-lease.service";
import { ConflictError } from "./execution.errors";
export type BrowserActionPreparation =
  | {
      status: "ready";
      input: BrowserObserveInput | BrowserActInput;
      url: string;
      authorization: BrowserAuthorizationSnapshot;
    }
  | {
      status: "blocked";
      outcome: AgenticToolOutcome;
    };
const receiptSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("tool"),
  toolCallId: z.string(),
  toolName: z.string(),
  output: agenticToolOutcomeSchema,
});
const blocked = (
  code: "permission" | "stale_observation",
): BrowserActionPreparation => ({
  status: "blocked",
  outcome: {
    status: code === "permission" ? "blocked" : "error",
    summary:
      code === "permission"
        ? "浏览器操作不在用户已授权范围内，本次未执行。"
        : "缺少当前会话的有效观察，请先观察页面。",
    evidence: [],
    error: {
      code,
      retryable: code === "stale_observation",
      recovery:
        code === "permission"
          ? "使用用户已授权的网站和动作；需要更多权限时等待用户授权。"
          : "使用browser.observe读取当前页面后，基于新的observationId和targetRef重新规划。",
    },
    continuation: null,
    sideEffect: "none",
  },
});
/** 短命名端口只核验账本与授权；不领取profile、不读cookie、不执行浏览器。 */
export function createExecutionBrowserActionService(
  db: Db,
  deps: {
    tools: Record<string, AgenticBackendTool>;
    now?: () => string;
  },
) {
  const leases = createExecutionLeaseService(db, deps),
    binding = createAgenticToolBinding(deps.tools);
  return {
    async prepare(
      ref: ExecutionRef,
      raw: unknown,
    ): Promise<BrowserActionPreparation> {
      const { callId } = z
        .object({ callId: z.string().min(1) })
        .strict()
        .parse(raw);
      return leases.withLease(
        ref,
        "admission",
        async ({ tx, task, context }) => {
          if (task.kind !== "ai_task" || task.ownerType !== "ai_task")
            throw new ConflictError("浏览器操作缺少AI执行归属");
          const [business] = await tx
            .select()
            .from(aiTasks)
            .where(
              and(
                eq(aiTasks.id, task.ownerId),
                eq(aiTasks.executionTaskId, task.id),
                eq(aiTasks.userId, context.userId),
                eq(aiTasks.accountId, context.accountId!),
              ),
            )
            .for("update");
          if (!business || !["queued", "running"].includes(business.status))
            throw new ConflictError("浏览器AI任务归属或状态不符");
          const calls = await tx
            .select()
            .from(executionCalls)
            .where(eq(executionCalls.executionTaskId, task.id))
            .orderBy(asc(executionCalls.sequence));
          const call = calls.find((item) => item.id === callId);
          if (
            !call ||
            call.status !== "started" ||
            call.startedAttempt !== ref.attempt ||
            call.toolExecutionClaimId
          )
            throw new ConflictError("浏览器调用没有当前执行许可");
          const bound = binding.forCall(task, calls, call);
          if (
            !["browser.observe", "browser.act"].includes(bound.toolName) ||
            calls.filter((item) => item.kind === "model").at(-1)?.id !==
              bound.modelCallId
          )
            throw new ConflictError("浏览器工具类型或模型回合不符");
          if (bound.validationOutcome)
            return { status: "blocked", outcome: bound.validationOutcome };
          const input =
            bound.toolName === "browser.observe"
              ? browserObserveInputSchema.parse(bound.input)
              : browserActInputSchema.parse(bound.input);
          const auth = browserAuthorizationSnapshotSchema.safeParse(
            (
              task.payload as {
                modelInput?: {
                  browserAuthorization?: unknown;
                };
              }
            ).modelInput?.browserAuthorization,
          );
          if (!auth.success) return blocked("permission");
          let observation: z.infer<typeof browserObservationSchema> | undefined;
          for (const prior of [...calls].reverse()) {
            if (
              prior.sequence >= call.sequence ||
              prior.kind !== "tool" ||
              prior.status !== "settled" ||
              !prior.resultText
            )
              continue;
            try {
              const historical = binding.forCall(task, calls, prior);
              if (
                !["browser.observe", "browser.act"].includes(
                  historical.toolName,
                )
              )
                continue;
              const original = z
                .object({ sessionId: z.string() })
                .parse(historical.input);
              if (original.sessionId !== input.sessionId) continue;
              const receipt = receiptSchema.parse(JSON.parse(prior.resultText));
              if (
                receipt.toolCallId !== historical.toolCallId ||
                receipt.toolName !== historical.toolName ||
                receipt.output.sideEffect === "unknown" ||
                receipt.output.error?.code === "unknown_commit"
              )
                continue;
              const data = z
                .object({ observation: browserObservationSchema })
                .safeParse(receipt.output.data);
              if (
                data.success &&
                data.data.observation.sessionId === input.sessionId
              ) {
                observation = data.data.observation;
                break;
              }
            } catch {
              /* 不把无法验真的历史回执当作观察来源。 */
            }
          }
          const action = "action" in input ? input.action : "observe";
          let url: string;
          if ("action" in input) {
            if (
              !observation ||
              observation.observationId !== input.observationId ||
              (input.targetRef &&
                !observation.elements.some(
                  (element) => element.targetRef === input.targetRef,
                ))
            )
              return blocked("stale_observation");
            url = observation.url;
          } else {
            const target = input.url ?? observation?.url;
            if (!target) return blocked("stale_observation");
            url = target;
          }
          try {
            const authorization = {
              allowedDomains: auth.data.allowedDomains,
              allowInteraction: auth.data.allowInteraction,
            };
            assertBrowserAuthorization(authorization, url, action);
            if (
              "action" in input &&
              (input.action === "navigate" || input.action === "wait") &&
              input.value
            )
              assertBrowserAuthorization(
                authorization,
                input.value,
                input.action,
              );
          } catch {
            return blocked("permission");
          }
          return { status: "ready", input, url, authorization: auth.data };
        },
      );
    },
  };
}
