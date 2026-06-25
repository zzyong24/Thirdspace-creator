/**
 * 账号管理 / 矩阵号 route entrypoint (七步⑤ · §7.1).
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader) and the
 * global Header is configured for `/accounts` in `shell-router.tsx`. The page itself is
 * a Server Component that renders the account-manager feature shell, which reads
 * `accounts.list` (real SQL via the composite transport).
 *
 * Session-scoped read (lane center-pages): the route resolves the request's
 * session and constructs `createServerClient(session.ctx)` so `accounts.list` is
 * scoped to the logged-in user — a brand-new empty account reads empty, not the
 * user-zyongzhu seed. With no session the singleton seam (the feature's own
 * default client) renders so SSR/tests never crash.
 *
 * Visual baseline: `/accounts` is "暂不纳入视觉门禁" until stage-12 re-baseline (C-5).
 */
import { AccountManagerPage } from "@/features/platform-account/account-manager-page";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

export default async function AccountsRoutePage() {
  const session = await resolveSession();
  if (!session) {
    return <AccountManagerPage />;
  }
  return <AccountManagerPage client={createServerClient(session.ctx)} />;
}
