/**
 * Experience Center route entry. Delegates rendering to the page
 * implementation in `@/features/experience/experience-page.tsx`. The
 * shared `AppShell`, `Sidebar` and `TopHeader` are mounted by
 * `(creator)/layout.tsx` once for the whole route group — this file
 * does NOT render its own shell.
 *
 * Module 14 Step 5 server read: the route fetches the user's owned projects via the
 * REAL `projects.list` op (user-scoped pglite) so the records' 应用经验 control has a
 * real apply target. The deterministic experience ViewModel stays fixture-derived
 * (the records-source migration to `learnings.list` is a follow-on once the
 * experience VM shape is reconciled with `learningResource`); a resolution failure
 * degrades to an empty target list (apply control hidden) so the page never crashes.
 */

import { ExperiencePage } from "@/features/experience/experience-page";
import type { ApplyTarget } from "@/features/experience/experience-page";
import { client } from "@/lib/contract-client.server";

interface ProjectListItemDto {
  readonly id: string;
  readonly title: string;
}

async function resolveApplyTargets(): Promise<ReadonlyArray<ApplyTarget>> {
  try {
    const projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 50 },
      body: undefined,
    })) as unknown as ReadonlyArray<ProjectListItemDto>;
    return projects.map((p) => ({ id: p.id, title: p.title }));
  } catch {
    return [];
  }
}

export default async function ExperienceRoute() {
  const applyTargets = await resolveApplyTargets();
  return <ExperiencePage applyTargets={applyTargets} />;
}
