"use client";

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
 * The page is a Client Component because the dialog composes the
 * `NewProjectForm` whose `onCreate` / `onCancel` props are
 * functions that cannot be serialised across the server/client
 * boundary.
 */

import * as React from "react";

import { NewProjectDialog } from "@/components/overlays/new-project-dialog";
import { DashboardPage } from "@/features/dashboard/dashboard-page";

export default function NewProjectPage() {
  return (
    <>
      <DashboardPage />
      <NewProjectDialog />
    </>
  );
}
