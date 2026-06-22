/**
 * Assets Center route entrypoint.
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader)
 * and the global Header is configured for `/assets` with the approved
 * `storage` contextual-card variant in `shell-router.tsx` (D-003). The
 * page itself is a Server Component (page-specs §12) and just provides
 * the page slot.
 *
 * Plan D1: the gallery is now a REAL library. The URL search params drive the
 * server read:
 *   - `?page=` / `?pageSize=` → the real `assets.list` paging query.
 *   - `?type=` → asset-type filter (applied over the page; the list op has no
 *     server-side type param — see assets-page.tsx note).
 *   - `?q=` → name/description/tag substring filter (same client-over-page
 *     caveat).
 */
import { AssetsPage } from "@/features/assets/assets-page";

interface AssetsRoutePageProps {
  readonly searchParams?: Promise<
    Record<string, string | string[] | undefined>
  >;
}

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AssetsRoutePage({
  searchParams,
}: AssetsRoutePageProps) {
  const params = (await searchParams) ?? {};
  return (
    <AssetsPage
      type={firstParam(params.type)}
      q={firstParam(params.q)}
      page={firstParam(params.page)}
      pageSize={firstParam(params.pageSize)}
    />
  );
}
