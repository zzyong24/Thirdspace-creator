# Shared Visual Layer — Change Request for Phase 3

Date: 2026-06-14
Branch: `feat/shared-visual-layer`
Controller: Phase 2 shared-visual calibration
Consumers: All 16 Phase 3 page agents

This document captures every change made by Phase 2 to the **shared visual
layer** (tokens, shell, ui, project components) so Phase 3 agents can
inherit a consistent visual baseline.

## 1. Token changes (`frontend/src/styles/tokens.css`)

| Variable | Old | New | Rationale (design measurement) |
|---|---|---|---|
| `--creatoros-header-height` | `80px` | `72px` | Dashboard.png top header is ~64-72px tall, not 80 |
| `--creatoros-page-gutter` | `32px` | `24px` | Denser vertical spacing; design sections are tightly packed |
| `--creatoros-sidebar-width` | `224px` | `224px` | UNCHANGED — already matches design |
| `--creatoros-section-gap` | `20px` | `20px` | UNCHANGED |
| `--creatoros-card-gap` | `16px` | `16px` | UNCHANGED |
| `--creatoros-radius-card` | `12px` | `12px` | UNCHANGED |
| `--creatoros-radius-control` | `8px` | `8px` | UNCHANGED |
| `--creatoros-radius-panel` | `16px` | `16px` | UNCHANGED |
| Brand / surface / border colors | — | UNCHANGED | All within ±5 of design |

**Important**: any Phase 3 page that assumed a 80px header (e.g. pages
with absolute-positioned overlays) must update to 72px. Likewise, any
page padding that was 32px should now use 24px unless there is a specific
design override.

## 2. Shell component changes

### `frontend/src/components/shell/sidebar.tsx`

- Inner padding: `px-4 py-(--page-gutter)` → `px-3 py-5` (tighter)
- Brand text: 14px → **15px semibold**, sparkles box `size-7 rounded-md`
- Primary nav items: 14px → **13px**, gap-2 → gap-2.5, h-9 px-2.5 (unchanged size)
- AI assistant card: `rounded-card` → **`rounded-xl`**
- Slots unchanged: `data-slot="app-sidebar"`, `data-slot="sidebar-brand"`,
  `data-slot="sidebar-nav-item"`, `data-slot="sidebar-contextual-card"`,
  `data-slot="sidebar-user-profile"` — **all preserved**.

### `frontend/src/components/shell/top-header.tsx`

- Inner gap: `(--section-gap)` (20px) → `gap-3` (12px)
- Height: now reads from `--creatoros-header-height` (72px) — applied via `h-header`
- All slots preserved (`data-slot="app-top-header"`, `header-page-heading`,
  `header-project-identity`, `header-stage-stepper`, `header-search`,
  `header-actions`).

## 3. Project shared component changes

### `frontend/src/components/project/metric-card.tsx`
- rounded-2xl → **rounded-xl** (12px)
- p-(--card-gap) → **px-4 py-3** (tighter)
- gap-2 → **gap-1.5**
- value text-xl → **text-[22px] leading-tight** (was 24px)
- `data-slot`, `data-tone`, `data-trend` props preserved.

### `frontend/src/components/project/section-card.tsx`
- CardTitle: text-md (16px) → **text-[15px]**
- Title-description gap: gap-1 → **gap-0.5**
- `data-slot`, `data-size` preserved.

### `frontend/src/components/project/status-badge.tsx`
- rounded-4xl → **rounded-md** (square pill)
- text-xs → **text-[11px]** font-medium
- px-2 → **px-1.5**, h-5 explicit
- Tone classes (TONE_CLASS) unchanged — color logic identical.

### `frontend/src/components/project/progress-bar.tsx`
- Track height: h-1.5 → **h-2** (8px)
- Tone logic unchanged.

## 4. UI primitives — no semantic changes

All 22 shadcn primitives preserved. Only tested `data-slot`s:
`button`, `card`, `card-header`, `card-title`, `card-content`,
`card-footer`, `input`, `badge`, `avatar`, `separator`, `popover`,
`dropdown-menu`, `scroll-area`, `progress`, `tooltip`, `dialog`, `sheet`,
`tabs`, `select`, `switch`, `checkbox`, `form`, `textarea`, `table`,
`toggle-group`, `chart`.

**Phase 3 agents MUST NOT** add new variants or props to any of these
primitives without coordinating with the controller. If you find yourself
needing a new variant (e.g. `MetricCard size="xl"`), file a request first.

## 5. New test contracts

### `frontend/src/components/shell/shell.test.tsx`
Added 6 geometry / role tests:
- Sidebar width CSS variable in `[220, 232]px`
- Header height CSS variable in `[64, 80]px`
- Page gutter CSS variable in `[24, 40]px`
- Section gap CSS variable in `[16, 24]px`
- Sidebar nav has 7 items, active carries `aria-current="page"`
- Sidebar user profile shows plan label
- Top header renders search trigger + bell + share + more + primary CTA

### `frontend/src/components/ui/ui-contract.test.tsx`
Added 5 visual / contract tests:
- Card radius CSS variable in `[10, 16]px`
- `MetricCard` renders label, value, trend
- `StatusBadge` renders label for `status="active"`
- `ProgressBar` exposes `aria-valuetext` percentage
- `SectionCard` exposes labelled region

## 6. Shared-layer-unresolvable deviations (Phase 3 territory)

These items are **NOT** shared-layer issues. They require Phase 3 page
agents to fix in their respective features:

| Symptom | Route | Phase 3 file |
|---|---|---|
| Dashboard greeting "早午晚 + Kevin" + 5 different metric cards (进行中/已发布/累计播放/素材库/存储使用) | `/` | `features/dashboard/page.tsx` |
| Project workspace header empty (no project title in top-bar) | `/projects/*` | shell-router or features |
| Projects page list rendering different card structure | `/projects` | `features/projects/page.tsx` |
| Research workspace showing "未找到项目" | `/projects/.../research` | `features/research/page.tsx` |
| User profile showing initials "ZZ" badge instead of design's just avatar+name | all | `features/*` (or sidebar override) |
| Sidebar shows `contextSection` (project quick access) on certain pages | all | per-page via `sidebarContext` prop |

## 7. Helpers added (non-locked-script wrappers)

- `scripts/visual/capture-with-port.mjs` — port-aware screenshot capture.
  Does NOT modify `capture-current.mjs` / `diff.mjs` / `verify-shas.mjs` /
  `install-baselines.mjs` (all 4 are Phase 1 locked).
- `scripts/visual/measure-shell.mjs` — measures rendered sidebar/header geometry.
- `scripts/visual/measure-design.mjs` — samples pixels in reference PNGs.

## 8. Phase 1 integrity verified

- `pnpm visual:verify-shas` → 17/17 matched (Phase 1 baseline fingerprint preserved)
- `frontend/playwright.config.ts` UNCHANGED
- `frontend/tests/fixtures/routes.ts` UNCHANGED
- `frontend/tests/visual/**` UNCHANGED
- `frontend/scripts/visual/{capture-current,diff,verify-shas,install-baselines}.mjs` UNCHANGED
- `frontend/ui/**` UNCHANGED (no PNG baselines mutated)

## 9. Verification commands Phase 3 agents can run

```bash
# Confirm shared geometry band
pnpm vitest run src/components/shell/shell.test.tsx

# Confirm shared component contracts
pnpm vitest run src/components/ui/ui-contract.test.tsx

# Type-check + lint
pnpm typecheck
pnpm lint

# Confirm 17/17 baseline fingerprint
pnpm visual:verify-shas
```

## 10. Known caveat (Phase 1 pre-existing bug, NOT fixed by Phase 2)

`src/test/setup.ts:78` calls `window.localStorage.clear()` which fails in
jsdom because the vitest config does not pass `--localstorage-file`. This
causes every `afterEach` hook to throw, leading to test isolation
failures in unrelated suites. **Phase 2 does not modify `setup.ts` per
task spec.** Phase 3 should be aware of this if you see test flakes.
