"use client";

import * as React from "react";
import { CheckCircle2, Copy, Download, Loader2, TerminalSquare, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/project/section-card";

interface McpLaunch {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

interface CliAccessStatus {
  readonly supported: boolean;
  readonly ready: boolean;
  readonly installed: boolean;
  readonly enabled: boolean;
  readonly productId: string | null;
  readonly expiresAt: number | null;
  readonly commandPath: string | null;
  readonly mcpLaunch?: McpLaunch | null;
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
  const [handoffMessage, setHandoffMessage] = React.useState("");
  const [handoffError, setHandoffError] = React.useState("");
  const [transferring, setTransferring] = React.useState(false);
  const transferInFlight = React.useRef(false);
  const mounted = React.useRef(true);
  const handoffRevision = React.useRef(0);

  const refresh = React.useCallback(async () => {
    if (!isTauriRuntime()) {
      setPhase("unavailable");
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const next = await invoke<CliAccessStatus>("cli_access_status");
      if (!mounted.current) return;
      setStatus(next);
      setPhase(next.supported ? "ready" : "unavailable");
      setMessage("");
    } catch (error) {
      if (!mounted.current) return;
      setPhase("error");
      setMessage(errorMessage(error));
    }
  }, []);

  React.useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; handoffRevision.current += 1; };
  }, [refresh]);

  const changeAccess = React.useCallback(async (enable: boolean) => {
    if (phase === "changing") return;
    setPhase("changing");
    setMessage("");
    handoffRevision.current += 1;
    setHandoffMessage("");
    setHandoffError("");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const next = await invoke<CliAccessStatus>(
        enable ? "cli_access_enable" : "cli_access_revoke",
      );
      if (!mounted.current) return;
      setStatus(next);
      setPhase("ready");
    } catch (error) {
      if (!mounted.current) return;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const next = await invoke<CliAccessStatus>("cli_access_status");
        if (!mounted.current) return;
        setStatus(next);
      } catch { if (mounted.current) setStatus(null); }
      if (!mounted.current) return;
      setPhase("error");
      setMessage(errorMessage(error));
    }
  }, [phase]);

  const transferConfig = React.useCallback(async (kind: "copy" | "download") => {
    const launch = status?.mcpLaunch;
    if (transferInFlight.current || phase !== "ready" || status?.ready !== true ||
        status.enabled !== true || !launch) return;
    transferInFlight.current = true;
    const revision = handoffRevision.current;
    setTransferring(true);
    setHandoffMessage("");
    setHandoffError("");
    try {
      // Native shell owns executable discovery; this UI only serializes its nonsecret argv.
      const config = `${JSON.stringify({ mcpServers: { creatoros: { type: "stdio", ...launch } } }, null, 2)}\n`;
      if (kind === "copy") {
        if (!navigator.clipboard?.writeText) throw new Error("系统剪贴板不可用，请使用下载连接配置");
        await navigator.clipboard.writeText(config);
      } else {
        const url = URL.createObjectURL(new Blob([config], { type: "application/json;charset=utf-8" }));
        const link = document.createElement("a");
        try {
          link.href = url;
          link.download = "creatoros-workbuddy.mcp.json";
          document.body.appendChild(link);
          link.click();
        } finally {
          link.remove();
          // Let the host consume the click before releasing the download URL.
          setTimeout(() => URL.revokeObjectURL(url), 0);
        }
      }
      if (mounted.current && revision === handoffRevision.current) {
        setHandoffMessage(kind === "copy"
          ? "已复制配置，请在 WorkBuddy 中添加并确认首次信任。"
          : "已生成连接配置，请在 WorkBuddy 中添加并确认首次信任。");
      }
    } catch (error) {
      if (mounted.current && revision === handoffRevision.current) setHandoffError(errorMessage(error));
    } finally {
      transferInFlight.current = false;
      if (mounted.current) setTransferring(false);
    }
  }, [phase, status]);

  const enabled = status?.enabled === true;
  const expires = expiryLabel(status?.expiresAt ?? null);
  const canTransfer = phase === "ready" && status?.ready === true && enabled && Boolean(status.mcpLaunch);

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

        <section aria-labelledby="workbuddy-mcp-heading" className="rounded-lg border border-border p-4 text-sm">
          <h3 id="workbuddy-mcp-heading" className="font-medium text-foreground">WorkBuddy 外部工具接入</h3>
          <p className="mt-2 leading-6 text-muted-foreground">
            在 WorkBuddy 的 MCP 管理中添加 CreatorOS，让其对话使用本产品的项目、稿件与素材工具。
            首次信任和工具调用需在 WorkBuddy 中确认；这里不会修改你的 WorkBuddy 配置或选择应用内引擎。
          </p>
          {canTransfer ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={transferring} onClick={() => void transferConfig("copy")}>
                <Copy aria-hidden="true" className="size-4" />复制 MCP 配置
              </Button>
              <Button type="button" variant="outline" disabled={transferring} onClick={() => void transferConfig("download")}>
                <Download aria-hidden="true" className="size-4" />下载连接配置
              </Button>
            </div>
          ) : (
            <p className="mt-3 leading-6 text-muted-foreground">
              {phase === "unavailable" ? "请在桌面版生成本机连接配置。" :
                !enabled ? "开启 CreatorOS CLI 访问后可生成连接配置。" :
                  "本机 MCP 启动入口尚未就绪，请更新桌面版或检查安装文件。"}
            </p>
          )}
          <p className="mt-3 leading-6 text-muted-foreground">
            保留已有 MCP 服务器，只添加配置中的 creatoros 项。保持 CreatorOS 运行，并在 WorkBuddy 选择真实账号与项目。
          </p>
          {handoffMessage ? <p role="status" className="mt-3 leading-6 text-success">{handoffMessage}</p> : null}
          {handoffError ? <p role="alert" className="mt-3 leading-6 text-danger">{handoffError}</p> : null}
        </section>

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
