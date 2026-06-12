# CreatorOS Frontend Testing Strategy

## 1. Purpose

Testing protects product structure, shared shell behavior and visual fidelity. Tests must not become a second source of product design.

## 2. Test Stack

- Vitest
- React Testing Library
- `@testing-library/user-event`
- `@testing-library/jest-dom`
- Playwright Chromium
- `@axe-core/playwright` and/or `vitest-axe`

Async Server Components are verified through Playwright rather than Vitest component rendering.

## 3. Test Layers

| Layer | Scope |
|---|---|
| Unit | Pure selectors, ViewModel adapters and formatting |
| Component | Client behavior, form rules, tabs, focus, keyboard and callbacks |
| Route contract | Route renders the correct container, Header mode and active navigation |
| E2E | Navigation, Overlay URL behavior and critical page workflows |
| Accessibility | Automated axe checks plus explicit focus and name assertions |
| Visual | Approved page state at `1536 × 1024` |

Do not use large DOM snapshots. Do not assert Tailwind class strings or internal component structure when user-visible behavior is testable.

## 4. TDD Rule

Every behavior task follows:

1. Write one failing test.
2. Run it and verify it fails for the intended missing behavior.
3. Implement the smallest change that passes.
4. Run the focused test.
5. Run affected regression tests.
6. Refactor only while green.
7. Commit the task.

The implementer report must include the RED command and failure reason, then the GREEN command and passing result.

## 5. Deterministic Environment

All browser tests use:

- Chromium version locked by Playwright.
- Viewport `1536 × 1024`.
- Device scale factor `1`.
- Locale `zh-CN`.
- Timezone `Asia/Shanghai`.
- Reduced motion enabled.
- Stable font files loaded before screenshots.
- Fixed clock and fixture data.
- Disabled CSS animation, caret and blinking cursor.
- Explicit scroll position and selected UI state.
- No external network calls.

Unit tests reset URL state, localStorage, mocks, portals and browser API shims after every test.

## 6. Selector Policy

Use selectors in this order:

1. Role and accessible name.
2. Associated label.
3. Stable visible business text.
4. `data-testid` only for unavoidable canvas, chart or media boundaries.

Never select by Tailwind class, DOM depth, generated ID, array position or screen coordinates.

## 7. Per-Page Minimum Contract

Each page requires:

- Route renders without runtime errors.
- Exactly one shared Sidebar and TopHeader are present.
- Correct navigation item and Header mode are active.
- All top-level screenshot sections are present in the approved order.
- Canonical fixture values appear where expected.
- Every visible interactive control has at least one behavior assertion.
- Page passes automated accessibility checks.
- A deterministic implementation screenshot is produced.

Overlay pages additionally test URL synchronization, Escape/close behavior, focus trap, focus restoration and browser Back.

## 8. Visual Regression Protocol

The 17 files under `ui/` are design references, not direct Playwright golden snapshots.

Approval flow:

1. Implementer produces a screenshot for the exact approved route, fixture and state.
2. Spec Reviewer compares regions, structure, dimensions and visible content with the design reference.
3. After approval, the Controller creates or updates the Playwright baseline.
4. Code Quality Reviewer verifies deterministic setup and snapshot scope.
5. Implementers may not update snapshots to make a failing test pass.

Default threshold: `maxDiffPixelRatio` of `0.005`, subject to an approved exception recorded beside the test. Overlay screenshots compare the panel and overlay treatment, with unstable or mismatched background regions masked.

Baseline updates require a SPEC or design-reference change, reviewer approval and a separate commit.

## 9. Commands to Establish in Foundation

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:watch
pnpm test:e2e
pnpm test:visual
pnpm test:a11y
pnpm build
pnpm verify
```

`pnpm verify` must run lint, typecheck, unit/component tests and build. CI additionally runs Playwright, accessibility and visual suites.

## 10. Quality Gate

A task is not complete until:

- The intended RED failure was observed.
- Focused and affected tests pass.
- No test warnings or unhandled errors remain.
- Spec review passes before code-quality review starts.
- Both reviews approve the final commit.
- Visual baselines were not changed by the implementer.
