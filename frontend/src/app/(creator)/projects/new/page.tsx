"use client";

/**
 * Full-page fallback for `/projects/new`.
 *
 * This route handles direct visits and hard refreshes of `/projects/new`.
 * Navigation from inside CreatorOS intercepts the route in
 * `(creator)/@modal/(.)projects/new/page.tsx` and renders the modal
 * overlay instead.
 *
 * Both routes render the same `NewProjectForm` body (Task 11). The
 * difference is the chrome around the form:
 *  - intercepting route → mounted inside the dialog shell with a
 *    backdrop mask and focus trap (`NewProjectDialog`),
 *  - direct visit → mounted inside the shared `AppShell` with no mask,
 *    so the page reads as a normal CreatorOS page when the user
 *    refreshes or pastes the URL.
 *
 * The page is a Client Component because the form's `onCreate` /
 * `onCancel` props are functions that cannot be serialised across the
 * server/client boundary.
 */

import * as React from "react";

import { AppShell } from "@/components/shell/app-shell";
import { NewProjectForm } from "@/features/projects/new-project-form";

export default function NewProjectPage() {
  return (
    <AppShell pathname="/projects/new">
      <main
        data-app="creatoros"
        data-page="projects-new"
        className="mx-auto w-full max-w-2xl"
      >
        <h1 className="font-heading text-xl font-semibold text-foreground">
          新建项目
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          为新项目填写基础信息。后续可在工作区继续完善。
        </p>
        <div className="mt-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <NewProjectForm
            // Direct visits have no modal shell to close. The form is a
            // local-success transition only — on Create we reset the
            // form so the user can create a follow-up project, and on
            // Cancel we just reset to defaults.
            onCreate={() => {
              /* local success — no-op outside the overlay */
            }}
            onCancel={() => {
              /* local reset — no-op outside the overlay */
            }}
          />
        </div>
      </main>
    </AppShell>
  );
}
