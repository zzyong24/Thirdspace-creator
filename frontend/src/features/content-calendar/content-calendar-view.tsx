"use client";

/**
 * `ContentCalendarView` — 月历格 + 日详情抽屉(T-083a 样板 · SPEC §1 方案 C)。
 *
 * 过去格渲 publications 真数据(chips:标题缩略 + 播放数),单日多条格内折叠
 * 「+N」;未来格渲 planned entries(现 0 行 → 诚实空);过去的空格淡色着色,
 * 断更空窗一眼可辨。点格开只读抽屉:当天发布列表(封面缩略 + 标题 + 表现 +
 * 跳稿面链接)。项目排期只读，唯一写入口在项目列表；月份切换留在
 * `/publishing?month=YYYY-MM`。
 *
 * [FE-M01] 无障碍:日历格是原生 `<button>`(键盘可聚焦、Enter/Space 触发),不再是
 * click-only `<div>`;日详情抽屉改用 Sheet(Radix Dialog 底座)——自带 focus trap、
 * Escape 关闭、关闭后焦点回落到触发格。
 *
 * Determinism (C-5): everything renders from the server-fed viewModel props
 * (month / referenceDateKey 都是注入值); no Date.now / Math.random / fetch in
 * render or selectors。周起点为周一(中文习惯)。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { SectionCard } from "@/components/project/section-card";
import { CoverThumb } from "@/components/resources/cover-thumb";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { buildMonthGrid, shiftMonth, type DayCell } from "./calendar-month";
import type {
  CalendarPublicationItem,
  ContentCalendarViewModel,
} from "./content-calendar-page";
import type { ContentCalendarEntryResource } from "@creatoros/backend/modules/content-calendar";

import {GroupCalendarPlanningControl} from "./group-calendar-planning-control";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

/** "YYYY-MM" → "YYYY年M月" 标题。 */
function monthTitle(month: string): string {
  return `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`;
}

/** "YYYY-MM-DD" → "M月D日" 抽屉标题。 */
function dayTitle(dateKey: string): string {
  return `${Number(dateKey.slice(5, 7))}月${Number(dateKey.slice(8, 10))}日`;
}

// 单格最多平铺的条数,超出折叠为「+N」。
const MAX_CHIPS_PER_CELL = 2;

// entries 状态 → 中文短标(排期 chip 用)。
const ENTRY_STATUS_LABELS: Record<string, string> = {
  planned: "计划",
  missed: "逾期",
};

// ---------------------------------------------------------------------------
// 视图
// ---------------------------------------------------------------------------

export function ContentCalendarView({
  viewModel,
  navigationQuery = "",
}: {
  readonly viewModel: ContentCalendarViewModel;
  readonly navigationQuery?: string;
}) {
  const { accountId, groupId, month, referenceDateKey, publications, entries, projects } =
    viewModel;
  const router = useRouter();
  const [isMonthPending, startMonthTransition] = React.useTransition();
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);
  const monthHref = (value: string) => {
    const query = new URLSearchParams(navigationQuery);
    query.set("month", value);
    return `/publishing?${query}`;
  };
  const prevMonthHref = monthHref(shiftMonth(month, -1));
  const nextMonthHref = monthHref(shiftMonth(month, 1));

  React.useEffect(() => {
    if (!accountId && !groupId) return;
    router.prefetch(prevMonthHref);
    router.prefetch(nextMonthHref);
  }, [accountId, groupId, nextMonthHref, prevMonthHref, router]);

  if (!accountId && !groupId) {
    // [T-332 S4] 区分两种「没当前号」(SPEC §6.2/§4.2):
    //  - 0 个 active 号 → 绑定引导(去账号管理);
    //  - 有号但未选(cookie 失效等边缘,切换器挂载后会自愈)→ 提示选号,不代猜。
    const hasActive = viewModel.accounts.some((a) => a.status === "active");
    return (
      <div
        data-slot="content-calendar"
        data-testid="content-calendar"
        className="flex flex-col gap-section-gap"
      >
        <SectionCard title="内容日历">
          <div className="flex flex-col items-start gap-2 py-2">
            <p
              data-testid="calendar-empty-state"
              className="text-sm text-muted-foreground"
            >
              {hasActive
                ? "还没有确定当前账号。在左下角的账号切换器里选择一个抖音号,日历会按该号展示发布与排期。"
                : "还没有绑定抖音号。先到「账号管理」绑定一个号,再规划这个号的发布节奏。"}
            </p>
            {!hasActive ? (
              <a
                href="/accounts"
                data-testid="calendar-empty-bind-link"
                className="text-sm font-medium text-brand underline-offset-4 hover:underline"
              >
                去绑定抖音号 →
              </a>
            ) : null}
          </div>
        </SectionCard>
      </div>
    );
  }

  // 按日聚合(server 已按月过滤;此处纯 fold,确定性)。
  const pubsByDay = new Map<string, CalendarPublicationItem[]>();
  for (const pub of publications) {
    const list = pubsByDay.get(pub.dateKey) ?? [];
    list.push(pub);
    pubsByDay.set(pub.dateKey, list);
  }
  // calendar `published` 不是发布事实，不能在过去月份冒充真实 publication。
  // 项目排期与无法补链的旧计划都只读；日期只认 contract 的 plannedDate。
  const visibleEntries = entries.filter(
    (entry) => entry.status !== "published",
  );
  const entriesByDay = new Map<string, ContentCalendarEntryResource[]>();
  for (const entry of visibleEntries) {
    const key = entry.plannedDate;
    const list = entriesByDay.get(key) ?? [];
    list.push(entry);
    entriesByDay.set(key, list);
  }
  const projectTitleById = new Map(
    projects.map((project) => [project.id, project.title] as const),
  );

  const weeks = buildMonthGrid(month);

  const navigateMonth = (href: string) => {
    if (isMonthPending) return;
    startMonthTransition(() => {
      router.push(href, { scroll: false });
    });
  };

  const selectedPubs = selectedDay ? (pubsByDay.get(selectedDay) ?? []) : [];
  const selectedEntries = selectedDay
    ? (entriesByDay.get(selectedDay) ?? [])
    : [];
  return (
    <div
      data-slot="content-calendar"
      data-testid="content-calendar"
      data-account-id={accountId}
      data-group-id={groupId}
      data-month={month}
      data-month-pending={isMonthPending ? "true" : undefined}
      aria-busy={isMonthPending}
      className="flex flex-col gap-section-gap"
    >
      {groupId ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">共享创作计划 · 未选平台目标也可安排日期</p><GroupCalendarPlanningControl key={groupId} groupId={groupId} projects={projects} today={referenceDateKey}/></div> : null}
      {groupId ? <p className="text-xs text-muted-foreground">{viewModel.cadenceUnavailable ? "组创作节奏暂时不可用" : viewModel.cadence ? `组创作节奏：${({daily:"每天",weekly:"每周",biweekly:"每两周",monthly:"每月",custom:"自定义"} as Record<string,string>)[viewModel.cadence.frequency] ?? viewModel.cadence.frequency}` : "尚未设置组创作节奏，可先安排具体日期"}</p> : null}
      {/* 月份头：客户端路由保留当前月历直到新月份读回，避免 Tauri WebView 整页白屏。 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="calendar-prev-month"
            aria-label="上一月"
            disabled={isMonthPending}
            onClick={() => navigateMonth(prevMonthHref)}
            className="rounded-md border border-border px-2.5 py-1 text-sm text-muted-foreground hover:bg-surface-subtle hover:text-foreground"
          >
            ←
          </button>
          <h2
            data-testid="calendar-month-title"
            className="min-w-28 text-center text-lg font-semibold"
          >
            {monthTitle(month)}
          </h2>
          <button
            type="button"
            data-testid="calendar-next-month"
            aria-label="下一月"
            disabled={isMonthPending}
            onClick={() => navigateMonth(nextMonthHref)}
            className="rounded-md border border-border px-2.5 py-1 text-sm text-muted-foreground hover:bg-surface-subtle hover:text-foreground"
          >
            →
          </button>
          {isMonthPending ? (
            <span
              role="status"
              data-testid="calendar-month-loading"
              className="text-xs text-muted-foreground"
            >
              正在切换…
            </span>
          ) : null}
        </div>
        <p
          data-testid="calendar-month-summary"
          className="text-sm text-muted-foreground"
        >
          {viewModel.publicationsUnavailable ? "发布记录暂时不可用" : `本月发布 ${publications.length} 条`} · 排期 {visibleEntries.length} 条
        </p>
      </div>

      {/* 月历格 */}
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-7 border-b border-border bg-surface-subtle">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="py-1.5 text-center text-xs font-medium text-muted-foreground"
            >
              周{label}
            </div>
          ))}
        </div>
        <div data-testid="calendar-month-grid">
          {weeks.map((week, wi) => (
            <div
              key={wi}
              className="grid grid-cols-7 border-b border-border last:border-b-0"
            >
              {week.map((cell) => (
                <CalendarDayCell
                  key={cell.dateKey}
                  cell={cell}
                  referenceDateKey={referenceDateKey}
                  pubs={pubsByDay.get(cell.dateKey) ?? []}
                  entries={entriesByDay.get(cell.dateKey) ?? []}
                  projectTitleById={projectTitleById}
                  onOpen={() => setSelectedDay(cell.dateKey)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 图例:空窗淡色可辨 */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-muted" />
          过去无发布(空窗)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border border-border bg-background" />
          有发布 / 未来
        </span>
      </div>

      {/* 日详情抽屉(只读,T-083a):当天发布列表 + 跳稿面。
          [FE-M01] Sheet 底座 = Radix Dialog:focus trap + Escape 关闭 + 关闭回焦触发格。 */}
      <Sheet
        open={selectedDay !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDay(null);
        }}
      >
        <SheetContent
          side="right"
          data-testid="calendar-day-drawer"
          data-date={selectedDay ?? undefined}
          className="w-full gap-3 overflow-y-auto p-4 sm:max-w-md"
        >
          <SheetHeader className="p-0">
            <SheetTitle>
              {selectedDay ? dayTitle(selectedDay) : ""} · 发布{" "}
              {selectedPubs.length} 条
            </SheetTitle>
            <SheetDescription>
              发布 {selectedPubs.length} 条 · 排期 {selectedEntries.length} 条
            </SheetDescription>
          </SheetHeader>

          {selectedPubs.length === 0 && selectedEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {viewModel.publicationsUnavailable ? "发布记录暂时不可用，这一天暂无排期。" : "这一天没有发布记录，也没有排期。"}
            </p>
          ) : null}

          <ul className="flex flex-col gap-2">
            {selectedPubs.map((pub) => (
              <li
                key={pub.id}
                data-testid="calendar-drawer-pub"
                className="flex items-center gap-3 rounded-md border border-border p-2"
              >
                <CoverThumb
                  assetId={pub.coverAssetId}
                  alt={pub.title}
                  className="h-12 w-20 shrink-0 rounded-md border border-border bg-surface-subtle object-cover"
                  fallback={
                    <span className="h-12 w-20 shrink-0 rounded-md bg-gradient-to-br from-muted to-surface-subtle" />
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{pub.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {pub.platformLabel} · {pub.views}
                  </p>
                </div>
                <a
                  href={pub.projectId ? `/projects/${pub.projectId}` : "/projects"}
                  data-testid="calendar-drawer-pub-link"
                  className="shrink-0 text-xs text-primary underline-offset-2 hover:underline"
                >
                  打开稿面
                </a>
              </li>
            ))}
          </ul>

          {selectedEntries.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                排期({selectedEntries.length}）
              </h4>
              <ul className="flex flex-col gap-1.5">
                {selectedEntries.map((entry) => (
                  <CalendarEntryReadonlyRow
                    key={entry.id}
                    entry={entry}
                    groupId={groupId}
                    today={referenceDateKey}
                    projectTitle={
                      entry.projectId
                        ? (projectTitleById.get(entry.projectId) ?? null)
                        : null
                    }
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CalendarDayCell({
  cell,
  referenceDateKey,
  pubs,
  entries,
  projectTitleById,
  onOpen,
}: {
  readonly cell: DayCell;
  readonly referenceDateKey: string;
  readonly pubs: CalendarPublicationItem[];
  readonly entries: ContentCalendarEntryResource[];
  readonly projectTitleById: ReadonlyMap<string, string>;
  readonly onOpen: () => void;
}) {
  const total = pubs.length + entries.length;
  const isPast = cell.dateKey < referenceDateKey;
  const isToday = cell.dateKey === referenceDateKey;
  // 断更空窗:过去的本月格且当天 0 条 → 淡色。
  const isGap = cell.inMonth && isPast && total === 0;
  // 日历已收口为只读：只有存在发布或排期的本月格可打开。
  const openable = cell.inMonth && total > 0;
  const visiblePubs = pubs.slice(0, MAX_CHIPS_PER_CELL);
  const visibleEntries =
    pubs.length >= MAX_CHIPS_PER_CELL
      ? []
      : entries.slice(0, MAX_CHIPS_PER_CELL - pubs.length);
  const hiddenCount = total - visiblePubs.length - visibleEntries.length;

  // 共享的格样式 + data-* 标记(button/div 两分支都用)。
  const className = [
    "min-h-24 w-full border-r border-border p-1.5 text-left last:border-r-0",
    cell.inMonth ? "" : "bg-surface-subtle/60",
    isGap ? "bg-muted" : "",
    openable
      ? "cursor-pointer hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const dataProps = {
    "data-testid": `calendar-day-${cell.dateKey}`,
    "data-in-month": cell.inMonth,
    "data-count": total,
    "data-gap": isGap || undefined,
    "data-openable": openable || undefined,
  } as const;

  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span
          className={[
            "text-xs",
            cell.inMonth ? "text-foreground" : "text-muted-foreground/50",
            isToday
              ? "flex h-5 w-5 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {cell.dayOfMonth}
        </span>
        {cell.inMonth && pubs.length > 0 ? (
          <span className="text-[10px] text-muted-foreground">
            {pubs.length} 条
          </span>
        ) : null}
      </div>

      {cell.inMonth ? (
        <div className="mt-1 flex flex-col gap-0.5">
          {visiblePubs.map((pub) => (
            <div
              key={pub.id}
              data-testid="calendar-pub-chip"
              className="truncate rounded-sm bg-primary/10 px-1 py-0.5 text-[11px] leading-4 text-foreground"
              title={pub.title}
            >
              <span className="truncate">{pub.title}</span>
              {pub.views !== "暂无数据" ? (
                <span className="ml-1 text-[10px] text-muted-foreground">
                  {pub.views}
                </span>
              ) : null}
            </div>
          ))}
          {visibleEntries.map((entry) => (
            <div
              key={entry.id}
              data-testid="calendar-entry-row"
              data-status={entry.status}
              className="truncate rounded-sm border border-dashed border-border px-1 py-0.5 text-[11px] leading-4 text-muted-foreground"
              title={
                entry.projectId
                  ? (projectTitleById.get(entry.projectId) ?? "项目排期")
                  : "待整理计划"
              }
            >
              {ENTRY_STATUS_LABELS[entry.status] ?? entry.status}
              {" · "}
              {entry.projectId
                ? (projectTitleById.get(entry.projectId) ?? "项目排期")
                : "待整理计划"}
            </div>
          ))}
          {hiddenCount > 0 ? (
            <div
              data-testid="calendar-cell-overflow"
              className="px-1 text-[11px] font-medium text-primary"
            >
              +{hiddenCount}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );

  // [FE-M01] 可点开的格 = 原生 <button>(键盘可达、Enter/Space 触发);其余(补位格 /
  // 过去空窗格)是纯展示 <div>,不可聚焦、不可点。
  if (openable) {
    return (
      <button
        type="button"
        {...dataProps}
        onClick={onOpen}
        aria-label={`${cell.dateKey}${isToday ? " 今天" : ""}，发布 ${pubs.length} 条，排期 ${entries.length} 条，查看当天详情`}
        className={className}
      >
        {inner}
      </button>
    );
  }
  return (
    <div {...dataProps} className={className}>
      {inner}
    </div>
  );
}

function CalendarEntryReadonlyRow({
  entry,
  projectTitle,
  groupId,
  today,
}: {
  readonly groupId?: string | null;
  readonly today?: string;
  readonly entry: ContentCalendarEntryResource;
  readonly projectTitle: string | null;
}) {
  const legacy = entry.projectId === null;
  return (
    <li
      data-testid="calendar-drawer-entry"
      data-entry-id={entry.id}
      data-status={entry.status}
      className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border p-2.5 text-sm"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">
          {legacy ? "待整理计划" : (projectTitle ?? "项目排期")}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {ENTRY_STATUS_LABELS[entry.status] ?? entry.status} ·{" "}
          {dayTitle(entry.plannedDate)}
          {entry.targetStatus === "needs_reselection" ? " · 平台账号已转出，需重新选择目标" : entry.targetStatus === "unassigned" ? " · 未选平台目标" : ""}
          {legacy && entry.note ? ` · ${entry.note}` : ""}
        </p>
      </div>
      {groupId && entry.targetStatus === "needs_reselection" ? <GroupCalendarPlanningControl key={`${groupId}:${entry.id}`} groupId={groupId} projects={[]} today={today??entry.plannedDate} entryId={entry.id}/> : null}
      {entry.projectId ? (
        <a
          href={`/projects/${entry.projectId}`}
          className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          打开项目
        </a>
      ) : (
        <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          待补关联
        </span>
      )}
    </li>
  );
}
