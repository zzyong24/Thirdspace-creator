/**
 * Intercepting route for `/projects/new` rendered inside the `@modal`
 * parallel slot.
 *
 * When a user navigates to `/projects/new` from anywhere inside CreatorOS
 * (e.g. the "New Project" link in the Projects page), the App Router
 * renders this route in the modal slot above the page content. Direct
 * visits and hard refreshes bypass the intercepting layer and render
 * the full-page fallback in `src/app/(creator)/projects/new/page.tsx`.
 *
 * The dialog content is a placeholder; the full New Project form is
 * implemented in Task 11.
 */

import { NewProjectDialog } from "@/components/overlays/new-project-dialog";

export default function InterceptedNewProjectPage() {
  return <NewProjectDialog />;
}