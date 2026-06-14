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
import { canonicalDataset, getProjectById } from "@/fixtures/canonical";
import type {
  CompetitorRow,
  ResearchSourceRow,
  ResearchSummaryCard,
  ResearchViewModel,
} from "@/types/view-models";
import type { PlatformId, ProjectStageName } from "@/types/domain";

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
        className="grid grid-cols-1 gap-card-gap lg:grid-cols-3"
      >
        <div
          data-slot="research-main-column"
          className="flex flex-col gap-card-gap lg:col-span-2"
        >
          <ProjectIdeaCard
            title={vm.idea.title}
            summary={vm.idea.summary}
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
          className="flex flex-col gap-card-gap lg:col-span-1"
        >
          <ResearchNotesCard notes={vm.notes} />
          <EvidenceCollectionCard items={vm.evidence} />
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
}: {
  title: string;
  summary: string;
}) {
  return (
    <div data-slot="project-idea-card">
      <SectionCard title="项目创意" description="一句话立意与目标受众">
        <div className="flex flex-col gap-2">
          <h2 className="truncate text-base font-semibold text-foreground">
            {title}
          </h2>
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

function ResearchNotesCard({
  notes,
}: {
  notes: ResearchViewModel["notes"];
}) {
  return (
    <div data-slot="research-notes-card">
      <SectionCard title="研究笔记" description={`${notes.length} 条待整理笔记`}>
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无研究笔记。</p>
        ) : (
          <ul
            data-slot="research-notes-list"
            className="flex flex-col gap-1.5"
            aria-label="研究笔记"
          >
            {notes.map((note, index) => (
              <li
                key={note.id}
                data-slot="research-note-row"
                className="flex gap-2 rounded-control border border-border bg-surface px-2.5 py-2 text-sm text-foreground"
              >
                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 leading-relaxed">{note.content}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function EvidenceCollectionCard({
  items,
}: {
  items: ResearchViewModel["evidence"];
}) {
  return (
    <div data-slot="evidence-collection-card">
      <SectionCard title="证据收藏" description="已关联到论点的证据">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无证据。</p>
        ) : (
          <ul
            data-slot="evidence-list"
            className="flex flex-col gap-1.5"
            aria-label="证据列表"
          >
            {items.map((item) => (
              <li
                key={item.id}
                data-slot="evidence-row"
                className="flex items-center gap-2 rounded-control border border-border bg-surface px-2.5 py-2"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">
                    {item.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{item.type}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function RelatedTagsCard({ tags }: { tags: ResearchViewModel["relatedTags"] }) {
  return (
    <div data-slot="related-tags-card">
      <SectionCard title="相关标签" description="研究主题常用标签">
        {tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无相关标签。</p>
        ) : (
          <div className="flex flex-wrap gap-1.5" aria-label="相关标签">
            {tags.map((tag) => (
              <span key={tag} data-slot="related-tag">
                <TagChip label={tag} tone="info" size="sm" />
              </span>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selector: build the Research Workspace ViewModel
// ---------------------------------------------------------------------------

export function buildResearchViewModel(
  projectId: string,
): ResearchViewModel {
  const project = getProjectById(resolveProjectIdSlug(projectId));
  if (!project) {
    return {
      scenario: "empty",
      kind: "research",
      projectId,
      idea: { title: "未找到项目", summary: "" },
      trendCards: [],
      competitors: [],
      sourceTabs: DEFAULT_SOURCE_TABS,
      sources: [],
      notes: [],
      evidence: [],
      relatedTags: [],
      loading: false,
      error: null,
    };
  }

  return {
    scenario: "default",
    kind: "research",
    projectId: project.id,
    idea: {
      title: project.title,
      summary: project.brief,
    },
    trendCards: buildTrendCards(project.id),
    competitors: buildCompetitors(),
    sourceTabs: DEFAULT_SOURCE_TABS,
    sources: buildSources(project.id),
    notes: buildNotes(project.id),
    evidence: buildEvidence(project.id),
    relatedTags: buildRelatedTags(project.id),
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

const DEFAULT_SOURCE_TABS: ReadonlyArray<ResearchViewModel["sourceTabs"][number]> = [
  { id: "all", label: "全部" },
  { id: "article", label: "文章" },
  { id: "video", label: "视频" },
  { id: "report", label: "报告" },
  { id: "podcast", label: "播客" },
];

function buildTrendCards(projectId: string): ReadonlyArray<ResearchSummaryCard> {
  const knowledgeCount = canonicalDataset.knowledgeItems.filter(
    (item) => item.userId === canonicalDataset.user.id,
  ).length;
  const evidenceCount = canonicalDataset.evidenceLinks.filter((link) =>
    canonicalDataset.thesisNodes.some(
      (node) =>
        node.id === link.thesisNodeId &&
        node.artifactVersionId === "av-ainativebrowser-thesis-tree",
    ),
  ).length;
  void projectId;
  return [
    {
      id: "trend-market",
      title: "浏览器市场",
      metric: "2.8 亿用户",
      description: "AI Native 浏览器赛道同比 +42%",
      tone: "positive",
    },
    {
      id: "trend-knowledge",
      title: "研究沉淀",
      metric: `${knowledgeCount} 条知识`,
      description: "已收集 120 份用户调研样本",
      tone: "info",
    },
    {
      id: "trend-evidence",
      title: "证据完整度",
      metric: `${evidenceCount} 条证据`,
      description: "覆盖三个核心论点",
      tone: "warning",
    },
  ];
}

function buildCompetitors(): ReadonlyArray<CompetitorRow> {
  return [
    {
      id: "competitor-arc",
      name: "Arc",
      platform: "youtube",
      views: 18_400,
      threat: "medium",
      note: "AI 入口与代理任务浏览器",
    },
    {
      id: "competitor-dia",
      name: "Dia",
      platform: "bilibili",
      views: 9_340,
      threat: "low",
      note: "面向知识工作者的浏览器",
    },
    {
      id: "competitor-sigma-os",
      name: "Sigma OS",
      platform: "youtube",
      views: 22_100,
      threat: "high",
      note: "本地优先代理操作系统",
    },
    {
      id: "competitor-privacy-crusader",
      name: "Privacy Crusader",
      platform: "youtube",
      views: 6_120,
      threat: "low",
      note: "以隐私为卖点的轻量浏览器",
    },
    {
      id: "competitor-openai-atlas",
      name: "Open AI Atlas",
      platform: "bilibili",
      views: 41_800,
      threat: "high",
      note: "Open AI 推出的 AI Native 浏览器",
    },
  ];
}

function buildSources(projectId: string): ReadonlyArray<ResearchSourceRow> {
  void projectId;
  return [
    {
      id: "source-arc-research",
      title: "Arc / Dia 用户调研报告",
      source: "Gemic · 2026-05",
      capturedAt: "2026-05-30T10:00:00+08:00",
      tags: ["AI", "浏览器", "调研"],
    },
    {
      id: "source-local-memory",
      title: "本地优先栈趋势观察",
      source: "Notion · 2026-05-25",
      capturedAt: "2026-05-25T10:00:00+08:00",
      tags: ["本地优先", "知识"],
    },
    {
      id: "source-hook-formula",
      title: "Hook 公式:三段式开场",
      source: "内部知识库 · 2026-04",
      capturedAt: "2026-04-12T10:00:00+08:00",
      tags: ["Hook", "脚本"],
    },
  ];
}

function buildNotes(
  projectId: string,
): ResearchViewModel["notes"] {
  void projectId;
  return [
    {
      id: "note-1",
      content: "代理浏览器重塑入口:用户从打开标签页转为发起代理任务。",
    },
    {
      id: "note-2",
      content: "本地优先栈成为独立创作者的默认选择(2026 趋势观察)。",
    },
    {
      id: "note-3",
      content: "研究阶段需引用至少 100 份用户样本,降低结论误差。",
    },
  ];
}

function buildEvidence(
  projectId: string,
): ResearchViewModel["evidence"] {
  void projectId;
  return [
    {
      id: "ev-1",
      title: "Arc / Dia 用户调研摘录",
      type: "知识条目",
    },
    {
      id: "ev-2",
      title: "本地优先栈趋势",
      type: "知识条目",
    },
    {
      id: "ev-3",
      title: "代理任务覆盖度对比",
      type: "知识条目",
    },
  ];
}

function buildRelatedTags(projectId: string): ResearchViewModel["relatedTags"] {
  const ids = canonicalDataset.entityTags
    .filter(
      (entityTag) =>
        entityTag.entityType === "project" && entityTag.entityId === projectId,
    )
    .map((entityTag) =>
      canonicalDataset.tags.find((tag) => tag.id === entityTag.tagId)?.name ?? "",
    )
    .filter((name) => name !== "");
  if (ids.length > 0) return Array.from(new Set(ids));
  return ["AI", "浏览器"];
}

// Kept to silence unused-import warnings while preserving the public
// import surface.
export type { ProjectStageName, PlatformId };