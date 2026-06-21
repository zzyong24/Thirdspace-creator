"use client";

/**
 * `PublishingInteractiveRegion` — Client island for the Publishing
 * Workspace page (Increment 4 / page-specs §9).
 *
 * The page (`publishing-workspace-page.tsx`) stays a Server Component
 * shell; the interactive grid lives here following the existing islands
 * pattern (assets / settings / search / production).
 *
 * Wired interactions (client-only, fixture data, no network):
 *  - PublishingTabs: selectable (one active tab at a time),
 *  - TitleField: controlled editable input (with live char count),
 *  - PublishingOptions: controlled toggles,
 *  - platform cards: selectable (toggle a platform's "selected" flag),
 *  - ConfirmPublishButton: performs a CLIENT action — transitions the
 *    publication's local lifecycle (draft → ready → scheduled) and
 *    reflects it in the UI. No `fetch`, no real network publication.
 *
 * Determinism: every value derives from props / fixtures. No
 * `Date.now` / `Math.random` / `fetch`.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { PlatformIcon } from "@/components/publishing/platform-icon";
import { SectionCard } from "@/components/project/section-card";
import { StatusBadge } from "@/components/project/status-badge";
import { client } from "@/lib/contract-client";
import type { PlatformId, PublicationStatus } from "@/types/domain";
import type { PublishingViewModel } from "@/types/view-models";

// ---------------------------------------------------------------------------
// Wiring descriptor (Module 10 Step 5). The server shell resolves the project's
// primary ContentOutput + its existing publications via `outputs.publications.list`
// and threads `{ outputId, publications: { platform → publicationId } }` here so
// the needs-backend (确认发布) and wired-local→backend (Title-input commit)
// controls drive their mapped contract op (FE button → contract op → user-scoped
// SQL → envelope → router.refresh()). Optional so the island still renders
// identically in pure-fixture contexts (default page render / state snapshots);
// when absent the wired controls degrade to local-only behavior.
// ---------------------------------------------------------------------------

export interface PublishingWiring {
  readonly outputId: string;
  /** platform id → existing publication id (empty when none created yet). */
  readonly publications: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Locked descriptors (mirrors the previous server render verbatim)
// ---------------------------------------------------------------------------

const PUBLISHING_TABS: ReadonlyArray<{
  readonly id: string;
  readonly label: string;
}> = [
  { id: "publishing", label: "发布设置" },
  { id: "history", label: "发布记录" },
  { id: "platforms", label: "平台管理" },
  { id: "batch", label: "批量发布" },
];

interface PublishingOptionDescriptor {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly checked: boolean;
}

const PUBLISHING_OPTIONS: ReadonlyArray<PublishingOptionDescriptor> = [
  { id: "opt-comment", label: "允许评论", value: "开启", checked: true },
  { id: "opt-draft", label: "保存草稿", value: "关闭", checked: false },
  { id: "opt-notify", label: "通知粉丝", value: "开启", checked: true },
];

const EXTRA_PUBLISHING_OPTIONS: ReadonlyArray<{
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
}> = [
  { id: "extra-comment", label: "允许评论", checked: true },
  { id: "extra-barrage", label: "允许弹幕", checked: true },
  { id: "extra-forward", label: "允许转发", checked: true },
];

const PUBLISH_CHECKLIST_ITEMS: ReadonlyArray<{
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
}> = [
  { id: "chk-title", label: "标题优化合适", checked: true },
  { id: "chk-cover", label: "封面清晰美观", checked: true },
  { id: "chk-tags", label: "标签已设置", checked: true },
  { id: "chk-time", label: "发布时间已确认", checked: true },
];

interface PlatformPublishCardWithHint {
  readonly id: string;
  readonly platform: PlatformId;
  readonly accountLabel: string;
  readonly status: PublicationStatus;
  readonly scheduledAt: string | null;
  readonly hint?: string;
}

const PUBLISH_TIPS: ReadonlyArray<string> = [
  "建议 18:00-22:00 发布,获得更多曝光",
  '首图包含关键词 "AI 浏览器" 有利于搜索',
  "封面中包含产品界面能提升点击率",
];

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
  { id: "pm-views", platform: "bilibili", label: "累计播放", value: "184,203", delta: "+12.4%", trend: "up", tone: "positive" },
  { id: "pm-likes", platform: "xiaohongshu", label: "互动量", value: "23,481", delta: "+8.1%", trend: "up", tone: "positive" },
  { id: "pm-comments", platform: "wechatVideo", label: "新增评论", value: "1,289", delta: "+0.3%", trend: "flat", tone: "neutral" },
  { id: "pm-shares", platform: "youtube", label: "外部分享", value: "672", delta: "-1.6%", trend: "down", tone: "negative" },
];

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

const COMMENTS_TEASER: ReadonlyArray<{
  readonly id: string;
  readonly author: string;
  readonly body: string;
}> = [
  { id: "c-1", author: "@Meng", body: "AI Native Browser 真的会改变创作者工具栈吗？" },
  { id: "c-2", author: "@Leo", body: "希望下期聊 Agent 框架的对比。" },
];

const COVER_GRADIENTS: ReadonlyArray<string> = [
  "bg-gradient-to-br from-violet-500 via-fuchsia-500 to-rose-500",
  "bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-600",
  "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600",
];

// ---------------------------------------------------------------------------
// PublishingInteractiveRegion
// ---------------------------------------------------------------------------

export function PublishingInteractiveRegion({
  viewModel,
  wiring,
}: {
  readonly viewModel: PublishingViewModel;
  readonly wiring?: PublishingWiring;
}) {
  const vm = viewModel;
  return (
    <>
      <PublishingTabs tabs={vm.tabs} />
      <div
        data-slot="publishing-grid"
        className="grid grid-cols-1 gap-2 xl:grid-cols-[1fr_1fr_0.85fr] xl:items-start"
      >
        <div data-slot="basic-information-form" className="flex flex-col gap-2">
          <SectionCard
            title="基础信息"
            description="标题、描述、封面、标签与发布选项"
            contentClassName="p-2"
          >
            <div className="flex flex-col gap-1.5">
              <TitleField
                value={vm.form.title}
                wiring={wiring}
                platforms={vm.platforms}
              />
              <DescriptionField value={vm.form.description} />
              <CoverAndTagsRow
                coverLabel={vm.form.coverLabel}
                gradientIndex={gradientIndexFor(vm.projectId)}
                tags={vm.form.tags}
              />
              <CategoryAndSeriesRow
                category={vm.form.category}
                series={vm.form.series}
              />
              <PublishingOptionsField />
              <ExtraPublishingOptionsField />
            </div>
          </SectionCard>
        </div>
        <PlatformPublishingPanel platforms={vm.platforms} wiring={wiring} />
        <div data-slot="preview-rail" className="flex flex-col gap-1">
          <PlatformPreview preview={vm.preview} />
          <PlatformMetricsSummary />
          <PlatformComparison />
          <PublishChecklist items={vm.checklist} />
          <PublishTips tips={vm.tips} />
          <CommentsTeaser />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// PublishingTabs — selectable
// ---------------------------------------------------------------------------

function PublishingTabs({ tabs }: { tabs: PublishingViewModel["tabs"] }) {
  const list = tabs.length > 0 ? tabs : PUBLISHING_TABS;
  const [activeTab, setActiveTab] = React.useState<string>(list[0]?.id ?? "");
  return (
    <nav
      data-slot="publishing-tabs"
      aria-label="发布阶段"
      className="flex flex-wrap items-center gap-1.5 border-b border-border pb-1.5"
    >
      {list.map((tab) => {
        const pressed = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-slot="publishing-tab"
            data-tab-id={tab.id}
            data-pressed={pressed}
            aria-selected={pressed}
            onClick={() => setActiveTab(tab.id)}
            className="inline-flex h-6 items-center rounded-md border border-transparent px-2 text-[11px] font-medium text-muted-foreground data-[pressed=true]:border-brand/40 data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// BasicInformationForm — left column
// ---------------------------------------------------------------------------

function TitleField({
  value,
  wiring,
  platforms,
}: {
  value: string;
  wiring?: PublishingWiring;
  platforms: PublishingViewModel["platforms"];
}) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const [title, setTitle] = React.useState<string>(value);
  const charCount = title.length;

  // §4 Title-input commit (wired-local→backend): on commit (blur / Enter), append
  // a new revision (`publications.revisions.create` { title, description }) for the
  // active publication(s), then router.refresh(). The counter stays client-local.
  // When unwired (default render / pure-fixture), the input is local-only.
  const commit = React.useCallback(() => {
    if (!wiring) return;
    const trimmed = title.trim();
    if (trimmed === "") return;
    // The first selected/known platform's publication is the active one; an
    // unpublished workspace may have no publications yet (revision waits for the
    // 确认发布 create flow), so this no-ops when none exist.
    const publicationId = platforms
      .map((p) => wiring.publications[p.platform])
      .find((id): id is string => Boolean(id));
    if (!publicationId) return;
    startTransition(async () => {
      await client.createPublicationRevision({
        params: { publicationId },
        query: undefined,
        body: { title: trimmed, description: "" },
      });
      router.refresh();
    });
  }, [platforms, router, title, wiring]);

  return (
    <div data-slot="title-field" className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor="publish-title"
          className="text-[10px] font-medium text-muted-foreground"
        >
          标题 *
        </label>
        <span className="text-[9px] tabular-nums text-muted-foreground">
          {charCount}/100
        </span>
      </div>
      <div className="relative">
        <input
          id="publish-title"
          data-slot="title-input"
          value={title}
          maxLength={100}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          className="h-6 w-full rounded-md border border-border bg-surface px-2 pr-2 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </div>
    </div>
  );
}

function DescriptionField({ value }: { value: string }) {
  const charCount = value.length;
  return (
    <div data-slot="description-field" className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor="publish-description"
          className="text-[10px] font-medium text-muted-foreground"
        >
          简介 *
        </label>
        <span className="text-[9px] tabular-nums text-muted-foreground">
          {charCount}/2000
        </span>
      </div>
      <div
        id="publish-description"
        data-slot="description-input"
        className="line-clamp-2 rounded-md border border-border bg-surface px-2 py-1 text-[10px] leading-relaxed text-foreground"
      >
        {value}
      </div>
    </div>
  );
}

function CoverAndTagsRow({
  coverLabel,
  gradientIndex,
  tags,
}: {
  coverLabel: string;
  gradientIndex: number;
  tags: ReadonlyArray<string>;
}) {
  const gradient =
    COVER_GRADIENTS[gradientIndex % COVER_GRADIENTS.length] ??
    COVER_GRADIENTS[0];
  return (
    <div data-slot="cover-selector" className="grid grid-cols-[140px_1fr] gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-medium text-muted-foreground">
          封面 *
        </span>
        <div
          data-slot="cover-preview"
          aria-label={coverLabel}
          className="relative h-[68px] w-full overflow-hidden rounded-md border border-border bg-zinc-950"
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-black"
          />
          <div
            aria-hidden="true"
            className={`absolute inset-0 ${gradient} opacity-25 mix-blend-overlay`}
          />
          <div className="relative flex h-full w-full flex-col justify-between p-1.5">
            <div className="flex items-center gap-1">
              <span className="rounded bg-white/20 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-white">
                EP01
              </span>
              <span className="text-[8px] font-medium uppercase tracking-wider text-white/70">
                深度解析 · 13min
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <h5 className="line-clamp-1 text-[10px] font-semibold text-white">
                AI Native Browser
              </h5>
              <div className="flex flex-wrap gap-0.5">
                {tags.slice(0, 1).map((tag) => (
                  <span
                    key={tag}
                    data-slot="cover-tag"
                    className="inline-flex h-3 items-center rounded-full bg-white/20 px-1 text-[8px] font-medium text-white backdrop-blur"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div data-slot="tags-field" className="flex flex-col gap-0.5">
        <span className="text-[10px] font-medium text-muted-foreground">标签</span>
        <div
          data-slot="tags-list"
          className="flex flex-wrap gap-0.5"
          aria-label="标签"
        >
          {tags.length === 0 ? (
            <span className="text-[10px] text-muted-foreground">暂无标签。</span>
          ) : (
            tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex h-4 items-center rounded-md bg-brand-soft px-1.5 text-[10px] font-medium text-brand"
              >
                {tag}
                <span className="ml-0.5 text-brand/60">×</span>
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryAndSeriesRow({
  category,
  series,
}: {
  category: string;
  series: string;
}) {
  return (
    <div data-slot="category-field" className="grid grid-cols-2 gap-1.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-medium text-muted-foreground">分类</span>
        <div
          data-slot="category-input"
          className="rounded-md border border-border bg-surface px-2 py-1 text-[10px] text-foreground"
        >
          {category}
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-medium text-muted-foreground">系列</span>
        <div
          data-slot="series-input"
          className="rounded-md border border-border bg-surface px-2 py-1 text-[10px] text-foreground"
        >
          {series}
        </div>
      </div>
    </div>
  );
}

function PublishingOptionsField() {
  const [values, setValues] = React.useState<Record<string, boolean>>(() => {
    const next: Record<string, boolean> = {};
    for (const opt of PUBLISHING_OPTIONS) next[opt.id] = opt.checked;
    return next;
  });
  return (
    <div data-slot="publishing-options-field" className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium text-muted-foreground">发布选项</span>
      <ul
        data-slot="publishing-options-list"
        className="flex flex-col gap-0.5"
        aria-label="发布选项"
      >
        {PUBLISHING_OPTIONS.map((opt) => {
          const checked = values[opt.id] ?? opt.checked;
          return (
            <li
              key={opt.id}
              data-slot="publishing-option-row"
              data-option-id={opt.id}
              className="flex items-center justify-between rounded-md border border-border bg-surface px-2 py-0.5 text-[10px]"
            >
              <span className="text-muted-foreground">{opt.label}</span>
              <button
                type="button"
                data-slot="publishing-option-toggle"
                role="switch"
                aria-checked={checked}
                aria-label={opt.label}
                onClick={() =>
                  setValues((prev) => ({
                    ...prev,
                    [opt.id]: !(prev[opt.id] ?? opt.checked),
                  }))
                }
                className="font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {checked ? "开启" : "关闭"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ExtraPublishingOptionsField() {
  return (
    <div
      data-slot="extra-publishing-options-field"
      className="flex flex-col gap-0.5"
    >
      <span className="text-[10px] font-medium text-muted-foreground">更多设置</span>
      <ul
        data-slot="extra-publishing-options-list"
        className="flex flex-wrap gap-x-3 gap-y-0.5"
        aria-label="更多设置"
      >
        {EXTRA_PUBLISHING_OPTIONS.map((opt) => (
          <li
            key={opt.id}
            data-slot="extra-publishing-option-row"
            data-option-id={opt.id}
            className="flex items-center gap-1 text-[10px]"
          >
            <span
              aria-hidden="true"
              className={
                opt.checked
                  ? "inline-flex size-3 items-center justify-center rounded bg-brand text-[8px] font-bold text-brand-foreground"
                  : "inline-flex size-3 items-center justify-center rounded border border-border bg-surface"
              }
            >
              {opt.checked ? "✓" : ""}
            </span>
            <span className="text-foreground">{opt.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlatformPublishingPanel — middle column (selectable cards + confirm flow)
// ---------------------------------------------------------------------------

function PlatformPublishingPanel({
  platforms,
  wiring,
}: {
  platforms: PublishingViewModel["platforms"];
  wiring?: PublishingWiring;
}) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  // Selection of which platforms participate in the publish, plus a
  // CLIENT-side lifecycle for the confirm action. The confirm button
  // transitions every selected platform's local status:
  // draft → scheduled (if it has a schedule) else draft → published.
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(
    () => new Set(platforms.map((p) => p.id)),
  );
  const [statuses, setStatuses] = React.useState<
    Record<string, PublicationStatus>
  >(() => {
    const next: Record<string, PublicationStatus> = {};
    for (const p of platforms) next[p.id] = p.status;
    return next;
  });
  const [publishState, setPublishState] = React.useState<
    "draft" | "ready" | "scheduled"
  >("draft");

  const toggleSelected = React.useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // §4 确认发布 (THE one needs-backend control): for EACH selected platform's
  // publication — ensure it exists (`outputs.publications.create` if none), then
  // `publications.transition` { status: "published" } (idempotent; the service
  // collapses ready/scheduled). Then router.refresh(). The local status flip stays
  // for immediate affordance. When unwired, this degrades to the local-only flip.
  const handleConfirm = React.useCallback(() => {
    // Immediate local affordance (kept regardless of wiring).
    setStatuses((prev) => {
      const next = { ...prev };
      for (const p of platforms) {
        if (!selected.has(p.id)) continue;
        next[p.id] = p.scheduledAt ? "scheduled" : "published";
      }
      return next;
    });
    setPublishState((prev) => (prev === "draft" ? "ready" : "scheduled"));

    if (!wiring) return;
    const targets = platforms.filter((p) => selected.has(p.id));
    if (targets.length === 0) return;
    startTransition(async () => {
      for (const p of targets) {
        let publicationId = wiring.publications[p.platform];
        if (!publicationId) {
          const created = (await client.createPublication({
            params: { outputId: wiring.outputId },
            query: undefined,
            body: { platform: p.platform, accountReference: p.accountLabel },
          })) as { id: string };
          publicationId = created.id;
        }
        await client.transitionPublication({
          params: { publicationId },
          query: undefined,
          body: { status: "published" },
        });
      }
      router.refresh();
    });
  }, [platforms, router, selected, wiring]);

  return (
    <div
      data-slot="platform-publishing-panel"
      data-publish-state={publishState}
      className="flex flex-col gap-2"
    >
      <SectionCard
        title="发布平台"
        description="按平台配置账号、排期与状态"
        contentClassName="p-1.5"
      >
        <ul
          data-slot="platform-publish-list"
          className="flex flex-col gap-1"
          aria-label="发布平台"
        >
          {platforms.map((platform) => (
            <li key={platform.id}>
              <PlatformPublishCardItem
                card={platform}
                status={statuses[platform.id] ?? platform.status}
                selected={selected.has(platform.id)}
                onToggle={toggleSelected}
              />
            </li>
          ))}
        </ul>
      </SectionCard>
      <BatchTimeActions />
      <ConfirmPublishButton state={publishState} onConfirm={handleConfirm} />
      <ContentCalendar days={CALENDAR_DAYS} />
      <PrePublishCheck />
    </div>
  );
}

function PlatformPublishCardItem({
  card,
  status,
  selected,
  onToggle,
}: {
  card: PlatformPublishCardWithHint;
  status: PublicationStatus;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const scheduledDate = card.scheduledAt
    ? formatScheduledDate(card.scheduledAt)
    : "立即发布";
  return (
    <article
      data-slot="platform-publish-card"
      data-platform={card.platform}
      data-publish-card-id={card.id}
      data-selected={selected ? "true" : "false"}
      className={
        "flex flex-col gap-1 rounded-md border bg-surface px-1.5 py-1 " +
        (selected ? "border-brand/60" : "border-border")
      }
    >
      <header className="flex items-center justify-between gap-1">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            data-slot="platform-select"
            checked={selected}
            onChange={() => onToggle(card.id)}
            aria-label={`选择 ${card.accountLabel}`}
            className="size-3 rounded border-border text-brand focus-visible:ring-ring/40"
          />
          <PlatformIcon platform={card.platform} size="xs" />
          <span className="text-[10px] font-medium text-foreground">
            {card.accountLabel}
          </span>
        </label>
        <StatusBadge status={status} />
      </header>
      <div className="flex items-center justify-between gap-1 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span>发布时间</span>
          <span
            data-slot="platform-scheduled"
            data-has-schedule={card.scheduledAt ? "true" : "false"}
            className="tabular-nums text-foreground"
          >
            {scheduledDate}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="inline-flex items-center rounded bg-brand-soft px-1 text-[8px] font-medium text-brand"
          data-slot="platform-hint"
          data-hint={card.hint ?? "未添加"}
        >
          {card.hint ?? "未添加"}
        </span>
      </div>
    </article>
  );
}

function formatScheduledDate(iso: string): string {
  const datePart = iso.slice(0, 10);
  const timePart = iso.slice(11, 16);
  return `${datePart} ${timePart}`;
}

function accountLabel(platform: PlatformId): string {
  switch (platform) {
    case "youtube":
      return "YouTube";
    case "bilibili":
      return "B站 (Bilibili)";
    case "douyin":
      return "抖音";
    case "xiaohongshu":
      return "小红书";
    case "wechatVideo":
      return "视频号";
    case "x":
      return "X";
    default: {
      const _exhaustive: never = platform;
      void _exhaustive;
      return platform;
    }
  }
}

function BatchTimeActions() {
  return (
    <div
      data-slot="batch-time-actions"
      className="rounded-md border border-border bg-surface px-2 py-1.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-muted-foreground">
            批量设置时间
          </span>
          <span className="text-[9px] text-muted-foreground">清空时间</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">默认排期</span>
          <span
            data-slot="batch-time-value"
            className="font-mono text-[10px] tabular-nums text-foreground"
          >
            19:30
          </span>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-border pt-1.5">
        <span className="text-[10px] text-muted-foreground">立即发布</span>
        <span
          aria-hidden="true"
          className="inline-flex h-4 w-7 items-center rounded-full bg-brand p-0.5"
        >
          <span className="ml-auto inline-block size-3 rounded-full bg-white" />
        </span>
      </div>
    </div>
  );
}

function ConfirmPublishButton({
  state,
  onConfirm,
}: {
  state: "draft" | "ready" | "scheduled";
  onConfirm: () => void;
}) {
  const label =
    state === "draft"
      ? "确认发布"
      : state === "ready"
        ? "已加入发布队列"
        : "已安排发布";
  return (
    <div data-slot="confirm-publish-wrapper">
      <button
        type="button"
        data-slot="confirm-publish-button"
        data-action="confirm-publish"
        data-publish-state={state}
        onClick={onConfirm}
        className="inline-flex h-7 w-full items-center justify-center gap-1 rounded-md bg-brand text-[11px] font-medium text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <span aria-hidden="true">↑</span>
        确认发布
      </button>
      {state !== "draft" ? (
        <p
          data-slot="confirm-publish-result"
          role="status"
          className="mt-1 text-[10px] font-medium text-success"
        >
          {label}
        </p>
      ) : null}
    </div>
  );
}

function ContentCalendar({
  days,
}: {
  days: ReadonlyArray<(typeof CALENDAR_DAYS)[number]>;
}) {
  return (
    <div
      data-slot="content-calendar"
      className="rounded-md border border-border bg-surface px-2 py-1.5"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground">
          内容日历
        </span>
        <span className="text-[9px] text-muted-foreground">
          未来 7 天排期总览
        </span>
      </div>
      <ul
        data-slot="content-calendar-grid"
        className="grid grid-cols-7 gap-0.5"
        aria-label="内容日历"
      >
        {days.map((day) => (
          <li
            key={day.label}
            data-slot="content-calendar-cell"
            data-day-status={day.status}
            className="flex flex-col items-center gap-0.5 rounded-md border border-border bg-surface-subtle px-0.5 py-0.5"
          >
            <span className="text-[8px] font-medium text-muted-foreground">
              {day.label}
            </span>
            <span
              className={
                day.status === "active"
                  ? "inline-flex size-1 rounded-full bg-brand"
                  : day.status === "draft"
                    ? "inline-flex size-1 rounded-full bg-warning"
                    : "inline-flex size-1 rounded-full bg-border"
              }
              aria-hidden="true"
            />
            <span className="text-[8px] text-muted-foreground">
              {day.platforms.length}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PrePublishCheck() {
  return (
    <div
      data-slot="pre-publish-check"
      className="rounded-md border border-border bg-surface px-2 py-1.5"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground">
          发布前检查
        </span>
        <span className="text-[9px] text-muted-foreground">
          确保内容合规、素材齐全
        </span>
      </div>
      <ul
        data-slot="pre-publish-check-list"
        className="flex flex-col gap-0.5 text-[10px] text-foreground"
        aria-label="发布前检查"
      >
        {PUBLISH_CHECKLIST_ITEMS.slice(0, 3).map((item) => (
          <li
            key={item.id}
            data-slot="pre-publish-check-row"
            data-check-id={item.id}
            className="flex items-center gap-1"
          >
            <span
              aria-hidden="true"
              className="inline-flex size-3 items-center justify-center rounded-full bg-success/15 text-[9px] text-success"
            >
              ✓
            </span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PreviewRail — right column (presentational)
// ---------------------------------------------------------------------------

function PlatformPreview({
  preview,
}: {
  preview: PublishingViewModel["preview"];
}) {
  return (
    <article
      data-slot="platform-preview"
      data-platform={preview.platform}
      className="flex flex-col gap-1 overflow-hidden rounded-md border border-border bg-surface"
    >
      <div
        data-slot="preview-platform-tabs"
        className="flex items-center gap-1 border-b border-border px-1.5 py-1"
        aria-label="平台预览"
      >
        {(["bilibili", "douyin", "wechatVideo", "xiaohongshu"] as const).map(
          (p) => (
            <button
              key={p}
              type="button"
              data-slot="preview-platform-tab"
              data-platform={p}
              data-pressed={p === preview.platform}
              className="inline-flex items-center gap-1 rounded px-1 text-[9px] font-medium text-muted-foreground data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
            >
              <PlatformIcon platform={p} size="xs" />
              <span>{shortLabelFor(p)}</span>
            </button>
          ),
        )}
      </div>
      <div
        aria-hidden="true"
        className="relative h-[70px] w-full overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-800 to-black"
      >
        <div className="absolute inset-0 flex flex-col justify-between p-1.5">
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-white/70">
              {platformLabel(preview.platform)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold text-white">
              AI Native Browser
            </span>
            <span className="text-[8px] text-white/70">
              下一代浏览器的机会与未来
            </span>
            <div className="flex items-center gap-1.5 text-[8px] tabular-nums text-white/80">
              <span>12.3万</span>
              <span>2560</span>
              <span>1.2万</span>
              <span>3天前</span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 px-2 pb-1.5 pt-1">
        <h4
          data-slot="platform-preview-title"
          className="line-clamp-1 text-[10px] font-semibold text-foreground"
        >
          {preview.title}
        </h4>
        <p
          data-slot="platform-preview-description"
          className="line-clamp-1 text-[9px] text-muted-foreground"
        >
          {preview.description}
        </p>
      </div>
    </article>
  );
}

function shortLabelFor(platform: PlatformId): string {
  switch (platform) {
    case "bilibili":
      return "B站";
    case "douyin":
      return "抖音";
    case "xiaohongshu":
      return "小红书";
    case "wechatVideo":
      return "视频号";
    case "youtube":
      return "YouTube";
    case "x":
      return "X";
    default:
      return platform;
  }
}

function PublishChecklist({
  items,
}: {
  items: PublishingViewModel["checklist"];
}) {
  const list = items.length > 0 ? items : PUBLISH_CHECKLIST_ITEMS;
  const total = list.length;
  const done = list.filter((i) => i.checked).length;
  return (
    <div
      data-slot="publish-checklist"
      className="rounded-md border border-border bg-surface px-2 py-1"
    >
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-[10px] font-medium text-foreground">发布清单</span>
        <span className="text-[9px] tabular-nums text-muted-foreground">
          {done}/{total}
        </span>
      </div>
      <ul
        data-slot="publish-checklist-list"
        className="flex flex-col gap-0.5"
        aria-label="发布清单"
      >
        {list.slice(0, 4).map((item) => (
          <li
            key={item.id}
            data-slot="publish-checklist-item"
            data-check-id={item.id}
            data-checked={item.checked}
            className="flex items-center gap-1 text-[10px]"
          >
            <span
              aria-hidden="true"
              className="inline-flex size-3 items-center justify-center rounded-full bg-success/15 text-[9px] text-success"
            >
              {item.checked ? "✓" : "·"}
            </span>
            <span className="text-foreground">{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlatformMetricsSummary() {
  return (
    <div
      data-slot="platform-metrics-summary"
      className="grid grid-cols-2 gap-0.5"
    >
      {PLATFORM_METRICS.map((m) => (
        <div
          key={m.id}
          data-slot="metric-card"
          data-tone={m.tone}
          data-trend={m.trend}
          className="flex flex-col gap-0 rounded-md border border-border/60 bg-surface px-1 py-0.5"
        >
          <span className="text-[10px] font-semibold tabular-nums text-foreground">
            {m.value}
          </span>
          <span
            className={
              m.tone === "positive"
                ? "text-[8px] font-medium text-success"
                : m.tone === "negative"
                  ? "text-[8px] font-medium text-danger"
                  : "text-[8px] font-medium text-muted-foreground"
            }
          >
            {m.trend === "up" ? "▲" : m.trend === "down" ? "▼" : "—"} {m.delta}
          </span>
        </div>
      ))}
    </div>
  );
}

function PlatformComparison() {
  return (
    <div
      data-slot="platform-comparison"
      className="rounded-md border border-border bg-surface px-2 py-1"
    >
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-[10px] font-medium text-foreground">平台对比</span>
        <span className="text-[9px] text-muted-foreground">
          按平台查看触达与转化
        </span>
      </div>
      <table
        data-slot="platform-comparison-table"
        className="w-full text-[10px] text-foreground"
      >
        <thead>
          <tr className="border-b border-border text-[9px] text-muted-foreground">
            <th className="py-0 text-left font-medium">平台</th>
            <th className="py-0 text-right font-medium">触达</th>
            <th className="py-0 text-right font-medium">转化</th>
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
              <td className="py-0">
                <div className="flex items-center gap-1">
                  <PlatformIcon platform={row.platform} size="xs" />
                  <span>{row.label}</span>
                </div>
              </td>
              <td className="py-0 text-right tabular-nums">{row.reach}</td>
              <td className="py-0 text-right tabular-nums text-muted-foreground">
                {row.conversion}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CommentsTeaser() {
  return (
    <div
      data-slot="comments-teaser"
      className="rounded-md border border-border bg-surface px-2 py-0.5"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-foreground">评论区</span>
        <span className="text-[9px] text-muted-foreground">最近 2 条互动</span>
      </div>
      <ul
        data-slot="comments-list"
        className="flex flex-col gap-0.5"
        aria-label="评论区"
      >
        {COMMENTS_TEASER.map((c) => (
          <li
            key={c.id}
            data-slot="comments-row"
            className="rounded-md border border-border bg-surface-subtle px-1.5 py-0.5"
          >
            <span className="text-[9px] font-medium text-foreground">
              {c.author}
            </span>
            <p className="text-[9px] text-muted-foreground">{c.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PublishTips({ tips }: { tips: ReadonlyArray<string> }) {
  const list = tips.length > 0 ? tips : PUBLISH_TIPS;
  return (
    <div
      data-slot="publish-tips"
      className="rounded-md border border-border bg-surface px-2 py-1"
    >
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-[10px] font-medium text-foreground">发布提示</span>
        <span className="text-[9px] text-muted-foreground">
          提升曝光的常见做法
        </span>
      </div>
      <ul
        data-slot="publish-tips-list"
        className="flex flex-col gap-0.5 text-[10px] text-foreground"
        aria-label="发布小贴士"
      >
        {list.slice(0, 3).map((tip, index) => (
          <li
            key={tip}
            data-slot="publish-tip"
            data-tip-index={index}
            className="rounded-md border border-border bg-surface-subtle px-1.5 py-0.5"
          >
            {tip}
          </li>
        ))}
      </ul>
      <a
        href="#"
        data-slot="publish-tips-more"
        className="mt-0.5 inline-block text-[10px] font-medium text-brand"
      >
        查看更多提议 →
      </a>
    </div>
  );
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
