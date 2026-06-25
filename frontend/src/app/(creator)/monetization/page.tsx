/**
 * 变现 / 漏斗中心 route entrypoint (七步⑦ · SPEC §4.7).
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader) and the
 * global Header is configured for `/monetization` in `shell-router.tsx`. The page
 * itself is a Server Component that renders the monetization feature shell, which
 * reads products.list + monetization.funnel.get + leads.list (real SQL via the
 * composite transport).
 *
 * Session-scoped read (lane center-pages): the route resolves the request's
 * session and constructs `createServerClient(session.ctx)` so the reads are scoped
 * to the logged-in user — a brand-new empty account reads empty, not the
 * user-zyongzhu seed. With no session the fixture-composed fallback (the feature's
 * own singleton seam) renders so SSR/tests never crash.
 */
import { MonetizationCenterPage } from "@/features/monetization/monetization-center-page";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

export default async function MonetizationRoutePage() {
  const session = await resolveSession();
  if (!session) {
    return <MonetizationCenterPage />;
  }
  return <MonetizationCenterPage client={createServerClient(session.ctx)} />;
}
