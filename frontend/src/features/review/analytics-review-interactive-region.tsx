"use client";

/**
 * `AnalyticsReviewInteractiveRegion` — Client island for the Analytics &
 * Review page (Increment 4 / page-specs §10).
 *
 * The page (`analytics-review-page.tsx`) stays a Server Component shell;
 * the interactive content lives here following the existing islands
 * pattern (assets / settings / search / knowledge / publishing-center).
 *
 * [T-116a] 单一诚实视图(去假维度 tab):此前顶部 6 个「维度 tab」实为时间窗切换
 * (TAB_WINDOW),重派生只对 demo 假项目生效、真项目零反馈,对比/经验沉淀两 tab 无渲染逻辑
 * —— 名不副实的假交互,已整体移除(AnalyticsTabs / activeTab / TAB_WINDOW / scoped 重派生)。
 * 复盘页现为单一滚动视图,只渲真数据区。
 *
 * Wired interactions:
 *  - Chart tab toggle (趋势 / 漏斗): toggles which primary chart is
 *    emphasised; both stay mounted (no chart type change — page-specs
 *    §10 invariant)。这是真的、切不同数据,保留。
 *  - Review-history 行选中(拉 reviews.get 详情)。
 *
 * [T-116b] 移除规划中占位:观众画像 / 观众来源 / 留存曲线三个无数据源 op 的 PlannedRegion
 * 区、关键时刻区(真项目恒空)、3 个纯装饰按钮(查看全部 / 添加发布 / 生成复盘报告)一并删除。
 * 观众细分/留存 待单视频采集 T-100 做了再加回(见各删除处注释)。
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import { describeUserError } from "@/lib/ai-error-humanize";
import { client } from "@/lib/contract-client";
import { ViewsTrendChart } from "@/components/analytics/views-trend-chart";
import { ConversionFunnelChart } from "@/components/analytics/conversion-funnel-chart";
import { InsightCard } from "@/components/analytics/insight-card";
import { MetricCard } from "@/components/project/metric-card";
import { SectionCard } from "@/components/project/section-card";
import { copilotDeepLink } from "@/features/copilot/copilot-deeplink";
// [T-118a §A] 复用经验裁决队列组件(采纳/不采→evaluateLearning、inline 编辑),不另造。
import {
  AdjudicationQueue,
  type AdjudicationQueueProps,
} from "@/features/experience/experience-interactive-region";
import type {
  AnalyticsViewModel,
  MetricCard as MetricCardVm,
  TopPublishedCard,
} from "@/types/view-models";

// ---------------------------------------------------------------------------
// Render-side item types (structurally identical to the matching
// AnalyticsViewModel fields).
// ---------------------------------------------------------------------------

type TopPublished = TopPublishedCard;
type ReviewHistoryItem = AnalyticsViewModel["reviewHistory"][number];
// 复盘每作品评论 (T-030 D6) — 一条真实评论 (文本 + demand_tag 若有)。
type CommentItem = NonNullable<AnalyticsViewModel["comments"]>[number];

// ---------------------------------------------------------------------------
// Reviews wiring (module 13 Step 5). Present only when the server shell resolves
// the real ops surface; absent → the authoring panel + history drill degrade to
// inert local affordances (so the fixture-only render + visual baseline hold).
// Each control maps to exactly one Reviews op; reads (history drill) skip refresh.
// ---------------------------------------------------------------------------

export interface ReviewsWiring {
  readonly projectId: string;
}

// The insight-type select offers the four contract insightType values with the
// roadmap §4 Chinese labels (成功亮点→success / 待优化→issue / 行动项→action / 假设→
// hypothesis).
const INSIGHT_TYPES: ReadonlyArray<{ readonly value: string; readonly label: string }> = [
  { value: "success", label: "成功亮点" },
  { value: "issue", label: "待优化" },
  { value: "action", label: "行动项" },
  { value: "hypothesis", label: "假设" },
];

// The shape returned by reviews.get / reviews.create (reviewResource) + the insight
// (reviewInsightResource) — read structurally by the drill detail panel.
interface ReviewDto {
  readonly id: string;
  readonly status: string;
  readonly reviewType: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly completedAt: string | null;
}

// ---------------------------------------------------------------------------
// AnalyticsReviewInteractiveRegion
// ---------------------------------------------------------------------------

export function AnalyticsReviewInteractiveRegion({
  viewModel,
  reviewsWiring,
}: {
  readonly viewModel: AnalyticsViewModel;
  readonly reviewsWiring?: ReviewsWiring;
}) {
  const [chartTab, setChartTab] = React.useState<"trend" | "funnel">("trend");
  const [activeReviewId, setActiveReviewId] = React.useState<string | null>(
    null,
  );
  // Review-history drill (wired-local → backend): the selected review's detail
  // (reviews.get). A read-only drill — no router.refresh().
  const [reviewDetail, setReviewDetail] = React.useState<ReviewDto | null>(null);

  const onSelectReview = React.useCallback(
    (id: string) => {
      setActiveReviewId(id);
      if (!reviewsWiring) return; // inert without the ops surface (fixture-only)
      void (async () => {
        const detail = (await client.getReview({
          params: { reviewId: id },
          query: undefined,
          body: undefined,
        })) as ReviewDto;
        setReviewDetail(detail);
      })();
    },
    [reviewsWiring],
  );

  // [T-116a] 单一诚实视图:直接渲 server 装配的真 viewModel(去掉按 tab 的时间窗重派生 —— 那
  // 只对 demo 假项目生效、真项目零反馈)。viewsTrendMode 缺省时按点数推断(单点 single / 多点 daily)。
  return (
    <div
      data-slot="analytics-grid"
      className="grid grid-cols-1 gap-card-gap lg:grid-cols-[minmax(0,1fr)_350px]"
    >
      <div data-slot="analytics-main-column" className="flex flex-col gap-3">
        <CoreMetricsRow metrics={viewModel.metrics} />
        <PrimaryCharts
          viewsTrend={viewModel.viewsTrend}
          viewsTrendMode={
            viewModel.viewsTrendMode ??
            (viewModel.viewsTrend.length > 1 ? "daily" : "single")
          }
          conversionFunnel={viewModel.conversionFunnel}
          chartTab={chartTab}
          onChartTabChange={setChartTab}
        />
        {/* [T-116b] 观众画像 / 观众来源 / 留存曲线(SecondaryCharts)+ 关键时刻区已移除:
            均无数据源 op(需单视频采集 T-100),真项目恒空占位。待 T-100 做了再加回。 */}
        <TopPublishedList items={viewModel.topPublished} />
        <CommentsSection comments={viewModel.comments ?? []} />
        {/* [T-118a §A/§D] 本期经验裁决区:本作品复盘提炼的经验候选,当场采纳/翻案。
            与 AI 要点卡(右栏,只读摘要)视觉分隔 + 数据源标注,防混淆。 */}
        <CurrentPeriodLearnings
          candidates={viewModel.candidateLearnings ?? []}
          projectId={viewModel.projectId}
        />
      </div>
      <div
        data-slot="analytics-right-rail"
        className="flex flex-col gap-card-gap"
      >
        <InsightCard
          items={viewModel.aiAnalysis}
          projectId={viewModel.projectId}
        />
        <ReviewAuthoringPanel
          projectId={viewModel.projectId}
          wiring={reviewsWiring}
        />
        <ReviewHistoryCard
          items={viewModel.reviewHistory}
          activeId={activeReviewId}
          onSelect={onSelectReview}
          detail={reviewDetail}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CoreMetricsRow — 7 cards in a single row
// ---------------------------------------------------------------------------

function CoreMetricsRow({ metrics }: { metrics: ReadonlyArray<MetricCardVm> }) {
  return (
    <section
      data-slot="core-metrics-row"
      aria-label="核心指标"
      className="grid grid-cols-1 gap-card-gap sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7"
    >
      {metrics.map((metric) => (
        <MetricCard
          key={metric.id}
          id={metric.id}
          label={metric.label}
          value={metric.value}
          delta={metric.delta}
          trend={metric.trend}
          tone={metric.tone}
        />
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// PrimaryCharts — ViewsTrendChart (line) + ConversionFunnel (funnel)
// ---------------------------------------------------------------------------

function PrimaryCharts({
  viewsTrend,
  viewsTrendMode,
  conversionFunnel,
  chartTab,
  onChartTabChange,
}: {
  viewsTrend: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  viewsTrendMode: "daily" | "single" | "empty";
  conversionFunnel: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  chartTab: "trend" | "funnel";
  onChartTabChange: (tab: "trend" | "funnel") => void;
}) {
  return (
    <div data-slot="primary-charts" className="flex flex-col gap-card-gap">
      <div
        data-slot="primary-chart-tabs"
        role="tablist"
        aria-label="主图切换"
        className="flex items-center gap-1.5"
      >
        <button
          type="button"
          role="tab"
          data-slot="primary-chart-tab"
          data-chart-tab="trend"
          data-pressed={chartTab === "trend"}
          aria-selected={chartTab === "trend"}
          onClick={() => onChartTabChange("trend")}
          className="inline-flex h-7 items-center rounded-full border border-border bg-surface px-3 text-[11px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-[pressed=true]:border-brand/60 data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
        >
          趋势
        </button>
        <button
          type="button"
          role="tab"
          data-slot="primary-chart-tab"
          data-chart-tab="funnel"
          data-pressed={chartTab === "funnel"}
          aria-selected={chartTab === "funnel"}
          onClick={() => onChartTabChange("funnel")}
          className="inline-flex h-7 items-center rounded-full border border-border bg-surface px-3 text-[11px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-[pressed=true]:border-brand/60 data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
        >
          漏斗
        </button>
      </div>
      <div className="grid grid-cols-1 gap-card-gap lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SectionCard
          title="播放趋势"
          description={viewsTrendMode === "single" ? "单次采集快照" : "按采集日"}
          className="[--card-spacing:--spacing(3)]"
        >
          <ViewsTrendChart
            data={viewsTrend}
            mode={viewsTrendMode}
            summary={buildTrendSummary(viewsTrend, viewsTrendMode)}
            slot="views-trend-chart"
            testId="views-trend-chart-echarts"
          />
        </SectionCard>
        <article
          data-slot="conversion-funnel"
          data-shape="funnel"
          data-testid="conversion-funnel"
          className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-3 shadow-card"
        >
          <header className="flex flex-col gap-1">
            <h3 className="text-md font-semibold text-foreground">转化漏斗</h3>
            <p className="text-xs text-muted-foreground">从曝光到转化的逐级流失</p>
          </header>
          <ConversionFunnelChart data={conversionFunnel} />
          <ul
            data-slot="conversion-funnel-list"
            className="flex flex-col gap-0.5"
            aria-label="转化漏斗数据"
          >
            {conversionFunnel.map((row) => (
              <li
                key={row.label}
                data-slot="conversion-funnel-row"
                data-funnel-label={row.label}
                className="flex items-center justify-between text-[11px]"
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-medium tabular-nums text-foreground">
                  {row.value.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
          <p data-slot="chart-summary" className="sr-only">
            转化漏斗：曝光 {conversionFunnel[0]?.value.toLocaleString() ?? ""} → 点击 {conversionFunnel[1]?.value.toLocaleString() ?? ""} → 播放 {conversionFunnel[2]?.value.toLocaleString() ?? ""} → 互动 {conversionFunnel[3]?.value.toLocaleString() ?? ""} → 转化 {conversionFunnel[4]?.value.toLocaleString() ?? ""}，整体转化率 {funnelConversionRate(conversionFunnel)}%。
          </p>
        </article>
      </div>
    </div>
  );
}

// 播放趋势 sr-only 摘要 (D-007): 诚实反映数据形态 —— 单快照说单点,多日说日级折线,
// 绝不在文案里编造「整体上升」这类不存在的趋势结论。
function buildTrendSummary(
  data: ReadonlyArray<{ readonly label: string; readonly value: number }>,
  mode: "daily" | "single" | "empty",
): string {
  if (mode === "empty" || data.length === 0) return "播放趋势：暂无采集数据。";
  if (mode === "single" || data.length === 1) {
    const p = data[data.length - 1]!;
    return `播放趋势：仅 1 次采集(${p.label}），播放量 ${p.value.toLocaleString()}。需多次采集积累日趋势。`;
  }
  const first = data[0]!;
  const last = data[data.length - 1]!;
  const rising = last.value >= first.value;
  return `播放趋势(按采集日）：${first.label} ${first.value.toLocaleString()} 到 ${last.label} ${last.value.toLocaleString()}，${rising ? "整体上升" : "整体回落"}。`;
}

function funnelConversionRate(
  data: ReadonlyArray<{ readonly label: string; readonly value: number }>,
): string {
  const first = data[0]?.value ?? 0;
  const last = data[data.length - 1]?.value ?? 0;
  if (first === 0) return "0";
  return ((last / first) * 100).toFixed(1);
}

// ---------------------------------------------------------------------------
// TopPublishedList — band of 4 publication cards at the bottom of the
// main column.
// ---------------------------------------------------------------------------

function TopPublishedList({ items }: { items: ReadonlyArray<TopPublished> }) {
  const list = items;
  return (
    <section
      data-slot="top-published-section"
      aria-label="热门作品发布列表"
      className="flex flex-col gap-1.5"
    >
      <header className="flex items-center justify-between px-1">
        <div className="flex flex-col gap-0">
          <h3 className="text-[13px] font-semibold text-foreground">
            热门作品发布列表
          </h3>
        </div>
        {/* [T-116b] 纯装饰「查看全部」按钮(无后端)已删除。 */}
      </header>
      {list.length === 0 ? (
        <div
          data-slot="top-published-empty"
          data-empty="true"
          className="flex flex-col items-start gap-1 rounded-lg border border-dashed border-border bg-surface-subtle px-3 py-4"
        >
          <p className="text-[12px] font-medium text-foreground">暂无作品</p>
          <p className="text-[11px] text-muted-foreground">
            该项目还没有导入 / 发布的作品，作品发布后会显示在这里。
          </p>
        </div>
      ) : (
      <ul
        data-slot="top-published-list"
        className="grid grid-cols-1 gap-1.5 md:grid-cols-2 lg:grid-cols-4"
        aria-label="热门作品发布"
      >
        {list.map((item) => (
          <li
            key={item.id}
            data-slot="top-published-card"
            data-published-id={item.id}
            data-tone={item.tone}
            data-inert="decorative"
            className={
              item.tone === "primary"
                ? "col-span-1 flex flex-col gap-1 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-card md:col-span-2 md:row-span-1 md:flex-row"
                : "flex items-center gap-1.5 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-card"
            }
          >
            <TopPublishedThumb tone={item.tone} platform={item.platform} />
            <div
              className={
                item.tone === "primary"
                  ? "flex min-w-0 flex-1 flex-col gap-0.5 p-1"
                  : "flex min-w-0 flex-1 flex-col gap-0"
              }
            >
              <span className="line-clamp-2 text-[11px] font-medium text-foreground">
                {item.title}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {item.platform} · {item.views}
              </span>
            </div>
          </li>
        ))}
      </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// CommentsSection — 复盘每作品评论 (T-030 §10 / D6)
//
// 当前作品的真实评论 (前 100 条, 文本 + demand_tag 若有), 读自 publications.comments.list。
// 空态诚实 (宪法 §8 / T-010): 无评论 → 引导「去自动化配『抓我作品评论』采集」, 绝不摆假评论。
// F3 边界: 存量评论无 aweme_id 锚未回填 publication_id → 查不到 → 走空态 (需重采)。
// ---------------------------------------------------------------------------

function CommentsSection({
  comments,
}: {
  comments: ReadonlyArray<CommentItem>;
}) {
  const isEmpty = comments.length === 0;
  // [T-092] 单条评论「入知识库」:点击展开预填确认门(title=评论原文,人改成问题式)
  // → 采纳走 knowledge.create(type='qa' + sourceMetadata 双料锚)。一次只开一条。
  const [backflowFor, setBackflowFor] = React.useState<string | null>(null);
  const [backflowTitle, setBackflowTitle] = React.useState("");
  const [backflowBusy, setBackflowBusy] = React.useState(false);
  const [backflowMessage, setBackflowMessage] = React.useState<string | null>(
    null,
  );
  const [backflowedIds, setBackflowedIds] = React.useState<Set<string>>(
    () => new Set(),
  );

  const openBackflow = React.useCallback((comment: CommentItem) => {
    setBackflowFor(comment.id);
    setBackflowTitle(comment.text.slice(0, 80));
    setBackflowMessage(null);
  }, []);

  const adoptBackflow = React.useCallback(
    async (comment: CommentItem) => {
      const title = backflowTitle.trim();
      if (!title || backflowBusy) return;
      setBackflowBusy(true);
      setBackflowMessage(null);
      try {
        await client.createKnowledge({
          params: undefined,
          query: undefined,
          body: {
            title,
            knowledgeType: "qa",
            content: "",
            sourceType: "import",
            sourceNote: `抖音评论,赞 ${comment.likeCount ?? 0}`,
            sourceMetadata: {
              origin: "comment_backflow",
              signalIds: [comment.id],
              signalExternalIds: comment.externalId ? [comment.externalId] : [],
            },
          },
        });
        setBackflowedIds((prev) => new Set(prev).add(comment.id));
        setBackflowFor(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // service 幂等兜底(锚已入库)→ 诚实标注,不重复入库;其余走人话收口(不裸吐)。
        setBackflowMessage(
          message.includes("已回流")
            ? "该评论已回流过知识库。"
            : describeUserError(err, "回流失败，请重试。"),
        );
      } finally {
        setBackflowBusy(false);
      }
    },
    [backflowTitle, backflowBusy],
  );
  return (
    <section
      data-slot="review-comments-section"
      data-empty={isEmpty ? "true" : "false"}
      aria-label="作品评论"
      className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-3 shadow-card"
    >
      <header className="flex items-center justify-between px-1">
        <h3 className="text-[13px] font-semibold text-foreground">热门评论</h3>
        {isEmpty ? null : (
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            热榜前 {comments.length} 条
          </span>
        )}
      </header>
      {isEmpty ? (
        <div
          data-slot="review-comments-empty"
          className="flex flex-col items-start gap-1 rounded-lg border border-dashed border-border bg-surface-subtle px-3 py-4"
        >
          <p className="text-[12px] font-medium text-foreground">
            未采集该作品评论
          </p>
          <p className="text-[11px] text-muted-foreground">
            去自动化配「抓我作品评论」采集，评论回收后会显示在这里。
          </p>
        </div>
      ) : (
        <ul
          data-slot="review-comments-list"
          className="flex flex-col gap-1.5"
          aria-label="评论列表"
        >
          {comments.map((comment) => (
            <li
              key={comment.id}
              data-slot="review-comment-item"
              data-comment-id={comment.id}
              className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-3 py-2"
            >
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">
                {comment.text}
              </p>
              {/* [T-092] 单条「入知识库」轻动作:高价值疑问不必等批处理。 */}
              <div className="flex items-center gap-1.5">
                {backflowedIds.has(comment.id) ? (
                  <span
                    data-slot="review-comment-backflowed"
                    className="text-[10px] text-muted-foreground"
                  >
                    已入知识库
                  </span>
                ) : (
                  <button
                    type="button"
                    data-slot="review-comment-to-knowledge"
                    onClick={() => openBackflow(comment)}
                    className="text-[10px] text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    入知识库
                  </button>
                )}
              </div>
              {backflowFor === comment.id ? (
                <div
                  data-slot="review-comment-backflow-gate"
                  className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-subtle/50 p-2"
                >
                  <label
                    className="text-[10px] text-muted-foreground"
                    htmlFor={`review-comment-backflow-title-${comment.id}`}
                  >
                    归一成问题(采纳后进知识库为「观众问题」原子)
                  </label>
                  <input
                    id={`review-comment-backflow-title-${comment.id}`}
                    data-slot="review-comment-backflow-title"
                    type="text"
                    value={backflowTitle}
                    onChange={(e) => setBackflowTitle(e.target.value)}
                    className="h-7 rounded-md border border-border bg-surface px-2 text-[12px] text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  {backflowMessage ? (
                    <p
                      data-slot="review-comment-backflow-message"
                      className="text-[10px] text-destructive"
                    >
                      {backflowMessage}
                    </p>
                  ) : null}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-slot="review-comment-backflow-adopt"
                      disabled={backflowBusy || backflowTitle.trim().length === 0}
                      onClick={() => void adoptBackflow(comment)}
                      className="inline-flex h-6 items-center rounded-md bg-brand px-2 text-[11px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                    >
                      {backflowBusy ? "入库中…" : "采纳入库"}
                    </button>
                    <button
                      type="button"
                      data-slot="review-comment-backflow-cancel"
                      disabled={backflowBusy}
                      onClick={() => setBackflowFor(null)}
                      className="inline-flex h-6 items-center rounded-md border border-border bg-surface px-2 text-[11px] text-foreground hover:bg-surface-subtle"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : null}
              {comment.demandTag || (comment.likeCount ?? 0) > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {(comment.likeCount ?? 0) > 0 ? (
                    <span
                      data-slot="review-comment-likes"
                      data-like-count={comment.likeCount ?? 0}
                      className="inline-flex w-fit items-center gap-0.5 rounded-full bg-surface-subtle px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground"
                      title="评论点赞数(热榜排序依据)"
                    >
                      🔥 {(comment.likeCount ?? 0).toLocaleString()}
                    </span>
                  ) : null}
                  {comment.demandTag ? (
                    <span
                      data-slot="review-comment-demand-tag"
                      className="inline-flex w-fit items-center rounded-full border border-brand/40 bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand"
                    >
                      {comment.demandTag}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// CurrentPeriodLearnings — 本期经验裁决区 (T-118a §A / §D [gate-F1])
//
// 渲染本作品的 candidate learnings(复盘提炼的经验候选),复用 experience 的
// AdjudicationQueue(采纳/不采→evaluateLearning、inline 编辑)。§D UI 边界:
//   - 标题「本期经验 · 可采纳沉淀」+ 副标题「来源:本作品复盘提炼、待你裁决」;
//   - 与右栏「AI 要点 · 本期复盘摘要」(只读)视觉分隔(独立区块 + 顶部强调边 + 不同底色);
//   - 空态差异化:无候选 → 「本条视频还没有可裁决的经验候选 → 点『帮我复盘』
//     (复盘会同时产要点 + 经验候选)」+ 复用 T-116 的「帮我复盘」CTA(深链既有 review.analyze)。
// 与 AI 卡的区分锁点:data-slot 不同(current-period-learnings vs ai-analysis-card)+
// 本区有采纳按钮(AdjudicationQueue 的 learning-adopt),AI 卡无任何动作。
// ---------------------------------------------------------------------------

function CurrentPeriodLearnings({
  candidates,
  projectId,
}: {
  candidates: AdjudicationQueueProps["candidates"];
  projectId: string;
}) {
  const isEmpty = candidates.length === 0;
  return (
    <section
      data-slot="current-period-learnings"
      data-empty={isEmpty ? "true" : "false"}
      aria-label="本期经验"
      className="flex flex-col gap-2 rounded-xl border border-brand/25 border-t-4 border-t-brand/50 bg-brand-soft/20 p-3 shadow-card"
    >
      <header className="flex flex-col gap-0.5 px-1">
        <h3 className="text-[13px] font-semibold text-foreground">
          本期经验 · 可采纳沉淀
        </h3>
        <p className="text-[11px] text-muted-foreground">
          来源:本作品复盘提炼、待你裁决
        </p>
      </header>
      {isEmpty ? (
        <div
          data-slot="current-period-learnings-empty"
          className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border bg-surface px-3 py-4"
        >
          <p className="text-[12px] font-medium text-foreground">
            本条视频还没有可裁决的经验候选
          </p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            点「帮我复盘」让编导从本期评论 / 指标提炼(复盘会同时产要点 + 经验候选)。
          </p>
          <Link
            href={copilotDeepLink("review", "review.analyze", {
              kind: "project",
              id: projectId,
            })}
            data-slot="current-period-learnings-cta"
            className="inline-flex h-7 w-fit items-center gap-1.5 rounded-control border border-brand/30 bg-brand-soft/50 px-3 text-[11px] font-medium text-brand transition-colors hover:border-brand hover:bg-brand-soft"
          >
            <Sparkles className="size-3.5" />
            帮我复盘
          </Link>
        </div>
      ) : (
        <AdjudicationQueue candidates={candidates} />
      )}
    </section>
  );
}

function TopPublishedThumb({
  tone,
  platform,
}: {
  tone: "primary" | "compact";
  platform: string;
}) {
  const palette = paletteForPlatform(platform);
  const sizeClass =
    tone === "primary"
      ? "h-14 w-full md:h-16 md:w-28 md:shrink-0"
      : "h-10 w-10 shrink-0";
  return (
    <div
      data-slot="top-published-thumb"
      data-platform={platform}
      aria-hidden="true"
      className={`flex items-center justify-center rounded-md ${palette.bg} ${sizeClass}`}
    >
      <span className={`text-sm font-semibold ${palette.fg}`}>
        {platformInitial(platform)}
      </span>
    </div>
  );
}

interface Palette {
  readonly bg: string;
  readonly fg: string;
}

function paletteForPlatform(platform: string): Palette {
  switch (platform) {
    case "抖音":
      return { bg: "bg-rose-100", fg: "text-rose-600" };
    case "小红书":
      return { bg: "bg-pink-100", fg: "text-pink-600" };
    case "B 站":
    case "bilibili":
      return { bg: "bg-sky-100", fg: "text-sky-600" };
    case "YouTube":
    case "youtube":
      return { bg: "bg-red-100", fg: "text-red-600" };
    case "视频号":
    case "wechatVideo":
      return { bg: "bg-emerald-100", fg: "text-emerald-600" };
    default:
      return { bg: "bg-violet-100", fg: "text-violet-600" };
  }
}

function platformInitial(platform: string): string {
  switch (platform) {
    case "抖音":
      return "抖";
    case "小红书":
      return "书";
    case "B 站":
    case "bilibili":
      return "B";
    case "YouTube":
    case "youtube":
      return "Y";
    case "视频号":
    case "wechatVideo":
      return "视";
    default:
      return "作";
  }
}

// ---------------------------------------------------------------------------
// Right rail — InsightCard → ReviewHistoryCard
// ---------------------------------------------------------------------------

function ReviewHistoryCard({
  items,
  activeId,
  onSelect,
  detail,
}: {
  items: ReadonlyArray<ReviewHistoryItem>;
  activeId: string | null;
  onSelect: (id: string) => void;
  detail?: ReviewDto | null;
}) {
  return (
    <article
      data-slot="review-history-card"
      aria-label="复盘记录"
      className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-card-gap shadow-card"
    >
      <header className="flex flex-col gap-1">
        <h3 className="text-md font-semibold text-foreground">复盘记录</h3>
        <p className="text-xs text-muted-foreground">历史复盘条目</p>
      </header>
      <ul
        data-slot="review-history-list"
        className="flex flex-col gap-1.5"
        aria-label="复盘记录列表"
      >
        {items.map((item) => {
          const selected = item.id === activeId;
          return (
            <li
              key={item.id}
              data-slot="review-history-item"
              data-history-id={item.id}
              data-tone={item.tone}
              data-selected={selected ? "true" : "false"}
              onClick={() => onSelect(item.id)}
              className={
                "flex cursor-pointer items-center justify-between rounded-md border border-border px-3 py-2 text-sm " +
                (selected ? "bg-brand-soft/50" : "bg-surface-subtle")
              }
            >
              <span className="font-medium text-foreground">{item.title}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {item.completedAt}
              </span>
            </li>
          );
        })}
      </ul>
      {detail ? (
        <div
          data-slot="review-detail-panel"
          data-review-id={detail.id}
          data-review-status={detail.status}
          className="flex flex-col gap-1 rounded-md border border-border bg-surface-subtle px-3 py-2 text-xs"
        >
          <span className="font-medium text-foreground">
            复盘详情 · {detail.reviewType === "output" ? "单作品" : "项目"}
          </span>
          <span className="text-muted-foreground">
            状态：{detail.status} · 周期 {detail.periodStart} ~ {detail.periodEnd}
          </span>
        </div>
      ) : null}
    </article>
  );
}

// ---------------------------------------------------------------------------
// ReviewAuthoringPanel — the greenfield review-authoring surface (roadmap §4
// Gap / G13). Each control maps to exactly one Reviews op; mutations call the op
// then router.refresh(). Without `wiring` the panel renders inert (no client
// call) so the fixture-only page render + visual baseline hold.
// [T-116b] 未接通的装饰控件(添加发布 / 生成复盘报告)已删除;只保留有真 op 的控件。
// ---------------------------------------------------------------------------

function ReviewAuthoringPanel({
  projectId,
  wiring,
}: {
  projectId: string;
  wiring?: ReviewsWiring;
}) {
  const router = useRouter();
  // The active in_progress review id created via 开始复盘 (kept client-local so 添加洞察
  // / 完成复盘 know which review to target). Null until a review is started.
  const [activeReviewId, setActiveReviewId] = React.useState<string | null>(
    null,
  );
  const [insightType, setInsightType] = React.useState<string>(
    INSIGHT_TYPES[0]!.value,
  );
  const [title, setTitle] = React.useState<string>("");
  const [description, setDescription] = React.useState<string>("");

  const startReview = React.useCallback(() => {
    if (!wiring) return;
    void (async () => {
      const review = (await client.createReview({
        params: { projectId },
        query: undefined,
        body: { reviewType: "project", contentOutputId: null },
      })) as { id: string };
      setActiveReviewId(review.id);
      router.refresh();
    })();
  }, [wiring, projectId, router]);

  const addInsight = React.useCallback(() => {
    if (!wiring || !activeReviewId || title.trim() === "") return;
    void (async () => {
      await client.createReviewInsight({
        params: { reviewId: activeReviewId },
        query: undefined,
        body: {
          insightType: insightType as
            | "success"
            | "issue"
            | "action"
            | "hypothesis",
          title,
          description,
        },
      });
      setTitle("");
      setDescription("");
      router.refresh();
    })();
  }, [wiring, activeReviewId, insightType, title, description, router]);

  const completeReview = React.useCallback(() => {
    if (!wiring || !activeReviewId) return;
    void (async () => {
      await client.completeReview({
        params: { reviewId: activeReviewId },
        query: undefined,
        body: undefined,
      });
      router.refresh();
    })();
  }, [wiring, activeReviewId, router]);

  return (
    <article
      data-slot="review-authoring-panel"
      aria-label="复盘编辑"
      className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-card-gap shadow-card"
    >
      <header className="flex flex-col gap-1">
        <h3 className="text-md font-semibold text-foreground">复盘编辑</h3>
        <p className="text-xs text-muted-foreground">创建复盘、记录洞察并完成</p>
      </header>
      <button
        type="button"
        data-slot="start-review-button"
        data-has-active={activeReviewId ? "true" : "false"}
        onClick={startReview}
        className="inline-flex h-8 items-center justify-center rounded-md border border-brand/60 bg-brand-soft px-3 text-xs font-medium text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        开始复盘
      </button>

      <div data-slot="add-insight-form" className="flex flex-col gap-1.5">
        <select
          data-slot="insight-type-select"
          value={insightType}
          onChange={(e) => setInsightType(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground"
        >
          {INSIGHT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          data-slot="insight-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="洞察标题"
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground"
        />
        <input
          data-slot="insight-description-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="补充说明（可选）"
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground"
        />
        <button
          type="button"
          data-slot="add-insight-button"
          onClick={addInsight}
          className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          添加洞察
        </button>
      </div>

      <button
        type="button"
        data-slot="complete-review-button"
        onClick={completeReview}
        className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        完成复盘
      </button>

      {/* [T-116b] 纯装饰按钮「添加发布 / 生成复盘报告」(经验沉淀飞轮未接通)已删除。 */}
    </article>
  );
}
