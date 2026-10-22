#!/usr/bin/env bash
# Add one product module to an initialized M/L project.
# Usage: init-module.sh <project-dir> --id FEAT-001 --slug crm --name 客户跟进
set -uo pipefail

SKILL="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"; shift || true
FEAT_ID=""; SLUG=""; MODULE_NAME=""
while [ $# -gt 0 ]; do
  case "$1" in
    --id) FEAT_ID="${2:-}"; shift 2 ;;
    --slug) SLUG="${2:-}"; shift 2 ;;
    --name) MODULE_NAME="${2:-}"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
[ -d "$TARGET" ] && [ -n "$FEAT_ID" ] && [ -n "$SLUG" ] && [ -n "$MODULE_NAME" ] || {
  echo "usage: init-module.sh <project-dir> --id FEAT-001 --slug crm --name 客户跟进" >&2; exit 2;
}
case "$FEAT_ID" in FEAT-[0-9][0-9][0-9]) ;; *) echo "✗ --id must match FEAT-001" >&2; exit 2;; esac
case "$SLUG" in *[!a-z0-9-]*|"") echo "✗ --slug accepts lowercase letters, digits and hyphens" >&2; exit 2;; esac
TARGET="$(cd "$TARGET" && pwd)"
CONFIG="$TARGET/orchestrator/process/knowledge.config.json"
[ -e "$CONFIG" ] || { echo "✗ module knowledge is not enabled; initialize an M/L project first" >&2; exit 2; }

FEAT_ID_VALUE="$FEAT_ID" SLUG_VALUE="$SLUG" node - "$CONFIG" <<'NODE' || exit 2
const fs = require('node:fs');
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const id = process.env.FEAT_ID_VALUE;
const slug = process.env.SLUG_VALUE;
for (const [existingId, feature] of Object.entries(config.feature_map ?? {})) {
  if (existingId === id && feature.dir !== slug) throw new Error(`${id} already maps to ${feature.dir}`);
  if (existingId !== id && feature.dir === slug) throw new Error(`${slug} already belongs to ${existingId}`);
}
NODE

DEST="$TARGET/docs/features/$SLUG"
mkdir -p "$DEST/blocks"
for part in README BUSINESS DATA UI; do
  out="$DEST/$part.md"
  if [ -e "$out" ]; then
    echo "· SKIP (exists): docs/features/$SLUG/$part.md"
    continue
  fi
  cp "$SKILL/templates/knowledge/FEATURE_${part}_TEMPLATE.md" "$out"
  MODULE_NAME_VALUE="$MODULE_NAME" FEAT_ID_VALUE="$FEAT_ID" node - "$out" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const escaped = process.env.MODULE_NAME_VALUE;
const id = process.env.FEAT_ID_VALUE;
let text = fs.readFileSync(file, 'utf8');
text = text.replaceAll('<模块名>', escaped).replaceAll('FEAT-xxx', id);
fs.writeFileSync(file, text);
NODE
  echo "✓ docs/features/$SLUG/$part.md"
done

TARGET_ROOT="$TARGET" FEAT_ID_VALUE="$FEAT_ID" SLUG_VALUE="$SLUG" MODULE_NAME_VALUE="$MODULE_NAME" node - "$CONFIG" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const configFile = process.argv[2];
const root = process.env.TARGET_ROOT;
const id = process.env.FEAT_ID_VALUE;
const slug = process.env.SLUG_VALUE;
const name = process.env.MODULE_NAME_VALUE;
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
config.feature_map ||= {};
if (config.feature_map[id] && config.feature_map[id].dir !== slug) {
  throw new Error(`${id} already maps to ${config.feature_map[id].dir}`);
}
config.feature_map[id] ||= { title: name, dir: slug, contract_globs: [] };
fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
const indexFile = path.join(root, 'docs', 'INDEX.md');
let index = fs.readFileSync(indexFile, 'utf8');
const link = `- [${name}（${id}）](./features/${slug}/README.md)`;
if (!index.includes(`./features/${slug}/README.md`)) {
  const marker = '## 跨模块知识';
  index = index.replace(marker, `${link}\n\n${marker}`);
  fs.writeFileSync(indexFile, index);
}
NODE

echo "✓ module $FEAT_ID registered. Next: register stable FR/FLOW/AC/ENT IDs in orchestrator/ID_REGISTRY.md."
