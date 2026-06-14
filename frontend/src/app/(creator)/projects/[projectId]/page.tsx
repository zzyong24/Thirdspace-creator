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

import { ProjectOverviewPage } from "@/features/project-overview/project-overview-page";
import { listProjects } from "@/fixtures/canonical";

interface ProjectOverviewRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

export default async function ProjectOverviewRoute({
  params,
}: ProjectOverviewRouteProps) {
  const { projectId } = await params;
  const resolvedId = resolveProjectIdParam(projectId);
  return <ProjectOverviewPage projectId={resolvedId} />;
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
