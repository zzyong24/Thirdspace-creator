#!/usr/bin/env bash
# Headless autonomous loop. Drives one ISOLATED `claude -p` session per task until the queue is empty,
# a task fails to advance, or caps are hit. Run inside a sandbox/container; each iteration is a fresh process
# (isolated context); durable state = git + progress.json.
#
#   bash orchestrator/process/harness/run.sh
# Env: HARNESS_MAX_ITERS (default 60) · HARNESS_MAX_TURNS (default 50) · HARNESS_ONLY_STEP (e.g. "repo" to
#      only auto-run repo tasks and stop at the first data-source/flow/e2e — recommended for the first sweep).
set -uo pipefail
cd "$(dirname "$0")/../../.."   # repo root
H=orchestrator/process/harness
SETTINGS="$H/settings.autonomous.json"
LOG="$H/run.log"
MAX_ITERS="${HARNESS_MAX_ITERS:-60}"
MAX_TURNS="${HARNESS_MAX_TURNS:-50}"
ONLY="${HARNESS_ONLY_STEP:-}"
say(){ echo "$(date '+%H:%M:%S') $*" | tee -a "$LOG"; }

say "▶ harness run start (max_iters=$MAX_ITERS only_step='${ONLY:-any}')"
bash "$H/init.sh" 2>&1 | tee -a "$LOG" || { say "✗ init failed — HALT"; exit 1; }

i=0
while :; do
  i=$((i+1)); [ "$i" -gt "$MAX_ITERS" ] && { say "■ reached max_iters $MAX_ITERS"; break; }
  next=$(node orchestrator/process/progress.mjs next)
  echo "$next" | grep -q '^NEXT' || { say "✓ no ready tasks — DONE"; break; }
  task=$(echo "$next" | sed -n 's/^NEXT: //p' | awk '{print $1}')
  step="${task##*:}"
  if [ -n "$ONLY" ] && [ "$step" != "$ONLY" ]; then say "■ next task $task is '$step', not '$ONLY' — STOP for human/evaluator"; break; fi

  say "── iter $i: $task ──"
  claude -p "$(cat "$H/coding-agent.md")" \
    --settings "$SETTINGS" --permission-mode acceptEdits --max-turns "$MAX_TURNS" 2>&1 | tee -a "$LOG"

  bash "$H/verify-task.sh" "$task" >>"$LOG" 2>&1 || { say "✗ verify failed for $task — HALT for review"; break; }
  node orchestrator/process/progress.mjs generate >>"$LOG" 2>&1

  again=$(node orchestrator/process/progress.mjs next | sed -n 's/^NEXT: //p' | awk '{print $1}')
  [ "$again" = "$task" ] && { say "✗ $task did not advance (agent didn't mark done?) — HALT for review"; break; }
  say "✓ iter $i committed; queue: $(node orchestrator/process/progress.mjs status | head -1)"
done
say "▶ harness run end — $(node orchestrator/process/progress.mjs status | head -1)"
