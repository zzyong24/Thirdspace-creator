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
 * [FE-M02] 写失败不再静默:`useMutation` 捕获错误 → 暴露 `error` 供表单显红字,
 * 且失败时**不**调 `onDone`(表单保持打开、用户输入保留,可重试)。时间输入改
 * `datetime-local`(本地时区)+ ISO↔本地 转换,用户不再手打 ISO 字符串。
 *
 * Determinism (C-5): pending 互斥防双发;plannedAt 由用户选的本地时刻或 dateKey 派生;
 * NO Date.now / Math.random / fetch in render。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { translateClientError } from "@/lib/account-error-copy";
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

// 抽屉里排期默认时刻:当天 09:00 UTC(由 dateKey 派生,不取 wall-clock)。
const DEFAULT_HOUR = "T09:00:00.000Z";

/** "YYYY-MM-DD" → 该日 09:00 UTC 的 ISO 时刻(排期 plannedAt 兜底默认值)。 */
export function dateKeyToPlannedAt(dateKey: string): string {
  return `${dateKey}${DEFAULT_HOUR}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * [FE-M02] ISO(UTC)时刻 → `datetime-local` 输入值("YYYY-MM-DDTHH:mm",本地时区)。
 * 用本地日历字段渲染,用户看到/编辑的是自己时区的时间;非法输入 → 空串。
 */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * [FE-M02] `datetime-local` 输入值(本地时区,无时区后缀) → ISO(UTC)时刻。
 * `new Date("YYYY-MM-DDTHH:mm")` 按**本地**时区解析,`.toISOString()` 归一到 UTC 存储。
 * 空/非法 → null(调用方回退到 dateKey 的默认时刻)。
 */
export function localInputToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "YYYY-MM-DD" → 该日本地 09:00 的 `datetime-local` 默认值。 */
export function dateKeyToLocalInput(dateKey: string): string {
  return `${dateKey}T09:00`;
}

// 共享写seam:pending 互斥挡并发,成功后 router.refresh() 让 server 重读。
// [FE-M02] 失败捕获进 `error`(可见),且不调 onDone(表单保持、输入不丢,可重试)。
function useMutation() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const pendingRef = React.useRef(false);
  const run = React.useCallback(
    (mutate: () => Promise<unknown>, onDone?: () => void) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setPending(true);
      setError(null);
      void (async () => {
        try {
          await mutate();
          router.refresh();
          onDone?.();
        } catch (err) {
          // 失败可见:优先透传后端 message,否则给通用中文提示。onDone 不执行 →
          // 表单不 reset、不关闭,用户已填内容保留。
          // [T-332 S4] 未选号(AccountRequiredError 428)→ 翻译成选号引导,不是红色技术报错。
          setError(translateClientError(err, "操作失败，请重试"));
        } finally {
          pendingRef.current = false;
          setPending(false);
        }
      })();
    },
    [router],
  );
  return { pending, error, run };
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
  const { pending, error, run } = useMutation();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [projectId, setProjectId] = React.useState<string>("");
  // [FE-M02] 计划时刻改 datetime-local(本地时区),默认当天 09:00;用户不再手打 ISO。
  const [plannedLocal, setPlannedLocal] = React.useState(
    dateKeyToLocalInput(dateKey),
  );

  const valid = title.trim().length > 0;

  function reset() {
    setTitle("");
    setProjectId("");
    setPlannedLocal(dateKeyToLocalInput(dateKey));
    setOpen(false);
  }

  function submit() {
    if (!valid) return;
    // 「选项目」= 在计划标题前加项目标注(entry 无 projectId 列,复用 note 承载)。
    const project = projects.find((p) => p.id === projectId);
    const note = project ? `【${project.title}】${title.trim()}` : title.trim();
    // 本地时刻转 ISO(UTC)存储;空/非法回退到 dateKey 的默认 09:00 UTC,不阻断排期。
    const plannedAt = localInputToIso(plannedLocal) ?? dateKeyToPlannedAt(dateKey);
    run(
      () =>
        client.createEntry({
          params: { accountId },
          query: undefined,
          body: {
            plannedAt,
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
      <Input
        type="datetime-local"
        aria-label="计划时间"
        value={plannedLocal}
        onChange={(e) => setPlannedLocal(e.target.value)}
        data-testid="calendar-schedule-planned-at"
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
      {/* [FE-M02] 失败可见:红字提示;此时表单不关闭、输入保留,用户可直接重试。 */}
      {error ? (
        <p
          data-testid="calendar-schedule-error"
          role="alert"
          className="text-xs text-destructive"
        >
          排期失败：{error}
        </p>
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
  const { pending, error, run } = useMutation();
  const [editing, setEditing] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [note, setNote] = React.useState(entry.note);
  // [FE-M02] 改期用 datetime-local(本地时区),初值由存储的 ISO 转本地;用户不手打 ISO。
  const [plannedLocal, setPlannedLocal] = React.useState(
    isoToLocalInput(entry.plannedAt),
  );

  // planned 才能编辑/删除;已发/未发是复盘态,只读。
  const mutable = entry.status === "planned";

  function saveEdits() {
    const body: { plannedAt?: string; note?: string } = {};
    const nextIso = localInputToIso(plannedLocal);
    if (nextIso && nextIso !== entry.plannedAt) {
      body.plannedAt = nextIso;
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
            type="datetime-local"
            aria-label={`改期 ${entry.id}`}
            value={plannedLocal}
            onChange={(e) => setPlannedLocal(e.target.value)}
          />
          {/* [FE-M02] 保存失败可见:红字;编辑态不关闭、已改内容保留,可重试。 */}
          {error ? (
            <p
              data-testid={`calendar-entry-error-${entry.id}`}
              role="alert"
              className="text-xs text-destructive"
            >
              保存失败：{error}
            </p>
          ) : null}
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
                setPlannedLocal(isoToLocalInput(entry.plannedAt));
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
          {/* [FE-M02] 删除失败可见:红字;弹框保持打开,用户可重试或取消。 */}
          {error ? (
            <p
              data-testid={`calendar-delete-error-${entry.id}`}
              role="alert"
              className="text-xs text-destructive"
            >
              删除失败：{error}
            </p>
          ) : null}
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
