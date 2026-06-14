/**
 * Publishing Workspace page (Task 17 / page-specs §9).
 *
 * The `project-workspace` Header mode landing page for the Publishing
 * stage. Composes:
 *  - a `PublishingTabs` row of page tabs (锁定状态),
 *  - a `PublishingGrid` with three visual regions in the spec order
 *    BasicInformationForm → PlatformPublishingPanel → PreviewRail.
 *    The BasicInformationForm renders Title → Description → Cover
 *    Thumbnail → Tags → Category/Series → Publishing Options in spec
 *    order; the PlatformPublishingPanel renders platform cards as
 *    separate cards plus BatchTime / ConfirmPublish / PrePublishCheck
 *    controls and a ContentCalendar; the PreviewRail renders
 *    PlatformPreview → PlatformMetrics → PublishChecklist →
 *    PublishTips in spec order.
 *
 * Layout invariants (locked by page-specs §9):
 *  - exactly THREE columns (basic / platform / preview),
 *  - platform publish cards remain separate (NOT merged with the
 *    basic info column),
 *  - the PreviewRail order is preview → metrics → checklist → tips,
 *  - Confirm Publish is fixture-only: no `fetch`, no network
 *    publication side-effect.
 *
 * The page is a Server Component. It does not own a Sidebar or a
 * TopHeader — those live in `(creator)/layout.tsx` and are mounted once
 * for the whole route group. The page just provides the content slot.
 */

import * as React from "react";

import { PlatformIconView } from "@/components/publishing/platform-icon";
import { MetricCard } from "@/components/project/metric-card";
import { SectionCard } from "@/components/project/section-card";
import { StatusBadge } from "@/components/project/status-badge";
import { TagChip } from "@/components/content/tag-chip";
import {
  canonicalDataset,
  getProjectById,
} from "@/fixtures/canonical";
import type {
  PlatformId,
  PublicationStatus,
} from "@/types/domain";
import type { PublishingViewModel } from "@/types/view-models";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PublishingWorkspacePageProps {
  /** The id of the project to render. */
  readonly projectId: string;
  /** Override hook for tests; defaults to the publishing selector. */
  readonly viewModel?: PublishingViewModel;
}

// ---------------------------------------------------------------------------
// Locked publishing tab descriptors
// ---------------------------------------------------------------------------

const PUBLISHING_TABS: ReadonlyArray<{ readonly id: string; readonly label: string }> = [
  { id: "publishing", label: "发布设置" },
  { id: "schedule", label: "排期" },
  { id: "history", label: "发布历史" },
];

// ---------------------------------------------------------------------------
// Locked publishing options
// ---------------------------------------------------------------------------

interface PublishingOptionDescriptor {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

const PUBLISHING_OPTIONS: ReadonlyArray<PublishingOptionDescriptor> = [
  { id: "opt-comment", label: "允许评论", value: "开启" },
  { id: "opt-draft", label: "保存草稿", value: "关闭" },
  { id: "opt-notify", label: "通知粉丝", value: "开启" },
];

// ---------------------------------------------------------------------------
// Locked publish-checklist descriptors (fixture-only, never network)
// ---------------------------------------------------------------------------

const PUBLISH_CHECKLIST_ITEMS: ReadonlyArray<{
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
}> = [
  { id: "chk-title", label: "标题已校对", checked: true },
  { id: "chk-cover", label: "封面图已选择", checked: true },
  { id: "chk-tags", label: "标签已设置", checked: true },
  { id: "chk-time", label: "发布时间已确认", checked: false },
];

// ---------------------------------------------------------------------------
// Locked default platform cards (used when the project has no canonical
// publications — keeps the column non-empty per the test invariant).
// ---------------------------------------------------------------------------

const DEFAULT_PLATFORM_CARDS: ReadonlyArray<PublishingViewModel["platforms"][number]> = [
  {
    id: "pcard-bilibili",
    platform: "bilibili",
    accountLabel: "Creator 主账号",
    status: "scheduled",
    scheduledAt: "2026-06-15T19:30:00+08:00",
  },
  {
    id: "pcard-xiaohongshu",
    platform: "xiaohongshu",
    accountLabel: "Creator 小红书",
    status: "draft",
    scheduledAt: null,
  },
  {
    id: "pcard-wechatVideo",
    platform: "wechatVideo",
    accountLabel: "Creator 视频号",
    status: "draft",
    scheduledAt: null,
  },
  {
    id: "pcard-youtube",
    platform: "youtube",
    accountLabel: "Creator YouTube",
    status: "draft",
    scheduledAt: null,
  },
];

const PUBLISH_TIPS: ReadonlyArray<string> = [
  "标题前 16 字决定平台推荐曝光。",
  "首图分辨率 ≥ 1080×1440 适合双列信息流。",
  "勾选平台时间前先校对草稿。",
];

// ---------------------------------------------------------------------------
// Locked content calendar — fixture-only, deterministic weekday grid.
// ---------------------------------------------------------------------------

const CALENDAR_DAYS: ReadonlyArray<{
  readonly label: string;
  readonly status: "active" | "draft" | "empty";
  readonly platforms: ReadonlyArray<PlatformId>;
}> = [
  { label: "周一", status: "active", platforms: ["bilibili", "xiaohongshu"] },
  { label: "周二", status: "active", platforms: ["wechatVideo"] },
  { label: "周三", status: "draft", platforms: ["youtube"] },
  { label: "周四", status: "empty", platforms: [] },
  { label: "周五", status: "active", platforms: ["douyin", "bilibili"] },
  { label: "周六", status: "draft", platforms: [] },
  { label: "周日", status: "active", platforms: ["xiaohongshu", "wechatVideo"] },
];

// ---------------------------------------------------------------------------
// Locked platform metrics summary (right column, between preview and tips)
// ---------------------------------------------------------------------------

interface PlatformMetricDescriptor {
  readonly id: string;
  readonly platform: PlatformId;
  readonly label: string;
  readonly value: string;
  readonly delta: string;
  readonly trend: "up" | "down" | "flat";
  readonly tone: "neutral" | "positive" | "negative" | "warning" | "info";
}

const PLATFORM_METRICS: ReadonlyArray<PlatformMetricDescriptor> = [
  {
    id: "pm-views",
    platform: "bilibili",
    label: "累计播放",
    value: "184,203",
    delta: "+12.4%",
    trend: "up",
    tone: "positive",
  },
  {
    id: "pm-likes",
    platform: "xiaohongshu",
    label: "互动量",
    value: "23,481",
    delta: "+8.1%",
    trend: "up",
    tone: "positive",
  },
  {
    id: "pm-comments",
    platform: "wechatVideo",
    label: "新增评论",
    value: "1,289",
    delta: "+0.3%",
    trend: "flat",
    tone: "neutral",
  },
  {
    id: "pm-shares",
    platform: "youtube",
    label: "外部分享",
    value: "672",
    delta: "-1.6%",
    trend: "down",
    tone: "negative",
  },
];

// ---------------------------------------------------------------------------
// Locked platform-comparison rows
// ---------------------------------------------------------------------------

const PLATFORM_COMPARISON: ReadonlyArray<{
  readonly id: string;
  readonly platform: PlatformId;
  readonly label: string;
  readonly reach: string;
  readonly conversion: string;
}> = [
  { id: "pc-bili", platform: "bilibili", label: "哔哩哔哩", reach: "184,203", conversion: "5.4%" },
  { id: "pc-xhs", platform: "xiaohongshu", label: "小红书", reach: "92,481", conversion: "8.1%" },
  { id: "pc-wx", platform: "wechatVideo", label: "微信视频号", reach: "31,289", conversion: "3.2%" },
  { id: "pc-yt", platform: "youtube", label: "YouTube", reach: "8,672", conversion: "1.6%" },
];

// ---------------------------------------------------------------------------
// Locked recent-comments teaser (bottom of preview rail)
// ---------------------------------------------------------------------------

const COMMENTS_TEASER: ReadonlyArray<{
  readonly id: string;
  readonly author: string;
  readonly body: string;
}> = [
  { id: "c-1", author: "@Meng", body: "AI Native Browser 真的会改变创作者工具栈吗？" },
  { id: "c-2", author: "@Leo", body: "希望下期聊 Agent 框架的对比。" },
];

// ---------------------------------------------------------------------------
// Cover gradient variants — keep the cover thumbnail in lockstep with the
// projects list (so the same project always paints the same gradient).
// ---------------------------------------------------------------------------

const COVER_GRADIENTS: ReadonlyArray<string> = [
  "bg-gradient-to-br from-violet-500 via-fuchsia-500 to-rose-500",
  "bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-600",
  "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600",
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PublishingWorkspacePage({
  projectId,
  viewModel,
}: PublishingWorkspacePageProps) {
  const vm = viewModel ?? buildPublishingViewModel(projectId);
  return (
    <main
      data-app="creatoros"
      data-page="publishing"
      data-project-id={vm.projectId}
      className="flex flex-col gap-3"
    >
      <PublishingTabs tabs={vm.tabs} />
      <div
        data-slot="publishing-grid"
        className="grid grid-cols-1 gap-3 lg:grid-cols-3"
      >
        <div
          data-slot="basic-information-form"
          className="flex flex-col gap-3"
        >
          <SectionCard
            title="基础信息"
            description="标题、描述、封面、标签与发布选项"
          >
            <div className="flex flex-col gap-3">
              <TitleField value={vm.form.title} />
              <DescriptionField value={vm.form.description} />
              <CoverThumbnail
                label={vm.form.coverLabel}
                gradientIndex={gradientIndexFor(vm.projectId)}
                tags={vm.form.tags}
              />
              <TagsField tags={vm.form.tags} />
              <CategoryField
                category={vm.form.category}
                series={vm.form.series}
              />
              <PublishingOptionsField />
            </div>
          </SectionCard>
        </div>
        <div
          data-slot="platform-publishing-panel"
          className="flex flex-col gap-3"
        >
          <SectionCard
            title="发布平台"
            description="按平台配置账号、排期与状态"
          >
            <ul
              data-slot="platform-publish-list"
              className="flex flex-col gap-2"
              aria-label="发布平台"
            >
              {vm.platforms.map((platform) => (
                <li key={platform.id}>
                  <PlatformPublishCardItem card={platform} />
                </li>
              ))}
            </ul>
          </SectionCard>
          <BatchTimeActions />
          <ConfirmPublishButton />
          <ContentCalendar days={CALENDAR_DAYS} />
          <PrePublishCheck />
        </div>
        <div
          data-slot="preview-rail"
          className="flex flex-col gap-3"
        >
          <PlatformPreview preview={vm.preview} />
          <PlatformMetricsSummary />
          <PlatformComparison />
          <PublishChecklist items={vm.checklist} />
          <PublishTips tips={vm.tips} />
          <CommentsTeaser />
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// PublishingTabs — top of page
// ---------------------------------------------------------------------------

function PublishingTabs({
  tabs,
}: {
  tabs: PublishingViewModel["tabs"];
}) {
  return (
    <nav
      data-slot="publishing-tabs"
      aria-label="发布阶段"
      className="flex flex-wrap items-center gap-1.5 border-b border-border pb-2"
    >
      {(tabs.length > 0 ? tabs : PUBLISHING_TABS).map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          data-slot="publishing-tab"
          data-tab-id={tab.id}
          data-pressed={index === 0}
          className="inline-flex h-7 items-center rounded-md border border-transparent px-2.5 text-xs font-medium text-muted-foreground data-[pressed=true]:border-brand/40 data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// BasicInformationForm — left column
// ---------------------------------------------------------------------------

function TitleField({ value }: { value: string }) {
  return (
    <div data-slot="title-field" className="flex flex-col gap-1">
      <label
        htmlFor="publish-title"
        className="text-[11px] font-medium text-muted-foreground"
      >
        标题
      </label>
      <input
        id="publish-title"
        data-slot="title-input"
        defaultValue={value}
        readOnly
        className="h-8 rounded-md border border-border bg-surface px-2.5 text-sm text-foreground"
      />
    </div>
  );
}

function DescriptionField({ value }: { value: string }) {
  return (
    <div data-slot="description-field" className="flex flex-col gap-1">
      <label
        htmlFor="publish-description"
        className="text-[11px] font-medium text-muted-foreground"
      >
        描述
      </label>
      <textarea
        id="publish-description"
        data-slot="description-input"
        defaultValue={value}
        readOnly
        rows={2}
        className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground"
      />
    </div>
  );
}

function CoverThumbnail({
  label,
  gradientIndex,
  tags,
}: {
  label: string;
  gradientIndex: number;
  tags: ReadonlyArray<string>;
}) {
  const gradient =
    COVER_GRADIENTS[gradientIndex % COVER_GRADIENTS.length] ??
    COVER_GRADIENTS[0];
  return (
    <div data-slot="cover-selector" className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">
        封面预览
      </span>
      <div
        data-slot="cover-preview"
        aria-label={label}
        className="relative h-32 w-full overflow-hidden rounded-md border border-border"
      >
        <div
          aria-hidden="true"
          className={`absolute inset-0 ${gradient} opacity-90`}
        />
        <div className="relative flex h-full w-full flex-col justify-between p-2.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-white/80">
            AI Native Browser · 深度解析
          </span>
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                data-slot="cover-tag"
                className="inline-flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[10px] font-medium text-white backdrop-blur"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TagsField({ tags }: { tags: ReadonlyArray<string> }) {
  return (
    <div data-slot="tags-field" className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">标签</span>
      <div
        data-slot="tags-list"
        className="flex flex-wrap gap-1"
        aria-label="标签"
      >
        {tags.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">暂无标签。</span>
        ) : (
          tags.map((tag) => (
            <TagChip key={tag} label={tag} tone="brand" size="sm" />
          ))
        )}
      </div>
    </div>
  );
}

function CategoryField({
  category,
  series,
}: {
  category: string;
  series: string;
}) {
  return (
    <div data-slot="category-field" className="grid grid-cols-2 gap-2">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">分类</span>
        <div
          data-slot="category-input"
          className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground"
        >
          {category}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">系列</span>
        <div
          data-slot="series-input"
          className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground"
        >
          {series}
        </div>
      </div>
    </div>
  );
}

function PublishingOptionsField() {
  return (
    <div
      data-slot="publishing-options-field"
      className="flex flex-col gap-1"
    >
      <span className="text-[11px] font-medium text-muted-foreground">发布选项</span>
      <ul
        data-slot="publishing-options-list"
        className="flex flex-col gap-1"
        aria-label="发布选项"
      >
        {PUBLISHING_OPTIONS.map((opt) => (
          <li
            key={opt.id}
            data-slot="publishing-option-row"
            data-option-id={opt.id}
            className="flex items-center justify-between rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs"
          >
            <span className="text-muted-foreground">{opt.label}</span>
            <span className="font-medium text-foreground">{opt.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlatformPublishingPanel — middle column
// ---------------------------------------------------------------------------

function PlatformPublishCardItem({
  card,
}: {
  card: PublishingViewModel["platforms"][number];
}) {
  const status = mapPublishStatus(card.status);
  return (
    <article
      data-slot="platform-publish-card"
      data-platform={card.platform}
      data-publish-card-id={card.id}
      className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-2.5"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <PlatformIconView platform={card.platform} size="sm" />
          <span className="text-xs font-medium text-foreground">
            {accountLabel(card.platform)}
          </span>
        </div>
        <StatusBadge status={status} />
      </header>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span data-slot="platform-account">{card.accountLabel}</span>
        <span
          data-slot="platform-scheduled"
          data-has-schedule={card.scheduledAt ? "true" : "false"}
        >
          {card.scheduledAt ? `排期 ${formatSchedule(card.scheduledAt)}` : "立即发布"}
        </span>
      </div>
    </article>
  );
}

function accountLabel(platform: PlatformId): string {
  switch (platform) {
    case "youtube":
      return "YouTube";
    case "bilibili":
      return "哔哩哔哩";
    case "douyin":
      return "抖音";
    case "xiaohongshu":
      return "小红书";
    case "wechatVideo":
      return "微信视频号";
    case "x":
      return "X";
    default: {
      const _exhaustive: never = platform;
      void _exhaustive;
      return platform;
    }
  }
}

function mapPublishStatus(status: PublicationStatus): PublicationStatus {
  // Server-rendered: keep the fixture status verbatim.
  return status;
}

function formatSchedule(iso: string): string {
  // Deterministic formatting: take the last 5 chars of the ISO datetime
  // (HH:mm) so we never reach for Date.now() or Intl during render.
  return iso.slice(-5);
}

function BatchTimeActions() {
  return (
    <div data-slot="batch-time-actions">
      <SectionCard
        title="批量时间"
        description="统一配置多平台发布时间"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">默认排期</span>
          <span
            data-slot="batch-time-value"
            className="font-mono text-sm tabular-nums text-foreground"
          >
            19:30
          </span>
        </div>
      </SectionCard>
    </div>
  );
}

function ConfirmPublishButton() {
  // Fixture-only: the control renders a button with no onClick, no
  // form action, no network call. The Server Component tree below is
  // deliberately inert so the test invariant "no network publication"
  // stays locked.
  return (
    <div data-slot="confirm-publish-wrapper">
      <button
        type="button"
        data-slot="confirm-publish-button"
        data-action="confirm-publish"
        className="inline-flex h-9 w-full items-center justify-center rounded-md bg-brand text-sm font-medium text-brand-foreground"
      >
        确认发布
      </button>
    </div>
  );
}

function ContentCalendar({
  days,
}: {
  days: ReadonlyArray<(typeof CALENDAR_DAYS)[number]>;
}) {
  return (
    <div data-slot="content-calendar">
      <SectionCard
        title="内容日历"
        description="未来 7 天排期总览"
      >
        <ul
          data-slot="content-calendar-grid"
          className="grid grid-cols-7 gap-1"
          aria-label="内容日历"
        >
          {days.map((day) => (
            <li
              key={day.label}
              data-slot="content-calendar-cell"
              data-day-status={day.status}
              className="flex flex-col items-center gap-0.5 rounded-md border border-border bg-surface px-1 py-1.5"
            >
              <span className="text-[10px] font-medium text-muted-foreground">
                {day.label}
              </span>
              <span
                className={
                  day.status === "active"
                    ? "inline-flex size-1.5 rounded-full bg-brand"
                    : day.status === "draft"
                      ? "inline-flex size-1.5 rounded-full bg-warning"
                      : "inline-flex size-1.5 rounded-full bg-border"
                }
                aria-hidden="true"
              />
              <span className="text-[9px] text-muted-foreground">
                {day.platforms.length}
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

function PrePublishCheck() {
  return (
    <div data-slot="pre-publish-check">
      <SectionCard
        title="发布前检查"
        description="确保内容合规、素材齐全"
      >
        <ul
          data-slot="pre-publish-check-list"
          className="flex flex-col gap-1 text-xs text-foreground"
          aria-label="发布前检查"
        >
          {PUBLISH_CHECKLIST_ITEMS.slice(0, 3).map((item) => (
            <li
              key={item.id}
              data-slot="pre-publish-check-row"
              data-check-id={item.id}
              className="flex items-center justify-between"
            >
              <span>{item.label}</span>
              <StatusBadge status={item.checked ? "validated" : "todo"} />
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PreviewRail — right column
// ---------------------------------------------------------------------------

function PlatformPreview({
  preview,
}: {
  preview: PublishingViewModel["preview"];
}) {
  return (
    <div data-slot="platform-preview">
      <SectionCard
        title="平台预览"
        description={`${platformLabel(preview.platform)} 卡片样式`}
      >
        <article
          data-slot="platform-preview-card"
          data-platform={preview.platform}
          className="flex flex-col gap-1.5 overflow-hidden rounded-card border border-border bg-surface-subtle"
        >
          <div
            aria-hidden="true"
            className="relative h-20 w-full overflow-hidden bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-600"
          >
            <div className="absolute inset-0 flex items-end p-2">
              <span className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-medium text-white">
                AI Native Browser · 深度解析
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1 p-2.5">
            <header className="flex items-center gap-1.5">
              <PlatformIconView platform={preview.platform} size="xs" />
              <span className="text-[11px] text-muted-foreground">
                {platformLabel(preview.platform)}
              </span>
            </header>
            <h4
              data-slot="platform-preview-title"
              className="line-clamp-1 text-xs font-semibold text-foreground"
            >
              {preview.title}
            </h4>
            <p
              data-slot="platform-preview-description"
              className="line-clamp-2 text-[11px] text-muted-foreground"
            >
              {preview.description}
            </p>
          </div>
        </article>
      </SectionCard>
    </div>
  );
}

function PublishChecklist({
  items,
}: {
  items: PublishingViewModel["checklist"];
}) {
  const list = items.length > 0 ? items : PUBLISH_CHECKLIST_ITEMS;
  return (
    <div data-slot="publish-checklist">
      <SectionCard
        title="发布清单"
        description="逐项核对"
      >
        <ul
          data-slot="publish-checklist-list"
          className="flex flex-col gap-1"
          aria-label="发布清单"
        >
          {list.map((item) => (
            <li
              key={item.id}
              data-slot="publish-checklist-item"
              data-check-id={item.id}
              data-checked={item.checked}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="text-foreground">{item.label}</span>
              <StatusBadge status={item.checked ? "validated" : "todo"} />
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

function PlatformMetricsSummary() {
  return (
    <div
      data-slot="platform-metrics-summary"
      className="grid grid-cols-2 gap-1.5"
    >
      {PLATFORM_METRICS.map((m) => (
        <MetricCard
          key={m.id}
          id={m.id}
          label={m.label}
          value={m.value}
          delta={m.delta}
          trend={m.trend}
          tone={m.tone}
        />
      ))}
    </div>
  );
}

function PlatformComparison() {
  return (
    <div data-slot="platform-comparison">
      <SectionCard
        title="平台对比"
        description="按平台查看触达与转化"
      >
        <table
          data-slot="platform-comparison-table"
          className="w-full text-xs text-foreground"
        >
          <thead>
            <tr className="border-b border-border text-[10px] text-muted-foreground">
              <th className="py-1 text-left font-medium">平台</th>
              <th className="py-1 text-right font-medium">触达</th>
              <th className="py-1 text-right font-medium">转化</th>
            </tr>
          </thead>
          <tbody>
            {PLATFORM_COMPARISON.map((row) => (
              <tr
                key={row.id}
                data-slot="platform-comparison-row"
                data-platform={row.platform}
                className="border-b border-border/50 last:border-b-0"
              >
                <td className="py-1.5">
                  <div className="flex items-center gap-1.5">
                    <PlatformIconView platform={row.platform} size="xs" />
                    <span>{row.label}</span>
                  </div>
                </td>
                <td className="py-1.5 text-right tabular-nums">{row.reach}</td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                  {row.conversion}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}

function CommentsTeaser() {
  return (
    <div data-slot="comments-teaser">
      <SectionCard
        title="评论区"
        description="最近 2 条互动"
      >
        <ul
          data-slot="comments-list"
          className="flex flex-col gap-1.5"
          aria-label="评论区"
        >
          {COMMENTS_TEASER.map((c) => (
            <li
              key={c.id}
              data-slot="comments-row"
              className="rounded-md border border-border bg-surface-subtle px-2 py-1.5"
            >
              <span className="text-[11px] font-medium text-foreground">
                {c.author}
              </span>
              <p className="text-[11px] text-muted-foreground">{c.body}</p>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

function PublishTips({ tips }: { tips: ReadonlyArray<string> }) {
  const list = tips.length > 0 ? tips : PUBLISH_TIPS;
  return (
    <div data-slot="publish-tips">
      <SectionCard
        title="发布小贴士"
        description="提升曝光的常见做法"
      >
        <ul
          data-slot="publish-tips-list"
          className="flex flex-col gap-1 text-xs text-foreground"
          aria-label="发布小贴士"
        >
          {list.map((tip, index) => (
            <li
              key={tip}
              data-slot="publish-tip"
              data-tip-index={index}
              className="rounded-md border border-border bg-surface-subtle px-2 py-1.5"
            >
              {tip}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selector: build the Publishing Workspace ViewModel
// ---------------------------------------------------------------------------

export function buildPublishingViewModel(
  projectId: string,
): PublishingViewModel {
  const canonicalId = resolveProjectIdSlug(projectId);
  const project = getProjectById(canonicalId);
  if (!project) {
    return {
      scenario: "empty",
      kind: "publishing",
      projectId: canonicalId,
      tabs: PUBLISHING_TABS,
      form: {
        title: "",
        description: "",
        coverLabel: "无封面",
        tags: [],
        category: "未分类",
        series: "无系列",
      },
      platforms: [],
      preview: {
        title: "预览卡片",
        description: "暂无内容",
        platform: "bilibili",
      },
      checklist: [],
      tips: [],
      loading: false,
      error: null,
    };
  }

  // Find publications tied to this project's content outputs.
  const outputIds = canonicalDataset.contentOutputs
    .filter((output) => output.projectId === project.id)
    .map((output) => output.id);
  const publications = canonicalDataset.publications.filter((pub) =>
    outputIds.includes(pub.contentOutputId),
  );

  const revisions = canonicalDataset.publicationRevisions.filter((rev) =>
    publications.some((pub) => pub.id === rev.publicationId),
  );

  // Surface up to 4 platform cards (the spec asks for cards to remain
  // separate — one per platform — so we cap the fixture-driven set so
  // the column never overflows).
  const fixtureCards = publications.slice(0, 4).map((pub) => ({
    id: pub.id,
    platform: pub.platform,
    accountLabel: pub.accountReference,
    status: pub.status,
    scheduledAt: pub.scheduledAt ?? null,
  }));
  const cards =
    fixtureCards.length > 0 ? fixtureCards : DEFAULT_PLATFORM_CARDS;

  // Pull the form data from the first revision (or fall back to a
  // blank slate).
  const firstRevision = revisions[0];
  const form = {
    title: firstRevision?.title ?? project.title,
    description: firstRevision?.description ?? project.brief,
    coverLabel: firstRevision?.coverAssetId ?? "封面 · AI Native Browser",
    tags: firstRevision?.platformTags ?? ["独立创作者", "工作流", "AI"],
    category: firstRevision?.category ?? "播客",
    series: firstRevision?.series ?? "Creator 访谈",
  };

  const preview = {
    title: form.title,
    description: form.description,
    platform: cards[0]?.platform ?? "bilibili",
  } as const;

  return {
    scenario: "default",
    kind: "publishing",
    projectId: project.id,
    tabs: PUBLISHING_TABS,
    form,
    platforms: cards,
    preview,
    checklist: PUBLISH_CHECKLIST_ITEMS,
    tips: PUBLISH_TIPS,
    loading: false,
    error: null,
  };
}

/**
 * The route segment for a project is a URL slug (e.g. `ai-native-browser`)
 * while the canonical dataset uses prefixed IDs (e.g.
 * `project-ainativebrowser`). Translate between them so the page
 * content can resolve the canonical project.
 *
 * Falls back to the original slug if no canonical match is found, in
 * which case the caller surfaces the "未找到项目" empty state.
 */
function resolveProjectIdSlug(slug: string): string {
  if (!slug) return slug;
  const knownIds = canonicalDataset.projects.map((project) => project.id);
  if (knownIds.includes(slug)) return slug;
  const candidate = `project-${slug.replace(/-/g, "")}`;
  if (knownIds.includes(candidate)) return candidate;
  return slug;
}

function platformLabel(platform: PlatformId): string {
  return accountLabel(platform);
}

function gradientIndexFor(projectId: string): number {
  let hash = 0;
  for (let i = 0; i < projectId.length; i += 1) {
    hash = (hash * 31 + projectId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % COVER_GRADIENTS.length;
}
