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
import { resolveSession } from "@/lib/session.server";
import { createServerClient } from "@/lib/contract-client.server";

export default async function Page() {
  const session = await resolveSession();
  if (!session) {
    // No session (the (creator) layout guard redirects on a real request).
    // Render the fixture-composed fallback so SSR never crashes.
    return <DashboardPage />;
  }

  const viewModel = await createServerClient(session.ctx).getDashboard({
    params: undefined,
    query: undefined,
    body: undefined,
  });

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
