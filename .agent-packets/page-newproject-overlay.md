# Task Packet: page-newproject-overlay

> Issued by Controller (session 2026-06-14). Status when issued: parent branch
> `feat/frontend-implementation` HEAD `dac42e0`. Implementation currently at
> **57.24% pixel diff** vs the reference image — the worst of all 17 routes.
> Acceptance: bring the implementation to **≤ 0.5% pixel diff** (the
> Controller-approved `maxDiffPixelRatio: 0.005`) and have the visual matrix
> pass for this route, without regressing the other 16 routes.

## 1. Page information

| Field | Value |
|---|---|
| Page ID | `new-project-overlay` |
| Route | `/projects/new` |
| Reference image (absolute) | `/Users/zyongzhu/Workbase/Thirdspace-creator/ui/New Project.png` |
| Reference image SHA-256 | `7c4e2a42c9d26b662bcfd4f47e9034068e38fc95abf7cf240ecbc57316db1bb4` |
| Container type | `ModalOverlay` |
| Header mode | uses underlying page header (i.e. global) |
| Sidebar active | `projects` (uses underlying page sidebar) |
| Canvas | 1536 × 1024 |
| Dependencies | None new — Shell, Sidebar, TopHeader, NewProjectDialog are already in place per merge of `feat/page-newproject-aichat` |
| Worktree | `/Users/zyongzhu/Workbase/Thirdspace-creator/.worktrees/frontend-implementation` |
| Branch | `feat/frontend-implementation` |
| Base SHA at issue | `dac42e0` |

## 2. Reference image observation

- Canvas: 1536 × 1024
- Main content anchor: large centered white modal dialog occupying ~middle half of the canvas, with the rest of the page dimmed by a gray overlay
- Underlying page: `/projects` (Projects list) — visible as muted background through the overlay
- Dialog internal structure: see §3 component tree
- Scroll area: none (modal fits canvas)
- Overlay: gray dimmer at ~50% opacity

## 3. Component tree (from `frontend/specs/page-specs.md` §3, approved)

```text
NewProjectDialog
├── DialogHeader
├── ProjectNameField
├── ProjectBriefField
├── TargetPlatformSelector
├── ContentTypeSelector
├── CreationModeSelector
├── DialogHint
└── DialogFooter
    ├── EnterAfterCreateCheckbox
    ├── CancelButton
    └── CreateButton
```

## 4. Restoration要点 (from page-specs.md)

- Centered large white modal, underlying page grayed out
- Form order must match the reference exactly
- Platform, content type and creation mode are horizontal selector cards
- Creation mode cards include "推荐 / 省心 / 自由" auxiliary markers
- Background Dashboard is **masked** by D-006; visual review compares the dialog and overlay treatment, not the background

## 5. 禁止改变 (DO NOT)

- Do not split into a multi-step Wizard
- Do not break out into a separate page
- Do not add a template marketplace or advanced-settings step
- Do not redesign the background Dashboard (it's masked per D-006)

## 6. Applicable decision-log entries (D-001 through D-011)

- **D-001** Personal product: keep any comment-like icons as static placeholders
- **D-005** Page heading vs TopHeader: the modal uses the underlying page's TopHeader — do not create a second header
- **D-006** Overlay background mismatch: the reference's background Dashboard state is not the canonical Dashboard; mask it during review
- **D-007** Empty/Loading/Error states: not new designs, use shared components
- **D-009** Desktop-first 1536×1024, min 1280px
- **D-010** Canonical time fixture (zh-CN / Asia/Shanghai)

## 7. Immutable rules (must be followed verbatim)

- Use the single shared AppShell, Sidebar and TopHeader
- Do not redesign, reorder, add or remove product structure
- Reuse approved `components/ui` and shared business components
- **Do not add dependencies** (no new packages, no version bumps)
- Do not import backend repository, service, database or infrastructure code into the frontend
- Do not modify files outside the owned scope (§9)
- Do not change canonical fixtures from a page task
- Do not use randomness, current time, remote data or unstable assets
- Keep Client Components as small interactive islands
- Follow strict RED-GREEN-REFACTOR
- **Do not update visual baselines** — `tests/visual/__screenshots__/reference-images/` is Controller-only
- If the task conflicts with a SPEC, return `NEEDS_CONTEXT`; do not decide

## 8. Public APIs available

- `AppShell` / `Sidebar` / `TopHeader` are in `frontend/src/components/shell/`
- `NewProjectDialog` lives at `frontend/src/components/overlays/new-project-dialog.tsx`
- `OverlayController` lives at `frontend/src/components/overlays/overlay-controller.tsx`
- `useOverlayState` hook if present in `frontend/src/components/overlays/`
- `components/ui/*` (Button, Input, Textarea, Checkbox, Card, etc.) — prefer reuse
- `frontend/src/features/projects/new-project-form.tsx` is the form body

## 9. File ownership (this task)

| Status | Path |
|---|---|
| **May write** | `frontend/src/components/overlays/new-project-dialog.tsx` |
| **May write** | `frontend/src/features/projects/new-project-form.tsx` |
| **May write** | `frontend/src/features/projects/projects-page.tsx` (only to wire the modal trigger if it's broken) |
| **May write** | `frontend/src/app/(creator)/projects/new/page.tsx` (only the page that mounts the overlay if it's broken) |
| **May write** | focused tests under `frontend/tests/visual/pages/new-project-overlay.spec.ts` and `frontend/src/features/projects/*.test.tsx` for the new-dialog logic |
| Read-only | `frontend/src/components/shell/**`, `frontend/src/components/ui/**`, `frontend/src/lib/**`, `frontend/src/fixtures/**`, `frontend/src/app/(creator)/shell-router.tsx`, all shared business components, all tokens, `frontend/tests/fixtures/routes.ts`, all visual baselines |
| **Forbidden** | `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `playwright.config.ts`, any other page's `*-page.tsx` |

If you find you need to change anything in read-only or forbidden scope, **stop and return `NEEDS_CONTEXT`**.

## 10. Component reuse

- Reuse from `components/ui`: `Button`, `Input`, `Textarea`, `Checkbox`, `Card`, `Label`, `Separator`, `Dialog` (from `@base-ui/react`)
- Reuse shared business components where applicable (`ProjectNameField`, `TargetPlatformSelector`, etc., if already extracted)

Do **not** create new abstraction layers. If a shared component doesn't exist and is needed only for this page, keep it local.

## 11. Acceptance criteria (Given/When/Then)

| Given | When | Then | Level |
|---|---|---|---|
| Visual matrix runs | New Project overlay route | `toHaveScreenshot()` for `new-project-overlay` passes (diff ≤ 0.5%) | Playwright |
| Visual matrix runs | Other 16 routes | No regression vs current state (each must remain ≤ 0.5% improvement, never worse) | Playwright |
| `pnpm lint && pnpm typecheck && pnpm test && pnpm build` | run in worktree | All pass | Vitest + tsc + ESLint + Next |
| `node scripts/visual/diff.mjs` | run | `new-project-overlay` reports `diffRatio ≤ 0.005` in `diff-report.json` | Custom |
| Page route `/projects/new` | visited in browser | Modal renders centered with white background, gray dimmer visible behind | Visual |

## 12. Visual route, fixture, state, comparison regions, masks

- Route: `/projects/new` (or use the new-project-overlay mount in the test harness)
- Fixture: canonical Projects page state from `frontend/src/fixtures/projects.ts`
- State: empty new-project form (no inputs filled)
- Comparison: full canvas 1536×1024
- **Mask** (D-006): the underlying page background. The diff.mjs comparison is whole-canvas, but the reference's background is itself non-canonical; treat background divergence as lower-priority than modal structure

## 13. Required verification commands

```bash
cd /Users/zyongzhu/Workbase/Thirdspace-creator/.worktrees/frontend-implementation/frontend

# 1. Per-page visual test (this is your RED/GREEN signal)
pnpm exec playwright test --project=visual -g "new-project-overlay"

# 2. Whole matrix regression (don't break other 16)
pnpm exec playwright test --project=visual

# 3. Diff script (the most precise signal)
pnpm visual:capture-current && pnpm visual:diff

# 4. Type/lint/test/build
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Artifact paths:

- Current capture: `tests/visual/__artifacts__/current/new-project-overlay.png`
- Diff overlay (red): `tests/visual/__artifacts__/diff/new-project-overlay.png`
- Per-page report: `tests/visual/__artifacts__/diff-report.json`

## 14. Required report format

After your work, report with this exact shape:

```text
Status: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED

Files changed:
  - <path>
  - <path>

RED command + observed:
  $ pnpm exec playwright test --project=visual -g "new-project-overlay"
  -> <failure summary>

GREEN command + result:
  $ pnpm exec playwright test --project=visual -g "new-project-overlay"
  -> <pass summary>

Regression run:
  $ pnpm exec playwright test --project=visual
  -> <X passed, Y failed; list any Y that were previously passing>

Diff report excerpt:
  new-project-overlay: <0.NN%>

Screenshot path:
  /Users/zyongzhu/Workbase/Thirdspace-creator/.worktrees/frontend-implementation/frontend/tests/visual/__artifacts__/current/new-project-overlay.png

Commit SHA: <sha>

Self-review findings:
  - ...

Concerns / requested context / blockers:
  - <or "none">
```

## 15. Important first-step diagnostic

The current 57.24% diff is dramatically worse than any other route. Before
making any pixel-level changes, investigate whether:

1. The modal is even mounting — open the page in a browser (or read the page's
   test-failed screenshot in `test-results/`) and confirm a dialog is visible
2. The dialog is centered (the reference is a centered dialog, not a side panel)
3. The dimmer overlay is present
4. All form fields are rendered

If any of the above is structurally missing, fix the structure first, then
iterate on pixel fidelity. A structural fix can take the diff from 57% → 15% in
one commit, and is more tractable than pixel work on a broken layout.

## 16. Working in parent worktree

Per session 2026-06-14 decision: all subagents work in the parent worktree
`.worktrees/frontend-implementation` on branch `feat/frontend-implementation`.
Subagents do **not** create their own worktrees. Your commits land directly
on the parent branch. If the next subagent finds a regression in your work,
they will fix it after you; coordinate via the `Files changed:` and `Commit
SHA:` fields in your report.
