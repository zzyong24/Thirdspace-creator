/**
 * 账号管理 / 矩阵号 route entrypoint (七步⑤ · §7.1).
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader) and the
 * global Header is configured for `/accounts` in `shell-router.tsx`. The page itself is
 * a Server Component that renders the account-manager feature shell, which reads
 * `accounts.list` (real SQL via the composite transport).
 *
 * Reads use the current session only; an absent session renders an error state.
 *
 * Visual baseline: `/accounts` is "暂不纳入视觉门禁" until stage-12 re-baseline (C-5).
 */
import { AccountManagerPage } from "@/features/platform-account/account-manager-page";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

export default async function AccountsRoutePage() {
  const session = await resolveSession();
  if (!session) {
    return <p role="alert" className="rounded-lg border border-danger/40 p-6 text-sm text-destructive">
      暂时无法读取账号。已有数据未受影响，请重启应用后重试。
    </p>;
  }
  return <AccountManagerPage client={createServerClient(session.ctx)} selectedAccountId={session.ctx.accountId} />;
}
