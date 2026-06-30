#!/usr/bin/env bash
# SessionStart hook —— 把任务看板的「进行中/待办」+ 流程铁律注入每个会话的上下文。
# 目的:让看板"必读"不依赖模型记忆;靠 hook 兜底(项目级,见 .claude/settings.json)。
# 输出到 stdout 的内容会被 Claude Code 作为 additionalContext 注入会话。

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
BL="$ROOT/BACKLOG.md"

[ -f "$BL" ] || exit 0

echo "【必读·任务看板 BACKLOG.md】"
echo "读取顺序:本看板 → 任务引用的 SPEC → 代码。规则:需求即建任务进看板;开工从看板顶取并改 🔨;完成改 ✅+提交;禁止 P0/P1 分级与多阶段执行,任务清楚即起 Workflow/并行 subagent。"
echo "---"
# 只注入"进行中/待办"段(到「## ✅ 已完成」之前),避免把整张已完成表灌进上下文。
awk '/^## ✅/{exit} {print}' "$BL"
