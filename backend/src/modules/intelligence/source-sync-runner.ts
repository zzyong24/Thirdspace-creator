import type { RequestContext } from "@creatoros/contract";
import type {
  PersistentTaskClaim,
  PersistentTaskService,
} from "../execution";
import type {
  IntelligenceAdapterEnvelope,
  IntelligenceService,
} from "./intelligence.service";

export interface IntelligenceSourceAdapterPort {
  run(
    ctx: RequestContext,
    input: Awaited<
      ReturnType<IntelligenceService["getSourceExecutionInput"]>
    > & { checkpoint: unknown | null },
  ): Promise<IntelligenceAdapterEnvelope>;
}

export interface RunIntelligenceSourceTaskDeps {
  tasks: PersistentTaskService;
  intelligence: IntelligenceService;
  adapter: IntelligenceSourceAdapterPort;
  now?: () => string;
  workerId?: () => string;
}

function adapterName(
  type: Awaited<
    ReturnType<IntelligenceService["getSourceExecutionInput"]>
  >["source"]["type"],
): IntelligenceAdapterEnvelope["upstreamEvidence"]["adapter"] {
  switch (type) {
    case "creator_profile":
      return "douyin_profile";
    case "favorites_folder":
      return "douyin_favorites";
    case "web":
      return "web";
    case "rss":
      return "rss";
    case "darkhorse_query":
      return "douhot_darkhorse";
  }
}

function failureEnvelope(
  source: Awaited<
    ReturnType<IntelligenceService["getSourceExecutionInput"]>
  >["source"],
  now: string,
  error: unknown,
): IntelligenceAdapterEnvelope {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : String(error);
  const login = /login|notloggedin|登录/i.test(`${name}:${message}`);
  const captcha = /captcha|验证码|验证/i.test(`${name}:${message}`);
  const errorCode = captcha
    ? "CAPTCHA"
    : login
      ? "LOGIN_REQUIRED"
      : /urlblocked|unsafeurl/i.test(name)
        ? "UNSAFE_URL"
        : /responsetoolarge/i.test(name)
          ? "RESPONSE_TOO_LARGE"
          : /timeout|aborterror/i.test(name)
            ? "TIMEOUT"
            : /httperror/i.test(name)
              ? "HTTP_ERROR"
              : /responseshapechanged/i.test(name)
                ? "RESPONSE_SHAPE_CHANGED"
                : "NO_VALID_RESPONSE";
  return {
    adapterStatus: login || captcha ? "blocked" : "failed",
    upstreamEvidence: {
      adapter: adapterName(source.type),
      responseShape: "adapter-exception",
      capturedAt: now,
      ...(source.canonicalUrl ? { finalUrl: source.canonicalUrl } : {}),
      listValid: false,
    },
    items: [],
    checkpoint: null,
    errorCode,
    // 只记录异常类型；message 可能含上游 URL 查询或短时签名，不能进入持久诊断。
    safeDiagnostics: { errorName: name },
  };
}

export async function runIntelligenceSourceTask(
  ctx: RequestContext,
  input: {
    sourceId: string;
    runId: string;
    taskId: string;
    existingClaim?: PersistentTaskClaim;
  },
  deps: RunIntelligenceSourceTaskDeps,
): Promise<void> {
  const workerId =
    deps.workerId?.() ??
    `intelligence-source:${input.taskId}:${Date.now().toString(36)}`;
  const claim =
    input.existingClaim ??
    (await deps.tasks.claimTask({
      taskId: input.taskId,
      workerId,
      leaseSeconds: 90,
    }));
  if (!claim) return;

  const sourceInput = await deps.intelligence.getSourceExecutionInput(
    ctx,
    input.sourceId,
  );
  let envelope: IntelligenceAdapterEnvelope;
  try {
    envelope = await deps.adapter.run(ctx, {
      ...sourceInput,
      checkpoint: claim.task.checkpoint,
    });
  } catch (error) {
    envelope = failureEnvelope(
      sourceInput.source,
      deps.now?.() ?? new Date().toISOString(),
      error,
    );
  }
  await deps.intelligence.applyAdapterBatch(ctx, {
    runId: input.runId,
    lease: claim.lease,
    envelope,
    terminal: true,
  });
}

/** Startup/idle drain: recovers queued source tasks from the real DB after restart. */
export async function drainIntelligenceSourceQueue(
  deps: RunIntelligenceSourceTaskDeps,
  maxTasks = 20,
): Promise<number> {
  let processed = 0;
  for (; processed < maxTasks; processed += 1) {
    const claim = await deps.tasks.claimNext({
      workerId:
        deps.workerId?.() ??
        `intelligence-drain:${Date.now().toString(36)}:${processed}`,
      kinds: ["source_sync"],
      leaseSeconds: 90,
    });
    if (!claim) break;
    const ctx: RequestContext = {
      userId: claim.task.userId,
      accountId: claim.task.accountId,
      requestId: `execution:${claim.task.id}`,
      source: "ingestion",
      ingestionRunId: claim.task.id,
    };
    const run = await deps.intelligence.getRunByTaskForExecution(
      ctx,
      claim.task.id,
    );
    await runIntelligenceSourceTask(
      ctx,
      {
        sourceId: run.sourceId,
        runId: run.id,
        taskId: claim.task.id,
        existingClaim: claim,
      },
      deps,
    );
  }
  return processed;
}
