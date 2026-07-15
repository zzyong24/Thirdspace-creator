# Long-Running Autonomous Harness

Turns the orchestrator from an interactive, gate-by-gate workflow into one that can run **unattended for
hours/days** to implement the remaining work — using Anthropic's official
[three-agent long-running harness](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
pattern, wired to this repo's executable controls (`reconcile.mjs`, `progress.json`, the project's verify
command).

> **Heterogeneous + rebuttal verification (anti "Lonely Verifier").** The coding agent and the verifiers run
> on **different models**, and **two independent read-only passes** review every vertical: a *primary
> evaluator* (confirm-with-evidence) and a *rebuttal reviewer* (assume-broken, default REJECT). Same-family
> reviewer ≈ coder is "two optimists nodding"; in practice ~93% of issues are caught by *exactly one*
> heterogeneous checker, so a lone optimistic reviewer is the wrong default. A vertical advances to
> `e2e_verified` only on **agreement** (PASS+PASS); **high-blast-radius** verticals are **never
> auto-completed** — even on agreement the harness holds them for a human to own the merge. See below.

## The model (initializer → coding → heterogeneous review)

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
        │      transport+<persisted-ops registry>+round-trip test                        │
        │   3. node reconcile.mjs && pnpm verify  (+ the new test)            │
        │   4. git commit -m "feat(<v>): <step> persist+test"                 │
        │   5. record commit hash in progress.json → STOP (one task/session)  │
        └─────────────────────┬──────────────────────────────────────────────┘
                              │ every N iters (EVALUATOR_EVERY_N), and before "done"
        ┌─────────────────────▼──────────────────────────────────────────────┐
        │  HETEROGENEOUS REVIEW — two independent read-only passes, DIFFERENT │
        │  models from the coder (anti "two optimists nodding"):              │
        │   ① primary evaluator  (EVALUATOR_MODEL) — confirm WITH evidence    │
        │   ② rebuttal reviewer  (REBUTTAL_MODEL)  — assume broken, REJECT    │
        │  each emits  `EVAL_VERDICT: <PASS|REJECT|BLOCKED> <vid> :: ev`      │
        │  → run.sh tallies: advance only on AGREEMENT (PASS+PASS);           │
        │    high-blast: HOLD for a human even on PASS+PASS; any REJECT = HALT │
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

**B. Headless / unattended (CI, container, cron).** Use `run.sh` — it drives the loop *and* the heterogeneous
review for you. Each iteration is a **brand-new `claude -p` process = fully isolated context** for exactly one
small task; the queue is re-derived from committed reality between tasks, so the next session starts clean and
just reads `progress.mjs next`. The coder and the two verifiers run on **different models**:
```bash
CODER_MODEL=<cheaper-build-model> \
EVALUATOR_MODEL=<a-different-model> \
REBUTTAL_MODEL=<a-third-model> \
EVALUATOR_EVERY_N=4 \
HARNESS_HIGH_BLAST="auth,billing" \
  bash orchestrator/process/harness/run.sh
```
What `run.sh` does each iteration: coding agent (`--model "$CODER_MODEL"`) → `verify-task.sh` (halt-on-fail) →
`progress.mjs generate` → did-it-advance check (halt if not). Every `EVALUATOR_EVERY_N` committed iters **and
once more before declaring DONE**, it runs the two review passes (each `--permission-mode plan`, read-only, on
its own model), parses each pass's `EVAL_VERDICT:` lines (keyed to the `progress.json` vertical id), and
**advances a vertical only on agreement (PASS+PASS)**; high-blast verticals are held for a human even then.
The judged set is read from `progress.json` (every fully-built, not-yet-verified vertical), so a built vertical
that NEITHER pass names is a **missing verdict = HOLD**, not a silent pass. Any `REJECT`/`BLOCKED` (or an
inconclusive review) **halts the loop** for routing. Original guarantees unchanged: halt-on-verify-fail,
halt-if-task-didn't-advance, `HARNESS_MAX_ITERS` cap, drift gate as the Stop hook. **Exit code:** `0` only on a
clean DONE (queue empty + final review passed), `1` on any HALT (so CI/cron can tell a clean finish from a
stopped gate), `2` on an intentional stop (`HARNESS_ONLY_STEP` checkpoint / `HARNESS_MAX_ITERS` cap).

Run inside a sandbox/container; set `max_budget_usd` and OpenTelemetry for cost/observability. Isolation is
structural: state lives in git + progress.json, never in a session — so a crashed/again-started task just
re-reads `next`.

> The verifiers are **deliberately a different model** than the coder. Leaving all three unset makes them
> share the `claude` default model (homogeneous = a weak gate); `run.sh` logs a WARNING when it detects this.

**C. GitHub Action (daily, durable across days):** schedule the loop above on `<work-branch>`; each
run advances a few verticals and commits. State survives via the committed `progress.json` + manifest.

## The confirmation-model flip (why this is safe to leave alone)

The interactive workflow stalls on per-stage `needs-user-confirmation`. For unattended runs that is replaced
by **one-time scope-envelope pre-authorization**: the human signs off the requirements + domain model +
contract + release criteria ONCE (the v3 PLAN→CONTRACT→DESIGN batch — 确认②), which **pre-authorizes autonomous build of every
downstream vertical**. After that the loop only halts for a *genuinely new* decision, which it appends to the
async decision queue in `DECISION_LOG.md` and keeps going on unblocked work. See `rules/orchestrator-state-machine.md`
§"Autonomous Mode".

## Heterogeneous + rebuttal verification (why one optimistic reviewer is not enough)

A single reviewer from the same model family as the coder agrees with the code it just saw — "two optimists
nodding." Empirically the overlap between independent checkers is tiny: most defects are surfaced by *exactly
one* of them. So the harness verifies with **two independent, heterogeneous, read-only passes**:

| Role | File | Model env | Stance |
|---|---|---|---|
| Coding agent | `coding-agent.md` | `CODER_MODEL` | build one task |
| Primary evaluator | `evaluator.md` | `EVALUATOR_MODEL` (≠ coder) | confirm WITH evidence |
| Rebuttal reviewer | `evaluator-rebuttal.md` | `REBUTTAL_MODEL` (≠ both) | **assume broken; default REJECT** |

- **Independent**: each pass is a fresh `claude -p` context that sees only the committed code + control
  artifacts, never the other pass's reasoning. Disagreement is the signal.
- **Canonical verdict**: every pass ends with one line per vertical —
  `EVAL_VERDICT: <PASS|REJECT|BLOCKED> <vertical-id> :: <evidence>` — which `run.sh` parses with grep (no
  project deps; stack-agnostic). A pass that names no vertical = inconclusive = HALT.
- **Consensus**: a vertical advances to `e2e_verified` only on **PASS + PASS**. Any `REJECT`/`BLOCKED` from
  either pass holds the vertical and halts the loop for routing (queue item / `blocked_reason` / DECISION_LOG).
- **Blast radius (a knob)**: flag expensive-to-undo verticals (auth, payments, schema/migrations, data-
  ownership, cross-module wiring) high-blast. Either per-vertical in `modules.config.json`
  (`"blast_radius": "high"`) or run-level `HARNESS_HIGH_BLAST="id1,id2"`. High-blast verticals are **never
  auto-completed**: even on PASS+PASS the harness HOLDs them for a human to own the merge. (A genuine *third*
  independent reviewer is the planned hardening; until it ships, "high-blast" = agreement + a mandatory human
  gate, not a stronger automated rule — we don't pretend two passes are three.)

**Cadence**: the review runs every `EVALUATOR_EVERY_N` committed iterations (default **4**) *and* once more
before the loop declares DONE — so the last word before "done" is always the adversarial gate, never the
coder's optimism.

### Tunable env vars

| Env | Default | Meaning |
|---|---|---|
| `CODER_MODEL` | `claude` default | model for the coding agent (cheaper build model is fine) |
| `EVALUATOR_MODEL` | `claude` default | primary evaluator — **set it different from `CODER_MODEL`** |
| `REBUTTAL_MODEL` | `claude` default | rebuttal reviewer — different again for max heterogeneity |
| `EVALUATOR_EVERY_N` | `4` | run the two-pass review every N committed iters (+ before DONE) |
| `HARNESS_HIGH_BLAST` | _(empty)_ | comma list of vertical ids held for a human even on PASS+PASS |
| `HARNESS_MAX_ITERS` | `60` | loop cap (unchanged) |
| `HARNESS_MAX_TURNS` | `50` | per-iteration turn cap (unchanged) |
| `HARNESS_ONLY_STEP` | _(empty)_ | only auto-run this step kind, stop at the first other (unchanged) |

> Stack-agnostic: model ids, the verify command, and which verticals are high-blast are all config/env —
> nothing here hardcodes a language, package manager, or test runner.

## Guardrails (`settings.autonomous.json`)

- Permission allowlist (Read/Edit/Write + scoped Bash: node process scripts, `pnpm`, `git add/commit`);
  `git push` and `rm -rf` denied.
- **Stop hook = `node orchestrator/process/reconcile.mjs`** — every turn must end with the manifest reconciling
  to reality (no drift can accumulate silently).
- Bound each iteration with `--max-turns`; bound the run with `max_budget_usd`.

## Files

| File | Role |
|---|---|
| `run.sh` | The headless loop: coder (CODER_MODEL) → verify → advance, + heterogeneous review every N + before DONE. |
| `init.sh` | Initializer — deps, generate progress, reconcile, baseline. |
| `coding-agent.md` | The per-iteration coding-agent contract (pick one → TDD → verify → commit → update progress). |
| `evaluator.md` | Primary evaluator contract — confirm WITH evidence; emits `EVAL_VERDICT`; sets `e2e_verified` only on agreement. |
| `evaluator-rebuttal.md` | Rebuttal reviewer — assume-broken, default REJECT; the independent heterogeneous second pass. |
| `settings.autonomous.json` | Unattended-run guardrails (allowlist + Stop-hook reconcile). |
| `PARALLEL.md` | Running MANY Claudes without file conflicts: per-vertical disjointness, worktree-per-agent, the 6 shared barrels, lease/batch, barrier + serial merge. |
| `../progress.mjs` | Derives/queries `progress.json` (the task queue). |
| `../reconcile.mjs` | Drift gate run every iteration. |

## Honest limits (per Anthropic guidance)

Keep humans in the loop for: subjective design/naming, security-critical code, release/deploy, and the
**E2E/visual confirmation that sets `e2e_verified`** (the current visual suite is red — a tracked issue — so "looks
done" must not auto-promote). Break work into small per-vertical commits, not one monolithic session. The
heterogeneous two-pass review **reduces** the chance a defect slips through, it does not remove the human gate:
both passes are still LLMs and can share a blind spot — for high-blast verticals (auth, payments, schema, data-
ownership) treat the agreed verdict as a *recommendation to a human reviewer*, not a green light to ship.
