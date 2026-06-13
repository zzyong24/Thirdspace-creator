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
import { scenarioSelectors, type FixtureScenarioName } from "./scenarios";
import { buildDashboardViewModel, buildProjectsViewModel } from "./selectors";

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

  test("exposes the full catalog of required entity collections", () => {
    const expectedKeys = [
      "user",
      "userPreferences",
      "projects",
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
      "productions",
      "publications",
      "reviews",
      "reviewInsights",
      "aiConversations",
      "aiMessages",
      "notifications",
      "searchHistory",
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
    expect(dashboard.continueCreating).toBeDefined();
    expect(dashboard.continueCreating.heading).toContain("继续创作");
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
