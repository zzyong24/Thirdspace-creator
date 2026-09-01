# Coding Agent — one small task, one fresh session

Complete exactly one scheduled step, verify it, commit it, advance the queue, then stop. Durable truth lives in Git, `progress.json`, `BACKLOG.md`, the task binding, and project authorities—not session memory.

## Steps

1. Run `node orchestrator/process/progress.mjs next`. The returned `<vertical>:<step>` is the entire job. Read its Task Packet or module-local references, exact write/read sets, dependencies, and `verify_commands`; do not scan unrelated project history.

2. For executable behavior, use RED (expected failure) → GREEN (minimal implementation) → one bounded cleanup pass (behavior-preserving) → rerun the same focused verification. Cleanup is normally ≤10 minutes and stays inside the write_set and directly touched private code: deduplicate, rename, narrow responsibility, tighten types, remove temporary compatibility/dead code. It must not add behavior, change interaction/public API/schema/data ownership, add a runtime/dependency, or widen scope; those require a new task/decision.

   Exploratory UI, style, docs, generated output, or non-behavioral config must not manufacture RED; use the smallest useful visual/type/syntax/smoke check. UI state or interaction still needs its component/journey test. A declared review/evidence step produces only its receipt and never implements a later step.

3. Run the new focused test and this step's exact configured verification. Then run `bash orchestrator/process/harness/verify-task.sh <vertical>:<step>`. Fix the real signal without weakening assertions. If the bounded repair cannot make it green, run `node orchestrator/process/progress.mjs block <vertical>:<step> --reason "<root cause>"` and stop.

4. Stage only this step's files and create one commit. Never include unrelated or main-control-plane changes from another worker. Never push.

5. Run `node orchestrator/process/progress.mjs done <vertical>:<step> --commit <hash>` and stop. Intermediate steps keep their canonical BACKLOG row at `🔨`; only the final declared step may use `✅`.

## Hard boundaries

- Never delete dependencies, pre-mark upstream work done, edit outside write_set, or weaken/skip tests to obtain GREEN. `test-integrity.mjs` enforces the mechanical portion.
- Product direction, public contract, schema, security/permission, or data ownership ambiguity is a decision—not an implementation guess. Record it through the project's existing decision path, block the step, and stop.
- One step, one fresh context, one commit. No push, deploy, destructive cleanup, or manual claims of end-to-end completion.
