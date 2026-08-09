#!/usr/bin/env bash
# Initialize the thin product-program control plane in one coordinator project.
# Usage: init-program.sh <coordinator-project-dir> --id <program-id> --name <program-name>
set -euo pipefail

SKILL="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"
shift || true
PROGRAM_ID=""
PROGRAM_NAME=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --id) PROGRAM_ID="${2:-}"; shift 2 ;;
    --name) PROGRAM_NAME="${2:-}"; shift 2 ;;
    *) echo "✗ unknown arg: $1" >&2; exit 2 ;;
  esac
done

[ -n "$TARGET" ] && [ -n "$PROGRAM_ID" ] && [ -n "$PROGRAM_NAME" ] || {
  echo "usage: init-program.sh <coordinator-project-dir> --id <program-id> --name <program-name>" >&2
  exit 2
}
case "$PROGRAM_ID" in
  *[!a-zA-Z0-9._-]*|"") echo "✗ --id only accepts letters, numbers, dot, underscore and hyphen" >&2; exit 2 ;;
esac

TARGET="$(cd "$TARGET" 2>/dev/null && pwd)" || {
  echo "✗ coordinator project does not exist: $TARGET" >&2
  exit 2
}
ENGINE="$TARGET/orchestrator/process/program-gate.mjs"
if [ ! -f "$ENGINE" ]; then
  echo "✗ $ENGINE missing; run tools/init-project.sh \"$TARGET\" --update --topology multi --program-id \"$PROGRAM_ID\" before init-program" >&2
  exit 2
fi

ORCHESTRATOR="$TARGET/orchestrator"
if [ -L "$ORCHESTRATOR" ] || [ ! -d "$ORCHESTRATOR" ]; then
  echo "✗ orchestrator 必须是 coordinator 项目内真实目录，不接受 symlink" >&2
  exit 2
fi
CONTROL="$ORCHESTRATOR/program"
CONFIG="$CONTROL/program.config.json"
RELEASE="$CONTROL/release-set.json"
RECEIPT_TEMPLATE="$CONTROL/receipt.template.json"
if [ -L "$CONTROL" ] || { [ -e "$CONTROL" ] && [ ! -d "$CONTROL" ]; }; then
  echo "✗ orchestrator/program 必须是真实目录，不接受 symlink" >&2
  exit 2
fi
for directory in "$CONTROL/receipts" "$CONTROL/executions" "$CONTROL/evidence"; do
  if [ -L "$directory" ] || { [ -e "$directory" ] && [ ! -d "$directory" ]; }; then
    echo "✗ ${directory#"$TARGET"/} 必须是真实目录，不接受 symlink" >&2
    exit 2
  fi
done
for file in \
  "$CONFIG" \
  "$RELEASE" \
  "$RECEIPT_TEMPLATE" \
  "$CONTROL/receipts/.gitkeep" \
  "$CONTROL/executions/.gitkeep" \
  "$CONTROL/evidence/.gitkeep"; do
  if [ -L "$file" ]; then
    echo "✗ ${file#"$TARGET"/} 不接受 symlink" >&2
    exit 2
  fi
done

RECONCILE_CONFIG="$TARGET/orchestrator/process/reconcile.config.json"
node -e '
  const fs = require("node:fs");
  const file = process.argv[1];
  let value = {};
  let mode = 0o644;
  try {
    if (fs.existsSync(file)) {
      const stat = fs.lstatSync(file);
      if (!stat.isFile()) throw new Error("路径不是普通文件");
      mode = stat.mode;
      value = JSON.parse(fs.readFileSync(file, "utf8"));
    }
    if (value === null || Array.isArray(value) || typeof value !== "object") {
      throw new Error("顶层必须是 JSON object");
    }
  } catch (error) {
    console.error(`✗ 无法解析 orchestrator/process/reconcile.config.json；未修改项目内容：${error.message}`);
    process.exit(2);
  }
  if (value.program_completion_required === true) process.exit(0);
  value.program_completion_required = true;
  const temporary = `${file}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode,
    });
    fs.renameSync(temporary, file);
  } catch (error) {
    try {
      fs.unlinkSync(temporary);
    } catch {}
    console.error(`✗ 无法设置 program_completion_required；未覆盖原配置：${error.message}`);
    process.exit(2);
  }
' "$RECONCILE_CONFIG"
echo "✓ orchestrator/process/reconcile.config.json: program_completion_required=true"

mkdir -p "$CONTROL/receipts" "$CONTROL/executions" "$CONTROL/evidence"
touch "$CONTROL/receipts/.gitkeep" "$CONTROL/executions/.gitkeep" "$CONTROL/evidence/.gitkeep"

if [ -e "$CONFIG" ]; then
  echo "· SKIP: orchestrator/program/program.config.json exists; project-owned content preserved"
else
  cp "$SKILL/templates/PROGRAM_CONFIG_TEMPLATE.json" "$CONFIG"
  node -e '
    const fs = require("node:fs");
    const file = process.argv[1];
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    value.program_id = process.argv[2];
    value.name = process.argv[3];
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  ' "$CONFIG" "$PROGRAM_ID" "$PROGRAM_NAME"
  echo "✓ orchestrator/program/program.config.json"
fi

if [ -e "$RELEASE" ]; then
  echo "· SKIP: orchestrator/program/release-set.json exists; project-owned content preserved"
else
  cp "$SKILL/templates/PROGRAM_RELEASE_SET_TEMPLATE.json" "$RELEASE"
  echo "✓ orchestrator/program/release-set.json"
fi

if [ -e "$RECEIPT_TEMPLATE" ]; then
  echo "· SKIP: orchestrator/program/receipt.template.json exists; project-owned content preserved"
else
  cp "$SKILL/templates/PROGRAM_JOURNEY_RECEIPT_TEMPLATE.json" "$RECEIPT_TEMPLATE"
  echo "✓ orchestrator/program/receipt.template.json"
fi

echo "NO-GO until components, deployed release set, journey receipt and real verify command are configured."
echo "下一步: fill program.config.json + release-set.json, create each receipt, then run:"
echo "  node orchestrator/process/program-gate.mjs --execute <journey-id>"
