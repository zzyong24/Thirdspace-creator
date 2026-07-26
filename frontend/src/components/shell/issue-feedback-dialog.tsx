"use client";

import { localSupportChannelResponse } from "@creatoros/contract";
import {
  Bug,
  Copy,
  ExternalLink,
  FolderOpen,
  Loader2,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getAppVersion } from "@/lib/desktop-updater";
import { cn } from "@/lib/utils";
import {
  buildIssueFeedbackText,
  feedbackDescriptionLength,
} from "./issue-feedback";

type CopyState = "editing" | "copied" | "copy_failed";
type ChannelState =
  | "loading"
  | "ready"
  | "channel_missing"
  | "channel_opening"
  | "channel_opened"
  | "channel_open_failed";
type LogsState =
  | "idle"
  | "logs_opening"
  | "logs_opened"
  | "logs_open_failed";

function runtimeOs(): string {
  if (typeof navigator === "undefined") return "未知";
  return navigator.platform || navigator.userAgent || "未知";
}

export function IssueFeedbackDialog({
  pathname,
  collapsed,
  correlationId,
}: {
  readonly pathname: string;
  readonly collapsed: boolean;
  readonly correlationId?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [description, setDescription] = React.useState("");
  const [occurredAt, setOccurredAt] = React.useState(() => new Date());
  const [appVersion, setAppVersion] = React.useState<string | null>(null);
  const [supportUrl, setSupportUrl] = React.useState<string | null>(null);
  const [copyState, setCopyState] = React.useState<CopyState>("editing");
  const [channelState, setChannelState] =
    React.useState<ChannelState>("loading");
  const [logsState, setLogsState] = React.useState<LogsState>("idle");
  const [validationError, setValidationError] = React.useState<string | null>(
    null,
  );

  const preview = React.useMemo(
    () =>
      buildIssueFeedbackText({
        description,
        appVersion,
        os: runtimeOs(),
        route: pathname,
        occurredAt,
        correlationId,
      }),
    [appVersion, correlationId, description, occurredAt, pathname],
  );

  const handleOpenChange = React.useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      setOccurredAt(new Date());
      setCopyState("editing");
      setChannelState("loading");
      setLogsState("idle");
      setValidationError(null);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    let active = true;
    void getAppVersion().then((value) => {
      if (active) setAppVersion(value);
    });
    void fetch("/api/v1/local/support-channel", { method: "GET" })
      .then(async (response) => {
        if (!response.ok) throw new Error("support channel unavailable");
        return localSupportChannelResponse.parse(await response.json());
      })
      .then((result) => {
        if (!active) return;
        setSupportUrl(result.supportUrl);
        setChannelState(result.supportUrl ? "ready" : "channel_missing");
      })
      .catch(() => {
        if (!active) return;
        setSupportUrl(null);
        setChannelState("channel_missing");
      });
    return () => {
      active = false;
    };
  }, [open]);

  function validateDescription(): boolean {
    const length = feedbackDescriptionLength(description);
    if (length < 10) {
      setValidationError("问题描述至少 10 个字符");
      return false;
    }
    if (length > 4000) {
      setValidationError("问题描述不能超过 4000 个字符");
      return false;
    }
    setValidationError(null);
    return true;
  }

  async function copyFeedback() {
    if (!validateDescription()) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(preview);
      setCopyState("copied");
    } catch {
      setCopyState("copy_failed");
    }
  }

  async function openChannel() {
    if (!supportUrl || channelState === "channel_opening") return;
    setChannelState("channel_opening");
    try {
      const response = await fetch("/api/v1/local/open-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: supportUrl }),
      });
      const result = (await response.json()) as { ok?: unknown };
      setChannelState(
        response.ok && result.ok === true
          ? "channel_opened"
          : "channel_open_failed",
      );
    } catch {
      setChannelState("channel_open_failed");
    }
  }

  async function openLogs() {
    if (logsState === "logs_opening") return;
    setLogsState("logs_opening");
    try {
      const response = await fetch("/api/v1/local/reveal-logs", {
        method: "POST",
      });
      const result = (await response.json()) as { ok?: unknown };
      setLogsState(
        response.ok && result.ok === true ? "logs_opened" : "logs_open_failed",
      );
    } catch {
      setLogsState("logs_open_failed");
    }
  }

  const trigger = (
    <button
      type="button"
      aria-label="问题反馈"
      data-slot="issue-feedback-trigger"
      className={cn(
        "flex h-9 items-center rounded-lg text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        collapsed ? "w-9 justify-center" : "w-full gap-2 px-2.5",
      )}
    >
      <Bug aria-hidden="true" className="size-4 shrink-0" />
      {!collapsed ? <span>问题反馈</span> : null}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>问题反馈</DialogTitle>
          <DialogDescription>
            先复制整理好的内容，再打开反馈渠道粘贴提交。CreatorOS 不会自动发送或上传日志。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="issue-feedback-description" className="font-medium">
              问题描述
            </label>
            <Textarea
              id="issue-feedback-description"
              autoFocus
              value={description}
              maxLength={4200}
              rows={4}
              placeholder="请说明你做了什么、看到了什么，以及原本期待什么（10–4000 字）"
              aria-invalid={Boolean(validationError)}
              onChange={(event) => {
                setDescription(event.target.value);
                setValidationError(null);
                setCopyState("editing");
              }}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{feedbackDescriptionLength(description)} / 4000</span>
              {validationError ? (
                <span role="alert" className="text-destructive">
                  {validationError}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-end justify-between gap-4">
              <label htmlFor="issue-feedback-preview" className="font-medium">
                反馈内容预览
              </label>
              <span className="text-[11px] text-muted-foreground">
                不含日志正文与本机路径
              </span>
            </div>
            <div className="rounded-xl border border-border bg-muted/35 p-1">
              <Textarea
                id="issue-feedback-preview"
                aria-label="反馈内容预览"
                readOnly
                value={preview}
                rows={7}
                className="border-0 bg-transparent font-mono text-xs shadow-none"
              />
            </div>
          </div>

          <div
            aria-live="polite"
            className="grid min-h-5 gap-1 text-xs text-muted-foreground"
          >
            {copyState === "copied" ? (
              <p>反馈内容已复制，请在反馈渠道中粘贴提交</p>
            ) : copyState === "copy_failed" ? (
              <p className="text-destructive">复制失败，请手动选择上方内容复制</p>
            ) : null}
            {channelState === "loading" ? <p>正在读取反馈渠道</p> : null}
            {channelState === "channel_missing" ? (
              <p>当前没有可用的反馈渠道</p>
            ) : null}
            {channelState === "channel_opened" ? (
              <p>已请求打开反馈渠道，请在外部页面中粘贴并提交</p>
            ) : null}
            {channelState === "channel_open_failed" ? (
              <p className="text-destructive">
                未能打开反馈渠道，请重试或手动复制内容
              </p>
            ) : null}
            {logsState === "logs_opened" ? <p>日志文件夹已打开</p> : null}
            {logsState === "logs_open_failed" ? (
              <p className="text-destructive">
                未能打开日志文件夹；不影响复制反馈
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="sm:flex-wrap">
          <Button
            type="button"
            variant="outline"
            disabled={logsState === "logs_opening"}
            onClick={() => void openLogs()}
          >
            {logsState === "logs_opening" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <FolderOpen />
            )}
            打开日志文件夹
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={
              !supportUrl ||
              channelState === "loading" ||
              channelState === "channel_opening"
            }
            onClick={() => void openChannel()}
          >
            {channelState === "channel_opening" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <ExternalLink />
            )}
            打开反馈渠道
          </Button>
          <Button type="button" onClick={() => void copyFeedback()}>
            <Copy />
            复制反馈内容
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
