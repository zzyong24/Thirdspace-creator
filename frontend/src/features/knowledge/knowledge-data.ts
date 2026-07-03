import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import {
  buildKnowledgeViewModel,
  buildRecentRowsFromItems,
} from "@/fixtures/selectors";
import type {
  KnowledgeViewModel,
  KnowledgeTag as KnowledgeTagVm,
  KnowledgeInsight as KnowledgeInsightVm,
  KnowledgeUnsorted as KnowledgeUnsortedVm,
  KnowledgeSnippet as KnowledgeSnippetVm,
} from "./knowledge-page";
import type { MetricCard as MetricCardVm } from "@/types/view-models";
import {
  buildKnowledgeAtlas,
  type AtlasSourceItem,
  type AtlasTagAssignment,
  type KnowledgeAtlasVm,
} from "./knowledge-atlas-vm";
import {
  buildKnowledgeGraphVm,
  type KnowledgeGraphVm,
} from "./knowledge-graph-vm";

/**
 * Knowledge & Memory READ-side data assembly ("知识库读侧做真").
 *
 * Assembles a REAL `KnowledgeViewModel` for the `/knowledge` route from the
 * real read ops the page has — `knowledge.list`, `knowledge.relations.list`
 * (fanned out per item), and `taxonomy.tags.list` (pglite, user-scoped).
 *
 *   - `metrics`     → 知识条目 (total), 本周新增 (createdAt within 7d), 复用片段
 *                     (knowledgeType==="snippet"), 知识关联 (real edge count,
 *                     aggregated via knowledge.relations.list over every item).
 *                     These four are REAL counts. 记忆命中率 (km-memory) has NO
 *                     read op (no memory analytics) → rendered as a 「规划中」
 *                     placeholder (value "—") instead of a fabricated number.
 *   - `categories`  → REAL tally by `knowledgeType` over the live list.
 *   - `recent`      → REAL rows (via buildRecentRowsFromItems).
 *   - `snippets`    → REAL rows where knowledgeType==="snippet" (the snippet
 *                     LIST, not just the count). Empty → honest empty state.
 *   - `unsorted`    → REAL rows with NO relation edge (neither source nor
 *                     target of any knowledge.relations edge). The resource
 *                     `status` enum is only active/archived (no "draft"), so
 *                     the "未整理" signal is "unlinked", derived from the same
 *                     relations fan-out used for the metric/graph. Empty →
 *                     honest "全部已整理" empty state.
 *   - `graphSeries` → REAL graph: one bucket per knowledgeType node with its
 *                     incident-edge count, derived from the collected edges.
 *   - `popularTags` → REAL tags from `taxonomy.tags.list`, ranked by the
 *                     server-derived `usageCount` (descending). Tag read fails
 *                     or empty → its own empty state, does not block the rest.
 *   - `memoryInsights` → light insights DERIVED from the relations graph (most
 *                     connected items). No edges → fixture fallback (page-specs
 *                     §11 keeps the block non-empty).
 *
 * Honest tri-state (GAP-KM-tristate): the primary `knowledge.list` read drives
 * the page state —
 *   - read SUCCEEDS, rows present → real VM (scenario "default"),
 *   - read SUCCEEDS, no rows      → real EMPTY VM (scenario "default", all
 *                                    collections empty) → the page renders its
 *                                    honest 空态. A fresh empty account reads
 *                                    EMPTY, never user-zyongzhu's seed,
 *   - read FAILS                  → scenario "error" + an `error` payload (NOT
 *                                    the fixture VM). The wholesale "read fail →
 *                                    fixture VM" fallback is removed in this lane.
 * Secondary reads (relations, tags) stay independently guarded but degrade to
 * EMPTY, not to seed fixtures: an empty account's relations/tags blocks read
 * empty. The 记忆命中率 metric still has no op → 「规划中」 placeholder. The
 * contract client is injected (and the route passes a session-scoped client) so
 * reads stay ctx.userId-scoped and the helper stays unit-testable.
 */

// Minimal structural DTO — `knowledge.list` returns KnowledgeItemResource rows;
// we only read the fields we map. NOTE: the contract resource `status` enum is
// `active | archived` (no "draft"); we keep the wider union only to stay
// assignable from the fixture row type. [T-079c] sourceNote/usedCount/
// usedInPublished 是 T-079a 数据层加的契约字段(出处 + 战绩投影),观点地图
// 消费;标 optional 是为了兼容旧 fixture 行(缺省按 null/0/false 兜底)。
interface KnowledgeListDto {
  readonly id: string;
  readonly title: string;
  readonly knowledgeType: string;
  readonly status: "active" | "archived" | "draft";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly sourceNote?: string | null;
  readonly usedCount?: number;
  readonly usedInPublished?: boolean;
}

// `knowledge.relations.list` returns KnowledgeRelationResource rows for ONE
// source item; we read the endpoints + type to build graph edges.
interface KnowledgeRelationDto {
  readonly id: string;
  readonly sourceKnowledgeId: string;
  readonly targetKnowledgeId: string;
  readonly relationType: string;
}

// `taxonomy.tags.list` returns TagResource rows; `usageCount` is the
// server-derived denormalized popularity counter.
interface TagDto {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
  readonly usageCount: number;
}

// `taxonomy.entityTags.listEntitiesForTag` returns EntityTagResource rows —
// the polymorphic tag↔entity join; we only need the knowledge-typed entity ids.
interface EntityTagDto {
  readonly id: string;
  readonly tagId: string;
  readonly entityType: string;
  readonly entityId: string;
}

// A collected graph edge (one per knowledge.relations row).
interface GraphEdge {
  readonly source: string;
  readonly target: string;
  readonly type: string;
}

export interface KnowledgeDataClient {
  listKnowledge(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listKnowledgeRelations(input: {
    params: { knowledgeId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  // taxonomy.tags.list — paginated tag list; ranked client-side by usageCount.
  listTags(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  // taxonomy.entityTags.listEntitiesForTag — KNOW-13:`?tag=` 真过滤用。
  // knowledge.list 的契约 query 只有分页(paginationQuery,无 tag 参数),所以
  // 标签过滤走这条现成契约 op(tagId → 挂该标签的实体行),再在装配层对已读回
  // 的列表求交集(页内过滤,注释见 filterItemsByTag)。
  listEntitiesForTag(input: {
    params: { tagId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  // [T-091] 知识图谱三份真值:全量语义边 + 用料链引用边 + 项目标题。标 optional
  // 是兼容缝(旧测试 fake client 不带这三个读);真实契约 client 三个都有,缺任一
  // → graph 诚实置 null(交互岛不渲图谱 tab)。
  listAllKnowledgeRelations?(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listMaterialLinks?(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listProjects?(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const CATEGORY_TONE: Record<string, KnowledgeViewModel["categories"][number]["tone"]> = {
  reference: "brand",
  note: "neutral",
  snippet: "success",
  transcript: "warning",
  inspiration: "info",
};

// Chinese labels for the knowledgeType enum — mirrors the selector's
// `knowledgeTypeLabel` (kept local so this helper does not depend on a
// non-barrel-exported symbol from the shared fixtures module).
const CATEGORY_LABEL: Record<string, string> = {
  reference: "参考",
  note: "笔记",
  snippet: "片段",
  transcript: "记录",
  inspiration: "灵感",
};

/**
 * Build the REAL Knowledge ViewModel (honest tri-state; no fixture fallback).
 *
 * @param client  the contract client (server-bound). Injected for tests.
 * @param options.tag  KNOW-13:`?tag=` 的标签名(来自路由 searchParams)。给出
 *                     时,`recent` 列表只保留挂该标签的条目(其余块/指标仍按
 *                     全量统计),并在 VM 上回传 `activeTag` 供页面渲染
 *                     「清除筛选」。
 */
export async function buildKnowledgeDashboardViewModel(
  client: KnowledgeDataClient = defaultClient as unknown as KnowledgeDataClient,
  options: { readonly tag?: string | null } = {},
): Promise<KnowledgeViewModel> {
  const activeTag = normalizeTagParam(options.tag);
  // `base` supplies ONLY the VM shell + the five metric-card identities/order
  // (the five-card row is a test invariant). It is NOT used as a content
  // fallback: an empty account must read EMPTY blocks, not seed fixtures.
  const base = buildKnowledgeViewModel();

  let items: ReadonlyArray<KnowledgeListDto>;
  try {
    items = (await client.listKnowledge({
      params: undefined,
      query: { page: 1, pageSize: 200 },
      body: undefined,
    })) as ReadonlyArray<KnowledgeListDto>;
  } catch (err) {
    // Primary list read FAILED → honest ERROR tri-state (scenario "error" +
    // payload). We do NOT fall back to the fixture VM: a failure is not data.
    return {
      ...base,
      scenario: "error",
      error: {
        code: "knowledge_read_failed",
        message: err instanceof Error ? err.message : "知识库读取失败",
      },
      metrics: [],
      categories: [],
      recent: [],
      snippets: [],
      unsorted: [],
      graphSeries: [],
      memoryInsights: [],
      popularTags: [],
      activeTag,
      // 读失败没有地图可组;null 让交互岛不渲观点地图(错误态本来也不渲内容区)。
      atlas: null,
      graph: null,
    };
  }

  // REAL relations: relations are stored per source item, so we fan out
  // `knowledge.relations.list` across every live item and COLLECT the edges
  // (one read serves the 知识关联 metric, the graph, the unsorted "unlinked"
  // signal, and the derived memory insights). A `null` result (empty list, or
  // every per-item read threw) means "no relations signal" → those blocks read
  // EMPTY (honest), never seed fixtures.
  const relations = await collectRelations(client, items);

  // REAL tag rows via taxonomy.tags.list — read once, serve both 热门标签 and
  // the KNOW-13 tag filter (name → tagId resolution). Independently guarded:
  // `null` = read failed (honest EMPTY downstream, not seed fixtures).
  const tags = await fetchTags(client);
  const popularTags = buildPopularTags(tags);

  // KNOW-13:`?tag=` 真消费 —— 列表(recent)只保留挂该标签的条目;其余块与
  // 指标仍按全量统计(过滤的是"看哪些",不是"有多少")。
  const recentItems =
    activeTag === null
      ? items
      : await filterItemsByTag(client, tags, activeTag, items);

  // T-079c 观点地图:tag → 知识挂载走现成契约 op(entityTags fan-out,与
  // KNOW-13 过滤同一读法),分组/排序交给纯函数 buildKnowledgeAtlas。
  const atlas = await assembleAtlas(client, tags, items);

  // [T-091] 知识图谱:三份真值(全量语义边 + materialLinks 引用边 + 项目标题)
  // server 侧一次装配成 GraphVm;任一读失败 → null(诚实降级,交互岛不渲图谱 tab)。
  const graph = await assembleGraph(client, items);

  return {
    ...base,
    scenario: "default",
    error: null,
    metrics: buildMetrics(items, base.metrics, relations?.count ?? null),
    categories: buildCategories(items),
    recent: buildRecentRowsFromItems(recentItems),
    snippets: buildSnippets(items),
    unsorted: buildUnsorted(items, relations?.edges ?? null),
    graphSeries: buildGraphSeries(items, relations?.edges ?? null),
    memoryInsights: buildMemoryInsights(items, relations?.edges ?? null),
    popularTags,
    activeTag,
    atlas,
    graph,
  };
}

// [T-091] materialLinks / projects 的最小结构投影。
interface MaterialLinkDto {
  readonly projectId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly role: string;
  readonly stage: string;
  readonly createdAt: string;
}

interface ProjectDto {
  readonly id: string;
  readonly title: string;
}

interface RelationRowDto {
  readonly sourceKnowledgeId: string;
  readonly targetKnowledgeId: string;
  readonly relationType: string;
  readonly strength: number;
  readonly createdByType: string;
}

/**
 * [T-091] 图谱装配:knowledge.list(节点,已读回)+ relations.listAll(语义边)
 * + materialLinks.list(引用边)+ projects.list(战绩锚标题)→ 纯函数
 * buildKnowledgeGraphVm。语义边/引用边任一读失败 → null(诚实降级,不画残图);
 * projects 读失败只降级标题(以 projectId 兜底显示,不阻断)。
 */
async function assembleGraph(
  client: KnowledgeDataClient,
  items: ReadonlyArray<KnowledgeListDto>,
): Promise<KnowledgeGraphVm | null> {
  if (
    !client.listAllKnowledgeRelations ||
    !client.listMaterialLinks ||
    !client.listProjects
  ) {
    return null;
  }
  let relations: ReadonlyArray<RelationRowDto>;
  let links: ReadonlyArray<MaterialLinkDto>;
  try {
    [relations, links] = (await Promise.all([
      client.listAllKnowledgeRelations({
        params: undefined,
        query: { page: 1, pageSize: 200 },
        body: undefined,
      }),
      client.listMaterialLinks({
        params: undefined,
        query: { page: 1, pageSize: 200 },
        body: undefined,
      }),
    ])) as [ReadonlyArray<RelationRowDto>, ReadonlyArray<MaterialLinkDto>];
  } catch {
    return null;
  }
  let projects: ReadonlyArray<ProjectDto> = [];
  try {
    projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 200 },
      body: undefined,
    })) as ReadonlyArray<ProjectDto>;
  } catch {
    projects = []; // 标题降级为 projectId 兜底(buildKnowledgeGraphVm 内诚实处理)。
  }
  return buildKnowledgeGraphVm(
    items.map((i) => ({
      id: i.id,
      title: i.title,
      knowledgeType: i.knowledgeType,
      status: i.status,
      usedCount: i.usedCount ?? 0,
      usedInPublished: i.usedInPublished ?? false,
    })),
    Array.isArray(relations) ? relations : [],
    Array.isArray(links) ? links : [],
    Array.isArray(projects) ? projects : [],
  );
}

/**
 * T-079c 观点地图装配:
 *   1. tags 按 usageCount desc 排(= AtlasTagAssignment 的分配优先级:多 tag
 *      知识归「最热的那个主题」,见 knowledge-atlas.ts 头注);
 *   2. 每个 tag fan-out 一次 `taxonomy.entityTags.listEntitiesForTag`(现成契约
 *      op,与 KNOW-13 过滤同读法),单 tag 读失败只丢该 tag 的挂载(其挂载知识
 *      落「未归类」),不牵连整墙;
 *   3. 分组/计数/排序全交纯函数 buildKnowledgeAtlas(单测覆盖)。
 * tags 读失败(null)→ 全部知识进「未归类」组(诚实降级:没有主题信号,
 * 不假装分好类)。
 */
async function assembleAtlas(
  client: KnowledgeDataClient,
  tags: ReadonlyArray<TagDto> | null,
  items: ReadonlyArray<KnowledgeListDto>,
): Promise<KnowledgeAtlasVm> {
  const sourceItems: AtlasSourceItem[] = items.map((item) => ({
    id: item.id,
    title: item.title,
    knowledgeType: item.knowledgeType,
    sourceNote: item.sourceNote ?? null,
    usedCount: item.usedCount ?? 0,
    usedInPublished: item.usedInPublished ?? false,
    createdAt: item.createdAt,
  }));

  const rankedTags = (tags ?? [])
    .slice()
    .sort((a, b) => b.usageCount - a.usageCount);

  const assignments = (
    await Promise.all(
      rankedTags.map(async (tag): Promise<AtlasTagAssignment | null> => {
        try {
          const rows = (await client.listEntitiesForTag({
            params: { tagId: tag.id },
            query: { page: 1, pageSize: 200 },
            body: undefined,
          })) as ReadonlyArray<EntityTagDto>;
          return {
            name: tag.name,
            itemIds: rows
              .filter((row) => row.entityType === "knowledge")
              .map((row) => row.entityId),
          };
        } catch {
          // 该 tag 的挂载读失败 → 丢这个主题(其知识落未归类),不阻断整墙。
          return null;
        }
      }),
    )
  ).filter((row): row is AtlasTagAssignment => row !== null);

  return buildKnowledgeAtlas(sourceItems, assignments);
}

// Normalize the raw `?tag=` value: trim; empty/undefined → null (no filter).
function normalizeTagParam(tag: string | null | undefined): string | null {
  const trimmed = (tag ?? "").trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * KNOW-13 页内过滤:knowledge.list 的契约 query 不支持 tag 参数(仅分页),
 * 所以先用已读回的 tags 把标签名解析成 tagId,再走现成契约 op
 * `taxonomy.entityTags.listEntitiesForTag` 拿挂该标签的实体行,最后对已读回的
 * 列表求交集(entityType === "knowledge")。诚实降级:
 *   - tags 读失败(null)或 entityTags 读失败 → `[]`(空态,不假装未过滤,
 *     也不回退 fixture);
 *   - 标签名不存在 → `[]`(真:没有条目挂这个标签)。
 */
async function filterItemsByTag(
  client: KnowledgeDataClient,
  tags: ReadonlyArray<TagDto> | null,
  tagName: string,
  items: ReadonlyArray<KnowledgeListDto>,
): Promise<ReadonlyArray<KnowledgeListDto>> {
  if (tags === null) return [];
  const tag = tags.find((row) => row.name === tagName);
  if (tag === undefined) return [];
  let assignments: ReadonlyArray<EntityTagDto>;
  try {
    assignments = (await client.listEntitiesForTag({
      params: { tagId: tag.id },
      query: { page: 1, pageSize: 200 },
      body: undefined,
    })) as ReadonlyArray<EntityTagDto>;
  } catch {
    return [];
  }
  const taggedIds = new Set(
    assignments
      .filter((row) => row.entityType === "knowledge")
      .map((row) => row.entityId),
  );
  return items.filter((item) => taggedIds.has(item.id));
}

/**
 * Fan out `knowledge.relations.list` across every item and COLLECT both the
 * edge total and the edge list (source/target/type). Each per-item read is
 * independently try/caught so one failure does not zero the whole result.
 *
 * KNOW-08 语义(读成功=真值,读失败=降级,绝不 fixture):
 *   - 空账号(items 为空)→ `{ count: 0, edges: [] }`:没有条目就真的没有
 *     关联,这是"读成功的真 0",指标显 0;
 *   - items 非空但每条 relations 读都失败 → `null`:没有任何真实信号,这是
 *     "读失败",指标降级显「—」(不是 0,更不是 fixture 386)。
 */
async function collectRelations(
  client: KnowledgeDataClient,
  items: ReadonlyArray<KnowledgeListDto>,
): Promise<{ count: number; edges: ReadonlyArray<GraphEdge> } | null> {
  if (items.length === 0) return { count: 0, edges: [] };
  const edges: GraphEdge[] = [];
  let anyOk = false;
  await Promise.all(
    items.map(async (item) => {
      try {
        const rels = (await client.listKnowledgeRelations({
          params: { knowledgeId: item.id },
          query: undefined,
          body: undefined,
        })) as ReadonlyArray<KnowledgeRelationDto>;
        anyOk = true;
        for (const rel of rels) {
          edges.push({
            source: rel.sourceKnowledgeId,
            target: rel.targetKnowledgeId,
            type: rel.relationType,
          });
        }
      } catch {
        // Per-item read failed — skip it, keep aggregating the rest.
      }
    }),
  );
  return anyOk ? { count: edges.length, edges } : null;
}

/**
 * 5 metric cards. Total / this-week / snippets / relations are REAL counts;
 * total/this-week/snippets derive from the live list, 知识关联 from the
 * aggregated relations.list edge count (`relationCount`; `null` ⇒ 读失败 ⇒
 * 「—」错误降级,见 KNOW-08). 记忆命中率 (memory hit rate) has no read op,
 * so its fixture card passes through unchanged. Card identity + order are
 * preserved so the row stays exactly five cards (test invariant).
 */
function buildMetrics(
  items: ReadonlyArray<KnowledgeListDto>,
  fixtureMetrics: ReadonlyArray<MetricCardVm>,
  relationCount: number | null,
): ReadonlyArray<MetricCardVm> {
  const total = items.length;
  const now = Date.now();
  const weekCount = items.filter((item) => {
    const ts = Date.parse(item.createdAt);
    return Number.isFinite(ts) && now - ts <= WEEK_MS;
  }).length;
  const snippetCount = items.filter(
    (item) => item.knowledgeType === "snippet",
  ).length;

  return fixtureMetrics.map((card) => {
    switch (card.id) {
      case "km-total":
        return {
          ...card,
          value: formatCount(total),
          delta: "",
          trend: "flat" as const,
        };
      case "km-week":
        return {
          ...card,
          value: formatCount(weekCount),
          delta: "",
          trend: "flat" as const,
        };
      case "km-snippets":
        return {
          ...card,
          value: formatCount(snippetCount),
          delta: "",
          trend: "flat" as const,
        };
      case "km-relations":
        // KNOW-08:真边数。读成功显真值(空账号=真 0);`null`(relations 读全部
        // 失败,无任何真实信号)→ 错误降级显「—」。任何分支都不回退 fixture 386。
        if (relationCount === null) {
          return {
            ...card,
            value: "—",
            delta: "读取失败",
            trend: "flat" as const,
            tone: "neutral" as const,
          };
        }
        return {
          ...card,
          value: formatCount(relationCount),
          delta: "",
          trend: "flat" as const,
        };
      case "km-memory":
        // 记忆命中率 has NO read op (no memory analytics). We refuse to render
        // the fixture number (78%) as if real — show a 「规划中」 placeholder so
        // the five-card row stays intact without fabricating a metric.
        return {
          ...card,
          value: "—",
          delta: "规划中",
          trend: "flat" as const,
          tone: "neutral" as const,
        };
      default:
        return card;
    }
  });
}

/**
 * REAL category counts: tally the live list by `knowledgeType`. An empty list
 * yields an empty array → the CategoryPanel renders its honest empty state
 * instead of fabricated counts.
 */
function buildCategories(
  items: ReadonlyArray<KnowledgeListDto>,
): ReadonlyArray<KnowledgeViewModel["categories"][number]> {
  if (items.length === 0) return [];
  const tally = new Map<string, number>();
  for (const item of items) {
    tally.set(item.knowledgeType, (tally.get(item.knowledgeType) ?? 0) + 1);
  }
  return Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      id: `cat-${type}`,
      name: CATEGORY_LABEL[type] ?? type,
      count,
      tone: CATEGORY_TONE[type] ?? "neutral",
    }));
}

/**
 * REAL reusable-snippets LIST: the live `knowledge.list` rows whose
 * `knowledgeType` is "snippet" (the metric already counts them; this surfaces
 * the actual rows). Most-recently-updated first, capped at 6 for the rail.
 * Empty → `[]` so ReusableSnippets renders its honest empty state (no fixture).
 */
function buildSnippets(
  items: ReadonlyArray<KnowledgeListDto>,
): ReadonlyArray<KnowledgeSnippetVm> {
  return items
    .filter((item) => item.knowledgeType === "snippet")
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6)
    .map<KnowledgeSnippetVm>((item) => ({
      id: item.id,
      title: item.title,
      // No revision body in the list read — surface the type as the preview
      // line so the row is informative without an extra per-item fetch.
      preview: "可复用片段",
    }));
}

/**
 * REAL 未整理 LIST: items that participate in NO relation edge (neither source
 * nor target of any collected `knowledge.relations` edge) — the honest
 * "unlinked / uncategorized" signal. The contract resource `status` enum is
 * only active/archived (no "draft"), so we derive this from the relations graph
 * rather than a status flag. `edges === null` (no relations signal, e.g. empty
 * account) → `[]` (honest empty, NOT seed); real-but-all-linked → `[]` →
 * "全部已整理" empty state.
 */
function buildUnsorted(
  items: ReadonlyArray<KnowledgeListDto>,
  edges: ReadonlyArray<GraphEdge> | null,
): ReadonlyArray<KnowledgeUnsortedVm> {
  if (edges === null) return [];
  const linked = new Set<string>();
  for (const edge of edges) {
    linked.add(edge.source);
    linked.add(edge.target);
  }
  return items
    .filter((item) => !linked.has(item.id))
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8)
    .map<KnowledgeUnsortedVm>((item) => ({
      id: item.id,
      title: item.title,
      ageLabel: ageLabelFor(item.updatedAt),
    }));
}

/**
 * REAL knowledge graph: one series bucket per `knowledgeType`, valued by the
 * number of relation edges incident to items of that type. `edges === null`
 * (relations 读全部失败,无真实信号) → `[]` (honest empty, NOT seed).
 * Real-but-no-edges → `[]` → the KnowledgeGraph "暂无数据" summary (handled by
 * the page).
 */
function buildGraphSeries(
  items: ReadonlyArray<KnowledgeListDto>,
  edges: ReadonlyArray<GraphEdge> | null,
): ReadonlyArray<{ readonly label: string; readonly value: number }> {
  if (edges === null) return [];
  const typeOf = new Map<string, string>();
  for (const item of items) typeOf.set(item.id, item.knowledgeType);
  const tally = new Map<string, number>();
  const bump = (id: string) => {
    const type = typeOf.get(id);
    if (type === undefined) return;
    tally.set(type, (tally.get(type) ?? 0) + 1);
  };
  for (const edge of edges) {
    bump(edge.source);
    bump(edge.target);
  }
  return Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type, value]) => ({
      label: GRAPH_TYPE_LABEL[type] ?? type,
      value,
    }));
}

/**
 * REAL 记忆洞察 (light): derive a few insights from the relations graph — the
 * most-connected knowledge items ("高关联条目"). `edges === null` or no edges →
 * `[]` (honest empty, NOT seed). The MemoryInsights block stays in the layout
 * (page-specs §11) but renders its own empty state when there are no insights.
 */
function buildMemoryInsights(
  items: ReadonlyArray<KnowledgeListDto>,
  edges: ReadonlyArray<GraphEdge> | null,
): ReadonlyArray<KnowledgeInsightVm> {
  if (edges === null || edges.length === 0) return [];
  const titleOf = new Map<string, string>();
  for (const item of items) titleOf.set(item.id, item.title);
  const degree = new Map<string, number>();
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);
  for (const edge of edges) {
    bump(edge.source);
    bump(edge.target);
  }
  const ranked = Array.from(degree.entries())
    .filter(([id]) => titleOf.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (ranked.length === 0) return [];
  return ranked.map<KnowledgeInsightVm>(([id, count]) => ({
    id: `mi-rel-${id}`,
    title: `高关联条目:${titleOf.get(id) ?? id}`,
    body: `与其它条目存在 ${count} 条关联,可作为该主题的中心节点。`,
  }));
}

/**
 * REAL tag rows via `taxonomy.tags.list`. Independently guarded: `null` means
 * the read FAILED (callers degrade to EMPTY, honest, not seed fixtures); an
 * empty array is a real "no tags yet". Read once, shared by 热门标签 and the
 * KNOW-13 tag filter.
 */
async function fetchTags(
  client: KnowledgeDataClient,
): Promise<ReadonlyArray<TagDto> | null> {
  try {
    return (await client.listTags({
      params: undefined,
      query: { page: 1, pageSize: 200 },
      body: undefined,
    })) as ReadonlyArray<TagDto>;
  } catch {
    return null;
  }
}

/**
 * REAL 热门标签, ranked by the server-derived `usageCount` (descending). Read
 * failure (`null`) or an empty tag set reads EMPTY (`[]`, honest), NOT seed
 * fixtures — the rail block renders its own empty state.
 */
function buildPopularTags(
  tags: ReadonlyArray<TagDto> | null,
): ReadonlyArray<KnowledgeTagVm> {
  if (tags === null || tags.length === 0) return [];
  return tags
    .slice()
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 8)
    .map<KnowledgeTagVm>((tag) => ({
      id: tag.id,
      name: tag.name,
      tone: TAG_COLOR_TONE[tag.color ?? ""] ?? "neutral",
    }));
}

// Chinese labels for the knowledgeType graph buckets (mirrors CATEGORY_LABEL,
// kept separate so graph + category labelling can diverge if needed).
const GRAPH_TYPE_LABEL: Record<string, string> = {
  reference: "参考",
  note: "笔记",
  snippet: "片段",
  transcript: "记录",
  inspiration: "灵感",
};

// Map a tag's `color` hex to a chip tone (mirrors the fixture selector's
// color→tone mapping so real tags render consistently).
const TAG_COLOR_TONE: Record<string, KnowledgeTagVm["tone"]> = {
  "#f59e0b": "warning",
  "#0ea5e9": "info",
  "#22c55e": "success",
  "#a855f7": "brand",
};

// Coarse "N 天前 / N 周前" label from an ISO updatedAt. Deterministic given the
// clock; used only for the 未整理 rail (display-only).
function ageLabelFor(updatedAt: string): string {
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return "";
  const days = Math.max(0, Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000)));
  if (days <= 0) return "今天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  return `${Math.floor(days / 30)} 个月前`;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}
