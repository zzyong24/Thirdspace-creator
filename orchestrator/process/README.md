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
- `research-gate.mjs` — BUILD-time uncertainty circuit breaker. `observe` records a project-defined failure family
  plus a framework-defined trigger shape and opens the gate on repeated/no-progress observations or an immediate
  high-cost/churn/external-unknown/high-impact trigger, pausing the implementation task. `resume` validates a bounded
  v2 card with project-defined acceptance criteria plus any required user DEC and returns the task to `📋`.
  `audit` is wired into reconcile so an open gate cannot be bypassed by hand-editing BACKLOG.
- `governance-guard.mjs` — task/write-set scoped scope-expansion and complexity guard. `baseline-marker` emits
  a read-only marker bound to exact task, file SHA-256, complexity categories, REV-ADD IDs, and structured threat
  tuples; `baseline-apply` explicitly installs it under `COMPLEXITY_LEDGER.json.historical_baselines`. This is a
  quarantine record, never scope/threat authorization: the bound task stays red, while unrelated ready tasks run;
  file drift, marker drift, or a new marker is red again. Complexity detection treats reuse, compatibility,
  delegation, and negative declarations as non-expanding; an evidence protocol blocks only on an explicit new
  mechanism declaration or local owner/persistence/state/operation signals. Bare domain words are not mechanisms,
  and a ledger entry for another task cannot authorize the selected task.
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
- `progress.mjs` — per-module task queue driver (generate/status/next/schedule/show/batch/claim/release/done).
  `schedule` runs task-scoped delivery watchdog checks: a polluted task is quarantined from that ready set while
  an independent dependency-ready task remains runnable; historical debt is not a repository-wide stop. Ordered
  multi-step tasks may declare `step_depends_on`: a present step key replaces the legacy module `depends_on`, while
  an absent key preserves old behavior. Intermediate `done` binds a commit while BACKLOG stays `🔨`; only the final
  step may require and consume the task-level `✅` transition. In autonomous mode `done_signals` never auto-advance
  from file presence, because that would bypass step order, commit binding, and the board-state gate. `schedule`,
  `claim`, and `done` share the same dependency/block/quarantine eligibility; a claimed step can complete only with
  `done ... --agent <matching-owner>`.
- `autonomy-guard.mjs` — L2+ fail-closed preflight and delivery watchdog. An explicit
  `baseline-marker --task T-xxx --reason "..."` prints (but never installs) a canonical task-event-prefix marker
  for `DELIVERY_GUARD.json.review_cycle_baselines`. `isolated` freezes a legacy prefix while allowing current work;
  `quarantined` also blocks that task. Neither is authorization: a changed old event or any new same-task event is red.
- `manifest.schema.json` — structural/enum contract for ARTIFACT_MANIFEST.yaml.
- `harness/` — long-running autonomous harness methodology (3-agent init/coding/evaluator, isolation, PARALLEL.md, settings.autonomous, run.sh/verify-task.sh). Treat the shell scripts' `pnpm`/`frontend`/`backend` commands as **examples to adapt** to the project's stack.
- `rules/orchestrator-state-machine.md` — pinned state machine (incl. Executable Enforcement + Autonomous Mode).

## Initialize per project (from the examples)
- `cp modules.config.example.json modules.config.json` → fill in this project's modules, tasks, and **done_signals**.
  When a vertical name differs from its canonical BACKLOG/review task, bind `task_id` explicitly; quarantine is
  keyed to that task ID, never inferred from a similar module name. Use `step_depends_on` only when successive steps
  have different prerequisites; do not split one product task into fake board IDs or toggle `✅` to complete an
  intermediate step.
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

The editor hooks are phase adapters, not a security boundary: Claude Code uses `.claude/settings.json`, while Codex
uses project-local `.codex/hooks.json`; both register `PreToolUse` as the immediate guard, `PostToolUse` as the
control-plane observer, and `Stop`/`reconcile` as the final settlement.
This mirrors Harness's pre-execute → execute → post-execute → result separation without coupling policy to a
specific tool. Direct shell/IDE writes can bypass hooks; `taskctl` is the normal write path and reconcile/CI is the
detection backstop. A post observer cannot undo a completed tool call and must never be advertised as doing so.

## ⚠️ The done-signal lesson (2026-06-22)
Define each task's `done_signals` against the layer the **app actually uses**. Verify where real
persistence/UI/data live BEFORE writing signals. A wrong path makes the queue report "missing" work that
already exists elsewhere → an agent builds it in the wrong layer → dead code. A green queue must mean the
real thing is done. (This exact mistake happened once; that's why `progress.mjs` and the example carry the warning.)
