#!/usr/bin/env bash
# Initializer agent (run ONCE before a long autonomous run).
# Sets up the environment, derives the task queue from reality, and asserts a green baseline.
set -euo pipefail
cd "$(dirname "$0")/../../.."   # -> repo root

echo "▶ reconcile control artifacts (must be 0 drift to start)"
node orchestrator/process/reconcile.mjs

echo "▶ (re)generate the task queue from the work branch"
node orchestrator/process/progress.mjs generate
node orchestrator/process/progress.mjs status

echo "▶ install deps + baseline build/test (the loop's verification must be green to begin)"
if [ -d frontend ]; then ( cd frontend && pnpm install --frozen-lockfile && pnpm verify ); fi

echo "✓ init complete — drive the loop with: node orchestrator/process/progress.mjs next"
