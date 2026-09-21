# T-1023 前端旅程验收

## 人话结论

- 普通临时故障仍会沿同一轮自动恢复并交付结果。
- 连续失败时，总请求数停在首次提交加三次自动恢复；页面退出转圈，保留输入并提供“继续恢复”。
- 已取得持久任务回执时，停止前端重连不会取消后台任务，页面明确说明任务和已完成内容仍保留。
- Mac 内置浏览器工具的真实 `format: "uri"` 参数已经通过聊天装配，不再在任务创建前阻断整轮生成。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1023",
  "contract_path": "docs/features/t1023-agent-recovery-liveness.md",
  "contract_sha": "5ee3d880e637",
  "commit_sha": "f2fcbb87bd7944859518d6a224336ca8771e4bca",
  "observed_at": "2026-09-21T16:16:08Z",
  "run": {
    "verify_key": "ai-nonblocking-recovery:e2e",
    "command": "CREATOROS_TEST_PORT=3442 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/ai-nonblocking-recovery.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "真实 Next.js + Chrome 旅程 4/4；持续 503 后请求停止，同轮手动继续成功，持久任务回执保持"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "Next.js 16.2.9 开发服务 + 本机 Chrome Playwright；页面、dispatch、消息会话和恢复计时器运行真实代码",
    "viewports": [
      {"width": 1280, "height": 720, "result": "pass"},
      {"width": 900, "height": 600, "result": "pass"}
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {"id": "isolated-account-runtime", "role": "每条旅程通过真实 dispatch 创建并选择隔离账号，加载真实首页和助手"},
      {"id": "controlled-chat-boundary", "role": "仅在聊天 HTTP 边界注入 503 与任务回执；消息、恢复预算、可见状态和流协议运行真实代码"}
    ]
  },
  "levels": {
    "logic": {"status": "pass", "evidence_ref": "Backend 参数桥 20/20；Frontend 装配、任务回执、组件与流 62/62；桌面打包预检 42/42"},
    "surface": {"status": "pass", "evidence_ref": "orchestrator/evidence/T-1023-visible-copy.json"},
    "journey": {"status": "pass", "evidence_ref": "真实 Chrome 完成模型缺失、一次故障恢复、持续故障收口、手动继续和持久任务保留，4/4"},
    "experience": {"status": "not-requested", "evidence_ref": "已完成自动化和安装版待验证链，不把机器结果冒充用户主观确认"}
  },
  "checks": [
    {"id": "AC-T1023-TRANSIENT-RECOVERS", "test_id": "E2E-T1023-01", "result": "pass", "evidence_ref": "首次 503 后自动恢复，第二次响应成功；两个请求复用同一个用户消息 ID"},
    {"id": "AC-T1023-NO-INFINITE-SPINNER", "test_id": "E2E-T1023-02", "result": "pass", "evidence_ref": "首次提交加三次自动恢复后显示可操作状态，额外等待两秒请求数仍为 4"},
    {"id": "AC-T1023-SAME-TURN-CONTINUE", "test_id": "E2E-T1023-03", "result": "pass", "evidence_ref": "点击继续恢复后第 5 次请求完成，全部请求中的用户消息 ID 唯一"},
    {"id": "AC-T1023-DURABLE-TASK-WAITS", "test_id": "TEST-T1023-04", "result": "pass", "evidence_ref": "组件与真实 Chrome 均证明任务回执保留，停止重连后显示后台任务和已完成内容仍保留"}
  ],
  "coverage": [
    {"condition": "single-transient-failure", "result": "pass", "evidence_ref": "一次 503 后自动完成", "reason": ""},
    {"condition": "repeated-submit-failure", "result": "pass", "evidence_ref": "连续 503 达到预算后请求停止增长", "reason": ""},
    {"condition": "durable-task-recovery", "result": "pass", "evidence_ref": "响应头任务回执跨重连保留且后台任务不被取消", "reason": ""},
    {"condition": "manual-continue", "result": "pass", "evidence_ref": "继续恢复复用原用户消息并完成", "reason": ""},
    {"condition": "component-unmount", "result": "pass", "evidence_ref": "组件卸载后推进 60 秒虚拟时间，regenerate 调用数仍为 0", "reason": ""},
    {"condition": "model-not-configured", "result": "pass", "evidence_ref": "缺模型直接显示设置入口，不进入恢复循环", "reason": ""}
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-1023-visible-copy.json",
    "artifact_sha256": "31ca9ff65595d1f54f66f8135bfba5d431fd78871f63ed261d5d2c9d9eac3b52"
  },
  "tdd_red_ref": "实现前定向组件测试出现 3 个预期失败：任务控制器没有 currentTaskId，持续故障仍找不到‘自动恢复暂未取得进展’；随后工具参数桥新增红测复现‘工具参数约束尚不支持：format’。实现后对应回归全部通过。",
  "open_defects": [],
  "status": "pass"
}
```
