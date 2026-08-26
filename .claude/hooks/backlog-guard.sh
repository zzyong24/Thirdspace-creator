#!/usr/bin/env bash
# PreToolUse hook 模板 —— 与 session-start.sh 一起在 orchestrator init 时拷到项目 .claude/hooks/ 与 .codex/hooks/。
# Claude Code 在 .claude/settings.json 注册，Codex 在 .codex/hooks.json 注册；两者都使用同一份裁决逻辑。
# Claude Code 的注册示例:
#   { "hooks": {
#       "SessionStart": [ { "hooks": [ { "type":"command",
#           "command":"bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh\"" } ] } ],
#       "PreToolUse":   [ { "matcher": "Edit|Write",
#           "hooks": [ { "type":"command",
#           "command":"bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/backlog-guard.sh\"" } ] } ] } }
#
# 作用(即时 guard,不靠模型记忆):拦截「把 BACKLOG.md 任务标 🔨 开工,但审核列
# 不是放行值」的 Edit/Write。receipt 的 hash/spec 完整性由 taskctl + reconcile 校验;
# 直接 shell/IDE 写可绕过本 hook,但 CI reconcile 会检出漂移。
# 判定方式:先把本次编辑套用到磁盘内容上算出**编辑后的完整文件状态**(所以局部替换、只改
# emoji 的最小编辑也拦得住),再找其中新出现的违规行。
# 放行采用 allowlist:— / 新式 PASS[REV:<12hex>]。legacy/缺配置项目只读，直接改成 🔨/✅
# 也会被拦；先显式迁移 strict receipts。待审、FAIL、CONCERNS、未知值一律不是开工授权。
# 已存在于磁盘的违规行不拦(只拦增量违规,避免误伤无关编辑)。
# 依赖:python3(缺失则放行降级,宁可漏拦不可误伤)。

command -v python3 >/dev/null 2>&1 || exit 0

# hook 的 JSON 载荷在 stdin;heredoc 会占用 stdin,故先读进环境变量再传给 python
HOOK_PAYLOAD="$(cat)" export HOOK_PAYLOAD

python3 - <<'PY'
import json, os, re, sys

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

config_path = os.path.join(os.path.dirname(path), "orchestrator", "process", "reconcile.config.json")
policy = "legacy"
phase = "maintenance"
if os.path.exists(config_path):
    try:
        config = json.load(open(config_path, encoding="utf-8"))
        policy = config.get("receipt_policy", "legacy")
        phase = config.get("delivery_phase", "maintenance")
    except Exception:
        policy = "invalid"

def cells(line: str):
    values = line.split("|")
    if values and not values[0].strip(): values = values[1:]
    if values and not values[-1].strip(): values = values[:-1]
    return [value.strip() for value in values]

def separator(line: str) -> bool:
    value = line.strip()
    return value.startswith("|") and "-" in value and re.fullmatch(r"[|\s:\-]+", value) is not None

def legacy_blocked(text: str) -> bool:
    return (
        "待审" in text
        or re.search(r"(?:^|\s|·)FAIL(?:\s|·|$)", text) is not None
        or ("CONCERNS" in text and "已处理" not in text)
    )

def allowed_review(value: str) -> bool:
    if value == "—": return True
    if re.fullmatch(r"PASS\[REV:[a-f0-9]{12}\]", value): return True
    if policy == "legacy" and value in ("PASS", "CONCERNS(已处理)"): return True
    return False

def violations(text: str):
    lines = text.splitlines()
    result = set()
    columns = None
    for index, line in enumerate(lines):
        if not line.lstrip().startswith("|") or separator(line):
            continue
        row = cells(line)
        if index + 1 < len(lines) and separator(lines[index + 1]):
            columns = {
                "status": next((i for i, value in enumerate(row) if "状态" in value), -1),
                "review": next((i for i, value in enumerate(row) if "审核" in value), -1),
            }
            continue
        if policy != "required" and ("🔨" in line or "✅" in line):
            result.add(line)
            continue
        if "🔨" not in line:
            continue
        if not columns or columns["review"] < 0:
            if policy in ("required", "invalid") or legacy_blocked(" ".join(row)):
                result.add(line)
            continue
        review = row[columns["review"]] if columns["review"] < len(row) else ""
        if not allowed_review(review):
            result.add(line)
    return result

pre_violations = violations(disk)
fresh = [line for line in violations(post) if line not in pre_violations]
if not fresh:
    sys.exit(0)

if policy != "required":
    sys.stderr.write(
        f"BACKLOG guard(阻断):receipt_policy={policy!r}，legacy/未配置项目禁止直接开工或完成:\n"
        + "\n".join("  " + l.strip() for l in fresh[:3])
        + "\n先运行 strict-receipts-migrate.mjs check，确认 --non-ui 清单后 apply 迁移为 required。\n"
    )
else:
    if phase == "buildout":
        sys.stderr.write(
            "BACKLOG guard(阻断):buildout 不等待正式审核，活动任务审核列应为 —:\n"
            + "\n".join("  " + l.strip() for l in fresh[:3])
            + "\n高影响变化走用户确认；项目稳定后用 delivery-phase.mjs promote 进入 maintenance。\n"
        )
    else:
        sys.stderr.write(
            "BACKLOG guard(阻断):maintenance 任务被标 🔨,但审核列不在 allowlist:\n"
            + "\n".join("  " + l.strip() for l in fresh[:3])
            + "\n稳定产品面/架构/数据归属变更先过 spec-review,再由 reviewctl 写入 PASS[REV:<receipt>]。\n"
        )
sys.exit(2)
PY
