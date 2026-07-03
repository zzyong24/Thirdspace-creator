/**
 * Root CreatorOS page —— 今日台(T-063b)。Renders inside the shared (creator)
 * layout, which already provides the AppShell (one Sidebar + one TopHeader).
 *
 * 读侧:`buildTodayViewModel(createServerClient(session.ctx))` 装配行动队列 ——
 * 核心 `pages.dashboard.get` + 四个既有读 op(candidates/learnings/calibration
 * suggestions/audience signals),逐源降级、无新契约。无 session(SSR fallback /
 * tests)时 `DashboardPage` 走内部默认装配 seam(canonical ctx 单例),SSR 不崩。
 */

import { DashboardPage } from "@/features/dashboard/dashboard-page";
import {
  buildTodayViewModel,
  type TodayDataClient,
} from "@/features/dashboard/dashboard-data";
import { resolveSession } from "@/lib/session.server";
import { createServerClient } from "@/lib/contract-client.server";

export default async function Page() {
  const session = await resolveSession();
  if (!session) {
    // No session (the (creator) layout guard redirects on a real request).
    // Render the default-seam fallback so SSR never crashes.
    return <DashboardPage />;
  }

  const viewModel = await buildTodayViewModel(
    createServerClient(session.ctx) as unknown as TodayDataClient,
  );

  return <DashboardPage viewModel={viewModel} />;
}
