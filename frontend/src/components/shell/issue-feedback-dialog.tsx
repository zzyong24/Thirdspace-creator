"use client";

import {
  localChannelRuntimeResponse,
  localProductFeedbackResponse,
} from "@creatoros/contract";
import {
  Bug,
  Copy,
  ExternalLink,
  FolderOpen,
  Loader2,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Input } from "@/components/ui/input";
import { getAppVersion } from "@/lib/desktop-updater";
import { handshakeHeaders } from "@/lib/handshake-client";
import { PACKAGE_HUMAN_FEEDBACK_URL } from "@/lib/package-brand";
import { getRuntimeSystemLabel } from "@/lib/runtime-system-info";
import { cn } from "@/lib/utils";
import {
  buildProductFeedbackPreview,
  feedbackDescriptionLength,
  redactSensitiveText,
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
type SubmitState =
  | { readonly state: "idle" }
  | { readonly state: "submitting" }
  | { readonly state: "failed"; readonly message: string }
  | { readonly state: "succeeded"; readonly publicRef: string };

function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID().toLowerCase();
}

export function IssueFeedbackDialog({
  collapsed,
  bugFeedbackUrl: cachedBugFeedbackUrl,
  packageHumanFeedbackUrl = PACKAGE_HUMAN_FEEDBACK_URL,
  submissionEnabled = process.env
    .NEXT_PUBLIC_CREATOROS_PRODUCT_FEEDBACK_SUBMIT_ENABLED === "1",
}: {
  readonly pathname: string;
  readonly collapsed: boolean;
  readonly correlationId?: string;
  /**
   * (creator) layout 从已验签 `.license` 读取一次后下传。undefined 仅保留给
   * 独立组件/旧嵌入方的兼容读取；正式侧边栏不会在每次开弹窗时重复读渠道运行时。
   */
  readonly bugFeedbackUrl?: string | null;
  /** 编译期 PackageManifest 的人工反馈页；渠道运行时缺失时只回退本包，不回退官方包。 */
  readonly packageHumanFeedbackUrl?: string | null;
  /** 包能力默认关闭；服务端还有独立 fail-closed 门，二者都开启才会真实提交。 */
  readonly submissionEnabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [summary, setSummary] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [appVersion, setAppVersion] = React.useState<string | null>(null);
  const [systemLabel, setSystemLabel] = React.useState("系统信息读取中");
  const [bugFeedbackUrl, setBugFeedbackUrl] = React.useState<string | null>(
    cachedBugFeedbackUrl ?? packageHumanFeedbackUrl,
  );
  const [copyState, setCopyState] = React.useState<CopyState>("editing");
  const [channelState, setChannelState] = React.useState<ChannelState>(
    cachedBugFeedbackUrl === undefined
      ? "loading"
      : cachedBugFeedbackUrl || packageHumanFeedbackUrl
        ? "ready"
        : "channel_missing",
  );
  const [logsState, setLogsState] = React.useState<LogsState>("idle");
  const [submitState, setSubmitState] = React.useState<SubmitState>({
    state: "idle",
  });
  const [idempotencyKey, setIdempotencyKey] = React.useState(() =>
    newIdempotencyKey(),
  );
  const [validationError, setValidationError] = React.useState<string | null>(
    null,
  );
  const [submissionConfirmed, setSubmissionConfirmed] = React.useState(false);

  const locale =
    typeof navigator === "undefined" ? "zh-CN" : navigator.language || "zh-CN";
  const preview = React.useMemo(
    () =>
      buildProductFeedbackPreview({
        summary,
        description,
        appVersion,
        os: systemLabel,
        locale,
      }),
    [
      appVersion,
      description,
      locale,
      summary,
      systemLabel,
    ],
  );
  // 自动提交只由固定 Growth API authority + 激活上下文授权；人工反馈页不再充当 API authority。
  const directSubmissionAvailable = submissionEnabled;

  const handleOpenChange = React.useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      setSystemLabel("系统信息读取中");
      setCopyState("editing");
      setBugFeedbackUrl(
        cachedBugFeedbackUrl ?? packageHumanFeedbackUrl,
      );
      setChannelState(
        cachedBugFeedbackUrl === undefined
          ? "loading"
          : cachedBugFeedbackUrl || packageHumanFeedbackUrl
            ? "ready"
            : "channel_missing",
      );
      setLogsState("idle");
      setSubmitState({ state: "idle" });
      setValidationError(null);
      setSubmissionConfirmed(false);
    }
  }, [cachedBugFeedbackUrl, packageHumanFeedbackUrl]);

  React.useEffect(() => {
    if (!open) return;
    let active = true;
    void getAppVersion().then((value) => {
      if (active) {
        setAppVersion(value);
        setSubmissionConfirmed(false);
      }
    });
    void getRuntimeSystemLabel().then((value) => {
      if (active) {
        setSystemLabel(value);
        setSubmissionConfirmed(false);
      }
    });
    return () => {
      active = false;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open || cachedBugFeedbackUrl !== undefined) return;
    let active = true;
    void fetch("/api/v1/local/channel-runtime", {
      method: "GET",
      headers: handshakeHeaders(),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("bug feedback channel unavailable");
        return localChannelRuntimeResponse.parse(await response.json());
      })
      .then((result) => {
        if (!active) return;
        const humanFeedbackUrl =
          result.bugFeedbackUrl ?? packageHumanFeedbackUrl;
        setBugFeedbackUrl(humanFeedbackUrl);
        setChannelState(
          humanFeedbackUrl ? "ready" : "channel_missing",
        );
      })
      .catch(() => {
        if (!active) return;
        setBugFeedbackUrl(packageHumanFeedbackUrl);
        setChannelState(
          packageHumanFeedbackUrl ? "ready" : "channel_missing",
        );
      });
    return () => {
      active = false;
    };
  }, [cachedBugFeedbackUrl, open, packageHumanFeedbackUrl]);

  function validateSummary(): boolean {
    const summaryLength = Array.from(summary.trim()).length;
    if (summaryLength < 5) {
      setValidationError("问题摘要至少 5 个字符");
      return false;
    }
    if (summaryLength > 160) {
      setValidationError("问题摘要不能超过 160 个字符");
      return false;
    }
    return true;
  }

  function validateDescription(): boolean {
    const length = feedbackDescriptionLength(description);
    if (length < 1) {
      setValidationError("请填写问题描述");
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

  async function submitFeedback() {
    if (
      submitState.state === "submitting" ||
      !submissionConfirmed ||
      !validateSummary() ||
      !validateDescription()
    ) {
      return;
    }
    setSubmitState({ state: "submitting" });
    try {
      const response = await fetch("/api/v1/local/product-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          ...handshakeHeaders(),
        },
        body: JSON.stringify({
          summary: redactSensitiveText(
            summary.replace(/\r\n?/g, "\n").trim(),
          ),
          description: redactSensitiveText(
            description.replace(/\r\n?/g, "\n").trim(),
          ),
          reproductionSteps: "",
          appVersion: appVersion?.trim() || "未知",
          osName: systemLabel,
          locale: navigator.language || "zh-CN",
        }),
      });
      const result = localProductFeedbackResponse.parse(await response.json());
      if (response.status === 202 && result.ok) {
        setSubmitState({
          state: "succeeded",
          publicRef: result.publicRef,
        });
        return;
      }
      setSubmitState({
        state: "failed",
        message: result.ok
          ? "反馈服务响应异常，请稍后重试"
          : result.message,
      });
    } catch {
      setSubmitState({
        state: "failed",
        message: "反馈服务暂时不可用，请稍后重试",
      });
    }
  }

  async function openChannel() {
    if (!bugFeedbackUrl || channelState === "channel_opening") return;
    setChannelState("channel_opening");
    try {
      const response = await fetch("/api/v1/local/open-url", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...handshakeHeaders(),
        },
        body: JSON.stringify({ url: bugFeedbackUrl }),
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
        headers: handshakeHeaders(),
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
      aria-label="帮助与反馈"
      data-slot="issue-feedback-trigger"
      className={cn(
        "flex h-9 items-center rounded-lg text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        collapsed ? "w-9 justify-center" : "w-full gap-2 px-2.5",
      )}
    >
      <Bug aria-hidden="true" className="size-4 shrink-0" />
      {!collapsed ? <span>帮助与反馈</span> : null}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>帮助与反馈</DialogTitle>
          <DialogDescription>
            这里处理软件使用问题；购买、续费或交付问题，请到设置里的“产品与服务”联系服务方。请先检查下方内容；不会发送日志、附件、截图、激活码或其他内容。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="issue-feedback-summary" className="font-medium">
              问题摘要
            </label>
            <Input
              id="issue-feedback-summary"
              value={summary}
              maxLength={160}
              placeholder="一句话说明遇到的问题（5–160 字）"
              onChange={(event) => {
                setSummary(event.target.value);
                setValidationError(null);
                setCopyState("editing");
                setSubmitState({ state: "idle" });
                setIdempotencyKey(newIdempotencyKey());
                setSubmissionConfirmed(false);
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="issue-feedback-description" className="font-medium">
              问题描述
            </label>
            <Textarea
              id="issue-feedback-description"
              autoFocus
              value={description}
              maxLength={4000}
              rows={4}
              placeholder="请说明你做了什么、看到了什么，以及原本期待什么"
              aria-invalid={Boolean(validationError)}
              onChange={(event) => {
                setDescription(event.target.value);
                setValidationError(null);
                setCopyState("editing");
                setSubmitState({ state: "idle" });
                setIdempotencyKey(newIdempotencyKey());
                setSubmissionConfirmed(false);
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
                发送内容预览
              </label>
              <span className="text-[11px] text-muted-foreground">
                {directSubmissionAvailable
                  ? "下面就是应用内实际发送的内容"
                  : "可复制后粘贴到反馈页"}
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

          {directSubmissionAvailable ? (
            <label
              htmlFor="issue-feedback-confirmation"
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-muted/25 p-3 text-xs leading-5"
            >
              <Checkbox
                id="issue-feedback-confirmation"
                checked={submissionConfirmed}
                onCheckedChange={(checked) =>
                  setSubmissionConfirmed(checked === true)
                }
              />
              <span>
                我已检查并确认发送上方内容
                <span className="block text-muted-foreground">
                  不发送日志、附件、激活码、手机号或本机路径
                </span>
              </span>
            </label>
          ) : null}

          <div
            aria-live="polite"
            className="grid min-h-5 gap-1 text-xs text-muted-foreground"
          >
            {copyState === "copied" ? (
              <p>反馈内容已复制，请在反馈页中粘贴提交</p>
            ) : copyState === "copy_failed" ? (
              <p className="text-destructive">复制失败，请手动选择上方内容复制</p>
            ) : null}
            {channelState === "loading" ? <p>正在准备反馈页</p> : null}
            {channelState === "channel_missing" ? (
              <p>
                此版本暂不能在应用内发送。你可以复制上方文字，再打开反馈页完成提交。
              </p>
            ) : null}
            {channelState === "channel_opened" ? (
              <p>已请求打开反馈页，请在页面中粘贴并提交</p>
            ) : null}
            {channelState === "channel_open_failed" ? (
              <p className="text-destructive">
                未能打开反馈页，请重试或手动复制内容
              </p>
            ) : null}
            {logsState === "logs_opened" ? <p>日志文件夹已打开</p> : null}
            {logsState === "logs_open_failed" ? (
              <p className="text-destructive">
                未能打开日志文件夹；不影响复制反馈
              </p>
            ) : null}
            {submitState.state === "succeeded" ? (
              <p className="text-emerald-700">
                反馈已收到，编号 {submitState.publicRef}
              </p>
            ) : submitState.state === "failed" ? (
              <p className="text-destructive">{submitState.message}</p>
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
            查看本机日志
          </Button>
          <Button
            type="button"
            disabled={
              !bugFeedbackUrl ||
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
            打开反馈页
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void copyFeedback()}
          >
            <Copy />
            复制反馈内容
          </Button>
          {directSubmissionAvailable ? (
            <Button
              type="button"
              variant="outline"
              disabled={
                submitState.state === "submitting" ||
                !submissionConfirmed
              }
              title={
                !submissionConfirmed
                  ? "请先检查并确认发送内容"
                  : undefined
              }
              onClick={() => void submitFeedback()}
            >
              {submitState.state === "submitting" ? (
                <Loader2 className="animate-spin" />
              ) : null}
              {submitState.state === "submitting"
                ? "发送中…"
                : submitState.state === "failed"
                  ? "重新发送"
                  : "发送问题反馈"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
