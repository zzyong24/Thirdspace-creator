#!/usr/bin/env bash
# Stop hook —— Harness Control Plane 的最终收口。
# Claude Code 与 Codex 都可以挂载；它不依赖宿主专属环境变量，直接从自身路径定位项目根目录。
set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-${CODEX_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}}"
command -v node >/dev/null 2>&1 || {
  echo "Stop/reconcile 无法执行：未找到 node；请不要把本轮标记为完成。" >&2
  exit 2
}

cd "$ROOT" || exit 2
node orchestrator/process/reconcile.mjs
