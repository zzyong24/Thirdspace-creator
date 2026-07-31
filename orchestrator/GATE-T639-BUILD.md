# GATE-T639-BUILD — ASR 必配、渐进补齐与小米 MiMo 接入

结论：BUILD PASS。ASR 卡默认只需选择预设、确认模型名和填写 Key；小米 MiMo 走独立协议适配。
历史作品全部入库，但每轮只为最多 5 条缺稿作品创建一个后台任务，未配置 ASR 时不盲目排队。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-639",
  "contract_path": "docs/superpowers/specs/2026-07-31-gradual-transcript-backfill-and-mimo-asr.md",
  "contract_sha": "e0ab14ac3657",
  "commit_sha": "bd137c1c2504e53ece13e2ddfa6b5488aeb0c4f6",
  "observed_at": "2026-07-31T14:37:41.000Z",
  "run": {
    "verify_key": "asr-configuration:e2e",
    "command": "CREATOROS_TEST_PORT=3428 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/asr-configuration.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "Playwright e2e：1 passed；两档窗口验证小米预设、必配提示与高级设置收放"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "Google Chrome stable / Playwright 1.60",
    "viewports": [
      { "width": 1536, "height": 1024, "result": "pass" },
      { "width": 1024, "height": 768, "result": "pass" }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      { "id": "settings-provider-mimo", "role": "isolated-pglite-model-setting" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "前后端与 AI Worker 测试覆盖 5 条批次、未配置暂停、MiMo 请求响应与长音频分段" },
    "surface": { "status": "pass", "evidence_ref": "E2E：常规/最小窗口均只暴露预设、模型、Key，技术参数可展开" },
    "journey": { "status": "pass", "evidence_ref": "选择小米预设 → 自动带出模型 → 展开高级设置 → 旧配置仍可回显" },
    "experience": { "status": "not-requested", "evidence_ref": "等待用户在最终安装版进行主观体验确认" }
  },
  "checks": [
    { "id": "AC-ASR-PRESET", "test_id": "E2E-ASR-CONFIG-01", "result": "pass", "evidence_ref": "选择小米 MiMo 自动带出 mimo-v2.5-asr 与默认接口" },
    { "id": "AC-ASR-REQUIRED", "test_id": "E2E-ASR-CONFIG-01", "result": "pass", "evidence_ref": "页面明确显示语音转文字必配，未配会暂停后台补齐" },
    { "id": "AC-ASR-ADVANCED", "test_id": "E2E-ASR-CONFIG-01", "result": "pass", "evidence_ref": "provider/baseUrl 仅在高级设置展开后出现" },
    { "id": "AC-ASR-NARROW", "test_id": "E2E-ASR-CONFIG-01", "result": "pass", "evidence_ref": "1024x768 卡片完整可见且无横向溢出" }
  ],
  "coverage": [
    { "condition": "unconfigured", "result": "pass", "evidence_ref": "无 ASR 配置时后台排队数为 0，手动转写返回配置引导", "reason": "" },
    { "condition": "preset", "result": "pass", "evidence_ref": "MiMo 预设自动填写模型与接口，用户只需 Key", "reason": "" },
    { "condition": "narrow", "result": "pass", "evidence_ref": "1024x768 E2E 页面无横向溢出", "reason": "" }
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-639-visible-copy.json",
    "artifact_sha256": "3ef94963a4187e6f48efe2954300e9b72ea4b1276d747de965c497ea6f77f87f"
  },
  "tdd_red_ref": "红测曾捕获 40 条作品一次性排满、未配置 ASR 仍创建任务、MiMo 被误送旧 transcription 协议及设置页技术字段过载",
  "open_defects": [],
  "status": "pass"
}
```

## 其他验证

- 前端聚焦测试：10 files / 141 tests PASS；后端 2 files / 38 tests PASS；AI Worker 3 tests PASS；
- frontend/backend/ai-worker typecheck：PASS；reconcile：PASS；
- ASR 真实页面 E2E：1 passed（1536×1024 与 1024×768）。
