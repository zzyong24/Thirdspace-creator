# T1294 浏览器验收合同

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v1",
  "task_id": "T-1294",
  "watched_paths": [
    "ai-worker/src/execution/codex-account-precheck.test.ts",
    "ai-worker/src/execution/codex-app-server-protocol.ts",
    "ai-worker/src/execution/codex-app-server.test.ts",
    "ai-worker/src/execution/codex-app-server.ts",
    "ai-worker/src/execution/codex-external-chat-native-run.test.ts",
    "ai-worker/src/execution/external-chat-worker-run.ts",
    "ai-worker/src/execution/worker-runtime.test.ts",
    "backend/src/modules/ai-runtime/local-codex-status-handoff.public.test.ts",
    "backend/src/modules/ai-runtime/local-codex-status.service.test.ts",
    "backend/src/modules/ai-runtime/local-codex-status.service.ts",
    "backend/src/modules/search/knowledge-model-routing.test.ts",
    "backend/src/modules/search/knowledge-search-runtime.service.test.ts",
    "backend/src/modules/search/knowledge-search-runtime.service.ts",
    "backend/src/modules/search/knowledge-search-timeout.test.ts",
    "backend/src/modules/settings/index.ts",
    "backend/src/modules/settings/model-routing-defaults.ts",
    "backend/src/modules/settings/model-routing.integration.test.ts",
    "backend/src/modules/settings/settings.service.ts",
    "docs/verification/t1294/browser/driver/launch-next.cjs",
    "docs/verification/t1294/browser/driver/network-deny.cjs",
    "docs/verification/t1294/browser/driver/owned-next.cjs",
    "docs/verification/t1294/browser/driver/playwright.config.cjs",
    "docs/verification/t1294/browser/driver/prepare.cjs",
    "docs/verification/t1294/run-journey.cjs",
    "frontend/src/components/shell/top-header.tsx",
    "frontend/src/features/copilot/ai-copilot-content.tsx",
    "frontend/src/features/copilot/ai-copilot-interactions.test.tsx",
    "frontend/src/features/copilot/use-assistant-engine.test.tsx",
    "frontend/src/features/copilot/use-assistant-engine.ts",
    "frontend/src/features/settings/ai-credit-entry.test.tsx",
    "frontend/src/features/settings/ai-credit-entry.tsx",
    "frontend/src/features/settings/model-capability-source.test.tsx",
    "frontend/src/features/settings/model-capability-source.tsx",
    "frontend/src/features/settings/multimodal-model-configuration.tsx",
    "frontend/src/features/settings/settings-interactive-region.test.tsx",
    "frontend/src/features/settings/settings-interactive-region.tsx",
    "frontend/src/features/settings/settings-model-region.codex.test.tsx",
    "frontend/src/features/settings/settings-model-region.tsx",
    "frontend/src/features/settings/settings-page.test.tsx",
    "frontend/src/lib/ai-error-humanize.test.ts",
    "frontend/src/lib/ai-error-humanize.ts",
    "frontend/src/server/__module_integration__/model-routing.persistence-client.test.ts",
    "frontend/src/server/persistence-client.ts",
    "frontend/src/server/settings-model-test-wrap.test.ts",
    "frontend/src/server/settings-model-test-wrap.ts",
    "frontend/tests/e2e/t1294-model-settings-and-codex-chat.spec.ts"
  ],
  "required_checks": [
    {
      "id": "official-default",
      "test_id": "T1294 fresh默认官方，设置无向量/独立图片理解与数据服务分类，充值常驻"
    },
    {
      "id": "image-sources",
      "test_id": "T1294 已保存混合图片与自配选择重开保留，主动改图片同次CAS只统一vision/image"
    },
    {
      "id": "cas-conflict",
      "test_id": "T1294 实际CAS冲突不覆盖其它窗口保存，原草稿与失败提示保留"
    },
    {
      "id": "redfox-keys",
      "test_id": "T1294 RedFox在模型页实际保存/掩码/重开/删除，旧深链仍可达且零查询费用"
    },
    {
      "id": "keyword-search",
      "test_id": "T1294 旧向量测试明确停用，真实资料创建/修订/搜索保原文与组隔离"
    },
    {
      "id": "recharge",
      "test_id": "T1294 常驻充值按钮走原空body受控POST，缺官方配置诚实失败且零资金新操作"
    },
    {
      "id": "layout-desktop",
      "test_id": "T1294 设置与助手 desktop 可读可操作且无画布/检查横条"
    },
    {
      "id": "layout-narrow",
      "test_id": "T1294 设置与助手 narrow 可读可操作且无画布/检查横条"
    },
    {
      "id": "layout-200",
      "test_id": "T1294 设置与助手 CSS640x450/DSF2等效200% 可读可操作且无画布/检查横条"
    },
    {
      "id": "codex-chat",
      "test_id": "T1294 唯一新本地Codex对话：设置检查一次→直接发送→四ID同任务完成并可读，unknown不重发"
    }
  ],
  "required_conditions": [
    "保存后读回",
    "冲突保留草稿",
    "错组隔离",
    "失败保留原任务",
    "不重复检查与重发",
    "桌面窄屏与等效200%"
  ],
  "viewports": [
    {
      "width": 1536,
      "height": 1024
    },
    {
      "width": 390,
      "height": 844
    },
    {
      "width": 640,
      "height": 450
    }
  ],
  "coherence_groups": [],
  "limitations": [
    "仅浏览器与受控真实本地Codex测试；原生App自动化未授权",
    "原失败任务不重发；未证明上游间歇RPC拒绝的唯一根因"
  ]
}
```
