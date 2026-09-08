/**
 * 选题候选池 route entrypoint (七步③ · SPEC §5.5).
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader) and the
 * global Header is configured for `/topics` in `shell-router.tsx`. The page itself is
 * a Server Component that renders the 选题中心 feature shell (选题中心大改 · Slice 2 三栏),
 * which reads candidates.list (sorted) + topics.overview (出题依据 + 7 来源 + 6 态漏斗, real
 * SQL via the composite transport). The `?sort=` URL state selects the candidate sort.
 *
 * Session-scoped read (lane center-pages): the route resolves the request's
 * session and constructs `createServerClient(session.ctx)` so candidates / audience
 * signals are scoped to the logged-in user — a brand-new empty account reads empty,
 * not the user-zyongzhu seed. With no session the fixture-composed fallback (the
 * feature's singleton seam) renders so SSR/tests never crash.
 */
import { TopicsPage } from "@/features/topics/topics-page";
import type { CandidateSortKey } from "@/features/topics/topics-interactive-region";
import { createCachedPageClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";
import { ZeroAccountGuidance } from "@/components/shell/zero-account-guidance";

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
  // [T-244] `?source=` 按来源过滤候选池(左栏来源行可点);白名单校验在 TopicsPage 内。
  const rawSource = params.source;
  const source = Array.isArray(rawSource) ? rawSource[0] : rawSource;

  const session = await resolveSession();
  if (!session) {
    return <TopicsPage sort={sortKey} source={source} />;
  }

  // [T-353] 未选号(含 0 号)= 引导态(T-332 §4.2):本页 per-account 读会撞 S2 strict 门
  // (AccountRequiredError → 整页错误边界)。layout 的零账号守卫只在首次渲染判定(App Router
  // 客户端导航不重渲 layout),故页面自兜:ctx 无选中号 → 渲绑定引导,不发注定失败的读。
  if (!session.ctx.accountId) {
    return <ZeroAccountGuidance />;
  }
  return (
    <TopicsPage
      sort={sortKey}
      source={source}
      client={createCachedPageClient(session.ctx)}
    />
  );
}
