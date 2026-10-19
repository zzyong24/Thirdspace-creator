# T-1298 公共旅程验收映射

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v1",
  "task_id": "T-1298",
  "watched_paths": [
    "ai-worker/src/execution/codex-app-server.ts",
    "ai-worker/src/execution/external-chat-worker-run.ts",
    "frontend/src/features/article/article-workbench.tsx",
    "frontend/src/features/projects/graphic-post-workbench.tsx",
    "frontend/src/features/copilot/chat-work-editor-card.tsx",
    "frontend/tests/e2e/t1298-script-first-live-acceptance.spec.ts",
    "docs/verification/t1298/run-journey.cjs",
    "docs/verification/t1298/browser/driver/owned-next.cjs",
    "docs/verification/t1298/browser/driver/launch-next.cjs",
    "docs/verification/t1298/browser/driver/playwright.config.cjs",
    "docs/verification/t1298/browser/driver/network-deny.cjs",
    "docs/verification/t1298/browser/driver/prepare.cjs",
    "frontend/src/features/copilot/ai-copilot-content.tsx"
  ],
  "required_checks": [
    {
      "id": "real-script-platform-adoption",
      "test_id": "T1298 真实模型重组与对话校正均可采纳，刷新后平台独立且原稿不变"
    }
  ],
  "required_conditions": [
    "真实模型读取原稿并重组两平台",
    "真实候选预览与采纳保存、精确版本及刷新读回",
    "对话校正后脚本与另一平台不变",
    "候选简化预览与主稿一致、两种桌面宽度可用"
  ],
  "viewports": [
    {
      "width": 1536,
      "height": 1024
    },
    {
      "width": 1280,
      "height": 800
    }
  ],
  "coherence_groups": [],
  "limitations": [
    "未做ASR或图片生成；剪辑公共旅程复用同源码T1296证据",
    "未安装、部署或替换用户现用App"
  ]
}
```
