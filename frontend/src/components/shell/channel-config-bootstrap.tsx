"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

const ENDPOINT = "/api/v1/local/client-config";
const RETRY_DELAYS_MS = [0, 1_000, 3_000, 10_000] as const;
const SCOPE_MISSING_ACTION = "授权缺少渠道信息，无法同步受管模型";

export const CLIENT_CONFIG_SYNCED_EVENT = "creatoros:client-config-synced";

type SyncResult = {
  readonly ok: boolean;
  readonly outcome: string;
  readonly action: string;
  readonly retryable: boolean;
};

function broadcastSuccess(): void {
  window.dispatchEvent(
    new CustomEvent(CLIENT_CONFIG_SYNCED_EVENT, {
      detail: { outcome: "configured" },
    }),
  );
}

async function pullClientConfig(
  signal: AbortSignal | undefined,
  trigger: "bootstrap" | "manual_revalidate",
): Promise<SyncResult> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    cache: "no-store",
    headers: { "x-creatoros-config-trigger": trigger },
    signal,
  });
  const body = (await response.json().catch(() => null)) as {
    outcome?: unknown;
    action?: unknown;
    retryable?: unknown;
  } | null;
  const outcome =
    typeof body?.outcome === "string" ? body.outcome : "unreachable";
  return {
    ok: response.ok,
    outcome,
    action:
      outcome === "activation_scope_missing"
        ? SCOPE_MISSING_ACTION
        : typeof body?.action === "string"
          ? body.action
          : "渠道配置暂时不可用，请稍后重试",
    retryable: body?.retryable === true,
  };
}

async function revalidateAndPull(): Promise<SyncResult> {
  const { invoke } = await import("@tauri-apps/api/core");
  const decision = await invoke<{ licensed?: unknown }>("license_check");
  if (decision?.licensed !== true) {
    return {
      ok: false,
      outcome: "license_unavailable",
      action: "激活权益复校未通过，请重新激活后再试",
      retryable: false,
    };
  }
  return pullClientConfig(undefined, "manual_revalidate");
}

/** 设置页与启动提示共用的真实恢复动作：Rust 在线复校 → 本地可信 route 同步 → 刷新 SSR。 */
export function ChannelConfigRetryButton({
  onSuccess,
}: {
  readonly onSuccess?: () => void;
}): React.JSX.Element {
  const { refresh } = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const retry = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await revalidateAndPull();
      if (!result.ok) {
        setError(result.action);
        return;
      }
      broadcastSuccess();
      refresh();
      onSuccess?.();
    } catch {
      setError("重新校验暂时不可用，请稍后重试");
    } finally {
      setPending(false);
    }
  };

  return (
    <span className="mt-2 flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => void retry()}
        className="rounded-md border border-current px-2.5 py-1.5 text-xs font-medium disabled:cursor-wait disabled:opacity-60"
      >
        {pending
          ? "正在重新校验并同步…"
          : "重新校验激活权益并重试配置同步"}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/**
 * 激活后的渠道配置引导器。
 *
 * 首次进入登录后布局时后台同步；明确不可重试错误会成为可见提示。成功后广播安全事件并刷新
 * Server Components，避免设置页停在启动期 local 投影。
 */
export function ChannelConfigBootstrap(): React.JSX.Element | null {
  const { refresh } = useRouter();
  const [blocked, setBlocked] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async (attempt: number): Promise<void> => {
      if (controller.signal.aborted) return;
      try {
        const result = await pullClientConfig(controller.signal, "bootstrap");
        if (result.ok) {
          setBlocked(null);
          broadcastSuccess();
          refresh();
          return;
        }
        if (!result.retryable) {
          setBlocked(result.action);
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      const next = attempt + 1;
      if (next >= RETRY_DELAYS_MS.length) {
        setBlocked("渠道配置暂时不可用，请稍后重试");
        return;
      }
      timer = setTimeout(() => void run(next), RETRY_DELAYS_MS[next]);
    };

    void run(0);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [refresh]);

  if (!blocked) return null;
  return (
    <div
      role="alert"
      data-slot="channel-config-bootstrap-error"
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-destructive/30 bg-background p-4 shadow-lg"
    >
      <p className="text-sm font-semibold text-foreground">{blocked}</p>
      <ChannelConfigRetryButton onSuccess={() => setBlocked(null)} />
    </div>
  );
}
