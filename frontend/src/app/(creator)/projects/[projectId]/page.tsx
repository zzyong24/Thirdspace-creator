/**
 * Project Overview route (Task 12 / "工作台读侧做真").
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
 * The slug is resolved against the REAL persisted project list
 * (`projects.list`) so the feature module can stay agnostic.
 *
 * The page view model is composed SERVER-SIDE from the REAL contract ops
 * (`projects.get` + `projects.outputs.list` + `projects.activity.list`),
 * assembled in `project-overview-workspace-data.ts` (mirrors the Research
 * template). Reads run through the session ctx so they stay user-scoped and a
 * cross-user / unknown project 404s (notFound). Sections with no read path yet
 * compose to empty for real projects so the cards render their empty state. A
 * resolution failure degrades to the feature's own default render so SSR never
 * crashes.
 */

import { notFound } from "next/navigation";

import { ProjectOverviewPage } from "@/features/project-overview/project-overview-page";
import {
  buildProjectOverviewWorkspaceViewModel,
  isOwnershipError,
  type ProjectOverviewDataClient,
} from "@/features/project-overview/project-overview-workspace-data";
import { resolveSession } from "@/lib/session.server";
import { createServerClient, client } from "@/lib/contract-client.server";
import type { ProjectOverviewViewModel } from "@/types/view-models";

interface ProjectOverviewRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

export default async function ProjectOverviewRoute({
  params,
}: ProjectOverviewRouteProps) {
  const { projectId } = await params;
  const resolvedId = await resolveProjectIdParam(projectId);

  // Wave-4 server-read switch: read through the session ctx so a cross-user /
  // unknown project raises OwnershipError → 404, never a leaked page
  // (foundation §2; SPEC §20). With no session (SSR fallback / tests) the
  // feature renders its own default so SSR never crashes.
  const session = await resolveSession();
  if (!session) {
    return <ProjectOverviewPage projectId={resolvedId} />;
  }

  const scoped = createServerClient(session.ctx);
  let viewModel: ProjectOverviewViewModel | undefined;
  try {
    viewModel = await buildProjectOverviewWorkspaceViewModel(
      resolvedId,
      scoped as unknown as ProjectOverviewDataClient,
    );
  } catch (err) {
    if (isOwnershipError(err)) notFound();
    // Any other read failure degrades to the feature's default render.
    viewModel = undefined;
  }

  return <ProjectOverviewPage projectId={resolvedId} viewModel={viewModel} />;
}

/**
 * Resolve the URL `[projectId]` segment to a canonical project id against the
 * REAL persisted project list (`projects.list`).
 *
 * - If `param` matches a known canonical id, return it unchanged.
 * - Otherwise, look for a project whose kebab-cased title equals `param`
 *   (e.g. `AI Native Browser 深度解析` → `ai-native-browser`).
 * - If no project matches (or the read fails), return the original param so the
 *   page renders its "未找到项目" empty state instead of crashing.
 */
async function resolveProjectIdParam(param: string): Promise<string> {
  if (!param) return param;
  try {
    const projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as ReadonlyArray<{ id: string; title: string }>;
    if (projects.some((project) => project.id === param)) {
      return param;
    }
    const slug = param.toLowerCase();
    const match = projects.find(
      (project) => slugifyTitle(project.title) === slug,
    );
    return match?.id ?? param;
  } catch {
    return param;
  }
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
