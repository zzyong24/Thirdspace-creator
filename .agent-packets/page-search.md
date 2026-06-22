# Task Packet: page-search

> Issued by Controller (session 2026-06-14). Status when issued: parent branch
> `feat/frontend-implementation` HEAD `dac42e0`. Implementation currently at
> **17.56% pixel diff** vs the reference image.
> Acceptance: bring the implementation to **≤ 0.5% pixel diff** and have the
> visual matrix pass for this route, without regressing other 16 routes.

## 1. Page information

| Field | Value |
|---|---|
| Page ID | `search` |
| Route | `/search` |
| Reference image (absolute) | `/Users/zyongzhu/Workbase/Thirdspace-creator/ui/search.png` |
| Reference image SHA-256 | `e384830beb6b9b1e341e357cab5a27ca2aeb19b7fa91933a17d9a99da4d511ec` |
| Container type | `SearchPage` |
| Header mode | `search` |
| Sidebar active | `home` (default global sidebar) |
| Canvas | 1536 × 1024 |
| Worktree | `/Users/zyongzhu/Workbase/Thirdspace-creator/.worktrees/frontend-implementation` |
| Branch | `feat/frontend-implementation` |
| Base SHA at issue | `dac42e0` (use current HEAD if ahead) |

## 2. Reference image observation

- Top: GlobalSearchHeader with a search input spanning the main area
- Below: ResultTypeTabs (项目 / 知识 / 素材 / 视频 in that order)
- Body: results grouped by type, each as a section
  - Project results: 3 horizontal cards
  - Knowledge results: list rows
  - Asset results: thumbnail row
  - Video results: thumbnail row
- Right rail: SearchFilters, QuickActions, SearchHistory, SearchTips (fixed)

## 3. Component tree (from `frontend/specs/page-specs.md` §15, approved)

```text
SearchPage
├── GlobalSearchHeader
├── ResultTypeTabs
├── SearchResults
│   ├── ProjectResultSection
│   ├── KnowledgeResultSection
│   ├── AssetResultSection
│   └── VideoResultSection
└── SearchSideRail
    ├── SearchFilters
    ├── QuickActions
    ├── SearchHistory
    └── SearchTips
```

## 4. Restoration要点 (from page-specs.md)

- Top search input spans the main region
- Results segmented by type (not a single long list)
- Project results: 3 horizontal cards
- Asset/video results: thumbnail row
- Right rail fixed: filters / quick actions / history / tips

## 5. 禁止改变 (DO NOT)

- Do not introduce chat-style search results
- Do not change the result type order
- Do not remove the right-rail filters
- Do not collapse the four result sections into a unified list

## 6. Applicable decision-log entries

- D-005 Page heading via TopHeader (TopHeader in `search` mode)
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

- `frontend/src/features/search/search-page.tsx`
- Components: `GlobalSearchHeader`, `ResultTypeTabs`, `SearchResults`, `ProjectResultSection`, `KnowledgeResultSection`, `AssetResultSection`, `VideoResultSection`, `SearchSideRail`, `SearchFilters`, `QuickActions`, `SearchHistory`, `SearchTips`
- `components/ui/*`: Tabs, Input, Card, ScrollArea, Separator, Button, Badge

**Known issue** the test exposes: a strict-mode violation on `main[data-page="search"]` for `[data-slot="search-page-input"]` — two elements match. This is because the global TopHeader ALSO contains a search input. The page should scope its input to the page region only. If the test fails on this, fix the selector scope (e.g., the page input should be inside `<main data-page="search">` only, and not duplicated by the global TopHeader).

## 9. File ownership (this task)

| Status | Path |
|---|---|
| **May write** | `frontend/src/features/search/**` |
| **May write** | `frontend/tests/visual/pages/search.spec.ts` |
| Read-only | shell, ui, lib, fixtures, shell-router, other pages |
| **Forbidden** | package.json, lockfile, tsconfig, playwright config, baselines, other pages' files, AppShell / TopHeader internals |

If the duplicate search input is caused by TopHeader (shell code), return `NEEDS_CONTEXT` — do not modify shell.

## 10. Component reuse

- Reuse the TopHeader's existing search input if available; do not duplicate it
- Reuse `ResultTypeTabs` (page-local) for the four result types
- Reuse `ProjectListItem` shape for project result cards
- Reuse `AssetCard` for asset/video results

## 11. Acceptance criteria

| Given | When | Then | Level |
|---|---|---|---|
| Visual matrix runs | Search route | `toHaveScreenshot()` for `search` passes (diff ≤ 0.5%) | Playwright |
| `?q=AI` in URL | navigated to /search?q=AI | The page's `[data-slot="search-page-input"]` reflects "AI" (test must not hit strict-mode violation) | Playwright |
| Other 16 routes | matrix runs | No regression | Playwright |
| `pnpm lint && pnpm typecheck && pnpm test && pnpm build` | run | All pass | tooling |
| `node scripts/visual/diff.mjs` | run | `search` reports `diffRatio ≤ 0.005` | Custom |

## 12. Visual route, fixture, state, comparison regions, masks

- Route: `/search` (default empty query state)
- Fixture: canonical search fixture (do not modify)
- State: empty query (no results), but tabs and side rail visible
- Comparison: full canvas 1536×1024
- No mask

## 13. Required verification commands

```bash
cd /Users/zyongzhu/Workbase/Thirdspace-creator/.worktrees/frontend-implementation/frontend
pnpm exec playwright test --project=visual -g "search"
pnpm exec playwright test --project=visual
pnpm visual:capture-current && pnpm visual:diff
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Artifacts: `__artifacts__/current/search.png`, `__artifacts__/diff/search.png`, `__artifacts__/diff-report.json`.

## 14. Required report format

Per AGENT-PROTOCOL §7.

## 15. First-step diagnostic

17.56% is moderate. Investigate:
1. Is the right-rail visible? (SearchFilters / QuickActions / SearchHistory / SearchTips)
2. Is the four-tab structure showing 项目 / 知识 / 素材 / 视频 in that order?
3. Are result sections rendering with the right shape (3 horizontal project cards, asset/video thumbnail rows)?
4. Is the strict-mode violation on `[data-slot="search-page-input"]` real? If so, the page input is being duplicated. Trace where.

## 16. Working in parent worktree, parallel with other agents

Per session decision. If you hit `fatal: Unable to create '.git/index.lock'`, wait 5 seconds and retry. Your owned files (`frontend/src/features/search/**`) do not overlap with any other concurrent subagent.
