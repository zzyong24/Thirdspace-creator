# AI Copilot — Page Implementation Plan (Task 24)

## 1. Page Information

- Page: AI Copilot (centered dialog)
- Route: opened via `?copilot=open` on any page (intercepted by `frontend/src/app/(creator)/shell-router.tsx` + `frontend/src/components/overlays/overlay-controller.tsx`)
- Reference: `ui/AIchat.png`
- Container: `ModalOverlay` (centered, NOT right-side drawer)
- Header: underlying page's TopHeader (background is masked per D-006)
- Sidebar: underlying page's Sidebar (background is masked per D-006)
- Original image absolute path: `/Users/zyongzhu/Workbase/Thirdspace-creator/ui/AIchat.png`
- Original image SHA-256: `fda68da9f7a96d8c07f626bee03baeba889149de3e0eabf3e76805b9020cd6fc`
- Dependent tasks: Tasks 0–19 (AppShell, OverlayController, fixtures, tokens) — all merged

## 2. Original Image Observation

- Canvas: 1536 × 1024
- Main content origin: centered dialog (~max-w-3xl)
- Main column count: 1 (centered dialog) with internal 3-col dashboard
- Fixed regions: AppShell (background, masked)
- Scroll regions: dialog body (`max-h-[90vh] overflow-y-auto`)
- Overlay: yes, centered modal

## 3. Component Tree (page-specs §16)

```
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

## 4. Region Decomposition

| Order | Region | Position | Key Dimensions | Main Content |
|---|---|---|---|---|
| 1 | Header | top of dialog | full width, h-auto | title "AI 助手 / 你的个人创作 Copilot", close button |
| 2 | PromptComposer | below header | full width, h-auto | textarea, 4 chips, submit button |
| 3 | CopilotDashboard | middle | 3-col grid (md+) | RecommendedCommands, RecentTasks, ContinuingTasks |
| 4 | QuickEntries | below dashboard | 3-col grid (sm+) | 3 quick action buttons |
| 5 | SmartRecommendation | bottom | full width | 2 recommendation cards |

## 5. Component Reuse Plan

### `components/ui` reuse
| Component | Usage | Variant |
|---|---|---|
| `Button` | close, chips, submit, quick entries, recommended commands | ghost (close), outline (chips), default (submit) |
| `Card` | prompt composer, dashboard columns | default |
| `Badge` | recent task status | secondary / default / destructive |
| `Textarea` | prompt input | n/a |

### Shared business components
| Component | Usage |
|---|---|
| `AppShell` | underlying shell (mounted by `(creator)/layout.tsx`) |
| `OverlayController` | URL watch + focus trap + Escape + close + scroll lock |

### Page-internal components
| Component | Why not shared |
|---|---|
| `AICopilotDialog` | only one feature uses the dialog shell |
| `AICopilotContent` | only one feature renders the spec tree |

## 6. Data and State

- Use fixture: `COPILOT_FIXTURE` (locked, local to `ai-copilot-content.tsx`)
- ViewModel / selector: none (Server Component, no dynamic data)
- Default state: dialog closed (URL has no `?copilot=open`)
- Open state: URL has `?copilot=open`, dialog centered with mask
- Close state: URL has no `?copilot=open`; focus restores to trigger

## 7. Behavior Acceptance Criteria

| Given | When | Then | Test Layer |
|---|---|---|---|
| Any page, no query | default render | dialog not visible | RTL |
| Any page, `?copilot=open` | URL change | dialog opens centered, focus trapped, body scroll locked | RTL + Playwright |
| Dialog open, click `[data-overlay-close]` | click close button | URL drops only `copilot` query | RTL + Playwright |
| Dialog open, Escape key | key press | URL drops only `copilot` query | RTL |
| Dialog open, click backdrop | click overlay-mask | URL drops only `copilot` query | RTL |
| Submit button | click | no network call (`form` has no `action`) | RTL |

## 8. TDD and File Boundaries

- Writable files:
  - `frontend/src/components/overlays/ai-copilot-dialog.tsx`
  - `frontend/src/features/copilot/ai-copilot-content.tsx`
  - `frontend/src/features/copilot/ai-copilot-content.test.tsx`
  - `frontend/src/features/copilot/page-implementation-plan.md` (this file)
  - `frontend/tests/e2e/ai-copilot.spec.ts`
  - `frontend/tests/visual/pages/ai-copilot.spec.ts`
- Controller-only writes (this commit):
  - `frontend/src/components/overlays/overlay-controller.tsx` — center dialog + widen panel + add padding
  - `frontend/src/app/(creator)/shell-router.tsx` — import `AICopilotDialog` and replace the inline `CopilotPanel` placeholder
- Read-only files: `package.json`, `pnpm-lock.yaml`, fixtures, tokens, other feature dirs
- First failing test: import resolution of `@/components/overlays/ai-copilot-dialog` (RED)
- Component test command: `pnpm test -- ai-copilot`
- Playwright command: `pnpm test:e2e -- ai-copilot`
- Visual comparison region: the dialog panel (NOT the background page; background is masked per D-006)
- Visual mask region: the entire page outside the dialog

## 9. Restoration Order

1. Center the overlay (controller change) and replace the placeholder `CopilotPanel` (shell-router change).
2. Create `AICopilotDialog` shell.
3. Create `AICopilotContent` with the page-specs §16 component tree.
4. Write tests, run RED, GREEN, regression.
5. Generate visual spec; do not commit baseline.

## 10. Explicitly NOT Doing

- No message-thread UI.
- No real AI network request (`fetch`, `XMLHttpRequest`, `EventSource`).
- No new dependencies.
- No mutation of canonical fixtures.
- No changes to other pages, the Sidebar, the TopHeader, or the tokens.

## 11. Verification Screenshot

- Reference: `ui/AIchat.png`
- Implementation screenshot: not yet produced (Controller will approve baseline after review)
- Known differences: none expected at first run
- Difference reason: n/a
- Whether product confirmation is needed: no — atomic-level fidelity against the spec is the gate
