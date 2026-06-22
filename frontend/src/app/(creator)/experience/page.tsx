/**
 * Experience Center route entry. Delegates rendering to the page
 * implementation in `@/features/experience/experience-page.tsx`. The
 * shared `AppShell`, `Sidebar` and `TopHeader` are mounted by
 * `(creator)/layout.tsx` once for the whole route group — this file
 * does NOT render its own shell.
 *
 * Module 14 Step 5 server read: the route fetches the user's owned projects via the
 * REAL `projects.list` op (user-scoped pglite) so the records' 应用经验 control has a
 * real apply target; a resolution failure degrades to an empty target list (apply
 * control hidden) so the page never crashes.
 *
 * 读侧做真: the experience ViewModel is now assembled from the REAL `learnings.list`
 * op (`buildExperienceWorkspaceViewModel`) so the 记录表 / 最近发现 rows map to real
 * Learnings (carrying the real `learningId` + `validationStatus`, so 应用经验 / 验证 /
 * 废弃 hit a real Learning) and the 4 summary cards count real learnings. The helper
 * degrades to the fixture VM on any read failure, and renders an honest empty state
 * (not fixture rows) when the read succeeds with zero learnings.
 */

import { ExperiencePage } from "@/features/experience/experience-page";
import type { ApplyTarget } from "@/features/experience/experience-page";
import { buildExperienceWorkspaceViewModel } from "@/features/experience/experience-data";
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
  const [applyTargets, viewModel] = await Promise.all([
    resolveApplyTargets(),
    buildExperienceWorkspaceViewModel(),
  ]);
  return <ExperiencePage viewModel={viewModel} applyTargets={applyTargets} />;
}
