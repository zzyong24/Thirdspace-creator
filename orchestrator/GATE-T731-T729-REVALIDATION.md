# T-731 安全闭环前端旅程复验

T-729 只收紧了 `frontend/next.config.ts` 的反馈 API authority，并未放宽 T-731 的 WebView、凭据或
副作用边界。本报告在当前候选 HEAD 重跑既有模型设置旅程，换发 T-731 的当前回执。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-731",
  "contract_path": "orchestrator/T731-FRONTEND-JOURNEY.md",
  "contract_sha": "8c906b54ba58",
  "commit_sha": "5f931f78acebcb942a11c9ab46fbd675c64f8bde",
  "observed_at": "2026-08-09T08:27:21.000Z",
  "run": {
    "verify_key": "asr-configuration:e2e",
    "command": "CREATOROS_TEST_PORT=3428 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/asr-configuration.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "taskctl 在当前 HEAD 重跑真实 Chrome 设置页旅程并记录输出哈希"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Google Chrome 真实进程 + Next.js + 隔离 PGlite 应用服务",
    "viewports": [
      { "width": 1536, "height": 1024, "result": "pass" },
      { "width": 1024, "height": 768, "result": "pass" }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      { "id": "isolated-pglite-model-settings", "role": "隔离数据库中的代表性模型设置与真实服务链；不含真实 Key" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "T-731 聚焦安全、凭据、ASR 与副作用测试既有回执保持有效；T-729 反馈 authority 聚焦 60 tests 通过" },
    "surface": { "status": "pass", "evidence_ref": "真实 Chrome 双窗口模型配置卡可见且可交互" },
    "journey": { "status": "pass", "evidence_ref": "设置页进入模型配置、选择 ASR 预设、填写测试占位值、展开高级项与最小窗口检查连续通过" },
    "experience": { "status": "not-requested", "evidence_ref": "本次只做安全回执复验，不变更产品视觉" }
  },
  "checks": [
    { "id": "AC-SEC-TRUST", "test_id": "SEC-T731-01", "result": "pass", "evidence_ref": "loopback、SSRF、localfs、sandbox 与子进程环境对抗测试通过" },
    { "id": "AC-SEC-KEYRING", "test_id": "SEC-T731-02", "result": "pass", "evidence_ref": "长期凭据仅存系统凭据库；迁移失败保留旧唯一副本并拒绝生产读取" },
    { "id": "AC-SEC-SIDEEFFECT", "test_id": "SEC-T731-03", "result": "pass", "evidence_ref": "付费与持久化工具必须绑定审批、规范化参数和一次性消费" },
    { "id": "AC-SEC-ASR", "test_id": "SEC-T731-04", "result": "pass", "evidence_ref": "0069 usage intent 与补偿状态聚焦测试通过；未发起真实计费" },
    { "id": "AC-SEC-BROWSER", "test_id": "E2E-T731-05", "result": "pass", "evidence_ref": "taskctl 重跑 asr-configuration:e2e" }
  ],
  "coverage": [
    { "condition": "loopback-fail-closed", "result": "pass", "evidence_ref": "启动级随机 blob 信任根、HttpOnly 握手与逐跳 SSRF 校验测试通过" },
    { "condition": "keyring-only", "result": "pass", "evidence_ref": "长期凭据仅存系统凭据库；迁移失败保留旧唯一副本并拒绝生产读取" },
    { "condition": "side-effect-approval", "result": "pass", "evidence_ref": "付费与持久化工具必须绑定审批、规范化参数和一次性消费" },
    { "condition": "asr-usage-tracking", "result": "pass", "evidence_ref": "0069 usage intent 与补偿状态聚焦测试通过" },
    { "condition": "normal-viewport", "result": "pass", "evidence_ref": "Chrome 1536x1024" },
    { "condition": "minimum-viewport", "result": "pass", "evidence_ref": "Chrome 1024x768" }
  ],
  "tdd_red_ref": "独立上线前审计报告记录可推导 blob HMAC、CSP/握手暴露、SSRF、LLM 副作用同域与长期 Key 存储等发布阻断；各项均先由对抗测试稳定复现",
  "open_defects": [],
  "status": "pass"
}
```
