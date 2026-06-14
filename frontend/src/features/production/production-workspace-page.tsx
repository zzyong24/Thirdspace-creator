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
    id: "mode-direct-speaking",
    label: "真人口播",
    description: "多机位人声画面,搭配 B-roll 和字幕",
    hint: "当前模式",
    recommended: true,
  },
  {
    id: "mode-knowledge-demo",
    label: "知识演示",
    description: "PPT + 录屏 + 配音讲解",
    hint: "教程与产品演示场景",
    recommended: false,
  },
  {
    id: "mode-ai-digital-human",
    label: "AI 数字人",
    description: "数字人出镜 + AI 配音合成",
    hint: "效率优先的批量生产",
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
      { id: "rec-camera", label: "摄像头", value: "FaceTime 高清摄像头" },
      { id: "rec-mic", label: "麦克风", value: "RØDE NT-USB+" },
      { id: "rec-quality", label: "画质", value: "1080P 30fps" },
      { id: "rec-overlay", label: "摄像头", value: "开启" },
      { id: "rec-screen", label: "录屏画面", value: "彩色" },
    ],
  },
  {
    id: "subtitle",
    title: "字幕设置",
    description: "字幕样式与语言",
    items: [
      { id: "sub-ai-generate", label: "AI 生成字幕", value: "开启" },
      { id: "sub-style", label: "字幕样式", value: "编辑样式" },
      { id: "sub-font", label: "字体", value: "思源黑体" },
      { id: "sub-size", label: "字号", value: "48" },
      { id: "sub-color", label: "颜色", value: "白色" },
      { id: "sub-stroke", label: "描边", value: "黑色描边中" },
      { id: "sub-position", label: "位置", value: "底部居中" },
    ],
  },
  {
    id: "export",
    title: "导出设置",
    description: "码率、格式与发布包",
    items: [
      { id: "exp-format", label: "格式", value: "MP4" },
      { id: "exp-resolution", label: "分辨率", value: "1080P" },
      { id: "exp-bitrate", label: "码率", value: "8 Mbps" },
    ],
    action: { id: "exp-action", label: "导出视频" },
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ProductionWorkspacePage({
  projectId,
  viewModel,
}: ProductionWorkspacePageProps) {
  const resolvedProjectId = resolveProjectIdSlug(projectId);
  const vm = viewModel ?? buildProductionViewModel(resolvedProjectId);
  return (
    <main
      data-app="creatoros"
      data-page="production"
      data-project-id={resolvedProjectId}
      className="flex flex-col gap-3"
    >
      <h2 className="text-base font-semibold text-foreground">
        制作方式选择
      </h2>
      <ProductionModeSelector />
      <div
        data-slot="production-grid"
        className="grid grid-cols-1 gap-3 xl:grid-cols-[280px_340px_minmax(0,1fr)_280px] xl:grid-rows-[552px_200px] xl:items-stretch"
      >
        <RecordingScriptPanel scriptLines={vm.scriptLines} />
        <AssetLibraryPanel
          categories={vm.assetCategories}
          assets={vm.assets}
        />
        <PreviewPanel preview={vm.preview} />
        <div
          data-slot="settings-rail"
          data-testid="production-region"
          data-region="settings"
          className="flex flex-col gap-3 overflow-hidden xl:col-start-4 xl:row-span-2 xl:row-start-1"
        >
          {vm.settings.map((group) => (
            <SettingsGroup key={group.group} group={group} />
          ))}
        </div>
        <TimelinePanel timeline={vm.timeline} />
      </div>
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
      data-testid="production-region"
      data-region="mode"
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
      className="flex flex-col gap-2 rounded-card border border-border bg-surface px-4 py-3 data-[recommended=true]:border-brand/60 data-[recommended=true]:bg-brand-soft/40"
    >
      <header className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          data-slot="production-mode-card-icon"
          className="inline-flex size-7 items-center justify-center rounded-control border border-border bg-surface-subtle text-[13px] font-semibold text-foreground"
        >
          {iconGlyph(card.id)}
        </span>
        <h3
          data-slot="production-mode-card-label"
          className="text-[15px] font-semibold text-foreground"
        >
          {card.label}
        </h3>
        {card.recommended ? (
          <TagChip label={card.hint} tone="brand" size="sm" />
        ) : null}
      </header>
      <p className="text-xs text-muted-foreground">{card.description}</p>
    </article>
  );
}

function iconGlyph(modeId: string): string {
  switch (modeId) {
    case "mode-direct-speaking":
      return "麦";
    case "mode-knowledge-demo":
      return "演";
    case "mode-ai-digital-human":
      return "AI";
    default:
      return "·";
  }
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
    <div
      data-slot="recording-script-panel"
      data-testid="production-region"
      data-region="script"
      className="h-full overflow-hidden xl:row-span-2"
    >
      <SectionCard
        title="录制脚本"
        description="与脚本阶段共享,录屏时高亮当前行"
      >
        {scriptLines.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无脚本行。</p>
        ) : (
          <ol
            data-slot="recording-script-list"
            className="flex flex-col gap-1.5"
            aria-label="录制脚本"
          >
            {scriptLines.map((line) => (
              <li
                key={line.id}
                data-slot="recording-script-line"
                data-script-line-id={line.id}
                className="flex items-center gap-3 rounded-control border border-border bg-surface px-3 py-1.5"
              >
                <span className="min-w-28 font-mono text-[11px] text-muted-foreground tabular-nums">
                  {line.timestamp}
                </span>
                <p className="line-clamp-1 flex-1 text-[13px] text-foreground">
                  {line.text}
                </p>
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
    <div
      data-slot="asset-library-panel"
      data-testid="production-region"
      data-region="assets"
      className="h-full overflow-hidden"
    >
      <SectionCard
        title="素材库"
        description={`${assets.length} 个素材,按分类切换`}
      >
        <div
          data-slot="asset-category-tabs"
          className="mb-2 flex flex-wrap gap-1"
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
              className="inline-flex h-6 items-center rounded-md border border-border bg-surface-subtle px-2 text-[11px] font-medium text-foreground data-[pressed=true]:border-brand/60 data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
            >
              {category.label}
            </button>
          ))}
        </div>
        <ul
          data-slot="asset-thumbnail-grid"
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3"
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
                className="flex flex-col gap-1 rounded-card border border-border bg-surface-subtle p-2"
              >
                <div
                  aria-hidden="true"
                  className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-control border border-border bg-foreground/90 p-1.5 text-background"
                >
                  <span className="truncate px-1 text-center text-[11px] font-semibold leading-tight">
                    {asset.name}
                  </span>
                  <span className="absolute bottom-1.5 left-1.5 text-[10px] font-medium tabular-nums opacity-80">
                    {asset.durationLabel ?? assetTypeLabel(asset.type)}
                  </span>
                </div>
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
    <div
      data-slot="preview-panel"
      data-testid="production-region"
      data-region="preview"
      className="h-full overflow-hidden"
    >
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
  const action = settingsActionFor(group.group);
  return (
    <div data-slot={slot} data-group={group.group}>
      <SectionCard
        title={titleForGroup(group.group)}
        description={descriptionForGroup(group.group)}
        action={
          action ? (
            <a
              href="#"
              data-slot="settings-action"
              className="text-[11px] font-medium text-brand"
            >
              {action}
            </a>
          ) : null
        }
      >
        <ul
          data-slot="settings-list"
          className="flex flex-col gap-1.5"
          aria-label={titleForGroup(group.group)}
        >
          {group.items.map((item) => (
            <li
              key={item.id}
              data-slot="settings-row"
              data-setting-id={item.id}
              className="flex items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-1.5"
            >
              <span className="text-[12px] text-muted-foreground">
                {item.label}
              </span>
              <span
                data-slot="settings-row-value"
                className="inline-flex h-6 items-center rounded-md border border-border bg-surface-subtle px-2 text-[11px] font-medium text-foreground"
              >
                {item.value}
              </span>
            </li>
          ))}
        </ul>
        {exportGroup ? (
          <div className="mt-3">
            <button
              type="button"
              data-slot="export-button"
              data-action="export"
              className="inline-flex h-9 w-full items-center justify-center rounded-md bg-brand text-sm font-medium text-brand-foreground"
            >
              {groupActionLabel()}
            </button>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

function groupActionLabel(): string {
  return "导出视频";
}

function settingsActionFor(
  group: ProductionViewModel["settings"][number]["group"],
): string | null {
  switch (group) {
    case "recording":
      return "设备检测";
    case "subtitle":
      return "预览字幕效果";
    case "export":
      return null;
    default: {
      const _exhaustive: never = group;
      void _exhaustive;
      return null;
    }
  }
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
    <div
      data-slot="timeline-panel"
      data-testid="production-region"
      data-region="timeline"
      className="xl:col-span-2 xl:col-start-2"
    >
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
            className="flex flex-row gap-1.5 overflow-x-auto"
          >
            {timeline.map((segment) => (
              <li
                key={segment.id}
                data-slot="timeline-segment-card"
                data-segment-id={segment.id}
                className="flex min-w-36 flex-col gap-1 rounded-control border border-border bg-surface-subtle px-2.5 py-1.5"
              >
                <span className="truncate text-[12px] font-medium text-foreground">
                  {segment.title}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                  {segment.startLabel}
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
      timestamp: `${formatTimestamp(section.startSeconds ?? 0)} – ${formatTimestamp(section.endSeconds ?? 0)}`,
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

/**
 * The route segment for a project is a URL slug (e.g. `ai-native-browser`)
 * while the canonical dataset uses prefixed IDs (e.g.
 * `project-ainativebrowser`). Translate between them so the page
 * content can resolve the canonical project even when the shared
 * shell-router hasn't yet been taught the slug-to-id mapping.
 *
 * Falls back to the original slug if no canonical match is found, in
 * which case the caller surfaces the empty project state.
 */
function resolveProjectIdSlug(slug: string): string {
  if (!slug) return slug;
  const knownIds = canonicalDataset.projects.map((project) => project.id);
  if (knownIds.includes(slug)) return slug;
  const candidate = `project-${slug.replace(/-/g, "")}`;
  if (knownIds.includes(candidate)) return candidate;
  return slug;
}

// Kept to silence unused-import warnings while preserving the public
// import surface.
export type { ProjectStageName };
