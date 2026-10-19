"use client";

import * as React from "react";
import { TaskObservationNotice, useTaskObservation } from "@/components/ai/task-observation";

import { client } from "@/lib/contract-client";

const DEFAULT_POLL_INTERVAL_MS = 4_000;
const MAX_POLLS = 90;

type TaskStatus =
  | "queued"
  | "running"
  | "pause_requested"
  | "paused"
  | "cancel_requested"
  | "cancelled"
  | "succeeded"
  | "failed"
  | "blocked";

interface WirePersistentTask {
  id: string;
  kind: string;
  ownerId: string;
  status: TaskStatus;
  checkpoint: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
}

interface ImportCheckpoint {
  itemId: string | null;
  transcriptStatus: string | null;
  transcriptTaskIds: string[];
}

function parseImportCheckpoint(value: unknown): ImportCheckpoint {
  if (!value || typeof value !== "object") {
    return { itemId: null, transcriptStatus: null, transcriptTaskIds: [] };
  }
  const result = (value as { result?: unknown }).result;
  if (!result || typeof result !== "object") {
    return { itemId: null, transcriptStatus: null, transcriptTaskIds: [] };
  }
  const row = result as Record<string, unknown>;
  const item =
    row.item && typeof row.item === "object"
      ? (row.item as Record<string, unknown>)
      : null;
  return {
    itemId: typeof item?.id === "string" ? item.id : null,
    transcriptStatus:
      typeof row.transcriptStatus === "string" ? row.transcriptStatus : null,
    transcriptTaskIds: Array.isArray(row.transcriptTaskIds)
      ? row.transcriptTaskIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        )
      : [],
  };
}

function isTerminal(status: TaskStatus): boolean {
  return ["succeeded", "failed", "blocked", "cancelled"].includes(status);
}

function statusLabel(status: TaskStatus | null, runningLabel: string): string {
  switch (status) {
    case "queued":
      return "已排队";
    case "running":
      return runningLabel;
    case "pause_requested":
      return "正在暂停";
    case "paused":
      return "已暂停";
    case "cancel_requested":
      return "正在取消";
    case "cancelled":
      return "已取消";
    case "succeeded":
      return "已完成";
    case "failed":
      return "失败";
    case "blocked":
      return "需要处理";
    default:
      return "等待状态同步";
  }
}

function recoveryMessage(code: string | null | undefined): {
  text: string;
  href: string | null;
  link: string | null;
} {
  switch (code) {
    case "LOGIN_REQUIRED":
      return {
        text: "抖音登录态已失效。请重新登录后，再把这条链接发给我重试。",
        href: "/settings",
        link: "去设置检查抖音登录",
      };
    case "CAPTCHA":
      return {
        text: "抖音触发了人机验证。请在登录窗口完成验证后重试。",
        href: "/settings",
        link: "去设置处理登录验证",
      };
    case "MODEL_NOT_CONFIGURED":
      return {
        text: "还没有可用的转写模型。配置 ASR/转写模型后，再发起转写。",
        href: "/settings?highlight=asr-model",
        link: "去设置转写模型",
      };
    case "UNSAFE_URL":
      return {
        text: "链接没有通过抖音安全校验。请重新复制官方分享链接。",
        href: null,
        link: null,
      };
    case "TRANSCRIBE_FAILED":
      return {
        text: "内容已建档，但本次语音转写失败。检查模型或网络后重试。",
        href: "/settings?highlight=asr-model",
        link: "去设置检查模型",
      };
    default:
      return {
        text: "任务没有完成，请按上面的状态处理后重新发送链接。",
        href: null,
        link: null,
      };
  }
}

export function ChatDouyinShareCard({
  taskId,
  ownerId,
  action,
  error,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: {
  taskId: string | null;
  ownerId: string | null;
  action: "archive" | "archive_and_transcribe";
  error: string | null;
  /** 测试可缩短；生产默认 4 秒。 */
  pollIntervalMs?: number;
}) {
  const observation = useTaskObservation(taskId);
  const { pause: pauseObservation, capture: captureObservation } = observation;
  const [parent, setParent] = React.useState<WirePersistentTask | null>(null);
  const [child, setChild] = React.useState<WirePersistentTask | null>(null);
  const [checkpoint, setCheckpoint] = React.useState<ImportCheckpoint>({
    itemId: null,
    transcriptStatus: null,
    transcriptTaskIds: [],
  });
  const [queryFailed, setQueryFailed] = React.useState(false);

  React.useEffect(() => {
    if (!taskId || !ownerId || error) return;
    let abandoned = false;
    void (async () => {
      const isCurrent = captureObservation();
      for (let attempt = 0; ; attempt += 1) {
        if (attempt > 0 && attempt % MAX_POLLS === 0 && !await pauseObservation()) return;
        if (abandoned || !isCurrent()) return;
        try {
          const parentRows = (await client.listExecutionTasks({
            params: undefined,
            query: {
              page: 1,
              pageSize: 20,
              kind: "share_import",
              ownerId,
            },
            body: undefined,
          })) as unknown as WirePersistentTask[];
          const currentParent =
            parentRows.find((task) => task.id === taskId) ?? null;
          if (abandoned || !isCurrent()) return;
          if (currentParent) {
            setParent(currentParent);
            const parsed = parseImportCheckpoint(currentParent.checkpoint);
            setCheckpoint(parsed);

            if (
              currentParent.status === "succeeded" &&
              action === "archive_and_transcribe" &&
              parsed.itemId
            ) {
              const childRows = (await client.listExecutionTasks({
                params: undefined,
                query: {
                  page: 1,
                  pageSize: 20,
                  kind: "transcribe",
                  ownerId: parsed.itemId,
                },
                body: undefined,
              })) as unknown as WirePersistentTask[];
              const currentChild =
                (parsed.transcriptTaskIds.length > 0
                  ? childRows.find((task) =>
                      parsed.transcriptTaskIds.includes(task.id),
                    )
                  : childRows[0]) ?? null;
              if (abandoned || !isCurrent()) return;
              setChild(currentChild);
              if (currentChild && isTerminal(currentChild.status)) {
                return;
              }
              if (
                !currentChild &&
                ["done", "skipped"].includes(parsed.transcriptStatus ?? "")
              ) {
                return;
              }
            } else if (isTerminal(currentParent.status)) {
              return;
            }
          }
          setQueryFailed(false);
        } catch {
          if (!abandoned && attempt === MAX_POLLS - 1) setQueryFailed(true);
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    })();
    return () => {
      abandoned = true;
    };
  }, [action, error, ownerId, pollIntervalMs, taskId, pauseObservation, captureObservation]);

  const failedTask =
    parent && ["failed", "blocked", "cancelled"].includes(parent.status)
      ? parent
      : child && ["failed", "blocked", "cancelled"].includes(child.status)
        ? child
        : null;
  const recovery = failedTask
    ? recoveryMessage(failedTask.errorCode)
    : null;
  const archiveDone = parent?.status === "succeeded";
  const transcriptDone =
    child?.status === "succeeded" ||
    (!child &&
      ["done", "skipped"].includes(checkpoint.transcriptStatus ?? ""));
  const isDone =
    archiveDone && (action === "archive" || transcriptDone);

  return (
    <div
      data-slot="chat-douyin-share-card"
      data-parent-status={parent?.status ?? "unknown"}
      data-child-status={child?.status ?? "unknown"}
      className="mt-1 flex w-full max-w-[420px] flex-col gap-2 rounded-[10px] border border-border bg-surface p-2.5 text-[12px]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">
          {action === "archive"
            ? "抖音内容建档"
            : "抖音内容建档 + 逐字稿"}
        </span>
        <span
          className={
            failedTask
              ? "text-destructive"
              : isDone
                ? "text-success"
                : "text-muted-foreground"
          }
        >
          {failedTask ? "需要处理" : isDone ? "已完成" : "处理中"}
        </span>
      </div>

      {error || !taskId || !ownerId ? (
        <p data-slot="chat-douyin-share-error" className="text-destructive">
          {error ?? "没有拿到持久任务编号，本次未开始建档。"}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div
            data-slot="chat-douyin-parent-status"
            className="flex items-center justify-between gap-3"
          >
            <span className="text-muted-foreground">作品建档</span>
            <span>{statusLabel(parent?.status ?? null, "正在读取作品")}</span>
          </div>
          {action === "archive_and_transcribe" ? (
            <div
              data-slot="chat-douyin-child-status"
              className="flex items-center justify-between gap-3"
            >
              <span className="text-muted-foreground">语音转写</span>
              <span>
                {!archiveDone
                  ? "等待建档完成"
                  : child
                    ? statusLabel(child.status, "正在识别语音")
                    : checkpoint.transcriptStatus === "done"
                      ? "已完成"
                      : checkpoint.transcriptStatus === "skipped"
                        ? "无可转写音频，已跳过"
                        : "等待转写任务同步"}
              </span>
            </div>
          ) : (
            <p
              data-slot="chat-douyin-no-transcript"
              className="text-[11px] text-muted-foreground"
            >
              这次只建档；你本轮没有要求转写，所以不会自动跑 ASR。
            </p>
          )}
        </div>
      )}

      {recovery ? (
        <div
          data-slot="chat-douyin-recovery"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive"
        >
          <p>{recovery.text}</p>
          {recovery.href && recovery.link ? (
            <a className="mt-1 inline-block underline" href={recovery.href}>
              {recovery.link} →
            </a>
          ) : null}
        </div>
      ) : null}

      <TaskObservationNotice {...observation} />
      {queryFailed ? (
        <p data-slot="chat-douyin-query-error" className="text-warning">
          暂时读不到后台任务状态；任务已经持久化，可稍后回到这里查看。
        </p>
      ) : null}
      <span className="text-[10px] text-text-subtle">任务 {taskId ?? "未创建"}</span>
    </div>
  );
}
