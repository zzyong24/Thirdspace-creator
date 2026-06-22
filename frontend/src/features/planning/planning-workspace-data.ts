import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import { buildPlanningViewModel } from "@/fixtures/selectors";
import type { PlanningViewModel } from "@/types/view-models";

/**
 * 策划工作台读侧做真 — assemble a REAL `PlanningViewModel` so a real/newly-created
 * project never renders the fixture selector's "未找到项目" empty state. Mirrors the
 * verified `research-workspace-data.ts` pattern: an injectable client (defaults to the
 * server client), per-field fixture fallback, whole-VM fallback on any read failure.
 *
 * Real this wave: the project identity (`coreThesis` title/body from the real project's
 * title + brief). The structured planning artifacts (论点树/内容合同/证据地图) have NO
 * producer yet (no AI node / op writes their `contentData`), so for a real non-fixture
 * project those surfaces show HONEST empty states rather than fake data; canonical demo
 * projects keep their curated fixture content. When a planning-stage producer lands,
 * extend this helper to read those artifacts — the route + VM shape stay the same.
 */

interface ProjectDto {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
}

export interface PlanningDataClient {
  getProject(input: {
    params: { projectId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
}

export async function buildPlanningWorkspaceViewModel(
  projectId: string,
  client: PlanningDataClient = defaultClient as unknown as PlanningDataClient,
): Promise<PlanningViewModel> {
  const fixture = buildPlanningViewModel(projectId);

  let project: ProjectDto | null = null;
  try {
    project = (await client.getProject({
      params: { projectId },
      query: undefined,
      body: undefined,
    })) as ProjectDto;
  } catch {
    // Unknown / cross-user / unreadable project → keep the fixture VM (preserves the
    // "未找到项目" empty-state for genuinely invalid ids).
    return fixture;
  }
  if (!project || typeof project.title !== "string") return fixture;

  // The fixture is rich ONLY for canonical demo projects; for an unknown id it returns the
  // 未找到 placeholder. Detect that so a REAL project surfaces honest empty states.
  const fixtureIsPlaceholder = fixture.coreThesis.title === "未找到项目";
  const brief =
    typeof project.brief === "string" && project.brief.trim().length > 0
      ? project.brief
      : "（暂无核心论点——在脚本阶段用 AI 起草后回填）";

  return {
    ...fixture,
    projectId,
    coreThesis: {
      id: fixture.coreThesis.id || "core-thesis",
      title: project.title,
      body: brief,
    },
    // Keep the 4 locked content-contract cards (structural scaffolding). For a real
    // non-fixture project, the thesis tree / evidence map / key materials have no real
    // producer yet → empty states, not placeholder fixture content.
    contracts: fixture.contracts,
    thesisTree: fixtureIsPlaceholder ? [] : fixture.thesisTree,
    evidenceMap: fixtureIsPlaceholder ? [] : fixture.evidenceMap,
    keyMaterials: fixtureIsPlaceholder ? [] : fixture.keyMaterials,
  };
}
