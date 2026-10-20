"use client";

/**
 * `KnowledgeInteractiveRegion` — Client island for the Knowledge &
 * Memory page (Increment 4 / page-specs §11).
 *
 * The page (`knowledge-page.tsx`) stays a Server Component shell; the
 * interactive content lives here following the existing islands pattern
 * (assets / settings / search).
 *
 * Wired interactions (client / URL state, fixture data, no network):
 *  - KnowledgeToolbar search input: filters the recent-knowledge list
 *    by title / tag (case-insensitive substring). The query is also
 *    mirrored to the URL `?q=` so it is shareable / restorable.
 *  - Filter chips (全部 / 参考 / 笔记 / 片段 / 记录): narrow the list by
 *    knowledge type; "全部" clears the type filter.
 *  - RecentKnowledgeTable rows: selectable (one active row at a time).
 *
 * The KnowledgeToolbar + KnowledgeMetrics row + KnowledgeGrid render
 * here so the page's content order (toolbar → metrics → grid) is
 * unchanged from the previous server-only render. The metrics row is
 * purely presentational but lives in the island so the toolbar can sit
 * above it exactly as before.
 *
 * Determinism: filtering is pure over props; the only side effect is a
 * `router.replace` URL update. No `Date.now` / `Math.random` / `fetch`.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { describeUserError } from "@/lib/ai-error-humanize";
import { fetchCreatorApi } from "@/lib/http-transport";
import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KnowledgeAtlas } from "./knowledge-atlas";
import { KnowledgeDetailPreview } from "./knowledge-detail-preview";
import { KnowledgeGraphView } from "./knowledge-graph-view";
import { KnowledgeTagManager } from "./knowledge-tag-manager";
import { SectionCard } from "@/components/project/section-card";
import { TagChip } from "@/components/content/tag-chip";
import type { MetricCard as MetricCardVm } from "@/types/view-models";
import type {
  KnowledgeCategory,
  KnowledgeInsight,
  KnowledgeRow,
  KnowledgeSnippet,
  KnowledgeTag,
  KnowledgeUnsorted,
  KnowledgeViewModel,
} from "./knowledge-page";

// ---------------------------------------------------------------------------
// Filter chip descriptors (type → label). "all" clears the type filter.
// ---------------------------------------------------------------------------

interface FilterChip {
  readonly id: string;
  readonly label: string;
  readonly tone: "neutral" | "brand" | "success" | "warning" | "info";
}

const FILTER_CHIPS: ReadonlyArray<FilterChip> = [
  { id: "all", label: "全部", tone: "brand" },
  { id: "参考", label: "参考", tone: "neutral" },
  { id: "笔记", label: "笔记", tone: "neutral" },
  { id: "片段", label: "片段", tone: "success" },
  { id: "记录", label: "记录", tone: "warning" },
];

// ---------------------------------------------------------------------------
// [T-093] AI 搜索状态(/api/knowledge/search 的 wire DTO + 面板态)
// ---------------------------------------------------------------------------

interface AiSearchResult {
  readonly knowledgeId: string;
  readonly title: string;
  readonly excerpt: string;
  readonly matchType: "exact" | "semantic";
  readonly score: number | null;
}

interface AiSearchState {
  readonly phase: "loading" | "ready" | "error";
  readonly q: string;
  readonly semanticEnabled: boolean;
  readonly semanticError: string | null;
  readonly results: AiSearchResult[];
  readonly error: string | null;
}

// ---------------------------------------------------------------------------
// URL `?q=` helpers (router-independent so the island works in tests too)
// ---------------------------------------------------------------------------

function readUrlQuery(): string {
  if (typeof window === "undefined") return "";
  try {
    return new URLSearchParams(window.location.search).get("q") ?? "";
  } catch {
    return "";
  }
}

function writeUrlQuery(next: string): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    if (next) params.set("q", next);
    else params.delete("q");
    const qs = params.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(window.history.state, "", url);
  } catch {
    // No-op: URL mirroring is a best-effort enhancement.
  }
}

// ---------------------------------------------------------------------------
// KnowledgeInteractiveRegion
// ---------------------------------------------------------------------------

export function KnowledgeInteractiveRegion({
  viewModel,
  captureTools,
}: {
  readonly viewModel: KnowledgeViewModel;
  readonly captureTools?: React.ReactNode;
}) {
  // Initialise the query from the URL `?q=` when one is present. We read
  // the URL directly (not via `useRouter`/`useSearchParams`) so the
  // island works whether or not an App Router provider is mounted — and
  // we mirror changes back with `history.replaceState`, which is safe in
  // both the browser and jsdom. This keeps the search query shareable /
  // restorable without depending on a router being present.
  const [query, setQuery] = React.useState<string>(() => readUrlQuery());
  const [activeFilter, setActiveFilter] = React.useState<string>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // T-079c 「观点地图|全部」视图切换;默认视图 = 观点地图(T-079c 裁决不动)。回落:
  //   - 旧 fixture VM / 测试 override 不带 atlas → 「全部」(既有结构性契约
  //     测试不受影响;真实装配层 knowledge-data 始终提供 atlas);
  //   - `?tag=` 生效(KNOW-13 标签筛选)→ 「全部」:标签过滤作用在时间流列表
  //     上,用户点 tag chip 进来要看的就是过滤后的列表,不是地图。
  const atlas = viewModel.atlas ?? null;
  // [T-260a 复原] 力导向关系图 = 知识区探索主面。视图优先级:关系图 > 观点地图 > 全部。
  //   - `?tag=` 生效(KNOW-13)→ 「全部」:标签过滤作用在时间流列表,不是图/地图;
  //   - VM 不带 graph/atlas(旧 fixture / 测试 override)→ 该视图不出现,回落既有行为。
  const graph = viewModel.graph ?? null;
  const [view, setView] = React.useState<"graph" | "atlas" | "all">("all");

  // [T-093] AI 搜索(回车触发 hybrid;输入即时过滤手感不动):
  // null = 未搜;phase 区分加载/结果/错误;结果卡点开走 selectedId 详情预览。
  const [aiSearch, setAiSearch] = React.useState<AiSearchState | null>(null);

  const runAiSearch = React.useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setAiSearch({
      phase: "loading",
      q: trimmed,
      semanticEnabled: false,
      semanticError: null,
      results: [],
      error: null,
    });
    try {
      const res = await fetchCreatorApi("/api/knowledge/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: trimmed }),
      });
      const json = (await res.json().catch(() => null)) as
        | {
            semanticEnabled?: boolean;
            semanticError?: string | null;
            results?: AiSearchResult[];
            error?: string;
          }
        | null;
      if (!res.ok || !Array.isArray(json?.results)) {
        throw new Error(json?.error || `搜索失败(HTTP ${res.status})`);
      }
      setAiSearch({
        phase: "ready",
        q: trimmed,
        semanticEnabled: Boolean(json.semanticEnabled),
        semanticError: json.semanticError ?? null,
        results: json.results,
        error: null,
      });
    } catch (err) {
      setAiSearch({
        phase: "error",
        q: trimmed,
        semanticEnabled: false,
        semanticError: null,
        results: [],
        error: describeUserError(err, "搜索失败，请重试。"),
      });
    }
  }, []);

  // F1c write affordance(修订)。The island owns no global store: after a write it
  // asks the App Router to revalidate the server tree so the real `knowledge.list`
  // re-runs and the refreshed rows flow back through the page (island → client.*
  // → pglite → router.refresh()). Determinism: no Date.now/Math.random/fetch here
  // — real ids/clock live in the server/service layer.
  // T-062c:旧「新建知识」独立表单退役 —— 录入统一走页面顶部的 KnowledgeDumpZone
  // (AI 归类确认门 + 手动补录次入口),本岛只保留筛选/选择/预览/修订。
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  // [T-260c] 修订就地编辑(全文预填):点「编辑」→ 抽屉铺出当前正文全文进可编辑框,人
  // 就地改 → 保存 = createKnowledgeRevision 存**新版本**(append-only,旧版留痕,绝不覆盖)。
  //   - revisionContent:编辑框内容(打开时预填 loadedBody);
  //   - editing:是否在编辑态(「编辑」收进次级入口,点开即全文可改);
  //   - loadedBody:详情预览读回的最新正文(prefill 源,经 onContentLoaded 回传)。
  const [revisionContent, setRevisionContent] = React.useState("");
  const [editing, setEditing] = React.useState(false);
  const [loadedBody, setLoadedBody] = React.useState("");

  // [T-247] 归档入口(knowledge.archive,soft-delete):两步确认防误触 ——
  // 第一次点「归档」→ 翻确认态;再点「确认归档」→ 打 op → 关弹窗 + refresh
  // (读侧已滤 archived,列表/地图里该条随即消失)。失败 → 行内错误,不假装已归档。
  const [archiveConfirming, setArchiveConfirming] = React.useState(false);
  const [archiveError, setArchiveError] = React.useState<string | null>(null);
  const handleSelectKnowledge = React.useCallback((id: string | null) => {
    setSelectedId(id);
    setEditing(false);
    setRevisionContent("");
    setLoadedBody("");
    setArchiveConfirming(false);
    setArchiveError(null);
  }, []);
  const handleArchive = React.useCallback(() => {
    if (selectedId === null) return;
    if (!archiveConfirming) {
      setArchiveConfirming(true);
      return;
    }
    startTransition(async () => {
      try {
        await client.archiveKnowledge({
          params: { knowledgeId: selectedId },
          query: undefined,
          body: undefined,
        });
        handleSelectKnowledge(null);
        router.refresh();
      } catch (err) {
        setArchiveError(describeUserError(err, "归档失败，请重试。"));
      }
    });
  }, [selectedId, archiveConfirming, router, handleSelectKnowledge]);

  const handleRevisionSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const content = revisionContent.trim();
      if (content.length === 0 || selectedId === null) return;
      startTransition(async () => {
        await client.createKnowledgeRevision({
          params: { knowledgeId: selectedId },
          query: undefined,
          body: { content },
        });
        // 存成新版本后收起编辑框;router.refresh 让详情预览重读最新版本正文。
        setRevisionContent("");
        setEditing(false);
        router.refresh();
      });
    },
    [revisionContent, selectedId, router],
  );

  const handleSearchChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setQuery(next);
      writeUrlQuery(next);
    },
    [],
  );

  // Filter the recent list by both the type chip and the search query.
  const filteredRecent = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return viewModel.recent.filter((row) => {
      const typeOk = activeFilter === "all" || row.type === activeFilter;
      if (!typeOk) return false;
      if (q.length === 0) return true;
      const haystack = `${row.title} ${row.tags.join(" ")}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [viewModel.recent, activeFilter, query]);

  // [T-118b] 选中行是知识卡还是经验行?经验行只读(展开 experienceDetail,不走
  // KnowledgeDetailPreview 读修订正文,也不显修订表单)。
  const selectedRow = React.useMemo(
    () => viewModel.recent.find((row) => row.id === selectedId) ?? null,
    [viewModel.recent, selectedId],
  );
  const selectedIsExperience = selectedRow?.origin === "experience";

  return (
    <>
      <KnowledgeToolbar
        query={query}
        onQueryChange={handleSearchChange}
        onSubmit={() => void runAiSearch(query)}
        chips={FILTER_CHIPS}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        showChips={view === "all"}
        viewSwitch={graph !== null || atlas !== null ? (
          <KnowledgeViewSwitch view={view} onViewChange={setView}
            hasGraph={graph !== null} hasAtlas={atlas !== null} />
        ) : null}
        captureTools={captureTools}
        metrics={<KnowledgeMetrics metrics={viewModel.metrics} />}
      />
      {aiSearch !== null ? (
        <KnowledgeAiSearchResults
          state={aiSearch}
          onSelect={handleSelectKnowledge}
          onClose={() => setAiSearch(null)}
        />
      ) : null}
      {/* [T-260a 复原] 力导向关系图探索主面:填满可用高度(min-h,不再固定 480 塞底);
          点节点 → 复用下方详情预览;「AI 找关联」建边 + 图面删边都在视图内。 */}
      {view === "graph" && graph !== null ? (
        <div
          data-slot="knowledge-graph-region"
          className="flex min-h-[480px] flex-1 flex-col rounded-panel border border-border bg-surface"
        >
          <KnowledgeGraphView
            graph={graph}
            onSelectKnowledge={handleSelectKnowledge}
          />
        </div>
      ) : null}
      {/* T-079c 观点地图(按 tag 主题聚类分组卡墙;未归类固定底部默认折叠 [gate-F3])。
          选中卡片复用下方 T-062c 详情预览。 */}
      {view === "atlas" && atlas !== null ? (
        <KnowledgeAtlas
          atlas={atlas}
          selectedId={selectedId}
          onSelectCard={handleSelectKnowledge}
        />
      ) : null}
      {/* KNOW-13:`?tag=` 生效时(recent 已在服务端装配层按标签过滤)显示当前
          筛选 + 「清除筛选」返回全量列表(去掉 URL 参数即可)。 */}
      {view === "all" && viewModel.activeTag ? (
        <div
          data-slot="knowledge-tag-filter"
          className="flex items-center gap-2 rounded-md border border-border bg-surface-subtle px-2.5 py-1.5 text-[12px] text-muted-foreground"
        >
          <span>
            标签筛选:
            <span className="font-medium text-foreground">
              {viewModel.activeTag}
            </span>
          </span>
          <Link
            href={query ? `/knowledge?view=advanced&q=${encodeURIComponent(query)}` : "/knowledge?view=advanced"}
            data-slot="knowledge-tag-filter-clear"
            className="text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            清除筛选
          </Link>
        </div>
      ) : null}
      {view === "all" ? (
        <KnowledgeGrid
          categories={viewModel.categories}
          recent={filteredRecent}
          popularTags={viewModel.popularTags}
          memoryInsights={viewModel.memoryInsights}
          unsorted={viewModel.unsorted}
          snippets={viewModel.snippets}
          selectedId={selectedId}
          onSelectRow={handleSelectKnowledge}
          page={viewModel.recentPage ?? 1}
          totalPages={viewModel.recentTotalPages ?? 1}
          total={viewModel.recentTotal ?? filteredRecent.length}
          activeTag={viewModel.activeTag ?? null}
          query={query}
        />
      ) : null}

      {/* F1c — inline 添加笔记/修订 affordance, revealed when a recent row is
          selected. Submit calls knowledge.revisions.create (POST
          /knowledge/:id/revisions), closing the §4 Gap for revisions.
          F1d — intentionally inert (decorative) per roadmap §4: Category rows
          (filter by category, no handler), Popular tags / row tags (inert
          TagChip), Memory insights (adopt AI insight — belongs to AI module),
          Unsorted items (open/categorize — would map to POST
          /knowledge/:id/relations, deferred), Reusable snippets (insert into
          script — belongs to Artifacts), Metrics ×5 / graph chart (display
          only). These render with NO click handlers on purpose. */}
      {/* T-192 知识详情弹窗:选中知识项(recent 行 / 观点地图卡 / 图谱节点 / AI 搜索
          结果)→ 用 ui/dialog 就地弹窗展开,不跳任何知识详情路由(项目无 /knowledge/:id
          路由,跳则触发 404「内容已不存在」)。知识卡走 KnowledgeDetailPreview 读元数据 +
          最新修订正文(诚实三态 loading/error/empty);经验行只读详情(insight + 来源,无
          裁决/修订)。知识卡额外带修订表单(knowledge.revisions.create)。关闭 → 清空
          选中态与草稿。 */}
      <Dialog
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) {
            // [T-260c/T-247] 关弹窗统一清选中、草稿、编辑和归档反馈。
            handleSelectKnowledge(null);
          }
        }}
      >
        <DialogContent
          data-slot="knowledge-detail-dialog"
          className="max-h-[85vh] overflow-y-auto sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle data-slot="knowledge-detail-dialog-title">
              {selectedRow?.title ?? "知识详情"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {selectedIsExperience
                ? "已验证经验条目的只读详情"
                : "知识条目的正文与来源预览"}
            </DialogDescription>
          </DialogHeader>
          {/* [T-118b] 经验行只读详情:insight 全文 + 来源标注,绝无采纳/翻案/修订。 */}
          {selectedIsExperience && selectedRow ? (
            <ExperienceDetailPreview row={selectedRow} />
          ) : selectedId !== null ? (
            <>
              {/* T-062c:知识卡内容预览 —— 读元数据 + 最新修订正文,markdown 渲染;
                  source=web 型显来源链接(诚实三态)。onContentLoaded 把最新正文回传,
                  供 [T-260c] 编辑时全文预填。 */}
              <KnowledgeDetailPreview
                knowledgeId={selectedId}
                onContentLoaded={setLoadedBody}
              />
              {/* [T-260c] 修订就地编辑:主区默认只「预览 + 归档」;「编辑」收进次级入口,
                  点开即铺出当前正文全文进可编辑框(script-rich-editor 同款体验),就地改 →
                  保存为**新版本**(append-only,旧版留痕,绝不覆盖)。不再是吓人的空框。 */}
              {editing ? (
                <form
                  data-slot="knowledge-add-revision"
                  onSubmit={handleRevisionSubmit}
                  className="flex flex-col gap-2 rounded-md border border-border bg-surface-subtle p-2.5"
                >
                  <div className="flex items-center justify-between">
                    <label
                      className="text-[11px] font-medium text-muted-foreground"
                      htmlFor="knowledge-revision-content"
                    >
                      编辑正文(保存为新版本,旧版本保留可追溯)
                    </label>
                  </div>
                  <textarea
                    id="knowledge-revision-content"
                    data-slot="knowledge-revision-content"
                    placeholder="就地修改这条知识的正文…"
                    value={revisionContent}
                    onChange={(event) => setRevisionContent(event.target.value)}
                    rows={12}
                    className="min-h-[220px] rounded-md border border-border bg-surface px-3 py-2 text-[13px] leading-relaxed text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      data-slot="knowledge-revision-submit"
                      disabled={pending || revisionContent.trim().length === 0}
                      className="inline-flex h-8 w-fit items-center rounded-md bg-brand px-3 text-[13px] font-medium text-brand-foreground hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
                    >
                      {pending ? "保存中…" : "保存为新版本"}
                    </button>
                    <button
                      type="button"
                      data-slot="knowledge-revision-cancel"
                      disabled={pending}
                      onClick={() => {
                        setEditing(false);
                        setRevisionContent("");
                      }}
                      className="text-[12px] text-muted-foreground hover:underline disabled:opacity-50"
                    >
                      取消
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  data-slot="knowledge-edit-entry"
                  className="flex items-center"
                >
                  <button
                    type="button"
                    data-slot="knowledge-edit-toggle"
                    onClick={() => {
                      // 点开即预填当前正文全文 → 就地改(不是空框)。
                      setRevisionContent(loadedBody);
                      setEditing(true);
                    }}
                    className="inline-flex h-8 w-fit items-center rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-muted-foreground hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    编辑正文
                  </button>
                </div>
              )}
              {/* [T-247] 归档入口(soft-delete):两步确认防误触;归档后条目从
                  列表/地图消失(读侧滤 archived),恒可在库里追溯(status='archived')。 */}
              <div
                data-slot="knowledge-archive-entry"
                className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2.5"
              >
                <button
                  type="button"
                  data-slot="knowledge-archive-button"
                  data-confirming={archiveConfirming ? "true" : "false"}
                  disabled={pending}
                  onClick={handleArchive}
                  className={cn(
                    "inline-flex h-8 items-center rounded-md border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50",
                    archiveConfirming
                      ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
                      : "border-border bg-surface text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
                  )}
                >
                  {archiveConfirming ? "确认归档(不可撤销)" : "归档"}
                </button>
                {archiveConfirming ? (
                  <button
                    type="button"
                    data-slot="knowledge-archive-cancel"
                    disabled={pending}
                    onClick={() => {
                      setArchiveConfirming(false);
                      setArchiveError(null);
                    }}
                    className="text-[12px] text-muted-foreground hover:underline"
                  >
                    取消
                  </button>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    归档后从列表消失,条目保留可追溯。
                  </span>
                )}
                {archiveError ? (
                  <span
                    data-slot="knowledge-archive-error"
                    role="alert"
                    className="text-[12px] text-destructive"
                  >
                    {archiveError}
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// ExperienceDetailPreview — [T-118b] 经验行只读详情
//   点开一条 validated 经验条目:显 insight 全文 + 来源标注(来自复盘 / 手录)。
//   **只读**:绝无采纳/翻案/修订按钮(裁决是复盘的活)。数据已在 VM 行里
//   (experienceDetail),无需额外读 —— 与知识卡走 knowledge.get 读修订不同。
// ---------------------------------------------------------------------------

function ExperienceDetailPreview({ row }: { readonly row: KnowledgeRow }) {
  const detail = row.experienceDetail;
  return (
    <section
      data-slot="experience-detail-preview"
      data-learning-id={row.id}
      aria-label="经验详情(只读)"
      className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3"
    >
      <div className="flex items-center gap-2">
        <span
          data-slot="experience-detail-chip"
          className="inline-flex rounded-full bg-info/10 px-1.5 py-0.5 text-[11px] font-medium text-info"
        >
          经验
        </span>
        <h3 className="min-w-0 text-sm font-medium text-foreground">
          {row.title}
        </h3>
      </div>
      {detail && detail.insight.trim() !== "" ? (
        <p
          data-slot="experience-detail-insight"
          className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground"
        >
          {detail.insight}
        </p>
      ) : (
        <p
          data-slot="experience-detail-empty"
          className="text-[12px] text-muted-foreground"
        >
          这条经验暂无洞察正文。
        </p>
      )}
      <div
        data-slot="experience-detail-source"
        className="text-[11px] text-muted-foreground"
      >
        来源:{detail?.reviewId ? "来自复盘诊断" : "手录 / 对话录入"}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// KnowledgeViewSwitch — 「观点地图|全部」视图切换(T-079c,SPEC §3)
// ---------------------------------------------------------------------------

function KnowledgeViewSwitch({
  view,
  onViewChange,
  hasGraph,
  hasAtlas,
}: {
  readonly view: "graph" | "atlas" | "all";
  readonly onViewChange: (view: "graph" | "atlas" | "all") => void;
  readonly hasGraph: boolean;
  readonly hasAtlas: boolean;
}) {
  // [T-260a] 关系图排首(探索主面);地图/关系图各自在 VM 提供时才出现,「全部」恒在。
  const options = [
    ...(hasGraph ? [{ id: "graph" as const, label: "关系图" }] : []),
    ...(hasAtlas ? [{ id: "atlas" as const, label: "观点地图" }] : []),
    { id: "all" as const, label: "资料列表" },
  ];
  return (
    <div
      data-slot="knowledge-view-switch"
      role="tablist"
      aria-label="知识库视图切换"
      className="flex w-fit items-center gap-0.5 rounded-md border border-border bg-surface-subtle p-0.5"
    >
      {options.map((option) => {
        const active = option.id === view;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-slot="knowledge-view-switch-option"
            data-view-id={option.id}
            data-active={active ? "true" : "false"}
            onClick={() => onViewChange(option.id)}
            className={
              "rounded px-2.5 py-1 text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 " +
              (active
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KnowledgeToolbar — search + filter chips (controlled)
// ---------------------------------------------------------------------------

function KnowledgeToolbar({
  query,
  onQueryChange,
  onSubmit,
  chips,
  activeFilter,
  onFilterChange,
  showChips,
  viewSwitch,
  captureTools,
  metrics,
}: {
  readonly viewSwitch?: React.ReactNode;
  readonly captureTools?: React.ReactNode;
  readonly metrics?: React.ReactNode;
  readonly query: string;
  readonly onQueryChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** [T-093] 回车 = 服务端 hybrid AI 搜索(输入即时过滤手感不动)。 */
  readonly onSubmit: () => void;
  readonly chips: ReadonlyArray<FilterChip>;
  readonly activeFilter: string;
  readonly onFilterChange: (id: string) => void;
  readonly showChips: boolean;
}) {
  return (
    <div
      data-slot="knowledge-toolbar"
      aria-label="知识库工具栏"
      className="flex shrink-0 flex-col gap-3"
    >
      <div className="flex flex-wrap items-center gap-3">
      {viewSwitch}
      <label className="sr-only" htmlFor="knowledge-search">
        搜索知识
      </label>
      <input
        id="knowledge-search"
        type="search"
        placeholder="搜索资料与经验，回车用 AI 检索"
        data-slot="knowledge-search-input"
        value={query}
        onChange={onQueryChange}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
        }}
        className="h-9 min-w-48 flex-1 rounded-control border border-border bg-surface px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      {captureTools}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
      <div
        data-slot="knowledge-filter-chips"
        className="flex flex-wrap items-center gap-0.5"
        hidden={!showChips}
      >
        {chips.map((chip) => {
          const active = chip.id === activeFilter;
          return (
            <button
              key={chip.id}
              type="button"
              data-slot="knowledge-filter-chip"
              data-filter-id={chip.id}
              data-pressed={active ? "true" : "false"}
              aria-pressed={active}
              onClick={() => onFilterChange(chip.id)}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <TagChip
                label={chip.label}
                tone={active ? "brand" : chip.tone}
                size="sm"
              />
            </button>
          );
        })}
      </div>
      {metrics}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KnowledgeAiSearchResults — [T-093] hybrid 搜索结果面板
//   结果卡:type 来源标注(精确/语义)+ title + 摘要;点卡进详情预览。
//   诚实降级:semanticEnabled=false → 「AI 语义搜索未启用」提示条;
//   零命中 → 「没有匹配的知识原子」,不凑数。
// ---------------------------------------------------------------------------

function KnowledgeAiSearchResults({
  state,
  onSelect,
  onClose,
}: {
  readonly state: AiSearchState;
  readonly onSelect: (knowledgeId: string) => void;
  readonly onClose: () => void;
}) {
  return (
    <section
      data-slot="knowledge-ai-search-results"
      data-phase={state.phase}
      aria-label="AI 搜索结果"
      className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-2.5"
    >
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-medium text-muted-foreground">
          搜索「{state.q}」
          {state.phase === "ready" ? ` · ${state.results.length} 条结果` : ""}
        </p>
        <button
          type="button"
          data-slot="knowledge-ai-search-close"
          onClick={onClose}
          className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
        >
          关闭
        </button>
      </div>
      {state.phase === "ready" && !state.semanticEnabled ? (
        <p
          data-slot="knowledge-ai-search-degraded"
          className="rounded-md border border-warning/40 bg-warning/5 px-2 py-1 text-[11px] text-muted-foreground"
        >
          当前使用关键词搜索，语义召回暂未启用。
          {state.semanticError ? `(原因:${state.semanticError})` : ""}
        </p>
      ) : null}
      {state.phase === "loading" ? (
        <p className="text-[12px] text-muted-foreground">正在搜索…</p>
      ) : state.phase === "error" ? (
        <p
          data-slot="knowledge-ai-search-error"
          role="alert"
          className="text-[12px] text-destructive"
        >
          {state.error}
        </p>
      ) : state.results.length === 0 ? (
        <p
          data-slot="knowledge-ai-search-empty"
          className="text-[12px] text-muted-foreground"
        >
          没有匹配的知识原子。
        </p>
      ) : (
        <ul className="flex flex-col gap-1" aria-label="搜索结果列表">
          {state.results.map((r) => (
            <li key={r.knowledgeId}>
              <button
                type="button"
                data-slot="knowledge-ai-search-result"
                data-knowledge-id={r.knowledgeId}
                data-match-type={r.matchType}
                onClick={() => onSelect(r.knowledgeId)}
                className="flex w-full flex-col items-start gap-0.5 rounded-md border border-border/70 bg-surface-subtle/40 px-2.5 py-1.5 text-left hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={
                      r.matchType === "semantic"
                        ? "rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] text-brand"
                        : "rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    }
                  >
                    {r.matchType === "semantic" ? "语义" : "精确"}
                  </span>
                  <span className="text-[13px] font-medium text-foreground">
                    {r.title}
                  </span>
                </span>
                {r.excerpt ? (
                  <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                    {r.excerpt}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// KnowledgeMetrics — 5 cards in a single row (presentational)
// ---------------------------------------------------------------------------

function KnowledgeMetrics({ metrics }: { metrics: ReadonlyArray<MetricCardVm> }) {
  return (
    <section data-slot="knowledge-metrics" aria-label="知识统计" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
      {metrics.map((metric) => <span key={metric.id} data-slot="knowledge-count">
        {metric.label} <strong className="ml-1 font-semibold tabular-nums text-foreground">{metric.value}</strong>
      </span>)}
    </section>
  );
}

// ---------------------------------------------------------------------------
// KnowledgeGrid — Category / Recent / InsightRail in three columns
// ---------------------------------------------------------------------------

function KnowledgeGrid({
  categories,
  recent,
  popularTags,
  memoryInsights,
  unsorted,
  snippets,
  selectedId,
  onSelectRow,
  page,
  totalPages,
  total,
  activeTag,
  query,
}: {
  readonly categories: ReadonlyArray<KnowledgeCategory>;
  readonly recent: ReadonlyArray<KnowledgeRow>;
  readonly popularTags: ReadonlyArray<KnowledgeTag>;
  readonly memoryInsights: ReadonlyArray<KnowledgeInsight>;
  readonly unsorted: ReadonlyArray<KnowledgeUnsorted>;
  readonly snippets: ReadonlyArray<KnowledgeSnippet>;
  readonly selectedId: string | null;
  readonly onSelectRow: (id: string) => void;
  // [T-119] 「最近更新」混排分页(知识卡 + validated 经验共用同一上下文)。
  readonly page: number;
  readonly totalPages: number;
  readonly total: number;
  // [T-119] `?tag=` 生效时分页需保留标签参数(经 buildPageHref 拼)。
  readonly activeTag: string | null;
  readonly query: string;
}) {
  return (
    <div
      data-slot="knowledge-grid"
      className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-panel border border-border bg-surface lg:grid-cols-[minmax(0,1fr)_280px]"
    >
      <div className="flex min-w-0 flex-col gap-3">
        <RecentKnowledgeTable
          rows={recent}
          selectedId={selectedId}
          onSelectRow={onSelectRow}
        />
        <RecentPagination
          page={page}
          totalPages={totalPages}
          total={total}
          activeTag={activeTag}
          query={query}
        />
      </div>
      <aside className="min-w-0 border-t border-border p-4 lg:border-t-0 lg:border-l" aria-label="知识整理">
        <details className="mb-4 border-b border-border pb-4">
          <summary className="cursor-pointer text-sm font-medium">资料分类</summary>
          <div className="mt-3"><CategoryPanel categories={categories} /></div>
        </details>
        <InsightRail popularTags={popularTags} memoryInsights={memoryInsights} unsorted={unsorted} snippets={snippets} />
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecentPagination — [T-119] 「最近更新」混排分页控件(10 条/页,`?page=` 承载)
//   服务端分页:上/下一页链到 `?page=`(带 URL 请求让读侧切页),最新在前。
//   单页(totalPages<=1)不渲(诚实:没有可翻的页不摆控件)。
// ---------------------------------------------------------------------------

function buildPageHref(page: number, activeTag: string | null, query: string): string {
  const params = new URLSearchParams({ view: "advanced" });
  if (query) params.set("q", query);
  if (activeTag) params.set("tag", activeTag);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/knowledge?${qs}` : "/knowledge";
}

function RecentPagination({
  page,
  totalPages,
  total,
  activeTag,
  query,
}: {
  readonly page: number;
  readonly totalPages: number;
  readonly total: number;
  readonly activeTag: string | null;
  readonly query: string;
}) {
  if (totalPages <= 1) return null;
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  return (
    <nav
      data-slot="recent-pagination"
      aria-label="最近更新分页"
      className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground"
    >
      <span data-slot="recent-pagination-status" className="tabular-nums">
        第 {page} / {totalPages} 页 · 共 {total} 条
      </span>
      <div className="flex items-center gap-1.5">
        {hasPrev ? (
          <Link
            data-slot="recent-pagination-prev"
            href={buildPageHref(page - 1, activeTag, query)}
            className="rounded-md border border-border bg-surface px-2 py-1 text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            上一页
          </Link>
        ) : (
          <span
            data-slot="recent-pagination-prev"
            data-disabled="true"
            aria-disabled="true"
            className="rounded-md border border-border/50 px-2 py-1 text-muted-foreground/50"
          >
            上一页
          </span>
        )}
        {hasNext ? (
          <Link
            data-slot="recent-pagination-next"
            href={buildPageHref(page + 1, activeTag, query)}
            className="rounded-md border border-border bg-surface px-2 py-1 text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            下一页
          </Link>
        ) : (
          <span
            data-slot="recent-pagination-next"
            data-disabled="true"
            aria-disabled="true"
            className="rounded-md border border-border/50 px-2 py-1 text-muted-foreground/50"
          >
            下一页
          </span>
        )}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// CategoryPanel — left column
// ---------------------------------------------------------------------------

function CategoryPanel({
  categories,
}: {
  categories: ReadonlyArray<KnowledgeCategory>;
}) {
  return (
    <div data-slot="category-panel">
      <KnowledgeOrganizerSection title="知识分类" description="按类型组织">
        <ul
          data-slot="category-list"
          className="flex flex-col gap-0.5"
          aria-label="知识分类列表"
        >
          {categories.map((category) => (
            <li
              key={category.id}
              data-slot="category-row"
              data-category-id={category.id}
              className="flex items-center justify-between rounded-md px-2 py-1 text-[13px] hover:bg-surface-subtle"
            >
              <span className="flex items-center gap-2 text-foreground">
                <span
                  aria-hidden="true"
                  className={
                    category.tone === "brand"
                      ? "size-1.5 rounded-full bg-brand"
                      : category.tone === "success"
                        ? "size-1.5 rounded-full bg-success"
                        : category.tone === "warning"
                          ? "size-1.5 rounded-full bg-warning"
                          : category.tone === "info"
                            ? "size-1.5 rounded-full bg-info"
                            : "size-1.5 rounded-full bg-border-strong"
                  }
                />
                {category.name}
              </span>
              <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
                {category.count}
              </span>
            </li>
          ))}
        </ul>
      </KnowledgeOrganizerSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecentKnowledgeTable — middle column (selectable rows)
// ---------------------------------------------------------------------------

function RecentKnowledgeTable({
  rows,
  selectedId,
  onSelectRow,
}: {
  rows: ReadonlyArray<KnowledgeRow>;
  selectedId: string | null;
  onSelectRow: (id: string) => void;
}) {
  return (
    <div data-slot="recent-knowledge-table-wrapper" className="min-h-96 flex-1">
      <SectionCard title="资料与已验证经验" className="h-full rounded-none border-0 shadow-none">
        <table
          data-slot="recent-knowledge-table"
          className="w-full table-fixed text-sm"
          aria-label="最近知识条目"
        >
          <thead>
            <tr className="border-b border-border text-[11px] text-muted-foreground">
              <th className="w-[46%] py-3 text-left font-medium">标题</th>
              <th className="py-1.5 text-left font-medium">类型</th>
              <th className="py-1.5 text-left font-medium">标签</th>
              <th className="w-24 py-3 text-right font-medium">时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr data-slot="recent-knowledge-empty">
                <td
                  colSpan={4}
                  className="py-3 text-center text-[12px] text-muted-foreground"
                >
                  没有匹配的知识条目。
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const selected = row.id === selectedId;
                // [T-118b] 经验行(origin="experience")在混排里带高亮「经验」chip 且
                // 标记 data-origin,供只读展开区分（知识行走修订预览,经验行只读详情）。
                const isExperience = row.origin === "experience";
                return (
                  <tr
                    key={row.id}
                    data-slot="recent-knowledge-row"
                    data-knowledge-id={row.id}
                    data-status={row.status}
                    data-origin={row.origin ?? "knowledge"}
                    data-selected={selected ? "true" : "false"}
                    aria-selected={selected}
                    onClick={() => onSelectRow(row.id)}
                    className={
                      "cursor-pointer border-b border-border last:border-b-0 " +
                      (selected ? "bg-brand-soft/40" : "hover:bg-surface-subtle")
                    }
                  >
                    <td className="py-1.5 text-foreground"><button type="button" className="w-full cursor-pointer text-left" onClick={(event)=>{event.stopPropagation();onSelectRow(row.id);}}>{row.title}</button></td>
                    <td className="py-1.5">
                      {isExperience ? (
                        <span
                          data-slot="recent-type-chip"
                          data-type="experience"
                          className="inline-flex rounded-full bg-info/10 px-1.5 py-0.5 text-[11px] font-medium text-info"
                        >
                          经验
                        </span>
                      ) : (
                        <span
                          data-slot="recent-type-chip"
                          data-type="knowledge"
                          className="text-[11px] text-muted-foreground"
                        >
                          {row.type}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5">
                      <div className="flex flex-wrap gap-0.5">
                        {row.tags.length > 0 ? (
                          row.tags.map((tag) => (
                            <TagChip
                              key={`${row.id}-${tag}`}
                              label={tag}
                              tone="neutral"
                              size="sm"
                            />
                          ))
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            —
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-1.5 text-right font-mono text-[11px] text-muted-foreground">
                      {row.updatedAt}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InsightRail — right column with the four locked blocks in spec order
// ---------------------------------------------------------------------------

function InsightRail({
  popularTags,
  memoryInsights,
  unsorted,
  snippets,
}: {
  readonly popularTags: ReadonlyArray<KnowledgeTag>;
  readonly memoryInsights: ReadonlyArray<KnowledgeInsight>;
  readonly unsorted: ReadonlyArray<KnowledgeUnsorted>;
  readonly snippets: ReadonlyArray<KnowledgeSnippet>;
}) {
  return (
    <div
      data-slot="insight-rail"
      aria-label="知识洞察"
      className="flex flex-col gap-card-gap"
    >
      <PopularTags tags={popularTags} />
      <MemoryInsights items={memoryInsights} />
      <details className="border-b border-border pb-4">
        <summary className="cursor-pointer text-sm font-medium">未整理 <span className="ml-1 text-muted-foreground">{unsorted.length}</span></summary>
        <div className="mt-3"><UnsortedItems items={unsorted} /></div>
      </details>
      <ReusableSnippets items={snippets} />
    </div>
  );
}

function PopularTags({ tags }: { tags: ReadonlyArray<KnowledgeTag> }) {
  return (
    // [T-248 批B] action 槽挂「管理标签」小面板入口:全量标签列表 + 重命名
    // (taxonomy.tags.patch)+ 删除确认门(taxonomy.tags.delete)+ 挂载移除
    // (taxonomy.entityTags.remove)。写侧三 op 的首个前端消费者。
    <KnowledgeOrganizerSection
      title="热门标签"
      description="使用频率最高的标签"
      action={<KnowledgeTagManager />}
    >
      <ul
        data-slot="popular-tags"
        className="flex flex-wrap gap-1"
        aria-label="热门标签"
      >
        {tags.length === 0 ? (
          <li
            data-slot="popular-tags-empty"
            className="text-[12px] text-muted-foreground"
          >
            暂无标签
          </li>
        ) : null}
        {tags.map((tag) => (
          // Module 04 §5b: each popular-tag chip now links to the Knowledge list
          // filtered by that tag name (/knowledge?tag=<name>). The `?tag=`
          // consumption (filtering the list) is delivered by the Knowledge
          // module (06); this plan supplies the navigational chip + tag data.
          <li key={tag.id}>
            {/* KNOW-13:`?tag=` 已被读侧真消费(route page → knowledge-data 用
                taxonomy.entityTags 过滤 recent 列表),chip 链回 `?tag=`。 */}
            <Link
              href={`/knowledge?view=advanced&tag=${encodeURIComponent(tag.name)}`}
              className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <TagChip label={tag.name} tone={tag.tone} size="sm" />
            </Link>
          </li>
        ))}
      </ul>
    </KnowledgeOrganizerSection>
  );
}

function MemoryInsights({
  items,
}: {
  items: ReadonlyArray<KnowledgeInsight>;
}) {
  return (
    <KnowledgeOrganizerSection title="记忆洞察" description="系统从知识库中提炼的要点">
      {items.length === 0 ? <p className="text-sm text-muted-foreground">暂无已验证的洞察</p> : null}
      <ul
        data-slot="memory-insights"
        className="flex flex-col gap-1.5"
        aria-label="记忆洞察列表"
      >
        {items.map((item) => (
          <li
            key={item.id}
            data-slot="memory-insight-item"
            data-insight-id={item.id}
            className="rounded-md border border-border bg-surface-subtle px-2.5 py-2 text-[13px]"
          >
            <div className="font-medium text-foreground">{item.title}</div>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {item.body}
            </p>
          </li>
        ))}
      </ul>
    </KnowledgeOrganizerSection>
  );
}

function UnsortedItems({
  items,
}: {
  items: ReadonlyArray<KnowledgeUnsorted>;
}) {
  return (
    <KnowledgeOrganizerSection title="未整理" description="尚未归类的知识条目">
      <ul
        data-slot="unsorted-items"
        className="flex flex-col gap-0.5"
        aria-label="未整理条目"
      >
        {items.length === 0 ? (
          <li
            data-slot="unsorted-empty"
            className="px-2 py-1 text-[12px] text-muted-foreground"
          >
            全部已整理
          </li>
        ) : null}
        {items.map((item) => (
          <li
            key={item.id}
            data-slot="unsorted-item-row"
            data-unsorted-id={item.id}
            className="flex items-center justify-between rounded-md px-2 py-1 text-[13px] hover:bg-surface-subtle"
          >
            <span className="truncate text-foreground">{item.title}</span>
            <span className="ml-2 shrink-0 text-[11px] text-muted-foreground">
              {item.ageLabel}
            </span>
          </li>
        ))}
      </ul>
    </KnowledgeOrganizerSection>
  );
}

function ReusableSnippets({
  items,
}: {
  items: ReadonlyArray<KnowledgeSnippet>;
}) {
  return (
    <KnowledgeOrganizerSection title="可复用片段" description="快速插入到脚本的模板">
      <ul
        data-slot="reusable-snippets"
        className="flex flex-col gap-1.5"
        aria-label="可复用片段列表"
      >
        {items.length === 0 ? (
          <li
            data-slot="reusable-snippets-empty"
            className="text-[12px] text-muted-foreground"
          >
            暂无可复用片段
          </li>
        ) : null}
        {items.map((item) => (
          <li
            key={item.id}
            data-slot="reusable-snippet-row"
            data-snippet-id={item.id}
            className="rounded-md border border-border bg-surface-subtle px-2.5 py-2 text-[13px]"
          >
            <div className="font-medium text-foreground">{item.title}</div>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {item.preview}
            </p>
          </li>
        ))}
      </ul>
    </KnowledgeOrganizerSection>
  );
}

/** 整理侧栏的平面分区，避免卡片再套卡片。 */
function KnowledgeOrganizerSection({ title, action, children }: {
  title: string; description?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return <section className="border-b border-border pb-4 last:border-b-0 last:pb-0">
    <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{title}</h3>{action}</div>
    {children}
  </section>;
}
