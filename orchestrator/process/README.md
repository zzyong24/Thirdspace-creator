# orchestrator/process — executable process layer (generic)

Project-agnostic mechanisms for making the orchestrator's control artifacts machine-checkable. **Initialize the
project-specific files per project** — never commit one project's config into this skill.

## Generic (shipped by the skill — reusable as-is)
- `reconcile.mjs` — drift detector / executable gate (manifest ↔ git/fs reality, blocking-consistency, staleness). Reads `reconcile.config.json`. Invokes `orphan-scan.mjs` and folds its verdict in.
- `reviewctl.mjs` — convergent SPEC-review ledger. Validates stable findings and legal recheck deltas,
  computes verdicts, keeps one compact current snapshot, appends a hash-chained round history, and binds
  PASS receipts to the current SPEC/constitution. `audit` is wired into reconcile.
- `frontend-validation.mjs` — validates PAGE journey contracts and compact real-browser/desktop reports:
  separate logic/surface/journey/experience levels, post-action coherence, non-fixture witnesses, adverse
  conditions, normal/minimum viewports, and v2 browser-visible text artifacts (rejects leaked control IDs
  such as `T106`/`API-203`). On strict projects `taskctl complete` executes the
  allowlisted `frontend_verify_commands[verify_key]` at the report's exact HEAD, requires clean declared
  `watched_paths`, records command/output hashes, and writes a report receipt; reconcile invalidates it
  after watched-code, contract, report, event, or config drift.
- `taskctl.mjs` — supported state-transition entry. `start` uses the review allowlist/receipt; a UI
  `complete` with `验收=待验` accepts only a valid frontend report. BACKLOG + event updates are transactional
  on ordinary filesystem failures.
- `strict-receipts-migrate.mjs` — explicit old-project migration. `check` reports missing policy/columns;
  `apply` adds receipt columns and sets `receipt_policy=required` as one crash-recoverable transaction. Active
  tasks default to `待验`; only IDs explicitly passed through `--non-ui` receive `—`.
- `program-gate.mjs` — mandatory completion gate whenever one journey crosses independently versioned,
  deployed or backlogged projects. It binds canonical FLOW, exact deployed
  component commits/URLs, non-fixture step evidence and fresh cross-project commands executed from temporary
  checkouts of the declared deployed commits. `--audit` reruns them instead of trusting the execution JSON;
  a failed run overwrites old PASS before returning `NO-GO`.
- `state-lock.mjs` — one project-wide exclusive writer lock shared by `taskctl` and `reviewctl`.
  Concurrent agents fail explicitly before committing stale BACKLOG/event snapshots; a killed owner's
  stale lock is never auto-stolen.
- `orphan-scan.mjs` — EXECUTABLE bidirectional orphan scan. Parses the canonical ` ```id-registry ` / ` ```traceability ` blocks in `ID_REGISTRY.md` + `TRACEABILITY_MATRIX.md` and COMPUTES both directions (downstream→upstream orphans; upstream→downstream broken chains). Exit 0 clean · 1 broken/non-canonical · 2 missing. Stack-agnostic — reads optional `orphan-scan.config.json` (prefixes/statuses/paths). The verdict is computed by code, not trusted from a paragraph.
- `progress.mjs` — per-module task queue driver (generate/status/next/show/batch/claim/release/done). Reads `modules.config.json`.
- `manifest.schema.json` — structural/enum contract for ARTIFACT_MANIFEST.yaml.
- `harness/` — long-running autonomous harness methodology (3-agent init/coding/evaluator, isolation, PARALLEL.md, settings.autonomous, run.sh/verify-task.sh). Treat the shell scripts' `pnpm`/`frontend`/`backend` commands as **examples to adapt** to the project's stack.
- `rules/orchestrator-state-machine.md` — pinned state machine (incl. Executable Enforcement + Autonomous Mode).

## Initialize per project (from the examples)
- `cp modules.config.example.json modules.config.json` → fill in this project's modules, tasks, and **done_signals**.
- Do not hand-copy `reconcile.config.example.json`. Run `tools/init-project.sh` with an explicit
  `--topology single|multi`; it creates the required strict config and the current `1-plan` probe. Add later
  probes only from this project's current manifest and real artifact paths.
- `cp orphan-scan.config.example.json orphan-scan.config.json` → set `control_dir` (where `ID_REGISTRY.md`/`TRACEABILITY_MATRIX.md` live) and, only if your stack differs, the id-prefix/status sets. Defaults work as-is for the JS/TS reference stack; the file is optional.

Fresh init sets `"receipt_policy": "required"` and scaffolds both BACKLOG receipt columns. Missing or explicit
`legacy` policy remains readable for inspection/blocking but cannot `start` or `complete`, and reconcile returns
non-zero. Upgrade never invents receipts: run
`node orchestrator/process/strict-receipts-migrate.mjs check`, then `apply --non-ui <explicit-ids>`.

`tools/init-program.sh` also persists `"program_completion_required": true` in the coordinator's reconcile
config. Deleting or omitting `program.config.json` therefore remains an error instead of silently opting out.
Fresh `init-project.sh` requires an explicit `--topology single|multi`; `multi` also requires `--program-id`
and invokes `init-program.sh` immediately, so “never initialized” cannot masquerade as a single-project release.
Older projects missing the explicit boolean remain fail-closed until `init-project.sh --update --topology ...`
records the classification; the updater never guesses it.

For a journey spanning independently deployed projects, update the coordinator engine, then run
`bash <skill>/tools/init-program.sh <coordinator-project> --id <id> --name <name>`. The control plane under
`orchestrator/program/` owns only execution topology and evidence; existing `docs/journeys/FLOW-*` remains the
business authority.

The editor hook is only an immediate guard for the tool types actually registered in `.claude/settings.json`.
Direct shell/IDE writes can bypass it. `taskctl` is the normal write path and `reconcile`/CI is the detection
backstop; coordinated malicious rewrites of every local artifact are outside what a repository-local skill
can physically prevent.

## ⚠️ The done-signal lesson (2026-06-22)
Define each task's `done_signals` against the layer the **app actually uses**. Verify where real
persistence/UI/data live BEFORE writing signals. A wrong path makes the queue report "missing" work that
already exists elsewhere → an agent builds it in the wrong layer → dead code. A green queue must mean the
real thing is done. (This exact mistake happened once; that's why `progress.mjs` and the example carry the warning.)
