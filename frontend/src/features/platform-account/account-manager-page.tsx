/**
 * 账号管理 / 矩阵号 page (七步⑤ · §7.1) — the account registry surface that promotes
 * 多账号矩阵 from a free-text `account_reference` string to a first-class, user-scoped
 * entity. Supplies the account dimension that lets every Publication / metric 归到一个
 * 真实账号 (spec §9 ⑤「哪个账号断更了」, answered together with the calendar sibling).
 *
 * Session-scoped server read for accounts and platform capability status. The
 * route supplies createServerClient(session.ctx); tests may supply a viewModel.
 * There is no canonical-user fallback when the session is absent.
 *
 * Determinism (C-5): no Date.now / Math.random / fetch in the render or selectors.
 * `/accounts` is annotated "暂不纳入视觉门禁" until stage-12 re-baseline.
 */

import { AccountManagerView } from "./account-manager-view";
import type { createServerClient } from "@/lib/contract-client.server";
import type { PlatformAccountResource } from "@creatoros/backend/modules/platform-account";
import type { PlatformCapabilityState } from "@creatoros/contract";

/**
 * Structural seam for the server read. The route passes a session-scoped
 * `createServerClient(ctx)` so account reads always stay user-scoped.
 */
export type AccountManagerReadClient = Pick<ReturnType<typeof createServerClient>, "listAccounts" | "listCapabilities">;

export interface AccountManagerViewModel {
  readonly accounts: PlatformAccountResource[];
  readonly capabilities?: PlatformCapabilityState[];
  readonly capabilitiesError?: boolean;
  readonly selectedAccountId?: string | null;
}

export interface AccountManagerPageProps {
  /** Override hook for tests; defaults to the server reads. */
  readonly viewModel?: AccountManagerViewModel;
  /**
   * Session-scoped contract client for the production read path. The route
   * passes `createServerClient(session.ctx)`. A viewModel can be supplied by tests.
   */
  readonly client?: AccountManagerReadClient;
  readonly selectedAccountId?: string | null;
}

export async function AccountManagerPage({
  viewModel,
  client,
  selectedAccountId = null,
}: AccountManagerPageProps) {
  if (viewModel) return <AccountManagerView viewModel={viewModel} />;
  if (!client) throw new Error("账号读取需要当前会话");
  return <AccountManagerView viewModel={await loadViewModel(client, selectedAccountId)} />;
}

async function loadViewModel(
  client: AccountManagerReadClient,
  selectedAccountId: string | null,
): Promise<AccountManagerViewModel> {
  const [accounts, capabilityResult] = await Promise.all([
    client.listAccounts({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    }) as unknown as Promise<PlatformAccountResource[]>,
    client.listCapabilities({ params: undefined, query: undefined, body: undefined })
      .then((response) => ({ items: response.items, failed: false }))
      .catch(() => ({ items: [] as PlatformCapabilityState[], failed: true })),
  ]);
  return {
    accounts,
    capabilities: capabilityResult.items,
    capabilitiesError: capabilityResult.failed,
    selectedAccountId,
  };
}
