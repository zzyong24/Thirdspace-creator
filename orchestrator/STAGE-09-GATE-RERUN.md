# Stage-09 Frontend-Implementation Gate — Re-run (post-remediation)

> 归档:已废「分-stage」流程的一次性 gate 工件,保留仅作历史,不代表当前流程。

Date: 2026-06-21 · Branch: `remediation/frontend-spec-alignment` (off
`feat/frontend-implementation`) · Decision basis: DEC-006 full spec alignment.

This re-runs the stage-09 gate first recorded in `CODE_RECONCILIATION.md`
(verdict: **FAIL**) after executing the remediation backlog increments
INC-1…INC-5 on the host. Each original risk is re-assessed below with evidence.

## Verification baseline

`cd frontend && pnpm verify` (= `lint && typecheck && test && build`) is
**GREEN** on host: ESLint 0 errors, `tsc --noEmit` 0 errors, **398 tests
passing (38 files)**, `next build` compiles successfully. Node 24 LTS pinned
via `.nvmrc` + advisory `engines` (host ran Node 22 → advisory warning only).

## Risk register re-assessment

| ID | Original (FAIL) | Status now | Evidence |
| --- | --- | --- | --- |
| RISK-001 | 15/17 pages cannot render loading/error/permission states | **RESOLVED** | INC-4 added `*-interactive-region` islands + shared `components/state/page-state.tsx`; loading/error/empty wired on Production / Publishing Workspace / Knowledge / Publishing Center / Analytics; scenarios generalised (INC-2). |
| RISK-002 | 6 decorative stub pages, actions unwired | **RESOLVED** | INC-4 wired specced actions to URL-state/fixtures on all 6 stub pages. |
| RISK-003 | Selector layer bypassed by 20 pages (102 derefs) | **RESOLVED** | INC-2: 17 `build<Page>ViewModel` selectors; feature **page** code has 0 direct `canonicalDataset.*` derefs (remaining refs are in `*.test.tsx` fixtures only). |
| RISK-004 | 13/58 entities absent from types | **RESOLVED** | INC-1 added all 13 entities to `types/domain.ts` + fixtures. |
| RISK-005 | Fixture data-integrity bugs | **RESOLVED** | INC-1 fixed cross-artifact `currentVersionId`, dangling `ingestionRunId`, mismatched `coverAssetId`; +3 integrity tests. |
| RISK-006 | UI stack swapped shadcn/Radix → @base-ui | **RESOLVED** | INC-3 migrated all 18 `ui/*` primitives to shadcn/ui on Radix (`radix-ui` 1.6.0); **0** `@base-ui` imports remain; `components.json` style `base-nova` → `new-york`; `@base-ui/react` removed. |
| RISK-007 | ~32/42 shared components inlined/missing | **SUBSTANTIALLY RESOLVED** | INC-5: de-duplicated `ProjectStageStepper` (TopHeader private copy removed, shared component gains `variant`); extracted analytics layer (`AudienceBreakdown`, `RetentionChart`, `HorizontalBarsChart`, `InsightCard`), resource layer (`AssetCard`, `MediaPreview`, `AssetDetailPanel`), `SearchField`; moved `Pagination`/`ViewModeToggle`/`SortSelect` into `components/navigation`; renamed to spec (`PlatformIcon`, `InsightCard`, `RetentionChart`, `AudienceBreakdown`). Shared component dirs now hold **20** components (was ~10). **Residual:** content-layer items still inlined where single-use (`ArtifactListItem`, `KnowledgeListItem`, `EvidenceCard`, `FileThumbnail`, `VersionCard`) and `FilterBar` not yet extracted — covered by shared-components SPEC §8 (single-use blocks may remain inline). |
| RISK-008 | Script editor + AI Copilot non-functional | **RESOLVED** | INC-4: Copilot is a real composer; Script editor editable with working toolbar + save status. |
| RISK-009 | Dashboard/analytics metrics hard-coded | **RESOLVED** | INC-4: metrics derived from `canonicalDataset` (Project/Publication/MetricValue); +`dashboard-derived-metrics` test. |
| RISK-010 | Preflight NO-GO (Node 25, non-git) | **ADDRESSED** | Repo is a git worktree; Node 24 LTS pinned (`.nvmrc` + `engines`); pinned pnpm. |

## Verdict

**Stage-09 gate: PASS (with one documented residual).** Behaviour now traces to
the approved specs across state, action, data-access, domain-model and
UI-foundation dimensions (RISK-001–006, 008–010 resolved). RISK-007 is
substantially resolved; the remaining inlined content components are single-use
and permitted to stay inline by SPEC §8 — recorded as accepted residual, not a
gate blocker.

## Out of scope for this gate (→ stage-12 frontend-validation)

- **R2-9 visual re-validation.** The reference images under
  `tests/visual/__screenshots__/reference-images/` are design-locked (SHA-pinned
  to `ui/*.png` via `verify-shas.mjs`; updating them is a Controller-gated,
  anti-laundering operation). After the INC-3 UI-stack migration the rendered
  output must be re-validated against the design references via `pnpm test:visual`.
  This is stage-12 work and does not gate stage-11. `pnpm verify` does **not**
  include the visual suite, so it remains green.

## Visual smoke run (2026-06-21, `pnpm test:visual` against `next dev`)

Ran the full visual project to surface anything `pnpm verify` cannot (it has no
RSC server/client boundary and no real browser). Result: **25 passed / 27
failed**, and it earned its keep:

- **Real bug found + fixed** (commit `897d5f1`): INC-3 had marked `button.tsx`
  `"use client"`, making the pure `buttonVariants` cva export client-only;
  server components calling it (`project-overview` ProjectProgressCard,
  `top-header`) threw at render. Invisible to `next build` + vitest; caught only
  by a real render. Fixed by removing the unnecessary directive (canonical
  shadcn ships button without it). After the fix: **0** render/RSC errors across
  all routes.
- **2 structural failures are dev-mode transients, not bugs**
  (`script-workspace`, `publishing-workspace` "renders the main region"):
  the SSR HTML has exactly one `<main>` (curl), a warm-server browser DOM has
  exactly one `<main>` on all five workspace routes (Playwright probe), and
  there are **zero** hydration-mismatch warnings. The structural assertion does
  `goto` then asserts visibility immediately (no `networkidle` wait, unlike the
  pixel test), so it occasionally catches a first-compile transient on heavy
  `next dev` routes. Eliminated by running visual against a production build
  (`next build && next start`) or adding a load-state wait to that assertion.
- **~25 pixel-comparison failures = expected stage-12 work**: every page's
  "matches the reference image" fails because the Radix migration (and INC-5
  moves) shift pixels vs the design-locked references (focus rings, spacing,
  animation defaults). Structure is correct; this is the per-page design
  re-alignment / Controller-approved re-baseline of stage-12.

## Remaining backlog tail (non-blocking)

- R2-1 content layer: extract `ArtifactListItem`/`KnowledgeListItem`/`EvidenceCard`/`FileThumbnail`/`VersionCard` if/when reused beyond one page.
- R2-3: extract `FilterBar` and migrate the per-page raw search inputs onto the shared `SearchField`.
- R2-6: sweep remaining hand-rolled controls onto `ui/*` primitives.
- R2-7: relocate flat feature tests into `features/<page>/tests/` substructure.
- R2-9: stage-12 visual re-validation / Controller-gated re-baseline.
