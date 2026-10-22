# 前端验收报告

> BUILD 页面组的紧凑验收收据，不是截图册。正常 PASS 留命令输出/trace 引用即可；截图或视频只在
> 失败、视觉歧义或人工体验裁决需要时保留。

## 验收摘要

- 任务与页面组：
- 用户意图与实际结果：
- 实际浏览器或桌面环境：
- 真实或有代表性的非固定演示样本 (脱敏 ID + role):
- 发现和修复的缺陷：
- 用户体验确认： `confirmed | not requested yet | rejected`

## 机器校验证据

`taskctl.mjs complete <T-ID> --evidence <this-file>` 会重新计算状态并绑定文件 hash。strict 项目还会
从 `reconcile.config.json.frontend_verify_commands[verify_key]` 取 allowlisted command 并实际执行；
报告里的任意命令文字不能自证运行。请替换示例，不要保留占位。`logic`、`surface`、`journey`
是三个不同结论；机器 PASS 不冒充人类体验确认。strict completion 要求 `commit_sha` 正好是执行
当下的 HEAD，且 PAGE_SPEC 文件 SHA-256 的前 12 位写入 `contract_sha`。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "<T-ID>",
  "contract_path": "<PAGE_SPEC.md>",
  "contract_sha": "<12-char SHA-256 of the complete PAGE_SPEC file>",
  "commit_sha": "<exact current HEAD tested by completion>",
  "observed_at": "<ISO-8601>",
  "run": {
    "verify_key": "<project verify key>",
    "command": "<real Playwright/browser/desktop journey command>",
    "exit_code": 0,
    "output_ref": "<test/trace/log reference>"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "<browser-or-desktop-runtime/version>",
    "viewports": [
      { "width": 1440, "height": 900, "result": "pass" },
      { "width": 1024, "height": 700, "result": "pass" }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      { "id": "<opaque-A>", "role": "<category-A>" },
      { "id": "<opaque-B>", "role": "<category-B>" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "<unit/selector result>" },
    "surface": { "status": "pass", "evidence_ref": "<page interaction result>" },
    "journey": { "status": "pass", "evidence_ref": "<intent-to-outcome result>" },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "<human confirmation or explicit SHIP-pending note>"
    }
  },
  "checks": [
    {
      "id": "<AC-ID>",
      "test_id": "<E2E-ID>",
      "result": "pass",
      "evidence_ref": "<assertion/trace reference>"
    }
  ],
  "coverage": [
    { "condition": "loading", "result": "pass", "evidence_ref": "<ref>", "reason": "" },
    { "condition": "empty", "result": "pass", "evidence_ref": "<ref>", "reason": "" },
    { "condition": "error", "result": "pass", "evidence_ref": "<ref>", "reason": "" },
    { "condition": "back", "result": "pass", "evidence_ref": "<ref>", "reason": "" },
    { "condition": "refresh", "result": "pass", "evidence_ref": "<ref>", "reason": "" },
    { "condition": "repeat", "result": "pass", "evidence_ref": "<ref>", "reason": "" }
  ],
  "visible_copy": {
    "artifact_path": "<browser-produced visible-copy.json>",
    "artifact_sha256": "<64-char SHA-256>"
  },
  "tdd_red_ref": "<the journey test failed before the fix>",
  "open_defects": [],
  "status": "pass"
}
```

`visible_copy` 指向旅程命令从真实页面提取的紧凑 JSON，不是手抄文案清单。每个 capture 保存
一个验收 checkpoint 的整页可见文本，并覆盖 contract 的 required checks 与两档 viewport：

```json
{
  "schema": "frontend-visible-copy/v1",
  "task_id": "<T-ID>",
  "commit_sha": "<same exact commit as report>",
  "captures": [
    {
      "checkpoint": "<settled-normal>",
      "check_ids": ["<AC-ID>"],
      "viewport": { "width": 1440, "height": 900 },
      "text": "<document.body.innerText or equivalent accessible visible text>"
    }
  ]
}
```

不要为每个节点截图；同一 checkpoint 的整页文本即可。验证器校验 artifact hash、task/commit、
AC/viewport 覆盖，并机械拒绝 `T106`、`T-106`、`API-203`、`FR-...` 等内部控制面编号。

## 证据范围

- 它证明声明的验收后置条件在真实环境、代表性数据、必要异常条件及所需视口下共同成立。
- 它不证明所有审美偏好或用户满意度；相关里程碑仍按需要收集用户体验意见。
- strict 项目由 `taskctl` 实际执行 allowlisted command，并在 completion event 写命令/输出 hash；
  执行前后 PAGE_SPEC `watched_paths` 必须无 staged、unstaged 或 untracked 漂移。report hash 把
  `contract_sha`、`commit_sha` 与 visible-copy artifact hash 一并绑定到 completion event。
- 后续 audit 只在 `watched_paths` 相对 receipt commit 有代码变化、当前这些路径 dirty，或契约/
  event 绑定不一致时使 receipt 失效；无关路径的提交不会让全部旧 receipt 一起失效。
- legacy 项目只做结构校验，仍由项目 CI 运行命令。runtime 与“数据确为真实”的语义仍需 gate/人核对。
