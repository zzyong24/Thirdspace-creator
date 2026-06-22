# Code ↔ Spec Reconciliation — CreatorOS

Date: 2026-06-20 · Method: three read-only audits (components, pages, data-model+architecture) of branch
`feat/frontend-implementation` against the approved specs. This is the **stage-09 frontend-implementation
gate run** the earlier doc-only ratification skipped. The user's assessment ("doesn't follow the prior
process, many problems") is confirmed.

> **Gate verdict — stage 09 (frontend-implementation): FAIL.** Behavior does not trace to approved specs;
> deviations are large and unrecorded. **No stage is promoted to `passed`.**

## Headline

The implementation reproduced **layouts** well (most pages render the right section tree, tests/visual
infra is strong) but skipped the **behavior, state, data-access, and shared-abstraction halves** of the
specs — the parts the page-implementation-template and architecture docs make mandatory. Plus the
Foundation-locked UI stack was swapped.

## 1. Component layer (spec: 42 shared components)

Only ~10 of 42 exist as proper reusable shared components. Distribution: **MATCH 10 · PARTIAL 4 · INLINED ~19 · MISSING ~9.**

Most serious:
- **ProjectStageStepper duplicated** — shared `components/navigation/project-stage-stepper.tsx` exists but `TopHeader` defines its own private stepper (`top-header.tsx:243`). Two divergent copies of the flagship shared component.
- **Content/resource layer entirely inlined** — ArtifactListItem, KnowledgeListItem, AssetCard, AssetDetailPanel, EvidenceCard, FileThumbnail (duplicated ×2), MediaPreview, VersionCard all hand-coded inside feature pages; the spec's `content/` and `resources/` component dirs were never created.
- **Analytics layer inlined** — only ChartFrame is shared; InsightCard, RetentionChart, AudienceBreakdown, PublicationPerformanceRow, MetricTrendCard are ad-hoc SVG/functions inside `analytics-review-page.tsx` (or missing).
- **NotificationPopover (COMP-006) missing** — the bell is a non-functional bare button; no notifications wired.
- **SearchField / FilterBar reimplemented 4+ times** with raw `<input>` instead of a shared primitive.
- **Naming mismatches** — `PlatformIconView` (spec: PlatformIcon), `AIAnalysisCard` (spec: InsightCard), `RetentionCurveChart`/`DonutChart` (spec: RetentionChart/AudienceBreakdown).
- **Misplaced "shared" components** — Pagination, ViewModeToggle, SortSelect live under `features/projects/`, so other pages can't reuse them (assets page reinvents pagination).

## 2. Page layer (spec: 17 pages, per page-implementation-template)

Coverage: **Full 3 · Partial 8 · Stub/display-only 6.**
- Full: PAGE-003 New Project, PAGE-004 Project Overview, PAGE-017 Settings.
- Partial: 001 Dashboard, 002 Projects, 005 Research, 006 Planning, 007 Script, 012 Assets, 014 Experience, 015 Search.
- Stub (decorative, no handlers): 008 Production, 009 Publishing Workspace, 010 Analytics, 011 Knowledge, 013 Publishing Center, 016 AI Copilot.

Most serious:
- **States systematically unimplemented (15/17 pages).** Only Projects has the mandated empty/loading/error/selected scenarios; every other page hardcodes `loading:false, error:null`. **Permission state missing on all 17.**
- **Actions not wired — pages are display fixtures.** 6 pages are 100% decorative; PAGE-009 even comments that its ConfirmPublishButton has "no onClick, no network call." Violates template §5/§7 (implement interactions + behavioral acceptance).
- **AI Copilot (PAGE-016) is a static mockup** — no state, textarea `defaultValue`, submit only `preventDefault()`; reachable only as a `?copilot=open` modal; no header section.
- **Script editor (PAGE-007) is not editable** — no contentEditable/textarea/editor lib; entire toolbar `disabled`. A read-only render dressed as an editor.
- **Dashboard missing spec-required SidebarAssistantCard.**

## 3. Data model & architecture

### Domain model (spec: 58 entities)
- **In TS types: 45/58. Missing 13.** Two whole sub-domains skipped: all 5 resource join tables (ProjectKnowledge, ProjectAsset, ArtifactKnowledge, ArtifactAsset, OutputAsset) and the AI-task/ingestion provenance domain (AITaskReference, AITaskResult, AgentConfiguration, ExternalSource, IngestionRun, IngestionError, SearchDocument) + ProjectRelation.
- **In fixtures: 43/58.**
- **Data-integrity bugs in fixtures:**
  - Cross-artifact `currentVersionId` — several artifacts point at another artifact's version (e.g. `artifact-...-shot-list` → `av-...-output-script`). Violates spec constraint #7.
  - Dangling `MetricSnapshot.ingestionRunId: "run-1"` → IngestionRun entity does not exist.
  - `PublicationRevision.coverAssetId` points at an unrelated project's poster.
- **Field/enum divergences:** `Learning.confidenceScore: number` (spec: int) holding decimals; `relationType` on EvidenceLink/KnowledgeRelation over-narrowed to the artifact enum (spec: free string).
- **Dashboard metrics hard-coded, not derived** (`DASHBOARD_METRICS`, `engagement:0`, `+12%` literals) — contradicts spec §10 and doesn't reconcile with fixture data ("进行中项目 7" vs 2 active projects).

### Architecture / process
- **Selector layer is a façade — 20 pages bypass it** (102 direct `canonicalDataset.*` dereferences). `IMPLEMENTATION-ARCHITECTURE §6` requires typed selectors; only Projects + Dashboard have builders. Biggest architectural breach.
- **UI stack swapped off the locked baseline** — spec mandates shadcn/ui on Radix; code is built on `@base-ui/react` (`components.json` style `base-nova`). Explicitly forbidden by AGENT-PROTOCOL §5/§10 ("Dependency drift").
- **Preflight gate self-declared NO-GO** — AGENT-PROTOCOL §2 records repo was not a git repo and Node was v25 (not 24 LTS) at dispatch; the sequential-agent process ran anyway.
- **Minor structural drift** — mandated `public/fixtures/` dir absent; `features/<page>` doesn't use the prescribed `components/` + `tests/` sub-structure (tests are flat).

### What is actually solid
Server/Client boundary discipline (islands only), single AppShell, URL-state-only (no global store),
deterministic fixtures (fixed clock, no randomness/network, test-enforced), and strong test infra
(per-page Vitest + e2e + visual + a11y + snapshot-laundering guard). Static checks pass (eslint/tsc/vitest green).

## Risk register (new)

| ID | Risk | Severity | Affected |
| --- | --- | --- | --- |
| RISK-001 | 15/17 pages cannot render loading/error/permission states (hardcoded) | high | PAGE-001,005-016 |
| RISK-002 | 6 pages are decorative stubs; core actions unwired | high | PAGE-008,009,010,011,013,016 |
| RISK-003 | Selector/data-access pattern bypassed by 20 pages | high | architecture |
| RISK-004 | 13/58 domain entities absent from types; 2 sub-domains missing | high | data model |
| RISK-005 | Fixture data-integrity bugs (cross-artifact version ptrs, dangling refs) | medium | fixtures |
| RISK-006 | UI stack swapped shadcn/Radix → @base-ui (Foundation drift) | high | whole UI |
| RISK-007 | ~32/42 shared components missing or inlined; duplication | medium | components |
| RISK-008 | Script editor + AI Copilot non-functional (mockups) | medium | PAGE-007,016 |
| RISK-009 | Dashboard/analytics metrics hard-coded, not derived | medium | PAGE-001,010 |
| RISK-010 | Preflight gate ran NO-GO (Node 25, non-git at dispatch) | low-now | process |

## Consequence for the workflow

- **Stage 09 frontend-implementation gate: FAIL** → stage 11 stays `draft` with gate_status `fail`.
- **Stage 12 frontend-validation:** cannot pass — visual baselines were captured from non-conformant pages, so green visual tests certify the wrong thing.
- The documentation stages (03-09 specs) are themselves mostly sound; the failure is **implementation vs spec**, not the specs. So the open decision is **fix code to match specs** vs **amend specs to match code (accept reality)** — user's call.
