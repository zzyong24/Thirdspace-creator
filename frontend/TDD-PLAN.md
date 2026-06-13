# CreatorOS Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build the 17 CreatorOS frontend views with one shared AppShell, deterministic fixtures, strict visual fidelity and test-first delivery.

**Architecture:** Next.js App Router renders Server Components by default and isolates client behavior in small interactive components. A canonical typed fixture feeds page-specific selectors. Implementers run sequentially with spec review before code-quality review.

**Tech Stack:** Node.js 24 LTS, pnpm, Next.js, React, TypeScript strict, Tailwind CSS, shadcn/ui, Lucide React, Recharts, Vitest, React Testing Library, Playwright.

---

## Execution Rules

- No production feature code before an observed failing test.
- Foundation configuration is the only setup exception; it may not include page behavior.
- Every task is one commit after RED, GREEN, regression and self-review evidence.
- Every task receives the complete Task Packet defined in `AGENT-PROTOCOL.md`.
- Every page uses its approved section in `specs/page-specs.md` and a completed `specs/page-implementation-template.md`.
- Page implementation agents run sequentially.
- Spec review must pass before code-quality review begins.
- Visual baselines are committed by the Controller only.

## Phase 0: Repository and Runtime Gate

### Task 0: Establish the execution baseline

**Controller-only changes:**

- Initialize Git at `/Users/zyongzhu/Workbase/Thirdspace-creator`.
- Commit current product, backend, frontend and UI reference documents.
- Activate Node.js 24 LTS.
- Establish a root pnpm workspace containing `frontend` and `backend`.
- Create the frontend implementation worktree and feature branch.

**Verification:**

- [ ] `git status --short` is empty in the worktree.
- [ ] `git branch --show-current` is not `main` or `master`.
- [ ] `node --version` reports `v24.x`.
- [ ] All 17 `ui/*.png` files are tracked.
- [ ] Root `pnpm-workspace.yaml` includes `frontend` and `backend`.
- [ ] The worktree can resolve the absolute UI reference paths.

No implementation Agent may start before this task is complete.

## Phase 1: Foundation

### Task 1: Bootstrap Next.js without replacing the specs

**Files:**

- Create: `frontend/package.json`
- Create: `pnpm-workspace.yaml`
- Create: `pnpm-lock.yaml`
- Create: `frontend/next.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/eslint.config.mjs`
- Create: `frontend/postcss.config.mjs`
- Create: `frontend/components.json`
- Create: `frontend/src/app/layout.tsx`
- Create: `frontend/src/app/globals.css`
- Preserve: `frontend/*.md`, `frontend/specs/*.md`

**Steps:**

- [ ] Scaffold in a temporary directory with App Router, TypeScript, Tailwind, ESLint and `src/`.
- [ ] Merge generated files into the existing non-empty `frontend/` directory.
- [ ] Set TypeScript strict mode and pin pnpm in `packageManager`.
- [ ] Use the root workspace lockfile; do not create a second lockfile under `frontend/`.
- [ ] Initialize shadcn/ui once.
- [ ] Run `pnpm lint`, `pnpm typecheck` and `pnpm build`.
- [ ] Expected: all commands pass and no CreatorOS page is implemented.
- [ ] Commit only Foundation-owned files.

### Task 2: Establish the TDD and browser harness

**Files:**

- Create: `frontend/vitest.config.ts`
- Create: `frontend/playwright.config.ts`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/tests/e2e/smoke.spec.ts`
- Create: `frontend/tests/helpers/test-environment.ts`
- Modify: `frontend/package.json`

**RED/GREEN contract:**

- [ ] RED: write the smoke test for the root route and verify it fails because no CreatorOS route exists.
- [ ] GREEN: add only the minimum route placeholder needed for the harness to reach the app.
- [ ] Configure locale `zh-CN`, timezone `Asia/Shanghai`, viewport `1536 × 1024`, scale factor `1`, reduced motion and blocked external network.
- [ ] Establish `lint`, `typecheck`, `test`, `test:e2e`, `test:visual`, `test:a11y`, `build` and `verify` scripts.
- [ ] Run `pnpm verify` and `pnpm test:e2e`.
- [ ] Expected: smoke test passes with deterministic browser settings.

### Task 3: Define tokens, fonts and deterministic media

**Files:**

- Create: `frontend/src/styles/tokens.css`
- Create: `frontend/src/lib/icons.ts`
- Create: `frontend/src/lib/platform-icons.ts`
- Create: `frontend/src/test/tokens.test.ts`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/app/layout.tsx`

**RED/GREEN contract:**

- [ ] RED: tests require the approved semantic color, spacing, radius, shadow, Sidebar, Header and chart token names.
- [ ] GREEN: define the smallest token set shared by all reference pages.
- [ ] Add local deterministic font loading and local platform icon mapping.
- [ ] Verify no remote font, image or icon request occurs.
- [ ] Run `pnpm test tokens`, `pnpm typecheck` and `pnpm build`.

### Task 4: Create the typed canonical fixture contract

**Files:**

- Create: `frontend/src/types/domain.ts`
- Create: `frontend/src/types/view-models.ts`
- Create: `frontend/src/fixtures/canonical.ts`
- Create: `frontend/src/fixtures/scenarios.ts`
- Create: `frontend/src/fixtures/selectors/index.ts`
- Create: `frontend/src/fixtures/fixtures.test.ts`

**RED/GREEN contract:**

- [ ] RED: tests require stable IDs, the canonical project title, fixed clock, fixed ordering and valid entity relationships.
- [ ] GREEN: add the smallest canonical dataset covering all visible values in the 17 references.
- [ ] Add typed scenario selection for `default`, `empty`, `loading`, `error` and `selected`.
- [ ] Verify no fixture calls `Date.now`, `Math.random` or external network APIs.
- [ ] Run `pnpm test fixtures` and `pnpm typecheck`.

### Task 5: Install and test approved UI primitives

**Files:**

- Create/modify only: `frontend/src/components/ui/**`
- Create: `frontend/src/components/ui/ui-contract.test.tsx`

**Approved primitives:**

Button, Badge, Input, Textarea, Checkbox, Switch, Tabs, Toggle Group, Select, Dropdown Menu, Dialog, Sheet, Tooltip, Popover, Progress, Table, Form, Scroll Area, Separator, Avatar, Card and Chart.

**RED/GREEN contract:**

- [ ] RED: contract tests require accessible names, keyboard behavior and focus behavior for interactive primitives.
- [ ] GREEN: install only the approved shadcn/ui primitives.
- [ ] Style variants use shared tokens; no page-specific visual variants are added.
- [ ] Run focused UI tests, axe checks, typecheck and lint.

### Task 6: Implement the single AppShell

**Files:**

- Create: `frontend/src/app/(creator)/layout.tsx`
- Create: `frontend/src/app/(creator)/loading.tsx`
- Create: `frontend/src/app/(creator)/error.tsx`
- Create: `frontend/src/app/(creator)/not-found.tsx`
- Create: `frontend/src/components/shell/app-shell.tsx`
- Create: `frontend/src/components/shell/sidebar.tsx`
- Create: `frontend/src/components/shell/top-header.tsx`
- Create: `frontend/src/components/shell/page-scroll-area.tsx`
- Create: `frontend/src/components/shell/shell.test.tsx`
- Create: `frontend/tests/e2e/app-shell.spec.ts`

**RED/GREEN contract:**

- [ ] RED: route contract requires exactly one Sidebar and one TopHeader.
- [ ] RED: navigation test requires active item derived from pathname.
- [ ] GREEN: implement shared Shell and Header modes without page content.
- [ ] Verify the Sidebar assistant/storage content is a variant, not a duplicate component.
- [ ] Verify Header focus order and minimum desktop overflow behavior.
- [ ] After adding the first accessibility test, remove `--pass-with-no-tests` from `test:a11y`.
- [ ] Run Shell tests, AppShell E2E, axe, typecheck and build.

### Task 7: Implement shared business components

**Files:**

- Create/modify: `frontend/src/components/navigation/**`
- Create/modify: `frontend/src/components/project/**`
- Create/modify: `frontend/src/components/content/**`
- Create/modify: `frontend/src/components/resources/**`
- Create/modify: `frontend/src/components/publishing/**`
- Create/modify: `frontend/src/components/analytics/**`
- Create: `frontend/src/components/shared-contract.test.tsx`

**RED/GREEN contract:**

- [ ] RED: tests cover the exact shared component inventory approved in `specs/shared-components.md`.
- [ ] GREEN: implement only components used by at least two approved pages or with stable business meaning.
- [ ] Verify charts expose textual summaries and media components have deterministic fallbacks.
- [ ] Verify no shared component owns page routing or page fixture selection.
- [ ] Run focused tests, axe, typecheck and lint.

### Task 8: Implement Overlay routing and controller

**Files:**

- Create: `frontend/src/app/(creator)/@modal/default.tsx`
- Create: `frontend/src/app/(creator)/@modal/(.)projects/new/page.tsx`
- Create: `frontend/src/app/(creator)/projects/new/page.tsx`
- Create: `frontend/src/components/overlays/overlay-controller.tsx`
- Create: `frontend/src/components/overlays/overlay-routing.test.tsx`
- Create: `frontend/tests/e2e/overlay-routing.spec.ts`

**RED/GREEN contract:**

- [ ] RED: tests require intercepted New Project navigation and direct-route fallback.
- [ ] RED: tests require `?copilot=open` to preserve pathname and close with browser Back.
- [ ] GREEN: implement routing shells without the final dialog content.
- [ ] Verify focus trap, Escape behavior and trigger focus restoration contracts.
- [ ] Run focused tests, overlay E2E, axe and build.

## Phase 2: Page Tasks

Each page task follows this exact cycle:

1. Controller injects the approved page packet and reference hash.
2. Agent writes the listed component/route test and observes the intended failure.
3. Agent implements only the assigned route and feature files.
4. Agent runs focused tests, affected regression tests, axe and typecheck.
5. Agent produces the listed Playwright screenshot.
6. Agent commits; Spec Reviewer compares the image; Code Quality Reviewer reviews after spec approval.
7. Controller creates the approved visual baseline.

### Task 9: Dashboard

**Files:** `src/app/(creator)/page.tsx`, `src/features/dashboard/dashboard-page.tsx`, `src/features/dashboard/dashboard-page.test.tsx`, `tests/visual/pages/dashboard.spec.ts`

**Reference:** `ui/Dashboard.png`, SHA-256 `7a1fb9a5d07050f6744231fb16d49f1c26a0bf953441c214d780bbb0e1247bab`

**Tests:** one shared Shell; Home active; five metrics; three-column dashboard grid; visible Continue, Todo, Topics, Publications, Data and Suggestions sections; New Project entry routes to the overlay.

**Commands:** `pnpm test dashboard-page`, `pnpm test:visual dashboard`, `pnpm typecheck`.

- [ ] After adding the first visual test, remove `--pass-with-no-tests` from `test:visual`.

### Task 10: Projects

**Files:** `src/app/(creator)/projects/page.tsx`, `src/features/projects/projects-page.tsx`, `src/features/projects/projects-page.test.tsx`, `tests/e2e/projects.spec.ts`, `tests/visual/pages/projects.spec.ts`

**Reference:** `ui/Projects.png`, SHA-256 `fbabec5271523484fbedce5a8e0b31f4a741fe55708a8064f03a1cc85ccfe083`

**Tests:** Projects active; approved status tabs and counts; canonical project row contains stage, progress, platforms and update time; New Project opens `/projects/new`; list/grid and sort controls expose accessible state without inventing an unapproved layout.

**Commands:** `pnpm test projects-page`, `pnpm test:e2e projects`, `pnpm test:visual projects`.

### Task 11: New Project

**Files:** `src/components/overlays/new-project-dialog.tsx`, `src/features/projects/new-project-form.tsx`, `src/features/projects/new-project-form.test.tsx`, `tests/e2e/new-project.spec.ts`, `tests/visual/pages/new-project.spec.ts`

**Reference:** `ui/New Project.png`, SHA-256 `7c4e2a42c9d26b662bcfd4f47e9034068e38fc95abf7cf240ecbc57316db1bb4`

**Tests:** exact field order; platform/type/mode cards are keyboard-selectable; project name is required; Cancel closes without mutation; Create produces the approved local success transition; focus is trapped and restored; background is masked in visual comparison.

**Commands:** `pnpm test new-project-form`, `pnpm test:e2e new-project`, `pnpm test:visual new-project`.

### Task 12: Project Overview

**Files:** `src/app/(creator)/projects/[projectId]/page.tsx`, `src/features/project-overview/project-overview-page.tsx`, `src/features/project-overview/project-overview-page.test.tsx`, `tests/visual/pages/project-overview.spec.ts`

**Reference:** `ui/Project Overview.png`, SHA-256 `e599bfe55f3db65bfe5c98489502ebbb818ba67033bcc898bdc8764e11af37fa`

**Tests:** project-overview Header mode; full-width progress card; left-wide/right-narrow grid; five asset statistics; four right-rail cards in order; collaboration visuals do not expose team-management behavior.

**Commands:** `pnpm test project-overview-page`, `pnpm test:visual project-overview`, `pnpm typecheck`.

### Task 13: Research Workspace

**Files:** `src/app/(creator)/projects/[projectId]/research/page.tsx`, `src/features/research/research-workspace-page.tsx`, `src/features/research/research-workspace-page.test.tsx`, `tests/visual/pages/research.spec.ts`

**Reference:** `ui/Research Workspace.png`, SHA-256 `5ea16c42268955de0196e5827f3a47a5badfb4b0454ca28a1002ede6f041032b`

**Tests:** Research stage active; three trend cards; competitor table columns and threat levels; source tabs preserve approved order; notes, evidence and tags remain in the right rail.

**Commands:** `pnpm test research-workspace-page`, `pnpm test:visual research`.

### Task 14: Planning Workspace

**Files:** `src/app/(creator)/projects/[projectId]/planning/page.tsx`, `src/features/planning/planning-workspace-page.tsx`, `src/features/planning/planning-workspace-page.test.tsx`, `tests/visual/pages/planning.spec.ts`

**Reference:** `ui/Planning Workspace.png`, SHA-256 `079e097e2641f9b805129ab377da08e8266a51c58516793bc22af74e3ae26ca9`

**Tests:** Planning stage active; five planning tabs in approved order; four contract cards; separate core thesis; four-column structured thesis tree; evidence and key materials in the right rail.

**Commands:** `pnpm test planning-workspace-page`, `pnpm test:visual planning`.

### Task 15: Script Workspace

**Files:** `src/app/(creator)/projects/[projectId]/script/page.tsx`, `src/features/script/script-workspace-page.tsx`, `src/features/script/script-workspace-page.test.tsx`, `tests/e2e/script.spec.ts`, `tests/visual/pages/script.spec.ts`

**Reference:** `ui/Script Workspace.png`, SHA-256 `5f3ba4c96a1ced43a250b5ed2c5e9611aafb0ad079864d34238d1887173aa5df`

**Tests:** Script stage active; editor toolbar/document/status share one shell; visible timestamp and emphasis text; version strip remains below; right-rail order is Outline, AI Suggestions, Golden Quotes; toolbar controls expose approved state without a new editor framework.

**Commands:** `pnpm test script-workspace-page`, `pnpm test:e2e script`, `pnpm test:visual script`.

### Task 16: Production Workspace

**Files:** `src/app/(creator)/projects/[projectId]/production/page.tsx`, `src/features/production/production-workspace-page.tsx`, `src/features/production/production-workspace-page.test.tsx`, `tests/visual/pages/production.spec.ts`

**Reference:** `ui/Production Workspace.png`, SHA-256 `f73dff930936ab4eba1024c3f9dea0a96f6336c7901e39858589255aae9edf21`

**Tests:** Production stage active; three production mode cards; script/assets/preview/settings regions; asset category tabs and three-column thumbnails; settings groups in order; single horizontal timeline.

**Commands:** `pnpm test production-workspace-page`, `pnpm test:visual production`.

### Task 17: Publishing Workspace

**Files:** `src/app/(creator)/projects/[projectId]/publishing/page.tsx`, `src/features/project-publishing/publishing-workspace-page.tsx`, `src/features/project-publishing/publishing-workspace-page.test.tsx`, `tests/e2e/publishing-workspace.spec.ts`, `tests/visual/pages/publishing-workspace.spec.ts`

**Reference:** `ui/Publishing Workspace.png`, SHA-256 `46385cfd85ac360d83ab0bcd799646f81eb633ffefca2a370dc5f8e5c2638e5f`

**Tests:** Publishing stage active; three-column layout; field order and labels; platform cards remain separate; preview/checklist/tips order; Confirm Publish uses fixture-only local behavior and performs no network publication.

**Commands:** `pnpm test publishing-workspace-page`, `pnpm test:e2e publishing-workspace`, `pnpm test:visual publishing-workspace`.

### Task 18: Analytics & Review

**Files:** `src/app/(creator)/projects/[projectId]/review/page.tsx`, `src/features/review/analytics-review-page.tsx`, `src/features/review/analytics-review-page.test.tsx`, `tests/visual/pages/analytics-review.spec.ts`

**Reference:** `ui/Analytics & Review.png`, SHA-256 `b2636a275b328b96495d2f2a280e709111ecffe45f2f6649f5a8d2dd5fae4c59`

**Tests:** Review stage active; seven metric cards in one row; views trend and conversion funnel chart types; three secondary charts; key moments; AI analysis and review history right rail; all charts provide text alternatives.

**Commands:** `pnpm test analytics-review-page`, `pnpm test:visual analytics-review`, `pnpm test:a11y analytics-review`.

### Task 19: Knowledge & Memory

**Files:** `src/app/(creator)/knowledge/page.tsx`, `src/features/knowledge/knowledge-page.tsx`, `src/features/knowledge/knowledge-page.test.tsx`, `tests/visual/pages/knowledge.spec.ts`

**Reference:** `ui/Knowledge & Memory.png`, SHA-256 `85c96a181b9113ff9e638b3d14b6309e0a3ed556887471f99f6dddc7cea6c82b`

**Tests:** Knowledge active; global route remains outside project routes; contextual project identity follows D-002; five metrics; category/list/insight three-column region; graph remains on the same page; insight blocks retain order.

**Commands:** `pnpm test knowledge-page`, `pnpm test:visual knowledge`.

### Task 20: Assets Center

**Files:** `src/app/(creator)/assets/page.tsx`, `src/features/assets/assets-page.tsx`, `src/features/assets/assets-page.test.tsx`, `tests/e2e/assets.spec.ts`, `tests/visual/pages/assets.spec.ts`

**Reference:** `ui/Assets Center.png`, SHA-256 `a3336cd1388ba223b4879cf93078c5b78c2f886c791abc17a0b2b153d7ba2402`

**Tests:** Assets active; internal type sidebar is distinct from global Sidebar; three-column asset grid; selecting an asset updates the fixed detail panel; media types have distinct deterministic thumbnails; shared Sidebar uses approved storage variant.

**Commands:** `pnpm test assets-page`, `pnpm test:e2e assets`, `pnpm test:visual assets`.

### Task 21: Publishing Center

**Files:** `src/app/(creator)/publishing/page.tsx`, `src/features/publishing-center/publishing-center-page.tsx`, `src/features/publishing-center/publishing-center-page.test.tsx`, `tests/visual/pages/publishing-center.spec.ts`

**Reference:** `ui/Publishing Center.png`, SHA-256 `5c678851e540b151c9e6c50dc5d956cd99a35b8ffdca5866a2863c796629967a`

**Tests:** Publishing active; content type tabs; publication table preserves approved columns; analytics rail order is metrics, platform comparison, trend, top content; platform icons and thumbnails remain visible.

**Commands:** `pnpm test publishing-center-page`, `pnpm test:visual publishing-center`.

### Task 22: Experience Center

**Files:** `src/app/(creator)/experience/page.tsx`, `src/features/experience/experience-page.tsx`, `src/features/experience/experience-page.test.tsx`, `tests/visual/pages/experience.spec.ts`

**Reference:** `ui/Experience Center.png`, SHA-256 `609023b1435725b22b4e95c9ad3b68844c3562ad74b28575a9225ecfa46ba0bb`

**Tests:** Experience active; seven tabs in approved order; four summary cards; recent discoveries list; six category cards including failures; right-rail blocks preserve order.

**Commands:** `pnpm test experience-page`, `pnpm test:visual experience`.

### Task 23: Global Search

**Files:** `src/app/(creator)/search/page.tsx`, `src/features/search/search-page.tsx`, `src/features/search/search-page.test.tsx`, `tests/e2e/search.spec.ts`, `tests/visual/pages/search.spec.ts`

**Reference:** `ui/search.png`, SHA-256 `e384830beb6b9b1e341e357cab5a27ca2aeb19b7fa91933a17d9a99da4d511ec`

**Tests:** search Header mode contains the single global search field; result sections remain typed and ordered; project results use three cards; asset/video thumbnails remain horizontal; right rail preserves filters, actions, history and tips; search query is represented in URL state.

**Commands:** `pnpm test search-page`, `pnpm test:e2e search`, `pnpm test:visual search`.

### Task 24: AI Copilot

**Files:** `src/components/overlays/ai-copilot-dialog.tsx`, `src/features/copilot/ai-copilot-content.tsx`, `src/features/copilot/ai-copilot-content.test.tsx`, `tests/e2e/ai-copilot.spec.ts`, `tests/visual/pages/ai-copilot.spec.ts`

**Reference:** `ui/AIchat.png`, SHA-256 `fda68da9f7a96d8c07f626bee03baeba889149de3e0eabf3e76805b9020cd6fc`

**Tests:** `?copilot=open` opens the centered dialog; close removes only that query; browser Back closes it; prompt and action chips share the top card; three dashboard columns and bottom entries remain ordered; no message-thread UI or real AI request is added; background is masked.

**Commands:** `pnpm test ai-copilot-content`, `pnpm test:e2e ai-copilot`, `pnpm test:visual ai-copilot`.

### Task 25: Settings

**Files:** `src/app/(creator)/settings/page.tsx`, `src/features/settings/settings-page.tsx`, `src/features/settings/settings-page.test.tsx`, `tests/e2e/settings.spec.ts`, `tests/visual/pages/settings.spec.ts`

**Reference:** `ui/Settings.png`, SHA-256 `ab32cc156f193da770064434f8b6313a39cede2eb2c656292fe3c5ba7bcef094`

**Tests:** Settings active; eight tabs in approved order; left-wide/right-narrow grid; account/preferences/system card order; storage/model/other card order; controls have labels and fixture-only local state; no team, subscription detail page or server persistence.

**Commands:** `pnpm test settings-page`, `pnpm test:e2e settings`, `pnpm test:visual settings`.

## Phase 3: Whole-System Verification

### Task 26: Route, accessibility and visual matrix

**Files:**

- Create: `frontend/tests/e2e/all-routes.spec.ts`
- Create: `frontend/tests/accessibility/all-pages.spec.ts`
- Create: `frontend/tests/visual/all-pages.spec.ts`
- Create: `frontend/tests/fixtures/routes.ts`

**RED/GREEN contract:**

- [ ] RED: matrix tests require all 17 approved views and canonical states.
- [ ] GREEN: add only missing route metadata or test setup; do not redesign pages.
- [ ] Verify every route has one Sidebar and one TopHeader.
- [ ] Verify no external network access and no console errors.
- [ ] Run `pnpm verify`, `pnpm test:e2e`, `pnpm test:a11y` and `pnpm test:visual`.
- [ ] Expected: all suites pass against Controller-approved baselines.

### Task 27: Final independent review

- [ ] Dispatch a fresh final Spec Reviewer across the complete diff.
- [ ] Dispatch a fresh final Code Quality Reviewer only after spec approval.
- [ ] Resolve every finding through the owning Agent and repeat the relevant review.
- [ ] Run the complete verification suite from a clean worktree.
- [ ] Record exact commands, results, final SHA and known approved visual exceptions.
- [ ] Use the finishing-development-branch workflow for integration.
