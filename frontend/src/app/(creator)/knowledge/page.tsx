/**
 * Knowledge & Memory route entrypoint.
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader)
 * and the global Header is configured for `/knowledge` in
 * `shell-router.tsx`. The page itself is a Server Component
 * (page-specs §11, D-002) and just provides the page slot.
 */
import { KnowledgePage } from "@/features/knowledge/knowledge-page";

export default function KnowledgeRoutePage() {
  return <KnowledgePage />;
}
