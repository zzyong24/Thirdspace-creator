/**
 * 账号管理 / 矩阵号 route entrypoint (七步⑤ · §7.1).
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader) and the
 * global Header is configured for `/accounts` in `shell-router.tsx`. The page itself is
 * a Server Component that renders the account-manager feature shell, which reads
 * `accounts.list` (real SQL via the composite transport).
 *
 * Visual baseline: `/accounts` is "暂不纳入视觉门禁" until stage-12 re-baseline (C-5).
 */
import { AccountManagerPage } from "@/features/platform-account/account-manager-page";

export default function AccountsRoutePage() {
  return <AccountManagerPage />;
}
