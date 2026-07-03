/**
 * 经验裁决台 route entry(T-062a)。渲染委托给
 * `@/features/experience/experience-page.tsx`;共享 `AppShell` / `Sidebar` /
 * `TopHeader` 由 `(creator)/layout.tsx` 为整个路由组挂载一次,这里不渲染壳。
 *
 * 读侧(session-scoped):
 *   - `learnings.list` + `calibration.suggestions.list` →
 *     `buildExperienceWorkspaceViewModel`(裁决队列 / 已验证库 / discarded /
 *     3 张真值汇总卡);learnings 读失败 → VM 带 loadError,页面渲染错误态,
 *     禁 fixture 兜底;
 *   - `projects.list` → 「应用到项目」的目标候选,失败降级为空(控件隐藏)。
 *
 * 有 session 时构造 `createServerClient(session.ctx)` 让读写 user-scoped;
 * 无 session 走 singleton seam(canonical ctx),SSR/测试不崩。
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
  const client = session ? createServerClient(session.ctx) : defaultClient;

  const [applyTargets, viewModel] = await Promise.all([
    resolveApplyTargets(client),
    buildExperienceWorkspaceViewModel(
      client as unknown as ExperienceDataClient,
    ),
  ]);
  return <ExperiencePage viewModel={viewModel} applyTargets={applyTargets} />;
}
