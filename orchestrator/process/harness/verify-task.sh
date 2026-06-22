#!/usr/bin/env bash
# Scoped verification for one task. Backend-only tasks don't need the slow frontend build.
# Usage: verify-task.sh <vertical:step>
set -uo pipefail
cd "$(dirname "$0")/../../.."   # repo root
task="${1:-}"
step="${task##*:}"
echo "▶ reconcile (drift gate)"
node orchestrator/process/reconcile.mjs >/dev/null || { echo "✗ drift"; exit 1; }
case "$step" in
  repo)
    echo "▶ backend typecheck + test"
    ( cd backend && pnpm typecheck && pnpm test ) || exit 1 ;;
  frontend|flow)
    echo "▶ backend test + frontend verify"
    ( cd backend && pnpm typecheck && pnpm test ) || exit 1
    ( cd frontend && pnpm verify ) || exit 1 ;;
  data-source)
    echo "▶ backend test (+ frontend verify if FE touched)"
    ( cd backend && pnpm typecheck && pnpm test ) || exit 1 ;;
  e2e)
    echo "▶ frontend verify + visual"
    ( cd frontend && pnpm verify && pnpm test:visual ) || exit 1 ;;
  *) echo "unknown step '$step'"; exit 2 ;;
esac
echo "✓ verify-task green: $task"
