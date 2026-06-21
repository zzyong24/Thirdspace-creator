/**
 * Project Overview route (Task 12).
 *
 * `/projects/[projectId]` renders the project-overview Header mode page
 * (page-specs §4). The route lives inside the `(creator)` segment so the
 * shared AppShell (one Sidebar + one TopHeader in `project-overview`
 * mode) wraps it; the page itself is a Server Component.
 *
 * The URL `[projectId]` segment may carry either:
 *   1. A canonical project id (e.g. `project-ainativebrowser`), or
 *   2. A kebab-cased slug derived from the project title
 *      (e.g. `ai-native-browser`).
 * The visual route fixture (`tests/fixtures/routes.ts`) uses the slug
 * form. We resolve the slug to the canonical id here so the feature
 * module can stay agnostic.
 */

import { notFound } from "next/navigation";

import { ProjectOverviewPage } from "@/features/project-overview/project-overview-page";
import { listProjects } from "@/fixtures/canonical";
import { resolveSession } from "@/lib/session.server";
import { createServerClient } from "@/lib/contract-client.server";

interface ProjectOverviewRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

export default async function ProjectOverviewRoute({
  params,
}: ProjectOverviewRouteProps) {
  const { projectId } = await params;
  const resolvedId = resolveProjectIdParam(projectId);

  // Wave-4 server-read switch (module Q): gate the read through
  // `pages.projectOverview.get`. The ProjectOverviewQueryService threads the
  // session ctx into the Projects service, which raises OwnershipError for a
  // cross-user / unknown project — surfaced here as a 404 (notFound), never a
  // leaked page (foundation §2; SPEC §20). The composed gap sections are still
  // empty pending the upstream reads (open question #1), so the rich fixture VM
  // remains the render source for owned projects; the op call is the ownership
  // gate + the wiring seam for when those reads land.
  const session = await resolveSession();
  if (session) {
    try {
      await createServerClient(session.ctx).getProjectOverview({
        params: { projectId: resolvedId },
        query: undefined,
        body: undefined,
      });
    } catch (err) {
      if (isOwnershipError(err)) notFound();
      throw err;
    }
  }

  return <ProjectOverviewPage projectId={resolvedId} />;
}

/**
 * An OwnershipError surfaces from the dispatch transport with `code` set to the
 * contract `OwnershipError` code (→ HTTP 404 on the wire). The composed op is
 * called in-process here, so the thrown error carries that `.code`; match on it
 * structurally (no class import across the server-only boundary).
 */
function isOwnershipError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    /Ownership/i.test((err as { code: string }).code)
  );
}

/**
 * Resolve the URL `[projectId]` segment to a canonical project id.
 *
 * - If `param` matches a known canonical id (e.g. `project-ainativebrowser`),
 *   return it unchanged so existing callers (visual specs, deep links)
 *   continue to work.
 * - Otherwise, look for a project whose kebab-cased title equals `param`
 *   (e.g. `AI Native Browser 深度解析` → `ai-native-browser`).
 * - If no project matches, return the original param so the page renders
 *   its "未找到项目" empty state instead of crashing.
 */
function resolveProjectIdParam(param: string): string {
  if (!param) return param;
  const projects = listProjects();
  if (projects.some((project) => project.id === param)) {
    return param;
  }
  const slug = param.toLowerCase();
  const match = projects.find(
    (project) => slugifyTitle(project.title) === slug,
  );
  return match?.id ?? param;
}

function slugifyTitle(title: string): string {
  // Keep only ASCII letters/digits so a title like
  // "AI Native Browser 深度解析" collapses to "ai-native-browser"
  // (the trailing CJK segment is dropped, not retained as "-深度解析").
  const asciiOnly = title.replace(/[^\x20-\x7E]/g, " ");
  return asciiOnly
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
