/**
 * Scenario selectors.
 *
 * Pages pick a scenario name to get a page ViewModel. Default, empty,
 * loading, error and selected are mandatory. Specific page selectors in
 * `src/fixtures/selectors/**` build richer ViewModels from canonical data.
 */

import { canonicalProject, listProjects } from "./canonical";
import {
  buildProjectsViewModel,
  type ProjectListRow,
} from "./selectors";
import type { ProjectsViewModel, ViewModelError } from "@/types/view-models";

export type FixtureScenarioName =
  | "default"
  | "empty"
  | "loading"
  | "error"
  | "selected";

const FIXTURE_ERROR: ViewModelError = Object.freeze({
  code: "FIXTURE_ERROR",
  message: "示例错误：请检查网络与权限",
});

function buildProjectsViewModelForScenario(
  scenario: FixtureScenarioName,
  rows: ReadonlyArray<ProjectListRow>,
): ProjectsViewModel {
  const base = buildProjectsViewModel({ rows });
  return {
    ...base,
    scenario,
    loading: scenario === "loading",
    error: scenario === "error" ? FIXTURE_ERROR : null,
    selectedId: scenario === "selected" ? canonicalProject.id : null,
  };
}

function defaultProjectsViewModel(): ProjectsViewModel {
  return buildProjectsViewModelForScenario("default", buildProjectsViewModel().rows);
}

function emptyProjectsViewModel(): ProjectsViewModel {
  return buildProjectsViewModelForScenario("empty", []);
}

function loadingProjectsViewModel(): ProjectsViewModel {
  return buildProjectsViewModelForScenario("loading", []);
}

function errorProjectsViewModel(): ProjectsViewModel {
  return buildProjectsViewModelForScenario("error", []);
}

function selectedProjectsViewModel(): ProjectsViewModel {
  // Keep the default list of rows so consumers can render a selected
  // row against the same dataset; selectedId is exposed for the page.
  void listProjects();
  return buildProjectsViewModelForScenario("selected", buildProjectsViewModel().rows);
}

export const scenarioSelectors = {
  default: defaultProjectsViewModel,
  empty: emptyProjectsViewModel,
  loading: loadingProjectsViewModel,
  error: errorProjectsViewModel,
  selected: selectedProjectsViewModel,
} as const satisfies Readonly<Record<FixtureScenarioName, () => ProjectsViewModel>>;
