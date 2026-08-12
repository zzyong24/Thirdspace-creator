// runExecutionTask —— 执行层编排(T-255a,live dispatch 范式:persistence-client 在
// execution.tasks.create 后 `void runExecutionTask(...)` 后台跑,HTTP 立即返回,UI 轮询)。
//
// 流程:parse spec → markRunning → 建沙箱 → 物化 inputs(只读)→ executor 执行
// (超时 Promise.race + AbortSignal 贯通,T-239c 模式)→ 收割 out/ 清单 → recordCandidate
// (resultType `execution_manifest` → awaiting_confirmation,过确认门)。
// 任一失败 → markFailed + 清沙箱(诚实终态,绝不卡 running;T-207 sweep 兜底已在)。
import type { RequestContext } from "@creatoros/contract";
import { executionTaskSpec, type ExecutionManifest } from "@creatoros/contract";
import {
  cleanupSandbox,
  createSandbox,
  harvestArtifacts,
  materializeInputs,
} from "./sandbox";
import type { ExecutorRegistry } from "./executor-registry";

export interface ExecutionAiPort {
  markRunning(ctx: RequestContext, taskId: string): Promise<void>;
  recordStep(
    ctx: RequestContext,
    taskId: string,
    input: { stepNo: number; kind: string; text: string; toolCalls: unknown[] },
  ): Promise<void>;
  recordCandidate(
    ctx: RequestContext,
    taskId: string,
    input: { resultType: string; resultData: Record<string, unknown> },
  ): Promise<unknown>;
  markFailed(
    ctx: RequestContext,
    taskId: string,
    errorMessage?: string,
  ): Promise<void>;
}

export interface ExecutionAssetsReadPort {
  materializeAsset(
    ctx: RequestContext,
    assetId: string,
    destinationPath: string,
  ): Promise<{ size: number; mimeType: string } | null>;
}

export interface RunExecutionTaskDeps {
  ai: ExecutionAiPort;
  assets: ExecutionAssetsReadPort;
  registry: ExecutorRegistry;
  workspacesRoot: string;
}

// in-flight 中止表:taskId → AbortController。discard(丢弃在跑任务)经
// abortExecutionTask 打断 executor;进程内单机产品,无需跨进程协调。
const inflight = new Map<string, AbortController>();

/** 丢弃在跑任务时中止其 executor。返回是否命中 in-flight。 */
export function abortExecutionTask(taskId: string): boolean {
  const controller = inflight.get(taskId);
  if (!controller) return false;
  controller.abort(new Error("用户丢弃任务,执行已中止"));
  return true;
}

class ExecutionTimeoutError extends Error {
  constructor(timeoutSec: number) {
    super(`执行超时(>${timeoutSec}s),已中止`);
    this.name = "ExecutionTimeoutError";
  }
}

/** 超时 race(T-239c 模式):到点 abort + 抛 ExecutionTimeoutError。 */
async function withTimeout<T>(
  work: Promise<T>,
  timeoutSec: number,
  controller: AbortController,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new ExecutionTimeoutError(timeoutSec);
      controller.abort(err);
      reject(err);
    }, timeoutSec * 1000);
  });
  // 丢弃中止:executor 若不响应 signal(挂死),这条 race 腿保证编排立即收尾
  // (任务由 discard 落 cancelled;悬空的 work promise 无人等待,进程内自然回收)。
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    if (controller.signal.aborted) {
      reject(abortReason(controller.signal));
      return;
    }
    onAbort = () => reject(abortReason(controller.signal));
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([work, timeout, aborted]);
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) controller.signal.removeEventListener("abort", onAbort);
  }
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error(String(signal.reason ?? "aborted"));
}

export async function runExecutionTask(
  ctx: RequestContext,
  task: { id: string; inputData: Record<string, unknown> },
  deps: RunExecutionTaskDeps,
): Promise<void> {
  const taskId = task.id;
  let stepNo = 0;
  const step = async (text: string, kind = "step"): Promise<void> => {
    stepNo += 1;
    // 步骤流 best-effort:上报失败不打断执行主链。
    await deps.ai
      .recordStep(ctx, taskId, { stepNo, kind, text, toolCalls: [] })
      .catch(() => {});
  };

  // 幂等防抖:createTask 的 in-flight dedup 可能让同一 taskId 被二次 dispatch —— 已在跑
  // 就直接返回,绝不并行双跑同一沙箱。
  if (inflight.has(taskId)) return;
  const controller = new AbortController();
  inflight.set(taskId, controller);
  let sandboxCreated = false;
  try {
    // 1) 任务契约校验(脑→手的门)。
    const parsed = executionTaskSpec.safeParse(task.inputData.spec);
    if (!parsed.success) {
      throw new Error(`任务契约不合法: ${parsed.error.issues[0]?.message ?? "invalid spec"}`);
    }
    const spec = parsed.data;

    // 2) executor 解析(未注册 → 诚实失败,不静默排队)。
    const executor = deps.registry.get(spec.taskType);
    if (!executor) {
      throw new Error(`未注册的 executor: ${spec.taskType}`);
    }
    let params: Record<string, unknown> = spec.params;
    if (executor.paramsSchema) {
      const p = executor.paramsSchema.safeParse(spec.params);
      if (!p.success) {
        throw new Error(
          `params 不合法(${spec.taskType}): ${p.error.issues[0]?.message ?? "invalid params"}`,
        );
      }
      params = p.data as Record<string, unknown>;
    }

    // 2.5) [RT-H06] network 约束的诚实执行门。
    // 真实边界(v1,取舍见审计 RT-H06):桌面单机运行时(无 docker/无网络命名空间)没有
    // 能真正强制子进程断网的 OS 级沙箱 —— macOS sandbox-exec 已被 Apple 弃用,且嵌套
    // Chromium 自身的 Seatbelt 沙箱会崩,不假装有。能真做到并已做的:
    //   ① 子进程 env allowlist 收窄(child-env.ts):密钥/DB/S3/master key/NODE_OPTIONS
    //     不进沙箱进程树 —— 即便代码出网,也没有 secrets 可外传;
    //   ② executor 网络姿态声明(executor-registry.networkPosture)+ 本门:`deny` 对声明
    //     直接联网的 executor 诚实拒绝,可满足的场景降级明示进步骤流;
    //   ③ `allowlist` 策略无任何强制机制(无域名代理)→ 诚实拒绝,绝不静默假装隔离。
    const networkPosture = executor.networkPosture ?? "none";
    if (spec.constraints.network === "allowlist") {
      throw new Error(
        "network: allowlist 尚无真实强制手段(平台无 OS 级网络沙箱/域名代理),诚实拒绝执行 —— 请改用 network: deny",
      );
    }
    if (networkPosture === "direct") {
      throw new Error(
        `任务声明 network: deny,但 executor ${spec.taskType} 需要直接联网 —— 矛盾,诚实拒绝执行`,
      );
    }

    await deps.ai.markRunning(ctx, taskId);

    // network: deny 的降级明示(诚实,不宣称 OS 级隔离):记进步骤流,用户可见。
    await step(
      networkPosture === "brain-ports"
        ? "network: deny(沙箱面)—— 自主循环仅经平台受控端口出网(模型/领域工具适配器);沙箱不跑任意联网代码,子进程 env 已收窄不透传密钥"
        : "network: deny —— 平台无 OS 级网络沙箱,降级执行:executor 声明不出网 + 子进程 env 收窄(密钥/DB/S3 配置不进沙箱进程树)",
    );

    // 3) 建沙箱 + 物化 inputs(只读)。
    await step(`建沙箱 workspaces/${taskId}/`);
    const sandbox = await createSandbox(deps.workspacesRoot, taskId);
    sandboxCreated = true;
    await step(`物化输入 ${spec.inputs.length} 项(只读)`);
    const inputs = await materializeInputs(
      sandbox,
      spec.inputs,
      (assetId, destinationPath) =>
        deps.assets.materializeAsset(ctx, assetId, destinationPath),
    );

    // 4) executor 执行(超时 + abort 贯通)。goal 透传进 params 供 demo/日志用,
    //    不覆盖 executor 自己的同名 param。
    await step(`执行 ${spec.taskType}(超时 ${spec.constraints.timeoutSec}s)`);
    const result = await withTimeout(
      executor.run(
        { ...sandbox, inputs },
        { goal: spec.goal, ...params },
        // [T-256b] ctx additive 透传:agentic executor 用它解析 model-config + 用户域端口;
        // 确定性 executor(echo/video.render)忽略此字段。
        { signal: controller.signal, reportStep: (text) => step(text), ctx },
      ),
      spec.constraints.timeoutSec,
      controller,
    );

    // 5) 收割 out/ 清单(executor 不自报清单,防谎报)→ manifest 候选落库。
    await step("收割产物清单");
    const artifacts = await harvestArtifacts(sandbox, {
      maxOutputMB: spec.constraints.maxOutputMB,
    });
    const manifest: ExecutionManifest = {
      taskType: spec.taskType,
      artifacts,
      summary: result.summary ?? "",
      meta: result.meta ?? {},
    };
    await deps.ai.recordCandidate(ctx, taskId, {
      resultType: "execution_manifest",
      resultData: { manifest },
    });
    await step(`完成:${artifacts.length} 个产物待确认`, "final");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // [T-289 诊断] 打全栈到 sidecar 日志(任务失败态只存 message、无栈,定位不到哪一行)。
    //   如「path 参数收到 number」这类,栈里能看到确切文件:行 + 哪步。
    console.error(
      `[run-execution-task] task ${taskId} 失败:`,
      err instanceof Error ? (err.stack ?? err.message) : String(err),
    );
    await step(`失败:${message}`, "final");
    // 诚实终态。若任务已被 discard(cancelled),markFailed 的状态机守卫会 no-op。
    await deps.ai.markFailed(ctx, taskId, message).catch(() => {});
    // 失败沙箱无保留价值 → 立清(孤儿 sweep 只是兜底)。
    if (sandboxCreated) {
      await cleanupSandbox(deps.workspacesRoot, taskId).catch(() => {});
    }
  } finally {
    inflight.delete(taskId);
  }
}
