# T-806 直接错误与证据归因验收报告

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-806",
  "contract_path": "orchestrator/T806-FRONTEND-JOURNEY.md",
  "contract_sha": "f0e6853e6897",
  "commit_sha": "8d176bbf337f59b73c88a8001f520c6b37e8f0d7",
  "observed_at": "2026-08-13T12:27:48Z",
  "run": {
    "verify_key": "ai-reliability-recovery:e2e",
    "command": "CREATOROS_TEST_PORT=3434 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/ai-reliability-recovery.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "Playwright：1 passed（真实 Chrome，隔离 PGlite，17.2s）"
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
      { "id": "terminal-video-task", "role": "无效字幕使真实视频决策任务进入 cancelled，错误由任务步骤与终态持久化" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "250 项后端聚焦测试与 31 项制作页测试通过；前后端 TypeScript 检查通过" },
    "surface": { "status": "pass", "evidence_ref": "常规与紧凑视口均显示摘要、脱敏原始错误、复制错误和继续入口；截图肉眼检查无重叠" },
    "journey": { "status": "pass", "evidence_ref": "真实项目 → 上传视频/字幕 → 真实失败 → 直接错误可见 → 刷新恢复 → 紧凑视口 → 继续上次分场完整通过" },
    "experience": { "status": "pass", "evidence_ref": "原始错误不再被人话摘要吞掉；主结论、诊断细节与下一步形成清楚层级" }
  },
  "checks": [
    { "id": "AC-REDACTED-RAW-ERROR-VISIBLE", "test_id": "E2E-T806-01", "result": "pass", "evidence_ref": "错误卡直接显示 SRT 解析原始原因与复制入口；密钥、Bearer 与私有 URL 由单测验证不会外泄" },
    { "id": "AC-REFRESH-PRESERVES-DIAGNOSTIC", "test_id": "E2E-T806-02", "result": "pass", "evidence_ref": "page.reload 后同一脱敏原始错误、保留说明与继续入口仍在" },
    { "id": "AC-EVIDENCE-ONLY-SYSTEM-DIAGNOSIS", "test_id": "TEST-T806-03", "result": "pass", "evidence_ref": "编导系统规则与任务真值测试要求引用具体错误；无运行时证据时只能说明原因未确认" }
  ],
  "coverage": [
    { "condition": "real-chromium", "result": "pass", "evidence_ref": "Google Chrome 151 真实运行" },
    { "condition": "real-terminal-ai-task", "result": "pass", "evidence_ref": "隔离数据库中 video.decisions 真实执行并进入 cancelled" },
    { "condition": "secret-redaction", "result": "pass", "evidence_ref": "封面、视频分场与聊天任务真值测试注入 sk 密钥、Token、Bearer 和私有 URL，用户侧只出现 [REDACTED]" },
    { "condition": "page-refresh", "result": "pass", "evidence_ref": "刷新后通过真实任务列表与步骤流重建同一错误详情" },
    { "condition": "regular-and-compact-viewports", "result": "pass", "evidence_ref": "1536×1024 与 1024×768 均完成断言并输出截图" }
  ],
  "tdd_red_ref": "旧实现只留下人话摘要、不保存终态错误、取消任务不进入聊天真值且编导没有证据归因约束；新增 runner、上下文、编导和制作页测试先失败。实现中新增防泄漏测试又抓到摘要仍泄露密钥，修正摘要与原始详情共用脱敏边界后全部转绿。",
  "open_defects": [],
  "status": "pass"
}
```
