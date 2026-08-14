# T-836 前端旅程验收报告

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-836",
  "contract_path": "orchestrator/T836-FRONTEND-JOURNEY.md",
  "contract_sha": "4e28291796a9",
  "commit_sha": "a14e501ff8e87c1830bc51bba0161933800e35cc",
  "observed_at": "2026-08-14T15:01:00.000Z",
  "run": {
    "verify_key": "semantic-material-generation:e2e",
    "command": "CREATOROS_TEST_PORT=3436 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/semantic-material-generation.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "orchestrator/T836-BUILD-VALIDATION.md#红绿证据"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "Google Chrome + Next.js local isolated E2E runtime",
    "viewports": [
      {"width": 1536, "height": 1024, "result": "pass"},
      {"width": 1024, "height": 768, "result": "pass"}
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {"id": "semantic-material-project", "role": "current-confirmed-script"}
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "backend chat-runner/chat-tools focused tests: 343 passed"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "orchestrator/evidence/T-836-visible-copy.json"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "Playwright E2E-MATERIAL-GENERATE-01: 1 passed"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "沿用用户截图中的现有快捷按钮视觉语言，未声称完成额外人工审美签字"
    }
  },
  "checks": [
    {
      "id": "AC-MATERIAL-BUTTONS",
      "test_id": "E2E-MATERIAL-GENERATE-01",
      "result": "pass",
      "evidence_ref": "两档窗口真实显示生成图片素材与生成视频素材"
    },
    {
      "id": "AC-IMAGE-SEMANTIC-PREFILL",
      "test_id": "E2E-MATERIAL-GENERATE-01",
      "result": "pass",
      "evidence_ref": "图片入口预填先读取当前确认稿且无内部工具名"
    },
    {
      "id": "AC-VIDEO-SEMANTIC-PREFILL",
      "test_id": "E2E-MATERIAL-GENERATE-01",
      "result": "pass",
      "evidence_ref": "视频入口预填先读取当前确认稿与连续短镜头要求"
    },
    {
      "id": "AC-MATERIAL-NO-AUTO-SEND",
      "test_id": "E2E-MATERIAL-GENERATE-01",
      "result": "pass",
      "evidence_ref": "两次点击前后消息数保持不变"
    }
  ],
  "coverage": [
    {"condition": "confirmed-script", "result": "pass", "evidence_ref": "隔离数据库创建并加载真实当前稿版本"},
    {"condition": "image", "result": "pass", "evidence_ref": "图片按钮与图片语义预填通过"},
    {"condition": "video", "result": "pass", "evidence_ref": "视频按钮与连续镜头预填通过"},
    {"condition": "minimum-window", "result": "pass", "evidence_ref": "1024x768 从真实打开 AI 助手入口恢复并通过"}
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-836-visible-copy.json",
    "artifact_sha256": "3e2fe1a745a9e3214178e7820bca840ddf40a9d0047da730695a377f6c196636"
  },
  "tdd_red_ref": "orchestrator/T836-BUILD-VALIDATION.md#红绿证据",
  "open_defects": [],
  "status": "pass"
}
```
