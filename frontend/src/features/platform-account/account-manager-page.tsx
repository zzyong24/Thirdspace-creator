/**
 * 账号管理 / 矩阵号 page (七步⑤ · §7.1) — the account registry surface that promotes
 * 多账号矩阵 from a free-text `account_reference` string to a first-class, user-scoped
 * entity. Supplies the account dimension that lets every Publication / metric 归到一个
 * 真实账号 (spec §9 ⑤「哪个账号断更了」, answered together with the calendar sibling).
 *
 * Server-component shell with a `viewModel?` test seam (mirrors monetization/
 * positioning). The default render reads `accounts.list` (real SQL via the composite
 * transport). The mutating controls (新增账号 / 编辑基线 / 归档) + the client-local
 * platform filter live in the client island `account-manager-interactive-region.tsx`
 * + the `AccountManagerView` filter state below, calling the mapped contract op then
 * `router.refresh()`.
 *
 * Session-scoped read (lane center-pages): the route resolves the request's
 * session and constructs `createServerClient(session.ctx)` so `accounts.list` is
 * scoped to the logged-in user — a brand-new empty account reads empty, not the
 * user-zyongzhu seed. With no session the singleton seam (canonical ctx) renders
 * so SSR/tests never crash.
 *
 * Determinism (C-5): no Date.now / Math.random / fetch in the render or selectors.
 * `/accounts` is annotated "暂不纳入视觉门禁" until stage-12 re-baseline.
 */

import { AccountManagerView } from "./account-manager-view";
import { client as defaultClient } from "@/lib/contract-client.server";
import type { PlatformAccountResource } from "@/server/modules/platform-account";

/**
 * Structural seam for the server read. The route passes a session-scoped
 * `createServerClient(ctx)` so `accounts.list` stays user-scoped; the default
 * keeps the singleton (canonical ctx) as the SSR/test fallback seam.
 */
export type AccountManagerReadClient = Pick<typeof defaultClient, "listAccounts">;

export interface AccountManagerViewModel {
  readonly accounts: PlatformAccountResource[];
}

export interface AccountManagerPageProps {
  /** Override hook for tests; defaults to the server reads. */
  readonly viewModel?: AccountManagerViewModel;
  /**
   * Session-scoped contract client for the production read path. The route
   * passes `createServerClient(session.ctx)`; defaults to the singleton seam so
   * SSR / direct render still resolves.
   */
  readonly client?: AccountManagerReadClient;
}

export async function AccountManagerPage({
  viewModel,
  client = defaultClient,
}: AccountManagerPageProps) {
  const vm = viewModel ?? (await loadViewModel(client));
  return <AccountManagerView viewModel={vm} />;
}

async function loadViewModel(
  client: AccountManagerReadClient,
): Promise<AccountManagerViewModel> {
  const accounts = (await client.listAccounts({
    params: undefined,
    query: { page: 1, pageSize: 100 },
    body: undefined,
  })) as unknown as PlatformAccountResource[];
  return { accounts };
}
