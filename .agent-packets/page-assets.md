# Task Packet: page-assets

> Issued by Controller (session 2026-06-14). Status when issued: parent branch
> `feat/frontend-implementation` HEAD `dac42e0`. Implementation currently at
> **28.91% pixel diff** vs the reference image — second-worst of 17 routes.
> Acceptance: bring the implementation to **≤ 0.5% pixel diff** (the
> Controller-approved `maxDiffPixelRatio: 0.005`) and have the visual matrix
> pass for this route, without regressing other 16 routes.

## 1. Page information

| Field | Value |
|---|---|
| Page ID | `assets` |
| Route | `/assets` |
| Reference image (absolute) | `/Users/zyongzhu/Workbase/Thirdspace-creator/ui/Assets Center.png` |
| Reference image SHA-256 | `a3336cd1388ba223b4879cf93078c5b78c2f886c791abc17a0b2b153d7ba2402` |
| Container type | `ResourceCenterPage` |
| Header mode | `global` |
| Sidebar active | `assets` |
| Canvas | 1536 × 1024 |
| Dependencies | None new — Shell, AssetCard, AssetToolbar already in place per merge of `feat/page-assets` |
| Worktree | `/Users/zyongzhu/Workbase/Thirdspace-creator/.worktrees/frontend-implementation` |
| Branch | `feat/frontend-implementation` |
| Base SHA at issue | `dac42e0` (HEAD may move; use current HEAD if ahead) |

## 2. Reference image observation

- Canvas: 1536 × 1024
- Main content anchor: full-width Asset page with a type sidebar on the left (within the page), a 3-column asset gallery in the center, and a detail panel on the right
- Bottom-left: StorageUsageCard
- Asset type categories: image, video, audio, document
- Scroll area: yes, vertically scrollable middle column

## 3. Component tree (from `frontend/specs/page-specs.md` §12, approved)

```text
AssetsPage
├── AssetToolbar
├── AssetWorkspace
│   ├── AssetTypeSidebar
│   ├── AssetGallery
│   │   ├── GalleryControls
│   │   ├── AssetCardGrid
│   │   └── Pagination
│   └── AssetDetailPanel
│       ├── MediaPreview
│       ├── AssetActions
│       ├── AssetMetadata
│       ├── Tags
│       └── UsageHistory
└── StorageUsageCard
```

## 4. Restoration要点 (from page-specs.md)

- A type sidebar exists **inside** the page; it must not be confused with the global Sidebar
- Center is 3-column asset card grid
- Right detail panel is fixed (always shows the selected asset)
- Bottom-left: storage usage card
- Video / image / audio / document thumbnails differ

## 5. 禁止改变 (DO NOT)

- Do not move the detail panel into a modal/popup
- Do not remove the type sidebar
- Do not add a folder hierarchy / breadcrumb navigation
- Do not collapse the in-page type sidebar into the global Sidebar

## 6. Applicable decision-log entries

- D-003 Assets Sidebar Card: lower contextual card in global Sidebar may use a `storage` content variant; placement, dimensions, and parent Sidebar stay shared
- D-005 Page heading vs TopHeader: heading is via TopHeader
- D-007 Empty/Loading/Error states: not new designs, use shared components
- D-009 Desktop-first 1536×1024, min 1280px
- D-010 Canonical time fixture (zh-CN / Asia/Shanghai)

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
- **Do not update visual baselines** — Controller-only
- If the task conflicts with a SPEC, return `NEEDS_CONTEXT`; do not decide

## 8. Public APIs available

- AppShell, Sidebar, TopHeader in `frontend/src/components/shell/`
- Assets feature: `frontend/src/features/assets/` — `assets-page.tsx`, `assets-interactive-region.tsx`
- Components: `AssetCard`, `AssetToolbar`, `AssetGallery`, `AssetDetailPanel`, `StorageUsageCard`, `AssetTypeSidebar` (if extracted)
- `components/ui/*`: Button, Input, Badge, Tabs, ScrollArea, etc.

## 9. File ownership (this task)

| Status | Path |
|---|---|
| **May write** | `frontend/src/features/assets/**` (page, components, focused tests) |
| **May write** | `frontend/tests/visual/pages/assets.spec.ts` (only for assertions on this page) |
| Read-only | `frontend/src/components/shell/**`, `frontend/src/components/ui/**`, `frontend/src/lib/**`, `frontend/src/fixtures/**`, `frontend/src/app/(creator)/shell-router.tsx`, all other pages |
| **Forbidden** | `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `playwright.config.ts`, all other `*-page.tsx`, all visual baselines |

If you find you need to change anything in read-only or forbidden scope, **stop and return `NEEDS_CONTEXT`**.

## 10. Component reuse

- Reuse from `components/ui`: `Button`, `Input`, `Badge`, `Tabs`, `ScrollArea`, `Separator`, `Skeleton`, `Sheet` (if detail becomes sheet-like)
- The in-page `AssetTypeSidebar` is **local** to assets; do not promote it to the global Sidebar

Do **not** create new abstraction layers. If a shared component doesn't exist and is needed only for this page, keep it local.

## 11. Acceptance criteria (Given/When/Then)

| Given | When | Then | Level |
|---|---|---|---|
| Visual matrix runs | Assets route | `toHaveScreenshot()` for `assets` passes (diff ≤ 0.5%) | Playwright |
| Visual matrix runs | Other 16 routes | No regression vs current state | Playwright |
| `pnpm lint && pnpm typecheck && pnpm test && pnpm build` | run in worktree | All pass | Vitest + tsc + ESLint + Next |
| `node scripts/visual/diff.mjs` | run | `assets` reports `diffRatio ≤ 0.005` in `diff-report.json` | Custom |
| Page route `/assets` | visited in browser | Three-column layout visible (type sidebar + gallery + detail) with storage card bottom-left | Visual |

## 12. Visual route, fixture, state, comparison regions, masks

- Route: `/assets`
- Fixture: canonical assets list from `frontend/src/fixtures/assets.ts` (do not modify)
- State: default (first asset selected, all categories visible)
- Comparison: full canvas 1536×1024
- No mask; whole page is the target

## 13. Required verification commands

```bash
cd /Users/zyongzhu/Workbase/Thirdspace-creator/.worktrees/frontend-implementation/frontend

# 1. Per-page visual test
pnpm exec playwright test --project=visual -g "assets "

# 2. Whole matrix regression
pnpm exec playwright test --project=visual

# 3. Diff script
pnpm visual:capture-current && pnpm visual:diff

# 4. Type/lint/test/build
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Artifact paths:
- Current capture: `tests/visual/__artifacts__/current/assets.png`
- Diff overlay: `tests/visual/__artifacts__/diff/assets.png`
- Per-page report: `tests/visual/__artifacts__/diff-report.json`

## 14. Required report format

Same as new-project-overlay packet, with:
- `pnpm exec playwright test --project=visual -g "assets "` (note trailing space to avoid matching "publishing-center")
- diff report excerpt for `assets`

## 15. Important first-step diagnostic

At 28.91% diff, the gap is large. Investigate structurally:
1. Is the in-page AssetTypeSidebar rendering? (compare red overlay in `tests/visual/__artifacts__/diff/assets.png`)
2. Is the right-side detail panel rendering, or is the gallery taking the full width?
3. Is the StorageUsageCard visible at bottom-left?
4. Are the 3 columns aligned to the reference proportions?

If the three-column layout is collapsed (e.g., only one column visible), fix the layout first. Pixel tuning on a broken layout is wasted work.

## 16. Working in parent worktree, parallel with other agents

Per session 2026-06-14 decision: all subagents work in the parent worktree
`.worktrees/frontend-implementation` on branch `feat/frontend-implementation`.
You work **in parallel** with 5 other page implementers. Your owned files
(`frontend/src/features/assets/**`) do not overlap with theirs.

**If you get `fatal: Unable to create '.git/index.lock': File exists`**,
another subagent is committing. Wait 5 seconds and retry. The lock is
released as soon as the other commit finishes.

Coordinate via the `Files changed:` and `Commit SHA:` fields in your report.
