/**
 * Projects index route. Renders the Projects page inside the shared
 * (creator) layout, which already provides the AppShell (one Sidebar +
 * one TopHeader). The page itself is a Server Component.
 */

import { ProjectsPage } from "@/features/projects/projects-page";

export default function Page() {
  return <ProjectsPage />;
}