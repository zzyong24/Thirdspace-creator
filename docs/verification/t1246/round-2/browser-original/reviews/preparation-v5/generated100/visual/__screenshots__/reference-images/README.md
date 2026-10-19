# Reference Image Baselines

This directory contains the **Controller-approved visual regression
baselines** for every route in `tests/fixtures/routes.ts`. The files
are referenced by the `visual` Playwright project via
`expect(page).toHaveScreenshot("reference-<id>.png", ...)` calls in
`tests/visual/all-pages.spec.ts`.

## File naming

| Route id              | Baseline file                        |
| --------------------- | ------------------------------------ |
| `dashboard`           | `reference-dashboard.png`            |
| `projects`            | `reference-projects.png`             |
| `project-overview`    | `reference-project-overview.png`     |
| `research-workspace`  | `reference-research-workspace.png`   |
| `planning-workspace`  | `reference-planning-workspace.png`   |
| `script-workspace`    | `reference-script-workspace.png`     |
| `production-workspace`| `reference-production-workspace.png` |
| `publishing-workspace`| `reference-publishing-workspace.png` |
| `analytics-review`    | `reference-analytics-review.png`     |
| `knowledge`           | `reference-knowledge.png`            |
| `assets`              | `reference-assets.png`               |
| `publishing-center`   | `reference-publishing-center.png`    |
| `experience`          | `reference-experience.png`           |
| `search`              | `reference-search.png`               |
| `settings`            | `reference-settings.png`             |
| `new-project-overlay` | `reference-new-project-overlay.png`  |
| `ai-copilot-overlay`  | `reference-ai-copilot-overlay.png`   |

## Authority rules

These PNGs are the **Controller's authoritative visual ground truth**.
They were copied from `ui/*.png` (see `INSTALL-MANIFEST.json` for
the install provenance) and the `imageSha256` field on each
`RouteSpec` in `tests/fixtures/routes.ts` is the contractual
fingerprint for that file.

Subagents working on the visual implementation must follow these
rules **without exception**:

1. **Never run** `playwright --update-snapshots` (the project config
   sets `updateSnapshots: "none"` and the CI mode adds a directory
   hash guard; see `playwright.config.ts`).
2. **Never replace** a file in this directory with a screenshot
   captured from the live implementation. The whole point of this
   pipeline is to detect when implementation drifts from design;
   re-baselining with an implementation render defeats it.
3. **Never delete** a baseline that is referenced from
   `tests/fixtures/routes.ts`. If a route is deprecated, update
   the route registry first; only then may the corresponding
   baseline be removed.
4. **Never** copy from `tests/visual/__artifacts__/current/` back
   into this directory. `current/` is implementation output, not
   design intent.

## When to refresh

A baseline may only be refreshed when **all** of the following hold:

- The Controller has reviewed the latest `__artifacts__/diff/*`
  report and explicitly approved the new design.
- The new reference PNG lives in `ui/` with a fresh SHA-256 that
  is also written into `tests/fixtures/routes.ts`.
- The refresh is performed by running
  `node scripts/visual/install-baselines.mjs --force` from a
  Controller-authorised workstation, then committing the diff.

## Why this matters

The Phase-1 visual infrastructure exists so that every later
implementation agent gets a single, unambiguous answer to
"does my page match the design?" The baselines in this
directory are the source of that answer. If they drift, the
answer becomes meaningless and the entire pipeline collapses.
