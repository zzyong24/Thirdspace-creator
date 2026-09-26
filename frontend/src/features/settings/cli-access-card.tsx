"use client";

import * as React from "react";
import { CheckCircle2, Loader2, TerminalSquare, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/project/section-card";

interface CliAccessStatus {
  readonly supported: boolean;
  readonly ready: boolean;
  readonly installed: boolean;
  readonly enabled: boolean;
  readonly productId: string | null;
  readonly expiresAt: number | null;
  readonly commandPath: string | null;
  readonly activeConnections: number;
  readonly lastInvocationAt: number | null;
}

type Phase = "loading" | "ready" | "changing" | "unavailable" | "error";

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "未能更新 CLI 访问状态，请稍后重试";
}

function expiryLabel(expiresAt: number | null): string | null {
  if (!expiresAt) return null;
  const value = new Date(expiresAt);
  if (Number.isNaN(value.getTime())) return null;
  return value.toLocaleString("zh-CN", { hour12: false });
}

function timestampLabel(value: number | null | undefined): string {
  if (!value) return "暂无调用";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "暂无调用"
    : date.toLocaleString("zh-CN", { hour12: false });
}

/**
 * [T-843] 桌面原生壳拥有授权文件和撤销能力；网页只展示真实状态并调用三个最小 IPC，
 * 不接触 token、端口、文件路径或业务数据。
 */
export function CliAccessCard() {
  const [status, setStatus] = React.useState<CliAccessStatus | null>(null);
  const [phase, setPhase] = React.useState<Phase>("loading");
  const [message, setMessage] = React.useState("");

  const refresh = React.useCallback(async () => {
    if (!isTauriRuntime()) {
      setPhase("unavailable");
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const next = await invoke<CliAccessStatus>("cli_access_status");
      setStatus(next);
      setPhase(next.supported ? "ready" : "unavailable");
      setMessage("");
    } catch (error) {
      setPhase("error");
      setMessage(errorMessage(error));
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const changeAccess = React.useCallback(async (enable: boolean) => {
    if (phase === "changing") return;
    setPhase("changing");
    setMessage("");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const next = await invoke<CliAccessStatus>(
        enable ? "cli_access_enable" : "cli_access_revoke",
      );
      setStatus(next);
      setPhase("ready");
    } catch (error) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        setStatus(await invoke<CliAccessStatus>("cli_access_status"));
      } catch { setStatus(null); }
      setPhase("error");
      setMessage(errorMessage(error));
    }
  }, [phase]);

  const enabled = status?.enabled === true;
  const expires = expiryLabel(status?.expiresAt ?? null);

  return (
    <SectionCard
      title="Codex 与 CLI 完整访问"
      description="让 Codex 通过 CreatorOS 的正式能力读取和操作你的定位、选题、项目、稿件、素材、作品数据与抖音账号。"
      action={
        <span
          data-slot="cli-access-status"
          data-enabled={enabled}
          className={enabled
            ? "inline-flex h-6 items-center rounded-md bg-success-soft px-2 text-xs font-medium text-success"
            : "inline-flex h-6 items-center rounded-md bg-surface-subtle px-2 text-xs font-medium text-muted-foreground"}
        >
          {enabled ? "已开启 · 启动时自动开启" : "未开启"}
        </span>
      }
    >
      <div data-slot="cli-access-card" className="flex flex-col gap-3">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-subtle/50 p-3">
          <TerminalSquare aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand" />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-foreground">
              {status?.installed === false ? "命令入口尚未安装" : "命令行随桌面版安装"}
            </p>
            <p className="mt-1 leading-5 text-muted-foreground">
              CLI 默认随应用启动开启；关闭后会记住你的选择。每次启动重新签发访问凭据，退出时清理凭据。不会暴露模型密钥、登录 Cookie 或内部数据库。
            </p>
            {enabled && expires ? (
              <p className="mt-1 text-xs text-muted-foreground">当前连接有效至 {expires}，应用运行期间自动续期</p>
            ) : null}
            {status?.commandPath ? (
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                {status.commandPath}
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
          Codex 并行操作多个账号时，每条命令都会显式指定真实账号；保存的默认账号只用于人工连续操作，不会改变桌面端当前账号。
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <span>近 5 分钟连接：{status?.activeConnections ?? 0}</span>
          <span>上次调用：{timestampLabel(status?.lastInvocationAt)}</span>
        </div>

        {phase === "unavailable" ? (
          <p className="text-sm text-muted-foreground">请在 CreatorOS 桌面版中开启；浏览器版不提供本机 CLI 授权。</p>
        ) : null}
        {phase === "error" ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {message}
          </p>
        ) : null}
        {enabled ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            CreatorOS 已接受当前 OS 用户发起的完整读写调用
          </p>
        ) : null}

        {phase !== "unavailable" ? (
          <div className="flex justify-end border-t border-border pt-3">
            <Button
              type="button"
              size="sm"
              variant={enabled ? "outline" : "default"}
              disabled={phase === "loading" || phase === "changing" || status?.ready === false}
              onClick={() => void changeAccess(!enabled)}
            >
              {phase === "loading" || phase === "changing" ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              {enabled ? "关闭并记住" : "开启并记住"}
            </Button>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
