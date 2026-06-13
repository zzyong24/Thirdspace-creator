/**
 * Publishing Center route entrypoint.
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader)
 * and the global Header is configured for `/publishing` with title
 * "发布中心", description "已发布内容、表现与排期" and the approved
 * `assistant` contextual-card variant in `shell-router.tsx`
 * (D-003, page-specs §13). The page itself is a Server Component
 * and just provides the page slot.
 */
import { PublishingCenterPage } from "@/features/publishing-center/publishing-center-page";

export default function PublishingCenterRoutePage() {
  return <PublishingCenterPage />;
}
