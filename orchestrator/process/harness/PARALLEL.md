# Running multiple agents without conflicts (and how they chain)

Generic methodology — adapt every concrete path/command to YOUR project's structure and stack.

## Principle: parallelize ACROSS independent units, serialize WITHIN a unit

> Lane planning (HOW to compute the partition — write_set derivation from boundaries.config/codegraph,
> connected-components grouping, shared-task hoisting to wave-0, merge order): see
> `rules/parallel-collab-rules.md` §0. This file covers the runtime mechanics of executing a planned wave.
Partition work into units (modules/features) whose files are disjoint. Different units run in parallel; steps
within a unit that share files or have dependencies run serially. `progress.mjs batch N` returns N ready tasks
from distinct units = a conflict-free parallel set.

## Identify the shared files (the real conflict surface)
Most projects have a few aggregator/barrel/registry files touched by every unit (a composite/root wiring file,
an RPC dispatch/router, a package index, a DI registry). Find yours; do NOT let parallel agents edit them.
Either (preferred) codegen them from per-unit files, or serialize their edits into one integration task per wave.

## Isolation: one worktree per agent
Each parallel agent works in its own git worktree on a short-lived branch (zero live contention; conflicts only
at merge): `git worktree add .auto/wt-<unit> -b auto/<unit>-<step> <work-branch>`.

## Chaining: lead + barrier + serial merge
```
batch N → claim each (lease, no double-pick) → fan out one worktree-isolated agent per task (PARALLEL)
→ BARRIER → merge each branch one-at-a-time (serial) → reconcile && verify → generate → repeat
```
Lease prevents double-pick; barrier+serial-merge chains the parallel work (orchestrator-worker; the Agent SDK
Workflow tool can drive it). Re-derive the queue between waves; a crashed agent loses its lease and the task reappears.

## Rules of thumb
Parallel across units; serial within a unit and for shared barrels. One worktree per live agent. Always claim
before working, release on failure, generate after each merge. Keep tasks small.
