# Task Packet: page-ai-copilot-overlay

> Issued by Controller (session 2026-06-14). Status when issued: parent branch
> `feat/frontend-implementation` HEAD `dac42e0`. Implementation currently at
> **16.98% pixel diff** vs the reference image.
> Acceptance: bring the implementation to **≤ 0.5% pixel diff** and have the
> visual matrix pass for this route, without regressing other 16 routes.

## 1. Page information

| Field | Value |
|---|---|
| Page ID | `ai-copilot-overlay` |
| Route | `/?copilot=open` |
| Reference image (absolute) | `/Users/zyongzhu/Workbase/Thirdspace-creator/ui/AIchat.png` |
| Reference image SHA-256 | `fda68da9f7a96d8c07f626bee03baeba889149de3e0eabf3e76805b9020cd6fc` |
| Container type | `ModalOverlay` |
| Header mode | underlying page header (global, dashboard) |
| Sidebar active | `home` (underlying page sidebar) |
| Canvas | 1536 × 1024 |
| Worktree | `/Users/zyongzhu/Workbase/Thirdspace-creator/.worktrees/frontend-implementation` |
| Branch | `feat/frontend-implementation` |
| Base SHA at issue | `dac42e0` (use current HEAD if ahead) |

## 2. Reference image observation

- Centered modal dialog, white background
- Width: ≥ half the canvas
- Top of dialog: input area with submit button + suggested action chips in one card
- Middle: 3 columns — RecommendedCommands / RecentTasks / ContinuingTasks
- Bottom: QuickEntries and SmartRecommendation
- Background: Dashboard with gray dimmer overlay (masked per D-006)

## 3. Component tree (from `frontend/specs/page-specs.md` §16, approved)

```text
AICopilotDialog
├── CopilotHeader
├── PromptComposer
│   ├── PromptInput
│   ├── SuggestedActionChips
│   └── SubmitButton
├── CopilotDashboard
│   ├── RecommendedCommands
│   ├── RecentTasks
│   └── ContinuingTasks
├── QuickEntries
└── SmartRecommendation
```

## 4. Restoration要点 (from page-specs.md)

- Modal centered, width ≥ half the canvas
- Top: input + quick actions in one card
- Middle: 3 columns (recommended / recent / continuing)
- Bottom: quick entries + smart recommendation
- Background Dashboard dimmer must be visible (D-006 — background is masked, not part of comparison)

## 5. 禁止改变 (DO NOT)

- Do not change to a right-side chat drawer
- Do not change to a regular message-stream interface
- Do not add an Agent marketplace
- Do not redesign the underlying Dashboard

## 6. Applicable decision-log entries

- D-001 Personal product: static placeholders
- D-005 Heading via underlying page TopHeader
- **D-006 Overlay background mismatch: the background Dashboard is not the canonical Dashboard; mask it during review**
- D-007 Empty/Loading/Error states
- D-009 Desktop-first 1536×1024, min 1280px
- D-010 Canonical time fixture

## 7. Immutable rules (must be followed verbatim)

Same as other packets — see new-project-overlay §7. Critical:
- No new dependencies
- No shell / ui / lib / fixtures / shared changes
- No baseline updates
- Return `NEEDS_CONTEXT` if out of scope

## 8. Public APIs available

- `frontend/src/components/overlays/ai-copilot-dialog.tsx`
- `frontend/src/components/overlays/overlay-controller.tsx`
- `frontend/src/features/copilot/ai-copilot-content.tsx`
- `frontend/src/app/(creator)/page.tsx` (home route — may need to ensure `?copilot=open` triggers the dialog)
- Components: `CopilotHeader`, `PromptComposer`, `CopilotDashboard`, `RecommendedCommands`, `RecentTasks`, `ContinuingTasks`, `QuickEntries`, `SmartRecommendation`

## 9. File ownership (this task)

| Status | Path |
|---|---|
| **May write** | `frontend/src/components/overlays/ai-copilot-dialog.tsx` |
| **May write** | `frontend/src/features/copilot/ai-copilot-content.tsx` |
| **May write** | `frontend/src/components/overlays/overlay-controller.tsx` (if needed to wire `?copilot=open` to dialog) |
| **May write** | `frontend/src/app/(creator)/page.tsx` (home page — only to wire the copilot trigger if missing) |
| **May write** | `frontend/tests/visual/pages/ai-copilot.spec.ts` |
| Read-only | shell, ui, lib, fixtures, shell-router, other pages, dashboard-page |
| **Forbidden** | package.json, lockfile, tsconfig, playwright config, baselines, other pages' files, AppShell, TopHeader internals |

## 10. Component reuse

- Reuse the same overlay infrastructure as `new-project-overlay` (shared `OverlayController`)
- Reuse `PromptInput` if extracted
- Do not duplicate the modal shell — extend the existing one

## 11. Acceptance criteria

| Given | When | Then | Level |
|---|---|---|---|
| Visual matrix runs | Copilot route | `toHaveScreenshot()` for `ai-copilot-overlay` passes (diff ≤ 0.5%) | Playwright |
| Other 16 routes | matrix runs | No regression | Playwright |
| `pnpm lint && pnpm typecheck && pnpm test && pnpm build` | run | All pass | tooling |
| `node scripts/visual/diff.mjs` | run | `ai-copilot-overlay` reports `diffRatio ≤ 0.005` | Custom |

## 12. Visual route, fixture, state, comparison regions, masks

- Route: `/?copilot=open`
- Fixture: canonical dashboard + copilot content
- State: dialog open, default state
- Comparison: full canvas 1536×1024
- **Mask** (D-006): the background Dashboard region. Treat background divergence as lower-priority; focus on the dialog itself.

## 13. Required verification commands

```bash
cd /Users/zyongzhu/Workbase/Thirdspace-creator/.worktrees/frontend-implementation/frontend
pnpm exec playwright test --project=visual -g "ai-copilot-overlay"
pnpm exec playwright test --project=visual
pnpm visual:capture-current && pnpm visual:diff
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Artifacts: `__artifacts__/current/ai-copilot-overlay.png`, `__artifacts__/diff/ai-copilot-overlay.png`, `__artifacts__/diff-report.json`.

## 14. Required report format

Per AGENT-PROTOCOL §7.

## 15. First-step diagnostic

16.98% is moderate. Investigate:
1. Does `?copilot=open` actually open the dialog? (check `overlay-controller.tsx`)
2. Is the dialog centered? Width ≥ half the canvas?
3. Is the top input + suggested chips in one card?
4. Is the 3-column middle (recommended / recent / continuing) visible?
5. Is the bottom (QuickEntries + SmartRecommendation) present?
6. Is the dimmer overlay visible behind the dialog?

If the dialog doesn't open at all, debug the overlay controller and home-page wiring — those are in your owned scope.

## 16. Working in parent worktree, parallel with other agents

Per session decision. If you hit `fatal: Unable to create '.git/index.lock'`, wait 5 seconds and retry. **Note: you and the new-project-overlay agent both edit `frontend/src/components/overlays/overlay-controller.tsx`. Coordinate carefully — the file may have moved when their commit lands. Re-read the file after any conflict warning, and prefer to add your own hook for copilot rather than modify the new-project hook.**

Your primary owned files (`ai-copilot-dialog.tsx`, `ai-copilot-content.tsx`) do not overlap with new-project-overlay's primary files (`new-project-dialog.tsx`, `new-project-form.tsx`).
