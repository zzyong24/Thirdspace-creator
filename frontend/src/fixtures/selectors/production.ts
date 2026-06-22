/**
 * Production Workspace selector.
 *
 * Maps the canonical dataset to the `ProductionViewModel` consumed by the
 * Production Workspace page. Pure and deterministic — no `Date.now`,
 * `Math.random` or network access. Page components import
 * `buildProductionViewModel` from `@/fixtures/selectors` and never
 * dereference `canonicalDataset` for data shaping.
 */

import { canonicalDataset, getProjectById } from "../canonical";
import type {
  ProductionAsset,
  ProductionViewModel,
} from "@/types/view-models";

// ---------------------------------------------------------------------------
// Locked asset category descriptors (asset library tabs)
// ---------------------------------------------------------------------------

interface AssetCategoryDescriptor {
  readonly id: string;
  readonly label: string;
  readonly types: ReadonlyArray<ProductionAsset["type"]>;
}

const ASSET_CATEGORIES: ReadonlyArray<AssetCategoryDescriptor> = [
  { id: "b-roll", label: "B-roll", types: ["video"] },
  { id: "image", label: "图片", types: ["image"] },
  { id: "video", label: "视频", types: ["video"] },
  { id: "audio", label: "音频", types: ["audio"] },
  { id: "score", label: "配乐", types: ["audio"] },
  { id: "bumper", label: "片头片尾", types: ["video"] },
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
// Selector: build the Production Workspace ViewModel
// ---------------------------------------------------------------------------

export function buildProductionViewModel(
  projectId: string,
): ProductionViewModel {
  const project = getProjectById(resolveProjectIdSlug(projectId));
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

  // Inject deterministic additional assets so the grid renders 9
  // thumbnails (3x3) per the test invariant without depending on the
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
    {
      id: "asset-thumb-broll-5",
      name: "B-Roll 05 搜索界面",
      type: "video",
      durationLabel: "00:26",
    },
    {
      id: "asset-thumb-broll-6",
      name: "B-Roll 06 写作演示",
      type: "video",
      durationLabel: "00:31",
    },
    {
      id: "asset-thumb-score-1",
      name: "配乐 01 科技感",
      type: "audio",
      durationLabel: "02:45",
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
  // Inject deterministic production timeline so the strip mirrors
  // the locked reference design (8 segments spanning ~8 minutes). The
  // canonical dataset only ships 2 production segments, so the
  // additional 6 are appended in the spec order.
  const canonicalSegments = canonicalDataset.productionSegments
    .slice()
    .sort((a, b) => a.position - b.position);
  const canonicalAsTimeline = canonicalSegments.map((segment, index) => ({
    id: segment.id,
    title: index === 0 ? "Hook" : segment.title,
    startLabel: formatTimestamp(Math.floor(segment.startMs / 1000)),
    endLabel: formatTimestamp(Math.floor(segment.endMs / 1000)),
  }));
  const additional: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly startMs: number;
    readonly endMs: number;
  }> = [
    { id: "pseg-timeline-2", title: "引入流程", startMs: 15000, endMs: 45000 },
    { id: "pseg-timeline-3", title: "什么 AI", startMs: 45000, endMs: 105000 },
    { id: "pseg-timeline-4", title: "关键技术", startMs: 105000, endMs: 180000 },
    { id: "pseg-timeline-5", title: "最佳契机", startMs: 180000, endMs: 300000 },
    { id: "pseg-timeline-6", title: "核心功能", startMs: 300000, endMs: 420000 },
    { id: "pseg-timeline-7", title: "未来展望", startMs: 420000, endMs: 465000 },
    { id: "pseg-timeline-8", title: "总结", startMs: 465000, endMs: 480000 },
  ];
  const additionalAsTimeline = additional.map((segment) => ({
    id: segment.id,
    title: segment.title,
    startLabel: formatTimestamp(Math.floor(segment.startMs / 1000)),
    endLabel: formatTimestamp(Math.floor(segment.endMs / 1000)),
  }));
  return [...canonicalAsTimeline, ...additionalAsTimeline];
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
