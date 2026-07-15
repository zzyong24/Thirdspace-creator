# orchestrator/process — executable process layer (generic)

Project-agnostic mechanisms for making the orchestrator's control artifacts machine-checkable. **Initialize the
project-specific files per project** — never commit one project's config into this skill.

## Generic (shipped by the skill — reusable as-is)
- `reconcile.mjs` — drift detector / executable gate (manifest ↔ git/fs reality, blocking-consistency, staleness). Reads `reconcile.config.json`. Invokes `orphan-scan.mjs` and folds its verdict in.
- `orphan-scan.mjs` — EXECUTABLE bidirectional orphan scan. Parses the canonical ` ```id-registry ` / ` ```traceability ` blocks in `ID_REGISTRY.md` + `TRACEABILITY_MATRIX.md` and COMPUTES both directions (downstream→upstream orphans; upstream→downstream broken chains). Exit 0 clean · 1 broken/non-canonical · 2 missing. Stack-agnostic — reads optional `orphan-scan.config.json` (prefixes/statuses/paths). The verdict is computed by code, not trusted from a paragraph.
- `progress.mjs` — per-module task queue driver (generate/status/next/show/batch/claim/release/done). Reads `modules.config.json`.
- `manifest.schema.json` — structural/enum contract for ARTIFACT_MANIFEST.yaml.
- `harness/` — long-running autonomous harness methodology (3-agent init/coding/evaluator, isolation, PARALLEL.md, settings.autonomous, run.sh/verify-task.sh). Treat the shell scripts' `pnpm`/`frontend`/`backend` commands as **examples to adapt** to the project's stack.
- `rules/orchestrator-state-machine.md` — pinned state machine (incl. Executable Enforcement + Autonomous Mode).

## Initialize per project (from the examples)
- `cp modules.config.example.json modules.config.json` → fill in this project's modules, tasks, and **done_signals**.
- `cp reconcile.config.example.json reconcile.config.json` → set `work_branch` + probes.
- `cp orphan-scan.config.example.json orphan-scan.config.json` → set `control_dir` (where `ID_REGISTRY.md`/`TRACEABILITY_MATRIX.md` live) and, only if your stack differs, the id-prefix/status sets. Defaults work as-is for the JS/TS reference stack; the file is optional.

## ⚠️ The done-signal lesson (2026-06-22)
Define each task's `done_signals` against the layer the **app actually uses**. Verify where real
persistence/UI/data live BEFORE writing signals. A wrong path makes the queue report "missing" work that
already exists elsewhere → an agent builds it in the wrong layer → dead code. A green queue must mean the
real thing is done. (This exact mistake happened once; that's why `progress.mjs` and the example carry the warning.)
