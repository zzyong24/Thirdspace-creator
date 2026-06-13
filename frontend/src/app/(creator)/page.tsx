/**
 * Root CreatorOS page. Renders the Dashboard inside the shared
 * (creator) layout, which already provides the AppShell (one
 * Sidebar + one TopHeader). The page itself is a Server Component.
 */

import { DashboardPage } from "@/features/dashboard/dashboard-page";

export default function Page() {
  return <DashboardPage />;
}
