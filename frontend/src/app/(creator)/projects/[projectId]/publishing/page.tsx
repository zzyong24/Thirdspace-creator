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
 * The slug is resolved against the REAL persisted project list
 * (`projects.list`) so the feature module can stay agnostic.
 */

import { PublishingWorkspacePage } from "@/features/project-publishing/publishing-workspace-page";
import type { PublishingWiring } from "@/features/project-publishing/publishing-interactive-region";
import { client } from "@/lib/contract-client.server";

interface PublishingWorkspaceRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

// The project's primary ContentOutput — prefer a `*-main` output, else the first
// output owned by the project — read via the REAL `projects.outputs.list` op.
// Returns null when the project has no output.
async function resolvePrimaryOutputId(projectId: string): Promise<string | null> {
  try {
    const outputs = (await client.listOutputs({
      params: { projectId },
      query: undefined,
      body: undefined,
    })) as unknown as ReadonlyArray<{ id: string }>;
    if (outputs.length === 0) return null;
    const main = outputs.find((o) => o.id.endsWith("-main"));
    return (main ?? outputs[0]!).id;
  } catch {
    return null;
  }
}

// Module 10 Step 5 — resolve the publishing wiring server-side: map the project to
// its primary ContentOutput and read its existing publications via the REAL
// `outputs.publications.list` op (user-scoped pglite) into a platform→publicationId
// map. The 确认发布 / Title-input controls use it to drive their contract ops. A
// resolution failure degrades to no-wiring (the island renders local-only).
async function resolveWiring(
  resolvedId: string,
): Promise<PublishingWiring | undefined> {
  const outputId = await resolvePrimaryOutputId(resolvedId);
  if (outputId === null) return undefined;
  try {
    const list = (await client.listPublications({
      params: { outputId },
      query: { page: 1, pageSize: 50 },
      body: undefined,
    })) as unknown as ReadonlyArray<{ id: string; platform: string }>;
    const publications: Record<string, string> = {};
    for (const pub of list) {
      // Keep the newest per platform (the list is newest-first).
      if (!publications[pub.platform]) publications[pub.platform] = pub.id;
    }
    return { outputId, publications };
  } catch {
    return undefined;
  }
}

export default async function PublishingWorkspaceRoute({
  params,
}: PublishingWorkspaceRouteProps) {
  const { projectId } = await params;
  const resolvedId = await resolveProjectIdParam(projectId);
  const wiring = await resolveWiring(resolvedId);
  return <PublishingWorkspacePage projectId={resolvedId} wiring={wiring} />;
}

/**
 * Resolve the URL `[projectId]` segment to a canonical project id against the
 * REAL persisted project list (`projects.list`). Mirrors the resolver in
 * `app/(creator)/projects/[projectId]/page.tsx`: a slug like
 * `ai-native-browser` collapses to the canonical `project-ainativebrowser`
 * (matched on the kebab-cased project title) before the feature renders. If no
 * project matches (or the read fails), the original param is passed through so
 * the page surfaces the "未找到项目" empty state instead of crashing.
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
