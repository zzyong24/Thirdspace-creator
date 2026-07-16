/**
 * Root CreatorOS page. Renders the Dashboard inside the shared (creator) layout,
 * which already provides the AppShell (one Sidebar + one TopHeader). The page
 * itself is a Server Component.
 *
 * Wave-4 server-read switch (module Q): the Dashboard's composed view model now
 * comes from `pages.dashboard.get` (the DashboardQueryService composes Projects +
 * Publishing + Analytics + Learnings + Notifications + Knowledge public services).
 * The page resolves the request's session ctx and passes the composed
 * `dashboardPage` DTO into `DashboardPage` as `viewModel`. The `viewModel?` seam is
 * preserved: with no session (SSR fallback / tests) `DashboardPage` falls back to
 * its internal `client.getDashboard()` default, so SSR never crashes.
 */

import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { zeroAccountDashboardViewModel } from "@/features/dashboard/zero-account-dashboard";
import { resolveSession } from "@/lib/session.server";
import { createServerClient } from "@/lib/contract-client.server";
import { isAccountRequiredError } from "@/lib/http-transport";
import type { DashboardViewModel } from "@/types/view-models";

export default async function Page() {
  const session = await resolveSession();
  if (!session) {
    // No session (the (creator) layout guard redirects on a real request).
    // Render the fixture-composed fallback so SSR never crashes.
    return <DashboardPage />;
  }

  // [T-348] 0 号(未绑号)首页现放行守卫(见 zero-account-guidance 白名单)→ 首页自己承接
  // 降级:pages.dashboard.get 是 per-account 读,0 号会抛 AccountRequiredError(S2 strict
  // 门)。捕获它 → 诚实空 dashboard(占位指标 + 各卡空态)+ 顶部 OnboardingCard 引导先绑号,
  // 绝不整页崩(T-344 全局守卫兜底把引导流一并切掉的回归,由此彻底修掉)。**其它错误照抛**
  // (不掩真故障 —— 只翻译「未绑号」这一种可预期的引导态)。
  let viewModel: DashboardViewModel;
  try {
    viewModel = await createServerClient(session.ctx).getDashboard({
      params: undefined,
      query: undefined,
      body: undefined,
    });
  } catch (err) {
    if (!isAccountRequiredError(err)) throw err;
    viewModel = zeroAccountDashboardViewModel();
  }

  // Greet the REAL account holder (identity.getCurrentUser via resolveSession),
  // the same source the Shell user card reads — not the fixture dataset. After
  // the T-135 identity 中性化 this renders「早上好, 创作者!」instead of the old
  // fixture "Zyong". The `greetingName` prop remains DashboardPage's test seam.
  return (
    <DashboardPage
      viewModel={viewModel}
      greetingName={session.user.displayName}
    />
  );
}
