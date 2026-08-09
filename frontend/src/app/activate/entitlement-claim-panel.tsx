"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";

type ClaimView = {
  readonly state:
    | "awaitingApproval"
    | "recovering"
    | "restartRequired"
    | "revoked"
    | "activated";
  readonly userCode: string | null;
  readonly verificationUrl: string | null;
  readonly expiresAt: string | null;
  readonly retryAfterSeconds: number | null;
  readonly message: string;
};

const CLAIM_FAILED_MESSAGE =
  "领取没有完成，请稍后重试。你原来已经可以使用的产品不会受影响。";

async function invokeClaim(command: string): Promise<ClaimView> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ClaimView>(command);
}

export function EntitlementClaimPanel({
  enabled,
}: {
  readonly enabled: boolean;
}): React.JSX.Element | null {
  const [view, setView] = React.useState<ClaimView | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!enabled) return;
    let active = true;
    void invokeClaim("entitlement_claim_resume")
      .then((result) => {
        if (active && result) setView(result);
      })
      .catch(() => {
        // 没有 pending journal 是正常首态；秘密与技术错误不进入普通 UI。
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  if (!enabled) return null;

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setView(await invokeClaim("entitlement_claim_start"));
    } catch {
      // Native 失败可能包含协议、存储或服务细节；普通页面只显示可行动的人话。
      setError(CLAIM_FAILED_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  async function poll() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await invokeClaim("entitlement_claim_poll");
      setView(result);
    } catch {
      setError(CLAIM_FAILED_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  async function enterCreatorOs() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      setError("授权已保存，但应用未能自动重新进入，请手动重启应用");
      setBusy(false);
    }
  }

  async function openVerificationPage() {
    if (!view?.verificationUrl) return;
    const parsed = new URL(view.verificationUrl);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      setError("领取页面地址未通过安全校验");
      return;
    }
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(parsed.toString());
    } catch {
      setError("没有打开官方页面，请稍后再试。");
    }
  }

  return (
    <section
      aria-label="领取产品"
      className="grid gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4"
    >
      <div className="grid gap-1">
        <h2 className="text-sm font-semibold">已经购买产品？</h2>
        <p className="text-xs text-muted-foreground">
          在官方页面确认后，就能在这台电脑上使用已购买的产品。
        </p>
      </div>

      {!view ? (
        <Button type="button" disabled={busy} onClick={() => void start()}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          领取产品
        </Button>
      ) : view.state === "activated" ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium text-emerald-700">
            产品已领取
          </p>
          <p className="text-xs text-muted-foreground">
            重新进入应用后就可以使用。
          </p>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void enterCreatorOs()}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            进入应用
          </Button>
        </div>
      ) : view.state === "restartRequired" ? (
        <div className="grid gap-2">
          <p className="text-sm text-amber-700">
            这次领取已失效，请重新领取产品。
          </p>
          <Button type="button" disabled={busy} onClick={() => void start()}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            重新领取产品
          </Button>
        </div>
      ) : view.state === "revoked" ? (
        <p className="text-sm text-destructive">
          这个产品目前无法领取，请联系购买时的服务方。
        </p>
      ) : (
        <div className="grid gap-3">
          {view.userCode ? (
            <div className="rounded-md bg-background p-3 text-center">
              <p className="text-xs text-muted-foreground">验证码</p>
              <p className="mt-1 font-mono text-xl font-semibold tracking-widest">
                {view.userCode}
              </p>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {view.state === "recovering"
              ? "正在继续上次未完成的领取。"
              : "完成官方页面确认后，回到这里继续。"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {view.verificationUrl ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void openVerificationPage()}
              >
                <ExternalLink />
                去官方页面确认
              </Button>
            ) : null}
            <Button type="button" disabled={busy} onClick={() => void poll()}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {view.state === "recovering"
                ? "继续完成领取"
                : "我已确认，继续"}
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
