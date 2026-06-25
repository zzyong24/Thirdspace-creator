/**
 * Projects index route. Renders the Projects page inside the shared
 * (creator) layout, which already provides the AppShell (one Sidebar +
 * one TopHeader). The page itself is a Server Component.
 *
 * Reads the `?page=` search param (1-based) and threads it into ProjectsPage,
 * which drops the canonical demo projects, sorts newest-first, and pages 10
 * works per screen.
 *
 * Session-scoped read (lane center-pages): the route resolves the request's
 * session and constructs `createServerClient(session.ctx)` so the projects list is
 * scoped to the logged-in user — a brand-new empty account reads its own (empty)
 * works, not the user-zyongzhu seed. With no session the fixture-composed fallback
 * (the feature's singleton seam) renders so SSR/tests never crash.
 */

import { ProjectsPage } from "@/features/projects/projects-page";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const raw = Array.isArray(params.page) ? params.page[0] : params.page;
  const parsed = Number(raw);
  const page = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;

  const session = await resolveSession();
  if (!session) {
    return <ProjectsPage page={page} />;
  }
  return <ProjectsPage page={page} client={createServerClient(session.ctx)} />;
}
