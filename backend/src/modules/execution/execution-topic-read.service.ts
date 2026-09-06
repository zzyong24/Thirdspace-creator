import { createHash } from "node:crypto";
import { z } from "zod";
import {
  aiTasks,
  executionCalls,
  and,
  eq,
  asc,
  type Db,
} from "@creatoros/backend";
import {
  workerPortInputSchemas,
  topicReadStoredReceiptSchema,
  topicReadReservationSchema,
  topicReadRequestSchema,
  type TopicReadTarget,
  type TopicReadRequest,
  type ExecutionRef,
} from "@creatoros/contract/execution-worker";
import {
  assertSafeWebDomain,
  webDomainFromUrl,
  webSessionLookupDomains,
} from "@creatoros/ai-worker/browser/web-domain";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import type { BrowserSessionsService } from "../browser-sessions";
import { validateBrowserStorageState } from "./execution-browser-session.service";
import type { RequestContext } from "@creatoros/contract";
import { ConflictError } from "./execution.errors";
const frozenSchema = z.object({
  version: z.literal(1),
  basis: z.enum(["trend", "positioning"]),
  mode: z.literal("daily").optional(),
  context: z.object({ positioningBrief: z.string() }),
  trendSources: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      url: z.string().url(),
      domain: z.string(),
      sourceType: z.enum(["web", "rss"]),
    }),
  ),
});
const inputSchema = z.object({
  kind: z.literal("model.structured"),
  skillId: z.literal("topic.generate"),
  operationKey: z.string().min(1),
  facets: z.object({
    __dailyTopic: z.string().optional(),
    __topicGenerate: z.string().transform((value, ctx) => {
      try {
        return frozenSchema.parse(JSON.parse(value));
      } catch {
        ctx.addIssue({ code: "custom", message: "冻结热点输入不合法" });
        return z.NEVER;
      }
    }),
  }),
});
type Call = typeof executionCalls.$inferSelect;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const blocked = new Set([
  "NEEDS_LOGIN",
  "CAPTCHA",
  "BROWSER_RUNTIME_UNAVAILABLE",
]);
/** 确定性外部读取账本。目标取自宿主冻结输入，不伪造模型工具调用，也不执行网络访问。 */
export function createExecutionTopicReadService(
  db: Db,
  deps: Parameters<typeof createExecutionCallLedgerService>[1] & {
    buildTrendQuery: (positioningBrief: string) => string;
    sessions?: Pick<
      BrowserSessionsService,
      "getStateVersioned" | "saveStateVersioned"
    >;
    validateDailyRun?(ctx:RequestContext,input:{jobId:string;jobRunId:string;aiTaskId:string},tx:Parameters<Parameters<Db["transaction"]>[0]>[0]):Promise<unknown>;
  },
) {
  const leases = createExecutionLeaseService(db, deps),
    ledger = createExecutionCallLedgerService(db, deps);
  type Scope = {
    input: z.infer<typeof inputSchema>;
    calls: Call[];
    context: RequestContext;
    ack: string[];
  };
  type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
  async function scoped(
    ref: ExecutionRef,
    mode: "admission" | "settlement",
    action?: (scope: Scope, tx: Transaction) => Promise<void>,
  ) {
    return leases.withLease(ref, mode, async ({ tx, task, context }) => {
      if (task.kind !== "ai_task" || task.ownerType !== "ai_task")
        throw new ConflictError("热点读取缺少AI任务归属");
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
        );
      if (!business || !["topic.generate","scheduled.topic.daily"].includes(business.taskType))
        throw new ConflictError("热点读取AI任务映射不符");
      const payload = task.payload as Record<string, unknown>,
        input = inputSchema.parse(payload.modelInput);
      if(business.taskType==="scheduled.topic.daily"){
        if(input.facets.__topicGenerate.mode!=="daily"||input.facets.__topicGenerate.basis!=="positioning"||!deps.validateDailyRun)throw new ConflictError("每日热点读取未绑定调度运行");
        const daily=z.object({jobId:z.string().min(1),jobRunId:z.string().min(1),skipReason:z.never().optional()}).parse(JSON.parse(input.facets.__dailyTopic??"null"));
        await deps.validateDailyRun(context,{jobId:daily.jobId,jobRunId:daily.jobRunId,aiTaskId:business.id},tx);
      }else if(input.facets.__topicGenerate.basis!=="trend"||input.facets.__topicGenerate.mode)throw new ConflictError("热点读取模式不符");
      const calls = await tx
        .select()
        .from(executionCalls)
        .where(eq(executionCalls.executionTaskId, task.id))
        .orderBy(asc(executionCalls.sequence));
      const scope = {
        input,
        calls,
        context,
        ack: Array.isArray(payload.researchBlockedAcknowledgedCallIds)
          ? payload.researchBlockedAcknowledgedCallIds.filter(
              (x): x is string => typeof x === "string",
            )
          : [],
      };
      await action?.(scope, tx);
      return scope;
    });
  }
  function canonical(scope: Scope, target: TopicReadTarget) {
    const frozen = scope.input.facets.__topicGenerate;
    let request: TopicReadRequest;
    if (target.kind === "search")
      request = {
        kind: "search",
        query: deps.buildTrendQuery(frozen.context.positioningBrief),
      };
    else {
      const sources = frozen.trendSources.filter(
        (s) => s.id === target.sourceId,
      );
      if (sources.length !== 1)
        throw new ConflictError("热点来源不属于冻结目标");
      const source = sources[0]!;
      const domain = assertSafeWebDomain(webDomainFromUrl(source.url));
      if (
        domain !==
        webDomainFromUrl(`https://${assertSafeWebDomain(source.domain)}`)
      )
        throw new ConflictError("冻结来源URL与域名不符");
      request = {
        kind: source.sourceType,
        sourceId: source.id,
        name: source.name,
        domain,
        url: source.url,
      };
    }
    request = topicReadRequestSchema.parse(request);
    return {
      target,
      request,
      requestDigest: `sha256:${hash(request)}`,
      prefix: `topic-read:${hash([scope.input.operationKey, target])}:`,
    };
  }
  type Bound = ReturnType<typeof canonical>;
  function receipt(call: Call, bound: Bound) {
    if (
      call.kind !== "tool" ||
      call.inputDigest !== bound.requestDigest ||
      !call.operationKey.startsWith(bound.prefix) ||
      !/^([a-f0-9]{64}|initial):[12]$/.test(
        call.operationKey.slice(bound.prefix.length),
      )
    )
      throw new ConflictError("热点读取调用身份不符");
    if (call.status !== "settled") return undefined;
    const stored = topicReadStoredReceiptSchema.parse(
      JSON.parse(call.resultText ?? ""),
    );
    if (
      stored.requestDigest !== bound.requestDigest ||
      hash(stored.request) !== hash(bound.request) ||
      hash(stored.target) !== hash(bound.target)
    )
      throw new ConflictError("热点读取持久回执不符");
    return stored.receipt;
  }
  function find(scope: Scope, callId: string) {
    const call = scope.calls.find((c) => c.id === callId);
    if (!call) throw new ConflictError("热点读取调用不存在");
    const targets: TopicReadTarget[] = [
      { kind: "search" },
      ...scope.input.facets.__topicGenerate.trendSources.map((s) => ({
        kind: "source" as const,
        sourceId: s.id,
      })),
    ];
    for (const target of targets) {
      const bound = canonical(scope, target);
      if (call.operationKey.startsWith(bound.prefix)) {
        receipt(call, bound);
        return { call, bound };
      }
    }
    throw new ConflictError("调用不是本任务冻结热点读取");
  }
  function response(call: Call, bound: Bound) {
    const output = receipt(call, bound);
    return topicReadReservationSchema.parse({
      callId: call.id,
      status: call.status,
      request: bound.request,
      requestDigest: bound.requestDigest,
      ...(output ? { receipt: output } : {}),
    });
  }
  function select(scope: Scope, bound: Bound, ordinal: number) {
    const rows = scope.calls.filter((c) =>
      c.operationKey.startsWith(bound.prefix),
    );
    const success = rows.find((c) => receipt(c, bound)?.status === "ok");
    if (success) return { existing: success, key: success.operationKey };
    const latest = rows.at(-1);
    let round = "initial";
    if (latest) {
      const output = receipt(latest, bound);
      round = latest.operationKey.slice(bound.prefix.length).split(":")[0]!;
      if (
        output?.status === "error" &&
        blocked.has(output.error.code) &&
        scope.ack.includes(latest.id)
      )
        round = hash(latest.id);
    }
    const key = `${bound.prefix}${round}:${ordinal}`;
    if (ordinal === 2) {
      const first = rows.find(
          (c) => c.operationKey === `${bound.prefix}${round}:1`,
        ),
        output = first ? receipt(first, bound) : undefined;
      if (
        output?.status !== "error" ||
        !output.error.retryable ||
        output.error.code !== "TRANSIENT"
      )
        throw new ConflictError("仅明确临时失败允许第二次读取");
    }
    return { key, existing: rows.find((c) => c.operationKey === key) };
  }
  function session(
    ref: ExecutionRef,
    callId: string,
  ): Promise<{
    domain: string;
    stateJson: string | null;
    revision: string | null;
  }>;
  function session(
    ref: ExecutionRef,
    callId: string,
    save: { revision: string | null; stateJson: string },
  ): Promise<{ saved: boolean; revision: string | null }>;
  async function session(
    ref: ExecutionRef,
    callId: string,
    save?: { revision: string | null; stateJson: string },
  ) {
    if (!deps.sessions) throw new ConflictError("热点网站登录态服务未配置");
    const sessions = deps.sessions;
    let output:
      | { domain: string; stateJson: string | null; revision: string | null }
      | { saved: boolean; revision: string | null }
      | undefined;
    await scoped(ref, "admission", async (scope, tx) => {
      const { call, bound } = find(scope, callId);
      if (
        call.status !== "started" ||
        call.startedAttempt !== ref.attempt ||
        bound.request.kind !== "web"
      )
        throw new ConflictError("登录态仅供当前已启动网页读取");
      const { domain } = bound.request,
        url = new URL(bound.request.url);
      let record: {
        key: string;
        stateJson: string | null;
        revision: string | null;
      } = { key: domain, stateJson: null, revision: null };
      for (const key of webSessionLookupDomains(domain)) {
        const value = await sessions.getStateVersioned(scope.context, key, tx);
        if (value.revision !== null) {
          record = { key, ...value };
          break;
        }
      }
      if (save) {
        validateBrowserStorageState(save.stateJson, url, domain);
        if (
          record.revision !== save.revision ||
          (record.revision !== null && record.stateJson === null)
        ) {
          output = { saved: false, revision: record.revision };
          return;
        }
        output = await sessions.saveStateVersioned(
          scope.context,
          record.key,
          save.stateJson,
          save.revision,
          tx,
        );
      } else {
        if (record.stateJson !== null)
          validateBrowserStorageState(record.stateJson, url, domain);
        output = {
          domain,
          stateJson: record.stateJson,
          revision: record.revision,
        };
      }
    });
    return output!;
  }
  return {
    async readTopicBrowserSession(ref: ExecutionRef, raw: unknown) {
      const { callId } =
        workerPortInputSchemas.readTopicBrowserSession.parse(raw);
      return session(ref, callId);
    },
    async saveTopicBrowserSession(ref: ExecutionRef, raw: unknown) {
      const request = workerPortInputSchemas.saveTopicBrowserSession.parse(raw);
      return session(ref, request.callId, request);
    },
    async reserveTopicRead(ref: ExecutionRef, raw: unknown) {
      const request = workerPortInputSchemas.reserveTopicRead.parse(raw),
        scope = await scoped(ref, "admission"),
        bound = canonical(scope, request.target),
        selection = select(scope, bound, request.ordinal);
      const call = await ledger.reserve(
        ref,
        {
          kind: "tool",
          operationKey: selection.key,
          inputDigest: bound.requestDigest,
          reservedTokens: 0,
        },
        (calls, task) => {
          const payload = task.payload as Record<string, unknown>;
          const fresh = {
            ...scope,
            calls,
            ack: Array.isArray(payload.researchBlockedAcknowledgedCallIds)
              ? payload.researchBlockedAcknowledgedCallIds.filter(
                  (x): x is string => typeof x === "string",
                )
              : [],
          };
          if (select(fresh, bound, request.ordinal).key !== selection.key)
            throw new ConflictError("热点读取状态已变化，请读取当前回执");
        },
      );
      return response(call, bound);
    },
    async startTopicRead(ref: ExecutionRef, raw: unknown) {
      const { callId } = workerPortInputSchemas.startTopicRead.parse(raw),
        scope = await scoped(ref, "admission"),
        { bound } = find(scope, callId);
      return response(
        await ledger.start(ref, callId, (call) => {
          receipt(call, bound);
        }),
        bound,
      );
    },
    async settleTopicRead(ref: ExecutionRef, raw: unknown) {
      const request = workerPortInputSchemas.settleTopicRead.parse(raw),
        scope = await scoped(ref, "settlement"),
        { bound } = find(scope, request.callId);
      if ("status" in request)
        return response(
          await ledger.settle(
            ref,
            request.callId,
            { status: "unknown" },
            (call) => {
              receipt(call, bound);
            },
          ),
          bound,
        );
      if (request.receipt.kind !== bound.request.kind)
        throw new ConflictError("热点读取结果类型与请求不符");
      const resultText = JSON.stringify(
        topicReadStoredReceiptSchema.parse({
          protocol: "topic.read.v1",
          target: bound.target,
          request: bound.request,
          requestDigest: bound.requestDigest,
          receipt: request.receipt,
        }),
      );
      if (resultText.length > 2_000_000)
        throw new ConflictError("热点读取回执超过持久上限");
      return response(
        await ledger.settle(
          ref,
          request.callId,
          { status: "settled", usage: { totalTokens: 0 }, resultText },
          (call) => {
            receipt(call, bound);
            if (
              call.status !== "settled" &&
              (call.status !== "started" || call.startedAttempt !== ref.attempt)
            )
              throw new ConflictError(
                "热点读取未知结果须独立对账，不能由普通回执覆盖",
              );
          },
        ),
        bound,
      );
    },
    async readTopicRead(ref: ExecutionRef, raw: unknown) {
      const { callId } = workerPortInputSchemas.readTopicRead.parse(raw),
        scope = await scoped(ref, "settlement"),
        { call, bound } = find(scope, callId);
      return response(call, bound);
    },
    /** 仅供宿主会话/profile装配使用；不向Worker开放账号和任意域参数。 */
    async readBrowserTarget(ref: ExecutionRef, callId: string) {
      const scope = await scoped(ref, "admission"),
        { call, bound } = find(scope, callId);
      if (
        call.status !== "started" ||
        call.startedAttempt !== ref.attempt ||
        bound.request.kind !== "web"
      )
        throw new ConflictError("登录态仅供当前已启动网页读取");
      return {
        context: scope.context,
        domain: bound.request.domain,
        url: new URL(bound.request.url),
      };
    },
  };
}
