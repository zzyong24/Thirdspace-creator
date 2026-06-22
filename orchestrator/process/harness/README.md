# Long-Running Autonomous Harness

Turns the orchestrator from an interactive, gate-by-gate workflow into one that can run **unattended for
hours/days** to implement the remaining work — using Anthropic's official
[three-agent long-running harness](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
pattern, wired to this repo's executable controls (`reconcile.mjs`, `progress.json`, `pnpm verify`).

## The model (initializer → coding → evaluator)

```
┌── Initializer (run once) ────────────────────────────────────────────────┐
│  init.sh: install deps · progress.mjs generate · reconcile · baseline green │
└──────────────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────▼───────────────────────────────────── loop ──┐
        │  Coding agent — ONE SMALL TASK per FRESH ISOLATED session           │
        │   (each vertical = 3 small tasks: <v>:backend → <v>:frontend → e2e) │
        │   1. node progress.mjs next        → exactly ONE task <v>:<step>    │
        │   2. TDD that step only (red→green): backend repo+test, OR FE       │
        │      transport+PERSISTED_OPS+round-trip test                        │
        │   3. node reconcile.mjs && pnpm verify  (+ the new test)            │
        │   4. git commit -m "feat(<v>): <step> persist+test"                 │
        │   5. record commit hash in progress.json → STOP (one task/session)  │
        └─────────────────────┬──────────────────────────────────────────────┘
                              │ every N verticals, or before "done"
        ┌─────────────────────▼──────────────────────────────────────────────┐
        │  Evaluator (fresh, read-only)                                        │
        │   diff vs module plan + contract · undocumented changes? · tests     │
        │   comprehensive? · set e2e_verified after confirming round-trip+visual│
        │   → return gaps to the queue, or escalate to human (async)           │
        └──────────────────────────────────────────────────────────────────────┘
```

Each iteration uses a **fresh context** (a new subagent), so a multi-day run never depends on one giant
session. Durable memory between iterations = `progress.json` + git history + `ARTIFACT_MANIFEST.yaml`
(reconciled) + `DECISION_LOG.md`. Stop when `progress.mjs status` shows all `done` + `e2e_verified`, or on a
genuine new decision (logged to the async decision queue, not a synchronous stall).

## How to run

**A. In-session via `/goal` (simplest; what we already use):**
```
/goal "progress.mjs shows all verticals done & e2e_verified; reconcile.mjs exits 0; pnpm verify green"
```
Then drive the loop with `progress.mjs next` each iteration (or `/loop`).

**B. Headless / unattended (CI, container, cron).** Each iteration is a **brand-new `claude -p` process =
fully isolated context** for exactly one small task; the queue is re-derived from committed reality between
tasks, so the next session starts clean and just reads `progress.mjs next`:
```bash
bash orchestrator/process/harness/init.sh
while node orchestrator/process/progress.mjs next | grep -q '^NEXT'; do
  claude -p "$(cat orchestrator/process/harness/coding-agent.md)" \
    --settings orchestrator/process/harness/settings.autonomous.json \
    --permission-mode acceptEdits --max-turns 40       # small task → low turn cap
  node orchestrator/process/reconcile.mjs || break      # halt-on-drift
  node orchestrator/process/progress.mjs generate       # re-derive queue from the new commit
done
claude -p "$(cat orchestrator/process/harness/evaluator.md)" --permission-mode plan   # sets e2e_verified
```
Run inside a sandbox/container; set `max_budget_usd` and OpenTelemetry for cost/observability. Isolation is
structural: state lives in git + progress.json, never in a session — so a crashed/again-started task just
re-reads `next`.

**C. GitHub Action (daily, durable across days):** schedule the loop above on `feat/service-contract`; each
run advances a few verticals and commits. State survives via the committed `progress.json` + manifest.

## The confirmation-model flip (why this is safe to leave alone)

The interactive workflow stalls on per-stage `needs-user-confirmation`. For unattended runs that is replaced
by **one-time scope-envelope pre-authorization**: the human signs off the requirements + domain model +
contract + release criteria ONCE (the stages 01–14 batch), which **pre-authorizes autonomous build of every
downstream vertical**. After that the loop only halts for a *genuinely new* decision, which it appends to the
async decision queue in `DECISION_LOG.md` and keeps going on unblocked work. See `rules/orchestrator-state-machine.md`
§"Autonomous Mode".

## Guardrails (`settings.autonomous.json`)

- Permission allowlist (Read/Edit/Write + scoped Bash: node process scripts, `pnpm`, `git add/commit`);
  `git push` and `rm -rf` denied.
- **Stop hook = `node orchestrator/process/reconcile.mjs`** — every turn must end with the manifest reconciling
  to reality (no drift can accumulate silently).
- Bound each iteration with `--max-turns`; bound the run with `max_budget_usd`.

## Files

| File | Role |
|---|---|
| `init.sh` | Initializer — deps, generate progress, reconcile, baseline. |
| `coding-agent.md` | The per-iteration coding-agent contract (pick one → TDD → verify → commit → update progress). |
| `evaluator.md` | The evaluator contract (review vs plan/contract, set `e2e_verified`, escalate gaps). |
| `settings.autonomous.json` | Unattended-run guardrails (allowlist + Stop-hook reconcile). |
| `PARALLEL.md` | Running MANY Claudes without file conflicts: per-vertical disjointness, worktree-per-agent, the 6 shared barrels, lease/batch, barrier + serial merge. |
| `../progress.mjs` | Derives/queries `progress.json` (the task queue). |
| `../reconcile.mjs` | Drift gate run every iteration. |

## Honest limits (per Anthropic guidance)

Keep humans in the loop for: subjective design/naming, security-critical code, release/deploy, and the
**E2E/visual confirmation that sets `e2e_verified`** (the current visual suite is red — OPEN-002 — so "looks
done" must not auto-promote). Break work into small per-vertical commits, not one monolithic session.
