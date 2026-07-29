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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
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
      setError("授权已保存，但应用未能自动重新进入，请手动重启 CreatorOS");
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
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(parsed.toString());
  }

  return (
    <section
      aria-label="账号权益领取"
      className="grid gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4"
    >
      <div className="grid gap-1">
        <h2 className="text-sm font-semibold">已有账号权益？</h2>
        <p className="text-xs text-muted-foreground">
          在官方网页确认归属后直接激活，不需要复制长期激活码。
        </p>
      </div>

      {!view ? (
        <Button type="button" disabled={busy} onClick={() => void start()}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          领取并激活
        </Button>
      ) : view.state === "activated" ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium text-emerald-700">{view.message}</p>
          <p className="text-xs text-muted-foreground">
            授权和渠道配置已经安全保存，重新进入后即可使用。
          </p>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void enterCreatorOs()}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            进入 CreatorOS
          </Button>
        </div>
      ) : view.state === "restartRequired" ? (
        <div className="grid gap-2">
          <p className="text-sm text-amber-700">{view.message}</p>
          <Button type="button" disabled={busy} onClick={() => void start()}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            重新领取
          </Button>
        </div>
      ) : view.state === "revoked" ? (
        <p className="text-sm text-destructive">{view.message}</p>
      ) : (
        <div className="grid gap-3">
          {view.userCode ? (
            <div className="rounded-md bg-background p-3 text-center">
              <p className="text-xs text-muted-foreground">短时验证码</p>
              <p className="mt-1 font-mono text-xl font-semibold tracking-widest">
                {view.userCode}
              </p>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">{view.message}</p>
          <div className="grid grid-cols-2 gap-2">
            {view.verificationUrl ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void openVerificationPage()}
              >
                <ExternalLink />
                打开领取页面
              </Button>
            ) : null}
            <Button type="button" disabled={busy} onClick={() => void poll()}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {view.state === "recovering" ? "继续恢复" : "检查确认结果"}
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
