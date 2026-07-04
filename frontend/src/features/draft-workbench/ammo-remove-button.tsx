"use client";

/**
 * AmmoRemoveButton — 稿面弹药卡的「移除」动作(T-109)。
 *
 * 弹药 = material_link:一条把知识/素材挂到本项目的关联边。移除 = 解绑这条边
 * (deleteMaterialLink,契约 materialLinks.delete),**不删知识/素材实体本身**。
 * 所以确认文案诚实标注「只解绑与本项目的关联,不删除知识/素材本身」。
 *
 * 危险色小 icon 按钮 → 系统级 Dialog 二次确认(复用 delete-project-dialog 同款,
 * 禁浏览器原生 confirm/alert,T-097 no-alert lint)→ client.deleteMaterialLink({ linkId })
 * → router.refresh()。
 *
 * 关键:deleteMaterialLink 的目标是 **material_link 行的 id(linkId)**,不是 knowledge/
 * asset 的 entityId —— 用错会删不掉(甚至删错行)。linkId 由 draft-workbench-data 从
 * listMaterialLinks 的 link.id 投影进 ammo item。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

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

export function AmmoRemoveButton({
  linkId,
  kind,
  title,
}: {
  /** material_link 行 id —— 解绑目标(非 entity id)。 */
  readonly linkId: string;
  readonly kind: "knowledge" | "asset";
  /** 弹药标题(确认框里回显,让用户确认删对了)。 */
  readonly title: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const pendingRef = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);

  // 关框顺手清错误态(下次打开是干净的);包装 onOpenChange 而非 effect+setState。
  const handleOpenChange = React.useCallback((next: boolean) => {
    if (!next) setError(null);
    setOpen(next);
  }, []);

  const onConfirm = React.useCallback(() => {
    if (pendingRef.current) return; // 同步互斥,防双发
    pendingRef.current = true;
    setPending(true);
    setError(null);
    void (async () => {
      try {
        await client.deleteMaterialLink({
          params: { linkId },
          query: undefined,
          body: undefined,
        });
        handleOpenChange(false);
        router.refresh();
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        setError(
          raw.includes("404") || /not found/i.test(raw)
            ? "这条关联已不存在，可能已被移除。"
            : "移除失败，请稍后重试。",
        );
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    })();
  }, [linkId, router, handleOpenChange]);

  const kindLabel = kind === "knowledge" ? "知识" : "素材";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        data-slot="ammo-remove-trigger"
        data-testid="ammo-remove-trigger"
        aria-label="移除这条弹药"
        title="移除(只解绑,不删实体)"
        className="size-6 text-text-subtle hover:text-destructive"
        onClick={() => handleOpenChange(true)}
      >
        <Trash2 className="size-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent data-slot="ammo-remove-dialog">
          <DialogHeader>
            <DialogTitle data-slot="ammo-remove-title">移除这条弹药？</DialogTitle>
            <DialogDescription data-slot="ammo-remove-warning">
              只解绑「{title}」与本项目的关联，
              <strong className="text-foreground">不删除{kindLabel}本身</strong>
              （{kindLabel}仍留在你的{kind === "knowledge" ? "知识库" : "素材库"}里，
              可再挂到别的项目）。
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p
              data-slot="ammo-remove-error"
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
              data-slot="ammo-remove-confirm"
              data-testid="ammo-remove-confirm"
            >
              {pending ? "移除中…" : "移除关联"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AmmoRemoveButton;
