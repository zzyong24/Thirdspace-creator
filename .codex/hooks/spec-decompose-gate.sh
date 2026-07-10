#!/usr/bin/env bash
# PostToolUse(Write)hook —— 强制「SPEC → 拆 Task」铁律(机制兜底,不靠模型记忆)。
# 一旦写了 docs/superpowers/specs/ 下的 SPEC,注入提醒:下一步必须拆成 BACKLOG 任务。
# 曾因没机制提醒而漏掉这一步(写完 SPEC 直接想开工)。stdout 会作为 additionalContext 注入。

INPUT="$(cat 2>/dev/null)"
# 从 tool_input 抽 file_path(不依赖 jq;容错单/双引号与空白)。
FP="$(printf '%s' "$INPUT" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"

case "$FP" in
  *docs/superpowers/specs/*.md)
    case "$FP" in
      *REVIEW_LEDGER*) exit 0 ;;  # 台账/索引不是待拆的 SPEC
    esac
    echo "⚠️【铁律·SPEC→拆Task,不可跳过】你刚写了 SPEC:${FP##*/}"
    echo "下一步**必须**:把这份 SPEC 拆成 BACKLOG.md 任务(需求即任务;每切片一条,状态 📋,引用该 SPEC)。"
    echo "改方向/架构/数据归属的 SPEC 还要过 spec-review gate(verdict≠FAIL)。**未拆 Task / 未过审,不准开工实现。**"
    ;;
esac
exit 0
