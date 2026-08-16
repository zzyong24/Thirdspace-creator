#!/usr/bin/env bash
# One-command project bootstrap — turns SKILL.md "Startup 0" prose into an executable.
# Usage: init-project.sh <target-project-dir> --topology single|multi
#        [--program-id <id-for-multi>] [--triage S|M|L] [--name <project-name>]
#        init-project.sh <target-project-dir> --update [--topology single|multi] [--program-id <id>]
#
# Creates (idempotent — never overwrites an existing file, prints SKIP instead):
#   <dir>/orchestrator/{ARTIFACT_MANIFEST.yaml, ID_REGISTRY.md, DECISION_LOG.md, TRACEABILITY_MATRIX.md, SCOPE_LEDGER.md, LESSON_LEDGER.md}
#   <dir>/orchestrator/process/            (vendored deterministic checks: reconcile/orphan-scan/engines)
#   <dir>/orchestrator/process/.skill-version  (vendor stamp: skill VERSION + skill dir — drift detection)
#   <dir>/BACKLOG.md                       (task board, project root — SessionStart hook reads it)
#   <dir>/.claude/hooks/{session-start.sh, backlog-guard.sh, post-tool-observe.sh}
#   <dir>/.claude/settings.json            (hook registration; existing file → prints a manual-merge block)
#   <dir>/.github/workflows/verify.yml     (main/PR verify CI; adapt commands per PROJECT_CONTEXT)
# Then: git init if needed, DEC-000 triage record, first reconcile run (must be green).
#
# --update mode (for projects initialized with an older skill version):
#   overwrites engine files under orchestrator/process/ + all hooks;
#   PRESERVES project-owned *.config.json / *-baseline.json / control artifacts / BACKLOG / AGENTS.md;
#   re-stamps .skill-version and reruns reconcile (must stay green).
set -uo pipefail

SKILL="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"; shift || true
TRIAGE="M"; PNAME=""; UPDATE=0; TOPOLOGY=""; PROGRAM_ID=""
while [ $# -gt 0 ]; do
  case "$1" in
    --triage) TRIAGE="${2:-M}"; shift 2;;
    --name)   PNAME="${2:-}"; shift 2;;
    --topology) TOPOLOGY="${2:-}"; shift 2;;
    --program-id) PROGRAM_ID="${2:-}"; shift 2;;
    --update) UPDATE=1; shift;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done
[ -n "$TARGET" ] || { echo "usage: init-project.sh <target-project-dir> --topology single|multi [--program-id <id>] [--triage S|M|L] [--name <project>] | <target-project-dir> --update" >&2; exit 2; }
case "$TRIAGE" in S|M|L) ;; *) echo "✗ --triage must be S, M or L" >&2; exit 2;; esac
if [ -n "$TOPOLOGY" ]; then
  case "$TOPOLOGY" in
    single) PROGRAM_REQUIRED=false ;;
    multi)
      PROGRAM_REQUIRED=true
      [ -n "$PROGRAM_ID" ] || {
        echo "✗ --topology multi 必须同时提供 --program-id" >&2
        exit 2
      }
      case "$PROGRAM_ID" in
        *[!a-zA-Z0-9._-]*|"")
          echo "✗ --program-id 只接受字母、数字、dot、underscore、hyphen" >&2
          exit 2
          ;;
      esac
      ;;
    *) echo "✗ --topology 必须是 single|multi" >&2; exit 2 ;;
  esac
fi
if [ "$UPDATE" != "1" ] && [ -z "$TOPOLOGY" ]; then
  echo "✗ 新项目必须明确 --topology single|multi；不得默认跳过跨项目完成门" >&2
  exit 2
fi
mkdir -p "$TARGET"; TARGET="$(cd "$TARGET" && pwd)"
[ -n "$PNAME" ] || PNAME="$(basename "$TARGET")"
TODAY="$(date +%F)"

skill_version() {
  if [ -f "$SKILL/VERSION" ]; then
    cat "$SKILL/VERSION"
  else
    sed -n 's/^version=//p' "$SKILL/process/.skill-version" 2>/dev/null | head -1
  fi
}

# ---------- --update: refresh vendored engine, preserve project state ----------
if [ "$UPDATE" = "1" ]; then
  PROC="$TARGET/orchestrator/process"
  [ -d "$PROC" ] || { echo "✗ $PROC not found — run plain init first" >&2; exit 2; }
  SKV="$(skill_version)"
  [ -n "$SKV" ] || SKV=unknown
  OLDV="$(sed -n 's/^version=//p' "$PROC/.skill-version" 2>/dev/null | head -1)"
  echo "▶ update vendored engine → $PROC (${OLDV:-unstamped} → $SKV)"
  updated=0; kept=0
  while IFS= read -r src; do
    rel="${src#"$SKILL/process/"}"
    dest="$PROC/$rel"
    case "$rel" in
      *.config.json|*-baseline.json)   # project-owned interface/state — never import another project's values
        kept=$((kept+1)); continue ;;
    esac
    mkdir -p "$(dirname "$dest")"
    cp "$src" "$dest"; updated=$((updated+1))
  done < <(find "$SKILL/process" -type f)
  echo "✓ engine refreshed: $updated files copied, $kept project configs/baselines preserved"
  # files in the project copy that no longer exist in the skill — left as-is, but surfaced
  while IFS= read -r f; do
    rel="${f#"$PROC/"}"
    case "$rel" in .skill-version|*.config.json|*-baseline.json) continue;; esac
    [ -e "$SKILL/process/$rel" ] || echo "· stale (not in skill anymore, left as-is): orchestrator/process/$rel"
  done < <(find "$PROC" -type f)
  # hooks are engine too — refresh; a user-modified original is saved as *.pre-update
  mkdir -p "$TARGET/.claude/hooks"
  for h in session-start.sh backlog-guard.sh post-tool-observe.sh; do
    hsrc="$SKILL/templates/hooks/$h"; hdest="$TARGET/.claude/hooks/$h"
    if [ -e "$hdest" ] && ! cmp -s "$hsrc" "$hdest"; then cp "$hdest" "$hdest.pre-update"; echo "· $h differed — original saved as $h.pre-update"; fi
    cp "$hsrc" "$hdest"; chmod +x "$hdest"
  done
  echo "✓ hooks refreshed"
  # Add the observer to an existing JSON settings file without clobbering unrelated project hooks.
  # JSON5/commented settings are left untouched and receive an explicit manual-merge warning.
  SETTINGS="$TARGET/.claude/settings.json"
  if [ -e "$SETTINGS" ]; then
    if node - "$SETTINGS" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const value = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('settings 顶层必须是 object');
if (!value.hooks || typeof value.hooks !== 'object' || Array.isArray(value.hooks)) value.hooks = {};
const command = 'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/post-tool-observe.sh"';
const current = Array.isArray(value.hooks.PostToolUse) ? value.hooks.PostToolUse : [];
if (!current.some((entry) => JSON.stringify(entry).includes('post-tool-observe.sh'))) {
  current.push({ matcher: 'Edit|Write|MultiEdit', hooks: [{ type: 'command', command }] });
  value.hooks.PostToolUse = current;
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporary, file);
  console.log('✓ .claude/settings.json → PostToolUse observer');
} else {
  console.log('· .claude/settings.json already has PostToolUse observer');
}
NODE
    then :
    else
      echo "! .claude/settings.json 不是标准 JSON — 请手动合并 PostToolUse observer" >&2
    fi
  fi
  if [ ! -e "$TARGET/orchestrator/SCOPE_LEDGER.md" ]; then
    cp "$SKILL/templates/SCOPE_LEDGER_TEMPLATE.md" "$TARGET/orchestrator/SCOPE_LEDGER.md"
    echo "✓ orchestrator/SCOPE_LEDGER.md (new empty ledger; no legacy history invented)"
  fi
  if [ ! -e "$TARGET/orchestrator/LESSON_LEDGER.md" ]; then
    cp "$SKILL/templates/LESSON_LEDGER_TEMPLATE.md" "$TARGET/orchestrator/LESSON_LEDGER.md"
    echo "✓ orchestrator/LESSON_LEDGER.md (new empty ledger; no legacy history invented)"
  fi
  if [ "$TOPOLOGY" = "multi" ]; then
    bash "$SKILL/tools/init-program.sh" "$TARGET" --id "$PROGRAM_ID" --name "$PNAME" || exit $?
  elif [ "$TOPOLOGY" = "single" ]; then
    node -e '
      const fs = require("node:fs");
      const file = process.argv[1];
      const value = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!value || Array.isArray(value) || typeof value !== "object") {
        throw new Error("reconcile.config.json 顶层必须是 object");
      }
      value.program_completion_required = false;
      const temporary = `${file}.tmp-${process.pid}`;
      fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
      fs.renameSync(temporary, file);
    ' "$PROC/reconcile.config.json" || {
      echo "✗ 无法记录 single topology" >&2
      exit 2
    }
    echo "✓ existing project topology=single"
  fi
  printf 'version=%s\nskill_dir=%s\n' "$SKV" "$SKILL" > "$PROC/.skill-version"
  echo "✓ .skill-version → $SKV"
  if ! ( cd "$TARGET" && node orchestrator/process/strict-receipts-migrate.mjs check ); then
    echo "! strict receipt migration required; inspect active tasks, then run:"
    echo "  node orchestrator/process/strict-receipts-migrate.mjs apply --non-ui <explicit-non-ui-task-ids>"
  fi
  if ( cd "$TARGET" && node orchestrator/process/reconcile.mjs ); then
    echo "✓ reconcile green after update"
    UPDATE_RC=0
  else
    UPDATE_RC=$?
    echo "! reconcile non-zero after update — new guards may be surfacing REAL drift; fix forward, do NOT roll the engine back to silence it"
  fi
  exit "$UPDATE_RC"
fi

put(){ # $1=src $2=dest ; copy unless dest exists
  if [ -e "$2" ]; then echo "· SKIP (exists): ${2#"$TARGET"/}"; else cp "$1" "$2" && echo "✓ ${2#"$TARGET"/}"; fi
}

echo "▶ init-project → $TARGET (triage=$TRIAGE, name=$PNAME)"

# 1) control plane under orchestrator/
mkdir -p "$TARGET/orchestrator"
put "$SKILL/templates/ARTIFACT_MANIFEST_TEMPLATE.yaml" "$TARGET/orchestrator/ARTIFACT_MANIFEST.yaml"
put "$SKILL/templates/ID_REGISTRY_TEMPLATE.md"         "$TARGET/orchestrator/ID_REGISTRY.md"
put "$SKILL/templates/DECISION_LOG_TEMPLATE.md"        "$TARGET/orchestrator/DECISION_LOG.md"
put "$SKILL/templates/TRACEABILITY_MATRIX_TEMPLATE.md" "$TARGET/orchestrator/TRACEABILITY_MATRIX.md"
put "$SKILL/templates/SCOPE_LEDGER_TEMPLATE.md"        "$TARGET/orchestrator/SCOPE_LEDGER.md"
put "$SKILL/templates/LESSON_LEDGER_TEMPLATE.md"       "$TARGET/orchestrator/LESSON_LEDGER.md"
# stamp project name + scale class into a fresh manifest (only if we just created it)
if grep -q '<project-name>' "$TARGET/orchestrator/ARTIFACT_MANIFEST.yaml" 2>/dev/null; then
  sed -i '' -e "s/<project-name>/$PNAME/" "$TARGET/orchestrator/ARTIFACT_MANIFEST.yaml" 2>/dev/null \
    || sed -i -e "s/<project-name>/$PNAME/" "$TARGET/orchestrator/ARTIFACT_MANIFEST.yaml"
  printf '\n# Scale triage (SKILL.md 「Scale Triage」): class %s — recorded as DEC-000 in DECISION_LOG.md\nscale_class: "%s"\n' "$TRIAGE" "$TRIAGE" >> "$TARGET/orchestrator/ARTIFACT_MANIFEST.yaml"
  # stamp updated_at so the fresh init doesn't carry a placeholder-staleness WARN
  sed -i '' -e "s/updated_at: \"<date-or-run-id>\"/updated_at: \"$TODAY\"/" "$TARGET/orchestrator/ARTIFACT_MANIFEST.yaml" 2>/dev/null \
    || sed -i -e "s/updated_at: \"<date-or-run-id>\"/updated_at: \"$TODAY\"/" "$TARGET/orchestrator/ARTIFACT_MANIFEST.yaml"
fi

# 2) vendor the deterministic checks
if [ -d "$TARGET/orchestrator/process" ]; then echo "· SKIP (exists): orchestrator/process/ (refresh via --update)"; else
  mkdir -p "$TARGET/orchestrator/process"
  while IFS= read -r src; do
    rel="${src#"$SKILL/process/"}"
    case "$rel" in
      .skill-version|*.config.json|*-baseline.json) continue ;;
    esac
    dest="$TARGET/orchestrator/process/$rel"
    mkdir -p "$(dirname "$dest")"
    cp "$src" "$dest"
  done < <(find "$SKILL/process" -type f)
  SKV="$(skill_version)"
  [ -n "$SKV" ] || SKV=unknown
  printf 'version=%s\nskill_dir=%s\n' "$SKV" "$SKILL" > "$TARGET/orchestrator/process/.skill-version"
  echo "✓ orchestrator/process/ (reconcile / orphan-scan / engines vendored; project configs/baselines excluded)"
  echo "✓ orchestrator/process/.skill-version ($SKV)"
fi

# 2b) minimal live reconcile config (kills the permanent "no probes" WARN; project fills probes later)
if [ ! -e "$TARGET/orchestrator/process/reconcile.config.json" ]; then
  printf '{\n  "work_branch": "main",\n  "control_root": "orchestrator",\n  "receipt_policy": "required",\n  "program_completion_required": %s,\n  "frontend_verify_commands": {},\n  "probes": [ { "stage": "1-plan", "path": "PRODUCT_SPEC.md" } ]\n}\n' "$PROGRAM_REQUIRED" > "$TARGET/orchestrator/process/reconcile.config.json" && echo "✓ orchestrator/process/reconcile.config.json (strict receipts; topology=$TOPOLOGY)"
fi
if [ "$TOPOLOGY" = "multi" ]; then
  bash "$SKILL/tools/init-program.sh" "$TARGET" --id "$PROGRAM_ID" --name "$PNAME" || exit $?
fi

# 2c) project rules file (AGENTS.md) — BACKLOG header and Output Language both expect it
put "$SKILL/templates/AGENTS_TEMPLATE.md" "$TARGET/AGENTS.md"

# 2d) physical architecture layer (M/L only — S is single-dev, no boundary ceremony; DEC-000 covers it)
if [ "$TRIAGE" != "S" ]; then
  put "$SKILL/templates/SYSTEM_ARCHITECTURE_TEMPLATE.md" "$TARGET/orchestrator/SYSTEM_ARCHITECTURE.md"
  if [ ! -e "$TARGET/orchestrator/process/boundaries.config.json" ] && [ -e "$TARGET/orchestrator/process/boundaries.config.example.json" ]; then
    cp "$TARGET/orchestrator/process/boundaries.config.example.json" "$TARGET/orchestrator/process/boundaries.config.json" \
      && echo "✓ orchestrator/process/boundaries.config.json (edit rules to match SYSTEM_ARCHITECTURE.md)"
    ( cd "$TARGET" && node orchestrator/process/boundary-scan.mjs --update-baseline >/dev/null 2>&1 ) \
      && echo "✓ boundary-baseline.json (initial ratchet start)"
  fi
fi

# 3) task board at project root
put "$SKILL/templates/BACKLOG_TEMPLATE.md" "$TARGET/BACKLOG.md"
if grep -q '<项目名>' "$TARGET/BACKLOG.md" 2>/dev/null; then
  sed -i '' -e "s/<项目名>/$PNAME/" "$TARGET/BACKLOG.md" 2>/dev/null || sed -i -e "s/<项目名>/$PNAME/" "$TARGET/BACKLOG.md"
fi

# 4) hooks
mkdir -p "$TARGET/.claude/hooks"
put "$SKILL/templates/hooks/session-start.sh" "$TARGET/.claude/hooks/session-start.sh"
put "$SKILL/templates/hooks/backlog-guard.sh" "$TARGET/.claude/hooks/backlog-guard.sh"
put "$SKILL/templates/hooks/post-tool-observe.sh" "$TARGET/.claude/hooks/post-tool-observe.sh"
chmod +x "$TARGET/.claude/hooks/"*.sh 2>/dev/null || true

# 5) settings.json — create if absent; never clobber an existing one
HOOKS_JSON='{
  "hooks": {
    "SessionStart": [ { "hooks": [ { "type": "command",
      "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh\"" } ] } ],
    "PreToolUse": [ { "matcher": "Edit|Write",
      "hooks": [ { "type": "command",
      "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/backlog-guard.sh\"" } ] } ],
    "PostToolUse": [ { "matcher": "Edit|Write|MultiEdit",
      "hooks": [ { "type": "command",
      "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/post-tool-observe.sh\"" } ] } ]
  }
}'
if [ -e "$TARGET/.claude/settings.json" ]; then
  echo "! .claude/settings.json exists — merge the hooks block manually:"
  echo "$HOOKS_JSON" | sed 's/^/    /'
else
  printf '%s\n' "$HOOKS_JSON" > "$TARGET/.claude/settings.json" && echo "✓ .claude/settings.json (both hooks registered)"
fi

# 5b) CI verify workflow(GitHub Actions 形态;其他 CI 按模板注释改造;无远端项目留着无害)
mkdir -p "$TARGET/.github/workflows"
put "$SKILL/templates/CI_VERIFY_TEMPLATE.yml" "$TARGET/.github/workflows/verify.yml"

# 6) git
if git -C "$TARGET" rev-parse --git-dir >/dev/null 2>&1; then echo "· git repo already present"; else
  git -C "$TARGET" init -q && echo "✓ git init"
fi

# 7) DEC-000: record the triage class (one DEC covers the whole class — no per-stage skip DECs)
if ! grep -q 'DEC-000' "$TARGET/orchestrator/DECISION_LOG.md" 2>/dev/null; then
  cat >> "$TARGET/orchestrator/DECISION_LOG.md" <<EOF

\`\`\`text
ID: DEC-000
Date: $TODAY
Stage: 1-plan
Type: tradeoff
Decision: Scale triage class = $TRIAGE; delivery topology = $TOPOLOGY. Constitution placeholder: PRODUCT_SPEC.md, due at 1-plan approval.
Rationale: one DEC records scale and the explicit single/multi completion topology; no default program opt-out or per-stage skip DEC.
Pattern-Ref: none(分诊规则本身即依据)
Asset-Ref: none
Source: tools/init-project.sh
Affected Artifacts: orchestrator/ARTIFACT_MANIFEST.yaml
Invalidates: none
Owner: user
Revisit Trigger: project outgrows class $TRIAGE (e.g. real users appear on an S project)
Status: active
\`\`\`
EOF
  echo "✓ DEC-000 (triage $TRIAGE + constitution placeholder)"
else
  echo "· SKIP: DEC-000 already recorded"
fi

# 7b) commit the scaffold (also materializes the work_branch so reconcile's probes can run)
if ! git -C "$TARGET" rev-parse --verify HEAD >/dev/null 2>&1; then
  git -C "$TARGET" add -A && git -C "$TARGET" commit -q -m "chore: orchestrator scaffold (init-project.sh, class $TRIAGE)" && echo "✓ scaffold committed (branch $(git -C "$TARGET" branch --show-current))"
  BR="$(git -C "$TARGET" branch --show-current)"
  if [ "$BR" != "main" ] && [ -e "$TARGET/orchestrator/process/reconcile.config.json" ]; then
    sed -i '' -e "s/\"work_branch\": \"main\"/\"work_branch\": \"$BR\"/" "$TARGET/orchestrator/process/reconcile.config.json" 2>/dev/null \
      || sed -i -e "s/\"work_branch\": \"main\"/\"work_branch\": \"$BR\"/" "$TARGET/orchestrator/process/reconcile.config.json"
  fi
fi

# 8) first reconcile — a fresh init must be green
echo "▶ first reconcile:"
( cd "$TARGET" && node orchestrator/process/reconcile.mjs ); RC=$?
if [ "$RC" -eq 0 ]; then
  echo "✓ init complete. Next: stage 1-plan (workflows/v3-1-plan.md) — one chaptered PRODUCT_SPEC.md. Class $TRIAGE path per SKILL.md 「Scale Triage」."
else
  echo "✗ reconcile exited $RC on a fresh init — fix before starting stage work." >&2
fi
exit "$RC"
