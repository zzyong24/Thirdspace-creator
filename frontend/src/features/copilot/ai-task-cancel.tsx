"use client";

/**
 * `TaskCancelButton` — [T-248B①] AI 任务「取消」入口(ai.tasks.cancel 前端接线)。
 *
 * 契约 op 在 contract/src/operations/ai.ts(ai.tasks.cancel),后端 transport 已实现,
 * 此前前端零调用方 —— 用户在「最近任务/继续任务」里看得到排队/进行中的任务,却没有
 * 任何停止手段。本组件只对**未终态**任务(queued / running / awaiting_confirmation)
 * 渲染「取消」按钮;终态(succeeded / failed / cancelled)返回 null,不给假动作。
 *
 * 交互(全站禁原生 window.confirm,危险操作走 Dialog 双按钮确认门,对齐
 * assets-interactive-region.tsx 的回收站确认模式):
 *   点「取消」→ Dialog「确定取消这个 AI 任务?」→ 确认 → client.cancelTask →
 *   成功后关闭弹窗并回调 onCancelled(调用侧刷新任务列表);失败在弹窗内诚实渲错,
 *   不假装已取消。
 */

import * as React from "react";

import { client } from "@/lib/contract-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// 可取消 = §12 状态机的三个未终态。终态任务没有「取消」语义(已跑完/已失败/已取消)。
const CANCELLABLE_STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "running",
  "awaiting_confirmation",
]);

/** 纯判据(可单测):该状态下是否允许取消。 */
export function isCancellableStatus(status: string): boolean {
  return CANCELLABLE_STATUSES.has(status);
}

export function TaskCancelButton({
  taskId,
  status,
  onCancelled,
}: {
  readonly taskId: string;
  readonly status: string;
  /** 取消成功后的回调(调用侧刷新 ai.tasks.list feed)。 */
  readonly onCancelled?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // 终态任务不渲染任何入口 —— 没有可取消的东西,不摆假按钮。
  if (!isCancellableStatus(status)) return null;

  function confirmCancel() {
    if (pending) return;
    setPending(true);
    setError(null);
    void (async () => {
      try {
        await client.cancelTask({
          params: { taskId },
          query: undefined,
          body: undefined,
        });
        setOpen(false);
        onCancelled?.();
      } catch {
        // 取消失败(任务可能已进终态/网络错)—— 弹窗内诚实渲错,由用户重试或关闭。
        setError("取消失败，任务可能已结束，请刷新后重试。");
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        data-slot="task-cancel-trigger"
        data-task-id={taskId}
        className="shrink-0 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        取消
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(false);
            setError(null);
          }
        }}
      >
        <DialogContent data-slot="task-cancel-confirm" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>取消这个 AI 任务?</DialogTitle>
            <DialogDescription>
              确定取消这个 AI 任务?已产生的中间结果不会保留。
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p
              data-slot="task-cancel-error"
              role="status"
              className="text-xs text-destructive"
            >
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              data-slot="task-cancel-dismiss"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              先不取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-slot="task-cancel-confirm-button"
              disabled={pending}
              onClick={confirmCancel}
            >
              {pending ? "取消中…" : "确认取消"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
