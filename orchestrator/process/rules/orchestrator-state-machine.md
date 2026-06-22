# Orchestrator State Machine

## Purpose

Use this rule to decide where the workflow is, what can run next, and which downstream artifacts become stale after a change. The Orchestrator is not a loose checklist; it is a staged state machine driven by artifacts.

## Stage Status Values

- `not-started`: no usable artifact exists.
- `draft`: artifact exists but has not passed its stage gate.
- `needs-user-confirmation`: artifact or change affects product direction, IA, contracts, data ownership, security, release criteria, or implementation scope.
- `blocked`: required input is missing and no safe default exists.
- `passed`: artifact exists, gate ran, and required confirmations are recorded.
- `accepted-risk`: gate found issues, and the user explicitly accepted the risk.
- `invalidated`: upstream changes make this artifact unreliable.

## Required Control Artifacts

- `ARTIFACT_MANIFEST.yaml`: current stage status, artifact paths, dependencies, gate result, and invalidation state.
- `ID_REGISTRY.md`: canonical IDs for requirements, flows, entities, pages, components, APIs, tests, decisions, and assumptions.
- `DECISION_LOG.md`: user confirmations, defaults, tradeoffs, and accepted risks.
- `CHANGE_IMPACT.md`: impact analysis for changes to approved artifacts.
- `TRACEABILITY_MATRIX.md`: cross-artifact links from product intent to implementation and tests.

## Transition Rules

1. A stage may move to `passed` only when required output exists, the relevant gate has been run, and required confirmations are recorded.
2. A stage may move to `accepted-risk` only when findings are explicit and the user accepts the risk.
3. A downstream stage must move to `invalidated` when an upstream change affects its assumptions, IDs, contracts, data, screens, tests, or release criteria.
4. Implementation stages cannot start from `draft`, `blocked`, or `invalidated` upstream artifacts.
5. Skipping a stage requires a decision log entry with reason, risk, and affected downstream stages.

## Invalidation Rules

- Product spec changes invalidate business flow, domain model, IA, page specs, frontend spec, backend spec, contracts, tests, and release review unless the impact analysis proves otherwise.
- Business flow changes invalidate domain model, IA, page specs, backend module workflow, contracts, and tests that reference changed flow IDs.
- Domain model changes invalidate mock data, backend spec, service contracts, and tests that reference changed entity IDs.
- IA changes invalidate page specs and frontend specs that reference changed surface IDs.
- Page spec changes invalidate frontend components, mock data, service contracts, E2E tests, and frontend validation.
- Service contract changes invalidate frontend integration code, backend contract tests, integration report, and release review.
- Security, permissions, data ownership, or release criteria changes require user confirmation before implementation continues.

## State Check Format

```text
Current stage: <stage id and name>
Status: <status>
Required artifacts: <paths>
Upstream dependencies: <ids or artifact paths>
Gate: <not-run | pass | fail | accepted-risk>
Confirmation required: <yes/no and why>
Invalidates: <downstream stages or none>
Next action: <generate | revise | ask | validate | implement>
```

## Executable Enforcement (v2 — added 2026-06-22)

The statuses and gates above are necessary but not sufficient: prose self-attestation let a manifest drift
out of sync with reality. These rules make the control layer machine-checkable.

1. **Manifest drift check is mandatory.** Treat `ARTIFACT_MANIFEST.yaml` as untrusted until
   `node orchestrator/process/reconcile.mjs` passes. It validates structure against
   `manifest.schema.json`, checks each non-`not-started` stage's claimed artifact against git+filesystem
   reality on `project.work_branch` (drift in BOTH directions is an error), and flags `updated_at` older
   than the newest `DECISION_LOG` date. Wire it as a required CI check. (Analogue: `terraform plan` drift.)
2. **Consistency gate is BLOCKING.** When `consistency_gate.status: fail`, no stage listed in
   `consistency_gate.blocks` may be `passed`. To proceed anyway, set that stage to `accepted-risk` with an
   explicit `DECISION_LOG` entry — never leave it `passed` over a broken release-critical chain.
3. **Failed verdicts are RETAINED, never silently invalidated.** A gate FAIL that is later superseded by a
   PASS keeps its record plus a delta (what changed, which re-run). Do not relabel the FAIL `invalidated`;
   `invalidated` is only for artifacts made stale by an *upstream change*, not for hiding a prior failing
   audit. (Analogue: immutable ADR history.)
4. **Gates require executable evidence.** Each gate's `Status: pass` must cite a command + result, not a
   paragraph. See `gates/_GATE_EVIDENCE.md`.
5. **Pin the definition with the project.** Vendor the rule/gate files (or a commit SHA) into the project's
   `orchestrator/process/` so an audit is reproducible on any machine, not dependent on a machine-local
   skill install.

## Autonomous Mode (long-running harness)

For unattended multi-hour/day runs (see `process/harness/`), the synchronous per-stage confirmation model is
replaced by:

1. **Scope-envelope pre-authorization.** The human confirms requirements + domain model + service contract +
   release criteria ONCE (the stages 01–14 batch). That single sign-off pre-authorizes autonomous build of
   all downstream verticals. Record it as a DEC entry; afterward the loop does not stop for routine
   per-vertical progress.
2. **Async decision queue.** The loop halts ONLY for a genuinely new decision affecting product direction, IA,
   data ownership, security, contracts, or release criteria. It appends the question to `DECISION_LOG.md`
   (status: needs-user-confirmation), sets `blocked_reason` on the affected item, and CONTINUES on other
   unblocked verticals. Humans answer asynchronously.
3. **Per-iteration durable state.** Each iteration: reconcile → `progress.mjs next` → fresh subagent → TDD +
   verify → commit → update `progress.json`. progress.json + git + the manifest are the cross-session memory.
4. **`e2e_verified` is human/evaluator-set, never inferred.** A vertical is not release-done until its real
   round-trip + visual check pass (don't trust "looks done").

This keeps the workflow's guarantees (traceability, gates, retained history) while removing the synchronous
stalls that block long runs.
