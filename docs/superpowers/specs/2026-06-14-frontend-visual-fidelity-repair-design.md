# CreatorOS Frontend Visual Fidelity Repair Design

## 1. Objective

Repair the current CreatorOS frontend so that all 17 approved routes closely
match their corresponding `ui/*.png` references at `1536 x 1024`.

This work is a correction pass, not a product redesign. It must preserve the
existing information architecture, route structure, product scope, and
frontend technology choices defined in `frontend/SPEC.md`.

## 2. Source Of Truth

The visual source of truth remains the 17 tracked PNG files under `ui/`.
Written page specifications describe structure and behavior, but they do not
override visible details in the corresponding reference image.

Every repair task must use:

1. The route's approved reference image.
2. `frontend/SPEC.md`.
3. The route section in `frontend/specs/page-specs.md`.
4. Approved decisions in `frontend/specs/decision-log.md`, when present.

No implementation may add features, reorganize sections, alter the product
information architecture, or introduce a second shell or component system.

## 3. Current Failure Model

The current implementation has four distinct problem classes:

1. The visual regression suite has no installed reference PNG baselines, so it
   cannot validate page fidelity.
2. Shared shell dimensions and header composition differ from the references,
   causing repeated errors across many routes.
3. Several pages use incomplete content, generated placeholders, or layouts
   that only approximate the approved design.
4. Unit, lint, runtime, and multi-worktree test isolation issues prevent a
   trustworthy completion signal.

The repair must address these causes in dependency order. Page-level spacing
changes must not be used to compensate for an incorrect shared shell.

## 4. Repair Strategy

### 4.1 Phase A: Restore Trustworthy Verification

Before page repair:

- Install Controller-approved visual baselines derived from the tracked
  references.
- Make visual tests compare the fixed `1536 x 1024` viewport rather than a
  full-page screenshot.
- Ensure a visual run fails when a baseline is missing.
- Replace the ineffective baseline mutation check with a real before/after
  lifecycle check.
- Allocate or validate an isolated Playwright server for the current worktree;
  never silently reuse another Agent's server.
- Ignore generated Playwright output in ESLint.
- Repair stale token tests and ensure CSS token tests load the token layer.
- Add a regression test for asset preview tokens containing hexadecimal
  letters, then remove invalid SVG `NaN` attributes.

Completion gate:

- Typecheck, lint, unit tests, build, and visual harness tests pass.
- A known visual mismatch produces an expected failing comparison.

### 4.2 Phase B: Calibrate Shared Visual Foundation

Repair shared visual behavior before route-specific work:

- `AppShell`
- `Sidebar`
- `TopHeader`
- page scroll container
- shared design tokens
- typography and deterministic media behavior

`TopHeader` remains one component with approved modes. A route must not render
a duplicate page heading when the reference places that heading inside the
shared header. Conversely, content visible below the header in the reference
must remain page content.

Completion gate:

- Dashboard, Projects, Project Overview, and one Workspace route demonstrate
  the correct shared shell geometry.
- Existing shell accessibility and navigation behavior remains intact.

### 4.3 Phase C: Repair Highest-Difference Views

Repair these views first because they have the largest structural divergence:

1. New Project overlay
2. Production Workspace
3. Assets Center
4. Publishing Workspace
5. AI Copilot overlay

The work must restore the reference section order, column proportions, content
density, media treatment, controls, and overlay geometry. Generated glyphs or
blank blocks may not substitute for visible reference thumbnails when local,
deterministic media can represent them.

### 4.4 Phase D: Repair Remaining Views

Repair the remaining routes in descending measured difference:

- Research Workspace
- Publishing Center
- Analytics and Review
- Experience Center
- Global Search
- Planning Workspace
- Dashboard
- Projects
- Script Workspace
- Project Overview
- Knowledge and Memory
- Settings

The measured ordering may be recalculated after shared shell calibration.

## 5. Per-Page Workflow

Each page repair follows this cycle:

1. Open the reference and current screenshot side by side.
2. Record structural differences before styling differences.
3. Add or update a focused test and observe the expected failure.
4. Make the smallest implementation change that restores the approved design.
5. Run focused unit and interaction tests.
6. Capture at exactly `1536 x 1024`, device scale factor `1`.
7. Generate a pixel diff and inspect the rendered page visually.
8. Run affected shell, accessibility, and route regression tests.
9. Commit only after the page passes its agreed acceptance gate.

Structural correction order:

1. Shell and page bounds
2. Section presence and order
3. Grid and column geometry
4. Typography and density
5. Color, border, radius, and shadow
6. Icons, thumbnails, and minor alignment

## 6. Acceptance Criteria

The configured target remains `maxDiffPixelRatio <= 0.005`.

Because font rasterization and chart rendering may introduce small
environmental variation, a page may be accepted above `0.5%` only when:

- the remaining pixels are demonstrably non-structural rendering noise;
- visual inspection confirms no missing, moved, resized, or restyled product
  element;
- the exception and measured ratio are recorded in the repair report.

No page is complete when:

- a baseline is absent;
- the screenshot was captured from another worktree or server;
- the browser console contains React or SVG warnings;
- focused tests, typecheck, lint, build, or required regression tests fail;
- the implementation uses placeholder structure in place of visible design
  content.

## 7. Test Architecture

The repair keeps the existing tools:

- Vitest and React Testing Library for components and contracts.
- Playwright for route behavior, accessibility, and screenshots.
- The repository visual scripts for deterministic capture and diagnostic
  pixel-diff reports.

Visual references are Controller-owned. Page work may update current captures
and diff artifacts but may not silently overwrite approved baselines.

The final verification command must cover:

- lint
- typecheck
- unit tests
- route and overlay E2E tests
- accessibility tests
- all 17 visual comparisons
- production build

## 8. Parallel Agent Boundaries

Shared foundation and verification repairs are sequential Controller work.
Page work may only run in parallel after the shared foundation is frozen.

When page work is parallelized:

- each Agent receives one independent route or overlay;
- each Agent uses an isolated worktree and unique test port;
- page Agents cannot modify shell, tokens, shared fixtures, shared UI
  primitives, baseline images, or another page;
- every result is reviewed and integrated by the Controller;
- completion claims require screenshot and test evidence.

Views that share a project workspace header may not be repaired concurrently
with changes to that header.

## 9. Deliverables

- A reliable visual regression pipeline with 17 approved baselines.
- Corrected shared shell and visual tokens.
- Corrected implementations for all 17 reference views.
- Passing automated verification.
- A final route-by-route report containing reference hash, final screenshot,
  diff ratio, test status, and any explicitly accepted rendering-only
  variance.

## 10. Non-Goals

- New product features.
- New routes or information architecture.
- Backend integration or persisted user data.
- Team collaboration behavior.
- Responsive redesign outside the minimum needed to preserve existing tests.
- Replacing Next.js, Tailwind, shadcn/ui, Lucide, Recharts, Vitest, or
  Playwright.
