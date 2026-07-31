# GATE-T641-BUILD — ASR 建议配置与本地 Whisper 回退

结论：BUILD PASS。云端 ASR 仍在重点模型配置区并推荐使用；完全未配置时，后台渐进回填和
手动转写都继续使用本地 Whisper，不再阻断用户。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-641",
  "contract_path": "docs/superpowers/specs/2026-07-31-asr-recommended-local-fallback.md",
  "contract_sha": "1ce4d8ec417e",
  "commit_sha": "736eeaf77f531b65427c31449249ef7781d4e1d9",
  "observed_at": "2026-07-31T16:10:53.000Z",
  "run": {
    "verify_key": "asr-configuration:e2e",
    "command": "CREATOROS_TEST_PORT=3428 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/asr-configuration.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "Node 25 / Playwright e2e：1 passed；合并后主线在 1536×1024 与 1024×768 均验证建议配置文案、MiMo 预设与高级设置"
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
    "logic": { "status": "pass", "evidence_ref": "后端解析测试覆盖云端优先、本地回退和非法级别归一；排队测试覆盖未配云端仍按 5 条小批创建任务" },
    "surface": { "status": "pass", "evidence_ref": "E2E 两档窗口均展示建议配置与本地 Whisper 仍可用的自然语言说明" },
    "journey": { "status": "pass", "evidence_ref": "未配置可继续本地转录；选择 MiMo 后自动带出模型和接口并可保存" },
    "experience": { "status": "not-requested", "evidence_ref": "等待最终统一安装包由用户做主观体验确认" }
  },
  "checks": [
    { "id": "AC-ASR-PRESET", "test_id": "E2E-ASR-CONFIG-01", "result": "pass", "evidence_ref": "选择小米 MiMo 自动带出 mimo-v2.5-asr 与默认接口" },
    { "id": "AC-ASR-RECOMMENDED", "test_id": "E2E-ASR-CONFIG-01", "result": "pass", "evidence_ref": "页面明确说明建议配置以避免本地转录过慢，未配置仍可使用本地 Whisper" },
    { "id": "AC-ASR-ADVANCED", "test_id": "E2E-ASR-CONFIG-01", "result": "pass", "evidence_ref": "provider/baseUrl 仅在高级设置展开后出现" },
    { "id": "AC-ASR-NARROW", "test_id": "E2E-ASR-CONFIG-01", "result": "pass", "evidence_ref": "1024×768 卡片完整可见且无横向溢出" }
  ],
  "coverage": [
    { "condition": "unconfigured", "result": "pass", "evidence_ref": "无云端 ASR 时解析为 whisper-local，后台仍创建最多 5 条的小批任务", "reason": "" },
    { "condition": "preset", "result": "pass", "evidence_ref": "MiMo 预设自动填写模型与接口，普通路径只需 Key", "reason": "" },
    { "condition": "narrow", "result": "pass", "evidence_ref": "1024×768 E2E 页面无横向溢出", "reason": "" }
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-641-visible-copy.json",
    "artifact_sha256": "8f8c72956afb6c1d20461de5f0c273518feb93610e0f4a1bc398cdbf13eac062"
  },
  "tdd_red_ref": "红测先捕获未配置仍抛 TranscribeConfigError、后台配置闸阻止排队、设置页仍写必配和测试连接误报云端连通",
  "open_defects": [],
  "status": "pass"
}
```

## 其他验证

- backend：2 files / 39 tests PASS；frontend：4 files / 77 tests PASS。
- backend、ai-worker、frontend typecheck：PASS；目标 ESLint：PASS。
- boundary：无新增违规；`git diff --check`：PASS。
- 合并后主线重新执行对应 E2E，并在完成项归档后运行 reconcile：0 error / 0 warning。
