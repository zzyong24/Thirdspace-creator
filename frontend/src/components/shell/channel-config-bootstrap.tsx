"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

const ENDPOINT = "/api/v1/local/client-config";
const RETRY_DELAYS_MS = [0, 1_000, 3_000, 10_000] as const;
const SCOPE_MISSING_ACTION = "授权缺少渠道信息，无法同步受管模型";
const BOOTSTRAP_COMPLETED_KEY = "creatoros:client-config-bootstrap-completed";
const BOOTSTRAP_FRESHNESS_MS = 5 * 60 * 1_000;

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

function hasBootstrappedInThisWindow(): boolean {
  try {
    const raw = window.sessionStorage.getItem(BOOTSTRAP_COMPLETED_KEY);
    if (!raw) return false;
    // 旧版本写入的布尔标记没有时效，会让同一个 WebView 永久停留在旧渠道 bundle。
    // 将它视为已过期，下一次挂载立即重新拉取；新版本只接受短时新鲜时间戳。
    const completedAt = Number(raw);
    return (
      Number.isFinite(completedAt) &&
      completedAt > 0 &&
      Date.now() - completedAt < BOOTSTRAP_FRESHNESS_MS
    );
  } catch {
    return false;
  }
}

function markBootstrappedInThisWindow(): void {
  try {
    window.sessionStorage.setItem(
      BOOTSTRAP_COMPLETED_KEY,
      String(Date.now()),
    );
  } catch {
    // WebView 禁用存储时仍允许同步；只是不依赖存储作为业务真相。
  }
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
      markBootstrappedInThisWindow();
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
 * 首次进入登录后布局时只做后台同步。失败状态由设置页渠道配置区读取并提供恢复动作，禁止在
 * 所有业务页面右下角常驻报错；成功后只广播安全事件。后台同步不得刷新整份文档，否则桌面端
 * 会在首屏已经可用后再次白屏，严重时形成 WebView 刷新风暴。
 */
export function ChannelConfigBootstrap(): React.JSX.Element | null {
  React.useEffect(() => {
    // 窗口级去重只负责限制后台拉取频率。同步后的消费者通过事件局部更新；这里绝不能调用
    // router.refresh()，否则白标首启/Windows WebView 重新挂载时会打穿去重并整页闪白。
    if (hasBootstrappedInThisWindow()) return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async (attempt: number): Promise<void> => {
      if (controller.signal.aborted) return;
      try {
        const result = await pullClientConfig(controller.signal, "bootstrap");
        if (result.ok) {
          markBootstrappedInThisWindow();
          broadcastSuccess();
          return;
        }
        if (!result.retryable) {
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      const next = attempt + 1;
      if (next >= RETRY_DELAYS_MS.length) {
        return;
      }
      timer = setTimeout(() => void run(next), RETRY_DELAYS_MS[next]);
    };

    void run(0);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
