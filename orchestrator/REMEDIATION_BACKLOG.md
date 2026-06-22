# Remediation Backlog — CreatorOS Frontend

Date: 2026-06-20 · Source: orchestrator/CODE_RECONCILIATION.md (3 audits). Prioritized, actionable, no code
changed yet. Effort is rough (S ≤0.5d, M 1-2d, L 3-5d, XL >1wk) for one focused agent/dev.
`type`: **code** = change implementation · **spec** = amend docs to accept reality · **decision** = needs your call first.

Legend of tiers: **P0** = foundation decisions / correctness that everything else depends on ·
**P1** = functional gaps making pages non-working · **P2** = refactors, conformance, polish.

---

## P0 — Foundation decisions & correctness (do first; some block others)

| ID | Problem | Where | Fix approach | Effort | type |
| --- | --- | --- | --- | --- | --- |
| R0-1 | **UI stack swapped** shadcn/Radix → `@base-ui/react` (`base-nova`), against locked baseline | `components/ui/*` (20 files), `components.json` | DECIDE: (a) accept @base-ui → amend spec/AGENT-PROTOCOL baseline; or (b) migrate ui primitives back to shadcn/Radix | (a) S / (b) L | decision |
| R0-2 | **Selector layer bypassed** — 20 pages read `canonicalDataset.*` directly (102 sites); only Projects/Dashboard have builders | `fixtures/selectors/index.ts`, all `features/*` | Build the 15 missing `build<Page>ViewModel` selectors in `fixtures/selectors/**`; refactor pages to consume them | L | code |
| R0-3 | **State infra exists for Projects only** — 15/17 pages hardcode `loading:false,error:null`; permission state absent everywhere | `fixtures/scenarios.ts`, every feature page | Generalize scenarios to all ViewModels (default/empty/loading/error/selected + permission); render the states | L | code |
| R0-4 | **13/58 domain entities missing from types** (5 join tables + AI-task/ingestion sub-domain + ProjectRelation) | `types/domain.ts`, `fixtures/canonical.ts` | DECIDE scope: model now vs defer to backend phase. If frontend needs them (assets↔project, knowledge links), add types+fixtures | M | decision |
| R0-5 | **Fixture data-integrity bugs** — cross-artifact `currentVersionId`, dangling `ingestionRunId:"run-1"`, mismatched `coverAssetId` | `fixtures/canonical.ts` | Fix pointers to satisfy spec constraint #7; remove/define the missing IngestionRun ref | S | code |
| R0-6 | **Enum/field divergences** — `Learning.confidenceScore` number vs spec int; `relationType` over-narrowed on EvidenceLink/KnowledgeRelation | `types/domain.ts`, `fixtures/canonical.ts` | Align types to spec (or amend spec if the narrowing is intentional) | S | decision |

## P1 — Functional gaps (pages that don't actually work)

| ID | Problem | Where | Fix approach | Effort | type |
| --- | --- | --- | --- | --- | --- |
| R1-1 | **6 pages are decorative stubs** — no action handlers | Production, Publishing Workspace, Analytics, Knowledge, Publishing Center, Copilot feature dirs | Wire specced actions to fixtures/URL-state per page-implementation-template §5/§7 | XL | code |
| R1-2 | **AI Copilot is a static mockup** — no state, no-op submit, no header, modal-only | `features/copilot/ai-copilot-content.tsx` | Build real composer state + message list; add CopilotHeader; decide if it is a page or overlay-only | M | code |
| R1-3 | **Script editor not editable** — toolbar all disabled, no editor | `features/script/script-workspace-page.tsx` | Introduce an editor (contentEditable/textarea/lib) wired to ScriptSection; enable toolbar | M-L | code |
| R1-4 | **Dashboard/analytics metrics hard-coded**, don't reconcile with fixtures | `fixtures/selectors/index.ts` (`DASHBOARD_METRICS`), `features/review/*` | Derive metrics from Project/Publication/MetricValue per spec §10 | M | code |
| R1-5 | **NotificationPopover (COMP-006) missing** — bell is non-functional | `components/shell/top-header.tsx` | Build popover + wire notifications fixture | S-M | code |
| R1-6 | **Partial pages: actions decorative** (Dashboard, Research, Planning, Assets, Experience, Search secondary controls) | respective `features/*` | Wire remaining filter/tab/sort/view actions | L | code |
| R1-7 | **Dashboard missing SidebarAssistantCard** (spec-required section) | `features/dashboard/dashboard-page.tsx` | Add the section | S | code |
| R1-8 | **2 pages bypass fixture data-source** (inline DEFAULT_* constants) | `features/copilot`, `features/experience` | Move data to fixtures→selectors per template §6 | S | code |

## P2 — Conformance, refactors, polish

| ID | Problem | Where | Fix approach | Effort | type |
| --- | --- | --- | --- | --- | --- |
| R2-1 | **~32/42 shared components inlined or missing**; content/resource/analytics layers never extracted | `features/*`, missing `components/{content,resources,analytics}` | Extract reusable components per spec inventory; replace inline copies | XL | code |
| R2-2 | **ProjectStageStepper duplicated** — TopHeader has a private copy | `components/shell/top-header.tsx:243` | Use the shared `components/navigation/project-stage-stepper.tsx` | S | code |
| R2-3 | **SearchField/FilterBar reimplemented 4+ times** | TopHeader, project-toolbar, assets-page | Extract one shared SearchField + FilterBar; replace raw inputs | M | code |
| R2-4 | **Naming mismatches** — PlatformIconView, AIAnalysisCard, RetentionCurveChart, DonutChart vs spec names | components/publishing, features/review | Rename to spec (PlatformIcon, InsightCard, RetentionChart, AudienceBreakdown) | S | code |
| R2-5 | **Misplaced "shared" components** under features/projects (Pagination, ViewModeToggle, SortSelect) | `features/projects/*` | Move to `components/` so other pages reuse | S | code |
| R2-6 | **Hand-rolled despite primitive** — ProgressBar/Dialog/SortSelect/SearchField bypass `ui/*` | various | Rebuild on `ui/progress`, `ui/dialog`, `ui/select`, `ui/input` (after R0-1 stack decision) | M | code |
| R2-7 | **Structural drift** — no `public/fixtures/`; `features/<page>` lacks `components/`+`tests/` substructure | repo layout | Create dirs / relocate, or amend architecture doc | S | decision |
| R2-8 | **Preflight gate NO-GO** (Node v25, non-git at dispatch) | environment | Pin Node 24 LTS, confirm git/pnpm workspace; record gate pass | S | code |
| R2-9 | **Visual baselines certify non-conformant pages** — green visual tests are misleading until pages are fixed | `frontend/tests/visual/**` | Re-baseline after P0/P1 fixes; until then treat green visual as non-authoritative | (after fixes) | code |

---

## Suggested sequencing

1. **Decisions first (R0-1, R0-4, R0-6, R2-7):** lock the UI stack and data-model scope — they change how everything below is done.
2. **Foundation (R0-2, R0-3, R0-5):** selector layer + state infra + fixture integrity. Unblocks honest page work and re-baselining.
3. **Make pages work (P1):** wire the 6 stubs, Copilot, Script editor, derived metrics, notifications.
4. **Conformance/refactor (P2):** extract shared components, naming, structure, then re-baseline visuals (R2-9) and re-run the stage-09 gate.
5. Only after the stage-09 gate passes does stage-12 validation become meaningful, and only then promote stages toward `passed`.

## Effort rollup (very rough)
- P0 ≈ 1.5–2.5 wks (mostly R0-2/R0-3 + decisions)
- P1 ≈ 2–3 wks (R1-1 stubs dominate)
- P2 ≈ 1.5–2.5 wks (R2-1 extraction dominates)
- Total to full spec-conformance: ~5–8 focused weeks. A "make it functional, defer cosmetic refactors" cut (P0 + P1, accept P2 via spec amendments) is ~3.5–5 wks.
