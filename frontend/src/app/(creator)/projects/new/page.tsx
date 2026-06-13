/**
 * Full-page fallback for `/projects/new`.
 *
 * This route handles direct visits and hard refreshes of `/projects/new`.
 * Navigation from inside CreatorOS intercepts the route in
 * `(creator)/@modal/(.)projects/new/page.tsx` and renders the modal
 * overlay instead. The full New Project form is implemented in Task 11.
 */

import * as React from "react";

export default function NewProjectPage() {
  return (
    <main data-app="creatoros" data-page="projects-new">
      <h1 className="font-heading text-xl font-semibold text-foreground">
        新建项目
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        占位页面 — 完整的新建项目表单在后续任务中实现。
      </p>
    </main>
  );
}