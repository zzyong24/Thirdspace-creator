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
import { PlatformAdaptIsland } from "./platform-adapt-island";
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

// §4 内容日历 cells wiring (module 22 接管 — promotes the inert calendar). When present
// (the server shell supplies the active account + a deterministic per-cell base instant),
// clicking an empty cell issues `accounts.calendar.entries.create { plannedAt }` then
// router.refresh(). Absent (default render / pure fixture) → the calendar stays
// decorative (C-2: no client-invented entry state). The base instant is injected (C-5 —
// never wall-clock); each cell derives its plannedAt by adding its index in days.
export interface CalendarWiring {
  readonly accountId: string;
  /** ISO-8601 base instant for cell 0; cell N = base + N days (deterministic, C-5). */
  readonly weekStart: string;
}

// ---------------------------------------------------------------------------
// Right-rail真来源 (GAP-PUBW-1). The server shell aggregates each publication's
// latest analytics snapshot (`analytics.publications.get` → metricSnapshot
// rawMetrics) into per-platform metric cards / a comparison table / preview
// stats and threads them here. ALL fields optional → when absent the rail
// renders honest "暂无指标" empty states instead of the old hardcoded numbers
// (C-2: no client-invented metrics). There is NO contract comments op, so the
// 评论区 block is permanently 规划中 (no real source this wave).
// ---------------------------------------------------------------------------

export interface PlatformMetricStat {
  readonly id: string;
  readonly platform: PlatformId;
  /** What the value measures, e.g. "累计播放" / "互动量". */
  readonly label: string;
  /** Already-formatted display value, e.g. "184,203" / "12.3万". */
  readonly value: string;
}

export interface PlatformComparisonRow {
  readonly id: string;
  readonly platform: PlatformId;
  readonly label: string;
  /** Formatted 触达 (views / reach). */
  readonly reach: string;
  /** Formatted 转化, or null when the conversion 口径 is undefined (hide cell). */
  readonly conversion: string | null;
}

export interface PreviewStats {
  /** Formatted 播放 count, e.g. "12.3万". */
  readonly plays: string;
  /** Formatted 点赞 count. */
  readonly likes: string;
  /** Formatted 评论 count. */
  readonly comments: string;
}

export interface PublishingRightRail {
  /** Per-platform metric cards. Empty → "暂无指标" skeleton. */
  readonly metrics?: ReadonlyArray<PlatformMetricStat>;
  /** Comparison table rows. Empty → "暂无指标" empty state. */
  readonly comparison?: ReadonlyArray<PlatformComparisonRow>;
  /** Preview overlay stats. Absent → the preview hides its number row. */
  readonly previewStats?: PreviewStats;
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

// 右栏指标/对比 are now 100% props-driven from the server's analytics snapshots
// (see PublishingRightRail). The previous hardcoded PLATFORM_METRICS /
// PLATFORM_COMPARISON / COMMENTS_TEASER constants were deleted (GAP-PUBW-1 AC2):
// no fake "184,203 累计播放" / "@Meng" rows. Absent data → honest empty states.

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
  calendarWiring,
  rightRail,
}: {
  readonly viewModel: PublishingViewModel;
  readonly wiring?: PublishingWiring;
  readonly calendarWiring?: CalendarWiring;
  /** Server-resolved 右栏真来源 (GAP-PUBW-1). Absent → honest empty states. */
  readonly rightRail?: PublishingRightRail;
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
                wiring={wiring}
                platforms={vm.platforms}
                title={vm.form.title}
                description={vm.form.description}
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
        <PlatformPublishingPanel
          platforms={vm.platforms}
          wiring={wiring}
          calendarWiring={calendarWiring}
          projectId={vm.projectId}
          topic={vm.preview.title}
        />
        <div data-slot="preview-rail" className="flex flex-col gap-1">
          <PlatformPreview preview={vm.preview} stats={rightRail?.previewStats} />
          <PlatformMetricsSummary metrics={rightRail?.metrics} />
          <PlatformComparison rows={rightRail?.comparison} />
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

// The active publication for revision edits = the first selected/known platform's
// publication (mirrors TitleField's resolution). Null when no publication exists yet.
function activePublicationId(
  wiring: PublishingWiring | undefined,
  platforms: PublishingViewModel["platforms"],
): string | null {
  if (!wiring) return null;
  return (
    platforms
      .map((p) => wiring.publications[p.platform])
      .find((id): id is string => Boolean(id)) ?? null
  );
}

function CoverAndTagsRow({
  coverLabel,
  gradientIndex,
  tags,
  wiring,
  platforms,
  title,
  description,
}: {
  coverLabel: string;
  gradientIndex: number;
  tags: ReadonlyArray<string>;
  wiring?: PublishingWiring;
  platforms: PublishingViewModel["platforms"];
  /** Current revision title/description — preserved when a tag edit appends a revision. */
  title: string;
  description: string;
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
      <TagsEditor
        tags={tags}
        wiring={wiring}
        platforms={platforms}
        title={title}
        description={description}
      />
    </div>
  );
}

// SPEC §8「多平台 标签」做真:标签 chip 的 × 可删、可添加(过去 × 是装饰)。任一改动 →
// append 一个新 revision(`publications.revisions.create` { title, description, platformTags }),
// 走既有 publishing service/op,不新建影子机制;title/description 原样带上以免被新版本清空。
// 未接线(默认渲染 / 纯 fixture)或尚无 publication → 仅本地更新做即时反馈,不落库。
function TagsEditor({
  tags,
  wiring,
  platforms,
  title,
  description,
}: {
  tags: ReadonlyArray<string>;
  wiring?: PublishingWiring;
  platforms: PublishingViewModel["platforms"];
  title: string;
  description: string;
}) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const [list, setList] = React.useState<ReadonlyArray<string>>(tags);
  const [draft, setDraft] = React.useState("");
  // Re-sync when the server-resolved tags change (router.refresh after a commit).
  React.useEffect(() => {
    setList(tags);
  }, [tags]);

  const publicationId = activePublicationId(wiring, platforms);

  // Persist the FULL next tag set as a new revision (revisions are append-only —
  // a tag change = a new version, never a mutate). Title is required by the op
  // (min(1)); when empty we send a single space so the edit still lands (the
  // workspace 标题 is edited via its own field). No-op without a publication.
  const commit = React.useCallback(
    (next: ReadonlyArray<string>) => {
      if (!publicationId) return;
      startTransition(async () => {
        await client.createPublicationRevision({
          params: { publicationId },
          query: undefined,
          body: {
            title: title.trim() === "" ? " " : title,
            description,
            platformTags: [...next],
          },
        });
        router.refresh();
      });
    },
    [description, publicationId, router, title],
  );

  const addTag = React.useCallback(() => {
    const t = draft.trim();
    if (t === "" || list.includes(t)) {
      setDraft("");
      return;
    }
    const next = [...list, t];
    setList(next);
    setDraft("");
    commit(next);
  }, [commit, draft, list]);

  const removeTag = React.useCallback(
    (tag: string) => {
      const next = list.filter((t) => t !== tag);
      setList(next);
      commit(next);
    },
    [commit, list],
  );

  return (
    <div data-slot="tags-field" className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium text-muted-foreground">标签</span>
      <div
        data-slot="tags-list"
        className="flex flex-wrap items-center gap-0.5"
        aria-label="标签"
      >
        {list.length === 0 ? (
          <span className="text-[10px] text-muted-foreground">暂无标签。</span>
        ) : (
          list.map((tag) => (
            <span
              key={tag}
              data-slot="tag-chip"
              data-tag={tag}
              className="inline-flex h-4 items-center rounded-md bg-brand-soft px-1.5 text-[10px] font-medium text-brand"
            >
              {tag}
              <button
                type="button"
                data-slot="tag-remove"
                aria-label={`删除标签 ${tag}`}
                onClick={() => removeTag(tag)}
                className="ml-0.5 text-brand/60 hover:text-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
              >
                ×
              </button>
            </span>
          ))
        )}
        <input
          data-slot="tag-add-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          onBlur={addTag}
          placeholder="加标签"
          aria-label="添加标签"
          className="h-4 w-16 rounded border border-dashed border-border bg-surface px-1 text-[10px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
        />
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
  calendarWiring,
  projectId,
  topic,
}: {
  platforms: PublishingViewModel["platforms"];
  wiring?: PublishingWiring;
  calendarWiring?: CalendarWiring;
  projectId: string;
  topic: string;
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
      {wiring?.outputId ? (
        <PlatformAdaptIsland
          projectId={projectId}
          outputId={wiring.outputId}
          topic={topic}
        />
      ) : null}
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
        <AddPlatformControl platforms={platforms} wiring={wiring} />
      </SectionCard>
      <BatchTimeActions />
      <ConfirmPublishButton state={publishState} onConfirm={handleConfirm} />
      <ContentCalendar days={CALENDAR_DAYS} calendarWiring={calendarWiring} />
      <PrePublishCheck />
    </div>
  );
}

// SPEC §8「平台」行:补「手动加平台」(过去只能 AI 采纳建)。列出尚未建 publication 的
// 平台,点一个 → `outputs.publications.create` { platform, accountReference } 建一个新的
// publication 节点(服务自动播种 revision-1),再 router.refresh()。走既有 publishing op,
// 不新建影子机制。未接线(无 wiring/无 outputId)→ 不渲染(纯 fixture 无可写后端)。
const ALL_PLATFORMS: ReadonlyArray<PlatformId> = [
  "douyin",
  "bilibili",
  "xiaohongshu",
  "wechatVideo",
  "youtube",
  "x",
];

function AddPlatformControl({
  platforms,
  wiring,
}: {
  platforms: PublishingViewModel["platforms"];
  wiring?: PublishingWiring;
}) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const [adding, setAdding] = React.useState<string | null>(null);

  // Unwired / no output → no writable backend; hide the control (honest — a pure
  // fixture page has no publication to attach to).
  if (!wiring?.outputId) return null;

  const present = new Set(platforms.map((p) => p.platform));
  const available = ALL_PLATFORMS.filter((p) => !present.has(p));
  if (available.length === 0) return null;

  const add = (platform: PlatformId) => {
    setAdding(platform);
    startTransition(async () => {
      try {
        await client.createPublication({
          params: { outputId: wiring.outputId },
          query: undefined,
          body: { platform, accountReference: accountLabel(platform) },
        });
        router.refresh();
      } finally {
        setAdding(null);
      }
    });
  };

  return (
    <div
      data-slot="add-platform-control"
      className="mt-1 flex flex-wrap items-center gap-1 border-t border-border pt-1.5"
    >
      <span className="text-[9px] font-medium text-muted-foreground">
        手动加平台
      </span>
      {available.map((platform) => (
        <button
          key={platform}
          type="button"
          data-slot="add-platform-button"
          data-platform={platform}
          disabled={adding !== null}
          onClick={() => add(platform)}
          className="inline-flex h-5 items-center gap-1 rounded-full border border-dashed border-border bg-surface px-1.5 text-[9px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
        >
          <PlatformIcon platform={platform} size="xs" />
          {adding === platform ? "添加中…" : `+ ${shortLabelFor(platform)}`}
        </button>
      ))}
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

// Deterministic per-cell instant: weekStart + index days (C-5 — no Date.now). The base
// instant is injected by the server shell; the math is pure string→Date→string.
function cellPlannedAt(weekStart: string, index: number): string {
  const base = Date.parse(weekStart);
  return new Date(base + index * 86_400_000).toISOString();
}

function ContentCalendar({
  days,
  calendarWiring,
}: {
  days: ReadonlyArray<(typeof CALENDAR_DAYS)[number]>;
  calendarWiring?: CalendarWiring;
}) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();

  // §4 内容日历 cells (module 22 接管): when wired, an empty cell is a create affordance
  // → accounts.calendar.entries.create { plannedAt } then router.refresh(). Unwired →
  // the cell is inert (decorative, C-2 — no client-invented entry state).
  const createSlot = React.useCallback(
    (index: number) => {
      if (!calendarWiring) return;
      const plannedAt = cellPlannedAt(calendarWiring.weekStart, index);
      startTransition(async () => {
        await client.createEntry({
          params: { accountId: calendarWiring.accountId },
          query: undefined,
          body: { plannedAt },
        });
        router.refresh();
      });
    },
    [calendarWiring, router],
  );

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
        {days.map((day, index) => {
          const isEmpty = day.status === "empty";
          const clickable = Boolean(calendarWiring) && isEmpty;
          const Cell = clickable ? "button" : "div";
          return (
            <li key={day.label}>
              <Cell
                {...(clickable
                  ? {
                      type: "button" as const,
                      onClick: () => createSlot(index),
                      "aria-label": `为${day.label}新增计划`,
                    }
                  : {})}
                data-slot="content-calendar-cell"
                data-day-status={day.status}
                data-clickable={clickable ? "true" : "false"}
                className="flex w-full flex-col items-center gap-0.5 rounded-md border border-border bg-surface-subtle px-0.5 py-0.5"
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
              </Cell>
            </li>
          );
        })}
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
  stats,
}: {
  preview: PublishingViewModel["preview"];
  /** Real 播放/点赞/评论 from the latest analytics snapshot. Absent → hide the row. */
  stats?: PreviewStats;
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
            <span className="line-clamp-1 text-[11px] font-semibold text-white">
              {preview.title}
            </span>
            <span className="line-clamp-1 text-[8px] text-white/70">
              {preview.description}
            </span>
            {stats ? (
              <div
                data-slot="platform-preview-stats"
                className="flex items-center gap-1.5 text-[8px] tabular-nums text-white/80"
              >
                <span data-stat="plays">{stats.plays} 播放</span>
                <span data-stat="likes">{stats.likes} 点赞</span>
                <span data-stat="comments">{stats.comments} 评论</span>
              </div>
            ) : null}
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

function PlatformMetricsSummary({
  metrics,
}: {
  /** Real per-platform metric snapshots. Empty/absent → 暂无指标 skeleton. */
  metrics?: ReadonlyArray<PlatformMetricStat>;
}) {
  const list = metrics ?? [];
  if (list.length === 0) {
    return (
      <div
        data-slot="platform-metrics-summary"
        data-empty="true"
        className="rounded-md border border-dashed border-border/60 bg-surface px-2 py-2 text-center"
      >
        <p className="text-[10px] font-medium text-muted-foreground">暂无指标</p>
        <p className="text-[9px] text-muted-foreground">发布后自动回填各平台数据</p>
      </div>
    );
  }
  return (
    <div
      data-slot="platform-metrics-summary"
      data-empty="false"
      className="grid grid-cols-2 gap-0.5"
    >
      {list.map((m) => (
        <div
          key={m.id}
          data-slot="metric-card"
          data-platform={m.platform}
          className="flex flex-col gap-0 rounded-md border border-border/60 bg-surface px-1 py-0.5"
        >
          <span className="text-[10px] font-semibold tabular-nums text-foreground">
            {m.value}
          </span>
          <span className="flex items-center gap-0.5 text-[8px] font-medium text-muted-foreground">
            <PlatformIcon platform={m.platform} size="xs" />
            {m.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function PlatformComparison({
  rows,
}: {
  /** Real per-platform 触达/转化 rows. Empty/absent → 暂无指标 empty state. */
  rows?: ReadonlyArray<PlatformComparisonRow>;
}) {
  const list = rows ?? [];
  // Hide the 转化 column entirely when no row carries a conversion 口径 (the
  // metric snapshot has no defined conversion field this wave — see D-PUBW-c).
  const hasConversion = list.some((row) => row.conversion !== null);
  return (
    <div
      data-slot="platform-comparison"
      data-empty={list.length === 0 ? "true" : "false"}
      className="rounded-md border border-border bg-surface px-2 py-1"
    >
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-[10px] font-medium text-foreground">平台对比</span>
        <span className="text-[9px] text-muted-foreground">
          按平台查看触达与转化
        </span>
      </div>
      {list.length === 0 ? (
        <p className="py-1 text-center text-[9px] text-muted-foreground">
          暂无指标,发布后回填
        </p>
      ) : (
        <table
          data-slot="platform-comparison-table"
          className="w-full text-[10px] text-foreground"
        >
          <thead>
            <tr className="border-b border-border text-[9px] text-muted-foreground">
              <th className="py-0 text-left font-medium">平台</th>
              <th className="py-0 text-right font-medium">触达</th>
              {hasConversion ? (
                <th className="py-0 text-right font-medium">转化</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {list.map((row) => (
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
                {hasConversion ? (
                  <td className="py-0 text-right tabular-nums text-muted-foreground">
                    {row.conversion ?? "—"}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// 评论区: there is NO comments contract op (the contract has no comments module),
// so this block is permanently 规划中 (GAP-PUBW-1 AC4 / D-PUBW-a). It carries a
// visible 规划中 badge and NO fake @用户名 rows — honesty over a fabricated teaser.
function CommentsTeaser() {
  return (
    <div
      data-slot="comments-teaser"
      data-planned="true"
      className="rounded-md border border-dashed border-border bg-surface px-2 py-1"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-foreground">评论区</span>
        <span
          data-slot="planned-badge"
          title="评论能力规划中:暂无评论数据源"
          className="rounded-full bg-warning/15 px-1 text-[8px] font-medium text-warning"
        >
          规划中
        </span>
      </div>
      <p className="text-[9px] text-muted-foreground">
        发布后将在此汇总各平台评论互动。
      </p>
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
