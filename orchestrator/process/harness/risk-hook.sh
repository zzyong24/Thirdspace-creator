#!/usr/bin/env bash
# PreToolUse risk classifier (OpenHands security_risk style). Reads the tool-call JSON on
# stdin; if the target file is HIGH-risk (contract surface / schema / migration / control
# artifacts / harness settings) it logs to harness/risk.log + warns on stderr so the human
# reviews these touches. ADVISORY by default (exit 0 — does not block). Set
# HARNESS_RISK_ADVISORY=0 to BLOCK high-risk edits (exit 2) until a human/DEC clears them.
set -uo pipefail
H="$(dirname "$0")"
ADVISORY="${HARNESS_RISK_ADVISORY:-1}"
input="$(cat || true)"
path="$(printf '%s' "$input" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
[ -z "$path" ] && exit 0
case "$path" in
  *contract/src/resources/*|*contract/src/operations/*|*/schema/*|*drizzle/*|*/migrations/*|\
  *ARTIFACT_MANIFEST*|*DECISION_LOG*|*ID_REGISTRY*|*TRACEABILITY_MATRIX*|*settings.autonomous.json*)
    msg="⚠ HIGH-risk edit: $path — contract/schema/migration/control surface. Record a DEC if this changes data/contract/security/release."
    echo "$(date '+%H:%M:%S') $msg" >> "$H/risk.log"
    echo "$msg" >&2
    if [ "$ADVISORY" = "1" ]; then exit 0; else exit 2; fi ;;
  *) exit 0 ;;
esac
