"use client";

/**
 * 知识图谱视图(T-091 复原 / T-260a·b)—— 知识区的力导向探索主面:
 *
 *   - 渲染 = 仓内已有 ECharts `series-graph` force 布局(零新依赖):节点按
 *     kind+knowledgeType 分 category 着色(观点/证据/金句/观众问题/存档/项目 六色,
 *     图例可点选过滤);节点大小 ∝ usedCount(战绩越多越大,usedInPublished 加描边);
 *     roam 缩放拖拽;relation 实线 / usage 虚线指向 project。
 *   - 点 knowledge 节点 → 复用既有 KnowledgeDetailPreview(经 onSelectKnowledge 回调,
 *     零新组件);点 project 节点 → 跳该项目稿面(/projects/:id);点 relation 边 →
 *     选中该边(下方「已建关联」列表高亮,可删)。
 *   - [T-260a 布局修「空白」根因] 图作**填满探索面**(flex-1 + min-h,占满可用高度),
 *     不再是老那样固定 height:480 塞页面底部。空白源是被同 commit 删的摘要 bar 图
 *     (graphSeries),不复原。
 *   - [T-260a 节点上限] >150 节点按 usedCount+度数采样虚化,只渲前 N,诚实提示
 *     「显示前 N,共 M」(飞轮会长大,老图无 render cap)。
 *   - [T-260a 空态诚实] 关系为 0 时不留空白画布,给「点『AI 找关联』让编导找联系」引导。
 *   - AI 建边(铁律#2/#4,全 AI 建,不给人手连):「AI 找关联」→ POST
 *     /api/knowledge/relate(只产候选)→ 候选边确认门(勾选/改 relationType;已存在
 *     同向同类型边标灰「已存在」)→「采纳选中 N 条」→ 逐条
 *     knowledge.relations.create(createdByType='ai')。
 *   - [T-260b 图面删边] 「已建关联」列表逐条删(knowledge.relations.delete)——图面是
 *     删边唯一入口(详情弹窗的关系管理已撤),采纳错的 AI 候选边可在此删掉。
 *   - 移动端渲 stats 摘要 + 提示到桌面查看,不硬塞 force 图。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import type { EChartsOption } from "echarts";

import { describeUserError } from "@/lib/ai-error-humanize";
import { client } from "@/lib/contract-client";
import { fetchCreatorApi } from "@/lib/http-transport";
import { cn } from "@/lib/utils";
import { EChart, useChartTokens } from "@/components/analytics/echarts-base";
import type { KnowledgeGraphVm, GraphEdgeVm } from "./knowledge-graph-vm";

// ---------------------------------------------------------------------------
// category 词表(六色):四原子 + 存档类(reference/transcript/note/snippet/…)+ project
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = [
  "观点",
  "证据",
  "金句",
  "观众问题",
  "存档",
  "项目",
] as const;

function categoryOf(kind: string, knowledgeType?: string): string {
  if (kind === "project") return "项目";
  switch (knowledgeType) {
    case "claim":
      return "观点";
    case "evidence":
      return "证据";
    case "quote":
      return "金句";
    case "qa":
      return "观众问题";
    default:
      return "存档"; // reference/transcript/note/snippet/inspiration 等出处存档类
  }
}

const RELATION_TYPE_LABEL: Record<string, string> = {
  supports: "支撑",
  contradicts: "矛盾",
  references: "引用",
  extends: "延伸",
};

const RELATION_TYPE_OPTIONS = [
  "supports",
  "contradicts",
  "references",
  "extends",
] as const;

// [T-260a] 渲染侧节点上限:力导向图数百节点会卡,超阈值按 usedCount+度数采样虚化,
// 只渲前 N 并诚实提示「显示前 N,共 M」。老图无 render cap(仅注释「<100 富余」),
// 飞轮长大后必须给死阈值。
const NODE_RENDER_CAP = 150;

// ---------------------------------------------------------------------------
// AI 建边确认门的数据形状(/api/knowledge/relate 返回 + 门内可改态)
// ---------------------------------------------------------------------------

interface RelateCandidateDto {
  sourceId: string;
  targetId: string;
  relationType: string;
  reason: string;
}

interface CandidateRow extends RelateCandidateDto {
  selected: boolean;
  /** 同向同类型边已存在 → 门内标灰不可勾(service 幂等兜底)。 */
  exists: boolean;
  /** 采纳后标记(逐条落库反馈)。 */
  adopted: boolean;
}

// relation 边的稳定 key(source→target::type),用于删边定位与选中高亮。
function relationKey(edge: {
  source: string;
  target: string;
  relationType?: string;
}): string {
  return `${edge.source}→${edge.target}::${edge.relationType ?? ""}`;
}

export function KnowledgeGraphView({
  graph,
  onSelectKnowledge,
}: {
  readonly graph: KnowledgeGraphVm;
  readonly onSelectKnowledge: (id: string) => void;
}) {
  const router = useRouter();
  const tokens = useChartTokens();
  const [busy, setBusy] = React.useState<
    "idle" | "proposing" | "adopting" | "deleting"
  >("idle");
  const [error, setError] = React.useState<string | null>(null);
  // AI 建边确认门:null = 未跑;[] = 跑过但 AI 未发现关联(诚实空)。
  const [candidates, setCandidates] = React.useState<CandidateRow[] | null>(
    null,
  );
  // [T-260b] 图面删边:选中的 relation 边 key(点边高亮/删除定位)+ 删除在途 key。
  const [selectedRelationKey, setSelectedRelationKey] = React.useState<
    string | null
  >(null);
  const [deletingKey, setDeletingKey] = React.useState<string | null>(null);

  const titleById = React.useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n.title])),
    [graph.nodes],
  );

  // 已存在的同向同类型 relation 边(确认门标灰判定 —— 用全量边,不只渲染子集)。
  const existingEdgeKeys = React.useMemo(() => {
    const set = new Set<string>();
    for (const e of graph.edges) {
      if (e.kind !== "relation") continue;
      set.add(`${e.source}→${e.target}::${e.relationType ?? ""}`);
    }
    return set;
  }, [graph.edges]);

  // 图面「已建关联」清单(仅 relation 边,可逐条删)。usage 引用边由 materialLinks
  // 派生,不在此删。
  const relationEdges = React.useMemo(
    () => graph.edges.filter((e) => e.kind === "relation"),
    [graph.edges],
  );

  // [T-260a] 渲染侧采样:节点 ≤ cap 全渲;超阈值按 usedCount+度数打分,取前 cap 个,
  // 边只保留两端都在采样集里的(诚实,不画悬空边)。
  const {
    renderNodes,
    renderEdges,
    capped,
    totalNodes,
  } = React.useMemo(() => {
    const all = graph.nodes;
    if (all.length <= NODE_RENDER_CAP) {
      return {
        renderNodes: all,
        renderEdges: graph.edges,
        capped: false,
        totalNodes: all.length,
      };
    }
    const degree = new Map<string, number>();
    for (const e of graph.edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
    const scored = all
      .map((n) => ({
        node: n,
        score: (n.usedCount ?? 0) + (degree.get(n.id) ?? 0),
      }))
      .sort((a, b) => b.score - a.score);
    const keptIds = new Set(
      scored.slice(0, NODE_RENDER_CAP).map((s) => s.node.id),
    );
    return {
      renderNodes: all.filter((n) => keptIds.has(n.id)),
      renderEdges: graph.edges.filter(
        (e) => keptIds.has(e.source) && keptIds.has(e.target),
      ),
      capped: true,
      totalNodes: all.length,
    };
  }, [graph.nodes, graph.edges]);

  const option = React.useMemo<EChartsOption>(() => {
    const palette = [
      tokens.chart[0]!,
      tokens.chart[2]!,
      tokens.chart[3]!,
      tokens.chart[4]!,
      tokens.mutedForeground,
      tokens.chart[1]!,
    ];
    return {
      tooltip: {
        trigger: "item",
        confine: true,
        formatter: (params: unknown) => {
          const p = params as {
            dataType?: string;
            data?: Record<string, unknown>;
          };
          const d = p.data ?? {};
          if (p.dataType === "edge") {
            const edge = d.meta as GraphEdgeVm | undefined;
            if (!edge) return "";
            if (edge.kind === "relation") {
              const who = edge.createdByType === "ai" ? "AI" : "user";
              const label =
                RELATION_TYPE_LABEL[edge.relationType ?? ""] ??
                edge.relationType ??
                "";
              return `关联:${label}(${edge.relationType ?? ""})<br/>强度 ${edge.strength ?? 1} · 由 ${who} 建立`;
            }
            const when = (edge.createdAt ?? "").slice(0, 10);
            return `被〈${edge.projectTitle ?? ""}〉在 ${edge.stage || "-"} 阶段作 ${edge.role || "-"} 引用${when ? `<br/>${when}` : ""}`;
          }
          const title = typeof d.name === "string" ? d.name : "";
          const used = typeof d.usedCount === "number" ? d.usedCount : null;
          return used !== null && d.kind === "knowledge"
            ? `${title}<br/>被引用 ${used} 次${d.usedInPublished ? " · 有已发布战绩" : ""}`
            : title;
        },
      },
      legend: {
        data: [...CATEGORY_ORDER],
        top: 0,
        textStyle: { color: tokens.mutedForeground, fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
      },
      color: palette,
      series: [
        {
          type: "graph",
          layout: "force",
          roam: true,
          top: 28,
          categories: CATEGORY_ORDER.map((name) => ({ name })),
          label: {
            show: true,
            position: "right",
            fontSize: 10,
            color: tokens.foreground,
            formatter: (p: { name?: string }) =>
              (p.name ?? "").length > 14
                ? `${(p.name ?? "").slice(0, 14)}…`
                : (p.name ?? ""),
          },
          force: { repulsion: 180, edgeLength: [60, 140], gravity: 0.08 },
          emphasis: { focus: "adjacency" },
          lineStyle: { color: tokens.border, curveness: 0.1 },
          data: renderNodes.map((n) => ({
            id: n.id,
            name: n.title,
            category: categoryOf(n.kind, n.knowledgeType),
            kind: n.kind,
            usedCount: n.usedCount ?? 0,
            usedInPublished: n.usedInPublished ?? false,
            symbol: n.kind === "project" ? "rect" : "circle",
            symbolSize:
              n.kind === "project"
                ? 18
                : 12 + Math.min((n.usedCount ?? 0) * 4, 20),
            itemStyle: n.usedInPublished
              ? { borderColor: tokens.brand, borderWidth: 2 }
              : undefined,
          })),
          links: renderEdges.map((e) => ({
            source: e.source,
            target: e.target,
            meta: e,
            lineStyle:
              e.kind === "usage"
                ? { type: "dashed" as const, color: tokens.mutedForeground }
                : { type: "solid" as const, color: tokens.brand, width: 1.5 },
            symbol: e.kind === "usage" ? ["none", "arrow"] : ["none", "none"],
            symbolSize: 6,
          })),
        },
      ],
    };
  }, [renderNodes, renderEdges, tokens]);

  const handleChartClick = React.useCallback(
    (params: unknown) => {
      const p = params as {
        dataType?: string;
        data?: { id?: string; kind?: string; meta?: GraphEdgeVm };
      };
      // 点边:选中该 relation 边(下方清单高亮,可删)。usage 边不可删,忽略。
      if (p.dataType === "edge") {
        const edge = p.data?.meta;
        if (edge && edge.kind === "relation") {
          setSelectedRelationKey(relationKey(edge));
        }
        return;
      }
      if (p.dataType !== "node" || !p.data?.id) return;
      if (p.data.kind === "project") {
        router.push(`/projects/${p.data.id.replace(/^project:/, "")}`);
        return;
      }
      onSelectKnowledge(p.data.id);
    },
    [router, onSelectKnowledge],
  );

  // 「AI 找关联」→ 只产候选(服务端自读原子清单)。
  const handlePropose = React.useCallback(async () => {
    if (busy !== "idle") return;
    setBusy("proposing");
    setError(null);
    try {
      const res = await fetchCreatorApi("/api/knowledge/relate", {
        method: "POST",
      });
      const json = (await res.json().catch(() => null)) as
        | { candidates?: RelateCandidateDto[]; error?: string }
        | null;
      if (!res.ok || !Array.isArray(json?.candidates)) {
        throw new Error(json?.error || `AI 找关联失败(HTTP ${res.status})`);
      }
      setCandidates(
        json.candidates.map((c) => {
          const exists = existingEdgeKeys.has(
            `${c.sourceId}→${c.targetId}::${c.relationType}`,
          );
          return { ...c, selected: !exists, exists, adopted: false };
        }),
      );
    } catch (err) {
      setError(describeUserError(err, "AI 找关联失败，请重试。"));
    } finally {
      setBusy("idle");
    }
  }, [busy, existingEdgeKeys]);

  const patchCandidate = React.useCallback(
    (index: number, patch: Partial<CandidateRow>) => {
      setCandidates((prev) =>
        prev
          ? prev.map((c, i) => (i === index ? { ...c, ...patch } : c))
          : prev,
      );
    },
    [],
  );

  const selectedCount = (candidates ?? []).filter(
    (c) => c.selected && !c.exists && !c.adopted,
  ).length;

  // 确认门「采纳选中 N 条」→ 逐条 relations.create(createdByType='ai')。
  const handleAdopt = React.useCallback(async () => {
    if (!candidates || busy !== "idle") return;
    const picked = candidates.filter(
      (c) => c.selected && !c.exists && !c.adopted,
    );
    if (picked.length === 0) return;
    setBusy("adopting");
    setError(null);
    try {
      for (const c of picked) {
        await client.createKnowledgeRelation({
          params: { knowledgeId: c.sourceId },
          query: undefined,
          body: {
            targetKnowledgeId: c.targetId,
            relationType: c.relationType,
            createdByType: "ai",
          },
        });
      }
      setCandidates(null);
      router.refresh();
    } catch (err) {
      setError(describeUserError(err, "采纳失败，请重试。"));
    } finally {
      setBusy("idle");
    }
  }, [candidates, busy, router]);

  // [T-260b] 图面删边:删一条 relation 边(以服务端读回为准,不做乐观假删)。
  const handleDeleteRelation = React.useCallback(
    async (edge: GraphEdgeVm) => {
      if (busy !== "idle") return;
      const key = relationKey(edge);
      setBusy("deleting");
      setDeletingKey(key);
      setError(null);
      try {
        await client.removeKnowledgeRelation({
          params: { knowledgeId: edge.source },
          query: undefined,
          body: {
            targetKnowledgeId: edge.target,
            relationType: edge.relationType ?? "",
          },
        });
        setSelectedRelationKey((prev) => (prev === key ? null : prev));
        router.refresh();
      } catch (err) {
        setError(describeUserError(err, "删除关联失败，请重试。"));
      } finally {
        setBusy("idle");
        setDeletingKey(null);
      }
    },
    [busy, router],
  );

  const { stats } = graph;
  const isEmpty = stats.knowledgeNodes === 0;
  // [T-260a] 关系 0 → 诚实引导(不留空白画布);关系少但非 0 → 稀疏提示。
  const hasNoRelations = !isEmpty && stats.relationEdges === 0;
  const isSparse =
    !isEmpty &&
    stats.relationEdges > 0 &&
    stats.relationEdges < stats.knowledgeNodes / 2;

  return (
    <section
      data-slot="knowledge-graph-view"
      aria-label="知识图谱"
      className="flex h-full min-h-[520px] flex-col gap-2"
    >
      {/* stats 条:全真值计数(SQL 手查须一致)。 */}
      <div
        data-slot="knowledge-graph-stats"
        className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground"
      >
        <span data-stat="knowledge">{stats.knowledgeNodes} 条知识</span>
        <span aria-hidden="true">·</span>
        <span data-stat="relations">{stats.relationEdges} 条关联</span>
        <span aria-hidden="true">·</span>
        <span data-stat="usages">{stats.usageEdges} 条引用</span>
        <span aria-hidden="true">·</span>
        <span data-stat="isolated">孤立 {stats.isolatedCount} 条</span>
        <span aria-hidden="true">·</span>
        <span data-stat="projects">{stats.projectNodes} 个项目锚</span>
        <button
          type="button"
          data-slot="knowledge-graph-relate"
          disabled={busy !== "idle" || stats.knowledgeNodes < 2}
          onClick={() => void handlePropose()}
          className="ml-auto inline-flex h-7 items-center rounded-md bg-brand px-2.5 text-[12px] font-medium text-brand-foreground hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
        >
          {busy === "proposing" ? "AI 分析中…" : "AI 找关联"}
        </button>
      </div>

      {/* [T-260a] 关系 0 诚实引导:关联是编导干的脑力活(AI 建),不是人手连。 */}
      {hasNoRelations ? (
        <p
          data-slot="knowledge-graph-no-relations"
          className="rounded-md border border-dashed border-border bg-surface-subtle px-2.5 py-1.5 text-[12px] text-muted-foreground"
        >
          还没有关联——点上方「AI 找关联」让编导找找知识之间的联系(关联是 AI 建的活,不用自己手连)。
        </p>
      ) : isSparse ? (
        <p
          data-slot="knowledge-graph-sparse-hint"
          className="rounded-md border border-dashed border-border bg-surface-subtle px-2.5 py-1.5 text-[12px] text-muted-foreground"
        >
          关联还比较少——继续用「AI 找关联」让编导补候选(诚实稀疏,不生成假边填场面)。
        </p>
      ) : null}

      {/* [T-260a] 节点上限:超阈值只渲前 N,诚实提示总量。 */}
      {capped ? (
        <p
          data-slot="knowledge-graph-cap-hint"
          className="rounded-md border border-dashed border-border bg-surface-subtle px-2.5 py-1.5 text-[12px] text-muted-foreground"
        >
          节点较多,按引用次数与关联度采样,显示前 {NODE_RENDER_CAP},共{" "}
          {totalNodes} 个(其余在「AI 找关联」/详情里仍可访问)。
        </p>
      ) : null}

      {error ? (
        <p
          data-slot="knowledge-graph-error"
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-[12px] text-destructive"
        >
          {error}
        </p>
      ) : null}

      {/* AI 建边确认门:候选边列表(source ←type→ target + reason),人采纳才落库。 */}
      {candidates !== null ? (
        <div
          data-slot="knowledge-relate-gate"
          className="flex flex-col gap-2 rounded-md border border-border bg-surface p-2.5"
        >
          {candidates.length === 0 ? (
            <p
              data-slot="knowledge-relate-empty"
              className="text-[12px] text-muted-foreground"
            >
              AI 未发现可提议的关联——原子之间暂无语义上真实相关的组合(诚实空,不硬凑)。
            </p>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">
                AI 提议 {candidates.length} 条候选关联(勾选要采纳的,关联类型可改;采纳后落库为
                AI 建边)
              </p>
              <ul className="flex flex-col gap-1.5">
                {candidates.map((c, index) => (
                  <li
                    key={`${c.sourceId}-${c.targetId}`}
                    data-slot="knowledge-relate-candidate"
                    data-exists={c.exists ? "true" : "false"}
                    className={cn(
                      "flex flex-col gap-1 rounded-md border border-border/70 bg-surface-subtle/40 p-2",
                      c.exists && "opacity-60",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                      <input
                        type="checkbox"
                        data-slot="knowledge-relate-select"
                        aria-label={`采纳第 ${index + 1} 条候选边`}
                        checked={c.selected && !c.exists}
                        disabled={c.exists || c.adopted}
                        onChange={(e) =>
                          patchCandidate(index, { selected: e.target.checked })
                        }
                        className="size-4 accent-brand"
                      />
                      <span className="max-w-40 truncate font-medium text-foreground">
                        {titleById.get(c.sourceId) ?? c.sourceId}
                      </span>
                      <select
                        data-slot="knowledge-relate-type"
                        aria-label="关联类型"
                        value={c.relationType}
                        disabled={c.exists || c.adopted}
                        onChange={(e) =>
                          patchCandidate(index, { relationType: e.target.value })
                        }
                        className="h-7 rounded-md border border-border bg-surface px-1.5 text-[12px]"
                      >
                        {RELATION_TYPE_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {RELATION_TYPE_LABEL[t]}({t})
                          </option>
                        ))}
                      </select>
                      <span className="max-w-40 truncate font-medium text-foreground">
                        {titleById.get(c.targetId) ?? c.targetId}
                      </span>
                      {c.exists ? (
                        <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          已存在
                        </span>
                      ) : null}
                    </div>
                    <p
                      data-slot="knowledge-relate-reason"
                      className="pl-6 text-[11px] leading-snug text-muted-foreground"
                    >
                      {c.reason}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-slot="knowledge-relate-adopt"
                  disabled={busy !== "idle" || selectedCount === 0}
                  onClick={() => void handleAdopt()}
                  className="inline-flex h-7 items-center rounded-md bg-brand px-2.5 text-[12px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                >
                  {busy === "adopting"
                    ? "正在保存…"
                    : `采纳选中 ${selectedCount} 条`}
                </button>
                <button
                  type="button"
                  data-slot="knowledge-relate-cancel"
                  disabled={busy !== "idle"}
                  onClick={() => setCandidates(null)}
                  className="inline-flex h-7 items-center rounded-md border border-border bg-surface px-2.5 text-[12px] text-foreground hover:bg-surface-subtle"
                >
                  关闭
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* 图本体:空库诚实空态;移动端渲摘要提示,不硬塞 force 图。
          [T-260a] 桌面块 flex-1 + min-h 填满探索面,不再固定 height:480 塞底部。 */}
      {isEmpty ? (
        <div
          data-slot="knowledge-graph-empty"
          className="rounded-md border border-dashed border-border bg-surface-subtle px-3 py-6 text-center text-[12px] text-muted-foreground"
        >
          知识库还是空的——先去上方倾倒场倒入内容,图谱才有节点可画。
        </div>
      ) : (
        <>
          <div className="hidden min-h-[480px] flex-1 md:block">
            <EChart
              option={option}
              testId="knowledge-graph-force"
              style={{ height: "100%", minHeight: 480 }}
              onEvents={{ click: handleChartClick }}
            />
          </div>
          <p
            data-slot="knowledge-graph-mobile-hint"
            className="rounded-md border border-border bg-surface-subtle px-2.5 py-2 text-[12px] text-muted-foreground md:hidden"
          >
            力导向图请在桌面端查看;此处为统计摘要:{stats.knowledgeNodes} 条知识、
            {stats.relationEdges} 条关联、{stats.usageEdges} 条引用。
          </p>
        </>
      )}

      {/* [T-260b] 图面删边唯一入口:「已建关联」清单逐条删(采纳错的 AI 候选可撤)。
          usage 引用边由 materialLinks 派生,不在此删。无 relation 边 → 不渲空区。 */}
      {relationEdges.length > 0 ? (
        <div
          data-slot="knowledge-graph-relations"
          className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-2.5"
        >
          <p className="text-[11px] font-medium text-muted-foreground">
            已建关联({relationEdges.length})—— 点边可选中,采纳错的可删
          </p>
          <ul className="flex flex-col gap-1">
            {relationEdges.map((edge) => {
              const key = relationKey(edge);
              const active = key === selectedRelationKey;
              return (
                <li
                  key={key}
                  data-slot="knowledge-graph-relation-row"
                  data-relation-type={edge.relationType ?? ""}
                  data-selected={active ? "true" : "false"}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-foreground",
                    active && "bg-brand-soft",
                  )}
                >
                  <span className="max-w-32 truncate font-medium">
                    {titleById.get(edge.source) ?? edge.source}
                  </span>
                  <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {RELATION_TYPE_LABEL[edge.relationType ?? ""] ??
                      edge.relationType ??
                      ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {titleById.get(edge.target) ?? edge.target}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {edge.createdByType === "ai" ? "AI" : "user"}
                  </span>
                  <button
                    type="button"
                    data-slot="knowledge-graph-edge-delete"
                    disabled={busy !== "idle"}
                    onClick={() => void handleDeleteRelation(edge)}
                    className="shrink-0 text-[11px] text-muted-foreground hover:text-destructive hover:underline disabled:opacity-50"
                  >
                    {deletingKey === key ? "删除中…" : "删除"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
