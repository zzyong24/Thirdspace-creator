"use client";

/**
 * `ContentCalendarView` — 月历格 + 日详情抽屉(T-083a 样板 · SPEC §1 方案 C)。
 *
 * 过去格渲 publications 真数据(chips:标题缩略 + 播放数),单日多条格内折叠
 * 「+N」;未来格渲 planned entries(现 0 行 → 诚实空);过去的空格淡色着色,
 * 断更空窗一眼可辨。点格开只读抽屉:当天发布列表(封面缩略 + 标题 + 表现 +
 * 跳稿面链接)。月份切换为静态跳转(`/calendar?month=YYYY-MM` 锚点)。
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
import { ScheduleEntryForm, DrawerEntryRow } from "./content-calendar-schedule";
import type {
  CalendarPublicationItem,
  ContentCalendarViewModel,
} from "./content-calendar-page";
import type { ContentCalendarEntryResource } from "@creatoros/backend/modules/content-calendar";

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
  published: "已发",
  missed: "未发",
};

// ---------------------------------------------------------------------------
// 视图
// ---------------------------------------------------------------------------

export function ContentCalendarView({
  viewModel,
}: {
  readonly viewModel: ContentCalendarViewModel;
}) {
  const { accountId, month, referenceDateKey, publications, entries, projects } =
    viewModel;
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);

  if (!accountId) {
    return (
      <div
        data-slot="content-calendar"
        data-testid="content-calendar"
        className="flex flex-col gap-section-gap"
      >
        <SectionCard title="内容日历">
          <p
            data-testid="calendar-empty-state"
            className="py-2 text-sm text-muted-foreground"
          >
            还没有账号。先到「账号管理」新增一个矩阵号，再规划发布节奏。
          </p>
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
  const entriesByDay = new Map<string, ContentCalendarEntryResource[]>();
  for (const entry of entries) {
    const key = entry.plannedAt.slice(0, 10);
    const list = entriesByDay.get(key) ?? [];
    list.push(entry);
    entriesByDay.set(key, list);
  }

  const weeks = buildMonthGrid(month);
  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);

  const selectedPubs = selectedDay ? (pubsByDay.get(selectedDay) ?? []) : [];
  const selectedEntries = selectedDay
    ? (entriesByDay.get(selectedDay) ?? [])
    : [];
  // 未来/今天的抽屉可排期(过去日只读复盘,不排期)。
  const selectedCanSchedule =
    selectedDay !== null && selectedDay >= referenceDateKey;

  return (
    <div
      data-slot="content-calendar"
      data-testid="content-calendar"
      data-account-id={accountId}
      data-month={month}
      className="flex flex-col gap-section-gap"
    >
      {/* 月份头:上一月/下一月静态跳转 + 本月真实计数 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <a
            href={`/calendar?month=${prevMonth}`}
            data-testid="calendar-prev-month"
            aria-label="上一月"
            className="rounded-md border border-border px-2.5 py-1 text-sm text-muted-foreground hover:bg-surface-subtle hover:text-foreground"
          >
            ←
          </a>
          <h2
            data-testid="calendar-month-title"
            className="min-w-28 text-center text-lg font-semibold"
          >
            {monthTitle(month)}
          </h2>
          <a
            href={`/calendar?month=${nextMonth}`}
            data-testid="calendar-next-month"
            aria-label="下一月"
            className="rounded-md border border-border px-2.5 py-1 text-sm text-muted-foreground hover:bg-surface-subtle hover:text-foreground"
          >
            →
          </a>
        </div>
        <p
          data-testid="calendar-month-summary"
          className="text-sm text-muted-foreground"
        >
          本月发布 {publications.length} 条 · 排期 {entries.length} 条
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
              {selectedCanSchedule
                ? "这一天还没有排期。点下方「+ 排期」规划一条。"
                : "这一天没有发布记录，也没有排期。"}
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
                  <DrawerEntryRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </div>
          ) : null}

          {/* 未来/今天:排期写路径入口(过去日不展示——只读复盘)。 */}
          {selectedCanSchedule && selectedDay ? (
            <div className="mt-1">
              <ScheduleEntryForm
                accountId={accountId}
                dateKey={selectedDay}
                projects={projects}
              />
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
  onOpen,
}: {
  readonly cell: DayCell;
  readonly referenceDateKey: string;
  readonly pubs: CalendarPublicationItem[];
  readonly entries: ContentCalendarEntryResource[];
  readonly onOpen: () => void;
}) {
  const total = pubs.length + entries.length;
  const isPast = cell.dateKey < referenceDateKey;
  const isToday = cell.dateKey === referenceDateKey;
  const isFutureOrToday = cell.dateKey >= referenceDateKey;
  // 断更空窗:过去的本月格且当天 0 条 → 淡色。
  const isGap = cell.inMonth && isPast && total === 0;
  // 可点开抽屉:有内容的任意本月格,或未来/今天的本月格(空格也可点进去排期)。
  const openable = cell.inMonth && (total > 0 || isFutureOrToday);
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
            >
              {ENTRY_STATUS_LABELS[entry.status] ?? entry.status}
              {entry.note ? ` · ${entry.note}` : ""}
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
