/**
 * Assets Center route entrypoint.
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader)
 * and the global Header is configured for `/assets` with the approved
 * `storage` contextual-card variant in `shell-router.tsx` (D-003). The
 * page itself is a Server Component (page-specs §12) and just provides
 * the page slot.
 *
 * Plan D1: the gallery is a REAL library. The URL search params drive the
 * read:
 *   - `?page=` / `?pageSize=` → the real `assets.list` paging query.
 *   - `?type=` → asset-type filter (applied over the page; the list op has no
 *     server-side type param — see assets-page.tsx note).
 *   - `?q=` → name/description/tag substring filter (same client-over-page
 *     caveat).
 *
 * Tri-state (GAP-AST-tristate): the route resolves the request session and
 * builds the REAL VM with a session-SCOPED contract client, so a logged-in user
 * reads THEIR OWN `ctx.userId` assets — a fresh empty account reads empty (its
 * own 空态), NOT the canonical user-zyongzhu seed. A read FAILURE surfaces as an
 * error state (no fabricated fixture VM). The no-session branch keeps the
 * fixture seam (`<AssetsPage />` builds via the singleton) for SSR/tests; the
 * (creator) layout guard already redirects unauthenticated real requests.
 */
import { AssetsPage } from "@/features/assets/assets-page";
import type { AssetsDataClient } from "@/features/assets/assets-data";
import { buildAssetsViewModelReal } from "@/features/assets/assets-data";
import { resolveSession } from "@/lib/session.server";
import { createServerClient } from "@/lib/contract-client.server";
import { ZeroAccountGuidance } from "@/components/shell/zero-account-guidance";

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
  const search = {
    type: firstParam(params.type),
    q: firstParam(params.q),
    page: firstParam(params.page),
    pageSize: firstParam(params.pageSize),
  };

  const session = await resolveSession();
  if (!session) {
    // No session (the (creator) layout guard redirects on a real request). Keep
    // the fixture seam: the page builds via the singleton client for SSR/tests.
    return <AssetsPage {...search} />;
  }

  // [T-353] 未选号(含 0 号)= 引导态(T-332 §4.2):本页 per-account 读会撞 S2 strict 门
  // (AccountRequiredError → 整页错误边界)。layout 的零账号守卫只在首次渲染判定(App Router
  // 客户端导航不重渲 layout),故页面自兜:ctx 无选中号 → 渲绑定引导,不发注定失败的读。
  if (!session.ctx.accountId) {
    return <ZeroAccountGuidance />;
  }

  // Bind the read to the request's session ctx so assets.list / projects.list /
  // assets.usage.list stay user-scoped (ctx.userId). A read failure returns the
  // error tri-state; a successful-but-empty read returns the honest 空态.
  const client = createServerClient(
    session.ctx,
  ) as unknown as AssetsDataClient;
  const real = await buildAssetsViewModelReal(client);
  return (
    <AssetsPage
      {...search}
      viewModel={real.viewModel}
      projects={real.projects.map((p) => ({ id: p.id, title: p.title }))}
      state={real.state}
      error={real.error}
    />
  );
}
