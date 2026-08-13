# T-804 前端真实旅程验收报告

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-804",
  "contract_path": "orchestrator/T804-FRONTEND-JOURNEY.md",
  "contract_sha": "f9342c501fba",
  "commit_sha": "cf3d838f52c380a687ae228473e415106ef005c2",
  "observed_at": "2026-08-13T11:07:45Z",
  "run": {
    "verify_key": "ai-reliability-recovery:e2e",
    "command": "CREATOROS_TEST_PORT=3434 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/ai-reliability-recovery.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "Playwright：1 passed（真实 Chrome，隔离 PGlite，17.3s）"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Google Chrome 151.0.7922.110 / Playwright / Next.js 16.2.9",
    "viewports": [
      { "width": 1536, "height": 1024, "result": "pass" },
      { "width": 1024, "height": 768, "result": "pass" }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      { "id": "isolated-project", "role": "浏览器旅程中新建的真实项目、正式脚本与上传素材" },
      { "id": "terminal-video-task", "role": "真实执行并进入 cancelled 终态的视频决策任务" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "网络请求断言首次无来源、重试携带真实来源任务 ID" },
    "surface": { "status": "pass", "evidence_ref": "制作页失败信息可见，常规与紧凑窗口按钮均可操作" },
    "journey": { "status": "pass", "evidence_ref": "真实项目 → 上传视频/SRT → 失败终态 → 停轮询 → 显式重试完整通过" },
    "experience": { "status": "not-requested", "evidence_ref": "本轮为可靠性修复，未冒充用户审美确认" }
  },
  "checks": [
    { "id": "AC-FAILURE-VISIBLE", "test_id": "E2E-T804-01", "result": "pass", "evidence_ref": "production-decisions 区域显示失败终态" },
    { "id": "AC-TERMINAL-STOPS-POLLING", "test_id": "E2E-T804-02", "result": "pass", "evidence_ref": "等待 4.5 秒超过首个 4 秒轮询周期，ai.tasks.get 请求计数保持不变" },
    { "id": "AC-RETRY-CARRIES-SOURCE", "test_id": "E2E-T804-03", "result": "pass", "evidence_ref": "紧凑窗口再次点击后 create 请求带 retryOfTaskId=真实终态任务" }
  ],
  "coverage": [
    { "condition": "real-chromium", "result": "pass", "evidence_ref": "Google Chrome 151 真实运行" },
    { "condition": "real-terminal-ai-task", "result": "pass", "evidence_ref": "隔离数据库中 video.decisions 真实执行并进入 cancelled" },
    { "condition": "no-external-model-call", "result": "pass", "evidence_ref": "以无效 SRT 在备料阶段确定性失败，未进入模型节点" },
    { "condition": "regular-and-compact-viewports", "result": "pass", "evidence_ref": "1536×1024 与 1024×768 均完成断言" }
  ],
  "tdd_red_ref": "首次真实旅程暴露测试误判按钮 disabled 与 mock envelope 缺 meta；修正测试契约后，旧实现仍由 retryOfTaskId 网络断言和终态请求计数捕获，新实现转绿。",
  "open_defects": [],
  "status": "pass"
}
```
