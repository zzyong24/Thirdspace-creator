/**
 * Research Workspace page (Task 13 / page-specs §5).
 *
 * The `project-workspace` Header mode landing page for the Research
 * stage. Composes:
 *  - a Main column with the ProjectIdeaCard, the three-card
 *    TrendBackgroundSection, the CreativeMaterialGuideCard (the four
 *    creation-oriented material classes), and the ResearchCollectionSection
 *    (type tabs + source rows),
 *  - a right rail with the GatherMaterialIsland (the live AI 四类素材 adopt
 *    surface), ResearchNotesCard, EvidenceCollectionCard and RelatedTagsCard.
 *
 * L2「创作向重写」: the research stage is for CREATION prep, not market
 * analysis — the old 竞品分析表/威胁评估 (competitor table) is removed. The
 * 研究 stage now produces 钩子/案例/数据点/金句 that feed the script, surfaced
 * by the GatherMaterialIsland on the right rail.
 *
 * Layout invariants (locked by the page spec):
 *  - left-wide / right-narrow two-column grid,
 *  - exactly three ResearchSummaryCard in a row,
 *  - research collection type tabs in the locked order
 *    全部 / 文章 / 视频 / 报告 / 播客,
 *  - right rail order Gather → ResearchNotes → Evidence → RelatedTags.
 *
 * The page is a Server Component. It does not own a Sidebar or a
 * TopHeader — those live in `(creator)/layout.tsx` and are mounted once
 * for the whole route group. The page just provides the content slot.
 */

import * as React from "react";
import Link from "next/link";

import { SectionCard } from "@/components/project/section-card";
import { TagChip } from "@/components/content/tag-chip";
import { PageTabs } from "@/components/navigation/page-tabs";
import { buildResearchViewModel } from "@/fixtures/selectors";
import type {
  ResearchSourceRow,
  ResearchSummaryCard,
  ResearchViewModel,
} from "@/types/view-models";
import { ResearchNotesIsland } from "./research-notes-island";
import { EvidenceCollectionIsland } from "./evidence-collection-island";
import { GatherMaterialIsland } from "./gather-material-island";
import { PositioningFitBadge } from "@/features/positioning/positioning-fit-badge";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ResearchWorkspacePageProps {
  /** The id of the project to render. */
  readonly projectId: string;
  /** Override hook for tests; defaults to the production selector. */
  readonly viewModel?: ResearchViewModel;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ResearchWorkspacePage({
  projectId,
  viewModel,
}: ResearchWorkspacePageProps) {
  const vm = viewModel ?? buildResearchViewModel(projectId);
  return (
    <main
      data-app="creatoros"
      data-page="research"
      data-project-id={vm.projectId}
      className="flex flex-col gap-section-gap"
    >
      <div
        data-slot="research-grid"
        className="grid grid-cols-1 gap-card-gap lg:grid-cols-[minmax(0,1fr)_400px]"
      >
        <div
          data-slot="research-main-column"
          className="flex flex-col gap-card-gap"
        >
          <ProjectIdeaCard
            title={vm.idea.title}
            summary={vm.idea.summary}
            projectId={vm.projectId}
          />
          <TrendBackgroundSection cards={vm.trendCards} />
          <CreativeMaterialGuideCard />
          <ResearchCollectionSection
            tabs={vm.sourceTabs}
            sources={vm.sources}
          />
        </div>
        <div
          data-slot="research-right-rail"
          className="flex flex-col gap-card-gap"
        >
          <GatherMaterialIsland
            projectId={vm.projectId}
            topic={vm.idea.title}
            angle={vm.idea.summary}
          />
          <ResearchNotesIsland notes={vm.notes} />
          <EvidenceCollectionIsland items={vm.evidence} />
          <RelatedTagsCard tags={vm.relatedTags} />
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// ProjectIdeaCard
// ---------------------------------------------------------------------------

function ProjectIdeaCard({
  title,
  summary,
  projectId,
}: {
  title: string;
  summary: string;
  projectId: string;
}) {
  return (
    <div data-slot="project-idea-card">
      <SectionCard title="项目创意" description="一句话立意与目标受众">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="truncate text-base font-semibold text-foreground">
              {title}
            </h2>
            {/* 定位契合度 Badge (SPEC §3.4) — advisory, non-blocking; the score
                comes from the deterministic backend gate via client.evaluateGate. */}
            <PositioningFitBadge projectId={projectId} />
          </div>
          <p className="text-sm text-muted-foreground">{summary}</p>
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TrendBackgroundSection (3 cards in a row)
// ---------------------------------------------------------------------------

function TrendBackgroundSection({
  cards,
}: {
  cards: ReadonlyArray<ResearchSummaryCard>;
}) {
  return (
    <div data-slot="trend-background-section">
      <SectionCard title="趋势与背景" description="市场趋势与背景速览">
        <ul
          data-slot="trend-card-list"
          className="grid grid-cols-1 gap-3 md:grid-cols-3"
          aria-label="趋势卡片"
        >
          {cards.map((card) => (
            <li
              key={card.id}
              data-slot="research-summary-card"
              data-tone={card.tone}
              className="flex flex-col gap-1.5 rounded-card border border-border bg-surface-subtle p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {card.title}
                </span>
                <span
                  aria-hidden="true"
                  data-slot="trend-indicator"
                  className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground"
                >
                  <span aria-hidden="true">↗</span>
                  <span>趋势</span>
                </span>
              </div>
              <span className="text-xl font-semibold tabular-nums text-foreground">
                {card.metric}
              </span>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {card.description}
              </p>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreativeMaterialGuideCard (L2 创作向重写 — replaces the old 竞品分析表)
// ---------------------------------------------------------------------------

// The four creation-oriented material classes the 研究 stage produces. This is a
// static guide explaining what 搜集素材 yields; the LIVE candidates (real AI
// output, adoptable into the knowledge base) are surfaced by the
// GatherMaterialIsland on the right rail. No 竞品/威胁评估 here — the research
// stage is for creation prep, not market analysis.
const MATERIAL_CLASSES: ReadonlyArray<{
  id: string;
  label: string;
  hint: string;
}> = [
  { id: "hooks", label: "钩子", hint: "前 3 秒抓住注意力的开场句" },
  { id: "cases", label: "案例", hint: "讲出来有说服力的真实案例" },
  { id: "dataPoints", label: "数据点", hint: "能当论据的统计与事实" },
  { id: "quotes", label: "金句", hint: "可直接引用的有力句子" },
];

function CreativeMaterialGuideCard() {
  return (
    <div data-slot="creative-material-guide">
      <SectionCard
        title="创作素材方向"
        description="研究阶段为脚本备料 —— 用右侧「AI 搜集素材」按你的定位生成可采纳的四类素材"
      >
        <ul
          data-slot="material-class-list"
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
          aria-label="创作素材四类"
        >
          {MATERIAL_CLASSES.map((cls) => (
            <li
              key={cls.id}
              data-slot="material-class-card"
              data-class={cls.id}
              className="flex items-start gap-2.5 rounded-card border border-border bg-surface-subtle p-3.5"
            >
              <TagChip label={cls.label} tone="brand" size="sm" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {cls.hint}
              </p>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResearchCollectionSection (tabs + source rows)
// ---------------------------------------------------------------------------

function ResearchCollectionSection({
  tabs,
  sources,
}: {
  tabs: ResearchViewModel["sourceTabs"];
  sources: ReadonlyArray<ResearchSourceRow>;
}) {
  return (
    <div data-slot="research-collection-section">
      <SectionCard
        title="资料收集"
        description="已收集的文章、视频、报告与播客"
      >
        <div data-slot="page-tabs">
          <PageTabs tabs={tabs} defaultValue={tabs[0]?.id} ariaLabel="资料类型" />
        </div>
        <ul
          data-slot="research-source-list"
          className="mt-3 flex flex-col gap-2"
          aria-label="资料列表"
        >
          {sources.map((source) => (
            <li
              key={source.id}
              data-slot="research-source-row"
              className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {source.title}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {source.source}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {source.tags.map((tag) => (
                  <TagChip key={tag} label={tag} tone="neutral" size="sm" />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right rail
// ---------------------------------------------------------------------------

// F2c — Research decorative rows are intentionally inert (roadmap §4): 资料类型
// tabs (client filter, no-op today — GET /knowledge, keep local), 资料来源标签
// TagChip (Taxonomy), 相关标签 TagChip (GET /search — Taxonomy; rendered as
// navigational links to /search?tag=), 趋势卡片 indicator (Analytics), 创作素材
// 方向 guide (static explainer). These render with NO mutating handlers on
// purpose. The real adopt surface is the GatherMaterialIsland (live AI 四类素材);
// the two needs-backend rows (研究笔记 / 证据收藏) are islands: ResearchNotesIsland
// (F2a) + EvidenceCollectionIsland (F2b).

function RelatedTagsCard({ tags }: { tags: ResearchViewModel["relatedTags"] }) {
  return (
    <div data-slot="related-tags-card">
      <SectionCard title="相关标签" description="研究主题常用标签">
        {tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无相关标签。</p>
        ) : (
          <div className="flex flex-wrap gap-1.5" aria-label="相关标签">
            {tags.map((tag) => (
              // Module 04 §5a: the "相关标签" chips are now navigational — each
              // links to the Search page filtered by that tag name
              // (/search?tag=<name>). The Search module (02) owns the result
              // page that consumes `?tag=`. The chip stays a presentational
              // TagChip wrapped in the link; the `data-slot="related-tag"`
              // anchor is the click target.
              <Link
                key={tag}
                data-slot="related-tag"
                href={`/search?q=${encodeURIComponent(tag)}`}
                className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <TagChip label={tag} tone="info" size="sm" />
              </Link>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
