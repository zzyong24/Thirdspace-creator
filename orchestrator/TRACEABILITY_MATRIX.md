# Traceability Matrix — CreatorOS

How product intent becomes flows, model concepts, pages, components, contracts, tests, validation
evidence, and release decisions. Built during the ratification pass (2026-06-20) from ID_REGISTRY.md
and the page→entity table in `docs/CreatorOS-storage-and-business-logic.md` §8.

## Matrix (per page = one core journey)

| Page | Flow IDs | Entity IDs (read/write) | Component IDs (sample) | Frontend Test | API IDs | Backend Test |
| --- | --- | --- | --- | --- | --- | --- |
| PAGE-001 Dashboard | FLOW-001 | ENT-003, 009, 037, 040, 024 | COMP-014, 016, 022, 023 | dashboard.spec | — | — |
| PAGE-002 Projects | FLOW-002/003/004 | ENT-003, 005, 007, 008 | COMP-009, 011, 022 | projects.spec | — | — |
| PAGE-003 New Project | FLOW-005 | ENT-003, 005, 006, 007 (w) | COMP-004 | new-project-overlay.spec | — | — |
| PAGE-004 Project Overview | FLOW-002/005 | ENT-003, 005, 012, 022, 010, 011 | COMP-024, 025, 026, 027 | project-overview.spec | — | — |
| PAGE-005 Research Workspace | FLOW-006 | ENT-012, 019, 017, 021 (r/w) | COMP-029, 030, 033 | research.spec | — | — |
| PAGE-006 Planning Workspace | FLOW-007 | ENT-012, 015, 017, 007 (r/w) | COMP-020, 033 | planning.spec | — | — |
| PAGE-007 Script Workspace | FLOW-008/009/010 | ENT-012, 013, 016, 048 (r/w) | COMP-036 | script.spec | — | — |
| PAGE-008 Production Workspace | FLOW-011/012 | ENT-033, 034, 022, 036 (r/w) | COMP-031, 035 | production.spec | — | — |
| PAGE-009 Publishing Workspace | FLOW-013/014 | ENT-037, 038, 022 (r/w) | COMP-018, 042 | publishing-workspace.spec | — | — |
| PAGE-010 Analytics & Review | FLOW-015/016 | ENT-039, 040, 041, 043, 024 | COMP-037, 038, 039, 040, 041 | analytics-review.spec | — | — |
| PAGE-011 Knowledge & Memory | FLOW-006 | ENT-019, 020, 021, 026 (r/w) | COMP-030, 019 | knowledge.spec | — | — |
| PAGE-012 Assets Center | FLOW-021 | ENT-022, 023, 029, 031, 032 (r/w) | COMP-031, 032, 034 | assets.spec | — | — |
| PAGE-013 Publishing Center | FLOW-013/020 | ENT-037, 007, 003, 040 | COMP-042, 018 | publishing-center.spec | — | — |
| PAGE-014 Experience Center | FLOW-015/016 | ENT-024, 025, 043 (r/w) | COMP-039 | experience.spec | — | — |
| PAGE-015 Global Search | FLOW-017 | ENT-058, 057 | COMP-010 | search.spec | — | — |
| PAGE-016 AI Copilot | FLOW-018 | ENT-046, 047, 048 (r/w) | COMP-005 | ai-copilot.spec | — | — |
| PAGE-017 Settings | FLOW-021 | ENT-001, 002, 051, 052, 023 (r/w) | COMP-003 | settings.spec | — | — |

## Orphan Scan (consistency-gates.md — BOTH directions)

### Downstream → upstream (no unrequested work)
- All 18 PAGEs trace to ≥1 FLOW (table above) and to FR via the implementation-plan phase coverage. **No orphan pages.**
- All 42 COMPs are referenced by ≥1 page in `frontend/specs/shared-components.md`. **No orphan components.**
- No APIs exist, so no orphan APIs.
- Frontend TESTs (vitest + visual specs) each target a page. **No orphan tests.**
- Result: **PASS** — no unrequested scope detected.

### Upstream → downstream (no dropped requirement)
- FR→PAGE: most product FRs surface in a page (frontend realized).
- **FR→API→TEST: BROKEN for every backend-bearing FR.** No service contract (API-*) and no backend tests exist. Examples of broken chains: FR-002 (project CRUD), FR-013/014 (artifact versions), FR-044/047/049 (publications & ingestion), FR-052/053 (metrics), FR-026/027 (search index) — all have FR + PAGE but **no API and no backend TEST**.
- Result: **FAIL** — release-critical chains are broken on the backend half. Per the gate, consistency cannot return `pass` until the service contract + backend tests close these chains.

## Gap Review

| Gap ID | Description | Affected IDs | Severity | Required Action | Owner |
| --- | --- | --- | --- | --- | --- |
| `GAP-001` | (RESOLVED) Stable IDs now assigned | all | — | Done in ratification pass | agent |
| `GAP-002` | Contract HALF-CLOSED (2026-06-21): `@creatoros/contract` defines all 76 SPEC §13 operations (Zod; §13-completeness + GAP-002-traceability tests green). FE still on fixtures until 15b wires MockTransport; backend tests attach at stage 16. | all FR needing persistence | medium (was high) | 15a done → 15b FE wiring + stage-16 backend tests on same op ids | user+agent |
| `GAP-003` | No backend implementation or tests | ENT-*, API-* | high | Backend TDD (stage 16) | agent |
| `GAP-004` | `next build` + full visual suite not confirmed green | PAGE-001..017 | medium | Run `pnpm verify` on host | user |
| `GAP-005` | FLOW-019 external ingestion has no UI owner (backend/contract flow) | FLOW-019 | low | Confirm it is backend-only by design | user |
| `GAP-006` | read/write verbs on PAGE→ENT links are inferred, not doc-stated | PAGE-005..017 | low | Confirm during page-spec ratification | user |

## Completion Standard

- Every confirmed `FR` and release-critical `NFR` has at least one validation path.
- Every page and API traces back to a product requirement or explicit decision.
- Every release-critical journey has test or browser-validation evidence.
- Any unimplemented confirmed requirement is listed as a gap, deferred work, or accepted risk.
