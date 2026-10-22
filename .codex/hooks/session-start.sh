#!/usr/bin/env bash
# SessionStart hook 模板 —— orchestrator init 时同时拷到 .claude/hooks/ 与 .codex/hooks/。
# stdout 会被 Claude Code/Codex 作为会话上下文注入。
#
# 为什么只注入 top-N 而不是全量:看板膨胀后(实测 200KB+)全量注入会被宿主转存成文件引用,
# 等于没注入 —— 铁律「开工从看板顶取」反而失效。故只注入队列头部可执行行(🔨 优先、再 📋,
# 保队列可见性),每 cell 截断,✅/归档一概不进上下文;深上下文交给 Task Packet
# (orchestrator/process/context-compile.mjs 产物,存在即在此打指针)。
#
# 可调:env BACKLOG_INJECT_ROWS(默认 1)。纯 bash 零依赖;缺 BACKLOG.md 的项目安全退出。

ROOT="${CLAUDE_PROJECT_DIR:-${CODEX_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}}"
BL="$ROOT/BACKLOG.md"
[ -f "$BL" ] || exit 0

# UTF-8 locale:让 ${#s} / ${s:0:n} 按「字符」而非字节截断(中文 cell 截半个字会出乱码)。
# locale 不存在时 bash 静默沿用旧值,降级为字节截断,不致命。
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

N="${BACKLOG_INJECT_ROWS:-1}"
# 默认会话注入目标 <4KiB。同时限制 cell 宽度和数量，异常宽表也不能绕过预算。
MAXLEN=100
MAXCELLS=8

echo "【必读·任务看板 BACKLOG.md】"
echo "从看板顶部选择依赖就绪的任务，核对 context-plan.mjs 给出的当前阶段、规则与项目资料。开工标 🔨；中间步骤保持进行中，验收通过后标 ✅。"
echo "沿用已有授权；buildout 推进实现与验收，maintenance 按触发条件正式审核。派发、并行或自治时生成任务包；完整流程以项目 AGENTS.md 和阶段规则为准。"
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
  local row="$1" out="|" cell cells cell_count=0 omitted=0
  # 掐掉首尾的 "|" 再按 "|" 切 cell(cell 内不会有裸 "|",看板约定)。
  # 用 read -ra 而非无引号 for-in:后者会做 glob 扩展(cell 含 * 就炸)且丢空 cell。
  row="${row#|}"
  row="${row%|}"
  local IFS='|'
  read -ra cells <<< "$row"
  for cell in ${cells[@]+"${cells[@]}"}; do
    if [ "$cell_count" -ge "$MAXCELLS" ]; then omitted=$((omitted + 1)); continue; fi
    # 去 cell 首尾空格
    while [ "${cell# }" != "$cell" ]; do cell="${cell# }"; done
    while [ "${cell% }" != "$cell" ]; do cell="${cell% }"; done
    if [ "${#cell}" -gt "$MAXLEN" ]; then
      cell="${cell:0:$MAXLEN}…"
    fi
    out="$out $cell |"
    cell_count=$((cell_count + 1))
  done
  [ "$omitted" -eq 0 ] || out="$out …+$omitted cells |"
  printf '%s\n' "$out"
}

# ---------- 注入 top-N ----------
shown=0
shown_ids=()
for row in ${doing_rows[@]+"${doing_rows[@]}"} ${todo_rows[@]+"${todo_rows[@]}"}; do
  [ "$shown" -ge "$N" ] && break
  truncate_row "$row"
  id="${row#|}"
  id="${id%%|*}"
  while [ "${id# }" != "$id" ]; do id="${id# }"; done
  while [ "${id% }" != "$id" ]; do id="${id% }"; done
  shown_ids+=("$id")
  shown=$(( shown + 1 ))
done

echo "(看板共 ${total} 行可执行,已注入前 ${shown};完整看板:BACKLOG.md)"

# ---------- 已注入任务若有 Task Packet → 打指针(深上下文不进注入,按需读) ----------
for id in ${shown_ids[@]+"${shown_ids[@]}"}; do
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
      echo "⚠ 脚手架有可用更新:项目固定 ${pv},本机 skill 为 ${sv}；规则以项目固定版本为准。按需更新:"
      printf '  bash %q %q --update\n' "$sd/tools/init-project.sh" "$ROOT"
      echo "  缺显式 topology 的旧项目另补 --topology single 或 multi；multi 同时提供 --program-id。"
    fi
  fi
fi
