/**
 * Knowledge & Memory page (Task 19 / page-specs §11).
 *
 * The `/knowledge` global resource-center landing page. Composes:
 *  - a `KnowledgeToolbar` (search + filter affordances),
 *  - a `KnowledgeMetrics` row of MetricCard items in a single row,
 *  - a `KnowledgeGrid` with three columns in the spec order
 *      CategoryPanel → RecentKnowledgeTable → InsightRail
 *    where InsightRail contains the four insight blocks in the
 *    locked order PopularTags → MemoryInsights → UnsortedItems →
 *    ReusableSnippets.
 *
 * The page is a Server Component shell. The interactive part — search
 * input + category/type filter chips that narrow the rendered list, plus
 * row selection — lives in the Client island
 * `KnowledgeInteractiveRegion` (`./knowledge-interactive-region.tsx`),
 * consistent with the existing islands pattern (assets / settings /
 * search).
 *
 * When the ViewModel envelope signals `loading` / `error` / `empty`, the
 * page renders the shared page-state placeholders for the main content
 * region instead of the interactive grid. The default state renders the
 * island and is DOM-equivalent to the previous server-only render.
 *
 * Layout invariants (locked by page-specs §11, decision-log D-002):
 *  - The route is a global resource-center route. There is no
 *    project identity block, no second AppShell, and no second
 *    Sidebar/TopHeader. The Header region remains in `global` mode
 *    with the page title "知识库".
 *  - The MemoryInsights block is NOT removed (page-specs §11).
 *  - No folder-tree hierarchy is added.
 */

import * as React from "react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  resolvePageState,
} from "@/components/state/page-state";
import type {
  BasePageViewModel,
  MetricCard as MetricCardVm,
} from "@/types/view-models";
import { buildKnowledgeDashboardViewModel } from "./knowledge-data";
import { KnowledgeCommentBackflow } from "./knowledge-comment-backflow";
import { KnowledgeDumpZone } from "./knowledge-dump-zone";
import { KnowledgeInteractiveRegion } from "./knowledge-interactive-region";
// [T-118b gate-F4]「记一条经验」入口并入知识库(与已验证经验库同处)。复用经验
// 模块的 Copilot 深链入口组件(client,走 ?copilot=open&surface=experience 就地
// 开浮层,与页面路径解耦)—— 手录一条经验走同一 learning.capture 链路。
import { ExperienceCaptureLink } from "@/features/experience/experience-interactive-region";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface KnowledgePageProps {
  /**
   * Override hook for tests; defaults to the canonical dataset.
   * The page does not consume network or runtime data — it pulls
   * everything from the fixed fixtures (D-010) so SSR output is
   * deterministic.
   */
  readonly viewModel?: KnowledgeViewModel;
}

export interface KnowledgeViewModel extends BasePageViewModel {
  readonly kind: "knowledge";
  readonly metrics: ReadonlyArray<MetricCardVm>;
  readonly categories: ReadonlyArray<KnowledgeCategory>;
  readonly recent: ReadonlyArray<KnowledgeRow>;
  readonly popularTags: ReadonlyArray<KnowledgeTag>;
  readonly memoryInsights: ReadonlyArray<KnowledgeInsight>;
  readonly unsorted: ReadonlyArray<KnowledgeUnsorted>;
  readonly snippets: ReadonlyArray<KnowledgeSnippet>;
  /**
   * [T-118b/T-119] 「最近更新」混排分页:知识卡 + validated 经验条目共用同一
   * 分页上下文(按 updatedAt 倒序,最新在前,10 条/页)。`recent` 已是当前页
   * 的切片;`page`(1-based)/ `totalPages` / `total` 供页面渲染分页控件。
   * 可选是兼容缝:旧 fixture / 测试 override 不设置时,页面按单页(page=1,
   * totalPages=1,total=recent.length)兜底,既有结构性测试不受影响。
   */
  readonly recentPage?: number;
  readonly recentTotalPages?: number;
  readonly recentTotal?: number;
  /**
   * KNOW-13:当前生效的 `?tag=` 标签筛选(标签名)。非空时 `recent` 已在读侧
   * 装配层按该标签过滤,页面渲染「清除筛选」返回全量列表。可选:fixture 构建
   * 器不设置(等价 null,无筛选)。
   */
  readonly activeTag?: string | null;
  /**
   * T-079c 观点地图 VM(按 tag 主题聚类的分组卡墙,SPEC §3)。真实装配层
   * (knowledge-data)始终提供 → 页面默认视图 = 观点地图;可选是兼容缝:
   * fixture 构建器/旧测试 VM 不设置时,交互岛回落「全部」列表视图,
   * 既有结构性契约测试(toolbar/grid 三列)不受影响。
   */
  readonly atlas?: import("./knowledge-atlas-vm").KnowledgeAtlasVm | null;
}

export interface KnowledgeCategory {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  readonly tone: "neutral" | "brand" | "success" | "warning" | "info";
}

export interface KnowledgeRow {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly updatedAt: string;
  readonly status: "active" | "archived" | "draft";
  readonly tags: ReadonlyArray<string>;
  /**
   * [T-118b] 行来源:知识卡("knowledge",默认)或已验证经验条目
   * ("experience")。经验行在「最近更新」混排里带「经验」类型 chip 且**只读**
   * (点开看详情/来源,无采纳/翻案 —— 裁决是复盘的活)。可选:旧 fixture / 知识
   * 卡不设置时按 "knowledge" 兜底。
   */
  readonly origin?: "knowledge" | "experience";
  /**
   * [T-118b] 经验行(origin="experience")的只读详情:insight 全文 + 来源标注
   * (来自复盘 / 手录)。知识行不带(点开走 KnowledgeDetailPreview 读修订正文)。
   */
  readonly experienceDetail?: {
    readonly insight: string;
    /** 非 null ⇒ 来自复盘诊断;null ⇒ 手录/对话录入。 */
    readonly reviewId: string | null;
  };
}

export interface KnowledgeTag {
  readonly id: string;
  readonly name: string;
  readonly tone: "neutral" | "brand" | "success" | "warning" | "info";
}

export interface KnowledgeInsight {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

export interface KnowledgeUnsorted {
  readonly id: string;
  readonly title: string;
  readonly ageLabel: string;
}

export interface KnowledgeSnippet {
  readonly id: string;
  readonly title: string;
  readonly preview: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export async function KnowledgePage({ viewModel }: KnowledgePageProps = {}) {
  // READ-side made real ("知识库读侧做真"): the VM now derives `recent`, the
  // `metrics` row (知识条目 total / 本周新增 / 复用片段 / 知识关联 are REAL counts),
  // `categories` tally, the reusable-snippet LIST, the 未整理 (unlinked) LIST,
  // and light memory-insights — all from the REAL
  // `knowledge.list` + `knowledge.relations.list` ops (pglite, user-scoped).
  // 热门标签 derives from the REAL `taxonomy.tags.list` op (ranked by usageCount).
  // AI-search material confirmed into a KnowledgeItem flows through this list,
  // so the new entry is reflected in the total / week / category counts.
  // Assembly degrades to the pure fixture VM on read failure; each secondary
  // read (relations, tags) is independently guarded. The `viewModel?` prop
  // remains the test-override seam: when provided, no network read happens.
  const vm: KnowledgeViewModel =
    viewModel ?? (await buildKnowledgeDashboardViewModel());
  const isEmpty =
    vm.categories.length === 0 &&
    vm.recent.length === 0 &&
    vm.popularTags.length === 0 &&
    vm.memoryInsights.length === 0;
  const state = resolvePageState(vm, isEmpty);
  return (
    <main
      data-app="creatoros"
      data-page="knowledge"
      data-knowledge-id="knowledge-root"
      data-page-state={state}
      className="flex flex-col gap-section-gap"
    >
      {/* [T-118b gate-F4] 知识库页头:「记一条经验」入口并入(与已验证经验库同处)。
          手录一条经验 = 用户亲判,走 Copilot 深链(learning.capture)。经验 Tab
          退役后,这是记经验的唯一入口。仅 loading/error 不渲。 */}
      {state === "default" || state === "empty" ? (
        <div
          data-slot="knowledge-header"
          className="flex items-center justify-end"
        >
          <ExperienceCaptureLink />
        </div>
      ) : null}
      {/* T-062c 知识倾倒场:录入主入口(AI 归类确认门 + 手动补录),页面顶部常驻。
          空库也要能倒(否则空账号无录入口),仅 loading/error 不渲。 */}
      {state === "default" || state === "empty" ? <KnowledgeDumpZone /> : null}
      {/* T-092 评论回流:倾倒场旁常驻入口(三级去噪门;signals 0 行诚实空态引导采集)。 */}
      {state === "default" || state === "empty" ? (
        <KnowledgeCommentBackflow />
      ) : null}
      {state === "loading" ? (
        <LoadingState label="正在加载知识库…" rows={5} />
      ) : state === "error" ? (
        <ErrorState error={vm.error} />
      ) : state === "empty" ? (
        <EmptyState
          title="知识库暂无内容"
          description="把笔记、金句、逐字稿倒进上方的倾倒场,AI 自动归类后确认入库。"
        />
      ) : (
        <KnowledgeInteractiveRegion viewModel={vm} />
      )}
    </main>
  );
}
