#!/usr/bin/env bash
# SessionStart hook 模板 —— orchestrator init 时与 backlog-guard.sh 一起拷到项目 .claude/hooks/。
# 两个 hook 的合并注册示例见 backlog-guard.sh 头部(SessionStart 注入看板;PreToolUse 拦未过审开工)。
# stdout 会被 Claude Code 作为 additionalContext 注入。
#
# 为什么只注入 top-N 而不是全量:看板膨胀后(实测 200KB+)全量注入会被宿主转存成文件引用,
# 等于没注入 —— 铁律「开工从看板顶取」反而失效。故只注入队列头部可执行行(🔨 优先、再 📋,
# 保队列可见性),每 cell 截断,✅/归档一概不进上下文;深上下文交给 Task Packet
# (orchestrator/process/context-compile.mjs 产物,存在即在此打指针)。
#
# 可调:env BACKLOG_INJECT_ROWS(默认 10)。纯 bash 零依赖;缺 BACKLOG.md 的项目安全退出。

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
BL="$ROOT/BACKLOG.md"
[ -f "$BL" ] || exit 0

# UTF-8 locale:让 ${#s} / ${s:0:n} 按「字符」而非字节截断(中文 cell 截半个字会出乱码)。
# locale 不存在时 bash 静默沿用旧值,降级为字节截断,不致命。
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

N="${BACKLOG_INJECT_ROWS:-10}"
MAXLEN=200

echo "【必读·任务看板 BACKLOG.md】"
echo "读取顺序:本看板 → 任务引用的 SPEC → 代码。铁律:需求即建任务进看板;开工从看板顶取并改 🔨;完成改 ✅+提交;禁止 P0/P1 分级与多阶段执行,任务清楚即起 Workflow/并行 subagent;改方向/架构/数据归属的 SPEC 过审才准开工。"
echo "---"

# ---------- 收集可执行行(只扫「## ✅」/归档区之前;🔨 优先、再 📋,各按文件内出现顺序) ----------
doing_rows=()
todo_rows=()
while IFS= read -r line; do
  case "$line" in
    "## ✅"*|"## "*归档*) break ;;
  esac
  # 只看表格行;不含状态 emoji 的行(表头/分隔行/正文)天然跳过
  case "$line" in
    \|*🔨*) doing_rows+=("$line") ;;
    \|*📋*) todo_rows+=("$line") ;;
  esac
done < "$BL"

total=$(( ${#doing_rows[@]} + ${#todo_rows[@]} ))

# ---------- 单 cell 截断(>MAXLEN 字符 → 截断 + …) ----------
truncate_row() {
  local row="$1" out="|" cell cells
  # 掐掉首尾的 "|" 再按 "|" 切 cell(cell 内不会有裸 "|",看板约定)。
  # 用 read -ra 而非无引号 for-in:后者会做 glob 扩展(cell 含 * 就炸)且丢空 cell。
  row="${row#|}"
  row="${row%|}"
  local IFS='|'
  read -ra cells <<< "$row"
  for cell in ${cells[@]+"${cells[@]}"}; do
    # 去 cell 首尾空格
    while [ "${cell# }" != "$cell" ]; do cell="${cell# }"; done
    while [ "${cell% }" != "$cell" ]; do cell="${cell% }"; done
    if [ "${#cell}" -gt "$MAXLEN" ]; then
      cell="${cell:0:$MAXLEN}…"
    fi
    out="$out $cell |"
  done
  printf '%s\n' "$out"
}

# ---------- 注入 top-N ----------
shown=0
for row in ${doing_rows[@]+"${doing_rows[@]}"} ${todo_rows[@]+"${todo_rows[@]}"}; do
  [ "$shown" -ge "$N" ] && break
  truncate_row "$row"
  shown=$(( shown + 1 ))
done

echo "(看板共 ${total} 行可执行,已注入前 ${shown};完整看板:BACKLOG.md)"

# ---------- 🔨 任务若已有 Task Packet → 打指针(深上下文不进注入,按需读) ----------
for row in ${doing_rows[@]+"${doing_rows[@]}"}; do
  id="${row#|}"
  id="${id%%|*}"
  # 去首尾空格
  while [ "${id# }" != "$id" ]; do id="${id# }"; done
  while [ "${id% }" != "$id" ]; do id="${id% }"; done
  [ -n "$id" ] || continue
  if [ -f "$ROOT/orchestrator/context/$id.md" ]; then
    echo "任务包:orchestrator/context/$id.md"
  fi
done

# ---------- 脚手架版本漂移提示(fail-open:无版本章/skill 目录不在,一律静默) ----------
VF="$ROOT/orchestrator/process/.skill-version"
if [ -f "$VF" ]; then
  pv="$(sed -n 's/^version=//p' "$VF" | head -1)"
  sd="$(sed -n 's/^skill_dir=//p' "$VF" | head -1)"
  if [ -n "$pv" ] && [ -n "$sd" ] && [ -f "$sd/VERSION" ]; then
    sv="$(cat "$sd/VERSION")"
    if [ "$pv" != "$sv" ]; then
      echo "⚠ 脚手架引擎过时:项目 vendored ${pv},skill 已是 ${sv}。建议先升级再开工:"
      echo "  bash \"$sd/tools/init-project.sh\" \"$ROOT\" --update  (刷新引擎与 hooks,保留项目 config/baseline,升级后自动 reconcile)"
    fi
  fi
fi
