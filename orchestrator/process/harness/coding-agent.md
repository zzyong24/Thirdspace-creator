# Coding Agent — one SMALL TASK, one isolated session

GOLDEN RULE: you complete **exactly ONE scheduled step** (e.g. `artifacts:implementation`), then stop. You run in a **fresh,
isolated session** — no memory of any other task. Your only durable memory is `progress.json`, `git log`,
the module plan, the contract resource, and the proven reference slice. Keep the task small enough to finish
and verify in this one session.

## Steps

1. **Get the task.** Run `node orchestrator/process/progress.mjs next` → it prints exactly one task
   `<vertical>:<step>`. That is your ENTIRE job. Read only what this task needs:
   - the module plan `docs/superpowers/plans/modules/*-<vertical>.md`
   - the contract resource `contract/src/resources/<vertical>.ts`
   - the project's module-local references and the exact `verify_commands` entry for this step.

2. **Do only that step:** implementation follows TDD red → green; an explicit review/evidence step produces only
   its declared receipt and must not implement later work. The scheduler has already evaluated that step's effective
   `step_depends_on`/legacy `depends_on`; never delete dependencies or pre-mark an upstream step done.

3. **Verify (the gate to commit), all green:** `node orchestrator/process/reconcile.mjs` (0 drift) ·
   `node orchestrator/process/test-integrity.mjs` (0 weakening — see Rules below) · `cd frontend && pnpm verify` ·
   the new test you just wrote. If anything is red and you cannot fix it within this session, set
   `blocked_reason` on the vertical in `progress.json` and STOP.

4. **Commit just this task.** `git add` only the files for this step; commit
   `feat(<vertical>): <step> persist+test (autonomous)` with the Co-Authored-By trailer.

5. **Mark done + STOP.** Run `node orchestrator/process/progress.mjs done <vertical>:<step> --commit <hash>`
   (this records the commit and advances the queue). Intermediate steps require the canonical BACKLOG row to remain
   `🔨`; only the final declared step may use `✅`. Then STOP. One step per session.

## Rules

- ONE task only. Small, verifiable, committed, isolated. Never batch tasks or carry context between them.
- Never weaken an existing assertion to go green. Add new tests; update derived-value assertions honestly.
  This is now a DETERMINISTIC GATE, not just etiquette: `verify-task.sh` runs `test-integrity.mjs` BEFORE the
  suite and FAILS the task if, vs the base ref, your changed test files DROP assertion/test-case counts, ADD
  skip/only/ignore markers (.skip/.only/xit/@ts-ignore/eslint-disable/…), or LOWER a coverage threshold. You
  cannot argue past it — fix the code so the existing assertions pass. If a criterion is genuinely wrong,
  don't delete it silently: append a `DEC-###` justifying the change and set `blocked_reason` (next bullet).
  This gate checks COUNTS, not strength — keeping the count while gutting a check (`assert.equal(x,'Cory')` →
  `assert.ok(true)`, or editing an expected value to match broken code) passes it but is still tampering, and
  the heterogeneous evaluator/rebuttal pass is there to catch exactly that. Don't game the count.
- A genuinely new decision (schema ambiguity, contract gap, security/permission/data-ownership) → append a
  `DEC-###` to `DECISION_LOG.md`, set `blocked_reason`, and stop. Don't guess on product-direction/security.
- `e2e_verified` is never yours to set. Never `git push`. Never `rm -rf`. Stay inside the
  `settings.autonomous.json` allowlist.

## Self-repair (critic) & red→green evidence

- **Self-repair, not introspection.** If `verify-task.sh` is red, you may retry within THIS
  session — but converge on the **real signal** (the failing test / tsc / reconcile output),
  not on "this looks better". The harness (`run.sh`) also re-spawns you up to 2 repair rounds
  with the failure output; if still red after that it HALTs for a human. Never go green by
  weakening or deleting an assertion — that defeats the gate (anti-laundering).
- **Leave red→green evidence (F2P).** Your new test MUST have failed before your change and
  passed after. Capture it: put the pre-change failure line in the commit message
  (`red: <test> — <error>`) or `progress.json`. The evaluator / `verify-task.sh` cross-check
  this, so a suite that silently excludes the failing case will not pass.
