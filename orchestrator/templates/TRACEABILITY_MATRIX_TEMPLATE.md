# Traceability Matrix

## Purpose

Show how product intent becomes flows, model concepts, pages, components, contracts, tests, validation evidence, and release decisions.

## Canonical machine-checkable block (REQUIRED)

`orchestrator/process/orphan-scan.mjs` COMPUTES the consistency verdict from this file — it does not
trust prose. To be checkable it parses a single fenced ` ```traceability ` block, not the surrounding
narrative. Put free-form notes anywhere you like OUTSIDE the block; put the trace data INSIDE it, in the
canonical form below. If the block is missing or off-format, the scan emits a "non-canonical / cannot
parse" error and FAILS — it never guesses.

**Canonical-form rules:**

- One ` ```traceability ` fenced block containing a GFM pipe table.
- **Fixed columns, exact lowercase header match:** `Product | Flow | Entity | Page | API | Test | Status`.
- **IDs only** in `Product/Flow/Entity/Page/API/Test`. An ID is `PFX-name` where `PFX` is 2–6 uppercase
  letters and `name` is one or more hyphen-joined alphanumeric segments (`FR-create`, `API-list`,
  `TC-LIST-3`, `TC-UPD-1`).
- **Comma-separate** multiple IDs in a cell: `TC-LIST-1, TC-LIST-2`.
- **Ranges** expand with `..`: `TC-LIST-1..5` → `TC-LIST-1 … TC-LIST-5`. The stem before the trailing
  number is repeated.
- **Slash-join** synonym/co-defined IDs with ` / `: `ENT-Task / ENT-User` (a space on each side).
- **No link** is the literal token `NONE` (never `(none)`, never blank-with-emoji, never an em-dash).
- **Status** is exactly ONE literal token — `OK` | `BROKEN` | `DEFERRED` | `RISK` | `PLANNED`. **No emoji as data.**
  `PLANNED` = confirmed at PLAN, not yet built (normal during v3 stages 1-3; needs no DEC link); every `PLANNED` row must resolve to `OK`/`DEFERRED`/`RISK` before SHIP — gate 14 checks none remain.
  (Write `OK`, not `✅`.) Add any human commentary in a `Status` cell only after the token, e.g.
  `OK` then prose in a separate note line outside the table.

```traceability
| Product | Flow | Entity | Page | API | Test | Status |
| --- | --- | --- | --- | --- | --- | --- |
| FR-001 | FLOW-001 | ENT-001 | PAGE-001 | API-001 | TC-API-1..3 | OK |
| FR-002 | NONE | NONE | NONE | NONE | NONE | DEFERRED |
```

(Sample rows match `ID_REGISTRY_TEMPLATE.md`'s sample block and pass the scan as-is. Row 2 shows the
ONLY legal shape for unbuilt confirmed scope: explicit `DEFERRED` **justified by a DEC/RISK link** —
here via FR-002's registry `Source IDs: DEC-001`; an unjustified `DEFERRED` is a silent drop and FAILS
the scan. Per Harness Control Plane §3 the deferral also needs an owner + trigger + a `BACKLOG.md`
row, recorded outside this table. `BROKEN` is a finding the scan emits, not a status you park work
under.)

Verdict computed by code (run after every cross-artifact change, and in `reconcile.mjs`):

```bash
node orchestrator/process/orphan-scan.mjs        # exit 0 clean · 1 broken/non-canonical · 2 missing
```

## Gap Review

| Gap ID | Description | Affected IDs | Severity | Required Action | Owner |
| --- | --- | --- | --- | --- | --- |
| `GAP-001` | `<missing link or mismatch>` | `<ids>` | low | `<action>` | `<owner>` |

## Completion Standard

- The ` ```traceability ` block parses canonically (orphan-scan does not report "non-canonical").
- Every confirmed `FR` and release-critical `NFR` has at least one validation path.
- Every page and API traces back to a product requirement or explicit decision (downstream→upstream).
- Every release-critical journey has test or browser-validation evidence (upstream→downstream).
- Any unimplemented confirmed requirement is listed as a gap, deferred work, or accepted risk — and its
  row carries a non-release-critical Status token (`DEFERRED`/`RISK`), not a laundered `OK`.
