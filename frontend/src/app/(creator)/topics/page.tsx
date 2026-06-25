/**
 * 选题候选池 route entrypoint (七步③ · SPEC §5.5).
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader) and the
 * global Header is configured for `/topics` in `shell-router.tsx`. The page itself is
 * a Server Component that renders the 选题候选池 feature shell, which reads
 * candidates.list (sorted) + audienceSignals.list (real SQL via the composite
 * transport). The `?sort=` URL state selects the monetization-weighted sort.
 *
 * Session-scoped read (lane center-pages): the route resolves the request's
 * session and constructs `createServerClient(session.ctx)` so candidates / audience
 * signals are scoped to the logged-in user — a brand-new empty account reads empty,
 * not the user-zyongzhu seed. With no session the fixture-composed fallback (the
 * feature's singleton seam) renders so SSR/tests never crash.
 */
import { TopicsPage } from "@/features/topics/topics-page";
import type { CandidateSortKey } from "@/features/topics/topics-interactive-region";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

interface TopicsRoutePageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TopicsRoutePage({
  searchParams,
}: TopicsRoutePageProps) {
  const params = (await searchParams) ?? {};
  const rawSort = params.sort;
  const sort = Array.isArray(rawSort) ? rawSort[0] : rawSort;
  const sortKey = sort as CandidateSortKey | undefined;

  const session = await resolveSession();
  if (!session) {
    return <TopicsPage sort={sortKey} />;
  }
  return (
    <TopicsPage sort={sortKey} client={createServerClient(session.ctx)} />
  );
}
