/**
 * `projects/[projectId]` segment layout (T-039b item②) —— the ONE place in the project
 * route subtree that can read the `[projectId]` param on the server AND wraps every
 * project page (overview + all stage subpages: research/planning/script/production/
 * publishing/review). It reads the REAL project identity ({id, title}) and lifts it to a
 * client context (CurrentProjectProvider) so the shell's ShellRouter (a client island whose
 * `resolveRoute` only knows the fixture dataset) can show the REAL project title in the top
 * header + the left-bottom sidebar indicator instead of the neutral「当前项目」.
 *
 * Why here (not the (creator) layout): Next.js nested layouts do NOT receive child dynamic
 * segments, so `(creator)/layout.tsx` cannot read `projectId`. This nested layout DOES get
 * it (`params.projectId`). It reads the real title via the SAME read path the page uses
 * (projects.list, for canonical-id OR title-slug resolution) — reusing an existing read op,
 * no new repo method.
 *
 * Honesty / resilience: no session (SSR fallback / tests), an unknown project, or any read
 * failure → the provider value is `null` → the shell degrades to its fixture / neutral
 * 「当前项目」 state (never a fabricated title). This layout NEVER 404s or blocks render — the
 * page itself owns the ownership 404 (its own `projects.get` read); the layout is best-effort
 * chrome only.
 */

import * as React from "react";

import { CurrentProjectProvider } from "../../current-project-context";
import { resolveSession } from "@/lib/session.server";
import { createServerClient } from "@/lib/contract-client.server";

interface ProjectIdLayoutProps {
  readonly children: React.ReactNode;
  readonly params: Promise<{ readonly projectId: string }>;
}

// Keep only ASCII letters/digits so a title like "AI Native Browser 深度解析" collapses to
// "ai-native-browser" (mirrors the page's slugifyTitle — the URL segment may be a slug).
function slugifyTitle(title: string): string {
  const asciiOnly = title.replace(/[^\x20-\x7E]/g, " ");
  return asciiOnly
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Resolve the URL [projectId] segment to the REAL {id, title} against the persisted project
// list (projects.list, user-scoped via the session ctx). Matches by canonical id first, then
// by title-slug. Returns null when nothing matches or the read fails (honest → neutral shell).
async function resolveRealProject(
  projectId: string,
): Promise<{ id: string; title: string } | null> {
  if (!projectId) return null;
  const session = await resolveSession();
  if (!session) return null;
  try {
    const projects = (await createServerClient(session.ctx).listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as ReadonlyArray<{ id: string; title: string }>;
    const byId = projects.find((p) => p.id === projectId);
    if (byId) return { id: byId.id, title: byId.title };
    const slug = projectId.toLowerCase();
    const bySlug = projects.find((p) => slugifyTitle(p.title) === slug);
    return bySlug ? { id: bySlug.id, title: bySlug.title } : null;
  } catch {
    return null;
  }
}

export default async function ProjectIdLayout({
  children,
  params,
}: ProjectIdLayoutProps) {
  const { projectId } = await params;
  const real = await resolveRealProject(projectId);

  return (
    <CurrentProjectProvider
      value={
        real
          ? { routeParam: projectId, projectId: real.id, title: real.title }
          : null
      }
    >
      {children}
    </CurrentProjectProvider>
  );
}
