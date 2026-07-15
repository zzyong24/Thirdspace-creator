#!/usr/bin/env bash
# semantics-test.sh — executable semantics for the harness's FAIL-CLOSED review gate.
# Self-contained: builds throwaway fixtures under mktemp and never touches real repo/skill state.
#
# Proves (by sourcing run.sh function-level — its source guard stops the loop — plus progress.mjs
# and verify-task.sh run inside the fixtures):
#   ① silent reviewers (fully-built vertical, ZERO EVAL_VERDICT lines) → HOLD, rc=1
#      (the old gate treated this as "no verticals to judge" and waved it through — fail-open)
#   ② progress.json missing → HOLD, rc=1 (was: silently "nothing to judge" → pass)
#   ③ PASS+PASS → the HARNESS records e2e_verified=true via `progress.mjs verify` (sole writer), rc=0
#   ④ `progress.mjs generate` preserves e2e_verified across regenerations
#   ⑤ verify-task.sh with NO configured command for the step → explicit error, exit 1 (no guessed default)
set -uo pipefail
HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROC_DIR="$(dirname "$HARNESS_DIR")"
PASS=0; FAIL=0; FIXTURES=()
ok(){ PASS=$((PASS+1)); echo "  ✓ $*"; }
ko(){ FAIL=$((FAIL+1)); echo "  ✗ $*"; }
cleanup(){ for f in "${FIXTURES[@]:-}"; do [ -n "$f" ] && rm -rf "$f"; done; }
trap cleanup EXIT

new_fixture(){ # builds an orchestrator-shaped throwaway repo root; echoes its path
  local fix; fix=$(mktemp -d "${TMPDIR:-/tmp}/harness-semantics.XXXXXX")
  mkdir -p "$fix/orchestrator/process/harness"
  cp "$PROC_DIR/progress.mjs" "$fix/orchestrator/process/"
  cp "$HARNESS_DIR/run.sh" "$HARNESS_DIR/verify-task.sh" "$fix/orchestrator/process/harness/"
  cat >"$fix/orchestrator/process/modules.config.json" <<'JSON'
{ "modules": { "alpha": { "tasks": ["repo", "frontend"] } } }
JSON
  echo "$fix"
}

write_progress(){ # $1=fixture root — one fully-built, NOT-yet-verified vertical (judge set is non-empty)
  cat >"$1/orchestrator/progress.json" <<'JSON'
{
  "meta": { "purpose": "fixture", "work_branch": "HEAD" },
  "summary": { "verticals": 1, "tasks_done": 2, "tasks_total": 2, "tasks_pending": 0, "verticals_complete": 1 },
  "verticals": [
    { "id": "alpha",
      "tasks": [ { "step": "repo", "status": "done" }, { "step": "frontend", "status": "done" } ],
      "blocked_reason": null, "commits": {} }
  ],
  "leases": {}
}
JSON
}

# Run run_review inside a throwaway subshell: source the fixture's run.sh (its guard returns before the
# loop), replace claude_role with the given stub body (the "reviewer"), run the review, echo its rc.
# The review's own output lands in <fixture>/review.out for message assertions.
review_rc(){ # $1=fixture root  $2=claude_role stub body
  ( cd "$1" &&
    source orchestrator/process/harness/run.sh &&
    eval "claude_role(){ $2; }" &&
    run_review semantics-test >review.out 2>&1
    echo $? )
}

flag_is_true(){ # $1=fixture root — e2e_verified===true for alpha?
  node -e 'const d=require(process.argv[1]);process.exit(d.verticals[0].e2e_verified===true?0:1)' \
    "$1/orchestrator/progress.json"
}

echo "▶ ① silent reviewers on a fully-built vertical → FAIL-CLOSED HOLD (old behavior: pass)"
F1=$(new_fixture); FIXTURES+=("$F1"); write_progress "$F1"
rc=$(review_rc "$F1" ":")
if [ "$rc" = "1" ] && grep -q "silent reviewers" "$F1/review.out"; then
  ok "rc=1 and the HOLD names the silent reviewers"
else
  ko "expected rc=1 + 'silent reviewers' (got rc=$rc)"; sed 's/^/    | /' "$F1/review.out" 2>/dev/null
fi

echo "▶ ② progress.json missing → FAIL-CLOSED HOLD"
F2=$(new_fixture); FIXTURES+=("$F2")   # no write_progress: the file does not exist
rc=$(review_rc "$F2" ":")
if [ "$rc" = "1" ] && grep -q "missing or unparseable" "$F2/review.out"; then
  ok "rc=1 and the HOLD names the missing progress.json"
else
  ko "expected rc=1 + 'missing or unparseable' (got rc=$rc)"; sed 's/^/    | /' "$F2/review.out" 2>/dev/null
fi

echo "▶ ③ PASS+PASS → harness (sole writer) records e2e_verified=true via progress.mjs verify"
F3=$(new_fixture); FIXTURES+=("$F3"); write_progress "$F3"
rc=$(review_rc "$F3" 'echo "EVAL_VERDICT: PASS alpha :: fixture round-trip evidence"')
if [ "$rc" = "0" ] && flag_is_true "$F3"; then
  ok "rc=0 and progress.json now carries e2e_verified=true for alpha"
else
  ko "expected rc=0 + e2e_verified=true (got rc=$rc)"; sed 's/^/    | /' "$F3/review.out" 2>/dev/null
fi

echo "▶ ④ progress.mjs generate preserves e2e_verified across regenerations"
if ( cd "$F3" && node orchestrator/process/progress.mjs generate >/dev/null 2>&1 ) && flag_is_true "$F3"; then
  ok "e2e_verified=true survived a regenerate"
else
  ko "e2e_verified was lost (or generate failed) after regenerate"
fi

echo "▶ ⑤ verify-task.sh with no configured command for the step → explicit error, exit 1"
F5=$(new_fixture); FIXTURES+=("$F5")   # modules.config.json has NO verify_commands
out=$(bash "$F5/orchestrator/process/harness/verify-task.sh" alpha:repo 2>&1); rc=$?
if [ "$rc" = "1" ] && echo "$out" | grep -q "no verify command"; then
  ok "rc=1 and the error names the missing verify_commands.repo"
else
  ko "expected rc=1 + 'no verify command' (got rc=$rc)"; echo "$out" | sed 's/^/    | /'
fi

echo
echo "semantics-test: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
