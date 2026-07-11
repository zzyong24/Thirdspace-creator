/**
 * Publishing Workspace selector.
 *
 * Maps the canonical dataset to the `PublishingViewModel` consumed by the
 * Publishing Workspace page. Pure and deterministic — no `Date.now`,
 * `Math.random` or network access. Page components import
 * `buildPublishingViewModel` from `@/fixtures/selectors` and never
 * dereference `canonicalDataset` for data shaping.
 */

import { canonicalDataset, getProjectById } from "../canonical";
import type { PlatformId, PublicationStatus } from "@/types/domain";
import type { PublishingViewModel } from "@/types/view-models";

// ---------------------------------------------------------------------------
// Locked publishing tab descriptors
// ---------------------------------------------------------------------------

// [T-231①] "batch"(批量发布)项已清:批量发布无真实 publisher 支撑(live 绑
// mock),按「不能实现的去掉」原则从锁定 tab 列表移除。
const PUBLISHING_TABS: ReadonlyArray<{ readonly id: string; readonly label: string }> = [
  { id: "publishing", label: "发布设置" },
  { id: "history", label: "发布记录" },
  { id: "platforms", label: "平台管理" },
];

// ---------------------------------------------------------------------------
// Locked publish-checklist descriptors (fixture-only, never network)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Locked default platform cards (5 platforms matching reference design).
// ---------------------------------------------------------------------------

interface PlatformPublishCardWithHint {
  readonly id: string;
  readonly platform: PlatformId;
  readonly accountLabel: string;
  readonly status: PublicationStatus;
  readonly scheduledAt: string | null;
  readonly hint?: string;
}

const DEFAULT_PLATFORM_CARDS: ReadonlyArray<PlatformPublishCardWithHint> = [
  {
    id: "pcard-bilibili",
    platform: "bilibili",
    accountLabel: "B站 (Bilibili)",
    status: "scheduled",
    scheduledAt: "2024-05-18T20:00:00+08:00",
    hint: "AI 优化",
  },
  {
    id: "pcard-douyin",
    platform: "douyin",
    accountLabel: "抖音",
    status: "scheduled",
    scheduledAt: "2024-05-18T20:00:00+08:00",
    hint: "AI 生成",
  },
  {
    id: "pcard-wechatVideo",
    platform: "wechatVideo",
    accountLabel: "视频号",
    status: "draft",
    scheduledAt: null,
  },
  {
    id: "pcard-xiaohongshu",
    platform: "xiaohongshu",
    accountLabel: "小红书",
    status: "draft",
    scheduledAt: null,
  },
  {
    id: "pcard-youtube",
    platform: "youtube",
    accountLabel: "YouTube",
    status: "draft",
    scheduledAt: null,
  },
];

const PUBLISH_TIPS: ReadonlyArray<string> = [
  "建议 18:00-22:00 发布,获得更多曝光",
  "首图包含关键词 \"AI 浏览器\" 有利于搜索",
  "封面中包含产品界面能提升点击率",
];

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

  // Surface up to 5 platform cards matching the reference design.
  const fixtureCards: ReadonlyArray<PlatformPublishCardWithHint> = publications
    .slice(0, 5)
    .map((pub) => ({
      id: pub.id,
      platform: pub.platform,
      accountLabel: pub.accountReference,
      status: pub.status,
      scheduledAt: pub.scheduledAt ?? null,
    }));
  const cards: ReadonlyArray<PlatformPublishCardWithHint> =
    fixtureCards.length > 0 ? fixtureCards : DEFAULT_PLATFORM_CARDS;

  // Pull the form data from the first revision (or fall back to a blank
  // slate). [T-050] demo 硬编码文案(ainativebrowser 特判/假标签/假分类/假系列)
  // 退役:无 revision 时从项目真值(title/brief)带入,其余诚实置空。
  const firstRevision = revisions[0];
  const form = {
    title: firstRevision?.title ?? project.title,
    description: firstRevision?.description ?? project.brief,
    coverLabel: firstRevision?.coverAssetId ?? "",
    tags: firstRevision?.platformTags ?? [],
    category: firstRevision?.category ?? "",
    series: firstRevision?.series ?? "",
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
