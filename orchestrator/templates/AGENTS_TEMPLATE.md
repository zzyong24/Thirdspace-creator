# AGENTS.md

## Project Context

- Product source of truth: `<path-to-product-spec>`
- Current implementation context: `<path-to-project-context>`
- Artifact manifest: `<path-to-ARTIFACT_MANIFEST.yaml>`
- ID registry: `<path-to-ID_REGISTRY.md>`
- Decision log: `<path-to-DECISION_LOG.md>`
- Traceability matrix: `<path-to-TRACEABILITY_MATRIX.md>`
- Active stage: `<orchestrator-stage>`
- Do not implement behavior that cannot be traced to approved artifacts or recorded assumptions.
- If this repository participates in an `orchestrator/program/` journey, local task completion is only
  implementation evidence. Only the coordinator's `program-gate` may declare the cross-project product journey complete.

## Dev Environment Tips

- Install dependencies with `<project-command>`.
- Start the local development server with `<project-command>`.
- Use the package or app folder that owns the feature before running commands.

## Testing Instructions

- Run focused tests for changed code first: `<focused-test-command>`.
- Run the required verification suite before completion: `<full-verification-command>`.
- Frontend work must include browser validation for release-critical journeys.
- Backend behavior must follow the service contract and test plan.

## Change Control

- Record changes to scope, IA, data model, contracts, security, or release criteria before implementation.
- Mark downstream artifacts invalidated in the artifact manifest when approved upstream artifacts change.
- Ask for confirmation before making breaking contract changes.
- Keep generated or imported design output subordinate to approved specs.

## PR / Review Instructions

- Summarize changed artifacts and implementation evidence.
- Link validation reports and test output.
- Call out accepted risks and deferred work explicitly.

## Output Language

- Write all artifacts and user-facing communication in the user's language: `<user-language, e.g. Simplified Chinese>`.
- Every dispatched sub-agent must follow this language for prose; keep stable IDs, file names, code identifiers, schema/field names, enum/status values, commands, and URLs untranslated.
