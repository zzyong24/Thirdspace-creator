# GATE-T604-BUILD — CreatorOS 渠道托管模型权威

- Task：T-604
- SPEC review：`PASS[REV:cb247fde42d4]`
- 结论：CreatorOS 侧 BUILD PASS；跨系统 SHIP 保留 `HARD-MAUTH-001`

## 已实现

- Rust release build 固化 `managed_locked`，sidecar runtime env 不能覆盖；
- 已验签加密 LKG 投影为 server-only 模型权威；
- 设置 list/put/test/import/export 与 service escape hatch 共用服务端 guard；
- 设置页托管态只展示“渠道托管”卡，不渲染保存、测试、导入或导出控件；
- task `modelKey`、文本、多模态、生图、视频、ASR、Embedding、搜索统一经
  `EffectiveModelConfigPort`；
- 短期 Gateway session 有 TTL 与 capability/alias/entitlement binding 校验；
- Growth exact Gateway adapter 未交付时使用 typed fail-closed，零网络、零本地 Key 回退。

## Fresh evidence

1. Backend focused：
   `pnpm exec vitest run src/modules/ai-runtime/model-authority.test.ts src/modules/settings/settings.service.test.ts --reporter=verbose`
   → 2 files / 20 tests PASS。
2. Frontend parser + UI：
   `pnpm exec vitest run src/server/activation/client-config.server.test.ts src/features/settings/settings-page.test.tsx --reporter=verbose`
   → 2 files / 37 tests PASS。
3. Settings test/transfer：
   `pnpm exec vitest run src/server/settings-model-test-wrap.test.ts src/app/api/v1/settings-transfer/models/route.test.ts --reporter=verbose`
   → wrapper 25 tests PASS；transfer route 独立复跑 8 tests PASS（含托管 import 409）。
4. Contract：
   `pnpm exec vitest run tests/envelope.test.ts --reporter=verbose`
   → 1 file / 5 tests PASS，`MODEL_CONFIGURATION_MANAGED → HTTP 409`。
5. Typecheck：
   `pnpm --filter @creatoros/backend typecheck`、`pnpm --filter creatoros-frontend typecheck`
   → PASS。
6. Desktop：
   `cargo check`
   → PASS（仅既有 `decoy_gate.rs` dead-code warning）。

## 保留风险

Growth/AM/AI Gateway 尚未提供 reviewed exact session/call contract，因此 CreatorOS 当前能安全锁定、
验签、展示和拒绝旁路，但托管模型实际调用会返回 `MANAGED_GATEWAY_UNAVAILABLE`。不得把这一
Creator-only BUILD 结果表述为线上渠道模型已经可用。
