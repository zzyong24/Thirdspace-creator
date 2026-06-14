# Knowledge & Memory Page — Phase 3 Batch 3 Calibration Plan

## Goal
Restore `features/knowledge/**` to match `ui/Knowledge & Memory.png` design,
inheriting Phase 2 shared-visual-layer calibrations.

## Current Deviations (identified from code vs dashboard baseline)

### 1. Top-level section gap — `LINE 416`
- **Current**: `<main className="flex flex-col gap-3">` (12px)
- **Target**: `<main className="flex flex-col gap-(--section-gap)">` (20px)
- **Reason**: Dashboard already uses `gap-(--section-gap)` for same top-level spacing;
  knowledge page gap-3 is too tight relative to the design mockup.

### 2. KnowledgeMetrics grid gap — `LINE 481`
- **Current**: `gap-2` (8px)
- **Target**: `gap-(--card-gap)` (16px)
- **Reason**: Dashboard SummaryMetrics already uses `gap-(--card-gap)`; the design mockup
  shows 16px-style spacing between the 5 metric cards.

### 3. KnowledgeGrid three-column gap — `LINES 520-521`
- **Current**: `gap-2` (8px)
- **Target**: `gap-(--card-gap)` (16px)
- **Reason**: Three-column sections in the design mockup have visible separation;
  gap-2 is too tight. Grid gaps on all Phase 3 pages should use the card-gap token.

### 4. InsightRail vertical stack gap — `LINE 669`
- **Current**: `flex flex-col gap-2` (8px)
- **Target**: `flex flex-col gap-(--card-gap)` (16px)
- **Reason**: The four SectionCards inside the InsightRail (PopularTags, MemoryInsights,
  UnsortedItems, ReusableSnippets) should space like normal section cards.
  Dashboard grid uses card-gap; the InsightRail should match.

### No-change items (already correct)

| Element | Current | Why correct |
|---------|---------|-------------|
| KnowledgeToolbar gap-2 | 8px | Tight internal toolbar spacing, matches design |
| KnowledgeGrid column widths (220/1fr/300) | As-is | Matches design proportions |
| Category list gap-0.5 | 4px | List item density, matches design |
| Memory insights gap-1.5 | 6px | Card-internal spacing, matches design |
| Reusable snippets gap-1.5 | 6px | Same as above |
| Popular tags gap-1 | 4px | Tag cloud density |
| MetricCard (via shared component) | Already updated by Phase 2 | rounded-xl, px-4 py-3, gap-1.5, text-[22px] |
| SectionCard (via shared component) | Already updated by Phase 2 | text-[15px], gap-0.5 |
| Tokens (--header-height, --page-gutter) | Already updated by Phase 2 | 72px / 24px |

### What is NOT changed
- Route entrypoint (`app/(creator)/knowledge/page.tsx`) — thin wrapper, no logic
- Shell (sidebar, top-header) — Phase 2 territory
- Tokens / globals / layout / fixtures / view-models — Phase 3 forbidden list
- Playwright config / test helpers — Phase 1 locked
- `features/research/**`, `features/dashboard/**`, other features — out of scope

## Execution Order
1. Pre-fix screenshot (done)
2. TDD: run unit test → should pass (no structural change expected)
3. Apply the 4 gap token changes
4. Screenshot iteration 1
5. Run visual E2E test
6. Screenshot iteration 2
7. Fine-tune if needed
8. Final screenshot (iteration 3)
9. Commit
