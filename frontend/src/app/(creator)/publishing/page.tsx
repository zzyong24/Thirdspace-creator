/**
 * Publishing Center route entrypoint.
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader) and the
 * global Header is configured for `/publishing` with title "发布中心", description
 * "已发布内容、表现与排期" and the approved `assistant` contextual-card variant in
 * `shell-router.tsx` (D-003, page-specs §13). The page is a Server Component.
 *
 * Wave-4 server-read switch (module Q, decision (a)): `publishingCenterPage` has NO
 * dispatch endpoint (SPEC §13 has no read path), so the page composes it
 * SERVER-SIDE via `PublishingCenterQueryService.getPublishingCenter(ctx)` —
 * touching no repository, only public services. The composed DTO is adapted into
 * the page's rich view model. While the canonical Publishing seed is empty (open
 * question #3), the composer yields no rows; we preserve the existing fixture
 * baseline by falling back to the page's `buildPublishingCenterViewModel()` default
 * when the composition is empty, and feed the composed rows the moment they exist.
 */
import { PublishingCenterPage } from "@/features/publishing-center/publishing-center-page";
import { publishingCenterPageToViewModel } from "@/features/publishing-center/publishing-center-view-model";
import { resolveSession } from "@/lib/session.server";
import { getPublishingCenterService } from "@/server/persistence-client";

export default async function PublishingCenterRoutePage() {
  const session = await resolveSession();
  if (!session) {
    // No session (the (creator) layout guard redirects on a real request).
    return <PublishingCenterPage />;
  }

  const composer = await getPublishingCenterService();
  const page = await composer.getPublishingCenter(session.ctx);

  // Empty composition (the seed has no publications yet) → keep the fixture
  // baseline so the visual page does not regress to an empty table.
  if (page.rows.length === 0) {
    return <PublishingCenterPage />;
  }

  const viewModel = publishingCenterPageToViewModel(page);
  return <PublishingCenterPage viewModel={viewModel} />;
}
