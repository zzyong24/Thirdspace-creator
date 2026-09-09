import {isTaskDrainStopping,type TaskDrainControl} from "../execution/task-drain-control";
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
    > & { checkpoint: unknown | null; signal?: AbortSignal },
  ): Promise<IntelligenceAdapterEnvelope>;
}

export interface RunIntelligenceSourceTaskDeps {
  tasks: PersistentTaskService;
  intelligence: IntelligenceService;
  adapter: IntelligenceSourceAdapterPort;
  now?: () => string;
  workerId?: () => string;
}

const SOURCE_SYNC_LEASE_SECONDS = 90;
const SOURCE_SYNC_HEARTBEAT_MS = 25_000;

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
  const identities: Array<{ name: string; code: string | null }> = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current && !seen.has(current); depth += 1) {
    seen.add(current);
    if (typeof current !== "object") break;
    const value = current as {
      name?: unknown;
      code?: unknown;
      cause?: unknown;
    };
    identities.push({
      name: typeof value.name === "string" ? value.name : "UnknownError",
      code: typeof value.code === "string" ? value.code : null,
    });
    current = value.cause;
  }
  if (identities.length === 0) {
    identities.push({ name: "UnknownError", code: null });
  }
  const signals = identities
    .flatMap(({ name, code }) => [name, code])
    .filter((value): value is string => Boolean(value));
  const matches = (pattern: RegExp) =>
    signals.some((value) => pattern.test(value));
  const login = matches(
    /^(DOUYIN_FAVORITES_SESSION_EXPIRED|DouyinNotLoggedInError|DOUHOT_(?:OAUTH|LOGIN|AUTH)(?:_REQUIRED|_EXPIRED)?|Douhot.*(?:OAuth|Login|Auth).*Error)$|LoginRequired|NotLoggedIn/i,
  );
  const captcha = matches(
    /^(DOUYIN_FAVORITES_CAPTCHA|.*Captcha.*Error)$/i,
  );
  let errorCode: NonNullable<IntelligenceAdapterEnvelope["errorCode"]> =
    "NO_VALID_RESPONSE";
  if (matches(/^(BROWSER_PROFILE_BUSY|BrowserProfileBusyError)$/i)) {
    errorCode = "BROWSER_PROFILE_BUSY";
  } else if (captcha) {
    errorCode = "CAPTCHA";
  } else if (login) {
    errorCode = "LOGIN_REQUIRED";
  } else if (matches(/^FOLDER_MISSING$/i)) {
    errorCode = "FOLDER_MISSING";
  } else if (
    matches(
      /^(DOUYIN_FAVORITES_INVALID_RESPONSE|DouhotResponseShapeChangedError|DouhotSearchInputUnavailableError)$/i,
    ) ||
    matches(/responseshapechanged/i)
  ) {
    errorCode = "RESPONSE_SHAPE_CHANGED";
  } else if (
    matches(/^(DOUYIN_FAVORITES_(?:NETWORK|UPSTREAM)|.*HttpError)$/i) ||
    matches(/httperror/i)
  ) {
    errorCode = "HTTP_ERROR";
  } else if (matches(/urlblocked|unsafeurl/i)) {
    errorCode = "UNSAFE_URL";
  } else if (matches(/responsetoolarge/i)) {
    errorCode = "RESPONSE_TOO_LARGE";
  } else if (matches(/timeout|aborterror/i)) {
    errorCode = "TIMEOUT";
  }
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
    // 只记录异常类型；message 及 cause.message 可能含 URL 查询或短时签名。
    safeDiagnostics: { errorName: identities[0]?.name ?? "UnknownError" },
  };
}

export async function runIntelligenceSourceTask(
  ctx: RequestContext,
  input: {
    sourceId: string;
    runId: string;
    taskId: string;
    existingClaim?: PersistentTaskClaim;
    signal?: AbortSignal;
    cancelOnAbort?:boolean;
  },
  deps: RunIntelligenceSourceTaskDeps,
): Promise<void> {
  if (input.signal?.aborted && !input.existingClaim) return;
  const workerId =
    deps.workerId?.() ??
    `intelligence-source:${input.taskId}:${Date.now().toString(36)}`;
  const claim =
    input.existingClaim ??
    (await deps.tasks.claimTask({
      taskId: input.taskId,
      workerId,
      leaseSeconds: SOURCE_SYNC_LEASE_SECONDS,
    }));
  if (!claim) return;

  const control = new AbortController();
  let leaseLost = false;
  let heartbeatStopped = false;
  let heartbeatInFlight: Promise<void> = Promise.resolve();
  let parentCancellation: Promise<void> | undefined;
  let adapterPending:Promise<IntelligenceAdapterEnvelope>|undefined;
  const leaseInput = {taskId: input.taskId, workerId: claim.lease.workerId, attempt: claim.lease.attempt};
  const onParentAbort = () => {
    control.abort(input.signal?.reason);
    if(input.cancelOnAbort===false)return;
    parentCancellation ??= (async () => {
      // Persist cancellation even when abort raced the claim response.
      try {
        await deps.tasks.command(ctx, {
          taskIds: [input.taskId], command: "cancel",
          idempotencyKey: `source-parent-cancel:${input.taskId}:${claim.lease.attempt}`,
        });
      } catch (error) {
        const current = await deps.tasks.get(ctx, input.taskId);
        if (!["cancelled", "succeeded", "failed", "blocked"].includes(current.status)) throw error;
      }
    })();
    // The final cleanup awaits and surfaces failures; avoid an unhandled rejection meanwhile.
    void parentCancellation.catch(() => {});
  };
  input.signal?.addEventListener("abort", onParentAbort, {once: true});
  if (input.signal?.aborted) onParentAbort();
  const heartbeatTimer = setInterval(() => {
    if (heartbeatStopped) return;
    heartbeatInFlight = heartbeatInFlight.then(async () => {
      if (heartbeatStopped || control.signal.aborted) return;
      try {
        const task = await deps.tasks.heartbeat({...leaseInput, leaseSeconds: SOURCE_SYNC_LEASE_SECONDS});
        if (task.status === "pause_requested" || task.status === "cancel_requested") control.abort();
      } catch {
        leaseLost = true;
        control.abort();
      }
    });
  }, SOURCE_SYNC_HEARTBEAT_MS);
  let abortListener: (() => void) | undefined;
  try {
    control.signal.throwIfAborted();
    const sourceInput = await deps.intelligence.getSourceExecutionInput(ctx, input.sourceId);
    control.signal.throwIfAborted();
    // A non-cooperative adapter may finish late; it cannot hold a cancelled lease or write results.
    const aborted = new Promise<never>((_resolve, reject) => {
      abortListener = () => reject(control.signal.reason);
      control.signal.addEventListener("abort", abortListener, {once: true});
    });
    let envelope: IntelligenceAdapterEnvelope;
    try {
      adapterPending=deps.adapter.run(ctx,{...sourceInput,checkpoint:claim.task.checkpoint,signal:control.signal});
      envelope = await Promise.race([adapterPending,aborted]);
    } catch (error) {
      if (control.signal.aborted) return;
      envelope = failureEnvelope(sourceInput.source, deps.now?.() ?? new Date().toISOString(), error);
    }
    await heartbeatInFlight;
    if (control.signal.aborted || leaseLost) return;
    await deps.intelligence.applyAdapterBatch(ctx, {
      runId: input.runId, lease: claim.lease, envelope, terminal: true,
    });
  } catch (error) {
    if (!control.signal.aborted) throw error;
  } finally {
    heartbeatStopped = true;
    clearInterval(heartbeatTimer);
    input.signal?.removeEventListener("abort", onParentAbort);
    if (abortListener) control.signal.removeEventListener("abort", abortListener);
    if(input.cancelOnAbort===false&&adapterPending)await adapterPending.catch(()=>{});
    await heartbeatInFlight;
    if (parentCancellation) await parentCancellation;
    if (control.signal.aborted && !leaseLost) {
      const current = await deps.tasks.get(ctx, input.taskId);
      if (current.status === "pause_requested" || current.status === "cancel_requested") {
        await deps.tasks.acknowledgeControl(leaseInput);
      }
    }
  }
}

/** Startup/idle drain: recovers queued source tasks from the real DB after restart. */
export async function drainIntelligenceSourceQueue(
  deps: RunIntelligenceSourceTaskDeps,
  maxTasks = 20,
  control:TaskDrainControl = {},
): Promise<number> {
  let processed = 0;
  for (; processed < maxTasks && !isTaskDrainStopping(control); processed += 1) {
    const claim = await deps.tasks.claimNext({
      workerId:
        deps.workerId?.() ??
        `intelligence-drain:${Date.now().toString(36)}:${processed}`,
      kinds: ["source_sync"],
      leaseSeconds: 90,
    });
    if (!claim || isTaskDrainStopping(control)) break;
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
        signal:control.signal,
        cancelOnAbort:false,
      },
      deps,
    );
  }
  return processed;
}
