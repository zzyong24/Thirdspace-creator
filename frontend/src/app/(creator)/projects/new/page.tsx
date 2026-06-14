/**
 * Page entry for `/projects/new`.
 *
 * The reference design (`ui/New Project.png`) shows the New Project
 * modal layered over the Dashboard page — i.e. the user navigated
 * to `/projects/new` from the Dashboard. To reproduce that visual
 * on a direct visit (paste / refresh) we mount the Dashboard
 * alongside the NewProjectDialog. The `(creator)/layout.tsx`
 * already provides the AppShell + TopHeader; we do not nest
 * another shell here.
 *
 * The page is a Server Component; `NewProjectDialog` is a Client
 * island whose `onCreate` / `onCancel` callbacks are wired inside
 * the dialog boundary.
 */

import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { NewProjectDialog } from "@/components/overlays/new-project-dialog";

export default function NewProjectPage() {
  return (
    <>
      <DashboardPage />
      <NewProjectDialog />
    </>
  );
}
