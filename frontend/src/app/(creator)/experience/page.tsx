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
 *
 * Session-scoped read (lane center-pages): the route resolves the request's
 * session and constructs `createServerClient(session.ctx)` so BOTH reads
 * (projects.list apply targets + learnings.list ViewModel) are scoped to the
 * logged-in user — a brand-new empty account reads its own empty learnings /
 * projects, not the user-zyongzhu seed. With no session both reads run through the
 * singleton seam (fixture fallback) so SSR/tests never crash.
 */

import { ExperiencePage } from "@/features/experience/experience-page";
import type { ApplyTarget } from "@/features/experience/experience-page";
import {
  buildExperienceWorkspaceViewModel,
  type ExperienceDataClient,
} from "@/features/experience/experience-data";
import {
  client as defaultClient,
  createServerClient,
} from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

interface ProjectListItemDto {
  readonly id: string;
  readonly title: string;
}

type ProjectsReadClient = Pick<typeof defaultClient, "listProjects">;

async function resolveApplyTargets(
  client: ProjectsReadClient,
): Promise<ReadonlyArray<ApplyTarget>> {
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
  const session = await resolveSession();
  // Session-scoped client on the production path; singleton seam (canonical ctx)
  // when there is no session so SSR/tests keep resolving against the fixture seed.
  const client = session ? createServerClient(session.ctx) : defaultClient;

  const [applyTargets, viewModel] = await Promise.all([
    resolveApplyTargets(client),
    buildExperienceWorkspaceViewModel(
      client as unknown as ExperienceDataClient,
    ),
  ]);
  return <ExperiencePage viewModel={viewModel} applyTargets={applyTargets} />;
}
