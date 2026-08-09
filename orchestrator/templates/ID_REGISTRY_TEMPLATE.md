# ID Registry

## Purpose

Use stable IDs so downstream artifacts can trace to upstream intent and changes can invalidate affected work precisely.

## ID Prefixes

| Prefix | Meaning | Example |
| --- | --- | --- |
| `ASM` | Assumption | `ASM-001` |
| `DEC` | Decision | `DEC-001` |
| `FR` | Functional requirement | `FR-001` |
| `NFR` | Non-functional requirement | `NFR-001` |
| `FLOW` | Business or user flow | `FLOW-001` |
| `ENT` | Domain entity | `ENT-001` |
| `IA` | Information architecture surface | `IA-001` |
| `PAGE` | Page or screen contract | `PAGE-001` |
| `COMP` | Frontend component | `COMP-001` |
| `MOCK` | Mock data scenario | `MOCK-001` |
| `API` | Service contract operation | `API-001` |
| `TEST` | Test or validation scenario | `TEST-001` |
| `TC` | Test case (fine-grained; ranges expand) | `TC-API-1..3` |
| `INT` | Integration / e2e test | `INT-001` |
| `BR` | Business rule (requirement-like) | `BR-note` |
| `PG` | Page (short alias of `PAGE`) | `PG-tasks` |
| `HARD` | Hard problem on the design path (must be solved, never deferred) | `HARD-001` |
| `PKG` | Parallel work package | `PKG-001` |
| `RISK` | Accepted or open risk | `RISK-001` |

## Registry (canonical machine-checkable block — REQUIRED)

`orchestrator/process/orphan-scan.mjs` resolves downstream→upstream traces from this registry's
`Source IDs`. It parses a single fenced ` ```id-registry ` block, NOT the surrounding prose. Keep notes
outside the block; put the registry data inside it in canonical form. A missing or off-format block makes
the scan emit "non-canonical / cannot parse" and FAIL — it never guesses.

**Canonical-form rules:**

- One ` ```id-registry ` fenced block containing a GFM pipe table.
- **Fixed columns, exact lowercase header match:** `ID | Type | Defined In | Source IDs`. (Extra human
  columns like `Name`/`Status`/`Notes` may be kept in a SEPARATE prose table outside the block; the
  canonical block stays to these four so the parser is unambiguous.)
- **IDs only** in `ID` and `Source IDs`. An ID is `PFX-name` (`PFX` = 2–6 uppercase letters; `name` = one
  or more hyphen-joined alphanumeric segments): `FR-create`, `API-list`, `TC-LIST-3`, `TC-UPD-1`.
- **Comma-separate** multiple `Source IDs`: `FR-list, FR-filter`.
- **Ranges** expand with `..`: `TC-LIST-1..5` → `TC-LIST-1 … TC-LIST-5`.
- **Slash-join** co-defined IDs with ` / `: `ENT-Task / ENT-User` (one row defines both).
- **No source** is the literal token `NONE` (never blank, never an em-dash `—`).

```id-registry
| ID | Type | Defined In | Source IDs |
| --- | --- | --- | --- |
| FR-001 | requirement | PRODUCT_SPEC.md | NONE |
| DEC-001 | decision | DECISION_LOG.md | NONE |
| FR-002 | requirement | PRODUCT_SPEC.md | DEC-001 |
| FLOW-001 | flow | BUSINESS_FLOW.md | FR-001 |
| ENT-001 | entity | LIGHT_DOMAIN_MODEL.md | FLOW-001 |
| PAGE-001 | page | PAGE_SPEC.md | FLOW-001 |
| API-001 | api | SERVICE_CONTRACT.md | FR-001 |
| TC-API-1..3 | test | api.test.js | API-001 |
```

(The sample rows above and the sample ` ```traceability ` rows in `TRACEABILITY_MATRIX_TEMPLATE.md` are
one consistent, scan-passing set — replace them together with your real IDs; a fresh copy of both
templates passes `orphan-scan.mjs` as-is.)

A downstream ID (`API`/`PAGE`/`COMP`/`TEST`) whose `Source IDs` chain never reaches an upstream
`FR`/`NFR`/`FLOW`/`DEC` is an ORPHAN and fails the scan. Keep the chain intact here.

## Completion Standard

- Every requirement, flow, entity, page, API, and test referenced downstream has an ID here.
- IDs are stable after user confirmation; do not renumber because ordering changes.
- Deprecated IDs remain in the registry with status `deprecated` and a replacement when applicable.
