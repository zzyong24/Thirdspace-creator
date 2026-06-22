# Coding Agent — one SMALL TASK, one isolated session

GOLDEN RULE: you implement **exactly ONE task** (e.g. `artifacts:backend`), then stop. You run in a **fresh,
isolated session** — no memory of any other task. Your only durable memory is `progress.json`, `git log`,
the module plan, the contract resource, and the proven reference slice. Keep the task small enough to finish
and verify in this one session.

## Steps

1. **Get the task.** Run `node orchestrator/process/progress.mjs next` → it prints exactly one task
   `<vertical>:<step>`. That is your ENTIRE job. Read only what this task needs:
   - the module plan `docs/superpowers/plans/modules/*-<vertical>.md`
   - the contract resource `contract/src/resources/<vertical>.ts`
   - the reference slice for this step (Projects: `backend/src/repositories/project-repository.ts` for
     `:backend`; `frontend/src/server/modules/projects/*` for `:frontend`).

2. **Do only that step (TDD, red → green):**
   - `:backend` → write the failing pglite repository test, then the Drizzle repository (reuse the existing
     `backend/src/schema/<vertical>.ts`). Inject clock+id for determinism.
   - `:frontend` → write the failing FE round-trip test, then add the persist ops to the transport + register
     them in `PERSISTED_OPS` + wire the page. (Backend for this vertical must already be done.)
   - `:e2e` → this is the **evaluator's** job, not yours. If `next` returns an `:e2e` task, stop and let the
     evaluator run.

3. **Verify (the gate to commit), all green:** `node orchestrator/process/reconcile.mjs` (0 drift) ·
   `cd frontend && pnpm verify` · the new test you just wrote. If anything is red and you cannot fix it
   within this session, set `blocked_reason` on the vertical in `progress.json` and STOP.

4. **Commit just this task.** `git add` only the files for this step; commit
   `feat(<vertical>): <step> persist+test (autonomous)` with the Co-Authored-By trailer.

5. **Mark done + STOP.** Run `node orchestrator/process/progress.mjs done <vertical>:<step> --commit <hash>`
   (this records the commit and advances the queue — required for data-source/flow/e2e which aren't
   file-derived; harmless for repo/frontend which `generate` re-derives). Then STOP. One task per session.

## Rules

- ONE task only. Small, verifiable, committed, isolated. Never batch tasks or carry context between them.
- Never weaken an existing assertion to go green. Add new tests; update derived-value assertions honestly.
- A genuinely new decision (schema ambiguity, contract gap, security/permission/data-ownership) → append a
  `DEC-###` to `DECISION_LOG.md`, set `blocked_reason`, and stop. Don't guess on product-direction/security.
- `e2e_verified` is never yours to set. Never `git push`. Never `rm -rf`. Stay inside the
  `settings.autonomous.json` allowlist.
