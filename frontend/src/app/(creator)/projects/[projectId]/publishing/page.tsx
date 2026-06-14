/**
 * Publishing Workspace route (Task 17).
 *
 * `/projects/[projectId]/publishing` renders the project-workspace
 * Header mode page for the Publishing stage (page-specs §9). The route
 * lives inside the `(creator)` segment so the shared AppShell (one
 * Sidebar + one TopHeader in `project-workspace` mode, with the
 * Publishing stage active) wraps it; the page itself is a Server
 * Component.
 *
 * The URL `[projectId]` segment may carry either:
 *   1. A canonical project id (e.g. `project-ainativebrowser`), or
 *   2. A kebab-cased slug derived from the project title
 *      (e.g. `ai-native-browser`).
 * The visual route fixture (`tests/fixtures/routes.ts`) uses the slug
 * form. We resolve the slug to the canonical id here so the feature
 * module can stay agnostic.
 */

import { PublishingWorkspacePage } from "@/features/project-publishing/publishing-workspace-page";
import { listProjects } from "@/fixtures/canonical";

interface PublishingWorkspaceRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

export default async function PublishingWorkspaceRoute({
  params,
}: PublishingWorkspaceRouteProps) {
  const { projectId } = await params;
  const resolvedId = resolveProjectIdParam(projectId);
  return <PublishingWorkspacePage projectId={resolvedId} />;
}

/**
 * Resolve the URL `[projectId]` segment to a canonical project id.
 *
 * Mirrors the resolver in `app/(creator)/projects/[projectId]/page.tsx`
 * so a slug like `ai-native-browser` collapses to the canonical
 * `project-ainativebrowser` before the feature renders. If no project
 * matches, the original param is passed through so the page surfaces
 * the "未找到项目" empty state instead of crashing.
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
