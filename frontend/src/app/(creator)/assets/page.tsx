/**
 * Assets Center route entrypoint.
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader)
 * and the global Header is configured for `/assets` with the approved
 * `storage` contextual-card variant in `shell-router.tsx` (D-003). The
 * page itself is a Server Component (page-specs §12) and just provides
 * the page slot.
 */
import { AssetsPage } from "@/features/assets/assets-page";

export default function AssetsRoutePage() {
  return <AssetsPage />;
}