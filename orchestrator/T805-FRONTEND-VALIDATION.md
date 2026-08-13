# T-805 AI 分场失败恢复体验验收报告

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-805",
  "contract_path": "orchestrator/T805-FRONTEND-JOURNEY.md",
  "contract_sha": "d8545552427c",
  "commit_sha": "22f31f2e761785b85da10a816a50e272e776af80",
  "observed_at": "2026-08-13T12:02:24Z",
  "run": {
    "verify_key": "ai-reliability-recovery:e2e",
    "command": "CREATOROS_TEST_PORT=3434 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/ai-reliability-recovery.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "Playwright：1 passed（真实 Chrome，隔离 PGlite，17.9s）"
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
      { "id": "terminal-video-task", "role": "真实执行并进入 cancelled 终态的视频决策任务，刷新后由任务列表恢复" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "121 项聚焦测试通过；前后端 TypeScript 检查通过" },
    "surface": { "status": "pass", "evidence_ref": "失败信息为人话、原因先于继续按钮；常规与紧凑视口截图肉眼检查无重叠" },
    "journey": { "status": "pass", "evidence_ref": "真实项目 → 上传视频/SRT → 真实失败 → 刷新 → 紧凑视口 → 继续上次分场完整通过" },
    "experience": { "status": "pass", "evidence_ref": "走查修正了重复保留提示与按钮/原因顺序；最终卡片只保留发生原因、保留规则和下一步" }
  },
  "checks": [
    { "id": "AC-HUMAN-FAILURE-COPY", "test_id": "E2E-T805-01", "result": "pass", "evidence_ref": "页面不出现 provider、HTTP、端点等机器错误，显示可行动的人话" },
    { "id": "AC-REFRESH-RECOVERS-RETRY", "test_id": "E2E-T805-02", "result": "pass", "evidence_ref": "page.reload 后仍恢复最新失败任务与继续入口" },
    { "id": "AC-COMPACT-NEXT-ACTION", "test_id": "E2E-T805-03", "result": "pass", "evidence_ref": "1024×768 下继续按钮可见可点，create 请求携带真实 retryOfTaskId" }
  ],
  "coverage": [
    { "condition": "real-chromium", "result": "pass", "evidence_ref": "Google Chrome 151 真实运行" },
    { "condition": "real-terminal-ai-task", "result": "pass", "evidence_ref": "隔离数据库中 video.decisions 真实进入 cancelled" },
    { "condition": "page-refresh", "result": "pass", "evidence_ref": "刷新后通过任务列表与步骤流重建失败上下文" },
    { "condition": "regular-and-compact-viewports", "result": "pass", "evidence_ref": "1536×1024 与 1024×768 均完成操作并经截图走查" }
  ],
  "tdd_red_ref": "新增组件测试在旧实现下暴露 provider 503 原样显示、按钮仍叫 AI 分场决策、挂载不恢复 cancelled；runner 测试暴露原始端点错误与封面 503 重试无用户步骤。实现后全部转绿。",
  "open_defects": [],
  "status": "pass"
}
```
