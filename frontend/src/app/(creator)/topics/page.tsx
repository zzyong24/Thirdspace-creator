/**
 * 选题候选池 route entrypoint (七步③ · SPEC §5.5).
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader) and the
 * global Header is configured for `/topics` in `shell-router.tsx`. The page itself is
 * a Server Component that renders the 选题候选池 feature shell, which reads
 * candidates.list (sorted) + audienceSignals.list (real SQL via the composite
 * transport). The `?sort=` URL state selects the monetization-weighted sort.
 */
import { TopicsPage } from "@/features/topics/topics-page";
import type { CandidateSortKey } from "@/features/topics/topics-interactive-region";

interface TopicsRoutePageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TopicsRoutePage({
  searchParams,
}: TopicsRoutePageProps) {
  const params = (await searchParams) ?? {};
  const rawSort = params.sort;
  const sort = Array.isArray(rawSort) ? rawSort[0] : rawSort;
  return <TopicsPage sort={sort as CandidateSortKey | undefined} />;
}
