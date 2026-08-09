"use client";

/**
 * [T-098] context.* 只读工具的对话内数据渲染卡(SPEC 2026-07-03 context-layer-redesign §2)。
 *
 * 人机同源双消费:工具结果同一份真值 JSON,模型读进上下文归纳,前端在这里直渲成卡 ——
 * 数据到用户的通路从「模型的嘴」改为「卡」,根治长清单转录幻觉(80 条标题被整批重写实锤)。
 *
 * 形态契约(SPEC §2.3 配套):清单卡默认渲前 CONTEXT_CARD_VISIBLE 条 + 「展开全部 N 条」;
 * compact 与全量都渲真值;带 total/hasMore 时如实标注「还有 N 条未拉取」;空结果诚实空态。
 * 范式来源:ChatMaterialListCard(T-055c,全目录唯一双路齐备的活范式)。
 */

import * as React from "react";

import { humanizeArtifactType } from "@/lib/ai-error-humanize";
import type {
  ContextArtifactsToolResult,
  ContextArtifactTextToolResult,
  ContextCandidatesToolResult,
  ContextCommentsToolResult,
  ContextKnowledgeDetailToolResult,
  ContextKnowledgeTextToolResult,
  ContextKnowledgeToolResult,
  ContextLearningsToolResult,
  ContextMetricsToolResult,
  ContextPositioningDetailToolResult,
  ContextPredictionsToolResult,
  ContextProjectDetailToolResult,
  ContextProjectLifecycleToolResult,
  ContextProjectsToolResult,
  ContextPublicationsToolResult,
  ContextReviewReportToolResult,
  DetailTextField,
} from "@creatoros/backend/modules/ai-runtime";

/** 清单卡默认可见条数(SPEC §2.3:前 8 条 + 展开全部)。 */
export const CONTEXT_CARD_VISIBLE = 8;

// ── 共用壳:卡容器 + 「展开全部」折叠 ────────────────────────────────────────────

function CardShell({
  slot,
  heading,
  children,
  footer,
}: {
  slot: string;
  heading: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div
      data-slot={slot}
      className="mt-1 flex w-full max-w-[560px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        {heading}
      </span>
      {children}
      {footer}
    </div>
  );
}

/** 前 N 条 + 「展开全部 X 条」。渲染的是同一份真值数组,展开不二次请求。 */
function useExpandable<T>(items: ReadonlyArray<T>) {
  const [expanded, setExpanded] = React.useState(false);
  const visible = expanded ? items : items.slice(0, CONTEXT_CARD_VISIBLE);
  const hasHidden = items.length > CONTEXT_CARD_VISIBLE && !expanded;
  return { visible, hasHidden, expand: () => setExpanded(true) };
}

function ExpandButton({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-slot="chat-context-expand"
      onClick={onClick}
      className="self-start rounded-control border border-brand/40 px-2 py-0.5 text-[10px] font-medium text-brand hover:bg-brand-soft"
    >
      展开全部 {count} 条
    </button>
  );
}

/** 分页真相脚注:库里共 total 条 / 本卡只有一页 + hasMore 时如实说还有没拉的。 */
function PagingTruth({
  shown,
  total,
  hasMore,
}: {
  shown: number;
  total: number;
  hasMore: boolean;
}) {
  return (
    <p
      data-slot="chat-context-paging"
      className="text-[10px] text-text-subtle"
    >
      本卡 {shown} 条 · 库中共 {total} 条
      {hasMore ? " · 还有未拉取的,可让 AI 继续翻页" : ""}
    </p>
  );
}

function EmptyCard({ slot, text }: { slot: string; text: string }) {
  return (
    <div
      data-slot={slot}
      data-empty="true"
      className="mt-1 rounded-[10px] border border-dashed border-border px-3 py-2 text-[11px] text-text-subtle"
    >
      {text}
    </div>
  );
}

// ── context.projects → 作品清单卡 ──────────────────────────────────────────────

type ProjectItem = ContextProjectsToolResult["items"][number];

export function ChatProjectListCard({
  items,
  total,
  hasMore,
}: {
  items: ReadonlyArray<ProjectItem>;
  total: number;
  hasMore: boolean;
}) {
  const { visible, hasHidden, expand } = useExpandable(items);
  if (items.length === 0) {
    return (
      <EmptyCard slot="chat-project-list-card" text="项目库还是空的 —— 建一个项目或采集作品后这里会有真数据。" />
    );
  }
  return (
    <CardShell
      slot="chat-project-list-card"
      heading={`项目库 · ${total} 条`}
      footer={<PagingTruth shown={items.length} total={total} hasMore={hasMore} />}
    >
      <ol className="flex flex-col gap-0.5">
        {visible.map((p, i) => (
          <li
            key={p.id}
            data-slot="chat-project-item"
            className="flex items-center gap-2 rounded-md px-1.5 py-1"
          >
            <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-text-subtle">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
              {p.title || "（无标题）"}
            </span>
            <span className="shrink-0 rounded-md bg-surface-subtle px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {p.stage}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {p.publishedAt ? `发布于 ${String(p.publishedAt).slice(0, 10)}` : p.status}
            </span>
          </li>
        ))}
      </ol>
      {hasHidden ? <ExpandButton count={items.length} onClick={expand} /> : null}
    </CardShell>
  );
}

// ── [T-691] context.project.lifecycle → 项目全流程索引卡 ──────────────────────

type ProjectLifecycle = NonNullable<
  ContextProjectLifecycleToolResult["lifecycle"]
>;

const LIFECYCLE_SECTION_LABELS: Readonly<Record<string, string>> = {
  brief: "选题卡",
  artifacts: "稿件",
  materials: "创作素材",
  cover: "封面",
  publications: "发布",
  metrics: "数据",
  review: "审核",
  retrospective: "复盘",
};

const LIFECYCLE_STATE_LABELS: Readonly<Record<string, string>> = {
  available: "已有",
  empty: "暂无",
  unavailable: "暂未接入",
  error: "读取失败",
};

export function ChatProjectLifecycleCard({
  lifecycle,
}: {
  lifecycle: ProjectLifecycle | null;
}) {
  if (!lifecycle) {
    return (
      <EmptyCard
        slot="chat-project-lifecycle-card"
        text="没有读到这个项目，可能项目已删除或不属于当前账号。"
      />
    );
  }
  return (
    <CardShell
      slot="chat-project-lifecycle-card"
      heading={`项目全流程 · ${lifecycle.project.title}`}
      footer={
        lifecycle.errors.length > 0 ? (
          <p className="text-[10px] text-warning">
            有 {lifecycle.errors.length} 个分区读取失败；这不代表用户没有内容。追踪号：
            {lifecycle.traceId}
          </p>
        ) : null
      }
    >
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {Object.entries(lifecycle.completeness).map(([section, state]) => (
          <div
            key={section}
            data-state={state}
            className="rounded-md border border-border px-2 py-1.5"
          >
            <p className="text-[10px] text-text-subtle">
              {LIFECYCLE_SECTION_LABELS[section] ?? section}
            </p>
            <p className="text-[11px] font-medium text-foreground">
              {LIFECYCLE_STATE_LABELS[state] ?? state}
            </p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-text-subtle">
        {lifecycle.artifacts.length} 类稿件 · {lifecycle.materials.length} 份素材 · {lifecycle.publications.length} 条发布记录
      </p>
    </CardShell>
  );
}

// ── [T-691] context.review.report → 审核报告真值卡 ───────────────────────────

type ReviewContextReport = NonNullable<ContextReviewReportToolResult["report"]>;

export function ChatReviewContextCard({
  report,
}: {
  report: ReviewContextReport | null;
}) {
  if (!report) {
    return (
      <EmptyCard
        slot="chat-review-context-card"
        text="这个项目还没有审核报告。"
      />
    );
  }
  return (
    <CardShell
      slot="chat-review-context-card"
      heading={`文案审核 · ${report.verdict}`}
      footer={
        <p className="text-[10px] text-text-subtle">
          {report.modelLabel} · {String(report.reviewedAt).slice(0, 16)}
        </p>
      }
    >
      {report.stale ? (
        <p className="rounded-md bg-warning-soft px-2 py-1 text-[10px] text-warning">
          稿件已更新，这份报告只代表旧版本；建议重新审核。
        </p>
      ) : null}
      <p className="whitespace-pre-wrap text-[11px] text-foreground">
        {report.summary}
      </p>
      <ol className="flex flex-col gap-1">
        {report.findings.slice(0, CONTEXT_CARD_VISIBLE).map((finding) => (
          <li key={finding.findingId} className="rounded-md bg-surface-subtle px-2 py-1.5">
            <p className="text-[10px] font-medium text-foreground">
              {finding.level} · {finding.category}
            </p>
            <p className="line-clamp-2 text-[10px] text-muted-foreground">
              {finding.reason}
            </p>
            {finding.suggestion ? (
              <p className="mt-0.5 line-clamp-2 text-[10px] text-brand">
                建议：{finding.suggestion}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </CardShell>
  );
}

// ── context.comments → 评论清单卡 ──────────────────────────────────────────────

type CommentItem = ContextCommentsToolResult["items"][number];

export function ChatCommentListCard({
  items,
  total,
  hasMore,
}: {
  items: ReadonlyArray<CommentItem>;
  total: number;
  hasMore: boolean;
}) {
  const { visible, hasHidden, expand } = useExpandable(items);
  if (items.length === 0) {
    return (
      <EmptyCard slot="chat-comment-list-card" text="还没有观众评论数据 —— 采集一次作品评论后这里会有真数据。" />
    );
  }
  return (
    <CardShell
      slot="chat-comment-list-card"
      heading={`观众评论 · ${total} 条`}
      footer={<PagingTruth shown={items.length} total={total} hasMore={hasMore} />}
    >
      <ol className="flex flex-col gap-1">
        {visible.map((c, i) => (
          <li
            key={`${c.createdAt}-${i}`}
            data-slot="chat-comment-item"
            className="flex flex-col gap-0.5 rounded-md px-1.5 py-1"
          >
            <span className="whitespace-pre-wrap break-words text-[12px] leading-snug text-foreground">
              {c.text}
            </span>
            <span className="text-[10px] text-text-subtle">
              {c.likeCount !== null ? `👍 ${c.likeCount} · ` : ""}
              {c.source} · {String(c.createdAt).slice(0, 10)}
            </span>
          </li>
        ))}
      </ol>
      {hasHidden ? <ExpandButton count={items.length} onClick={expand} /> : null}
    </CardShell>
  );
}

// ── context.knowledge → 知识清单卡 ─────────────────────────────────────────────

type KnowledgeItem = ContextKnowledgeToolResult["items"][number];

export function ChatKnowledgeListCard({
  items,
}: {
  items: ReadonlyArray<KnowledgeItem>;
}) {
  const { visible, hasHidden, expand } = useExpandable(items);
  if (items.length === 0) {
    return (
      <EmptyCard slot="chat-knowledge-list-card" text="知识库没搜到匹配的条目 —— 换个关键词,或先往知识库里存点东西。" />
    );
  }
  return (
    <CardShell
      slot="chat-knowledge-list-card"
      heading={`知识库命中 · ${items.length} 条`}
    >
      <ol className="flex flex-col gap-1">
        {visible.map((k) => (
          <li
            key={k.id}
            data-slot="chat-knowledge-item"
            className="flex flex-col gap-0.5 rounded-md px-1.5 py-1"
          >
            <span className="truncate text-[12px] font-medium text-foreground">
              {k.title}
            </span>
            {k.snippet ? (
              <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                {k.snippet}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      {hasHidden ? <ExpandButton count={items.length} onClick={expand} /> : null}
    </CardShell>
  );
}

// ── [T-099b] 详情档共用件 ──────────────────────────────────────────────────────
// 详情卡全字段直渲(SPEC §2.3);长文本字段(DetailTextField)渲 preview + 「还有 N 字 ·
// 全文用 X 读取」指针提示(§3 详情档预算,详情档永不夹带全文)。

/** 字段行(label 左、value 右;value 空则不渲,不摆假空字段)。 */
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex gap-1.5 text-[11px]" data-slot="chat-detail-row">
      <dt className="shrink-0 text-text-subtle">{label}</dt>
      <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words text-foreground">
        {value}
      </dd>
    </div>
  );
}

/** 长文本字段:preview + 截断时的「还有 N 字 · 全文用 X 读取」诚实指针(不夹带全文)。 */
function DetailLongText({ field }: { field: DetailTextField }) {
  if (!field.preview) return null;
  const truncated = field.fullTextTool !== null;
  return (
    <div className="flex flex-col gap-0.5" data-slot="chat-detail-longtext">
      <p className="whitespace-pre-wrap break-words text-[11px] leading-snug text-foreground">
        {field.preview}
        {truncated ? "…" : ""}
      </p>
      {truncated ? (
        <span className="text-[10px] text-text-subtle">
          共 {field.totalChars} 字 · 全文用 {field.fullTextTool} 读取
        </span>
      ) : null}
    </div>
  );
}

// ── context.project.detail → 项目档案卡 ────────────────────────────────────────
// brief 字段 + 阶段徽标 + 发布状态 + 产物索引列表 + 指标摘要(SPEC §1 行#2「UI 渲染卡」)。

type ProjectDetail = NonNullable<ContextProjectDetailToolResult["project"]>;

export function ChatProjectDetailCard({
  project,
}: {
  project: ProjectDetail | null;
}) {
  if (!project) {
    return (
      <EmptyCard
        slot="chat-project-detail-card"
        text="查不到这个项目 —— 可能 id 不对、已删除或不属于你。"
      />
    );
  }
  const b = project.brief;
  const briefRows: ReadonlyArray<readonly [string, string | undefined]> = [
    ["目标观众", b.targetAudience],
    ["内容目标", b.contentGoal],
    ["内容形式", b.contentFormat],
    ["核心信息", b.coreMessage],
    ["预估时长", b.durationEstimate],
    ["成功标准", b.successCriteria],
    [
      "目标平台",
      b.targetPlatforms && b.targetPlatforms.length > 0
        ? b.targetPlatforms.join("、")
        : undefined,
    ],
  ];
  return (
    <CardShell
      slot="chat-project-detail-card"
      heading={`项目档案 · ${project.title || "（无标题）"}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-surface-subtle px-1.5 py-0.5 text-[10px] text-muted-foreground">
          阶段:{project.stage}
        </span>
        <span
          data-slot="chat-project-detail-publish"
          className="rounded-md bg-surface-subtle px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          {project.publish.published
            ? `已发布${project.publish.platform ? ` · ${project.publish.platform}` : ""}${
                project.publish.publishedAt
                  ? ` · ${project.publish.publishedAt.slice(0, 10)}`
                  : ""
              }`
            : `未发布 · ${project.status}`}
        </span>
      </div>
      {briefRows.some(([, v]) => v) ? (
        <dl className="flex flex-col gap-0.5">
          {briefRows.map(([label, value]) => (
            <DetailRow key={label} label={label} value={value} />
          ))}
        </dl>
      ) : (
        <p className="text-[11px] text-text-subtle">立项 brief 还没填。</p>
      )}
      {project.artifacts.length > 0 ? (
        <div className="flex flex-col gap-0.5" data-slot="chat-project-detail-artifacts">
          <span className="text-[10px] font-medium text-text-subtle">产物索引</span>
          <ul className="flex flex-col gap-0.5">
            {project.artifacts.map((a) => (
              <li
                key={a.artifactType}
                data-slot="chat-project-detail-artifact"
                className="flex items-center gap-2 text-[11px]"
              >
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {humanizeArtifactType(a.artifactType)}
                </span>
                <span className="shrink-0 text-text-subtle">
                  {a.versionCount} 版 · {a.charCount} 字
                  {a.updatedAt ? ` · ${a.updatedAt.slice(0, 10)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[11px] text-text-subtle">还没有产物(脚本/逐字稿等)。</p>
      )}
      {project.metricsSummary ? (
        <p
          data-slot="chat-project-detail-metrics"
          className="text-[11px] text-foreground"
        >
          最新数据:{project.metricsSummary}
        </p>
      ) : null}
    </CardShell>
  );
}

// ── context.positioning.detail → 定位档案卡 ────────────────────────────────────
// 9 facets + downstreamRules + 当前陈述 + 陈述版本数 + 账号画像(SPEC §1 行#5,只读态,
// 对齐 ChatPositioningCard 的 9-facet 信息面,但这是只读档案卡,无采纳按钮 —— 改定位走
// positioning.generate 产提案卡)。

type PositioningDetail = ContextPositioningDetailToolResult["positioning"];

export function ChatPositioningDetailCard({
  positioning,
}: {
  positioning: PositioningDetail;
}) {
  const p = positioning.profile;
  if (!p && !positioning.currentStatement) {
    return (
      <EmptyCard
        slot="chat-positioning-detail-card"
        text="定位母版还没建 —— 去定位中心生成,或让 AI 产一份定位提案。"
      />
    );
  }
  const facetRows: ReadonlyArray<readonly [string, string | undefined]> = p
    ? [
        ["人设", p.persona],
        ["领域", p.field],
        ["人群", p.audience],
        ["差异化", p.differentiation],
        ["内容范围", p.facets.contentScope],
        ["不做什么", p.facets.avoid],
        ["核心痛点", p.facets.corePain],
        ["核心价值", p.facets.coreValue],
        ["表达风格", p.facets.tone],
      ]
    : [];
  const ruleRows: ReadonlyArray<readonly [string, string | undefined]> = p
    ? [
        ["选题约束", p.downstreamRules.topicRule],
        ["写稿约束", p.downstreamRules.scriptRule],
        ["立项约束", p.downstreamRules.projectRule],
        ["禁区", p.downstreamRules.forbidRule],
        ["表达约束", p.downstreamRules.expressionRule],
      ]
    : [];
  return (
    <CardShell slot="chat-positioning-detail-card" heading="定位档案">
      {positioning.currentStatement?.oneLiner ? (
        <p className="text-[13px] font-medium leading-snug text-foreground">
          {positioning.currentStatement.oneLiner}
        </p>
      ) : null}
      {positioning.currentStatement?.keywords?.filter(Boolean).length ? (
        <div className="flex flex-wrap gap-1">
          {positioning.currentStatement.keywords.filter(Boolean).map((kw) => (
            <span
              key={kw}
              className="rounded-full bg-secondary px-1.5 py-0.5 text-[9.5px] text-secondary-foreground"
            >
              {kw}
            </span>
          ))}
        </div>
      ) : null}
      {facetRows.some(([, v]) => v) ? (
        <dl className="flex flex-col gap-0.5">
          {facetRows.map(([label, value]) => (
            <DetailRow key={label} label={label} value={value} />
          ))}
        </dl>
      ) : null}
      {ruleRows.some(([, v]) => v) ? (
        <div className="flex flex-col gap-0.5" data-slot="chat-positioning-detail-rules">
          <span className="text-[10px] font-medium text-text-subtle">下游硬约束</span>
          <dl className="flex flex-col gap-0.5">
            {ruleRows.map(([label, value]) => (
              <DetailRow key={label} label={label} value={value} />
            ))}
          </dl>
        </div>
      ) : null}
      {positioning.accounts.length > 0 ? (
        <div className="flex flex-col gap-0.5" data-slot="chat-positioning-detail-accounts">
          <span className="text-[10px] font-medium text-text-subtle">账号画像</span>
          <ul className="flex flex-col gap-0.5">
            {positioning.accounts.map((a) => (
              <li key={`${a.platform}-${a.accountHandle}`} className="text-[11px] text-foreground">
                {a.platform} · {a.accountHandle} · {a.followerBaseline} 粉
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-[10px] text-text-subtle">
        {positioning.statementCount !== null
          ? `定位陈述共 ${positioning.statementCount} 版`
          : ""}
      </p>
    </CardShell>
  );
}

// ── context.knowledge.detail → 知识原子卡 ──────────────────────────────────────
// type/title/note/tags/战绩/关联(SPEC §1 行#10,对齐 KnowledgeDetailPreview 信息面)。
// note/sourceNote 长文本走详情档预算(≤200 字 preview + 全文指针)。

type KnowledgeDetail = NonNullable<ContextKnowledgeDetailToolResult["item"]>;

export function ChatKnowledgeDetailCard({
  item,
}: {
  item: KnowledgeDetail | null;
}) {
  if (!item) {
    return (
      <EmptyCard
        slot="chat-knowledge-detail-card"
        text="查不到这条知识 —— 可能 id 不对、已归档或不属于你。"
      />
    );
  }
  return (
    <CardShell
      slot="chat-knowledge-detail-card"
      heading={`知识原子 · ${item.knowledgeType}`}
    >
      <p className="text-[13px] font-medium leading-snug text-foreground">
        {item.title || "（无标题）"}
      </p>
      {item.note.preview ? <DetailLongText field={item.note} /> : null}
      {item.sourceNote.preview ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium text-text-subtle">出处</span>
          <DetailLongText field={item.sourceNote} />
        </div>
      ) : null}
      {item.sourceType === "web" && item.sourceUrl ? (
        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="w-fit break-all text-[11px] text-brand underline underline-offset-2"
        >
          来源:{item.sourceUrl}
        </a>
      ) : null}
      {item.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1" data-slot="chat-knowledge-detail-tags">
          {item.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-secondary px-1.5 py-0.5 text-[9.5px] text-secondary-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
      <p
        data-slot="chat-knowledge-detail-stats"
        className="text-[10px] text-text-subtle"
      >
        战绩:被引用 {item.usedCount} 次
        {item.usedInPublished ? " · 用于已发布作品" : ""} · 关联 {item.relations.length} 条
      </p>
    </CardShell>
  );
}

// ── [T-099c] context.artifacts → 产物清单卡 ────────────────────────────────────
// artifactType 列表 + 当前版本号 + 字数 + updatedAt(SPEC §1 行#3「UI 渲染卡」)。
// 点条目提示可用 context.artifact.text 读全文(指针,不二次请求)。

type ArtifactListResult = ContextArtifactsToolResult;

export function ChatArtifactListCard({
  found,
  projectTitle,
  items,
}: {
  found: boolean;
  projectTitle: string;
  items: ArtifactListResult["items"];
}) {
  if (!found) {
    return (
      <EmptyCard
        slot="chat-artifact-list-card"
        text="查不到这个项目的产物 —— 可能 id 不对、已删除或不属于你。"
      />
    );
  }
  if (items.length === 0) {
    return (
      <EmptyCard
        slot="chat-artifact-list-card"
        text="这个项目还没有产物(脚本/逐字稿/结构方案等)—— 先去产出一版。"
      />
    );
  }
  return (
    <CardShell
      slot="chat-artifact-list-card"
      heading={`产物清单 · ${projectTitle || "（无标题）"}`}
      footer={
        <p className="text-[10px] text-text-subtle">
          要读某类产物正文,让 AI 用 context.artifact.text 读全文。
        </p>
      }
    >
      <ul className="flex flex-col gap-0.5">
        {items.map((a) => (
          <li
            key={a.artifactType}
            data-slot="chat-artifact-item"
            className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[11px]"
          >
            <span className="min-w-0 flex-1 truncate text-foreground">
              {humanizeArtifactType(a.artifactType)}
            </span>
            <span className="shrink-0 text-text-subtle">
              {a.currentVersion !== null ? `v${a.currentVersion} · ` : ""}
              {a.totalChars} 字
              {a.updatedAt ? ` · ${a.updatedAt.slice(0, 10)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

// ── [T-099c] context.artifact.text / context.knowledge.text → 全文阅读卡 ────────
// 元数据头(标题/类型/字数/窗口位置)+ 折叠正文可展开 + hasMore 时「还有 N 字,可翻窗(offset=X)」
// 提示(SPEC §1 行#4/#11「UI 渲染卡」)。从 part.output 直渲同一份真值窗口,不二次请求。

export function ChatFullTextCard({
  found,
  heading,
  subheading,
  text,
  offset,
  totalChars,
  hasMore,
  emptyText,
}: {
  found: boolean;
  /** 卡头(如 "产物正文 · output_script" / "知识全文 · 标题")。 */
  heading: string;
  /** 副标题(可选,如 knowledgeType);空则不渲。 */
  subheading?: string;
  text: string;
  offset: number;
  totalChars: number;
  hasMore: boolean;
  /** found=false 或空正文时的诚实空态文案。 */
  emptyText: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  if (!found || (totalChars === 0 && !text)) {
    return <EmptyCard slot="chat-fulltext-card" text={emptyText} />;
  }
  // 窗口末位(offset + 本窗口字数)—— 翻窗提示与「已读到第几字」都用它。
  const windowEnd = offset + text.length;
  // 折叠:正文长(>240 字)时默认折叠首屏;短则直接全渲。
  const COLLAPSE_THRESHOLD = 240;
  const collapsible = text.length > COLLAPSE_THRESHOLD;
  const shownText =
    collapsible && !expanded ? `${text.slice(0, COLLAPSE_THRESHOLD)}…` : text;
  return (
    <CardShell
      slot="chat-fulltext-card"
      heading={heading}
      footer={
        <div className="flex flex-col gap-0.5">
          <p
            data-slot="chat-fulltext-window"
            className="text-[10px] text-text-subtle"
          >
            全文 {totalChars} 字 · 本窗口 {offset}–{windowEnd} 字
          </p>
          {hasMore ? (
            <p
              data-slot="chat-fulltext-more"
              className="text-[10px] text-brand"
            >
              还有 {totalChars - windowEnd} 字未读 · 可让 AI 翻窗(offset={windowEnd})
            </p>
          ) : null}
        </div>
      }
    >
      {subheading ? (
        <span className="text-[11px] text-muted-foreground">{subheading}</span>
      ) : null}
      <p
        data-slot="chat-fulltext-body"
        className="whitespace-pre-wrap break-words text-[12px] leading-snug text-foreground"
      >
        {shownText}
      </p>
      {collapsible ? (
        <button
          type="button"
          data-slot="chat-fulltext-expand"
          onClick={() => setExpanded((v) => !v)}
          className="self-start rounded-control border border-brand/40 px-2 py-0.5 text-[10px] font-medium text-brand hover:bg-brand-soft"
        >
          {expanded ? "收起正文" : "展开本窗口全文"}
        </button>
      ) : null}
    </CardShell>
  );
}

// context.artifact.text 结果 → 全文阅读卡(元数据头 = 产物类型)。
export function ChatArtifactTextCard({
  result,
}: {
  result: Partial<ContextArtifactTextToolResult>;
}) {
  return (
    <ChatFullTextCard
      found={result.found ?? false}
      heading={`产物正文 · ${humanizeArtifactType(result.artifactType)}`}
      text={result.text ?? ""}
      offset={result.offset ?? 0}
      totalChars={result.totalChars ?? 0}
      hasMore={result.hasMore ?? false}
      emptyText="这个项目还没有这类产物的正文 —— 换一类产物,或先去产出一版。"
    />
  );
}

// context.knowledge.text 结果 → 全文阅读卡(元数据头 = 知识标题,副标题 = 类型)。
export function ChatKnowledgeTextCard({
  result,
}: {
  result: Partial<ContextKnowledgeTextToolResult>;
}) {
  return (
    <ChatFullTextCard
      found={result.found ?? false}
      heading={`知识全文 · ${result.title || "（无标题）"}`}
      subheading={result.knowledgeType || undefined}
      text={result.text ?? ""}
      offset={result.offset ?? 0}
      totalChars={result.totalChars ?? 0}
      hasMore={result.hasMore ?? false}
      emptyText="这条知识没有可读的长文正文 —— 它可能只是一句观点/金句,没有 transcript/reference 正文。"
    />
  );
}

// ── [T-099 切片四] context.publications → 发布清单卡 ────────────────────────────
// platform/url/publishedAt/关联作品标题(SPEC §1 行#6「UI 渲染卡」)。清单档:前 8 条 + 展开 +
// total/hasMore 真相脚注。

type PublicationItem = ContextPublicationsToolResult["items"][number];

export function ChatPublicationListCard({
  items,
  total,
  hasMore,
}: {
  items: ReadonlyArray<PublicationItem>;
  total: number;
  hasMore: boolean;
}) {
  const { visible, hasHidden, expand } = useExpandable(items);
  if (items.length === 0) {
    return (
      <EmptyCard
        slot="chat-publication-list-card"
        text="还没有发布记录 —— 发布或采集作品后这里会有真数据。"
      />
    );
  }
  return (
    <CardShell
      slot="chat-publication-list-card"
      heading={`发布记录 · ${total} 条`}
      footer={<PagingTruth shown={items.length} total={total} hasMore={hasMore} />}
    >
      <ol className="flex flex-col gap-0.5">
        {visible.map((p, i) => (
          <li
            key={p.id}
            data-slot="chat-publication-item"
            className="flex items-center gap-2 rounded-md px-1.5 py-1"
          >
            <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-text-subtle">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
              {p.url ? (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand underline underline-offset-2"
                >
                  {p.projectTitle || "（无标题作品）"}
                </a>
              ) : (
                p.projectTitle || "（无标题作品）"
              )}
            </span>
            <span className="shrink-0 rounded-md bg-surface-subtle px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {p.platform}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {p.publishedAt ? String(p.publishedAt).slice(0, 10) : p.status}
            </span>
          </li>
        ))}
      </ol>
      {hasHidden ? <ExpandButton count={items.length} onClick={expand} /> : null}
    </CardShell>
  );
}

// ── [T-099 切片四] context.metrics → 指标表卡 ──────────────────────────────────
// 表格:作品 × (播放/点赞/评论/分享);单作品模式表头带作品名 + 留存点(有则渲,无则不渲,
// 不编)(SPEC §1 行#7「UI 渲染卡」)。空态诚实。

type MetricsRow = ContextMetricsToolResult["rows"][number];

function fmtMetric(v: number | null): string {
  return v === null ? "—" : String(v);
}

export function ChatMetricsCard({
  subject,
  rows,
  retention,
}: {
  subject: string | null;
  rows: ReadonlyArray<MetricsRow>;
  retention: ContextMetricsToolResult["retention"];
}) {
  if (rows.length === 0) {
    return (
      <EmptyCard
        slot="chat-metrics-card"
        text={
          subject
            ? `《${subject}》还没有指标数据 —— 采集一次作品数据后这里会有真数值。`
            : "还没有作品指标数据 —— 采集一次作品数据后这里会有真数值。"
        }
      />
    );
  }
  return (
    <CardShell
      slot="chat-metrics-card"
      heading={subject ? `作品指标 · ${subject}` : `账号指标 · 最近 ${rows.length} 条`}
      footer={
        retention.length > 0 ? (
          <p
            data-slot="chat-metrics-retention"
            className="text-[10px] text-text-subtle"
          >
            留存点:
            {retention
              .slice(0, 6)
              .map((r) => `${r.atSeconds}s→${Math.round(r.retentionRate * 100)}%`)
              .join(" · ")}
          </p>
        ) : undefined
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              {(subject ? [] : ["作品"]).concat(["播放", "点赞", "评论", "分享"]).map((h) => (
                <th
                  key={h}
                  className="border-b border-border px-1.5 py-1 text-left font-medium text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} data-slot="chat-metrics-row">
                {!subject ? (
                  <td className="max-w-[180px] truncate border-b border-border/40 px-1.5 py-1 text-foreground">
                    {r.title || "（无标题）"}
                  </td>
                ) : null}
                <td className="border-b border-border/40 px-1.5 py-1 tabular-nums text-foreground">
                  {fmtMetric(r.plays)}
                </td>
                <td className="border-b border-border/40 px-1.5 py-1 tabular-nums text-foreground">
                  {fmtMetric(r.likes)}
                </td>
                <td className="border-b border-border/40 px-1.5 py-1 tabular-nums text-foreground">
                  {fmtMetric(r.comments)}
                </td>
                <td className="border-b border-border/40 px-1.5 py-1 tabular-nums text-foreground">
                  {fmtMetric(r.shares)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardShell>
  );
}

// ── [T-099 切片五] context.learnings → 经验清单卡 ──────────────────────────────
// title/insight/type/状态(validated/candidate)/复用战绩(SPEC §1 行#13「UI 渲染卡」,复用
// ChatLearningsCard 只读态信息面)。清单档:前 8 条 + 展开 + total 真相。

type LearningItem = ContextLearningsToolResult["items"][number];

const LEARNING_STATUS_LABEL: Record<string, string> = {
  validated: "已验证",
  candidate: "待验证",
  discarded: "已弃",
};

export function ChatLearningsListCard({
  items,
  total,
}: {
  items: ReadonlyArray<LearningItem>;
  total: number;
}) {
  const { visible, hasHidden, expand } = useExpandable(items);
  if (items.length === 0) {
    return (
      <EmptyCard
        slot="chat-learnings-list-card"
        text="经验库还是空的 —— 复盘作品或用「记录经验」沉淀后这里会有真数据。"
      />
    );
  }
  return (
    <CardShell
      slot="chat-learnings-list-card"
      heading={`经验库 · ${total} 条`}
      footer={
        <PagingTruth shown={items.length} total={total} hasMore={items.length < total} />
      }
    >
      <ol className="flex flex-col gap-1">
        {visible.map((l) => (
          <li
            key={l.id}
            data-slot="chat-learning-item"
            className="flex flex-col gap-0.5 rounded-md px-1.5 py-1"
          >
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                {l.title}
              </span>
              <span className="shrink-0 rounded-md bg-surface-subtle px-1.5 py-0.5 text-[9.5px] text-muted-foreground">
                {LEARNING_STATUS_LABEL[l.status] ?? l.status}
              </span>
            </div>
            {l.insight ? (
              <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                {l.insight}
              </span>
            ) : null}
            <span className="text-[10px] text-text-subtle">
              {l.learningType}
              {l.reuseCount > 0 ? ` · 复用 ${l.reuseCount} 次` : ""}
            </span>
          </li>
        ))}
      </ol>
      {hasHidden ? <ExpandButton count={items.length} onClick={expand} /> : null}
    </CardShell>
  );
}

// ── [T-099 切片五] context.candidates → 候选池清单卡 ───────────────────────────
// title/status/预测分/来源(SPEC §1 行#14「UI 渲染卡」)。清单档:前 8 条 + 展开 + total/hasMore。

type CandidateItem = ContextCandidatesToolResult["items"][number];

export function ChatCandidateListCard({
  items,
  total,
  hasMore,
}: {
  items: ReadonlyArray<CandidateItem>;
  total: number;
  hasMore: boolean;
}) {
  const { visible, hasHidden, expand } = useExpandable(items);
  if (items.length === 0) {
    return (
      <EmptyCard
        slot="chat-candidate-list-card"
        text="选题候选池还是空的 —— 用「生成选题」或抓热点后这里会有真数据。"
      />
    );
  }
  return (
    <CardShell
      slot="chat-candidate-list-card"
      heading={`选题候选池 · ${total} 条`}
      footer={<PagingTruth shown={items.length} total={total} hasMore={hasMore} />}
    >
      <ol className="flex flex-col gap-0.5">
        {visible.map((cand, i) => (
          <li
            key={cand.id}
            data-slot="chat-candidate-item"
            className="flex items-center gap-2 rounded-md px-1.5 py-1"
          >
            <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-text-subtle">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
              {cand.title || "（无标题选题）"}
            </span>
            {cand.score !== null ? (
              <span className="shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 text-[10px] text-brand">
                {cand.score} 分
              </span>
            ) : null}
            <span className="shrink-0 rounded-md bg-surface-subtle px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {cand.status}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {cand.source}
            </span>
          </li>
        ))}
      </ol>
      {hasHidden ? <ExpandButton count={items.length} onClick={expand} /> : null}
    </CardShell>
  );
}

// ── [T-099 切片五] context.predictions → 校准对照卡 ────────────────────────────
// 当前 rubric 摘要 + 逐条预测 vs 实绩(逐维度 预测分/实绩分/偏差)(SPEC §1 行#15「UI 渲染卡」)。
// 清单档:前 8 条 + 展开。空态诚实。

type PredictionItem = ContextPredictionsToolResult["items"][number];

const DEVIATION_BAND_LABEL: Record<string, string> = {
  low: "偏差小",
  mid: "偏差中",
  high: "偏差大",
  none: "无回流",
};

export function ChatPredictionsCard({
  rubric,
  items,
  total,
}: {
  rubric: ContextPredictionsToolResult["rubric"];
  items: ReadonlyArray<PredictionItem>;
  total: number;
}) {
  const { visible, hasHidden, expand } = useExpandable(items);
  if (items.length === 0 && !rubric) {
    return (
      <EmptyCard
        slot="chat-predictions-card"
        text="还没有校准数据 —— 发布前写盲预测、发布后录真实表现,这里会显示对照。"
      />
    );
  }
  return (
    <CardShell
      slot="chat-predictions-card"
      heading={`校准对照 · ${total} 条回流`}
      footer={
        rubric ? (
          <p
            data-slot="chat-predictions-rubric"
            className="text-[10px] text-text-subtle"
          >
            当前评分标准:{rubric.name} v{rubric.versionNumber} · {rubric.dimensionCount} 维度
          </p>
        ) : (
          <p className="text-[10px] text-text-subtle">评分标准母版还没建。</p>
        )
      }
    >
      {items.length === 0 ? (
        <p className="text-[11px] text-text-subtle">
          还没有发布后回流的预测对照 —— 发布作品并录入真实表现后这里会有真数据。
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {visible.map((p) => (
            <li
              key={p.predictionId}
              data-slot="chat-prediction-item"
              className="flex flex-col gap-0.5 rounded-md border border-border/60 px-1.5 py-1"
            >
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                  {p.subjectTitle || "（无标题作品）"}
                </span>
                <span className="shrink-0 rounded-md bg-surface-subtle px-1.5 py-0.5 text-[9.5px] text-muted-foreground">
                  {DEVIATION_BAND_LABEL[p.deviationBand] ?? p.deviationBand}
                </span>
              </div>
              {p.dimensions.length > 0 ? (
                <ul className="flex flex-col gap-0.5">
                  {p.dimensions.map((d) => (
                    <li
                      key={d.key}
                      className="flex items-center gap-2 text-[10.5px]"
                    >
                      <span className="min-w-0 flex-1 truncate text-text-subtle">
                        {d.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-foreground">
                        预测 {d.predicted ?? "—"} · 实绩 {d.actual ?? "—"}
                        {d.deviation !== null
                          ? ` · 偏差 ${d.deviation > 0 ? "+" : ""}${d.deviation}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {p.finding ? (
                <span className="text-[10px] text-text-subtle">{p.finding}</span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {hasHidden ? <ExpandButton count={items.length} onClick={expand} /> : null}
    </CardShell>
  );
}

// ── 未知 context.* kind → 通用键值表格兜底卡 ───────────────────────────────────
// SPEC §2.2 运行时兜底:注册漏网时用户看到的也是真数据表格,不是 800 字 JSON trace,
// 更不是模型转述。items 数组 → 自动列表格;其余顶层标量字段 → 键值行。

export function ChatContextGenericCard({
  kind,
  out,
}: {
  kind: string;
  out: Record<string, unknown>;
}) {
  const rawItems = Array.isArray(out.items) ? (out.items as unknown[]) : [];
  const rows = rawItems.filter(
    (r): r is Record<string, unknown> => typeof r === "object" && r !== null,
  );
  const { visible, hasHidden, expand } = useExpandable(rows);
  // 列 = 各行键的并集(截 6 列防爆宽)。
  const columns = React.useMemo(() => {
    const keys: string[] = [];
    for (const r of rows) {
      for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
    }
    return keys.slice(0, 6);
  }, [rows]);
  // 顶层标量字段(kind/items 之外)→ 键值行(如 total/offset/hasMore 的分页真相)。
  const scalars = Object.entries(out).filter(
    ([k, v]) =>
      k !== "kind" && k !== "items" && (typeof v !== "object" || v === null),
  );
  return (
    <CardShell slot="chat-context-generic-card" heading={`数据结果 · ${kind}`}>
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c}
                    className="border-b border-border px-1.5 py-1 text-left font-medium text-muted-foreground"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={i} data-slot="chat-context-generic-row">
                  {columns.map((c) => (
                    <td
                      key={c}
                      className="max-w-[220px] truncate border-b border-border/40 px-1.5 py-1 text-foreground"
                    >
                      {formatCell(r[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[11px] text-text-subtle">（无条目数据）</p>
      )}
      {hasHidden ? <ExpandButton count={rows.length} onClick={expand} /> : null}
      {scalars.length > 0 ? (
        <p className="text-[10px] text-text-subtle">
          {scalars.map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
        </p>
      ) : null}
    </CardShell>
  );
}

/** 单元格取值:标量直显;对象/数组给紧凑 JSON(截 80 字)—— 真值,不编。 */
function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    const s = JSON.stringify(v);
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  }
  return String(v);
}
