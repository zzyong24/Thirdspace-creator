#!/usr/bin/env bash
# Headless autonomous loop. Drives one ISOLATED `claude -p` session per task until the queue is empty,
# a task fails to advance, or caps are hit. Run inside a sandbox/container; each iteration is a fresh process
# (isolated context); durable state = git + progress.json.
#
#   bash orchestrator/process/harness/run.sh   ;   echo "exit=$?"   # 0 = clean DONE, 1 = a gate HALTED it
#
# HETEROGENEOUS + REBUTTAL VERIFICATION (anti "Lonely Verifier"):
#   The coding agent and the verifiers run on DIFFERENT models — same-family reviewers are "two optimists
#   nodding," and most defects are caught by exactly one heterogeneous checker. Two independent read-only
#   passes review the work: a primary evaluator (confirm-with-evidence) and a rebuttal reviewer (assume-broken,
#   default REJECT). A vertical only advances on AGREEMENT (both PASS). Verticals flagged high blast-radius are
#   NEVER auto-completed: they additionally escalate to a human to own the merge (a genuine 3rd independent
#   reviewer is planned; until it exists, "high-blast" = standard agreement + mandatory human merge ownership,
#   not a stronger automated gate — we do not overclaim a reviewer that isn't there).
#
# EXIT CODE: 0 only on a CLEAN DONE (queue empty AND the final heterogeneous review passed). Any HALT — a
#   failed verify, a task that didn't advance, or a review that HELD/REJECTED a vertical — exits 1, so a
#   CI/cron/Action caller can tell "shipped clean" from "the adversarial gate stopped it". An intentional
#   HARNESS_ONLY_STEP checkpoint or the HARNESS_MAX_ITERS cap exits 2 (stopped, not failed, not done).
#
# Env (loop):       HARNESS_MAX_ITERS (default 60) · HARNESS_MAX_TURNS (default 50) · HARNESS_ONLY_STEP
#                    · HARNESS_MAX_REPAIR (default 2, G2 critic self-repair rounds) · HARNESS_RUN_ID (RUN_EVENT tag)
# Env (review):     EVALUATOR_EVERY_N (default 4) — run the verifiers every N committed iters + before DONE
# Env (models):     CODER_MODEL · EVALUATOR_MODEL · REBUTTAL_MODEL — MUST differ for heterogeneity.
#                   Unset → `claude` default for that role (a WARNING is logged: homogeneous = weak gate).
# Env (blast):      HARNESS_HIGH_BLAST="vid1,vid2" — run-level high-blast list (in addition to per-vertical
#                   `blast_radius:"high"` in modules.config.json).
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../.."   # repo root (BASH_SOURCE so a sourcing test lands here too)
H=orchestrator/process/harness
SETTINGS="$H/settings.autonomous.json"
LOG="$H/run.log"
MAX_ITERS="${HARNESS_MAX_ITERS:-60}"
MAX_TURNS="${HARNESS_MAX_TURNS:-50}"
ONLY="${HARNESS_ONLY_STEP:-}"
EVERY_N="${EVALUATOR_EVERY_N:-4}"
CODER_MODEL="${CODER_MODEL:-}"
EVALUATOR_MODEL="${EVALUATOR_MODEL:-}"
REBUTTAL_MODEL="${REBUTTAL_MODEL:-}"
HIGH_BLAST="${HARNESS_HIGH_BLAST:-}"
say(){ echo "$(date '+%H:%M:%S') $*" | tee -a "$LOG"; }

# capture (evolution ④): observation-level RUN_EVENT on real failure. control_root resolved to an
# ABSOLUTE path (same base as reconcile's CONTROL_ROOT) so capture-write == consume-read dir.
# Best-effort (|| true): observability must never break the harness loop.
CTRL=$(node -e "const path=require('path');let cr='orchestrator';try{cr=require('./orchestrator/process/reconcile.config.json').control_root||'orchestrator'}catch(e){};process.stdout.write(path.resolve(process.cwd(),cr))")
capture(){ node -e "import('./orchestrator/process/run-events.mjs').then(m=>m.appendRunEvent('$CTRL',{kind:'$1',runId:process.env.HARNESS_RUN_ID||'wf_local',stage:'$2',detail:'$3'}))" 2>/dev/null || true; }

# `claude -p` with an optional `--model` (passed only when the role's model env is set).
claude_role(){ # $1=model (may be empty) $2=prompt-file ; extra args after
  local model="$1" prompt="$2"; shift 2
  local margs=(); [ -n "$model" ] && margs=(--model "$model")
  claude -p "$(cat "$H/$prompt")" "${margs[@]}" "$@"
}

# Verticals the review MUST rule on: every vertical whose tasks are ALL done but which is not yet
# e2e_verified. Reading this from progress.json (not just "whatever ids the reviewer happened to mention")
# is what makes the gate FAIL-CLOSED: a fully-built vertical that NEITHER pass names is a missing verdict
# = a HOLD, never a silent pass. Canonical path = orchestrator/progress.json (what progress.mjs writes) —
# a missing/unparseable file is NOT "nothing to judge", it is exit 3 so run_review can HOLD on it.
PROGRESS="orchestrator/progress.json"
expected_verticals(){
  node -e '
    const fs=require("fs");const p=process.argv[1];
    if(!fs.existsSync(p))process.exit(3);
    let d; try{ d=JSON.parse(fs.readFileSync(p,"utf8")); }catch{ process.exit(3); }
    for(const v of (d.verticals||[])){
      const tasks=v.tasks||[];
      const allDone=tasks.length>0 && tasks.every(t=>t.status==="done");
      if(allDone && v.e2e_verified!==true) console.log(v.id);
    }
  ' "$PROGRESS" 2>/dev/null
}

# Is a vertical high-blast? run-level HARNESS_HIGH_BLAST OR per-vertical blast_radius:"high" in the config.
is_high_blast(){ # $1=vertical-id  -> exit 0 if high-blast
  local v="$1"
  case ",$HIGH_BLAST," in *",$v,"*) return 0;; esac
  node -e '
    const fs=require("fs");const p="orchestrator/process/modules.config.json";
    if(!fs.existsSync(p))process.exit(1);
    const m=(JSON.parse(fs.readFileSync(p,"utf8")).modules)||{};
    const c=m[process.argv[1]]||{};
    process.exit(String(c.blast_radius||"").toLowerCase()==="high"?0:1);
  ' "$v" 2>/dev/null
}

# Echo the verdict (PASS|REJECT|BLOCKED|ESCALATE) a pass-log gives for a vertical, or nothing. Uses awk
# FIXED-FIELD equality on the id — NOT a regex — so an id containing '.', '..', or other metachars cannot
# false-match another line (the previous grep-ERE interpolated the raw id and mis-matched). Verdict token is
# upper-cased so a stray "Pass" still counts. ESCALATE = reviewer says "a human must own this merge".
verdict_for(){ # $1=logfile $2=vid
  awk -v v="$2" '
    {
      for(i=1;i<NF;i++){
        if($i=="EVAL_VERDICT:"||$i=="EVAL_VERDICT"){
          verd=toupper($(i+1)); id=$(i+2); sub(/:+$/,"",id);
          if(id==v && (verd=="PASS"||verd=="REJECT"||verd=="BLOCKED"||verd=="ESCALATE")) last=verd;
        }
      }
    }
    END{ if(last!="") print last }' "$1" 2>/dev/null
}

# All vertical ids that EITHER pass emitted a verdict line for (fixed-field parse).
appearing_verticals(){ # $1 $2 = logfiles
  awk '{
    for(i=1;i<NF;i++){
      if($i=="EVAL_VERDICT:"||$i=="EVAL_VERDICT"){
        verd=toupper($(i+1)); id=$(i+2); sub(/:+$/,"",id);
        if(verd=="PASS"||verd=="REJECT"||verd=="BLOCKED"||verd=="ESCALATE") print id;
      }
    }
  }' "$1" "$2" 2>/dev/null | sort -u
}

# Run the heterogeneous review: primary evaluator + rebuttal reviewer, each fresh & read-only on its own
# model. Judges the UNION of (expected verticals from progress.json) and (verticals either pass named), so a
# built-but-unmentioned vertical cannot slip through. Returns 0 only if every judged vertical cleared.
run_review(){ # $1=reason ("cadence" | "final")
  local why="$1"
  local tmp; tmp=$(mktemp -d "${TMPDIR:-/tmp}/harness-review.XXXXXX")
  local evlog="$tmp/primary.log" relog="$tmp/rebuttal.log"
  say "── review ($why): heterogeneous + rebuttal ──"
  [ -z "$EVALUATOR_MODEL$REBUTTAL_MODEL$CODER_MODEL" ] && say "! no role models set — verifiers may share the coder's model (homogeneous gate; set CODER_MODEL/EVALUATOR_MODEL/REBUTTAL_MODEL)."
  [ -n "$EVALUATOR_MODEL" ] && [ "$EVALUATOR_MODEL" = "$CODER_MODEL" ] && say "! EVALUATOR_MODEL == CODER_MODEL — same family = two optimists nodding."

  # NB portability: BSD/macOS `tee` does not honor `-a` after file operands, so we capture each pass to its
  # own tmp log via `tee <file>`, then append that file to the run log.
  say "   pass 1/2: primary evaluator (model='${EVALUATOR_MODEL:-default}')"
  claude_role "$EVALUATOR_MODEL" evaluator.md --permission-mode plan 2>&1 | tee "$evlog"; cat "$evlog" >>"$LOG"
  say "   pass 2/2: rebuttal reviewer (model='${REBUTTAL_MODEL:-default}', stance=assume-broken)"
  claude_role "$REBUTTAL_MODEL" evaluator-rebuttal.md --permission-mode plan 2>&1 | tee "$relog"; cat "$relog" >>"$LOG"

  # Judge set = expected (fail-closed) ∪ appearing (so a REJECT on a not-yet-all-done vertical still counts).
  # FAIL-CLOSED, three-way: an empty judge set is only a pass when we can PROVE there is nothing to judge.
  #   ① progress.json missing/unparseable → we cannot know what to judge → HOLD (return 1).
  #   ② expected verticals exist but NEITHER pass emitted any verdict (silent reviewers) → HOLD (return 1).
  #   ③ progress readable, expected empty AND appearing empty → clear, but PRINT the per-vertical states as
  #     the evidence for waving it through (never a bare "nothing to clear").
  local expected exp_rc appearing judged held=0
  expected=$(expected_verticals); exp_rc=$?
  if [ "$exp_rc" -ne 0 ]; then
    say "   ✗ $PROGRESS missing or unparseable — cannot derive the expected judge set — FAIL-CLOSED HOLD."
    rm -rf "$tmp"; return 1
  fi
  appearing=$(appearing_verticals "$evlog" "$relog")
  if [ -n "$expected" ] && [ -z "$appearing" ]; then
    say "   ✗ silent reviewers: fully-built vertical(s) [$(echo $expected | tr '\n' ' ')] await a verdict but NEITHER pass emitted an EVAL_VERDICT line — FAIL-CLOSED HOLD."
    rm -rf "$tmp"; return 1
  fi
  judged=$(printf '%s\n%s\n' "$expected" "$appearing" | sed '/^$/d' | sort -u)
  if [ -z "$judged" ]; then
    say "   ✓ nothing to judge: $PROGRESS readable, no fully-built unverified vertical, no verdicts named. Evidence (per-vertical state):"
    node orchestrator/process/progress.mjs status 2>&1 | tee -a "$LOG" | sed 's/^/     /'
    rm -rf "$tmp"; return 0
  fi
  # iterate via read (not unquoted word-splitting) so it is correct under any shell / IFS.
  while IFS= read -r v; do
    [ -z "$v" ] && continue
    local pe pr; pe=$(verdict_for "$evlog" "$v"); pr=$(verdict_for "$relog" "$v")
    pe="${pe:-NONE}"; pr="${pr:-NONE}"
    if [ "$pe" = "ESCALATE" ] || [ "$pr" = "ESCALATE" ]; then
      say "   ⚑ [$v] a reviewer marked ESCALATE (primary=$pe rebuttal=$pr) — e2e_verified NOT written; a human must own this merge."; held=$((held+1))
    elif [ "$pe" = "PASS" ] && [ "$pr" = "PASS" ]; then
      if is_high_blast "$v"; then
        say "   ⚑ [$v] both passes PASS, but HIGH-BLAST — e2e_verified NOT written; escalate: a human must own this merge."; held=$((held+1))
      # SOLE WRITER: the reviewers run read-only (--permission-mode plan) and only emit verdicts; the harness
      # is the one place e2e_verified gets written, and only on PASS+PASS for a non-high-blast vertical.
      elif node orchestrator/process/progress.mjs verify "$v" >>"$LOG" 2>&1; then
        say "   ✓ [$v] verifiers AGREE PASS — harness recorded e2e_verified=true (progress.mjs verify)."
      else
        say "   ✗ [$v] PASS+PASS but 'progress.mjs verify $v' failed — flag NOT recorded, HOLD."; held=$((held+1))
      fi
    else
      say "   ✗ [$v] not cleared (primary=$pe rebuttal=$pr) — a missing/REJECT/BLOCKED verdict is a HOLD."; held=$((held+1))
    fi
  done <<< "$judged"
  rm -rf "$tmp"
  [ "$held" -gt 0 ] && { say "   review HELD $held vertical(s) — HALT for human review / queue routing."; return 1; }
  say "   ✓ review clean — all judged verticals cleared."
  return 0
}

# Preflight (conductor-style validate): fail at second 0, not at iter 30.
preflight(){
  local bad=0
  for f in coding-agent.md evaluator.md evaluator-rebuttal.md verify-task.sh init.sh; do
    [ -f "$H/$f" ] || { say "✗ preflight: missing $H/$f"; bad=1; }
  done
  node orchestrator/process/autonomy-guard.mjs audit --root "$PWD" >>"$LOG" 2>&1 \
    || { say "✗ preflight: autonomous state/watchdog invalid (see $LOG)"; bad=1; }
  if [ -n "$EVALUATOR_MODEL" ] && [ "$EVALUATOR_MODEL" = "$CODER_MODEL" ]; then
    say "! preflight: EVALUATOR_MODEL == CODER_MODEL (homogeneous review = weak gate)"
  fi
  [ "$bad" -eq 0 ] || { say "✗ preflight failed — fix before looping"; return 1; }
  say "✓ preflight clean"
}

# ── source guard: semantics-test.sh sources this file to exercise the functions above; the executable
#    loop below only runs when the script is invoked directly. ──
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return 0; fi

FAILED=0   # set to 1 on any HALT so the script exits nonzero (CI can tell a clean DONE from a stopped gate)
STOPPED=0  # set to 1 on an intentional, non-failure stop (only-step checkpoint / max-iters cap) → exit 2
preflight || exit 1

say "▶ harness run start (max_iters=$MAX_ITERS only_step='${ONLY:-any}' every_n=$EVERY_N coder='${CODER_MODEL:-default}' eval='${EVALUATOR_MODEL:-default}' rebuttal='${REBUTTAL_MODEL:-default}')"
bash "$H/init.sh" 2>&1 | tee -a "$LOG" || { say "✗ init failed — HALT"; exit 1; }

i=0; since_review=0
while :; do
  i=$((i+1)); [ "$i" -gt "$MAX_ITERS" ] && { say "■ reached max_iters $MAX_ITERS — STOP (not done)"; STOPPED=1; break; }
  schedule=$(node orchestrator/process/progress.mjs schedule)
  schedule_status=$(printf '%s' "$schedule" | node -e 'let x="";process.stdin.on("data",d=>x+=d).on("end",()=>console.log(JSON.parse(x).status))')
  if [ "$schedule_status" = "done" ]; then say "✓ queue complete — running FINAL review before DONE"; run_review final || { say "✗ final review HELD work — NOT a clean DONE"; FAILED=1; }; break; fi
  if [ "$schedule_status" = "hold" ]; then say "✗ all remaining tasks depend on blockers — HOLD"; FAILED=1; break; fi
  task=$(printf '%s' "$schedule" | node -e 'let x="";process.stdin.on("data",d=>x+=d).on("end",()=>console.log(JSON.parse(x).task))')
  step="${task##*:}"
  if [ -n "$ONLY" ] && [ "$step" != "$ONLY" ]; then say "■ next task $task is '$step', not '$ONLY' — STOP for human/evaluator"; STOPPED=1; break; fi

  say "── iter $i: $task (coder model='${CODER_MODEL:-default}') ──"
  node orchestrator/process/autonomy-guard.mjs begin --root "$PWD" --task "$task" >>"$LOG" 2>&1 \
    || { say "✗ could not record iteration baseline"; FAILED=1; break; }
  claude_role "$CODER_MODEL" coding-agent.md \
    --settings "$SETTINGS" --permission-mode acceptEdits --max-turns "$MAX_TURNS" 2>&1 | tee -a "$LOG"

  # G2 critic self-repair (Reflexion/Self-Refine, bounded): on verify failure, re-spawn the
  # coding agent up to MAX_REPAIR rounds with the failure output, converging on the REAL test
  # signal. HALT only after the repair budget is spent.
  repair=0; MAX_REPAIR="${HARNESS_MAX_REPAIR:-2}"; verified=0
  while :; do
    if bash "$H/verify-task.sh" "$task" >>"$LOG" 2>&1; then verified=1; break; fi
    repair=$((repair+1))
    [ "$repair" -gt "$MAX_REPAIR" ] && { say "✗ verify failed for $task after $MAX_REPAIR repair round(s) — HALT for review"; capture halt "$task" "repair budget spent"; break; }
    say "  ↻ verify red — critic self-repair round $repair/$MAX_REPAIR"
    claude -p "$(cat "$H/coding-agent.md")

[SELF-REPAIR round $repair] The previous attempt failed verify-task.sh. Read the failure output at the tail of $LOG, fix the ROOT cause, and make verify pass by converging on the real test/tsc signal — do NOT weaken or delete assertions." \
      $( [ -n "$CODER_MODEL" ] && printf -- '--model %s' "$CODER_MODEL" ) \
      --settings "$SETTINGS" --permission-mode acceptEdits --max-turns "$MAX_TURNS" 2>&1 | tee -a "$LOG"
  done
  if [ "$verified" != 1 ]; then
    node orchestrator/process/autonomy-guard.mjs finish --root "$PWD" --task "$task" >>"$LOG" 2>&1 || true
    node orchestrator/process/progress.mjs block "$task" --reason "verify/repair budget exhausted" >>"$LOG" 2>&1 || true
    reroute=$(node orchestrator/process/progress.mjs schedule)
    printf '%s' "$reroute" | grep -q '"status":"ready"' && { say "! $task blocked; routing another dependency-ready, write-set-isolated task"; continue; }
    FAILED=1; break
  fi
  node orchestrator/process/progress.mjs generate >>"$LOG" 2>&1
  if ! node orchestrator/process/autonomy-guard.mjs finish --root "$PWD" --task "$task" >>"$LOG" 2>&1; then
    say "✗ $task produced no commit + board/progress transition — HALT/REPLAN"
    node orchestrator/process/progress.mjs block "$task" --reason "no delivery transition" >>"$LOG" 2>&1 || true
    reroute=$(node orchestrator/process/progress.mjs schedule)
    printf '%s' "$reroute" | grep -q '"status":"ready"' && { say "! routing another ready isolated task"; continue; }
    FAILED=1; break
  fi
  say "✓ iter $i committed; queue: $(node orchestrator/process/progress.mjs status | head -1)"

  # Heterogeneous review every N committed iters (a held vertical halts the loop for routing).
  since_review=$((since_review+1))
  if [ "$since_review" -ge "$EVERY_N" ]; then
    since_review=0
    if ! run_review cadence; then
      node orchestrator/process/progress.mjs block "$task" --reason "cadence review held" >>"$LOG" 2>&1 || true
      reroute=$(node orchestrator/process/progress.mjs schedule)
      printf '%s' "$reroute" | grep -q '"status":"ready"' && { say "! review held $task; routing another ready isolated task"; continue; }
      say "✗ cadence review HELD and no independent ready task remains"; FAILED=1; break
    fi
  fi
done
say "▶ harness run end — $(node orchestrator/process/progress.mjs status | head -1)"
[ "$FAILED" -ne 0 ] && exit 1
[ "$STOPPED" -ne 0 ] && exit 2
exit 0
