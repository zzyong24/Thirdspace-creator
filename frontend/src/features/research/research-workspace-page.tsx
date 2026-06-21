/**
 * Research Workspace page (Task 13 / page-specs §5).
 *
 * The `project-workspace` Header mode landing page for the Research
 * stage. Composes:
 *  - a Main column with the ProjectIdeaCard, the three-card
 *    TrendBackgroundSection, the CompetitorAnalysisTable, and the
 *    ResearchCollectionSection (type tabs + source rows),
 *  - a right rail with ResearchNotesCard, EvidenceCollectionCard and
 *    RelatedTagsCard.
 *
 * Layout invariants (locked by the page spec):
 *  - left-wide / right-narrow two-column grid,
 *  - exactly three ResearchSummaryCard in a row,
 *  - competitor table columns in the locked order
 *    竞品名称 / 平台 / 定位 / 优势 / 劣势 / 威胁等级,
 *  - research collection type tabs in the locked order
 *    全部 / 文章 / 视频 / 报告 / 播客,
 *  - right rail order ResearchNotes → Evidence → RelatedTags.
 *
 * The page is a Server Component. It does not own a Sidebar or a
 * TopHeader — those live in `(creator)/layout.tsx` and are mounted once
 * for the whole route group. The page just provides the content slot.
 */

import * as React from "react";
import Link from "next/link";

import { SectionCard } from "@/components/project/section-card";
import { StatusBadge } from "@/components/project/status-badge";
import { TagChip } from "@/components/content/tag-chip";
import { PageTabs } from "@/components/navigation/page-tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildResearchViewModel } from "@/fixtures/selectors";
import type {
  CompetitorRow,
  ResearchSourceRow,
  ResearchSummaryCard,
  ResearchViewModel,
} from "@/types/view-models";
import { ResearchNotesIsland } from "./research-notes-island";
import { EvidenceCollectionIsland } from "./evidence-collection-island";
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
          <CompetitorAnalysisTable rows={vm.competitors} />
          <ResearchCollectionSection
            tabs={vm.sourceTabs}
            sources={vm.sources}
          />
        </div>
        <div
          data-slot="research-right-rail"
          className="flex flex-col gap-card-gap"
        >
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
// CompetitorAnalysisTable
// ---------------------------------------------------------------------------

const COMPETITOR_COLUMNS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "name", label: "竞品名称" },
  { id: "platform", label: "平台" },
  { id: "positioning", label: "定位" },
  { id: "strength", label: "优势" },
  { id: "weakness", label: "劣势" },
  { id: "threat", label: "威胁等级" },
];

const THREAT_LABEL: Record<CompetitorRow["threat"], string> = {
  low: "低",
  medium: "中",
  high: "高",
};

function CompetitorAnalysisTable({
  rows,
}: {
  rows: ReadonlyArray<CompetitorRow>;
}) {
  return (
    <div data-slot="competitor-analysis-table">
      <SectionCard
        title="竞品分析"
        description="同类产品对比与威胁评估"
      >
        <Table>
          <TableHeader>
            <TableRow>
              {COMPETITOR_COLUMNS.map((column) => (
                <TableHead key={column.id}>{column.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                data-slot="competitor-row"
                data-competitor-id={row.id}
              >
                <TableCell className="font-medium text-foreground">
                  {row.name}
                </TableCell>
                <TableCell>
                  <TagChip label={row.platform} tone="brand" size="sm" />
                </TableCell>
                <TableCell>{row.note}</TableCell>
                <TableCell>
                  <CompetitorNote type="strength" threat={row.threat} />
                </TableCell>
                <TableCell>
                  <CompetitorNote type="weakness" threat={row.threat} />
                </TableCell>
                <TableCell>
                  <StatusBadge
                    status={
                      row.threat === "high"
                        ? "blocked"
                        : row.threat === "medium"
                          ? "in_progress"
                          : "done"
                    }
                    className="border-transparent"
                  >
                    <span
                      data-slot="competitor-threat"
                      data-threat={row.threat}
                    >
                      {THREAT_LABEL[row.threat]}
                    </span>
                  </StatusBadge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  );
}

function CompetitorNote({
  type,
  threat,
}: {
  type: "strength" | "weakness";
  threat: CompetitorRow["threat"];
}) {
  const pool = COMPETITOR_NOTES[threat] ?? [];
  const note = pool.find((entry) => entry.type === type);
  return (
    <span className="text-sm text-muted-foreground">{note?.text ?? "—"}</span>
  );
}

const COMPETITOR_NOTES: Record<
  CompetitorRow["threat"],
  ReadonlyArray<{ type: "strength" | "weakness"; text: string }>
> = {
  high: [
    { type: "strength", text: "代理任务覆盖度最广" },
    { type: "weakness", text: "本地上下文与隐私策略弱" },
  ],
  medium: [
    { type: "strength", text: "渲染性能稳定，扩展生态成熟" },
    { type: "weakness", text: "AI 入口尚未统一" },
  ],
  low: [
    { type: "strength", text: "专注于生产力场景" },
    { type: "weakness", text: "用户体量小，代理能力有限" },
  ],
};

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

// F2c — Research decorative rows are intentionally inert (roadmap §4, wired-local
// 6 · decorative 6): 资料类型 tabs (client filter, no-op today — GET /knowledge,
// keep local), 竞品平台 TagChip (Analytics), 威胁等级 StatusBadge (Projects), 资料
// 来源标签 TagChip (Taxonomy), 相关标签 TagChip (GET /search — Taxonomy; rendered as
// navigational links to /search?tag=), 趋势卡片 indicator (Analytics), 竞品分析表
// rows (read-only comparison). These render with NO mutating handlers on purpose.
// The two needs-backend rows (研究笔记 / 证据收藏) are now islands:
// ResearchNotesIsland (F2a) + EvidenceCollectionIsland (F2b).

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
                href={`/search?tag=${encodeURIComponent(tag)}`}
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
