# T-1296 公共界面验收映射

对应已审核 SPEC 的实际可测 UI/保存/交付范围；未配置模型的生成不记通过。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v1",
  "task_id": "T-1296",
  "watched_paths": [
    "ai-worker/src/prompt/templates/chatbox-turn.ts",
    "backend/src/modules/ai-runtime/work-editor-candidate.ts",
    "contract/src/resources/work-editor.ts",
    "docs/verification/t1296/fixtures/source.mp4",
    "docs/verification/t1296/native-prechange/candidate-preview.mp4",
    "docs/verification/t1296/native-prechange/input.json",
    "frontend/public/reference-editors/noterelay/native/build-meta.json",
    "frontend/public/reference-editors/noterelay/native/native.js",
    "frontend/public/reference-editors/opencut-classic/native/NATIVE_BUILD_GRAPH.json",
    "frontend/public/reference-editors/opencut-classic/native/native.css",
    "frontend/public/reference-editors/opencut-classic/native/native.js",
    "frontend/public/reference-editors/sources/noterelay/source.zip",
    "frontend/src/features/article/article-result-actions.tsx",
    "frontend/src/features/article/article-workbench.tsx",
    "frontend/src/features/article/doocs-article-editor.tsx",
    "frontend/src/features/projects/graphic-post-results.tsx",
    "frontend/src/features/projects/graphic-post-workbench.tsx",
    "frontend/src/features/projects/script-first-content.ts",
    "frontend/src/features/reference-editors/noterelay/noterelay-editor.tsx",
    "frontend/tests/e2e/t1296-script-first-workspaces.spec.ts",
    "reference-editors/manifest.json",
    "reference-editors/noterelay/src/platforms/wechat/wenote/wechatRenderer.ts",
    "reference-editors/opencut-classic/native/DELIVERY.json",
    "reference-editors/opencut-classic/native/NATIVE_BUILD_GRAPH.json",
    "reference-editors/opencut-classic/native/README.md",
    "reference-editors/opencut-classic/native/SHA256SUMS",
    "reference-editors/opencut-classic/native/SOURCE_CHANGES.json",
    "reference-editors/opencut-classic/native/native-from-t1046.patch",
    "reference-editors/opencut-classic/native/native-source.tar.gz",
    "reference-editors/opencut-classic/native/native.css",
    "reference-editors/opencut-classic/native/native.js",
    "reference-editors/opencut-classic/native/rebuild-native.sh"
  ],
  "required_checks": [
    {
      "id": "script-platform-delivery",
      "test_id": "脚本是原稿，两个平台默认承接并保持独立，稿面只保留重组主动作"
    },
    {
      "id": "native-assistant-delivery",
      "test_id": "T1296 全高助手布局保持真实剪辑候选、保存刷新与MP4交付"
    }
  ],
  "required_conditions": [
    "平台原稿独立及真实保存交付",
    "旧Doocs版式交付",
    "真实候选采纳刷新和MP4导出",
    "响应式与小窗口发送区可达"
  ],
  "viewports": [
    {
      "width": 1366,
      "height": 900
    },
    {
      "width": 1280,
      "height": 800
    },
    {
      "width": 390,
      "height": 844
    }
  ],
  "coherence_groups": [],
  "limitations": [
    "未调用真实模型或ASR",
    "既有slider方向键被全局快捷键拦截另记T-1297，不冒充键盘缩放通过"
  ]
}
```
