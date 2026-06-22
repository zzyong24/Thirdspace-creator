# orchestrator/process — executable process layer

This directory turns the product-to-code-orchestrator from a **paper state machine** (statuses + prose
gates that an agent self-attests) into one with **executable, version-pinned controls**. It exists because
an audit (2026-06-22, DEC-013) found the manifest — the declared "source of truth" — had silently gone
stale: it claimed the backend was `not-started` while a full persistence slice, contract, and AI worker
were already built on the work branch.

## What's here

| File | Role | Industry analogue |
|---|---|---|
| `reconcile.mjs` | Drift detector / executable gate. Validates the manifest, checks every build-claim against git+fs reality on the work branch, enforces the blocking-consistency rule, flags staleness vs the decision log. Exits non-zero on drift. | `terraform plan` drift detection · GitOps reconcile loop · CI required-checks · policy-as-code (OPA/Conftest) |
| `manifest.schema.json` | Structural + enum contract for `ARTIFACT_MANIFEST.yaml`. | JSON Schema / CUE config validation |
| `rules/orchestrator-state-machine.md` | **Pinned in-repo copy** of the workflow's state-machine rule (was only an external skill reference → unreproducible across machines). | Vendoring / lockfile-pinned tooling |

## Run it

```bash
node orchestrator/process/reconcile.mjs
# exit 0 = manifest reconciles with reality; 1 = drift; 2 = missing required artifacts
```

Run it **before trusting the manifest**, after any stage-status change, and ideally as a required CI check
on the work branch (it's zero-dependency — plain Node ≥18).

## The problems it fixes (and the principle behind each)

1. **Gates were self-attested prose.** All 18 gate files were the same template; "pass" meant an agent wrote
   a paragraph. → *Tests/checks as gates.* `reconcile.mjs` is a real check that fails loudly. (The
   highest-value gates — cross-artifact consistency, structural validity, build-claim reality — are covered
   here; per-stage executable runners are the next increment, see below.)
2. **The manifest was hand-maintained and drifted.** → *Single source of truth must be verifiable, not
   trusted.* Reality probes compare claims to git+fs; a stale row is an ERROR, not a silent lie.
3. **The consistency gate was `fail` but non-blocking (decorative).** → *Bidirectional traceability must
   block release (DO-178C / ISO 26262 / ASPICE).* `reconcile.mjs` refuses to let any stage listed in
   `consistency_gate.blocks` be `passed` while the gate is `fail`, unless it is explicitly `accepted-risk`.
4. **Failing verdicts were "invalidated" (erased).** → *Immutable decision history (ADR).* Policy (DEC-013):
   a superseded FAIL is retained with a delta, never relabeled `invalidated`.
5. **The workflow definition lived only in an external, unpinned skill install.** → *Pin tooling with the
   code.* `rules/` is now vendored in-repo so audits are reproducible on any machine.

## Maintaining the reality probes

Probes live in `reconcile.config.json` (`work_branch` + a `probes` list mapping a stage → a path that must
exist on the work branch once the stage is past `not-started`). When you add a vertical or stage, add a probe
so its claim stays machine-checked. The check is bidirectional: *artifact exists but stage says not-started*
(understated) **and** *stage claims built but artifact missing* (overstated) both fail. `reconcile.mjs` is the
same canonical script shipped by the skill — project specifics live only in the config.

## Not yet done (tracked, honest)

- **Per-stage executable gate runners** (e.g. bind `09-frontend-implementation-gate` to `pnpm verify`, the
  visual gate to `pnpm test:visual`, the tdd-gate to a "red-before-green" check). `reconcile.mjs` is the
  consistency/drift/structural backbone; the per-gate command bindings are the next layer.
- **Backport to the shared skill** (`~/.skills-manager/skills/product-to-code-orchestrator/`): make the gate
  template require a `verify:` command + retained-history, and ship a `reconcile` with the skill so every
  new project inherits these controls instead of re-deriving them. (Editing the global skill affects all
  projects — do it deliberately.)
- **ID governance (OPEN-004):** API-### / TEST-### IDs are still un-instantiated (accepted-risk per DEC-012);
  once back-assigned, `reconcile.mjs` can add a per-operation upstream→downstream chain check.
