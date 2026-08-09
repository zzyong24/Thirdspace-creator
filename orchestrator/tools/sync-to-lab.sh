#!/usr/bin/env bash
# Mirror this central copy back to the skills-manager SOURCE (the lab checkout), so the app's
# periodic source→central sync cannot roll back edits made here. See README "Maintainer Note".
# Direction: central (this folder) → lab. Run after any edit session in this folder.
set -euo pipefail

CENTRAL="$(cd "$(dirname "$0")/.." && pwd)"
LAB="${LAB_DIR:-}"

if [ -z "$LAB" ]; then
  echo "✗ LAB_DIR 必须显式指向已确认的 product-to-code-orchestrator source checkout" >&2
  exit 2
fi
if [ ! -d "$LAB" ]; then
  echo "✗ LAB_DIR 不存在或不是目录: $LAB" >&2
  exit 2
fi
LAB="$(cd "$LAB" && pwd -P)"
[ "$(basename "$LAB")" = "product-to-code-orchestrator" ] || {
  echo "✗ LAB_DIR basename 必须是 product-to-code-orchestrator: $LAB" >&2
  exit 2
}
[ "$LAB" != "$CENTRAL" ] || {
  echo "✗ LAB_DIR 与 central 是同一目录，拒绝自同步" >&2
  exit 2
}
LAB_REPO="$(dirname "$LAB")"
git -C "$LAB_REPO" rev-parse --git-dir >/dev/null 2>&1 || {
  echo "✗ LAB_DIR 的父目录不是 Git checkout: $LAB_REPO" >&2
  exit 2
}
if [ -n "$(git -C "$LAB_REPO" status --porcelain --untracked-files=all)" ]; then
  echo "✗ LAB_DIR 所在 Git 仓库含 staged、unstaged 或 untracked 修改，拒绝同步和提交: $LAB_REPO" >&2
  exit 2
fi

rsync -a --delete --exclude '.DS_Store' "$CENTRAL/" "$LAB/"

if diff -rq "$LAB" "$CENTRAL" --exclude .DS_Store >/dev/null 2>&1; then
  echo "✓ lab == central ($LAB)"
else
  echo "✗ residual diff after rsync — inspect: diff -rq '$LAB' '$CENTRAL'" >&2
  exit 1
fi

# Commit in the lab repo if it is one (keeps source history; app syncs content, not .git)
if git -C "$LAB_REPO" rev-parse --git-dir >/dev/null 2>&1; then
  git -C "$LAB_REPO" add -A "$(basename "$LAB")"   # a real add failure should surface, not be eaten
  if git -C "$LAB_REPO" diff --cached --quiet; then
    echo "· lab repo: nothing to commit"
  else
    git -C "$LAB_REPO" commit --no-verify -q -m "sync: mirror from central skills copy"
    echo "✓ lab repo committed"
  fi
fi
