#!/usr/bin/env bash
# PreToolUse hook 模板 —— 与 session-start.sh 一起在 orchestrator init 时拷到项目 .claude/hooks/,
# 在 .claude/settings.json 注册(两个 hook 的完整注册示例):
#   { "hooks": {
#       "SessionStart": [ { "hooks": [ { "type":"command",
#           "command":"bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh\"" } ] } ],
#       "PreToolUse":   [ { "matcher": "Edit|Write",
#           "hooks": [ { "type":"command",
#           "command":"bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/backlog-guard.sh\"" } ] } ] } }
#
# 作用(确定性 enforcement,不靠模型记忆):拦截「把 BACKLOG.md 任务标 🔨 开工,但审核列
# 不是放行值」的编辑 —— Harness Control Plane §5 的 "no implement before reviewed"。
# 判定方式:先把本次编辑套用到磁盘内容上算出**编辑后的完整文件状态**(所以局部替换、只改
# emoji 的最小编辑也拦得住),再找其中新出现的违规行。
# 阻断值:审核列 = 待审 / FAIL / 裸 CONCERNS(未标「已处理」)。放行值:PASS / CONCERNS(已处理) / —。
# 已存在于磁盘的违规行不拦(只拦增量违规,避免误伤无关编辑)。
# 依赖:python3(缺失则放行降级,宁可漏拦不可误伤)。

command -v python3 >/dev/null 2>&1 || exit 0

# hook 的 JSON 载荷在 stdin;heredoc 会占用 stdin,故先读进环境变量再传给 python
HOOK_PAYLOAD="$(cat)" export HOOK_PAYLOAD

python3 - <<'PY'
import json, os, sys

try:
    data = json.loads(os.environ.get("HOOK_PAYLOAD", ""))
except Exception:
    sys.exit(0)

tool = data.get("tool_name", "")
ti = data.get("tool_input", {}) or {}
path = ti.get("file_path", "") or ""
if tool not in ("Edit", "Write", "MultiEdit") or os.path.basename(path) != "BACKLOG.md":
    sys.exit(0)

try:
    with open(path, encoding="utf-8") as f:
        disk = f.read()
except OSError:
    disk = ""

def apply_one(cur: str, old: str, new: str, replace_all: bool) -> str:
    if not old or old not in cur:
        # 找不到锚点(编辑会失败或是新增语义)——保守起见把 new 当追加内容参与判定
        return cur + "\n" + new
    return cur.replace(old, new) if replace_all else cur.replace(old, new, 1)

if tool == "Write":
    post = ti.get("content", "") or ""
elif tool == "Edit":
    post = apply_one(disk, ti.get("old_string", "") or "", ti.get("new_string", "") or "",
                     bool(ti.get("replace_all")))
else:  # MultiEdit: 依次套用
    post = disk
    for e in (ti.get("edits") or []):
        post = apply_one(post, e.get("old_string", "") or "", e.get("new_string", "") or "",
                         bool(e.get("replace_all")))

def blocked_cell(c: str) -> bool:
    if c in ("待审", "FAIL"):
        return True
    return c.startswith("CONCERNS") and "已处理" not in c  # 裸 CONCERNS = 未处置完

def violating(line: str) -> bool:
    # 表格行,状态含 🔨,且审核列是阻断值
    if "🔨" not in line or not line.lstrip().startswith("|"):
        return False
    cells = [c.strip() for c in line.split("|")]
    return any(blocked_cell(c) for c in cells)

pre_lines = set(disk.splitlines())
fresh = [l for l in post.splitlines() if violating(l) and l not in pre_lines]
if not fresh:
    sys.exit(0)

sys.stderr.write(
    "BACKLOG guard(阻断):任务被标 🔨 开工,但审核列不是放行值(待审 / FAIL / 未处理的 CONCERNS 均不得开工):\n"
    + "\n".join("  " + l.strip() for l in fresh[:3])
    + "\n改方向/架构/数据归属的 SPEC 必须先过 spec-review(prompts/spec-reviewer.md「执行契约」),"
    "评审后把审核列改为 PASS 或 CONCERNS(已处理) 再标 🔨;FAIL 表示评审未过,须修改 spec 重审。\n"
    "若该任务确属免审琐碎项,请把审核列改为 —(并对得起这个判断)。\n"
)
sys.exit(2)
PY
