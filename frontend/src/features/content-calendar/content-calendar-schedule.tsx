"use client";

/**
 * `content-calendar-schedule.tsx` — 排期写路径 client islands(T-083c · SPEC §3
 * 「未来格新增/改期/删除计划」)。
 *
 * 挂在日详情抽屉里(未来格):
 *  - `ScheduleEntryForm`(+ 排期)→ `client.createEntry({ params:{accountId},
 *    body:{ plannedAt, note, contentOutputId? } })`。plannedAt 由抽屉当天日期固定
 *    (09:00 UTC);「计划标题」落 `note`;「选项目」= 可选绑定该项目(现阶段项目
 *    未展开产出,选项目仅落 note 前缀标注,不新增 contract 字段——entry 无 projectId 列)。
 *  - `DrawerEntryRow` 改期/改标题 → `client.updateEntry`;删除 → 二次确认系统 Dialog
 *    (禁原生 confirm,T-097 no-alert)→ `client.deleteEntry`。
 *
 * 每个写操作成功后 `router.refresh()`,server 重读持久化行,未来格重新渲染。
 * 复用现成契约 op(createEntry/updateEntry/deleteEntry),不新增 op。
 *
 * Determinism (C-5): plannedAt 由传入的 dateKey 派生(非 wall-clock);pending 互斥
 * 防双发;NO Date.now / Math.random / fetch in render。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
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
import type { ContentCalendarEntryResource } from "@creatoros/backend/modules/content-calendar";
import type { CalendarProjectOption } from "./content-calendar-page";

// 抽屉里排期默认时刻:当天 09:00 UTC(决定论——由 dateKey 派生,不取 wall-clock)。
const DEFAULT_HOUR = "T09:00:00.000Z";

/** "YYYY-MM-DD" → 该日 09:00 UTC 的 ISO 时刻(排期 plannedAt 默认值)。 */
export function dateKeyToPlannedAt(dateKey: string): string {
  return `${dateKey}${DEFAULT_HOUR}`;
}

// 共享写seam:pending 互斥挡并发,成功后 router.refresh() 让 server 重读。
function useMutation() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const pendingRef = React.useRef(false);
  const run = React.useCallback(
    (mutate: () => Promise<unknown>, onDone?: () => void) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setPending(true);
      void (async () => {
        try {
          await mutate();
          router.refresh();
          onDone?.();
        } finally {
          pendingRef.current = false;
          setPending(false);
        }
      })();
    },
    [router],
  );
  return { pending, run };
}

// ---------------------------------------------------------------------------
// 新增排期(未来格 · 抽屉内「+ 排期」)
// ---------------------------------------------------------------------------

export function ScheduleEntryForm({
  accountId,
  dateKey,
  projects,
}: {
  readonly accountId: string;
  /** 抽屉当天,"YYYY-MM-DD";plannedAt 由此派生。 */
  readonly dateKey: string;
  readonly projects: CalendarProjectOption[];
}) {
  const { pending, run } = useMutation();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [projectId, setProjectId] = React.useState<string>("");

  const valid = title.trim().length > 0;

  function reset() {
    setTitle("");
    setProjectId("");
    setOpen(false);
  }

  function submit() {
    if (!valid) return;
    // 「选项目」= 在计划标题前加项目标注(entry 无 projectId 列,复用 note 承载)。
    const project = projects.find((p) => p.id === projectId);
    const note = project ? `【${project.title}】${title.trim()}` : title.trim();
    run(
      () =>
        client.createEntry({
          params: { accountId },
          query: undefined,
          body: {
            plannedAt: dateKeyToPlannedAt(dateKey),
            note,
          },
        }),
      reset,
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        data-testid="calendar-schedule-open"
        onClick={() => setOpen(true)}
        className="w-full rounded-md border border-dashed border-border py-2 text-sm text-primary hover:bg-surface-subtle"
      >
        + 排期
      </button>
    );
  }

  return (
    <form
      data-testid="calendar-schedule-form"
      className="flex flex-col gap-2 rounded-md border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input
        aria-label="计划标题"
        placeholder="计划标题（这天准备发什么）"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      {projects.length > 0 ? (
        <select
          aria-label="选项目"
          data-testid="calendar-schedule-project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="">不绑项目</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={pending || !valid}
          data-testid="calendar-schedule-submit"
        >
          {pending ? "排期中…" : "确认排期"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={reset}
        >
          取消
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// 已有排期行(抽屉内 · 改期/改标题 + 删除二次确认)
// ---------------------------------------------------------------------------

const ENTRY_STATUS_LABELS: Record<string, string> = {
  planned: "计划",
  published: "已发",
  missed: "未发",
};

export function DrawerEntryRow({
  entry,
}: {
  readonly entry: ContentCalendarEntryResource;
}) {
  const { pending, run } = useMutation();
  const [editing, setEditing] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [note, setNote] = React.useState(entry.note);
  const [plannedAt, setPlannedAt] = React.useState(entry.plannedAt);

  // planned 才能编辑/删除;已发/未发是复盘态,只读。
  const mutable = entry.status === "planned";

  function saveEdits() {
    const body: { plannedAt?: string; note?: string } = {};
    if (plannedAt.trim() !== entry.plannedAt && plannedAt.trim().length > 0) {
      body.plannedAt = plannedAt.trim();
    }
    if (note !== entry.note) body.note = note;
    if (Object.keys(body).length === 0) {
      setEditing(false);
      return;
    }
    run(
      () =>
        client.updateEntry({
          params: { entryId: entry.id },
          query: undefined,
          body,
        }),
      () => setEditing(false),
    );
  }

  function confirmRemove() {
    run(
      () =>
        client.deleteEntry({
          params: { entryId: entry.id },
          query: undefined,
          body: undefined,
        }),
      () => setConfirmDelete(false),
    );
  }

  return (
    <li
      data-testid="calendar-drawer-entry"
      data-entry-id={entry.id}
      data-status={entry.status}
      className="flex flex-col gap-2 rounded-md border border-dashed border-border p-2 text-sm"
    >
      {editing ? (
        <div className="flex flex-col gap-2">
          <Input
            aria-label={`计划标题 ${entry.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="计划标题"
          />
          <Input
            aria-label={`改期 ${entry.id}`}
            value={plannedAt}
            onChange={(e) => setPlannedAt(e.target.value)}
            placeholder="计划时间（ISO）"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={saveEdits}
              data-testid="calendar-entry-save"
            >
              保存
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setNote(entry.note);
                setPlannedAt(entry.plannedAt);
                setEditing(false);
              }}
            >
              取消
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">
              {ENTRY_STATUS_LABELS[entry.status] ?? entry.status}
              {entry.note ? ` · ${entry.note}` : ""}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {entry.plannedAt.slice(0, 16).replace("T", " ")}
            </p>
          </div>
          {mutable ? (
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => setEditing(true)}
                data-testid="calendar-entry-edit"
              >
                改期
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setConfirmDelete(true)}
                data-testid="calendar-entry-delete"
              >
                删除
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {/* 删除二次确认:系统 Dialog(禁原生 confirm,T-097 no-alert)。 */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent data-testid="calendar-delete-entry-dialog">
          <DialogHeader>
            <DialogTitle>删除这条排期？</DialogTitle>
            <DialogDescription>
              删除后该计划将从日历移除。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirmDelete(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={confirmRemove}
              data-testid="calendar-delete-entry-confirm"
            >
              {pending ? "删除中…" : "删除排期"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
