"use client";

/**
 * `ProductionInteractiveRegion` — Client island for the Production
 * Workspace page (Increment 4 / page-specs §8).
 *
 * The page (`production-workspace-page.tsx`) stays a Server Component
 * shell; the interactive content lives here following the existing
 * islands pattern (assets / settings / search).
 *
 * Wired interactions (client-only, fixture data, no network):
 *  - production mode cards: selectable (one active at a time),
 *  - asset category tabs: switch the active category and filter the
 *    thumbnail grid,
 *  - settings toggles: controlled on/off switches,
 *  - preview play/pause/reset: toggles a local "playing" state,
 *  - timeline segment cards: selectable; "添加章节" appends a new
 *    deterministic segment to local state,
 *  - export button: sets an "exporting" → "done" client state and
 *    surfaces the result inline (no network publication).
 *
 * Determinism: every value derives from props / fixtures or a
 * monotonic local counter. No `Date.now` / `Math.random` / `fetch`.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, Mic, MonitorPlay, Plus, Upload } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { SectionCard } from "@/components/project/section-card";
import { client } from "@/lib/contract-client";
import type {
  ProductionAsset,
  ProductionViewModel,
} from "@/types/view-models";

// ---------------------------------------------------------------------------
// Wiring descriptor (Module 09 Step 5). The server shell resolves the project's
// production via `outputs.production.get` and threads the resulting
// `{ outputId, productionId }` here so the needs-backend / wired-local→backend
// controls can drive their mapped contract op (FE button → contract op →
// user-scoped SQL → envelope → router.refresh()). Optional so the island still
// renders identically in pure-fixture contexts (default page render / state
// snapshots); when absent the wired controls degrade to local-only behavior.
// ---------------------------------------------------------------------------

export interface ProductionWiring {
  readonly outputId: string;
  readonly productionId: string;
}

// Map a production mode card id → the contract `productionMode` enum (§4 rows:
// 真人口播 → remote_recording, 知识演示 → screen_capture). AI 数字人 is decorative.
type ProductionMode = "remote_recording" | "screen_capture" | "studio";
const MODE_CARD_TO_PRODUCTION_MODE: Record<string, ProductionMode | undefined> =
  {
    "mode-direct-speaking": "remote_recording",
    "mode-knowledge-demo": "screen_capture",
  };

// ---------------------------------------------------------------------------
// Locked production mode descriptors (page-specs §8: spec order is the
// source of truth — recording / editing / post-production).
// ---------------------------------------------------------------------------

interface ProductionModeCardDescriptor {
  readonly id: string;
  readonly Icon: LucideIcon;
  readonly label: string;
  readonly description: string;
  readonly hint: string;
  readonly recommended: boolean;
  readonly comingSoon?: boolean;
}

const PRODUCTION_MODE_CARDS: ReadonlyArray<ProductionModeCardDescriptor> = [
  {
    id: "mode-direct-speaking",
    Icon: Mic,
    label: "真人口播",
    description: "录制人声画面,搭配 B-roll 和字幕",
    hint: "当前模式",
    recommended: true,
  },
  {
    id: "mode-knowledge-demo",
    Icon: MonitorPlay,
    label: "知识演示",
    description: "PPT + 录屏 + 配音讲解",
    hint: "教程与产品演示场景",
    recommended: false,
  },
  {
    id: "mode-ai-digital-human",
    Icon: Bot,
    label: "AI 数字人",
    description: "数字人出镜,AI 配音合成",
    hint: "即将上线",
    recommended: false,
    comingSoon: true,
  },
];

// ---------------------------------------------------------------------------
// ProductionInteractiveRegion
// ---------------------------------------------------------------------------

export function ProductionInteractiveRegion({
  viewModel,
  wiring,
}: {
  readonly viewModel: ProductionViewModel;
  readonly wiring?: ProductionWiring;
}) {
  return (
    <>
      <ProductionModeSelector wiring={wiring} />
      <div
        data-slot="production-grid"
        className="grid grid-cols-1 gap-3 xl:grid-cols-[260px_300px_minmax(0,1fr)_280px] xl:grid-rows-[minmax(0,1fr)_200px] xl:items-stretch"
      >
        <RecordingScriptPanel scriptLines={viewModel.scriptLines} />
        <AssetLibraryPanel
          categories={viewModel.assetCategories}
          assets={viewModel.assets}
        />
        <PreviewPanel preview={viewModel.preview} />
        <SettingsRail settings={viewModel.settings} wiring={wiring} />
        <TimelinePanel timeline={viewModel.timeline} wiring={wiring} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// ProductionModeSelector — three selectable cards, top of page
// ---------------------------------------------------------------------------

function ProductionModeSelector({
  wiring,
}: {
  readonly wiring?: ProductionWiring;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [activeMode, setActiveMode] = React.useState<string>(
    PRODUCTION_MODE_CARDS[0]!.id,
  );

  // §4: 真人口播 / 知识演示 are wired-local→backend — selecting a mode persists
  // the ContentOutput's productionMode via outputs.production.put, then refresh.
  // AI 数字人 is decorative (disabled, no mapping). Local state still flips so
  // the active-card affordance is immediate even before the refresh lands.
  const handleSelect = React.useCallback(
    (modeId: string) => {
      setActiveMode(modeId);
      const productionMode = MODE_CARD_TO_PRODUCTION_MODE[modeId];
      if (!wiring || productionMode === undefined) return;
      startTransition(async () => {
        await client.putOutputProduction({
          params: { outputId: wiring.outputId },
          query: undefined,
          body: { productionMode },
        });
        router.refresh();
      });
    },
    [router, wiring],
  );

  return (
    <div
      data-slot="production-mode-selector"
      data-testid="production-region"
      data-region="mode"
      data-pending={pending ? "true" : "false"}
      className="grid grid-cols-1 gap-3 md:grid-cols-3"
    >
      {PRODUCTION_MODE_CARDS.map((card) => (
        <ProductionModeCard
          key={card.id}
          card={card}
          active={card.id === activeMode}
          onSelect={handleSelect}
        />
      ))}
    </div>
  );
}

function ProductionModeCard({
  card,
  active,
  onSelect,
}: {
  card: ProductionModeCardDescriptor;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const Icon = card.Icon;
  return (
    <button
      type="button"
      data-slot="production-mode-card"
      data-mode-id={card.id}
      data-recommended={active ? "true" : "false"}
      data-pressed={active}
      aria-pressed={active}
      disabled={card.comingSoon}
      onClick={() => onSelect(card.id)}
      className="relative flex flex-col gap-2 rounded-card border border-border bg-surface px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-70 data-[recommended=true]:border-brand/60 data-[recommended=true]:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <header className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          data-slot="production-mode-card-icon"
          className="inline-flex size-7 items-center justify-center rounded-control border border-brand/40 bg-brand-soft text-brand"
        >
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
        <h3
          data-slot="production-mode-card-label"
          className="text-[15px] font-semibold text-foreground"
        >
          {card.label}
        </h3>
      </header>
      <p className="text-xs text-muted-foreground">{card.description}</p>
      <span className="text-[11px] font-medium text-brand">{card.hint}</span>
      {active ? (
        <span
          aria-hidden="true"
          data-slot="production-mode-card-check"
          className="absolute right-3 top-3 inline-flex size-5 items-center justify-center rounded-full bg-brand text-brand-foreground"
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// RecordingScriptPanel — Main column, top (presentational)
// ---------------------------------------------------------------------------

function RecordingScriptPanel({
  scriptLines,
}: {
  scriptLines: ProductionViewModel["scriptLines"];
}) {
  const expandedLines = scriptLines.map((line, index) => ({
    id: line.id,
    timestamp: line.timestamp,
    title: scriptLineTitle(index),
    body: scriptLineBody(index, line.text),
    durationLabel: scriptLineDuration(index),
  }));
  return (
    <div
      data-slot="recording-script-panel"
      data-testid="production-region"
      data-region="script"
      className="h-full overflow-hidden"
    >
      <SectionCard
        title="录制脚本"
        description="录屏时长 08:12 预计时长"
        action={
          <a
            href="#"
            data-slot="script-import-action"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-brand"
          >
            <Upload className="size-3" strokeWidth={2.5} />
            导入脚本
          </a>
        }
      >
        {expandedLines.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无脚本行。</p>
        ) : (
          <ol
            data-slot="recording-script-list"
            className="flex flex-col gap-1.5"
            aria-label="录制脚本"
          >
            {expandedLines.map((line) => (
              <li
                key={line.id}
                data-slot="recording-script-line"
                data-script-line-id={line.id}
                className="flex flex-col gap-1 rounded-control border border-border bg-surface px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground tabular-nums">
                  <span>{line.timestamp}</span>
                  <span>{line.durationLabel}</span>
                </div>
                <p className="text-[13px] font-medium text-foreground">
                  {line.title}
                </p>
                <p className="line-clamp-1 text-[11px] leading-relaxed text-muted-foreground">
                  {line.body}
                </p>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}

function scriptLineTitle(index: number): string {
  switch (index) {
    case 0:
      return "开场 Hook";
    case 1:
      return "引入流程";
    case 2:
      return "什么 AI";
    case 3:
      return "核心技术";
    case 4:
      return "核心功能解析";
    case 5:
      return "产品对比";
    default:
      return `脚本片段 ${index + 1}`;
  }
}

function scriptLineBody(index: number, fallback: string): string {
  switch (index) {
    case 0:
      return "30 秒开场吸引观众,强调 AI 浏览器与传统的差异。";
    case 1:
      return "梳理信息获取痛点,引出 AI 原生浏览器的新范式。";
    case 2:
      return "解释 AI Native Browser 的定位与核心使用场景。";
    case 3:
      return "拆解底层架构:大模型 + 智能体 + 浏览器内嵌执行。";
    case 4:
      return "演示核心功能:对话搜索、代理任务、智能写作。";
    case 5:
      return "与 Arc/Dia 对比,定位差异化的代理执行能力。";
    default:
      return fallback;
  }
}

function scriptLineDuration(index: number): string {
  switch (index) {
    case 0:
      return "15s";
    case 1:
      return "30s";
    case 2:
      return "60s";
    case 3:
      return "75s";
    case 4:
      return "150s";
    default:
      return "60s";
  }
}

// ---------------------------------------------------------------------------
// AssetLibraryPanel — selectable category tabs + filtered thumbnail grid
// ---------------------------------------------------------------------------

function AssetLibraryPanel({
  categories,
  assets,
}: {
  categories: ProductionViewModel["assetCategories"];
  assets: ReadonlyArray<ProductionAsset>;
}) {
  const [activeCategory, setActiveCategory] = React.useState<string>(
    categories[0]?.id ?? "",
  );
  // Filter the grid by the active category. The category id doubles as a
  // type filter where it matches an asset type; otherwise (e.g. the first
  // "B-roll" bucket) we fall back to showing all assets so the grid is
  // never empty by default.
  const visibleAssets = React.useMemo(() => {
    const matching = assets.filter((asset) => asset.type === activeCategory);
    return matching.length > 0 ? matching : assets;
  }, [assets, activeCategory]);

  const totalCount = assets.length * 20 + 8;
  const usedCount = assets.length * 4 + 4;
  const starredCount = assets.length + 8;
  const poolCount = assets.length + 4;
  return (
    <div
      data-slot="asset-library-panel"
      data-testid="production-region"
      data-region="assets"
      className="h-full overflow-hidden"
    >
      <SectionCard title="素材库" description="按分类切换,自动匹配当前片段">
        <div
          data-slot="asset-category-tabs"
          className="mb-2 flex flex-wrap gap-1"
          role="tablist"
          aria-label="素材分类"
        >
          {categories.map((category) => {
            const pressed = category.id === activeCategory;
            return (
              <button
                key={category.id}
                type="button"
                role="tab"
                data-slot="asset-category-tab"
                data-tab-id={category.id}
                data-pressed={pressed}
                aria-selected={pressed}
                onClick={() => setActiveCategory(category.id)}
                className="inline-flex h-6 items-center rounded-md border border-border bg-surface-subtle px-2 text-[11px] font-medium text-foreground data-[pressed=true]:border-brand/60 data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {category.label}
              </button>
            );
          })}
        </div>
        <div
          data-slot="asset-stats"
          className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
        >
          <span>
            <span className="font-semibold text-foreground">全部</span>{" "}
            {totalCount}
          </span>
          <span>
            <span className="font-semibold text-foreground">已使用</span>{" "}
            {usedCount}
          </span>
          <span>
            <span className="font-semibold text-foreground">收藏</span>{" "}
            {starredCount}
          </span>
          <span>
            <span className="font-semibold text-foreground">下载池</span>{" "}
            {poolCount}
          </span>
        </div>
        <ul
          data-slot="asset-thumbnail-grid"
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3"
          aria-label="素材缩略图"
        >
          {visibleAssets.length === 0 ? (
            <li className="text-sm text-muted-foreground">暂无素材。</li>
          ) : (
            visibleAssets.map((asset) => (
              <li
                key={asset.id}
                data-slot="asset-thumbnail"
                data-asset-id={asset.id}
                data-asset-type={asset.type}
                className="flex flex-col gap-1 rounded-card border border-border bg-surface-subtle p-2"
              >
                <div
                  aria-hidden="true"
                  className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-control border border-border p-1.5"
                  style={{
                    background: thumbnailGradientFor(asset.id, asset.type),
                  }}
                >
                  <span className="truncate px-1 text-center text-[11px] font-semibold leading-tight text-white">
                    {asset.name}
                  </span>
                  <span className="absolute bottom-1.5 left-1.5 rounded bg-black/35 px-1 text-[10px] font-medium tabular-nums text-white">
                    {asset.durationLabel ?? assetTypeLabel(asset.type)}
                  </span>
                </div>
              </li>
            ))
          )}
        </ul>
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

function thumbnailGradientFor(
  id: string,
  type: ProductionAsset["type"],
): string {
  const palettes: Record<ProductionAsset["type"], ReadonlyArray<string>> = {
    video: [
      "linear-gradient(135deg,#1e1b4b 0%,#4338ca 60%,#818cf8 100%)",
      "linear-gradient(135deg,#0f172a 0%,#1e40af 50%,#60a5fa 100%)",
      "linear-gradient(135deg,#312e81 0%,#6d28d9 50%,#c4b5fd 100%)",
      "linear-gradient(135deg,#082f49 0%,#0e7490 50%,#67e8f9 100%)",
    ],
    image: [
      "linear-gradient(135deg,#4c1d95 0%,#7c3aed 50%,#f0abfc 100%)",
      "linear-gradient(135deg,#9d174d 0%,#db2777 50%,#fbcfe8 100%)",
      "linear-gradient(135deg,#075985 0%,#0ea5e9 50%,#bae6fd 100%)",
      "linear-gradient(135deg,#14532d 0%,#16a34a 50%,#bbf7d0 100%)",
    ],
    audio: [
      "linear-gradient(135deg,#1f2937 0%,#374151 50%,#9ca3af 100%)",
      "linear-gradient(135deg,#0f172a 0%,#334155 50%,#94a3b8 100%)",
      "linear-gradient(135deg,#172554 0%,#1e3a8a 50%,#93c5fd 100%)",
    ],
    document: ["linear-gradient(135deg,#1e293b 0%,#475569 50%,#cbd5e1 100%)"],
    subtitle: ["linear-gradient(135deg,#27272a 0%,#52525b 50%,#d4d4d8 100%)"],
  };
  const bucket = palettes[type] ?? palettes.video;
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const idx = hash % bucket.length;
  return bucket[idx]!;
}

// ---------------------------------------------------------------------------
// PreviewPanel — central preview region with play/pause/reset state
// ---------------------------------------------------------------------------

function PreviewPanel({
  preview,
}: {
  preview: ProductionViewModel["preview"];
}) {
  const [playing, setPlaying] = React.useState<boolean>(false);
  return (
    <div
      data-slot="preview-panel"
      data-testid="production-region"
      data-region="preview"
      data-playing={playing ? "true" : "false"}
      className="h-full overflow-hidden"
    >
      <SectionCard
        title="预览"
        description={preview.durationLabel}
        action={
          <button
            type="button"
            data-slot="preview-aspect-toggle"
            className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-surface-subtle px-2 text-[11px] font-medium text-foreground"
          >
            <span aria-hidden="true">▭</span>
            16:9
          </button>
        }
      >
        <div
          data-slot="preview-stage"
          aria-label={preview.posterLabel}
          className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-control border border-border"
          style={{
            background:
              "linear-gradient(135deg, #1f1147 0%, #4c1d95 35%, #7c3aed 70%, #a78bfa 100%)",
          }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_45%)]"
          />
          <span
            data-slot="preview-poster-label"
            className="relative z-10 text-xl font-bold tracking-tight text-white"
          >
            {preview.posterLabel}
          </span>
          <span className="absolute right-3 bottom-3 z-10 rounded-md bg-black/40 px-2 py-0.5 font-mono text-[11px] tabular-nums text-white">
            {preview.durationLabel}
          </span>
          <span
            data-slot="preview-status"
            className="absolute left-3 bottom-3 z-10 rounded-md bg-black/40 px-2 py-0.5 text-[11px] font-medium text-white"
          >
            {playing ? "播放中" : "已暂停"}
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
            aria-pressed={playing}
            onClick={() => setPlaying(true)}
            className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground data-[control=play]:aria-pressed:border-brand"
          >
            播放
          </button>
          <button
            type="button"
            data-slot="preview-control"
            data-control="pause"
            aria-pressed={!playing}
            onClick={() => setPlaying(false)}
            className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground"
          >
            暂停
          </button>
          <button
            type="button"
            data-slot="preview-control"
            data-control="reset"
            onClick={() => setPlaying(false)}
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
// SettingsRail — Recording / Subtitle / Export groups with controlled toggles
// ---------------------------------------------------------------------------

function SettingsRail({
  settings,
  wiring,
}: {
  settings: ProductionViewModel["settings"];
  wiring?: ProductionWiring;
}) {
  return (
    <div
      data-slot="settings-rail"
      data-testid="production-region"
      data-region="settings"
      className="flex flex-col gap-3 overflow-hidden xl:col-start-4 xl:row-span-2 xl:row-start-1"
    >
      {settings.map((group) => (
        <SettingsGroup key={group.group} group={group} wiring={wiring} />
      ))}
    </div>
  );
}

// Map a toggle setting id → the outputs.production.put patch it persists (§4:
// rec-overlay → recordingConfig.overlay; sub-ai-generate → subtitleConfig.aiGenerate).
function togglePatchFor(
  settingId: string,
  checked: boolean,
):
  | { recordingConfig: { overlay: boolean } }
  | { subtitleConfig: { aiGenerate: boolean } }
  | null {
  if (settingId === "rec-overlay") {
    return { recordingConfig: { overlay: checked } };
  }
  if (settingId === "sub-ai-generate") {
    return { subtitleConfig: { aiGenerate: checked } };
  }
  return null;
}

function SettingsGroup({
  group,
  wiring,
}: {
  group: ProductionViewModel["settings"][number];
  wiring?: ProductionWiring;
}) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const slot = `${group.group}-settings`;
  const exportGroup = group.group === "export";
  const action = settingsActionFor(group.group);

  // Controlled toggle state, keyed by setting id. The initial value
  // mirrors the fixture's "开启 / 编辑样式" convention used by the
  // server render so the default DOM checked-state is unchanged.
  const [toggles, setToggles] = React.useState<Record<string, boolean>>(() => {
    const next: Record<string, boolean> = {};
    for (const item of group.items) {
      if (isToggleItem(item.id)) {
        next[item.id] = item.value === "开启" || item.value === "编辑样式";
      }
    }
    return next;
  });

  // Export action: idle → exporting → done. §4 导出视频 is needs-backend — the
  // dev mock render synchronously stages then completes (plan open-question #1):
  // productions.exports.create (queued) → exports.complete (queued→ready), which
  // drives the cross-module fan-out (ContentOutput active→ready, primary asset,
  // search index) inside the service UoW, then router.refresh(). When no wiring
  // is threaded the button degrades to the local idle→done affordance (no net).
  const router2 = useRouter();
  const [exportState, setExportState] = React.useState<
    "idle" | "exporting" | "done"
  >("idle");

  const handleExport = React.useCallback(() => {
    if (exportState === "exporting") return;
    if (!wiring) {
      setExportState("done");
      return;
    }
    setExportState("exporting");
    startTransition(async () => {
      const created = (await client.createProductionExport({
        params: { productionId: wiring.productionId },
        query: undefined,
        body: { format: "mp4", resolution: "1080p", aspectRatio: "16:9" },
      })) as { id: string };
      // The mock render finished out-of-band; the rendered file was staged
      // through MockObjectStorage server-side (Production never touches S3). The
      // resulting asset id is minted deterministically from the export id.
      await client.completeExport({
        params: { exportId: created.id },
        query: undefined,
        body: { resultAssetId: `asset-export-${created.id}` },
      });
      setExportState("done");
      router2.refresh();
    });
  }, [exportState, router2, wiring]);

  return (
    <div data-slot={slot} data-group={group.group} className="h-full">
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
          {group.items.map((item) => {
            const toggle = isToggleItem(item.id);
            const checked = toggles[item.id] ?? false;
            return (
              <li
                key={item.id}
                data-slot="settings-row"
                data-setting-id={item.id}
                className="flex items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-1.5"
              >
                <span className="text-[12px] text-muted-foreground">
                  {item.label}
                </span>
                {toggle ? (
                  <button
                    type="button"
                    data-slot="settings-row-toggle"
                    role="switch"
                    aria-checked={checked}
                    aria-label={item.label}
                    onClick={() => {
                      const next = !(toggles[item.id] ?? false);
                      setToggles((prev) => ({ ...prev, [item.id]: next }));
                      // §4: rec-overlay / sub-ai-generate are wired-local→backend
                      // — persist the config patch via outputs.production.put,
                      // then refresh. Other toggles (none currently) stay local.
                      const patch = togglePatchFor(item.id, next);
                      if (wiring && patch) {
                        startTransition(async () => {
                          await client.putOutputProduction({
                            params: { outputId: wiring.outputId },
                            query: undefined,
                            body: patch,
                          });
                          router.refresh();
                        });
                      }
                    }}
                    className="relative inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer items-center rounded-full bg-brand aria-[checked=false]:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <span
                      aria-hidden="true"
                      className={
                        "absolute top-[2px] left-[2px] inline-block size-[14px] rounded-full bg-surface transition-transform " +
                        (checked ? "translate-x-[14px]" : "translate-x-0")
                      }
                    />
                  </button>
                ) : (
                  <span
                    data-slot="settings-row-value"
                    className="inline-flex h-6 items-center rounded-md border border-border bg-surface-subtle px-2 text-[11px] font-medium text-foreground"
                  >
                    {item.value}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {exportGroup ? (
          <div className="mt-3 flex flex-col gap-1.5">
            <button
              type="button"
              data-slot="export-button"
              data-action="export"
              data-export-state={exportState}
              disabled={exportState === "exporting"}
              onClick={handleExport}
              className="inline-flex h-9 w-full items-center justify-center rounded-md bg-brand text-sm font-medium text-brand-foreground disabled:opacity-70"
            >
              {exportState === "done" ? "导出完成" : groupActionLabel()}
            </button>
            {exportState === "done" ? (
              <p
                data-slot="export-result"
                role="status"
                className="text-[11px] font-medium text-success"
              >
                视频已导出到本地草稿包。
              </p>
            ) : null}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

function isToggleItem(id: string): boolean {
  return id === "sub-ai-generate" || id === "rec-overlay";
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
// TimelinePanel — single horizontal track; selectable + appendable
// ---------------------------------------------------------------------------

interface TimelineSegment {
  readonly id: string;
  readonly title: string;
  readonly startLabel: string;
  readonly endLabel: string;
}

function TimelinePanel({
  timeline,
  wiring,
}: {
  timeline: ProductionViewModel["timeline"];
  wiring?: ProductionWiring;
}) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const [segments, setSegments] = React.useState<ReadonlyArray<TimelineSegment>>(
    () => timeline.map((s) => ({ ...s })),
  );
  const [selectedId, setSelectedId] = React.useState<string | null>(
    timeline[0]?.id ?? null,
  );
  const addCounterRef = React.useRef<number>(0);

  // §4: 添加章节 / 添加新片段 are wired-local→backend — append a deterministic
  // segment locally (immediate affordance) AND persist it via
  // productions.segments.create, then refresh. ms derive from the existing
  // parse/format helpers (plan §133). No wiring → local-only append.
  const handleAdd = React.useCallback(() => {
    addCounterRef.current += 1;
    const n = addCounterRef.current;
    const last = segments[segments.length - 1];
    const startSec = last ? parseTimestamp(last.endLabel) ?? n * 30 : n * 30;
    const endSec = startSec + 30;
    const position = segments.length + n;
    const title = `新章节 ${n}`;
    const newSegment: TimelineSegment = {
      id: `seg-added-${n}`,
      title,
      startLabel: formatTimestamp(startSec),
      endLabel: formatTimestamp(endSec),
    };
    setSegments((prev) => [...prev, newSegment]);
    setSelectedId(newSegment.id);
    if (wiring) {
      startTransition(async () => {
        await client.createProductionSegment({
          params: { productionId: wiring.productionId },
          query: undefined,
          body: {
            title,
            position,
            startMs: startSec * 1000,
            endMs: endSec * 1000,
          },
        });
        router.refresh();
      });
    }
  }, [router, segments, wiring]);

  return (
    <div
      data-slot="timeline-panel"
      data-testid="production-region"
      data-region="timeline"
      className="xl:col-start-2 xl:row-start-2 xl:col-span-2"
    >
      <SectionCard title="时间线" description="(可拖拽调整顺序)">
        {segments.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无时间线片段。</p>
        ) : (
          <div className="flex flex-row items-stretch gap-2 overflow-x-auto">
            <button
              type="button"
              data-slot="timeline-add-segment"
              onClick={handleAdd}
              className="flex min-w-28 flex-col items-center justify-center gap-1 rounded-control border border-dashed border-border bg-surface-subtle px-2.5 py-3 text-[11px] font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <Plus className="size-3.5" strokeWidth={2} />
              添加章节
            </button>
            <ol
              data-slot="timeline-track"
              aria-label="时间线"
              className="flex flex-row items-stretch gap-2"
            >
              {segments.map((segment) => {
                const selected = segment.id === selectedId;
                return (
                  <li key={segment.id}>
                    <button
                      type="button"
                      data-slot="timeline-segment-card"
                      data-segment-id={segment.id}
                      data-selected={selected ? "true" : "false"}
                      aria-pressed={selected}
                      onClick={() => setSelectedId(segment.id)}
                      className={
                        "flex min-w-28 flex-col gap-1.5 rounded-control border bg-surface p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 " +
                        (selected
                          ? "border-brand ring-2 ring-brand/40"
                          : "border-border")
                      }
                    >
                      <span className="font-mono text-[10px] font-semibold text-foreground tabular-nums">
                        {segment.startLabel}
                      </span>
                      <span className="truncate text-[12px] font-medium text-foreground">
                        {segment.title}
                      </span>
                      <div
                        aria-hidden="true"
                        data-slot="timeline-segment-thumb"
                        className="relative flex aspect-video w-full items-end overflow-hidden rounded-control border border-border p-1"
                        style={{ background: timelineGradientFor(segment.id) }}
                      >
                        <span className="rounded bg-black/35 px-1 font-mono text-[9px] font-medium tabular-nums text-white">
                          {segmentDurationLabel(
                            segment.startLabel,
                            segment.endLabel,
                          )}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>
            <button
              type="button"
              data-slot="timeline-add-segment-tail"
              onClick={handleAdd}
              className="flex min-w-12 flex-col items-center justify-center gap-1 rounded-control border border-dashed border-border bg-surface-subtle px-2 py-3 text-[11px] font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label="添加新片段"
            >
              <Plus className="size-3.5" strokeWidth={2} />
            </button>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function segmentDurationLabel(start: string, end: string): string {
  const startSec = parseTimestamp(start);
  const endSec = parseTimestamp(end);
  if (startSec === null || endSec === null || endSec <= startSec) return "—";
  const seconds = endSec - startSec;
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m${s.toString().padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

function timelineGradientFor(id: string): string {
  const palettes: ReadonlyArray<string> = [
    "linear-gradient(135deg,#1e1b4b 0%,#4338ca 60%,#818cf8 100%)",
    "linear-gradient(135deg,#0f172a 0%,#1e40af 50%,#60a5fa 100%)",
    "linear-gradient(135deg,#312e81 0%,#6d28d9 50%,#c4b5fd 100%)",
    "linear-gradient(135deg,#082f49 0%,#0e7490 50%,#67e8f9 100%)",
    "linear-gradient(135deg,#4c1d95 0%,#7c3aed 50%,#f0abfc 100%)",
    "linear-gradient(135deg,#9d174d 0%,#db2777 50%,#fbcfe8 100%)",
    "linear-gradient(135deg,#14532d 0%,#16a34a 50%,#bbf7d0 100%)",
    "linear-gradient(135deg,#1f2937 0%,#374151 50%,#9ca3af 100%)",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return palettes[hash % palettes.length]!;
}

function parseTimestamp(label: string): number | null {
  const parts = label.split(":");
  if (parts.length !== 2) return null;
  const m = Number.parseInt(parts[0] ?? "", 10);
  const s = Number.parseInt(parts[1] ?? "", 10);
  if (Number.isNaN(m) || Number.isNaN(s)) return null;
  return m * 60 + s;
}

function formatTimestamp(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
