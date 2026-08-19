#!/usr/bin/env bash
# PostToolUse observer —— Harness tools/post-execute + tools/result 的轻量落地。
# Claude Code 与 Codex 共用；Codex 通过 .codex/hooks.json 挂载同一脚本。
#
# 它只观察已注册的 Edit/Write/MultiEdit，不假装能撤销工具调用：
# - 普通业务文件：不打扰；
# - 控制面文件：立即跑一次 reconcile，发现漂移就提示；
# - 最终收口仍由 Stop/reconcile 负责，直接 shell/IDE 写入仍由 CI 兜底。
set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
command -v node >/dev/null 2>&1 || exit 0
PAYLOAD="$(cat || true)"

HOOK_PAYLOAD="$PAYLOAD" PROJECT_ROOT="$ROOT" node --input-type=module - <<'NODE'
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.env.PROJECT_ROOT;
let payload;
try { payload = JSON.parse(process.env.HOOK_PAYLOAD || '{}'); } catch { process.exit(0); }
const tool = payload.tool_name || payload.tool || '';
if (!['Edit', 'Write', 'MultiEdit'].includes(tool)) process.exit(0);

const input = payload.tool_input || payload.input || {};
const candidates = [input.file_path, input.path, ...(Array.isArray(input.edits) ? input.edits.map((e) => e?.file_path || e?.path) : [])]
  .filter(Boolean).map((p) => path.relative(root, path.resolve(root, p)));
const controlFile = /^(?:BACKLOG\.md|AGENTS\.md|PRODUCT_SPEC\.md|SERVICE_CONTRACT\.md|PAGE_SPEC\.md|orchestrator\/)/;
if (!candidates.some((p) => controlFile.test(p))) process.exit(0);

const result = spawnSync(process.execPath, ['orchestrator/process/reconcile.mjs'], {
  cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024,
});
if (result.status === 0) process.exit(0);
const detail = `${result.stderr || result.stdout || ''}`.trim().split('\n').slice(-4).join('\n');
process.stderr.write(`PostToolUse 已发现控制面可能漂移；本次工具调用不会被撤销，Stop/reconcile 仍是最终收口：\n${detail}\n`);
process.exit(2);
NODE
