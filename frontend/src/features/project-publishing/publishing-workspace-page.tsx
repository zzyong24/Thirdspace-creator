/**
 * Publishing Workspace page (Task 17 / page-specs §9).
 *
 * The `project-workspace` Header mode landing page for the Publishing
 * stage. Composes:
 *  - a `PublishingTabs` row of page tabs (锁定状态),
 *  - a `PublishingGrid` with three visual regions in the spec order
 *    BasicInformationForm → PlatformPublishingPanel → PreviewRail.
 *    The BasicInformationForm renders Title → Description → Cover →
 *    Tags → Category/Series → Publishing Options in spec order; the
 *    PlatformPublishingPanel renders platform cards as separate cards
 *    plus BatchTime / ConfirmPublish / PrePublishCheck controls; the
 *    PreviewRail renders PlatformPreview → PublishChecklist →
 *    PublishTips in spec order.
 *
 * Layout invariants (locked by page-specs §9):
 *  - exactly THREE columns (basic / platform / preview),
 *  - platform publish cards remain separate (NOT merged with the
 *    basic info column),
 *  - the PreviewRail order is preview → checklist → tips,
 *  - Confirm Publish is fixture-only: no `fetch`, no network
 *    publication side-effect.
 *
 * The page is a Server Component. It does not own a Sidebar or a
 * TopHeader — those live in `(creator)/layout.tsx` and are mounted once
 * for the whole route group. The page just provides the content slot.
 */

import * as React from "react";

import { PlatformIconView } from "@/components/publishing/platform-icon";
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
];

const PUBLISH_TIPS: ReadonlyArray<string> = [
  "标题前 16 字决定平台推荐曝光。",
  "首图分辨率 ≥ 1080×1440 适合双列信息流。",
  "勾选平台时间前先校对草稿。",
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
      className="flex flex-col gap-(--section-gap)"
    >
      <PublishingTabs tabs={vm.tabs} />
      <div
        data-slot="publishing-grid"
        className="grid grid-cols-1 gap-(--card-gap) lg:grid-cols-3"
      >
        <div
          data-slot="basic-information-form"
          className="flex flex-col gap-(--card-gap)"
        >
          <SectionCard
            title="基础信息"
            description="标题、描述、封面、标签与发布选项"
          >
            <div className="flex flex-col gap-4">
              <TitleField value={vm.form.title} />
              <DescriptionField value={vm.form.description} />
              <CoverSelector label={vm.form.coverLabel} />
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
          className="flex flex-col gap-(--card-gap)"
        >
          <SectionCard
            title="发布平台"
            description="按平台配置账号、排期与状态"
          >
            <ul
              data-slot="platform-publish-list"
              className="flex flex-col gap-3"
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
          <PrePublishCheck />
        </div>
        <div
          data-slot="preview-rail"
          className="flex flex-col gap-(--card-gap)"
        >
          <PlatformPreview preview={vm.preview} />
          <PublishChecklist items={vm.checklist} />
          <PublishTips tips={vm.tips} />
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
      className="flex flex-wrap items-center gap-2 border-b border-border pb-2"
    >
      {(tabs.length > 0 ? tabs : PUBLISHING_TABS).map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          data-slot="publishing-tab"
          data-tab-id={tab.id}
          data-pressed={index === 0}
          className="inline-flex h-8 items-center rounded-full border border-border bg-surface px-3 text-xs font-medium text-foreground data-[pressed=true]:border-brand/60 data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
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
        className="text-xs font-medium text-muted-foreground"
      >
        标题
      </label>
      <input
        id="publish-title"
        data-slot="title-input"
        defaultValue={value}
        readOnly
        className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-foreground"
      />
    </div>
  );
}

function DescriptionField({ value }: { value: string }) {
  return (
    <div data-slot="description-field" className="flex flex-col gap-1">
      <label
        htmlFor="publish-description"
        className="text-xs font-medium text-muted-foreground"
      >
        描述
      </label>
      <textarea
        id="publish-description"
        data-slot="description-input"
        defaultValue={value}
        readOnly
        rows={3}
        className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
      />
    </div>
  );
}

function CoverSelector({ label }: { label: string }) {
  return (
    <div data-slot="cover-selector" className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">封面</span>
      <div
        data-slot="cover-preview"
        aria-label={label}
        className="flex h-28 w-full items-center justify-center rounded-md border border-dashed border-border bg-surface-subtle text-xs text-muted-foreground"
      >
        {label}
      </div>
    </div>
  );
}

function TagsField({ tags }: { tags: ReadonlyArray<string> }) {
  return (
    <div data-slot="tags-field" className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">标签</span>
      <div
        data-slot="tags-list"
        className="flex flex-wrap gap-1"
        aria-label="标签"
      >
        {tags.length === 0 ? (
          <span className="text-xs text-muted-foreground">暂无标签。</span>
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
    <div data-slot="category-field" className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">分类 / 系列</span>
      <div className="grid grid-cols-2 gap-2">
        <div
          data-slot="category-input"
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
        >
          {category}
        </div>
        <div
          data-slot="series-input"
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
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
      <span className="text-xs font-medium text-muted-foreground">发布选项</span>
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
            className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm"
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
      className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PlatformIconView platform={card.platform} size="md" />
          <span className="text-sm font-medium text-foreground">
            {accountLabel(card.platform)}
          </span>
        </div>
        <StatusBadge status={status} />
      </header>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span data-slot="platform-account">{card.accountLabel}</span>
        <span
          data-slot="platform-scheduled"
          data-has-schedule={card.scheduledAt ? "true" : "false"}
        >
          {card.scheduledAt ? formatSchedule(card.scheduledAt) : "立即发布"}
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
    <div data-slot="batch-time-actions" className="flex flex-col gap-2">
      <SectionCard
        title="批量时间"
        description="统一配置多平台发布时间"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">默认排期</span>
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
    <div data-slot="confirm-publish-wrapper" className="flex justify-end">
      <button
        type="button"
        data-slot="confirm-publish-button"
        data-action="confirm-publish"
        className="inline-flex h-9 items-center rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground"
      >
        确认发布
      </button>
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
          className="flex flex-col gap-1 text-sm text-foreground"
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
          className="flex flex-col gap-2 rounded-card border border-border bg-surface-subtle p-3"
        >
          <header className="flex items-center gap-2">
            <PlatformIconView platform={preview.platform} size="sm" />
            <span className="text-xs text-muted-foreground">
              {platformLabel(preview.platform)}
            </span>
          </header>
          <h4
            data-slot="platform-preview-title"
            className="text-sm font-semibold text-foreground"
          >
            {preview.title}
          </h4>
          <p
            data-slot="platform-preview-description"
            className="line-clamp-3 text-xs text-muted-foreground"
          >
            {preview.description}
          </p>
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
              className="flex items-center justify-between gap-2 text-sm"
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
          className="flex flex-col gap-2 text-sm text-foreground"
          aria-label="发布小贴士"
        >
          {list.map((tip, index) => (
            <li
              key={tip}
              data-slot="publish-tip"
              data-tip-index={index}
              className="rounded-md border border-border bg-surface-subtle px-3 py-2"
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
  const project = getProjectById(projectId);
  if (!project) {
    return {
      scenario: "empty",
      kind: "publishing",
      projectId,
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

  // Surface up to 3 platform cards (the spec asks for cards to remain
  // separate — one per platform — so we cap the fixture-driven set so
  // the column never overflows).
  const fixtureCards = publications.slice(0, 3).map((pub) => ({
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
    tags: firstRevision?.platformTags ?? ["独立创作者", "工作流"],
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

function platformLabel(platform: PlatformId): string {
  return accountLabel(platform);
}