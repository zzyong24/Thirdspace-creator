# T-731 V1 安全闭环旅程契约

安全边界主要由后端、Rust 与对抗测试验收；真实浏览器旅程验证设置页仍能完成模型配置交互，
且常规与最小窗口均无回归。本轮不使用真实模型 Key，也不产生额度消费。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v1",
  "task_id": "T-731",
  "required_checks": [
    { "id": "AC-SEC-TRUST", "test_id": "SEC-T731-01" },
    { "id": "AC-SEC-KEYRING", "test_id": "SEC-T731-02" },
    { "id": "AC-SEC-SIDEEFFECT", "test_id": "SEC-T731-03" },
    { "id": "AC-SEC-ASR", "test_id": "SEC-T731-04" },
    { "id": "AC-SEC-BROWSER", "test_id": "E2E-T731-05" }
  ],
  "required_conditions": [
    "loopback-fail-closed",
    "keyring-only",
    "side-effect-approval",
    "asr-usage-tracking",
    "normal-viewport",
    "minimum-viewport"
  ],
  "watched_paths": [
    "ai-worker/src/runtime/child-env.ts",
    "ai-worker/src/runtime/multimodal-whisper-local.ts",
    "backend/drizzle/0068_keyring_only_credentials.sql",
    "backend/drizzle/0069_asr_usage_intents.sql",
    "backend/src/modules/ai-runtime",
    "backend/src/modules/assets",
    "backend/src/modules/execution",
    "backend/src/modules/settings",
    "backend/src/secret-crypto.ts",
    "frontend/next.config.ts",
    "frontend/src-tauri/src/lib.rs",
    "frontend/src-tauri/capabilities",
    "frontend/src/app/api/v1/local/diagnostics",
    "frontend/src/app/api/v1/local/handshake-session",
    "frontend/src/features/copilot/ai-copilot-content.tsx",
    "frontend/src/features/copilot/chat-effect-approval-card.tsx",
    "frontend/src/lib/loopback-core.ts",
    "frontend/src/lib/loopback-guard.server.ts",
    "frontend/src/server/activation/managed-asr.server.ts",
    "frontend/src/server/activation/managed-credential-lease.server.ts",
    "frontend/src/server/ingestion",
    "frontend/src/server/persistence-client.ts"
  ],
  "viewports": [
    { "width": 1536, "height": 1024 },
    { "width": 1024, "height": 768 }
  ],
  "coherence_groups": []
}
```
