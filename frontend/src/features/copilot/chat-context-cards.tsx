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

import type {
  ContextCommentsToolResult,
  ContextKnowledgeDetailToolResult,
  ContextKnowledgeToolResult,
  ContextPositioningDetailToolResult,
  ContextProjectDetailToolResult,
  ContextProjectsToolResult,
  DetailTextField,
} from "@/server/ai/chat-tools";

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
                  {a.artifactType}
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
