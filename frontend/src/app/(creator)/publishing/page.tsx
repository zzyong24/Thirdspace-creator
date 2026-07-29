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
import type { PublishingCenterDataClient } from "@/features/publishing-center/publishing-center-data";
import { buildPublishingCenterViewModelReal } from "@/features/publishing-center/publishing-center-data";
import { resolveSession } from "@/lib/session.server";
import { createServerClient } from "@/lib/contract-client.server";
import { ZeroAccountGuidance } from "@/components/shell/zero-account-guidance";

export default async function PublishingCenterRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ hidden?: string }>;
}) {
  const session = await resolveSession();
  // T-595：旧 hidden URL 参数只做兼容吞掉，不参与下游筛选。
  await searchParams;

  if (!session) {
    // No session (the (creator) layout guard redirects on a real request).
    return <PublishingCenterPage />;
  }

  // [T-353] 未选号(含 0 号)= 引导态(T-332 §4.2):本页 per-account 读会撞 S2 strict 门
  // (AccountRequiredError → 整页错误边界)。layout 的零账号守卫只在首次渲染判定(App Router
  // 客户端导航不重渲 layout),故页面自兜:ctx 无选中号 → 渲绑定引导,不发注定失败的读。
  if (!session.ctx.accountId) {
    return <ZeroAccountGuidance />;
  }

  // Bind the read assembly to the request's session ctx so the projects /
  // outputs / publications reads stay user-scoped. [T-231⑤] Any read failure
  // degrades inside the helper to an honest error VM (the page renders
  // ErrorState; no fixture masking, and the page never throws).
  const client = createServerClient(
    session.ctx,
  ) as unknown as PublishingCenterDataClient;
  const viewModel = await buildPublishingCenterViewModelReal(client);
  return <PublishingCenterPage viewModel={viewModel} />;
}
