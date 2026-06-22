/**
 * Projects index route. Renders the Projects page inside the shared
 * (creator) layout, which already provides the AppShell (one Sidebar +
 * one TopHeader). The page itself is a Server Component.
 *
 * Reads the `?page=` search param (1-based) and threads it into ProjectsPage,
 * which drops the canonical demo projects, sorts newest-first, and pages 10
 * works per screen.
 */

import { ProjectsPage } from "@/features/projects/projects-page";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const raw = Array.isArray(params.page) ? params.page[0] : params.page;
  const parsed = Number(raw);
  const page = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
  return <ProjectsPage page={page} />;
}
