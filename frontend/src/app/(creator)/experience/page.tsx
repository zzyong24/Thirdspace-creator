/**
 * Experience Center route entry. Delegates rendering to the page
 * implementation in `@/features/experience/experience-page.tsx`. The
 * shared `AppShell`, `Sidebar` and `TopHeader` are mounted by
 * `(creator)/layout.tsx` once for the whole route group — this file
 * does NOT render its own shell.
 */

import { ExperiencePage } from "@/features/experience/experience-page";

export default function ExperienceRoute() {
  return <ExperiencePage />;
}