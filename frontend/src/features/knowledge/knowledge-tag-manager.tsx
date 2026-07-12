"use client";

/**
 * KnowledgeTagManager —— 标签管理小面板(T-248 批B)。
 *
 * 挂在知识库页「热门标签」卡片右上角的「管理标签」入口,点开一个 Dialog 面板:
 *  - 列出全部标签(打开时经 `taxonomy.tags.list` 现读,不复用热门标签的 top-8
 *    截断投影 —— 管理要看全量);
 *  - 重命名:行内编辑 → 保存即确认 → `taxonomy.tags.patch`;
 *  - 删除:Dialog 双按钮确认门(说明会解除全部挂载)→ `taxonomy.tags.delete`;
 *  - 查看挂载:选中标签 → `taxonomy.entityTags.listEntitiesForTag` 列挂载实体,
 *    逐条「移除标签」→ Dialog 确认 → `taxonomy.entityTags.remove`。
 *
 * 写侧三个 op 此前前端零调用方,本面板是它们的第一个消费者。全站禁原生
 * window.confirm —— 危险操作(删除/移除挂载)一律 Dialog 双按钮确认,模式对齐
 * assets-interactive-region 的回收站确认框。
 *
 * 刷新策略:写成功后同时更新本地列表(面板内即时反馈)+ `router.refresh()`
 * (让服务端读侧重跑,热门标签/`?tag=` 过滤视图同步)。失败 → 面板内错误行,
 * 不假装已成功。Determinism:无 Date.now/Math.random,真实时钟在服务层。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import type { TagEntityType } from "@creatoros/contract";

import { client } from "@/lib/contract-client";
import { describeUserError } from "@/lib/ai-error-humanize";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// `taxonomy.tags.list` 返回的 TagResource 行(只投影面板用到的字段)。
interface TagRow {
  readonly id: string;
  readonly name: string;
  readonly usageCount: number;
}

// `taxonomy.entityTags.listEntitiesForTag` 返回的 EntityTagResource 行。
interface EntityTagRow {
  readonly id: string;
  readonly tagId: string;
  readonly entityType: TagEntityType;
  readonly entityId: string;
}

// entityType 枚举 → 中文标签(contract/src/resources/taxonomy.ts tagEntityType)。
const ENTITY_TYPE_LABEL: Record<string, string> = {
  project: "项目",
  artifact: "作品",
  knowledge: "知识",
  asset: "素材",
  learning: "经验",
  publication: "发布",
};

export function KnowledgeTagManager() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  // 全量标签列表:null = 未加载/读失败(诚实降级,面板内给错误行,不 fixture 兜底)。
  const [tags, setTags] = React.useState<ReadonlyArray<TagRow> | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  // 写侧操作错误(改名/删除/移除挂载共用一条错误行)。
  const [actionError, setActionError] = React.useState<string | null>(null);

  // 行内重命名态。
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");

  // 删除确认门候选(Dialog 双按钮,替代原生 confirm)。
  const [deleteCandidate, setDeleteCandidate] = React.useState<TagRow | null>(
    null,
  );

  // 挂载视图:选中标签 → 列挂载实体;removeCandidate = 移除挂载的确认门候选。
  const [mountTag, setMountTag] = React.useState<TagRow | null>(null);
  const [mounts, setMounts] = React.useState<ReadonlyArray<EntityTagRow> | null>(
    null,
  );
  const [mountsError, setMountsError] = React.useState<string | null>(null);
  const [removeCandidate, setRemoveCandidate] =
    React.useState<EntityTagRow | null>(null);

  // 打开面板时现读全量标签(不复用热门标签的 top-8 投影)。
  const loadTags = React.useCallback(() => {
    startTransition(async () => {
      try {
        const rows = (await client.listTags({
          params: undefined,
          query: { page: 1, pageSize: 200 },
          body: undefined,
          // isList op:契约 client 的返回类型推断为单项(已知类型缝,读侧
          // knowledge-data 同样 cast),运行时实为行数组 → 经 unknown 收窄。
        })) as unknown as ReadonlyArray<TagRow>;
        setTags(rows);
        setLoadError(null);
      } catch (err) {
        setTags(null);
        setLoadError(describeUserError(err, "标签列表加载失败，请重试。"));
      }
    });
  }, []);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) {
        loadTags();
      } else {
        // 关面板清掉所有瞬态(编辑/确认门/挂载视图),下次打开是干净起点。
        setEditingId(null);
        setDeleteCandidate(null);
        setMountTag(null);
        setMounts(null);
        setMountsError(null);
        setRemoveCandidate(null);
        setActionError(null);
      }
    },
    [loadTags],
  );

  // 重命名:保存按钮即确认交互(非危险操作,不加二次门)→ taxonomy.tags.patch。
  const handleRenameSave = React.useCallback(() => {
    const tagId = editingId;
    const name = editingName.trim();
    if (tagId === null || name.length === 0) return;
    startTransition(async () => {
      try {
        await client.patchTag({
          params: { tagId },
          query: undefined,
          body: { name },
        });
        setTags((prev) =>
          prev === null
            ? prev
            : prev.map((row) => (row.id === tagId ? { ...row, name } : row)),
        );
        setEditingId(null);
        setActionError(null);
        router.refresh();
      } catch (err) {
        setActionError(describeUserError(err, "重命名失败，请重试。"));
      }
    });
  }, [editingId, editingName, router]);

  // 删除:确认门里的「确认删除」→ taxonomy.tags.delete(后端连带解除全部挂载)。
  const handleDeleteConfirm = React.useCallback(() => {
    const candidate = deleteCandidate;
    if (candidate === null) return;
    startTransition(async () => {
      try {
        await client.deleteTag({
          params: { tagId: candidate.id },
          query: undefined,
          body: undefined,
        });
        setTags((prev) =>
          prev === null ? prev : prev.filter((row) => row.id !== candidate.id),
        );
        // 被删标签若正开着挂载视图,一并关掉(实体行已随删除失效)。
        setMountTag((prev) => (prev?.id === candidate.id ? null : prev));
        setDeleteCandidate(null);
        setActionError(null);
        router.refresh();
      } catch (err) {
        setActionError(describeUserError(err, "删除标签失败，请重试。"));
      }
    });
  }, [deleteCandidate, router]);

  // 查看某标签的挂载实体 → taxonomy.entityTags.listEntitiesForTag。
  const handleShowMounts = React.useCallback((tag: TagRow) => {
    setMountTag(tag);
    setMounts(null);
    setMountsError(null);
    startTransition(async () => {
      try {
        const rows = (await client.listEntitiesForTag({
          params: { tagId: tag.id },
          query: { page: 1, pageSize: 200 },
          body: undefined,
          // 同上:isList op 返回类型缝,经 unknown 收窄成行数组。
        })) as unknown as ReadonlyArray<EntityTagRow>;
        setMounts(rows);
      } catch (err) {
        setMountsError(describeUserError(err, "挂载列表加载失败，请重试。"));
      }
    });
  }, []);

  // 移除单个挂载:确认门里的「确认移除」→ taxonomy.entityTags.remove。
  const handleRemoveConfirm = React.useCallback(() => {
    const candidate = removeCandidate;
    if (candidate === null) return;
    startTransition(async () => {
      try {
        await client.removeAssignment({
          params: undefined,
          query: undefined,
          body: {
            entityType: candidate.entityType,
            entityId: candidate.entityId,
            tagId: candidate.tagId,
          },
        });
        setMounts((prev) =>
          prev === null ? prev : prev.filter((row) => row.id !== candidate.id),
        );
        // usageCount 本地同步减一(服务端为准,refresh 后会覆盖)。
        setTags((prev) =>
          prev === null
            ? prev
            : prev.map((row) =>
                row.id === candidate.tagId
                  ? { ...row, usageCount: Math.max(0, row.usageCount - 1) }
                  : row,
              ),
        );
        setRemoveCandidate(null);
        setActionError(null);
        router.refresh();
      } catch (err) {
        setActionError(describeUserError(err, "移除挂载失败，请重试。"));
      }
    });
  }, [removeCandidate, router]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-slot="tag-manager-open"
        onClick={() => handleOpenChange(true)}
      >
        管理标签
      </Button>

      {/* 主面板:标签列表 + 行内重命名 + 挂载视图 */}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          data-slot="tag-manager-panel"
          className="max-w-lg gap-3"
        >
          <DialogHeader>
            <DialogTitle>管理标签</DialogTitle>
            <DialogDescription>
              重命名、删除标签,或查看并移除标签在实体上的挂载。
            </DialogDescription>
          </DialogHeader>

          {loadError !== null ? (
            <p
              data-slot="tag-manager-load-error"
              role="alert"
              className="text-[12px] text-destructive"
            >
              {loadError}
            </p>
          ) : tags === null ? (
            <p className="text-[12px] text-muted-foreground">正在加载标签…</p>
          ) : tags.length === 0 ? (
            <p
              data-slot="tag-manager-empty"
              className="text-[12px] text-muted-foreground"
            >
              暂无标签。
            </p>
          ) : (
            <ul
              data-slot="tag-manager-list"
              aria-label="全部标签"
              className="flex max-h-72 flex-col gap-1 overflow-y-auto"
            >
              {tags.map((tag) => (
                <li
                  key={tag.id}
                  data-slot="tag-manager-row"
                  data-tag-id={tag.id}
                  className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-[13px]"
                >
                  {editingId === tag.id ? (
                    <>
                      <Input
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        aria-label={`重命名 ${tag.name}`}
                        data-slot="tag-rename-input"
                        className="h-7 flex-1 text-[13px]"
                        maxLength={64}
                      />
                      <Button
                        type="button"
                        size="sm"
                        data-slot="tag-rename-save"
                        disabled={pending || editingName.trim().length === 0}
                        onClick={handleRenameSave}
                      >
                        保存
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        data-slot="tag-rename-cancel"
                        onClick={() => setEditingId(null)}
                      >
                        取消
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate">
                        {tag.name}
                        <span className="ml-1.5 text-[11px] text-muted-foreground">
                          ×{tag.usageCount}
                        </span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        data-slot="tag-rename-start"
                        onClick={() => {
                          setEditingId(tag.id);
                          setEditingName(tag.name);
                        }}
                      >
                        重命名
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        data-slot="tag-mounts-open"
                        onClick={() => handleShowMounts(tag)}
                      >
                        挂载
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        data-slot="tag-delete-start"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteCandidate(tag)}
                      >
                        删除
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* 挂载视图:选中标签下的实体列表,逐条可移除(经确认门)。 */}
          {mountTag !== null ? (
            <div
              data-slot="tag-mounts-section"
              className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-subtle p-2.5"
            >
              <p className="text-[12px] font-medium">
                「{mountTag.name}」的挂载实体
              </p>
              {mountsError !== null ? (
                <p role="alert" className="text-[12px] text-destructive">
                  {mountsError}
                </p>
              ) : mounts === null ? (
                <p className="text-[12px] text-muted-foreground">
                  正在加载挂载…
                </p>
              ) : mounts.length === 0 ? (
                <p
                  data-slot="tag-mounts-empty"
                  className="text-[12px] text-muted-foreground"
                >
                  该标签暂无挂载。
                </p>
              ) : (
                <ul
                  data-slot="tag-mounts-list"
                  aria-label={`${mountTag.name} 的挂载列表`}
                  className="flex max-h-40 flex-col gap-1 overflow-y-auto"
                >
                  {mounts.map((row) => (
                    <li
                      key={row.id}
                      data-slot="tag-mount-row"
                      className="flex items-center gap-2 text-[12px]"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <span className="mr-1 rounded bg-muted px-1 py-0.5 text-[11px]">
                          {ENTITY_TYPE_LABEL[row.entityType] ?? row.entityType}
                        </span>
                        {row.entityId}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        data-slot="tag-mount-remove-start"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setRemoveCandidate(row)}
                      >
                        移除标签
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {/* 写侧错误行(改名/删除/移除共用;成功即清)。 */}
          {actionError !== null ? (
            <p
              data-slot="tag-manager-action-error"
              role="alert"
              className="text-[12px] text-destructive"
            >
              {actionError}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 删除标签确认门 —— Dialog 双按钮,替代原生 confirm(全站禁 window.confirm)。 */}
      <Dialog
        open={deleteCandidate !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteCandidate(null);
        }}
      >
        <DialogContent data-slot="tag-delete-confirm" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>删除标签?</DialogTitle>
            <DialogDescription>
              确定删除标签「{deleteCandidate?.name ?? ""}」?删除后将解除它在全部
              实体上的挂载(当前 {deleteCandidate?.usageCount ?? 0} 处),此操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              data-slot="tag-delete-cancel"
              onClick={() => setDeleteCandidate(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-slot="tag-delete-confirm-button"
              disabled={pending}
              onClick={handleDeleteConfirm}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 移除单个挂载确认门 —— 同样 Dialog 双按钮。 */}
      <Dialog
        open={removeCandidate !== null}
        onOpenChange={(next) => {
          if (!next) setRemoveCandidate(null);
        }}
      >
        <DialogContent data-slot="tag-mount-remove-confirm" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>移除这条挂载?</DialogTitle>
            <DialogDescription>
              确定把标签「{mountTag?.name ?? ""}」从该
              {removeCandidate
                ? (ENTITY_TYPE_LABEL[removeCandidate.entityType] ??
                  removeCandidate.entityType)
                : ""}
              上移除?该实体将不再出现在此标签的过滤视图中。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              data-slot="tag-mount-remove-cancel"
              onClick={() => setRemoveCandidate(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-slot="tag-mount-remove-confirm-button"
              disabled={pending}
              onClick={handleRemoveConfirm}
            >
              确认移除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
