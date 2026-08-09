# T-729 前端零错误发布门旅程契约

本契约只验证 ESLint 清零改动没有破坏真实页面旅程。它不把机器检查冒充视觉重设计验收；
逻辑层由全仓 lint、类型检查和聚焦组件测试负责，表面与旅程层由真实 Chrome 运行负责。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v1",
  "task_id": "T-729",
  "required_checks": [
    { "id": "AC-LINT-ZERO", "test_id": "ESLINT-T729-01" },
    { "id": "AC-LINT-TYPE", "test_id": "TYPECHECK-T729-02" },
    { "id": "AC-LINT-COMPONENTS", "test_id": "VITEST-T729-03" },
    { "id": "AC-LINT-BROWSER", "test_id": "E2E-T729-04" }
  ],
  "required_conditions": [
    "zero-eslint-errors",
    "commonjs-script-compatibility",
    "stable-hook-behavior",
    "stable-pagination-rendering",
    "normal-viewport",
    "minimum-viewport"
  ],
  "watched_paths": [
    "frontend/eslint.config.mjs",
    "frontend/src/app/(creator)/projects/[projectId]/page.tsx",
    "frontend/src/app/(creator)/projects/[projectId]/stage-chat-wrapper.tsx",
    "frontend/src/components/navigation/pagination.tsx",
    "frontend/src/components/resources/asset-attach-to-project.tsx",
    "frontend/src/components/resources/cover-thumb.tsx",
    "frontend/src/components/shell/account-switcher.tsx",
    "frontend/src/components/shell/sidebar.tsx",
    "frontend/src/features/assets/assets-toolbar-search.tsx",
    "frontend/src/features/automations/automations-island.tsx",
    "frontend/src/features/copilot/chat-brief-card.tsx",
    "frontend/src/features/draft-workbench/draft-resizable-layout.tsx",
    "frontend/src/features/knowledge/knowledge-detail-preview.tsx",
    "frontend/src/features/platform-account/account-manager-interactive-region.tsx",
    "frontend/src/features/review/calibration-suggestions-card.tsx",
    "frontend/src/features/script/script-rich-editor.tsx",
    "frontend/src/features/search/search-facets-panel.tsx",
    "frontend/src/features/settings/reset-workspace-card.tsx"
  ],
  "viewports": [
    { "width": 1440, "height": 900 },
    { "width": 1024, "height": 720 }
  ],
  "coherence_groups": []
}
```
