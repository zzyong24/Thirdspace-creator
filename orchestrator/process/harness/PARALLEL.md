# Running multiple Claudes without conflicts (and how they chain)

Two problems when you fan out N Claude sessions: (1) two agents editing the **same file** → merge hell;
(2) work that **can't be chained/coordinated** → double-done tasks, lost progress. This is how the harness
solves both.

## Principle: parallelize ACROSS verticals, serialize WITHIN a vertical

This repo is already partitioned by vertical — each vertical owns disjoint files:
`backend/src/schema/<v>.ts`, `backend/src/repositories/<v>-*`, `frontend/src/server/modules/<v>/*`
(`PERSISTED_OPS` is declared **per module**, not in one shared list). So **different verticals don't touch
the same files** and are safe to run in parallel. Tasks *within* a vertical (`backend→frontend→e2e`) DO
overlap and have dependencies, so they run **serially**.

`progress.mjs batch N` returns N ready tasks from **distinct verticals** = a conflict-free parallel set.

## The only shared files (do NOT let parallel agents edit these)

Six aggregator/barrel files are touched by every vertical → the real conflict surface:

```
frontend/src/server/persistence-client.ts     (composite transport)
frontend/src/app/api/v1/dispatch/route.ts      (RPC dispatch)
contract/src/endpoints.ts , contract/src/index.ts
backend/src/db.ts , backend/src/index.ts
```

Two ways to keep them conflict-free (pick one, document it):
- **Preferred — codegen them.** A `build-registries.mjs` scans `modules/*`, `repositories/*`, `resources/*`
  and regenerates these barrels deterministically. Agents NEVER hand-edit them; the lead regenerates once
  per merge wave. No conflict possible. (Not built yet — see backlog below.)
- **Or serialize them.** Parallel agents leave barrel wiring to a single follow-up "integration" task the
  lead runs alone after merging the wave.

## Isolation: one git worktree per agent

Each parallel coding agent runs in its OWN worktree on a short-lived branch, so there is zero live-file
contention; conflicts (if any) surface only at merge, handled one at a time:

```bash
git worktree add .auto/wt-<vertical> -b auto/<vertical>-<step> feat/service-contract
# run the coding agent with cwd=.auto/wt-<vertical>, it commits on its branch
```

## Chaining / coordination: lead orchestrator + barrier + serial merge

The queue (`progress.json`, committed) + git is the coordination substrate. A lead loop:

```
1. node progress.mjs batch 4            # 4 file-disjoint ready tasks
2. for each task: progress.mjs claim <task> --agent <id>   # lease → no double-pick
3. fan out: one worktree-isolated `claude -p` per task (fresh context each)   # PARALLEL
4. BARRIER: wait for all                 # collect results
5. merge each branch into feat/service-contract ONE AT A TIME                 # serial, conflicts handled
6. node reconcile.mjs && (cd frontend && pnpm verify)                         # gate the wave
7. node progress.mjs generate            # re-derive queue from merged reality (clears done leases)
8. repeat                                # next wave
```

- **Lease (`claim`)** prevents two agents grabbing the same task; `batch` only ever offers one task per
  vertical, so a batch is conflict-free by construction.
- **Barrier + serial merge** is what "chains" the parallel work: independent in parallel, integration
  serialized. (This is the orchestrator-worker pattern; the Agent SDK `Workflow` tool can drive it.)
- **Re-derive between waves**: `generate` reads the merged tree, so the next wave's `next`/`batch` reflect
  reality — a crashed agent just loses its lease (release it) and the task reappears.

## Rules of thumb

- Parallel = across verticals; serial = within a vertical, and for all 6 barrel files.
- Never let two live sessions share a working tree. One worktree per agent.
- Always `claim` before working; `release` on failure; `generate` after each merge.
- Keep tasks small (one `<vertical>:<step>` per session) so a merge is a small, reviewable diff.

## Backlog (to make parallel fully hands-off)

- `build-registries.mjs` to codegen the 6 barrels (removes the last manual merge point).
- Optional `progress.mjs batch --worktrees` to also create the worktrees.
- Lease TTL / stale-lease reclaim for crashed agents.
