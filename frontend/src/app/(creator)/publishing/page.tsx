/**
 * Publishing Center route entrypoint.
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader) and the
 * global Header is configured for `/publishing` with title "发布中心", description
 * "已发布内容、表现与排期" and the approved `assistant` contextual-card variant in
 * `shell-router.tsx` (D-003, page-specs §13). The page is a Server Component.
 *
 * READ side made real ("发布中心读侧做真"): the publication table is assembled from
 * the user's REAL publications by walking `projects.list` → `projects.outputs.list`
 * → `outputs.publications.list` (see `publishing-center-data.ts`). A 一稿多平台
 * fan-out — one output published to N platforms — surfaces N rows here. The
 * analytics rail (PublishingMetrics / PlatformComparisonChart / TrendChart /
 * TopContentList) aggregates the same REAL snapshots.
 *
 * The assembly is bound to the request session's `ctx` so reads stay user-scoped.
 * [T-231⑤] 诚实降级:读失败 → 错误态 VM(页面渲 ErrorState,不再回退 fixture 假数据);
 * 零条真实发布 → 诚实空态(publications:[],页面渲 EmptyState)。
 */
import { PublishingCenterPage } from "@/features/publishing-center/publishing-center-page";
import { ContentCalendarView } from "@/features/content-calendar/content-calendar-view";
import { ErrorState } from "@/components/state/page-state";
import { resolveSession } from "@/lib/session.server";
import { ZeroAccountGuidance } from "@/components/shell/zero-account-guidance";
import { getPublishingScheduleProjection } from "@/server/persistence-client";

export default async function PublishingCenterRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ hidden?: string; month?: string }>;
}) {
  const session = await resolveSession();
  // T-595：旧 hidden URL 参数只做兼容吞掉，不参与下游筛选。
  const params = await searchParams;

  if (!session) {
    // No session (the (creator) layout guard redirects on a real request).
    return <PublishingCenterPage />;
  }

  // [T-353] 未选号(含 0 号)= 引导态(T-332 §4.2):本页 per-account 读会撞 S2 strict 门
  // (AccountRequiredError → 整页错误边界)。layout 的零账号守卫只在首次渲染判定(App Router
  // 客户端导航不重渲 layout),故页面自兜:ctx 无选中号 → 渲绑定引导,不发注定失败的读。
  if (!session.ctx.groupId && !session.ctx.accountId) {
    return <ZeroAccountGuidance />;
  }

  const projection = await getPublishingScheduleProjection(
    session.ctx,
    params.month,
  );
  const calendar =
    projection.calendar.state === "ready" ? (
      <ContentCalendarView key={session.ctx.groupId ?? session.ctx.accountId} viewModel={projection.calendar.viewModel} />
    ) : (
      <ErrorState
        error={{
          code: "calendar_unavailable",
          message: "内容日历暂时不可用，请稍后重试。",
        }}
      />
    );
  return (
    <PublishingCenterPage
      viewModel={projection.performance}
      calendar={calendar}
    />
  );
}
