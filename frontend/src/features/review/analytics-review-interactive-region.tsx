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
 *  - Review-history 行选中(拉 reviews.get 详情;失败内联可见)。
 *  - 复盘编辑([T-329] 直接可用):洞察表单常显,「添加洞察」无进行中 review 时
 *    隐式先 reviews.create 再 insights.create;「完成复盘」为收尾动作(禁用带原因)。
 *
 * [T-116b] 移除规划中占位:观众画像 / 观众来源 / 留存曲线三个无数据源 op 的 PlannedRegion
 * 区、关键时刻区(真项目恒空)、3 个纯装饰按钮(查看全部 / 添加发布 / 生成复盘报告)一并删除。
 * 观众细分/留存 待单视频采集 T-100 做了再加回(见各删除处注释)。
 *
 * [T-329] 删掉「趋势 / 漏斗」chip 假切换:两图本就常挂、chip 只切强调态,无真切换
 * 语义(不换数据、不换图型)—— 图表区改为直接并排布,chartTab state 一并移除。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { describeUserError } from "@/lib/ai-error-humanize";
import { client } from "@/lib/contract-client";
import {
  formatCalendarDateRange,
  formatLocalDateTime,
  formatUtcDateTime,
} from "@/lib/date-time";
import { ViewsTrendChart } from "@/components/analytics/views-trend-chart";
import { ConversionFunnelChart } from "@/components/analytics/conversion-funnel-chart";
import { EmptyState } from "@/components/state/page-state";
import { SectionCard } from "@/components/project/section-card";
// [T-329] 复盘专用紧凑指标卡(12 卡响应式网格;共享 MetricCard 不动,别的页面在用)。
import { ReviewMetricCard } from "./review-metric-card";
import { ReviewAnalyzeButton } from "./review-analyze-island";
// [T-209] 复盘内容区把当前 viewModel 发布到 module 桥,供 header「导出报告」按钮读取。
import { publishReviewExportModel } from "./review-report-export";
// [T-118a §A] 复用经验裁决队列组件(采纳/不采→evaluateLearning、inline 编辑),不另造。
import {
  AdjudicationQueue,
  type AdjudicationQueueProps,
} from "@/features/experience/experience-interactive-region";
import type {
  AnalyticsViewModel,
  MetricCard as MetricCardVm,
} from "@/types/view-models";

// ---------------------------------------------------------------------------
// Render-side item types (structurally identical to the matching
// AnalyticsViewModel fields).
// ---------------------------------------------------------------------------

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

interface ReviewInsightDto {
  readonly id: string;
  readonly reviewId: string;
  readonly insightType: "success" | "issue" | "action" | "hypothesis";
  readonly title: string;
  readonly description: string;
  readonly priority: number;
}

interface ReviewDetailDto extends ReviewDto {
  readonly insights: ReadonlyArray<ReviewInsightDto>;
}

const subscribeHydration = () => () => {};
const isHydrated = () => true;
const isServerRendering = () => false;

function LocalDateTime({ value }: { value: string }) {
  const hydrated = React.useSyncExternalStore(
    subscribeHydration,
    isHydrated,
    isServerRendering,
  );
  return (
    <time dateTime={value}>
      {hydrated ? formatLocalDateTime(value) : formatUtcDateTime(value)}
    </time>
  );
}

// ---------------------------------------------------------------------------
// AnalyticsReviewInteractiveRegion
// ---------------------------------------------------------------------------

export function AnalyticsReviewInteractiveRegion({
  viewModel,
  reviewsWiring,
  metricsEmpty = false,
  reviewEvidenceReady = true,
  metricsContent,
  analysisScope,
}: {
  readonly viewModel: AnalyticsViewModel;
  readonly reviewsWiring?: ReviewsWiring;
  /**
   * [T-329] 指标/图表区空态(该作品还没拉到明细快照)。true → 主列的指标卡 + 主图
   * 收窄成一块 EmptyState;其余区(热门作品/评论/本期经验/右栏复盘编辑/记录)照渲
   * (各自带诚实空态)—— 复盘编辑不依赖指标采集,不该被指标空态吞掉。
   */
  readonly metricsEmpty?: boolean;
  /** 当前项目已有发布后指标或评论；没有证据时禁止生成/展示伪复盘。 */
  readonly reviewEvidenceReady?: boolean;
  readonly metricsContent?: React.ReactNode;
  readonly analysisScope?: string;
}) {
  const [activeReviewId, setActiveReviewId] = React.useState<string | null>(
    null,
  );
  // Review-history drill (wired-local → backend): the selected review's detail
  // (reviews.get). A read-only drill — no router.refresh().
  const [reviewDetail, setReviewDetail] =
    React.useState<ReviewDetailDto | null>(null);
  const [reviewDetailLoadingId, setReviewDetailLoadingId] =
    React.useState<string | null>(null);
  const reviewDetailRequestRef = React.useRef(0);
  // [T-329] 详情读失败内联可见(此前 getReview 失败是未处理的 rejection,静默无反馈)。
  const [reviewDetailError, setReviewDetailError] = React.useState<
    string | null
  >(null);

  // [T-209] 发布当前 viewModel 到 module 桥,让 header 的「导出报告」按钮能就地生成
  // 自包含报告(header 与本内容区在不同子树,context 上浮不到,故用单例桥)。unmount 清空。
  React.useEffect(() => {
    publishReviewExportModel(viewModel);
    return () => publishReviewExportModel(null);
  }, [viewModel]);

  const onSelectReview = React.useCallback(
    (id: string) => {
      if (id === activeReviewId) {
        reviewDetailRequestRef.current += 1;
        setActiveReviewId(null);
        setReviewDetail(null);
        setReviewDetailError(null);
        setReviewDetailLoadingId(null);
        return;
      }
      const requestSequence = reviewDetailRequestRef.current + 1;
      reviewDetailRequestRef.current = requestSequence;
      setActiveReviewId(id);
      setReviewDetail(null);
      setReviewDetailError(null);
      if (!reviewsWiring) {
        setReviewDetailError("登录状态还没准备好，暂时无法读取复盘详情。");
        return;
      }
      setReviewDetailLoadingId(id);
      void (async () => {
        try {
          const [detail, insights] = await Promise.all([
            client.getReview({
              params: { reviewId: id },
              query: undefined,
              body: undefined,
            }),
            client.listReviewInsights({
              params: { reviewId: id },
              query: undefined,
              body: undefined,
            }),
          ]);
          const review = detail as ReviewDto;
          if (review.id !== id) {
            throw new Error("复盘详情与所选记录不一致");
          }
          if (reviewDetailRequestRef.current !== requestSequence) return;
          setReviewDetail({
            ...review,
            insights: insights as unknown as ReviewInsightDto[],
          });
        } catch (err) {
          if (reviewDetailRequestRef.current !== requestSequence) return;
          setReviewDetail(null);
          setReviewDetailError(
            describeUserError(err, "读取复盘详情失败，请重试。"),
          );
        } finally {
          if (reviewDetailRequestRef.current === requestSequence) {
            setReviewDetailLoadingId(null);
          }
        }
      })();
    },
    [activeReviewId, reviewsWiring],
  );

  // [T-329] 进行中的复盘(reviews.list status=in_progress)→ 复盘编辑面板接管它
  // (刷新后继续「添加洞察 / 完成复盘」,不再另起新复盘)。取最新一条。
  const inProgressReviewId =
    viewModel.reviewHistory.find((r) => r.status === "in_progress")?.id ?? null;

  // [T-116a] 单一诚实视图:直接渲 server 装配的真 viewModel(去掉按 tab 的时间窗重派生 —— 那
  // 只对 demo 假项目生效、真项目零反馈)。viewsTrendMode 缺省时按点数推断(单点 single / 多点 daily)。
  return (
    <div
      data-slot="analytics-grid"
      className="grid grid-cols-1 gap-card-gap lg:grid-cols-[minmax(0,1fr)_350px]"
    >
      {/* [T-209] 主列竖向间距 gap-3(12px)与右栏/外层网格 gap-card-gap(16px)不齐 →
          统一为 card-gap,消除左右两列节奏错位的「布局奇怪」观感。 */}
      <div data-slot="analytics-main-column" className="flex flex-col gap-card-gap">
        {metricsContent ?? (metricsEmpty ? (
          // [T-329] 空态收窄到指标/图表区:没拉到明细快照时只这块显空态引导,
          // 复盘编辑/记录等真 op 面照常可用。
          <EmptyState
            title="该作品暂无明细数据"
            description="还没有这个作品的详细数据。去「自动化」里同步一次明细数据,回来即可看到指标和图表。"
          />
        ) : (
          <>
            <CoreMetricsRow metrics={viewModel.metrics} />
            <PrimaryCharts
              viewsTrend={viewModel.viewsTrend}
              viewsTrendMode={
                viewModel.viewsTrendMode ??
                (viewModel.viewsTrend.length > 1 ? "daily" : "single")
              }
              conversionFunnel={viewModel.conversionFunnel}
            />
          </>
        ))}
        {/* [T-116b] 观众画像 / 观众来源 / 留存曲线(SecondaryCharts)+ 关键时刻区已移除:
            均无数据源 op(需单视频采集 T-100),真项目恒空占位。待 T-100 做了再加回。 */}
        {/* [T-356②] 热门作品发布列表已下架:单项目复盘页拉账号级全作品列表=凑数
            (聚焦单作品 surface 不挂宽域列表,同 chatbox-scope-tools-to-task 教训)。 */}
        <CommentsSection comments={viewModel.comments ?? []} />
      </div>
      <div
        data-slot="analytics-right-rail"
        className="flex flex-col gap-card-gap"
      >
        {/* [T-404 用户拍板 2026-07-18] 本期经验裁决区(含「帮我复盘」CTA)从左列移到右栏、
            复盘编辑之上 —— 帮我复盘是复盘编辑的入口动作,放一起动线更顺。 */}
          <CurrentPeriodLearnings
            analysisScope={analysisScope}
          candidates={
            reviewEvidenceReady ? (viewModel.candidateLearnings ?? []) : []
          }
          projectId={viewModel.projectId}
          reviewEvidenceReady={reviewEvidenceReady}
        />
        {/* [T-356③] 「AI 要点 · 本期复盘摘要」卡已下架:与「本期经验 · 可采纳沉淀」
            同源(一次「帮我复盘」review.analyze 同时产要点+经验候选),两块并存=概念重复
            (用户真机反馈分不清)。收敛为单一「本期经验」区:帮我复盘 → 候选出现 → 采纳/翻案。 */}
        <ReviewAuthoringPanel
          projectId={viewModel.projectId}
          wiring={reviewsWiring}
          inProgressReviewId={inProgressReviewId}
        />
        <ReviewHistoryCard
          items={viewModel.reviewHistory}
          activeId={activeReviewId}
          onSelect={onSelectReview}
          detail={reviewDetail}
          detailError={reviewDetailError}
          loadingId={reviewDetailLoadingId}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CoreMetricsRow — [T-329] 12 张紧凑指标卡,auto-fit 响应式网格
//
// 此前 7 卡 lg:grid-cols-7 等分,宽度一变就挤爆;改成
// repeat(auto-fit, minmax(128px, 1fr)):容器多宽放多少列,12 卡在宽屏自然折成
// 两排、窄屏三/四排,永不横向溢出。卡片用复盘专用紧凑变体(ReviewMetricCard)。
// ---------------------------------------------------------------------------

function CoreMetricsRow({ metrics }: { metrics: ReadonlyArray<MetricCardVm> }) {
  return (
    <section
      data-slot="core-metrics-row"
      aria-label="核心指标"
      className="grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-2"
    >
      {metrics.map((metric) => (
        <ReviewMetricCard key={metric.id} metric={metric} />
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// PrimaryCharts — ViewsTrendChart (line) + ConversionFunnel (funnel)
//
// [T-329] 「趋势 / 漏斗」chip 假切换已删:两图本就常挂,chip 只切强调态,不换数据
// 不换图型,无真切换语义 —— 图表区直接并排布(chartTab state / tablist 一并移除)。
// ---------------------------------------------------------------------------

function PrimaryCharts({
  viewsTrend,
  viewsTrendMode,
  conversionFunnel,
}: {
  viewsTrend: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  viewsTrendMode: "daily" | "single" | "empty";
  conversionFunnel: ReadonlyArray<{ readonly label: string; readonly value: number }>;
}) {
  return (
    <div data-slot="primary-charts" className="flex flex-col gap-card-gap">
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
  if (mode === "empty" || data.length === 0) return "播放趋势：暂无数据。";
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
  reviewEvidenceReady,
  analysisScope,
}: {
  candidates: AdjudicationQueueProps["candidates"];
  projectId: string;
  reviewEvidenceReady: boolean;
  analysisScope?: string;
}) {
  const isEmpty = candidates.length === 0;
  return (
    <section
      data-slot="current-period-learnings"
      data-empty={isEmpty ? "true" : "false"}
      aria-label="本期经验"
      className="flex flex-col gap-2 rounded-xl border border-brand/25 border-t-4 border-t-brand/50 bg-brand-soft/20 p-3 shadow-card"
    >
      <header className="flex items-start justify-between gap-2 px-1">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-[13px] font-semibold text-foreground">
            本期经验 · 可采纳沉淀
          </h3>
          <p className="text-[11px] text-muted-foreground">
            来源:「帮我复盘」从本期评论/指标提炼,待你裁决;采纳后沉淀进知识库的经验区
          </p>
        </div>
        {/* [T-356③] 常驻再跑入口(原「AI 要点」卡下架后,非空态也要能再复盘)。 */}
        {!reviewEvidenceReady || isEmpty ? null : (
          <ReviewAnalyzeButton
            analysisScope={analysisScope}
            projectId={projectId}
            slot="current-period-learnings-rerun"
            className="h-7 shrink-0 px-3 text-[11px] [&_svg]:size-3.5"
          />
        )}
      </header>
      {!reviewEvidenceReady ? (
        <div
          data-slot="current-period-learnings-empty"
          className="rounded-lg border border-dashed border-border bg-surface px-3 py-4"
        >
          <p className="text-[12px] font-medium text-foreground">
            暂无可沉淀的效果经验，仍可诊断内容
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            当前项目还没有可核验的指标或观众评论。可先检查稿件，效果结论需等待真实数据。
          </p>
        </div>
      ) : isEmpty ? (
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
          <ReviewAnalyzeButton
            analysisScope={analysisScope}
            projectId={projectId}
            slot="current-period-learnings-cta"
            className="h-7 w-fit px-3 text-[11px] [&_svg]:size-3.5"
          />
        </div>
      ) : (
        <AdjudicationQueue candidates={candidates} compact />
      )}
    </section>
  );
}




// ---------------------------------------------------------------------------
// Right rail — InsightCard → ReviewHistoryCard
// ---------------------------------------------------------------------------

function ReviewHistoryCard({
  items,
  activeId,
  onSelect,
  detail,
  detailError,
  loadingId,
}: {
  items: ReadonlyArray<ReviewHistoryItem>;
  activeId: string | null;
  onSelect: (id: string) => void;
  detail?: ReviewDetailDto | null;
  /** [T-329] reviews.get 读失败的可见反馈(此前静默 rejection)。 */
  detailError?: string | null;
  loadingId?: string | null;
}) {
  const activeItemRef = React.useRef<HTMLLIElement | null>(null);

  React.useEffect(() => {
    if (detail?.id !== activeId) return;
    activeItemRef.current?.scrollIntoView?.({
      behavior: "smooth",
      block: "nearest",
    });
  }, [activeId, detail]);

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
      {items.length === 0 ? (
        // [T-329] 诚实空态:还没有任何复盘记录(编辑面板首次「添加洞察」会自动创建)。
        <p
          data-slot="review-history-empty"
          className="rounded-md border border-dashed border-border bg-surface-subtle px-3 py-3 text-xs text-muted-foreground"
        >
          还没有复盘记录 —— 在上方「复盘编辑」添加第一条洞察即可开始。
        </p>
      ) : null}
      <ul
        data-slot="review-history-list"
        className="flex flex-col gap-1.5"
        aria-label="复盘记录列表"
      >
        {items.map((item) => {
          const selected = item.id === activeId;
          const loading = item.id === loadingId;
          const statusLabel =
            item.status === "completed"
              ? "已完成"
              : item.status === "abandoned"
                ? "已结束"
                : "进行中";
          return (
            <li
              ref={selected ? activeItemRef : undefined}
              key={item.id}
              data-slot="review-history-item"
              data-history-id={item.id}
              data-tone={item.tone}
              data-selected={selected ? "true" : "false"}
              className={
                "overflow-hidden rounded-lg border text-sm transition-colors " +
                (selected
                  ? "border-brand/40 bg-brand-soft/35"
                  : "border-border bg-surface-subtle hover:border-brand/25")
              }
            >
              <button
                type="button"
                data-slot="review-history-trigger"
                aria-expanded={selected}
                aria-controls={`review-detail-${item.id}`}
                onClick={() => onSelect(item.id)}
                className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium leading-snug text-foreground">
                    {item.title}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {item.periodStart && item.periodEnd
                      ? `${formatCalendarDateRange(item.periodStart, item.periodEnd)} · `
                      : ""}
                    <LocalDateTime value={item.completedAt} />
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span
                    data-slot="review-history-status"
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] font-medium " +
                      (item.status === "completed"
                        ? "bg-success/10 text-success"
                        : "bg-brand-soft text-brand")
                    }
                  >
                    {statusLabel}
                  </span>
                  <span
                    aria-hidden="true"
                    className={
                      "text-muted-foreground transition-transform " +
                      (selected ? "rotate-90" : "")
                    }
                  >
                    ›
                  </span>
                </span>
              </button>
              {selected && loading ? (
                <p
                  data-slot="review-detail-loading"
                  role="status"
                  className="border-t border-border/70 px-3 py-3 text-xs text-muted-foreground"
                >
                  正在读取复盘内容…
                </p>
              ) : null}
              {selected && detailError ? (
                <p
                  data-slot="review-detail-error"
                  role="status"
                  aria-live="polite"
                  className="border-t border-border/70 px-3 py-3 text-[11px] text-destructive"
                >
                  {detailError}
                </p>
              ) : null}
              {selected && detail?.id === item.id ? (
                <div
                  id={`review-detail-${item.id}`}
                  data-slot="review-detail-panel"
                  data-review-id={detail.id}
                  data-review-status={detail.status}
                  className="flex flex-col gap-3 border-t border-border/70 bg-surface px-3 py-3 text-xs"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-foreground">复盘周期</span>
                    <span className="text-muted-foreground">
                      {formatCalendarDateRange(
                        detail.periodStart,
                        detail.periodEnd,
                      )}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="font-medium text-foreground">
                      洞察记录 · {detail.insights.length} 条
                    </span>
                    {detail.insights.length === 0 ? (
                      <span className="text-muted-foreground">
                        这次复盘还没有记录洞察。
                      </span>
                    ) : (
                      <ul
                        data-slot="review-detail-insights"
                        className="flex flex-col gap-1.5"
                      >
                        {detail.insights.map((insight) => (
                          <li
                            key={insight.id}
                            className="rounded-md border border-border bg-surface-subtle px-2.5 py-2"
                          >
                            <div className="flex items-start gap-2">
                              <span className="shrink-0 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand">
                                {INSIGHT_TYPES.find(
                                  (type) =>
                                    type.value === insight.insightType,
                                )?.label ?? "洞察"}
                              </span>
                              <span className="font-medium leading-relaxed text-foreground">
                                {insight.title}
                              </span>
                            </div>
                            {insight.description ? (
                              <p className="mt-1 pl-[50px] leading-relaxed text-muted-foreground">
                                {insight.description}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </article>
  );
}

// ---------------------------------------------------------------------------
// ReviewAuthoringPanel — the review-authoring surface (roadmap §4 Gap / G13)。
//
// [T-329] 交互从「开始复盘 → 添加洞察 → 完成复盘」三段式改成**直接可用**:
//  - 洞察表单常显;「添加洞察」时若无进行中 review → 隐式先 reviews.create 再
//    insights.create(链式,任一步失败内联可见);
//  - 「完成复盘」保留为收尾动作:有进行中 review 且本会话 ≥1 洞察(或接管的
//    进行中复盘,其洞察在服务端、本地无从计数 → 放行)才可用,否则禁用 + 说明;
//  - 无 wiring(无登录会话)→ 按钮禁用态 + 明示原因,绝不静默 no-op([T-329]
//    此前各动作 `if (!wiring) return` 是点了没反应的假按钮观感)。
// 每个写动作 = 一个真 Reviews op + router.refresh();内联反馈沿 T-209 模式。
// [T-116b] 未接通的装饰控件(添加发布 / 生成复盘报告)已删除;只保留有真 op 的控件。
// ---------------------------------------------------------------------------

function ReviewAuthoringPanel({
  projectId,
  wiring,
  inProgressReviewId = null,
}: {
  projectId: string;
  wiring?: ReviewsWiring;
  /** [T-329] 服务端已存在的进行中复盘(reviews.list)—— 面板接管它继续记洞察。 */
  inProgressReviewId?: string | null;
}) {
  const router = useRouter();
  // 本面板当前操作的 review:优先接管服务端进行中的复盘;否则 null,首次
  // 「添加洞察」隐式创建。sessionCreated 区分「本会话创建(洞察数可本地计)」。
  const [activeReviewId, setActiveReviewId] = React.useState<string | null>(
    inProgressReviewId,
  );
  const resumedReview =
    activeReviewId !== null && activeReviewId === inProgressReviewId;
  const [insightType, setInsightType] = React.useState<string>(
    INSIGHT_TYPES[0]!.value,
  );
  const [title, setTitle] = React.useState<string>("");
  const [description, setDescription] = React.useState<string>("");
  // 本会话已成功添加的洞察数(完成复盘的 ≥1 洞察门;接管的进行中复盘其洞察在
  // 服务端,契约无按 review 列洞察的读 op,本地无从计数 → resumedReview 放行)。
  const [insightCount, setInsightCount] = React.useState(0);
  // [T-209] 复盘编辑可见反馈:内联状态提示(成功绿 / 失败红),让每步都有肉眼可见的确认。
  const [feedback, setFeedback] = React.useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [busy, setBusy] = React.useState(false);

  // [T-329] 无 wiring = 无登录会话:控件禁用 + 明示原因(绝不静默 no-op)。
  const noWiringReason = wiring
    ? null
    : "登录状态还没准备好,请先登录后再保存复盘。";

  const addInsight = React.useCallback(() => {
    if (!wiring || busy) return; // 按钮已 disabled;此处仅防御
    if (title.trim() === "") {
      setFeedback({ tone: "error", text: "洞察标题不能为空" });
      return;
    }
    setBusy(true);
    setFeedback(null);
    void (async () => {
      // ① 无进行中 review → 隐式先创建(失败可见,单独收口,不吞进「添加失败」)。
      let reviewId = activeReviewId;
      if (!reviewId) {
        try {
          const review = (await client.createReview({
            params: { projectId },
            query: undefined,
            body: { reviewType: "project", contentOutputId: null },
          })) as { id: string };
          reviewId = review.id;
          setActiveReviewId(review.id);
          setInsightCount(0);
        } catch (err) {
          setFeedback({
            tone: "error",
            text: describeUserError(err, "创建复盘失败，洞察未保存，请重试。"),
          });
          setBusy(false);
          return;
        }
      }
      // ② 往该 review 添加洞察。
      try {
        await client.createReviewInsight({
          params: { reviewId },
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
        setInsightCount((c) => c + 1);
        setTitle("");
        setDescription("");
        setFeedback({
          tone: "success",
          text: "已保存到本次复盘，可在下方「复盘记录」查看",
        });
        router.refresh();
      } catch (err) {
        setFeedback({
          tone: "error",
          text: describeUserError(err, "添加洞察失败，请重试。"),
        });
      } finally {
        setBusy(false);
      }
    })();
  }, [wiring, busy, activeReviewId, projectId, insightType, title, description, router]);

  // 完成门:有进行中 review 且(本会话 ≥1 洞察 或 接管的服务端进行中复盘)。
  const canComplete =
    Boolean(wiring) &&
    activeReviewId !== null &&
    (insightCount > 0 || resumedReview);
  const completeHint = !wiring
    ? null // 无 wiring 的原因统一显示在面板底部,不重复
    : activeReviewId === null
      ? "添加第 1 条洞察后会自动创建本次复盘，随后可完成"
      : !canComplete
        ? "需先添加至少 1 条洞察才能完成复盘"
        : null;

  const completeReview = React.useCallback(() => {
    if (!wiring || busy || !canComplete || !activeReviewId) return;
    setBusy(true);
    setFeedback(null);
    void (async () => {
      try {
        await client.completeReview({
          params: { reviewId: activeReviewId },
          query: undefined,
          body: undefined,
        });
        setActiveReviewId(null);
        setInsightCount(0);
        setFeedback({
          tone: "success",
          text: "复盘已完成；需要沉淀经验时，可点上方「帮我复盘」",
        });
        router.refresh();
      } catch (err) {
        setFeedback({ tone: "error", text: describeUserError(err, "完成复盘失败，请重试。") });
      } finally {
        setBusy(false);
      }
    })();
  }, [wiring, activeReviewId, router, busy, canComplete]);

  return (
    <article
      data-slot="review-authoring-panel"
      data-active-review={activeReviewId ?? ""}
      aria-label="复盘编辑"
      className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-card-gap shadow-card"
    >
      <header className="flex flex-col gap-1">
        <h3 className="text-md font-semibold text-foreground">复盘编辑</h3>
        <p className="text-xs text-muted-foreground">
          {resumedReview
            ? "继续进行中的复盘：记录洞察，随时完成"
            : "直接记录洞察（首次添加自动创建复盘），随时完成"}
        </p>
      </header>
      <p
        data-slot="review-storage-note"
        className="rounded-lg border border-brand/15 bg-brand-soft/25 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground"
      >
        手动洞察保存在本次复盘记录，不会直接进入知识库。完成后可点上方「帮我复盘」提炼经验，采纳后进入知识库。
      </p>

      <div data-slot="add-insight-form" className="flex flex-col gap-1.5">
        <select
          data-slot="insight-type-select"
          value={insightType}
          disabled={!wiring}
          onChange={(e) => setInsightType(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground disabled:opacity-50"
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
          disabled={!wiring}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="洞察标题"
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground disabled:opacity-50"
        />
        <input
          data-slot="insight-description-input"
          value={description}
          disabled={!wiring}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="补充说明（可选）"
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground disabled:opacity-50"
        />
        <button
          type="button"
          data-slot="add-insight-button"
          disabled={!wiring || busy}
          title={noWiringReason ?? undefined}
          onClick={addInsight}
          className="inline-flex h-8 items-center justify-center rounded-md border border-brand/60 bg-brand-soft px-3 text-xs font-medium text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "保存中…" : "添加洞察"}
        </button>
      </div>

      <button
        type="button"
        data-slot="complete-review-button"
        disabled={!wiring || busy || !canComplete}
        title={noWiringReason ?? completeHint ?? undefined}
        onClick={completeReview}
        className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        完成复盘
      </button>
      {/* [T-329] 完成门禁用原因明示(有 wiring 时;无 wiring 的原因见底部统一段)。 */}
      {completeHint ? (
        <p
          data-slot="complete-review-hint"
          className="text-[11px] text-muted-foreground"
        >
          {completeHint}
        </p>
      ) : null}

      {/* [T-329] 无登录会话:禁用 + 明示原因(绝不静默 no-op)。 */}
      {noWiringReason ? (
        <p
          data-slot="review-authoring-no-wiring"
          role="status"
          className="rounded-md border border-dashed border-border bg-surface-subtle px-2 py-1.5 text-[11px] text-muted-foreground"
        >
          {noWiringReason}
        </p>
      ) : null}

      {/* [T-209] 可见反馈:添加/完成的结果内联回显(成功绿 / 失败红),消除「假按钮」观感。 */}
      {feedback ? (
        <p
          data-slot="review-authoring-feedback"
          data-tone={feedback.tone}
          role="status"
          aria-live="polite"
          className={
            "text-[11px] " +
            (feedback.tone === "success" ? "text-success" : "text-destructive")
          }
        >
          {feedback.text}
        </p>
      ) : null}

      {/* [T-116b] 纯装饰按钮「添加发布 / 生成复盘报告」(经验沉淀飞轮未接通)已删除。 */}
    </article>
  );
}
