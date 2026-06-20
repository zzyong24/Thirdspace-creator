/**
 * Scenario selectors.
 *
 * Two layers live here:
 *
 *  1. The legacy Projects-only `scenarioSelectors` map (default / empty /
 *     loading / error / selected) kept for backwards compatibility with
 *     existing consumers and tests.
 *
 *  2. A GENERIC per-page scenario mechanism: any page builder (the
 *     `build<Page>ViewModel` selectors in `src/fixtures/selectors/**`) can
 *     be wrapped so its ViewModel is produced in the four standard states
 *     — default / empty / loading / error. The wrapper is pure and
 *     deterministic; it overrides only the `BasePageViewModel` envelope
 *     fields plus (for `empty`) every array-valued collection on the
 *     ViewModel. No `Date.now` / `Math.random` / `fetch`.
 */

import { canonicalProject, listProjects } from "./canonical";
import {
  buildProjectsViewModel,
  type ProjectListRow,
} from "./selectors";
import type {
  BasePageViewModel,
  ProjectsViewModel,
  ViewModelError,
} from "@/types/view-models";

// ---------------------------------------------------------------------------
// Shared scenario vocabulary
// ---------------------------------------------------------------------------

export type FixtureScenarioName =
  | "default"
  | "empty"
  | "loading"
  | "error"
  | "selected";

/** The four states the generic page-scenario mechanism produces. */
export type PageScenarioName = "default" | "empty" | "loading" | "error";

const FIXTURE_ERROR: ViewModelError = Object.freeze({
  code: "FIXTURE_ERROR",
  message: "示例错误：请检查网络与权限",
});

// ---------------------------------------------------------------------------
// Generic per-page scenario mechanism
// ---------------------------------------------------------------------------

/**
 * Override the `BasePageViewModel` envelope (`scenario` / `loading` /
 * `error`) for the given scenario. Collections and page-specific fields
 * are preserved as-is. Use {@link emptyCollections} to additionally clear
 * arrays for the `empty` scenario.
 */
function applyEnvelope<VM extends BasePageViewModel>(
  vm: VM,
  scenario: PageScenarioName,
): VM {
  return {
    ...vm,
    scenario,
    loading: scenario === "loading",
    error: scenario === "error" ? FIXTURE_ERROR : vm.error ?? null,
  };
}

/**
 * Return a shallow copy of `vm` with every own array-valued field replaced
 * by an empty array. This drives the `empty` scenario generically: a page
 * renders its empty state when all its collections are empty, regardless of
 * which collection fields the ViewModel declares.
 */
function emptyCollections<VM extends BasePageViewModel>(vm: VM): VM {
  const next = { ...vm } as Record<string, unknown>;
  for (const [key, value] of Object.entries(next)) {
    if (Array.isArray(value)) {
      next[key] = [];
    }
  }
  return next as unknown as VM;
}

/**
 * Produce the four standard scenario variants for a page from a single
 * builder. The builder is invoked once per scenario so the result stays
 * pure (no shared mutable state).
 *
 *   const research = makePageScenarios(() => buildResearchViewModel(id));
 *   research.empty();   // collections cleared, scenario = "empty"
 *   research.loading(); // loading = true
 *   research.error();   // error = FIXTURE_ERROR
 */
export function makePageScenarios<VM extends BasePageViewModel>(
  build: () => VM,
): Readonly<Record<PageScenarioName, () => VM>> {
  return {
    default: () => applyEnvelope(build(), "default"),
    empty: () => applyEnvelope(emptyCollections(build()), "empty"),
    loading: () => applyEnvelope(emptyCollections(build()), "loading"),
    error: () => applyEnvelope(emptyCollections(build()), "error"),
  } as const;
}

/**
 * Convenience: build a single scenario variant of a page ViewModel without
 * materialising the whole map.
 */
export function buildPageScenario<VM extends BasePageViewModel>(
  build: () => VM,
  scenario: PageScenarioName,
): VM {
  const base = scenario === "default" ? build() : emptyCollections(build());
  return applyEnvelope(base, scenario);
}

// ---------------------------------------------------------------------------
// Projects scenario selectors (legacy, five-name map)
// ---------------------------------------------------------------------------

function buildProjectsViewModelForScenario(
  scenario: FixtureScenarioName,
  rows: ReadonlyArray<ProjectListRow>,
): ProjectsViewModel {
  const base = buildProjectsViewModel(listProjects(), { rows });
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
