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
