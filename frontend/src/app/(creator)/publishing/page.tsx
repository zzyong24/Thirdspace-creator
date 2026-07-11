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

export default async function PublishingCenterRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ hidden?: string }>;
}) {
  const session = await resolveSession();
  // [T-033] 「显示已隐藏作品」开关:URL ?hidden=1 显私密 + 未通过;默认过滤。
  const sp = await searchParams;
  const includeHidden = sp.hidden === "1";

  if (!session) {
    // No session (the (creator) layout guard redirects on a real request).
    return <PublishingCenterPage />;
  }

  // Bind the read assembly to the request's session ctx so the projects /
  // outputs / publications reads stay user-scoped. [T-231⑤] Any read failure
  // degrades inside the helper to an honest error VM (the page renders
  // ErrorState; no fixture masking, and the page never throws).
  const client = createServerClient(
    session.ctx,
  ) as unknown as PublishingCenterDataClient;
  const viewModel = await buildPublishingCenterViewModelReal(client, {
    includeHidden,
  });
  return <PublishingCenterPage viewModel={viewModel} />;
}
