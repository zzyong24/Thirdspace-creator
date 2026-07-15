#!/usr/bin/env bash
# Scoped verification for one task — the two SWE-bench-style invariants:
#   P2P (Pass-to-Pass / no regression): the FULL existing suite still passes. The configured verify
#     command below IS the P2P gate — never narrow it to dodge a regression.
#   F2P (Fail-to-Pass / new behavior): the task's NEW test must have gone red→green. F2P is the
#     coding-agent's responsibility (TDD: write the failing test first, commit the red→green
#     evidence). The evaluator cross-checks it; a suite that excludes the failing case is laundering.
#
# COMMANDS ARE CONFIG-DRIVEN (fail-closed). This script hardcodes NO project stack; each step's shell
# command comes from `orchestrator/process/modules.config.json`. A step with no configured command is an
# ERROR (exit 1) — we never guess a default, because a guessed-green gate is a fail-open gate. Schema:
#
#   top level        "verify_commands": { "<step>": "<shell command>" }     — global per-step commands
#   per module       "modules": { "<id>": { "verify_commands": { "<step>": "<shell command>" } } }
#                    (per-module entry overrides the global one for that step)
#
# Example (JS/TS reference stack):
#   "verify_commands": {
#     "repo":        "cd backend && pnpm typecheck && pnpm test",
#     "data-source": "cd backend && pnpm typecheck && pnpm test",
#     "flow":        "cd backend && pnpm typecheck && pnpm test && cd ../frontend && pnpm verify",
#     "frontend":    "cd backend && pnpm typecheck && pnpm test && cd ../frontend && pnpm verify",
#     "e2e":         "cd frontend && pnpm verify && pnpm test:visual"
#   }
#
# Usage: verify-task.sh <vertical:step>
set -uo pipefail
cd "$(dirname "$0")/../../.."   # repo root
task="${1:-}"
vid="${task%%:*}"
step="${task##*:}"
[ -n "$task" ] && [ "$task" != "$step" ] || { echo "usage: verify-task.sh <vertical:step>"; exit 2; }

CFG="orchestrator/process/modules.config.json"
[ -f "$CFG" ] || { echo "✗ missing $CFG — verify commands are config-driven, cannot verify (fail-closed)"; exit 1; }

# Resolve the step's command FIRST (fail fast on misconfig, before any gate runs).
vcmd=$(node -e '
  const fs=require("fs");
  let cfg; try{ cfg=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); }catch{ process.exit(3); }
  const [vid,step]=[process.argv[2],process.argv[3]];
  const perMod=(((cfg.modules||{})[vid]||{}).verify_commands||{})[step];
  const global=(cfg.verify_commands||{})[step];
  const c=perMod ?? global;
  if(typeof c!=="string"||!c.trim())process.exit(3);
  process.stdout.write(c);
' "$CFG" "$vid" "$step") || {
  echo "✗ no verify command for step '$step' (module '$vid') in $CFG — add verify_commands.$step (global or per-module; see the schema in this script's header). Fail-closed: no default is guessed."
  exit 1
}

echo "▶ reconcile (drift gate)"
node orchestrator/process/reconcile.mjs >/dev/null || { echo "✗ drift"; exit 1; }
echo "▶ test-integrity (anti-tamper gate — runs BEFORE the suite so a weakened test can't go green)"
node orchestrator/process/test-integrity.mjs || { echo "✗ test-integrity: judging criteria weakened"; exit 1; }
echo "▶ verify [$step]: $vcmd"
bash -c "$vcmd" || exit 1
echo "✓ verify-task green: $task"
