import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";

import {
  FIXED_NOW,
  canonicalDataset,
  canonicalProject,
  getProjectById,
  listProjects,
} from "./canonical";
import {
  buildPageScenario,
  makePageScenarios,
  scenarioSelectors,
  type FixtureScenarioName,
  type PageScenarioName,
} from "./scenarios";
import {
  buildDashboardViewModel,
  buildProjectsViewModel,
  buildResearchViewModel,
} from "./selectors";

const FIXTURE_DIR = resolve(process.cwd(), "src/fixtures");
const TYPES_DIR = resolve(process.cwd(), "src/types");

function readFixtureSource(relativePath: string): string {
  return readFileSync(resolve(FIXTURE_DIR, relativePath), "utf8");
}

function readTypesSource(fileName: string): string {
  return readFileSync(resolve(TYPES_DIR, fileName), "utf8");
}

function* walkFixtureSources(): Generator<string> {
  for (const entry of readdirSync(FIXTURE_DIR)) {
    const full = resolve(FIXTURE_DIR, entry);
    if (statSync(full).isFile() && /\.(ts|tsx)$/.test(entry)) {
      yield readFileSync(full, "utf8");
    }
  }
}

describe("Canonical fixture dataset", () => {
  test("exports a fixed clock anchored to Asia/Shanghai 2026-06-13 10:00", () => {
    expect(FIXED_NOW.toISOString()).toBe("2026-06-13T02:00:00.000Z");
    expect(FIXED_NOW.timeZoneOffset).toBe(-480);
  });

  test("provides a single canonical project titled 'AI Native Browser 深度解析'", () => {
    expect(canonicalProject.title).toBe("AI Native Browser 深度解析");
    expect(canonicalProject.id).toBe("project-ainativebrowser");
  });

  test("uses stable, deterministic IDs across the dataset", () => {
    const projectIds = new Set(listProjects().map((project) => project.id));
    expect(projectIds.size).toBe(listProjects().length);
    for (const id of projectIds) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }

    const datasetSource = readFixtureSource("canonical.ts");
    const idTokens = new Set<string>();
    for (const match of datasetSource.matchAll(/id:\s*"([^"]+)"/g)) {
      idTokens.add(match[1]);
    }
    expect(idTokens.has("project-ainativebrowser")).toBe(true);
    expect(idTokens.has("user-zyongzhu")).toBe(true);
    expect(idTokens.has("output-ainativebrowser-main")).toBe(true);
  });

  test("keeps ordering fixed and forbids Date.now, Math.random, or fetch", () => {
    const combined = [
      ...walkFixtureSources(),
      readTypesSource("domain.ts"),
      readTypesSource("view-models.ts"),
    ].join("\n");

    expect(combined).not.toMatch(/\bDate\.now\s*\(/);
    expect(combined).not.toMatch(/\bMath\.random\s*\(/);
    expect(combined).not.toMatch(/\bfetch\s*\(/);
    expect(combined).not.toMatch(/\bXMLHttpRequest\b/);
  });

  test("does not make any external network request when consumed", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    listProjects();
    buildDashboardViewModel();
    buildProjectsViewModel();
    for (const scenario of ["default", "empty", "loading", "error", "selected"] as const) {
      scenarioSelectors[scenario]();
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("links project, stages, content outputs, and artifacts with valid relationships", () => {
    const project = canonicalProject;
    const stages = canonicalDataset.projectStages.filter(
      (stage) => stage.projectId === project.id,
    );
    const outputs = canonicalDataset.contentOutputs.filter(
      (output) => output.projectId === project.id,
    );
    const artifacts = canonicalDataset.artifacts.filter(
      (artifact) => artifact.projectId === project.id,
    );

    expect(stages).toHaveLength(6);
    expect(outputs.length).toBeGreaterThan(0);
    expect(artifacts.length).toBeGreaterThan(0);

    const stageNames = stages.map((stage) => stage.stage);
    expect(stageNames).toEqual([
      "research",
      "planning",
      "script",
      "production",
      "publishing",
      "review",
    ]);

    const retrieved = getProjectById(project.id);
    expect(retrieved).toEqual(project);
  });

  test("every Artifact.currentVersionId points to a version of the SAME artifact", () => {
    const versionsById = new Map(
      canonicalDataset.artifactVersions.map((version) => [version.id, version]),
    );

    for (const artifact of canonicalDataset.artifacts) {
      const version = versionsById.get(artifact.currentVersionId);
      expect(version, `missing version for ${artifact.id}`).toBeDefined();
      expect(version?.artifactId).toBe(artifact.id);
    }
  });

  test("MetricSnapshot.ingestionRunId resolves to an existing IngestionRun", () => {
    const runIds = new Set(canonicalDataset.ingestionRuns.map((run) => run.id));
    for (const snapshot of canonicalDataset.metricSnapshots) {
      if (snapshot.ingestionRunId !== null) {
        expect(runIds.has(snapshot.ingestionRunId)).toBe(true);
      }
    }
  });

  test("PublicationRevision.coverAssetId belongs to the same project as its publication", () => {
    const outputsById = new Map(
      canonicalDataset.contentOutputs.map((output) => [output.id, output]),
    );
    const publicationsById = new Map(
      canonicalDataset.publications.map((publication) => [publication.id, publication]),
    );
    const projectAssetIds = new Map<string, Set<string>>();
    for (const link of canonicalDataset.projectAssets) {
      const set = projectAssetIds.get(link.projectId) ?? new Set<string>();
      set.add(link.assetId);
      projectAssetIds.set(link.projectId, set);
    }

    for (const revision of canonicalDataset.publicationRevisions) {
      if (revision.coverAssetId === null) continue;
      const publication = publicationsById.get(revision.publicationId);
      expect(publication).toBeDefined();
      const output = outputsById.get(publication!.contentOutputId);
      expect(output).toBeDefined();
      expect(projectAssetIds.get(output!.projectId)?.has(revision.coverAssetId)).toBe(true);
    }
  });

  test("exposes the full catalog of required entity collections", () => {
    const expectedKeys = [
      "user",
      "userPreferences",
      "projects",
      "projectRelations",
      "projectStages",
      "projectTargetPlatforms",
      "contentOutputs",
      "outputStages",
      "tasks",
      "milestones",
      "projectActivities",
      "artifacts",
      "artifactVersions",
      "thesisNodes",
      "scriptSections",
      "evidenceLinks",
      "timelineSegments",
      "knowledgeItems",
      "knowledgeRevisions",
      "assets",
      "assetFiles",
      "learnings",
      "tags",
      "entityTags",
      "projectKnowledge",
      "projectAssets",
      "artifactKnowledge",
      "artifactAssets",
      "outputAssets",
      "productions",
      "publications",
      "reviews",
      "reviewInsights",
      "aiConversations",
      "aiMessages",
      "aiTasks",
      "aiTaskReferences",
      "aiTaskResults",
      "agentConfigurations",
      "externalSources",
      "ingestionRuns",
      "ingestionErrors",
      "notifications",
      "searchHistory",
      "searchDocuments",
    ] as const;

    for (const key of expectedKeys) {
      expect(canonicalDataset).toHaveProperty(key);
      expect(
        (canonicalDataset as Record<string, unknown>)[key],
      ).toBeDefined();
    }
  });
});

describe("Scenario selector contract", () => {
  test("supports the five approved scenario names", () => {
    const expected: FixtureScenarioName[] = [
      "default",
      "empty",
      "loading",
      "error",
      "selected",
    ];
    for (const scenario of expected) {
      expect(scenarioSelectors[scenario]).toBeTypeOf("function");
    }
  });

  test("returns page ViewModels with stable shape for each scenario", () => {
    const expectedShape = {
      default: "projects",
      empty: "projects",
      loading: "projects",
      error: "projects",
      selected: "projects",
    } as const;

    for (const scenario of Object.keys(expectedShape) as FixtureScenarioName[]) {
      const viewModel = scenarioSelectors[scenario]();
      expect(viewModel.kind).toBe(expectedShape[scenario]);
      expect(viewModel.scenario).toBe(scenario);
      expect(Array.isArray(viewModel.rows)).toBe(true);
    }
  });

  test("returns empty rows for the empty scenario and rows for the default scenario", () => {
    const emptyViewModel = scenarioSelectors.empty();
    const defaultViewModel = scenarioSelectors.default();

    expect(emptyViewModel.rows).toEqual([]);
    expect(defaultViewModel.rows.length).toBeGreaterThan(0);
  });

  test("returns an error payload for the error scenario", () => {
    const errorViewModel = scenarioSelectors.error();
    expect(errorViewModel.error).toBeDefined();
    expect(errorViewModel.error?.code).toBe("FIXTURE_ERROR");
  });

  test("returns a loading flag for the loading scenario", () => {
    const loadingViewModel = scenarioSelectors.loading();
    expect(loadingViewModel.loading).toBe(true);
  });

  test("returns a selected row id for the selected scenario", () => {
    const selectedViewModel = scenarioSelectors.selected();
    expect(selectedViewModel.selectedId).toBe(canonicalProject.id);
    expect(selectedViewModel.rows.length).toBeGreaterThan(0);
  });
});

describe("Page ViewModel selectors", () => {
  test("buildDashboardViewModel returns deterministic counts and continue list", () => {
    const dashboard = buildDashboardViewModel();

    expect(dashboard.kind).toBe("dashboard");
    expect(dashboard.metrics).toHaveLength(5);
    // canonicalDataset 含 active 项目 → continueCreating 非 null(T-143 ③ 后仍如此)。
    expect(dashboard.continueCreating).not.toBeNull();
    expect(dashboard.continueCreating?.heading).toContain("继续创作");
    expect(dashboard.todos.length).toBeGreaterThan(0);
    expect(dashboard.recentPublications.length).toBeGreaterThan(0);
    expect(dashboard.assistantPrompt.length).toBeGreaterThan(0);
  });

  test("buildProjectsViewModel returns ordered project rows with platform icons", () => {
    const projects = buildProjectsViewModel();

    expect(projects.kind).toBe("projects");
    expect(projects.tabs.length).toBeGreaterThan(0);
    expect(projects.rows.length).toBe(listProjects().length);

    const canonicalRow = projects.rows.find(
      (row) => row.id === canonicalProject.id,
    );
    expect(canonicalRow).toBeDefined();
    expect(canonicalRow?.title).toBe(canonicalProject.title);
    expect(canonicalRow?.platforms.length).toBeGreaterThan(0);
  });
});

describe("Generic per-page scenario mechanism", () => {
  const PAGE_SCENARIOS: PageScenarioName[] = [
    "default",
    "empty",
    "loading",
    "error",
  ];

  test("makePageScenarios exposes the four standard states", () => {
    const scenarios = makePageScenarios(() =>
      buildResearchViewModel(canonicalProject.id),
    );
    for (const name of PAGE_SCENARIOS) {
      expect(scenarios[name]).toBeTypeOf("function");
    }
  });

  test("default preserves the builder output and stamps scenario/loading/error", () => {
    const research = makePageScenarios(() =>
      buildResearchViewModel(canonicalProject.id),
    ).default();

    expect(research.scenario).toBe("default");
    expect(research.loading).toBe(false);
    expect(research.error).toBeNull();
    // Default keeps the populated collections from the builder.
    expect(research.trendCards.length).toBeGreaterThan(0);
    expect(research.sources.length).toBeGreaterThan(0);
  });

  test("empty clears every array-valued field on the ViewModel", () => {
    const research = makePageScenarios(() =>
      buildResearchViewModel(canonicalProject.id),
    ).empty();

    expect(research.scenario).toBe("empty");
    expect(research.loading).toBe(false);
    expect(research.error).toBeNull();
    expect(research.trendCards).toEqual([]);
    expect(research.sources).toEqual([]);
    expect(research.notes).toEqual([]);
    expect(research.evidence).toEqual([]);
    expect(research.relatedTags).toEqual([]);
    expect(research.sourceTabs).toEqual([]);
  });

  test("loading sets loading=true with cleared collections", () => {
    const research = makePageScenarios(() =>
      buildResearchViewModel(canonicalProject.id),
    ).loading();

    expect(research.scenario).toBe("loading");
    expect(research.loading).toBe(true);
    expect(research.error).toBeNull();
    expect(research.trendCards).toEqual([]);
  });

  test("error attaches the fixture error payload with cleared collections", () => {
    const research = makePageScenarios(() =>
      buildResearchViewModel(canonicalProject.id),
    ).error();

    expect(research.scenario).toBe("error");
    expect(research.loading).toBe(false);
    expect(research.error?.code).toBe("FIXTURE_ERROR");
    expect(research.trendCards).toEqual([]);
  });

  test("works for a non-project-scoped page builder (dashboard)", () => {
    const scenarios = makePageScenarios(() => buildDashboardViewModel());

    const empty = scenarios.empty();
    expect(empty.scenario).toBe("empty");
    expect(empty.metrics).toEqual([]);
    expect(empty.todos).toEqual([]);
    expect(empty.recentPublications).toEqual([]);

    const def = scenarios.default();
    expect(def.scenario).toBe("default");
    expect(def.metrics.length).toBeGreaterThan(0);
  });

  test("buildPageScenario produces a single variant equivalent to the map", () => {
    const build = () => buildDashboardViewModel();
    for (const name of PAGE_SCENARIOS) {
      const single = buildPageScenario(build, name);
      const fromMap = makePageScenarios(build)[name]();
      expect(single).toEqual(fromMap);
    }
  });

  test("the generic mechanism does not mutate the builder output", () => {
    const original = buildResearchViewModel(canonicalProject.id);
    const originalTrendCount = original.trendCards.length;
    buildPageScenario(
      () => buildResearchViewModel(canonicalProject.id),
      "empty",
    );
    const after = buildResearchViewModel(canonicalProject.id);
    expect(after.trendCards.length).toBe(originalTrendCount);
  });
});
