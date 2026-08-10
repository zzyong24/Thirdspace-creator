"use client";

import * as React from "react";
import { KeyRound, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

type Phase = "idle" | "submitting" | "restarting" | "error";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "未能清理本机激活状态，请稍后重试";
}

/**
 * [T-746] 设置页激活卡内的最小交互入口。安全边界和重启时序全部在 Rust 原生命令内，
 * 前端不接收路径、激活码或服务地址，也不自行删除文件。
 */
export function ActivationResetControl({ visible }: { visible: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [message, setMessage] = React.useState("");
  const busy = phase === "submitting" || phase === "restarting";

  const submit = React.useCallback(() => {
    if (busy) return;
    setPhase("submitting");
    setMessage("");
    void (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("license_reset_local");
        // 正常正式包会由原生壳立即重启；保留此状态只覆盖重启事件尚未落地的极短窗口。
        setPhase("restarting");
      } catch (error) {
        setPhase("error");
        setMessage(errorMessage(error));
      }
    })();
  }, [busy]);

  if (!visible) return null;

  return (
    <>
      <div className="flex justify-end border-t border-border pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setPhase("idle");
            setMessage("");
            setOpen(true);
          }}
        >
          <KeyRound aria-hidden="true" className="size-4" />
          重新输入激活码
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
      >
        <DialogContent>
          <DialogTitle>重新输入激活码</DialogTitle>
          <DialogDescription>
            这只会清除这台电脑上的本地激活状态。CreatorOS 会重新启动，并回到激活页供你输入新码。
          </DialogDescription>

          <div className="rounded-md border border-border bg-surface-subtle p-3 text-sm text-muted-foreground">
            不会删除项目、素材、账号、模型配置、模型密钥或机器码，也不会解除服务端绑定。
          </div>

          {phase === "error" ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-soft p-3 text-sm text-danger"
            >
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{message}</span>
            </div>
          ) : null}

          {phase === "restarting" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              正在重新启动 CreatorOS…
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button type="button" disabled={busy} onClick={submit}>
              {phase === "submitting" ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              确认并重新启动
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
