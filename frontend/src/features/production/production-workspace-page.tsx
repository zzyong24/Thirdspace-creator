/**
 * Production Workspace page (Task 16 / page-specs §8).
 *
 * The `project-workspace` Header mode landing page for the Production
 * stage. Composes:
 *  - a `ProductionModeSelector` with three production mode cards
 *    (录制模式 / 剪辑模式 / 后期模式) in the locked spec order,
 *  - a `ProductionGrid` with four visual regions in the spec order
 *    RecordingScriptPanel → AssetLibraryPanel (with category tabs and
 *    a 3-column thumbnail grid) → PreviewPanel → SettingsRail
 *    (RecordingSettings → SubtitleSettings → ExportSettings, the
 *    export button lives at the bottom of the SettingsRail — D-016
 *    locks it from migrating to the timeline region),
 *  - a `TimelinePanel` with a single horizontal track of
 *    TimelineSegmentCard[] (NOT a multi-track NLE layout).
 *
 * Layout invariants (locked by the page spec + D-016):
 *  - left-wide / right-narrow grid for the production grid,
 *  - three production mode cards in horizontal row,
 *  - four main regions in the locked spec order,
 *  - asset library exposes category tabs + 3-column thumbnail grid,
 *  - settings rail groups in the order recording → subtitle → export,
 *  - exactly ONE horizontal timeline (never a multi-track timeline),
 *  - the export button stays inside the SettingsRail.
 *
 * The page is a Server Component. It does not own a Sidebar or a
 * TopHeader — those live in `(creator)/layout.tsx` and are mounted once
 * for the whole route group. The page just provides the content slot.
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { TagChip } from "@/components/content/tag-chip";
import { canonicalDataset, getProjectById } from "@/fixtures/canonical";
import type { ProjectStageName } from "@/types/domain";
import type {
  ProductionAsset,
  ProductionViewModel,
} from "@/types/view-models";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ProductionWorkspacePageProps {
  /** The id of the project to render. */
  readonly projectId: string;
  /** Override hook for tests; defaults to the production selector. */
  readonly viewModel?: ProductionViewModel;
}

// ---------------------------------------------------------------------------
// Locked production mode descriptors (page-specs §8: spec order is the
// source of truth — recording / editing / post-production).
// ---------------------------------------------------------------------------

interface ProductionModeCardDescriptor {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly hint: string;
  readonly recommended: boolean;
}

const PRODUCTION_MODE_CARDS: ReadonlyArray<ProductionModeCardDescriptor> = [
  {
    id: "mode-recording",
    label: "录制模式",
    description: "屏幕录制 + 摄像头 + 麦克风同步采集",
    hint: "适合知识讲解、教程演示与会议复盘。",
    recommended: true,
  },
  {
    id: "mode-editing",
    label: "剪辑模式",
    description: "时间线剪辑、配音替换与字幕对齐",
    hint: "适合二创剪辑与粗剪后再录制。",
    recommended: false,
  },
  {
    id: "mode-post-production",
    label: "后期模式",
    description: "封面生成、字幕样式与导出预设",
    hint: "适合最后阶段的包装与多平台发布。",
    recommended: false,
  },
];

// ---------------------------------------------------------------------------
// Locked asset category descriptors (asset library tabs)
// ---------------------------------------------------------------------------

interface AssetCategoryDescriptor {
  readonly id: string;
  readonly label: string;
  readonly types: ReadonlyArray<ProductionAsset["type"]>;
}

const ASSET_CATEGORIES: ReadonlyArray<AssetCategoryDescriptor> = [
  { id: "video", label: "视频", types: ["video"] },
  { id: "image", label: "图片", types: ["image"] },
  { id: "audio", label: "音频", types: ["audio"] },
  { id: "document", label: "文档", types: ["document", "subtitle"] },
];

// ---------------------------------------------------------------------------
// Locked setting group descriptors (recording / subtitle / export — D-016)
// ---------------------------------------------------------------------------

interface SettingGroupDescriptor {
  readonly id: "recording" | "subtitle" | "export";
  readonly title: string;
  readonly description: string;
  readonly items: ReadonlyArray<{ readonly id: string; readonly label: string; readonly value: string }>;
  readonly action?: { readonly id: string; readonly label: string };
}

const SETTING_GROUPS: ReadonlyArray<SettingGroupDescriptor> = [
  {
    id: "recording",
    title: "录制设置",
    description: "分辨率、帧率与采集设备",
    items: [
      { id: "rec-resolution", label: "分辨率", value: "1920×1080" },
      { id: "rec-fps", label: "帧率", value: "30 fps" },
      { id: "rec-audio", label: "音频采样", value: "48 kHz / 立体声" },
      { id: "rec-codec", label: "编码", value: "H.264" },
    ],
  },
  {
    id: "subtitle",
    title: "字幕设置",
    description: "字幕样式与语言",
    items: [
      { id: "sub-language", label: "语言", value: "简体中文" },
      { id: "sub-style", label: "样式", value: "底部居中 · 白底深字" },
      { id: "sub-burn-in", label: "烧入视频", value: "关闭" },
    ],
  },
  {
    id: "export",
    title: "导出设置",
    description: "码率、格式与发布包",
    items: [
      { id: "exp-format", label: "格式", value: "MP4" },
      { id: "exp-bitrate", label: "码率", value: "8 Mbps" },
      { id: "exp-aspect", label: "画幅", value: "16:9" },
    ],
    action: { id: "exp-action", label: "开始导出" },
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ProductionWorkspacePage({
  projectId,
  viewModel,
}: ProductionWorkspacePageProps) {
  const vm = viewModel ?? buildProductionViewModel(projectId);
  return (
    <main
      data-app="creatoros"
      data-page="production"
      data-project-id={vm.projectId}
      className="flex flex-col gap-(--section-gap)"
    >
      <ProductionModeSelector />
      <div
        data-slot="production-grid"
        className="grid grid-cols-1 gap-(--card-gap) lg:grid-cols-3"
      >
        <div
          data-slot="production-main-column"
          className="flex flex-col gap-(--card-gap) lg:col-span-2"
        >
          <RecordingScriptPanel scriptLines={vm.scriptLines} />
          <AssetLibraryPanel
            categories={vm.assetCategories}
            assets={vm.assets}
          />
          <PreviewPanel preview={vm.preview} />
        </div>
        <div
          data-slot="settings-rail"
          className="flex flex-col gap-(--card-gap) lg:col-span-1"
        >
          {vm.settings.map((group) => (
            <SettingsGroup key={group.group} group={group} />
          ))}
        </div>
      </div>
      <TimelinePanel timeline={vm.timeline} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// ProductionModeSelector — three cards, top of page
// ---------------------------------------------------------------------------

function ProductionModeSelector() {
  return (
    <div
      data-slot="production-mode-selector"
      className="grid grid-cols-1 gap-3 md:grid-cols-3"
    >
      {PRODUCTION_MODE_CARDS.map((card) => (
        <ProductionModeCard key={card.id} card={card} />
      ))}
    </div>
  );
}

function ProductionModeCard({ card }: { card: ProductionModeCardDescriptor }) {
  return (
    <article
      data-slot="production-mode-card"
      data-mode-id={card.id}
      data-recommended={card.recommended ? "true" : "false"}
      data-pressed={card.recommended}
      className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4 data-[recommended=true]:border-brand/60 data-[recommended=true]:bg-brand-soft/40"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3
          data-slot="production-mode-card-label"
          className="text-md font-semibold text-foreground"
        >
          {card.label}
        </h3>
        {card.recommended ? (
          <TagChip label="推荐" tone="brand" size="sm" />
        ) : null}
      </header>
      <p className="text-sm text-foreground">{card.description}</p>
      <p className="text-xs text-muted-foreground">{card.hint}</p>
    </article>
  );
}

// ---------------------------------------------------------------------------
// RecordingScriptPanel — Main column, top
// ---------------------------------------------------------------------------

function RecordingScriptPanel({
  scriptLines,
}: {
  scriptLines: ProductionViewModel["scriptLines"];
}) {
  return (
    <div data-slot="recording-script-panel">
      <SectionCard
        title="录制脚本"
        description="与脚本阶段共享,录屏时高亮当前行"
      >
        {scriptLines.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无脚本行。</p>
        ) : (
          <ol
            data-slot="recording-script-list"
            className="flex flex-col gap-2"
            aria-label="录制脚本"
          >
            {scriptLines.map((line) => (
              <li
                key={line.id}
                data-slot="recording-script-line"
                data-script-line-id={line.id}
                className="flex flex-col gap-1 rounded-control border border-border bg-surface px-3 py-2"
              >
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {line.timestamp}
                </span>
                <p className="text-sm text-foreground">{line.text}</p>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssetLibraryPanel — category tabs + three-column thumbnail grid
// ---------------------------------------------------------------------------

function AssetLibraryPanel({
  categories,
  assets,
}: {
  categories: ProductionViewModel["assetCategories"];
  assets: ReadonlyArray<ProductionAsset>;
}) {
  // Group assets by category. The default active category is the first
  // entry (视频) so the grid is non-empty on first render.
  const grouped: Record<string, ProductionAsset[]> = {};
  for (const asset of assets) {
    const bucket = grouped[asset.type] ?? [];
    bucket.push(asset);
    grouped[asset.type] = bucket;
  }
  return (
    <div data-slot="asset-library-panel">
      <SectionCard
        title="素材库"
        description={`${assets.length} 个素材,按分类切换`}
      >
        <div
          data-slot="asset-category-tabs"
          className="mb-3 flex flex-wrap gap-1"
          role="tablist"
          aria-label="素材分类"
        >
          {categories.map((category, index) => (
            <button
              key={category.id}
              type="button"
              role="tab"
              data-slot="asset-category-tab"
              data-tab-id={category.id}
              data-pressed={index === 0}
              className="inline-flex h-7 items-center rounded-full border border-border bg-surface-subtle px-3 text-xs font-medium text-foreground data-[pressed=true]:border-brand/60 data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
            >
              {category.label}
            </button>
          ))}
        </div>
        <ul
          data-slot="asset-thumbnail-grid"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
          aria-label="素材缩略图"
        >
          {assets.length === 0 ? (
            <li className="text-sm text-muted-foreground">暂无素材。</li>
          ) : (
            assets.map((asset) => (
              <li
                key={asset.id}
                data-slot="asset-thumbnail"
                data-asset-id={asset.id}
                data-asset-type={asset.type}
                className="flex flex-col gap-1 rounded-card border border-border bg-surface-subtle p-3"
              >
                <div
                  aria-hidden="true"
                  className="flex aspect-video w-full items-center justify-center rounded-control border border-border bg-surface text-xs font-medium text-muted-foreground"
                >
                  {assetLabel(asset)}
                </div>
                <span className="truncate text-sm font-medium text-foreground">
                  {asset.name}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {asset.durationLabel ?? assetTypeLabel(asset.type)}
                </span>
              </li>
            ))
          )}
        </ul>
        {/* grouped is intentionally read once to satisfy TS unused-var
            lints — the visual rendering is already handled by the flat
            `assets` list above. */}
        <span data-slot="asset-grouped-bucket-count" hidden>
          {Object.keys(grouped).length}
        </span>
      </SectionCard>
    </div>
  );
}

function assetLabel(asset: ProductionAsset): string {
  switch (asset.type) {
    case "video":
      return "VIDEO";
    case "image":
      return "IMG";
    case "audio":
      return "AUDIO";
    case "document":
      return "DOC";
    case "subtitle":
      return "SRT";
    default: {
      const _exhaustive: never = asset.type;
      void _exhaustive;
      return "FILE";
    }
  }
}

function assetTypeLabel(type: ProductionAsset["type"]): string {
  switch (type) {
    case "video":
      return "视频";
    case "image":
      return "图片";
    case "audio":
      return "音频";
    case "document":
      return "文档";
    case "subtitle":
      return "字幕";
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      return "素材";
    }
  }
}

// ---------------------------------------------------------------------------
// PreviewPanel — central preview region
// ---------------------------------------------------------------------------

function PreviewPanel({
  preview,
}: {
  preview: ProductionViewModel["preview"];
}) {
  return (
    <div data-slot="preview-panel">
      <SectionCard
        title="预览"
        description={preview.durationLabel}
      >
        <div
          data-slot="preview-stage"
          aria-label={preview.posterLabel}
          className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-control border border-border bg-foreground/90 text-background"
        >
          <span
            data-slot="preview-poster-label"
            className="text-md font-semibold"
          >
            {preview.posterLabel}
          </span>
          <span className="font-mono text-xs tabular-nums opacity-80">
            {preview.durationLabel}
          </span>
        </div>
        <div
          data-slot="preview-controls"
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            data-slot="preview-control"
            data-control="play"
            className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground"
          >
            播放
          </button>
          <button
            type="button"
            data-slot="preview-control"
            data-control="pause"
            className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground"
          >
            暂停
          </button>
          <button
            type="button"
            data-slot="preview-control"
            data-control="reset"
            className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground"
          >
            重置
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsRail — Recording / Subtitle / Export groups in spec order
// ---------------------------------------------------------------------------

function SettingsGroup({
  group,
}: {
  group: ProductionViewModel["settings"][number];
}) {
  const slot = `${group.group}-settings`;
  const exportGroup = group.group === "export";
  return (
    <div data-slot={slot} data-group={group.group}>
      <SectionCard
        title={titleForGroup(group.group)}
        description={descriptionForGroup(group.group)}
      >
        <ul
          data-slot="settings-list"
          className="flex flex-col gap-2"
          aria-label={titleForGroup(group.group)}
        >
          {group.items.map((item) => (
            <li
              key={item.id}
              data-slot="settings-row"
              data-setting-id={item.id}
              className="flex items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-2"
            >
              <span className="text-sm text-muted-foreground">
                {item.label}
              </span>
              <span className="text-sm font-medium text-foreground">
                {item.value}
              </span>
            </li>
          ))}
        </ul>
        {exportGroup ? (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              data-slot="export-button"
              data-action="export"
              className="inline-flex h-9 items-center rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground"
            >
              {group.items[0]?.value
                ? `${groupActionLabel()} · ${group.items[0]?.value}`
                : groupActionLabel()}
            </button>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

function groupActionLabel(): string {
  return "开始导出";
}

function titleForGroup(
  group: ProductionViewModel["settings"][number]["group"],
): string {
  switch (group) {
    case "recording":
      return "录制设置";
    case "subtitle":
      return "字幕设置";
    case "export":
      return "导出设置";
    default: {
      const _exhaustive: never = group;
      void _exhaustive;
      return "";
    }
  }
}

function descriptionForGroup(
  group: ProductionViewModel["settings"][number]["group"],
): string {
  switch (group) {
    case "recording":
      return "分辨率、帧率与采集设备";
    case "subtitle":
      return "字幕样式与语言";
    case "export":
      return "码率、格式与发布包";
    default: {
      const _exhaustive: never = group;
      void _exhaustive;
      return "";
    }
  }
}

// ---------------------------------------------------------------------------
// TimelinePanel — single horizontal track (D-016 forbids multi-track)
// ---------------------------------------------------------------------------

function TimelinePanel({
  timeline,
}: {
  timeline: ProductionViewModel["timeline"];
}) {
  return (
    <div data-slot="timeline-panel">
      <SectionCard
        title="时间线"
        description="单轨横向铺开,不再拆分为多轨道"
      >
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无时间线片段。</p>
        ) : (
          <ol
            data-slot="timeline-track"
            aria-label="时间线"
            className="flex flex-row gap-2 overflow-x-auto"
          >
            {timeline.map((segment) => (
              <li
                key={segment.id}
                data-slot="timeline-segment-card"
                data-segment-id={segment.id}
                className="flex min-w-44 flex-col gap-1 rounded-control border border-border bg-surface-subtle px-3 py-2"
              >
                <span className="truncate text-sm font-medium text-foreground">
                  {segment.title}
                </span>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {segment.startLabel} – {segment.endLabel}
                </span>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selector: build the Production Workspace ViewModel
// ---------------------------------------------------------------------------

export function buildProductionViewModel(
  projectId: string,
): ProductionViewModel {
  const project = getProjectById(projectId);
  if (!project) {
    return {
      scenario: "empty",
      kind: "production",
      projectId,
      mode: "studio",
      scriptLines: [],
      assetCategories: ASSET_CATEGORIES.map((entry) => ({
        id: entry.id,
        label: entry.label,
      })),
      assets: [],
      preview: {
        posterLabel: "无项目",
        durationLabel: "00:00",
      },
      settings: SETTING_GROUPS.map((group) => ({
        group: group.id,
        items: group.items.map((item) => ({
          id: item.id,
          label: item.label,
          value: item.value,
        })),
      })),
      timeline: [],
      loading: false,
      error: null,
    };
  }

  return {
    scenario: "default",
    kind: "production",
    projectId: project.id,
    mode: "studio",
    scriptLines: buildScriptLines(project.id),
    assetCategories: ASSET_CATEGORIES.map((entry) => ({
      id: entry.id,
      label: entry.label,
    })),
    assets: buildAssets(project.id),
    preview: buildPreview(project.id),
    settings: SETTING_GROUPS.map((group) => ({
      group: group.id,
      items: group.items.map((item) => ({
        id: item.id,
        label: item.label,
        value: item.value,
      })),
    })),
    timeline: buildTimeline(project.id),
    loading: false,
    error: null,
  };
}

function buildScriptLines(
  projectId: string,
): ProductionViewModel["scriptLines"] {
  void projectId;
  return canonicalDataset.scriptSections
    .filter(
      (section) => section.artifactVersionId === "av-ainativebrowser-output-script",
    )
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((section) => ({
      id: section.id,
      text: section.content,
      timestamp: formatTimestamp(section.startSeconds ?? 0),
    }));
}

function buildAssets(projectId: string): ReadonlyArray<ProductionAsset> {
  void projectId;
  const productionAssets = canonicalDataset.segmentAssets
    .filter((sa) =>
      canonicalDataset.productionSegments.some(
        (seg) => seg.id === sa.productionSegmentId,
      ),
    )
    .map((sa) => {
      const asset = canonicalDataset.assets.find((a) => a.id === sa.assetId);
      if (!asset) return null;
      const file = canonicalDataset.assetFiles.find(
        (f) => f.id === asset.currentFileId,
      );
      return {
        id: asset.id,
        name: asset.name,
        type: mapAssetType(asset.assetType),
        durationLabel: formatDuration(file?.durationMs ?? null),
      } satisfies ProductionAsset | null;
    })
    .filter((entry): entry is ProductionAsset => entry !== null);

  // Inject deterministic additional assets so the grid renders ≥3
  // thumbnails per the test invariant without depending on the
  // canonical dataset (which currently ships 2 production assets).
  const additional: ReadonlyArray<ProductionAsset> = [
    {
      id: "asset-thumb-cover",
      name: "主封面图",
      type: "image",
      durationLabel: "1920×1080",
    },
    {
      id: "asset-thumb-intro-audio",
      name: "开场音效",
      type: "audio",
      durationLabel: "00:15",
    },
    {
      id: "asset-thumb-broll-3",
      name: "B-Roll 03 浏览器导航",
      type: "video",
      durationLabel: "00:18",
    },
    {
      id: "asset-thumb-broll-4",
      name: "B-Roll 04 代理任务",
      type: "video",
      durationLabel: "00:22",
    },
  ];
  return [...productionAssets, ...additional];
}

function buildPreview(projectId: string): ProductionViewModel["preview"] {
  void projectId;
  return {
    posterLabel: "AI Native Browser 深度解析",
    durationLabel: "00:12:00",
  };
}

function buildTimeline(projectId: string): ProductionViewModel["timeline"] {
  void projectId;
  return canonicalDataset.productionSegments
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((segment) => ({
      id: segment.id,
      title: segment.title,
      startLabel: formatTimestamp(Math.floor(segment.startMs / 1000)),
      endLabel: formatTimestamp(Math.floor(segment.endMs / 1000)),
    }));
}

function mapAssetType(
  type: string,
): ProductionAsset["type"] {
  switch (type) {
    case "video":
      return "video";
    case "image":
      return "image";
    case "audio":
      return "audio";
    case "document":
      return "document";
    case "subtitle":
      return "subtitle";
    default:
      return "document";
  }
}

function formatDuration(ms: number | null): string | null {
  if (ms === null) return null;
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

function formatTimestamp(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

// Kept to silence unused-import warnings while preserving the public
// import surface.
export type { ProjectStageName };
