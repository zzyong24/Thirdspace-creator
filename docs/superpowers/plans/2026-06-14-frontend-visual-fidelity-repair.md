# CreatorOS Frontend Visual Fidelity Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all 17 CreatorOS frontend views reliably testable and visually match their approved `1536 x 1024` reference PNGs without changing product behavior or information architecture.

**Architecture:** Repair verification first, then freeze the shared AppShell geometry, then correct route-specific views in measured-difference order. Vitest protects component contracts, Playwright owns fixed-viewport behavior and visual comparisons, and Controller-installed reference PNGs remain immutable.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Vitest, React Testing Library, Playwright, PNGJS.

---

## File Ownership Map

- Visual authority and lifecycle:
  `frontend/playwright.config.ts`,
  `frontend/tests/visual/all-pages.spec.ts`,
  `frontend/tests/visual/__setup__.ts`,
  `frontend/tests/visual/__teardown__.ts`,
  `frontend/scripts/visual/*.mjs`,
  `frontend/tests/visual/__screenshots__/reference-images/*`.
- Shared visual foundation:
  `frontend/src/styles/tokens.css`,
  `frontend/src/components/shell/**`,
  `frontend/src/app/(creator)/shell-router.tsx`.
- Overlay views:
  `frontend/src/components/overlays/**`,
  `frontend/src/features/projects/new-project-form*`,
  `frontend/src/features/copilot/**`.
- Project workspace views:
  `frontend/src/features/{research,planning,script,production,project-publishing,review}/**`.
- Global views:
  `frontend/src/features/{dashboard,projects,knowledge,assets,publishing-center,experience,search,settings}/**`.

Page tasks may not edit visual baselines, shared tokens, shared shell files, or
another page's feature directory.

### Task 1: Make Visual Baselines Authoritative

**Files:**
- Modify: `.gitignore`
- Modify: `frontend/scripts/visual/install-baselines.mjs`
- Modify: `frontend/tests/visual/all-pages.spec.ts`
- Create: `frontend/tests/visual/baseline-contract.test.ts`
- Add: `frontend/tests/visual/__screenshots__/reference-images/reference-*.png`
- Add: `frontend/tests/visual/__screenshots__/reference-images/INSTALL-MANIFEST.json`

- [ ] **Step 1: Write the failing baseline contract**

Create a Node-environment Vitest test that requires exactly one PNG for every
entry in `ROUTES` and verifies its SHA against `imageSha256`:

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTES } from "../fixtures/routes";

describe("visual reference baselines", () => {
  it("contains one immutable reference PNG per approved route", () => {
    for (const route of ROUTES) {
      const path = resolve(
        "tests/visual/__screenshots__/reference-images",
        `reference-${route.id}.png`,
      );
      const hash = createHash("sha256")
        .update(readFileSync(path))
        .digest("hex");
      expect(hash, route.id).toBe(route.imageSha256);
    }
  });
});
```

- [ ] **Step 2: Run the contract and observe RED**

Run:

```bash
cd frontend
pnpm vitest run tests/visual/baseline-contract.test.ts
```

Expected: FAIL because `reference-dashboard.png` and the other reference PNGs
do not exist.

- [ ] **Step 3: Install and track the approved references**

Run:

```bash
cd frontend
pnpm visual:verify-shas
pnpm visual:install-baselines
```

Remove only the ignore rule for
`frontend/tests/visual/__screenshots__/reference-images/*.png`; keep generated
current and diff artifacts ignored. Make the installer fail unless it parses
exactly 17 route records and installs exactly 17 PNGs.

- [ ] **Step 4: Use fixed-viewport screenshots**

Change the visual assertion to:

```ts
await expect(page).toHaveScreenshot(`reference-${route.id}.png`, {
  fullPage: false,
  maxDiffPixelRatio: 0.005,
});
```

Update comments to describe fixed `1536 x 1024` comparison.

- [ ] **Step 5: Verify GREEN and expected visual RED**

Run:

```bash
pnpm vitest run tests/visual/baseline-contract.test.ts
pnpm exec playwright test tests/visual/all-pages.spec.ts \
  --project=visual --grep "dashboard.*matches"
```

Expected: baseline contract PASS; Dashboard visual comparison FAILS due to a
real pixel mismatch rather than a missing snapshot.

- [ ] **Step 6: Commit**

```bash
git add .gitignore frontend/scripts/visual/install-baselines.mjs \
  frontend/tests/visual/all-pages.spec.ts \
  frontend/tests/visual/baseline-contract.test.ts \
  frontend/tests/visual/__screenshots__/reference-images
git commit -m "test(visual): install authoritative reference baselines"
```

### Task 2: Isolate Playwright And Protect Baselines

**Files:**
- Modify: `frontend/playwright.config.ts`
- Modify: `frontend/tests/visual/__setup__.ts`
- Create: `frontend/tests/visual/__teardown__.ts`
- Modify: `frontend/scripts/visual/capture-with-port.mjs`
- Create: `frontend/tests/visual/visual-lifecycle.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Extract and test a pure fingerprint helper:

```ts
it("detects a reference file changed after setup", () => {
  const before = fingerprintReferences(tempDir);
  writeFileSync(join(tempDir, "reference-dashboard.png"), "changed");
  const after = fingerprintReferences(tempDir);
  expect(after.hash).not.toBe(before.hash);
});

it("rejects a server that does not identify this worktree", async () => {
  await expect(assertExpectedServer(wrongServerUrl, expectedRoot))
    .rejects.toThrow(/different worktree/);
});
```

- [ ] **Step 2: Run and observe RED**

```bash
pnpm vitest run tests/visual/visual-lifecycle.test.ts
```

Expected: FAIL because no reusable fingerprint helper, teardown, or worktree
identity check exists.

- [ ] **Step 3: Implement real setup/teardown integrity**

Move fingerprint logic to an exported helper. Setup writes the initial
fingerprint to `tests/visual/__artifacts__/baseline-fingerprint.json`.
Teardown reads it, recomputes the directory fingerprint, and throws when count,
entry names, or hash differ.

Configure:

```ts
globalSetup: resolve(HERE, "tests", "visual", "__setup__.ts"),
globalTeardown: resolve(HERE, "tests", "visual", "__teardown__.ts"),
```

Delete the post-`defineConfig` check because it executes before the run.

- [ ] **Step 4: Eliminate cross-worktree server reuse**

Read the port from `CREATOROS_TEST_PORT`, defaulting to `3201`. Set
`reuseExistingServer: false`. Use the resolved port in both `baseURL` and
`webServer`. The capture script must throw after its 30-second server wait:

```js
let ready = false;
// polling sets ready = true
if (!ready) {
  throw new Error(`Server did not become ready at ${BASE_URL}`);
}
```

- [ ] **Step 5: Verify**

```bash
pnpm vitest run tests/visual/visual-lifecycle.test.ts
CREATOROS_TEST_PORT=3291 pnpm exec playwright test \
  tests/e2e/smoke.spec.ts --project=e2e
```

Expected: PASS; Playwright starts its own server on `3291`.

- [ ] **Step 6: Commit**

```bash
git add frontend/playwright.config.ts frontend/tests/visual \
  frontend/scripts/visual/capture-with-port.mjs
git commit -m "test(visual): isolate server and guard baselines"
```

### Task 3: Restore A Green Engineering Baseline

**Files:**
- Modify: `frontend/eslint.config.mjs`
- Modify: `frontend/src/test/tokens.test.ts`
- Modify: `frontend/src/components/shell/shell.test.tsx`
- Modify: `frontend/src/components/ui/ui-contract.test.tsx`
- Modify: `frontend/src/features/assets/assets-page.test.tsx`
- Modify: `frontend/src/features/assets/assets-interactive-region.tsx`

- [ ] **Step 1: Add the failing SVG regression**

Render an asset whose deterministic token contains `a-f`, then assert that
every SVG geometry attribute is finite:

```ts
it("never renders NaN SVG geometry for hexadecimal preview tokens", () => {
  render(<AssetsPage />);
  for (const node of document.querySelectorAll("svg [width], svg [height], svg [x], svg [y]")) {
    for (const name of ["width", "height", "x", "y"]) {
      const value = node.getAttribute(name);
      if (value !== null) expect(value).not.toBe("NaN");
    }
  }
});
```

- [ ] **Step 2: Observe RED**

```bash
pnpm vitest run src/features/assets/assets-page.test.tsx
```

Expected: FAIL on an SVG attribute equal to `NaN`.

- [ ] **Step 3: Fix token parsing at the source**

Add one helper and use it for every preview branch:

```ts
function parseHexPair(value: string): number {
  return Number.parseInt(value || "0", 16);
}
```

Replace every `Number(digits.slice(...))` with `parseHexPair(...)`.

- [ ] **Step 4: Repair stale test setup**

Import `@/styles/tokens.css` in tests that read root CSS variables. Update the
exact token expectations to the approved current values:

```ts
"--creatoros-header-height": "72px",
"--creatoros-page-gutter": "24px",
```

Add generated paths to ESLint ignores:

```js
"playwright-report/**",
"test-results/**",
"tests/visual/__artifacts__/**",
```

- [ ] **Step 5: Verify**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all PASS without React or SVG warnings.

- [ ] **Step 6: Commit**

```bash
git add frontend/eslint.config.mjs frontend/src/test/tokens.test.ts \
  frontend/src/components/shell/shell.test.tsx \
  frontend/src/components/ui/ui-contract.test.tsx \
  frontend/src/features/assets
git commit -m "fix(frontend): restore green validation baseline"
```

### Task 4: Calibrate The Shared AppShell

**Files:**
- Modify: `frontend/src/styles/tokens.css`
- Modify: `frontend/src/components/shell/app-shell.tsx`
- Modify: `frontend/src/components/shell/sidebar.tsx`
- Modify: `frontend/src/components/shell/top-header.tsx`
- Modify: `frontend/src/components/shell/page-scroll-area.tsx`
- Modify: `frontend/src/app/(creator)/shell-router.tsx`
- Modify: `frontend/src/components/shell/shell.test.tsx`
- Modify: `frontend/tests/e2e/app-shell.spec.ts`

- [ ] **Step 1: Add failing shell geometry contracts**

Add assertions for one shell, route-specific header mode, and no duplicate
global heading:

```ts
it("renders global actions without duplicating a page heading", async () => {
  await renderShell({ pathname: "/" });
  expect(screen.getAllByRole("banner")).toHaveLength(1);
  expect(screen.getAllByRole("heading", { name: /早上好/ })).toHaveLength(1);
  expect(screen.queryByRole("heading", { name: "首页" })).not.toBeInTheDocument();
});
```

In Playwright, assert the desktop rectangles measured from the reference:

```ts
expect(await sidebar.boundingBox()).toMatchObject({ x: 0, width: 224 });
expect((await header.boundingBox())?.height).toBe(72);
```

- [ ] **Step 2: Observe RED**

```bash
pnpm vitest run src/components/shell/shell.test.tsx
pnpm exec playwright test tests/e2e/app-shell.spec.ts --project=e2e
```

- [ ] **Step 3: Correct shell composition**

Keep one `TopHeader`, but make global mode expose the reference's search,
notification, and primary action slots without injecting redundant route
titles. Preserve project identity and six-stage stepper in project modes.
Correct page padding, scroll ownership, sidebar vertical distribution,
typography, border colors, and action dimensions from the measured references.

- [ ] **Step 4: Capture four representative routes**

```bash
node scripts/visual/capture-with-port.mjs 3000 dashboard /
node scripts/visual/capture-with-port.mjs 3000 projects /projects
node scripts/visual/capture-with-port.mjs 3000 project-overview /projects/ai-native-browser
node scripts/visual/capture-with-port.mjs 3000 research-workspace /projects/ai-native-browser/research
node scripts/visual/diff-with-port.mjs 3000 dashboard
node scripts/visual/diff-with-port.mjs 3000 projects
node scripts/visual/diff-with-port.mjs 3000 project-overview
node scripts/visual/diff-with-port.mjs 3000 research-workspace
```

Expected: all four ratios improve from the recorded starting values and visual
inspection shows one correct shell, not page-level compensation.

- [ ] **Step 5: Regression and commit**

```bash
pnpm test
pnpm typecheck
pnpm test:e2e
git add frontend/src/styles/tokens.css frontend/src/components/shell \
  'frontend/src/app/(creator)/shell-router.tsx' frontend/tests/e2e/app-shell.spec.ts
git commit -m "fix(shell): align shared application frame to references"
```

### Task 5: Repair New Project And AI Copilot Overlays

**Files:**
- Modify: `frontend/src/components/overlays/new-project-dialog.tsx`
- Modify: `frontend/src/features/projects/new-project-form.tsx`
- Modify: `frontend/src/features/projects/new-project-form.test.tsx`
- Modify: `frontend/src/components/overlays/ai-copilot-dialog.tsx`
- Modify: `frontend/src/features/copilot/ai-copilot-content.tsx`
- Modify: `frontend/src/features/copilot/ai-copilot-content.test.tsx`
- Create: `frontend/tests/e2e/new-project.spec.ts`
- Modify: `frontend/tests/e2e/ai-copilot.spec.ts`

- [ ] **Step 1: Add failing structure assertions**

Require the exact New Project field order and three horizontal selector groups.
Require the Copilot header, prompt region, three-column dashboard, task
sections, and reference-sized dialog.

```ts
expect(screen.getAllByTestId("new-project-section").map((node) => node.dataset.section))
  .toEqual(["name", "brief", "platform", "content-type", "creation-mode"]);
```

- [ ] **Step 2: Observe RED**

```bash
pnpm vitest run src/features/projects/new-project-form.test.tsx \
  src/features/copilot/ai-copilot-content.test.tsx
```

- [ ] **Step 3: Restore overlay geometry and content**

Match the reference overlay bounds, backdrop opacity, padding, selector-card
dimensions, labels, badges, footer placement, and underlying masked page.
Preserve focus trap, Escape, Back, and direct-route behavior.

- [ ] **Step 4: Verify and visually compare**

```bash
pnpm exec playwright test tests/e2e/new-project.spec.ts \
  tests/e2e/ai-copilot.spec.ts --project=e2e
node scripts/visual/capture-with-port.mjs 3000 new-project-overlay /projects/new
node scripts/visual/capture-with-port.mjs 3000 ai-copilot-overlay '/?copilot=open'
node scripts/visual/diff-with-port.mjs 3000 new-project-overlay
node scripts/visual/diff-with-port.mjs 3000 ai-copilot-overlay
```

Expected: both ratios materially decrease; no interaction regression.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/overlays frontend/src/features/projects \
  frontend/src/features/copilot frontend/tests/e2e
git commit -m "fix(overlays): match new project and copilot references"
```

### Task 6: Repair Production And Publishing Workspaces

**Files:**
- Modify: `frontend/src/features/production/production-workspace-page.tsx`
- Modify: `frontend/src/features/production/production-workspace-page.test.tsx`
- Modify: `frontend/src/features/project-publishing/publishing-workspace-page.tsx`
- Modify: `frontend/src/features/project-publishing/publishing-workspace-page.test.tsx`

- [ ] **Step 1: Add failing structural tests**

Production must expose mode selector, recording script, asset library, preview,
settings rail, and bottom timeline in reference order. Publishing must expose
publishing information, platform adaptation, preview, records, and reference
metrics without moving review-only content into the page.

```ts
expect(screen.getAllByTestId("production-region").map((node) => node.dataset.region))
  .toEqual(["mode", "script", "assets", "preview", "settings", "timeline"]);
```

- [ ] **Step 2: Observe RED**

```bash
pnpm vitest run src/features/production/production-workspace-page.test.tsx \
  src/features/project-publishing/publishing-workspace-page.test.tsx
```

- [ ] **Step 3: Rebuild only the approved structures**

Use CSS grid proportions measured from the reference. Replace dark generic
blocks with deterministic local media treatment. Keep the project header in
the shared shell.

- [ ] **Step 4: Verify and commit**

```bash
pnpm vitest run src/features/production/production-workspace-page.test.tsx \
  src/features/project-publishing/publishing-workspace-page.test.tsx
node scripts/visual/capture-with-port.mjs 3000 production-workspace /projects/ai-native-browser/production
node scripts/visual/capture-with-port.mjs 3000 publishing-workspace /projects/ai-native-browser/publishing
node scripts/visual/diff-with-port.mjs 3000 production-workspace
node scripts/visual/diff-with-port.mjs 3000 publishing-workspace
git add frontend/src/features/production frontend/src/features/project-publishing
git commit -m "fix(workspaces): restore production and publishing layouts"
```

### Task 7: Repair Assets And Resource Centers

**Files:**
- Modify: `frontend/src/features/assets/assets-page.tsx`
- Modify: `frontend/src/features/assets/assets-interactive-region.tsx`
- Modify: `frontend/src/features/assets/assets-page.test.tsx`
- Modify: `frontend/src/features/knowledge/knowledge-page.tsx`
- Modify: `frontend/src/features/knowledge/knowledge-page.test.tsx`
- Modify: `frontend/src/features/experience/experience-page.tsx`
- Modify: `frontend/src/features/experience/experience-page.test.tsx`

- [ ] **Step 1: Add failing reference structure tests**

Assets must contain the reference filter rail, media grid, real deterministic
thumbnails, and detail panel. Knowledge and Experience must preserve their
approved navigation, card density, and right-side information regions.

- [ ] **Step 2: Observe RED**

```bash
pnpm vitest run src/features/assets/assets-page.test.tsx \
  src/features/knowledge/knowledge-page.test.tsx \
  src/features/experience/experience-page.test.tsx
```

- [ ] **Step 3: Correct each resource center**

Use repository-local deterministic images or CSS compositions that reproduce
the visible reference media; do not use empty glyph placeholders. Preserve
existing accessible controls and fixture contracts.

- [ ] **Step 4: Verify and commit**

```bash
node scripts/visual/capture-with-port.mjs 3000 assets /assets
node scripts/visual/capture-with-port.mjs 3000 knowledge /knowledge
node scripts/visual/capture-with-port.mjs 3000 experience /experience
node scripts/visual/diff-with-port.mjs 3000 assets
node scripts/visual/diff-with-port.mjs 3000 knowledge
node scripts/visual/diff-with-port.mjs 3000 experience
pnpm vitest run src/features/assets src/features/knowledge src/features/experience
git add frontend/src/features/assets frontend/src/features/knowledge \
  frontend/src/features/experience
git commit -m "fix(resources): align assets knowledge and experience views"
```

### Task 8: Repair Research, Planning, And Script Workspaces

**Files:**
- Modify: `frontend/src/features/research/research-workspace-page.tsx`
- Modify: `frontend/src/features/research/research-workspace-page.test.tsx`
- Modify: `frontend/src/features/planning/planning-workspace-page.tsx`
- Modify: `frontend/src/features/planning/planning-workspace-page.test.tsx`
- Modify: `frontend/src/features/script/script-workspace-page.tsx`
- Modify: `frontend/src/features/script/script-workspace-page.test.tsx`

- [ ] **Step 1: Add failing region-order tests**

Research must contain idea, three background cards, competitor table,
collection tabs, and three right-rail cards. Planning must contain approved
tabs, four contract cards, core thesis, four-column tree, and right rail.
Script must contain editor shell, version strip, outline, AI suggestions, and
quotes.

- [ ] **Step 2: Observe RED**

```bash
pnpm vitest run src/features/research src/features/planning src/features/script
```

- [ ] **Step 3: Correct geometry, density, and fixtures**

Match section order before styling. Preserve the shared project header and
canonical project resolver. Do not add chat, canvas, Markdown preview, or new
planning stages.

- [ ] **Step 4: Verify and commit**

```bash
node scripts/visual/capture-with-port.mjs 3000 research-workspace /projects/ai-native-browser/research
node scripts/visual/capture-with-port.mjs 3000 planning-workspace /projects/ai-native-browser/planning
node scripts/visual/capture-with-port.mjs 3000 script-workspace /projects/ai-native-browser/script
node scripts/visual/diff-with-port.mjs 3000 research-workspace
node scripts/visual/diff-with-port.mjs 3000 planning-workspace
node scripts/visual/diff-with-port.mjs 3000 script-workspace
pnpm vitest run src/features/research src/features/planning src/features/script
git add frontend/src/features/research frontend/src/features/planning \
  frontend/src/features/script
git commit -m "fix(workspaces): align research planning and script views"
```

### Task 9: Repair Dashboard, Projects, And Project Overview

**Files:**
- Modify: `frontend/src/features/dashboard/dashboard-page.tsx`
- Modify: `frontend/src/features/dashboard/dashboard-page.test.tsx`
- Modify: `frontend/src/features/projects/projects-page.tsx`
- Modify: `frontend/src/features/projects/projects-page.test.tsx`
- Modify: `frontend/src/features/projects/project-toolbar.tsx`
- Modify: `frontend/src/features/projects/status-tabs-bar.tsx`
- Modify: `frontend/src/features/projects/view-and-sort-controls.tsx`
- Modify: `frontend/src/features/project-overview/project-overview-page.tsx`
- Modify: `frontend/src/features/project-overview/project-overview-page.test.tsx`

- [ ] **Step 1: Add failing completeness tests**

Dashboard requires five metrics and the six approved content cards in a
three-column arrangement. Projects requires every visible canonical row and
all reference columns. Project Overview requires the full-width progress card,
left-wide/right-narrow layout, and four ordered right cards.

- [ ] **Step 2: Observe RED**

```bash
pnpm vitest run src/features/dashboard src/features/projects \
  src/features/project-overview
```

- [ ] **Step 3: Restore reference content and layout**

Remove duplicate page headings already owned by the calibrated shell. Restore
missing rows, thumbnails, labels, actions, and lower-page content visible at
the fixed viewport.

- [ ] **Step 4: Verify and commit**

```bash
node scripts/visual/capture-with-port.mjs 3000 dashboard /
node scripts/visual/capture-with-port.mjs 3000 projects /projects
node scripts/visual/capture-with-port.mjs 3000 project-overview /projects/ai-native-browser
node scripts/visual/diff-with-port.mjs 3000 dashboard
node scripts/visual/diff-with-port.mjs 3000 projects
node scripts/visual/diff-with-port.mjs 3000 project-overview
pnpm vitest run src/features/dashboard src/features/projects \
  src/features/project-overview
git add frontend/src/features/dashboard frontend/src/features/projects \
  frontend/src/features/project-overview
git commit -m "fix(core-pages): align dashboard projects and overview"
```

### Task 10: Repair Review, Publishing Center, Search, And Settings

**Files:**
- Modify: `frontend/src/features/review/analytics-review-page.tsx`
- Modify: `frontend/src/features/review/analytics-review-page.test.tsx`
- Modify: `frontend/src/features/publishing-center/publishing-center-page.tsx`
- Modify: `frontend/src/features/publishing-center/publishing-center-page.test.tsx`
- Modify: `frontend/src/features/search/search-page.tsx`
- Modify: `frontend/src/features/search/search-interactive-region.tsx`
- Modify: `frontend/src/features/search/search-page.test.tsx`
- Modify: `frontend/src/features/settings/settings-page.tsx`
- Modify: `frontend/src/features/settings/settings-interactive-region.tsx`
- Modify: `frontend/src/features/settings/settings-page.test.tsx`

- [ ] **Step 1: Add failing completeness tests**

Review must retain all five analysis categories and comparison/report regions.
Publishing Center must retain the reference table, status controls, metrics,
and actions. Search must have one global search input and the approved result
groups. Settings must reproduce the account, subscription, locale, model,
storage, notification, and security regions visible in the reference.

- [ ] **Step 2: Observe RED**

```bash
pnpm vitest run src/features/review src/features/publishing-center \
  src/features/search src/features/settings
```

- [ ] **Step 3: Correct the four views**

Match fixed-viewport density and section order. Keep all data deterministic and
do not introduce account, subscription, or publishing backend behavior.

- [ ] **Step 4: Verify and commit**

```bash
node scripts/visual/capture-with-port.mjs 3000 analytics-review /projects/ai-native-browser/review
node scripts/visual/capture-with-port.mjs 3000 publishing-center /publishing
node scripts/visual/capture-with-port.mjs 3000 search /search
node scripts/visual/capture-with-port.mjs 3000 settings /settings
node scripts/visual/diff-with-port.mjs 3000 analytics-review
node scripts/visual/diff-with-port.mjs 3000 publishing-center
node scripts/visual/diff-with-port.mjs 3000 search
node scripts/visual/diff-with-port.mjs 3000 settings
pnpm vitest run src/features/review src/features/publishing-center \
  src/features/search src/features/settings
git add frontend/src/features/review frontend/src/features/publishing-center \
  frontend/src/features/search frontend/src/features/settings
git commit -m "fix(global-pages): align review publishing search and settings"
```

### Task 11: Run The Complete Acceptance Matrix

**Files:**
- Modify: `frontend/tests/visual/all-pages.spec.ts` only if stabilization needs
  an explicit deterministic wait
- Create: `docs/superpowers/reports/2026-06-14-frontend-visual-acceptance.md`

- [ ] **Step 1: Verify source and behavior**

```bash
cd frontend
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:a11y
pnpm build
```

Expected: every command PASS with no console warnings.

- [ ] **Step 2: Run all visual comparisons**

```bash
CREATOROS_TEST_PORT=3299 pnpm test:visual
```

Expected: 17 route structure checks and 17 visual comparisons PASS at the
configured `0.005` threshold.

- [ ] **Step 3: Generate diagnostic report**

Start the production-equivalent local app, capture all 17 routes, and run the
diagnostic diff:

```bash
pnpm visual:capture-current
pnpm visual:diff
```

Write `docs/superpowers/reports/2026-06-14-frontend-visual-acceptance.md` with
one row per route:

```md
| Route | Reference SHA | Diff ratio | Unit | E2E | A11y | Visual |
|---|---|---:|---|---|---|---|
| dashboard | 7a1fb9... | 0.0042 | PASS | PASS | PASS | PASS |
```

Any ratio above `0.005` requires a documented rendering-only explanation and
explicit Controller acceptance; structural variance is not acceptable.

- [ ] **Step 4: Review git scope**

```bash
git status --short
git diff --check
git diff --stat origin/main...HEAD
```

Confirm no generated Playwright report, test result, `.next`, or current/diff
PNG artifact is staged.

- [ ] **Step 5: Final commit**

```bash
git add docs/superpowers/reports/2026-06-14-frontend-visual-acceptance.md
git commit -m "test(frontend): record final visual acceptance matrix"
```

### Task 12: Final Code Review And Integration Readiness

**Files:**
- Review all files changed by Tasks 1-11

- [ ] **Step 1: Run spec review**

Compare every route against:

- `frontend/SPEC.md`
- its section in `frontend/specs/page-specs.md`
- the matching `ui/*.png`
- `docs/superpowers/specs/2026-06-14-frontend-visual-fidelity-repair-design.md`

Reject added features, moved sections, duplicate shell elements, placeholders,
or page-owned shared-layout overrides.

- [ ] **Step 2: Run code-quality review**

Check deterministic fixtures, accessibility, component boundaries, class
duplication, console output, and test quality. Every visual fix must be
explainable by a reference detail.

- [ ] **Step 3: Re-run final verification**

```bash
cd frontend
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && \
  pnpm test:a11y && CREATOROS_TEST_PORT=3299 pnpm test:visual && pnpm build
```

Expected: PASS.

- [ ] **Step 4: Record final repository state**

```bash
git status --short
git log --oneline --decorate -15
```

Expected: clean worktree and a readable sequence of scoped repair commits.
