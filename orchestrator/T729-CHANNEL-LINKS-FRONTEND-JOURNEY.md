# T-729 渠道包公开入口真实浏览器旅程契约

本契约只验证包级链接、反馈目标和降级边界，不评价或修改视觉设计。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v1",
  "task_id": "T-729",
  "required_checks": [
    { "id": "AC-PACKAGE-LINKS-E2E", "test_id": "E2E-T729-01" },
    { "id": "AC-PACKAGE-MANIFEST", "test_id": "VITEST-T729-02" },
    { "id": "AC-FEEDBACK-AUTHORITY", "test_id": "VITEST-T729-03" },
    { "id": "AC-NO-VISUAL-DRIFT", "test_id": "GIT-T729-04" }
  ],
  "required_conditions": [
    "real-zhisu-package-environment",
    "current-package-website-only",
    "current-package-human-feedback-only",
    "normal-viewport",
    "minimum-viewport",
    "no-visual-style-or-baseline-change"
  ],
  "watched_paths": [
    "frontend/branding/packages/zhisu-ai/package.json",
    "frontend/scripts/desktop/package-flavor.mjs",
    "frontend/src/lib/package-brand.ts",
    "frontend/src/lib/desktop-updater.ts",
    "frontend/src/features/settings/settings-interactive-region.tsx",
    "frontend/src/components/shell/issue-feedback-dialog.tsx",
    "frontend/src/server/feedback/product-feedback.server.ts",
    "frontend/tests/e2e/channel-public-links.spec.ts"
  ],
  "viewports": [
    { "width": 1440, "height": 900 },
    { "width": 1024, "height": 720 }
  ],
  "coherence_groups": [],
  "honesty": [
    "真实 Chrome 旅程只证明浏览器 bundle 与 DOM 目标，不能冒充签名安装包真机点击",
    "渠道包缺少本包入口时必须保持空，不能偷回 CreatorOS 官方入口",
    "远端更新 manifest 只能提供 version/notes，任何重定向必须失败关闭",
    "本任务不修改 CSS、布局、图标、颜色或视觉快照"
  ]
}
```
