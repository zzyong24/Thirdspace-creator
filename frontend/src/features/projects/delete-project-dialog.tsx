"use client";

/**
 * DeleteProjectDialog — 项目物理删除的系统级二次确认框(T-102)。
 *
 * 归档(archive)是软隐藏、可在「已归档」tab 找回;删除(delete)是不可恢复的物理
 * 清除 —— 契约 projects.delete 会级联删掉该项目的脚本 / 发布记录 / 复盘 / 数据。所以
 * 删除入口一律经此框二次确认(禁浏览器原生 confirm,T-097 no-alert lint):
 *
 *   触发(菜单项/按钮)-> 打开本框(只弹框,不删)-> 用户确认 -> client.deleteProject
 *   -> onDeleted()(调用方 router.refresh + 视情况跳转);取消 -> 关框,不删。
 *
 * 导入的抖音历史作品(source==='imported',含真实发布数据)额外强调「含真实作品数据」,
 * 但不拦死 —— 用户要的是能删(用户裁决 2026-07-03)。
 *
 * 受控组件:open / onOpenChange 由调用方持有(菜单项点开时置 open=true),这样菜单
 * 关闭与框显示不打架。删除自身的 pending / 错误态在本组件内部管。
 */

import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { client } from "@/lib/contract-client";
import type { ProjectSource } from "@/types/domain";

export interface DeleteProjectDialogProps {
  readonly projectId: string;
  readonly projectTitle: string;
  /** 项目来源;imported = 真实采集的历史作品,确认文案额外强调含真实数据。 */
  readonly source?: ProjectSource;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** 删除成功回调(调用方做 router.refresh + 视情况跳转)。 */
  readonly onDeleted: () => void;
}

export function DeleteProjectDialog({
  projectId,
  projectTitle,
  source,
  open,
  onOpenChange,
  onDeleted,
}: DeleteProjectDialogProps) {
  const [pending, setPending] = React.useState(false);
  const pendingRef = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);
  const imported = source === "imported";

  // 开关变化时:关框顺手清掉上次的错误态(下次打开是干净的)。用包装的 onOpenChange
  // 替代 useEffect+setState(避免 react-hooks/set-state-in-effect;不在 effect 里同步 setState)。
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) setError(null);
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const onConfirm = React.useCallback(() => {
    if (pendingRef.current) return; // 同步互斥,防双发
    pendingRef.current = true;
    setPending(true);
    setError(null);
    void (async () => {
      try {
        await client.deleteProject({
          params: { projectId },
          query: undefined,
          body: undefined,
        });
        handleOpenChange(false);
        onDeleted();
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        // 404(并发下已被删)转人话;其余给兜底。禁浏览器 alert,内联错误条展示。
        setError(
          raw.includes("404") || /not found/i.test(raw)
            ? "该项目已不存在，可能已被删除。"
            : "删除失败，请稍后重试。",
        );
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    })();
  }, [projectId, onDeleted, handleOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-slot="delete-project-dialog">
        <DialogHeader>
          <DialogTitle data-slot="delete-project-title">
            删除项目「{projectTitle}」？
          </DialogTitle>
          <DialogDescription data-slot="delete-project-warning">
            删除<strong className="text-destructive">不可恢复</strong>
            ，将一并清除该项目的脚本、发布记录、复盘与数据。若只想暂时隐藏，请改用「归档」。
            {imported ? (
              <>
                <br />
                <span className="text-destructive">
                  该项目含真实作品数据（导入的历史作品），删除后其发布记录与评论关联将一并清除。
                </span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p
            data-slot="delete-project-error"
            role="alert"
            className="text-[12px] leading-snug text-destructive"
          >
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => handleOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
            data-slot="delete-project-confirm"
          >
            {pending ? "删除中…" : "永久删除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeleteProjectDialog;
