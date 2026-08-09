"use client";

/**
 * 执行结果确认卡(T-255a,SPEC 2026-07-11 execution-layer §2 确认门)。
 *
 * 一个 execution 任务(taskType `exec.*`,存储复用 ai_tasks)的全生命周期卡:
 *   queued/running → 轮询 execution.tasks.get + 最新步骤(ai.tasks.steps.list 共 taskId);
 *   awaiting_confirmation → 渲产物清单(文件名/大小/类型;视频缩略后续)+ 三动作:
 *     - 采纳:execution.tasks.confirm —— out/ 产物经 createGeneratedAsset 真入资产库
 *       (产物落 workspaces 不算落库,采纳才入,铁律②);
 *     - 重试:带修改意见重建任务(同 spec + params.retryFeedback/retryOf),卡切换跟踪新 taskId;
 *     - 丢弃:execution.tasks.discard —— 中止 executor + cancelled + 清沙箱;
 *   succeeded → 已采纳(N 个产物入库);failed/cancelled → 诚实错误 + 可重试。
 *
 * 渲染范式对齐 ChatGenerateCard(轮询 task → 确认门 → 终态),挂进 copilot 任务 feed
 * (ai-copilot-content 对 exec.* 任务渲本卡)。
 */

import * as React from "react";

import { client } from "@/lib/contract-client";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 450; // ~30 分钟 —— 渲染类 executor 可达分钟级(3 分钟成片≈3-10 分钟)

interface WireArtifact {
  path: string;
  fileName: string;
  size: number;
  mimeType: string | null;
}

interface WireExecutionTask {
  id: string;
  status:
    | "queued"
    | "running"
    | "awaiting_confirmation"
    | "succeeded"
    | "failed"
    | "cancelled";
  execType: string;
  spec: {
    taskType: string;
    goal: string;
    inputs: { assetId: string; mountAs: string }[];
    params: Record<string, unknown>;
    constraints: Record<string, unknown>;
  };
  manifest: {
    taskType: string;
    artifacts: WireArtifact[];
    summary: string;
    meta?: Record<string, unknown>;
  } | null;
  adoptedAssetIds: string[];
  errorMessage: string | null;
}

export type ExecutionTaskUpdate = Pick<
  WireExecutionTask,
  "id" | "status" | "adoptedAssetIds"
>;

/** 字节数 → 人话(B/KB/MB;诚实保留一位小数)。 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindLabel(mimeType: string | null): string {
  const base = (mimeType ?? "").split(";", 1)[0]!.trim().toLowerCase();
  if (base.startsWith("video/")) return "视频";
  if (base.startsWith("image/")) return "图片";
  if (base.startsWith("audio/")) return "音频";
  if (base === "application/x-subrip" || base === "text/vtt") return "字幕";
  if (base === "application/json") return "JSON";
  if (base.startsWith("text/")) return "文本";
  return "文件";
}

export function ExecutionTaskCard({
  taskId: initialTaskId,
  projectId,
  onTaskIdChange,
  onTaskUpdate,
}: {
  taskId: string;
  /** 重试新建执行任务时继续保留项目归属，避免新任务脱离制作页恢复查询。 */
  projectId?: string;
  /** 卡片内部重试会换 taskId；通知外层一起改跟踪目标。 */
  onTaskIdChange?: (taskId: string) => void;
  /** 采纳/丢弃动作的终态回传；外层可立即收口关联，不必等下一轮轮询。 */
  onTaskUpdate?: (task: ExecutionTaskUpdate) => void;
}) {
  // 重试会重建任务 —— 卡内部切换跟踪新 taskId。
  const [taskId, setTaskId] = React.useState(initialTaskId);
  const [task, setTask] = React.useState<WireExecutionTask | null>(null);
  const [lastStep, setLastStep] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"" | "confirm" | "discard" | "retry">(
    "",
  );
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [retryOpen, setRetryOpen] = React.useState(false);
  const [retryFeedback, setRetryFeedback] = React.useState("");

  const refresh = React.useCallback(async (): Promise<WireExecutionTask | null> => {
    try {
      const t = (await client.getExecutionTask({
        params: { taskId },
        query: undefined,
        body: undefined,
      })) as unknown as WireExecutionTask;
      setTask(t);
      return t;
    } catch {
      return null; // 单次拉取失败不清空已有状态(下轮再试)
    }
  }, [taskId]);

  // 轮询:进行中每 4s 拉任务 + 最新步骤;到终态/待确认即停。
  React.useEffect(() => {
    let abandoned = false;
    void (async () => {
      const first = await refresh();
      if (
        abandoned ||
        (first &&
          first.status !== "queued" &&
          first.status !== "running")
      ) {
        return;
      }
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (abandoned) return;
        const t = await refresh();
        if (t && t.status !== "queued" && t.status !== "running") return;
        // 最新步骤文案(共 taskId 读 ai_task_steps),best-effort。
        try {
          const steps = (await client.listTaskSteps({
            params: { taskId },
            query: undefined,
            body: undefined,
          })) as unknown as Array<{ text: string }>;
          if (!abandoned && steps.length > 0) {
            setLastStep(steps[steps.length - 1]!.text);
          }
        } catch {
          // 步骤读取失败不影响主轮询
        }
      }
    })();
    return () => {
      abandoned = true;
    };
  }, [taskId, refresh]);

  const adopt = React.useCallback(async () => {
    setBusy("confirm");
    setActionError(null);
    try {
      const t = (await client.confirmExecutionTask({
        params: { taskId },
        query: undefined,
        body: undefined,
      })) as unknown as WireExecutionTask;
      setTask(t);
      onTaskUpdate?.(t);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "采纳失败,请重试",
      );
    } finally {
      setBusy("");
    }
  }, [taskId, onTaskUpdate]);

  const discard = React.useCallback(async () => {
    setBusy("discard");
    setActionError(null);
    try {
      const t = (await client.discardExecutionTask({
        params: { taskId },
        query: undefined,
        body: undefined,
      })) as unknown as WireExecutionTask;
      setTask(t);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "丢弃失败,请重试",
      );
    } finally {
      setBusy("");
    }
  }, [taskId]);

  // 重试 = 带修改意见重建任务(同 spec + retryFeedback/retryOf 进 params),卡切换跟踪新任务。
  const retry = React.useCallback(async () => {
    if (!task) return;
    setBusy("retry");
    setActionError(null);
    try {
      const created = (await client.createExecutionTask({
        params: undefined,
        query: undefined,
        body: {
          // wire 层 spec 的 taskType 是 string(服务端已按契约枚举收口),此处原样回传
          // 重建 —— 收窄由服务端 zod 再校验,前端不复刻枚举(单一真值在契约)。
          spec: {
            ...task.spec,
            params: {
              ...task.spec.params,
              ...(retryFeedback.trim()
                ? { retryFeedback: retryFeedback.trim() }
                : {}),
              retryOf: taskId,
            },
          } as never,
          ...(projectId ? { projectId } : {}),
        },
      })) as unknown as WireExecutionTask;
      setRetryOpen(false);
      setRetryFeedback("");
      setTask(created);
      setLastStep(null);
      setTaskId(created.id);
      onTaskIdChange?.(created.id);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "重试失败,请稍后再试",
      );
    } finally {
      setBusy("");
    }
  }, [task, taskId, retryFeedback, projectId, onTaskIdChange]);

  const status = task?.status ?? "queued";
  const artifacts = task?.manifest?.artifacts ?? [];
  const videoArtifacts = artifacts.filter((artifact) =>
    (artifact.mimeType ?? "").toLowerCase().startsWith("video/"),
  );
  const visualReview = React.useMemo(() => {
    const raw = task?.manifest?.meta?.visualReview;
    if (!raw || typeof raw !== "object") return null;
    const value = raw as Record<string, unknown>;
    if (value.status !== "reviewed") return null;
    const issues = Array.isArray(value.issues)
      ? value.issues.filter(
          (item): item is Record<string, unknown> =>
            !!item && typeof item === "object" && typeof (item as Record<string, unknown>).message === "string",
        )
      : [];
    return {
      verdict: value.verdict === "warn" ? "warn" : "pass",
      summary: typeof value.summary === "string" ? value.summary : "视觉审核已完成。",
      issues,
    };
  }, [task?.manifest?.meta]);
  const previewUrl = (artifact: WireArtifact) =>
    `/api/v1/local/execution-preview/${encodeURIComponent(taskId)}/${artifact.path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;

  return (
    <div
      data-slot="execution-task-card"
      data-status={status}
      className="mt-1 flex w-full flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        执行任务 · {task?.execType ?? "…"}
      </span>
      {task?.spec.goal ? (
        <p className="text-[12px] leading-snug text-foreground">
          {task.spec.goal}
        </p>
      ) : null}

      {status === "queued" || status === "running" ? (
        <div
          data-slot="execution-task-running"
          className="flex items-center gap-2 text-[12px] text-muted-foreground"
        >
          <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          {lastStep ?? (status === "queued" ? "排队中…" : "执行中…")}
        </div>
      ) : null}

      {status === "awaiting_confirmation" ? (
        <div data-slot="execution-task-review" className="flex flex-col gap-1.5">
          {task?.manifest?.summary ? (
            <p className="text-[11px] text-muted-foreground">
              {task.manifest.summary}
            </p>
          ) : null}
          {visualReview ? (
            <div
              data-slot="execution-task-visual-review"
              className={`rounded-md border p-2 text-[11px] ${
                visualReview.verdict === "warn"
                  ? "border-warning/40 bg-warning/10 text-foreground"
                  : "border-success/40 bg-success/10 text-foreground"
              }`}
            >
              <p className="font-medium">
                {visualReview.verdict === "warn" ? "视觉审核发现可优化项" : "视觉审核通过"}
              </p>
              <p className="mt-0.5 text-muted-foreground">{visualReview.summary}</p>
              {visualReview.issues.length > 0 ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {visualReview.issues.map((issue, index) => (
                    <li key={`${String(issue.code ?? "issue")}:${index}`}>
                      {String(issue.message)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {videoArtifacts.map((artifact) => (
            <div key={`preview:${artifact.path}`} className="flex flex-col gap-1">
              <video
                data-slot="execution-task-video-preview"
                src={previewUrl(artifact)}
                controls
                preload="metadata"
                className="max-h-[420px] w-full rounded-md bg-black object-contain"
              />
              <p className="text-[10px] text-muted-foreground">
                先预览，再决定是否采纳；预览不会把文件写入素材库。
              </p>
            </div>
          ))}
          {artifacts.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              (本次执行没有产出文件)
            </p>
          ) : (
            <ul
              data-slot="execution-task-artifacts"
              className="flex flex-col gap-1 rounded-md border border-border bg-surface-subtle p-1.5"
            >
              {artifacts.map((a) => (
                <li
                  key={a.path}
                  data-slot="execution-task-artifact"
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <span
                    className="min-w-0 truncate text-foreground"
                    title={a.path}
                  >
                    {a.fileName}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {kindLabel(a.mimeType)} · {formatSize(a.size)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-muted-foreground">
            产物暂存沙箱,未入素材库 —— 采纳才落库(可重试/丢弃)。
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-slot="execution-task-adopt"
              disabled={busy !== "" || artifacts.length === 0}
              onClick={() => void adopt()}
              className="inline-flex h-7 items-center rounded-control bg-brand px-3 text-[11px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              {busy === "confirm" ? "采纳中…" : "采纳进素材库"}
            </button>
            <button
              type="button"
              data-slot="execution-task-retry"
              disabled={busy !== ""}
              onClick={() => setRetryOpen((v) => !v)}
              className="inline-flex h-7 items-center rounded-control border border-border px-3 text-[11px] font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
            >
              重试
            </button>
            <button
              type="button"
              data-slot="execution-task-discard"
              disabled={busy !== ""}
              onClick={() => void discard()}
              className="inline-flex h-7 items-center rounded-control border border-border px-3 text-[11px] font-medium text-destructive hover:bg-surface-subtle disabled:opacity-50"
            >
              {busy === "discard" ? "丢弃中…" : "丢弃"}
            </button>
          </div>
        </div>
      ) : null}

      {retryOpen &&
      (status === "awaiting_confirmation" ||
        status === "failed" ||
        status === "cancelled") ? (
        <div data-slot="execution-task-retry-form" className="flex flex-col gap-1">
          <textarea
            data-slot="execution-task-retry-feedback"
            value={retryFeedback}
            onChange={(e) => setRetryFeedback(e.target.value)}
            placeholder="修改意见(可选):这次哪里不对、想怎么改…"
            rows={2}
            className="w-full resize-none rounded-md border border-border bg-surface p-1.5 text-[11px] text-foreground"
          />
          <button
            type="button"
            data-slot="execution-task-retry-submit"
            disabled={busy !== ""}
            onClick={() => void retry()}
            className="inline-flex h-7 w-fit items-center rounded-control bg-brand px-3 text-[11px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            {busy === "retry" ? "重建任务中…" : "按意见重跑"}
          </button>
        </div>
      ) : null}

      {status === "succeeded" ? (
        <p data-slot="execution-task-done" className="text-[12px] text-success">
          ✓ 已把 {task?.adoptedAssetIds.length ?? 0} 个成果收进素材库。
        </p>
      ) : null}

      {status === "failed" || status === "cancelled" ? (
        <div data-slot="execution-task-error" className="flex flex-col gap-1">
          <p className="text-[12px] leading-relaxed text-destructive">
            {status === "cancelled"
              ? "任务已取消。"
              : "这一步没跑成,请点下方「重试」;若多次失败,换个模型或稍后再试。"}
          </p>
          <button
            type="button"
            data-slot="execution-task-retry"
            disabled={busy !== ""}
            onClick={() => setRetryOpen((v) => !v)}
            className="inline-flex h-6 w-fit items-center rounded-control border border-border px-2.5 text-[11px] font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
          >
            重试
          </button>
        </div>
      ) : null}

      {actionError ? (
        <p
          data-slot="execution-task-action-error"
          className="text-[11px] text-destructive"
        >
          {actionError}
        </p>
      ) : null}
    </div>
  );
}
