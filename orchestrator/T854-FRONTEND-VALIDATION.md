# T-854 前端旅程验收报告

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-854",
  "contract_path": "orchestrator/T854-FRONTEND-JOURNEY.md",
  "contract_sha": "fd51d5ffd262",
  "commit_sha": "f059f5cd53937ef24c76a19526a33db3eee43f08",
  "observed_at": "2026-08-16T13:56:32.000Z",
  "run": {
    "verify_key": "semantic-material-generation:e2e",
    "command": "CREATOROS_TEST_PORT=3436 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/semantic-material-generation.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "orchestrator/T854-BUILD-VALIDATION.md#红绿证据"
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
      {"id": "semantic-material-project", "role": "current-confirmed-multi-paragraph-script"}
    ]
  },
  "levels": {
    "logic": {
      "status": "pass",
      "evidence_ref": "组件红绿测试 10/10 通过，图片与视频共享同一份预填常量"
    },
    "surface": {
      "status": "pass",
      "evidence_ref": "orchestrator/evidence/T-854-visible-copy.json"
    },
    "journey": {
      "status": "pass",
      "evidence_ref": "Playwright E2E-MATERIAL-GENERATE-COUNT-01: 1 passed"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "沿用现有快捷按钮视觉；本任务只调整明确的生成边界，不声称完成额外审美签字"
    }
  },
  "checks": [
    {
      "id": "AC-MATERIAL-BUTTONS",
      "test_id": "E2E-MATERIAL-GENERATE-COUNT-01",
      "result": "pass",
      "evidence_ref": "两档窗口真实显示生成图片素材与生成视频素材"
    },
    {
      "id": "AC-IMAGE-MULTI-SEGMENT-PREFILL",
      "test_id": "E2E-MATERIAL-GENERATE-COUNT-01",
      "result": "pass",
      "evidence_ref": "图片入口要求按整稿篇幅选择多个不重复段落并为每段各生成一张"
    },
    {
      "id": "AC-VIDEO-SINGLE-DEFAULT-PREFILL",
      "test_id": "E2E-MATERIAL-GENERATE-COUNT-01",
      "result": "pass",
      "evidence_ref": "视频入口明确默认一个连续短镜头候选、控制成本且仅显式要求时增加"
    },
    {
      "id": "AC-MATERIAL-NO-AUTO-SEND",
      "test_id": "E2E-MATERIAL-GENERATE-COUNT-01",
      "result": "pass",
      "evidence_ref": "两次点击前后消息数保持不变，没有发起付费生成"
    }
  ],
  "coverage": [
    {"condition": "confirmed-multi-paragraph-script", "result": "pass", "evidence_ref": "隔离数据库创建并加载三段真实当前稿版本"},
    {"condition": "image-multiple", "result": "pass", "evidence_ref": "图片入口的动态篇幅、多段、每段一图话术通过"},
    {"condition": "video-single-default", "result": "pass", "evidence_ref": "视频入口的单条默认与成本边界通过"},
    {"condition": "minimum-window", "result": "pass", "evidence_ref": "1024x768 从真实打开 AI 助手入口恢复并通过"}
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-854-visible-copy.json",
    "artifact_sha256": "70964fc47803282d1fffa33b3693e1f5f371ee52c93c31c47a4712d155294b9a"
  },
  "tdd_red_ref": "orchestrator/T854-BUILD-VALIDATION.md#红绿证据",
  "open_defects": [],
  "status": "pass"
}
```
