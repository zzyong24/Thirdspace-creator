# T-1274 严格收尾旅程合同草案

状态：已准备，未执行、未登记allowlist。遵循 CLOSURE_AUDIT；不得用草案替代完成回执。下面watched_paths必须在实际运行前后干净且HEAD不变。历史模型、ASR、写入和故障证据各保原发生时间；新命令只做新鲜只读公共/浏览器复查。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1274",
  "copy_guard": {
    "forbid_internal_ids": true
  },
  "watched_paths": [
    "ai-worker/src/prompt/templates/chatbox-turn.ts",
    "backend/src/application/generation/transactional-task-runtime.ts",
    "backend/src/modules/ai-runtime/chat-host-tool-adapter.ts",
    "backend/src/modules/ai-runtime/chat-tool-definitions.test.ts",
    "backend/src/modules/ai-runtime/chat-tool-definitions.ts",
    "backend/src/modules/ai-runtime/chat-tools.ts",
    "backend/src/modules/ai-runtime/chat-work-editor-tool-host.test.ts",
    "backend/src/modules/ai-runtime/chat-work-editor-tool-host.ts",
    "backend/src/modules/ai-runtime/work-editor-candidate.ts",
    "backend/src/modules/execution/video-render/executor.test.ts",
    "backend/src/modules/execution/video-render/executor.ts",
    "backend/src/modules/production/chatcut-script-core/README.md",
    "backend/src/modules/production/production-editor.integration.test.ts",
    "backend/src/modules/production/production-preview.ts",
    "backend/src/modules/production/production-script-markdown.test.ts",
    "backend/src/modules/production/production-script-markdown.ts",
    "backend/src/modules/production/production-script.public.test.ts",
    "backend/src/modules/production/production-sources.ts",
    "backend/src/modules/production/production-transcripts.service.ts",
    "backend/src/modules/production/production-v1-compile.test.ts",
    "backend/src/modules/production/production-v1-compile.ts",
    "backend/src/modules/production/production.service.ts",
    "backend/src/modules/production/production.transport.ts",
    "contract/src/cli-policy.ts",
    "contract/src/index.ts",
    "contract/src/operations/production.ts",
    "contract/src/resources/production-native-document.ts",
    "contract/src/resources/production-script-markdown.ts",
    "contract/src/resources/work-editor.ts",
    "contract/src/workspace-operation-scope.ts",
    "contract/tests/production-script-markdown.test.ts",
    "docs/verification/t1274/closure/fresh-readonly.cjs",
    "docs/verification/t1274/closure/witnesses.json",
    "frontend/public/reference-editors/opencut-classic/native/NATIVE_BUILD_GRAPH.json",
    "frontend/public/reference-editors/opencut-classic/native/native.css",
    "frontend/public/reference-editors/opencut-classic/native/native.js",
    "frontend/src/app/(creator)/projects/[projectId]/stage-chat-wrapper.test.tsx",
    "frontend/src/app/(creator)/projects/[projectId]/stage-chat-wrapper.tsx",
    "frontend/src/components/navigation/project-stage-stepper.tsx",
    "frontend/src/features/copilot/ai-copilot-content.tsx",
    "frontend/src/features/draft-workbench/draft-chat-request.test.tsx",
    "frontend/src/features/draft-workbench/draft-chat-request.tsx",
    "frontend/src/features/draft-workbench/stage-chat-dock.tsx",
    "frontend/src/features/production/production-script-markdown-panel.test.tsx",
    "frontend/src/features/production/production-script-markdown-panel.tsx",
    "frontend/src/features/production/production-workbench.tsx",
    "frontend/src/features/reference-editors/native-editor-contract.ts",
    "frontend/src/features/reference-editors/native-editor-surface.test.tsx",
    "frontend/src/features/reference-editors/native-editor-surface.tsx",
    "frontend/src/features/reference-editors/video-reference-workbench.test.tsx",
    "frontend/src/features/reference-editors/video-reference-workbench.tsx",
    "frontend/src/server/__module_integration__/production-source-group.persistence-client.test.ts",
    "frontend/src/server/persistence-client.ts",
    "frontend/tests/e2e/t1274-editing-workspace.spec.ts",
    "mcp-server/src/cli.ts",
    "mcp-server/src/dispatch.ts",
    "mcp-server/src/server.ts",
    "reference-editors/opencut-classic/native/DELIVERY.json",
    "reference-editors/opencut-classic/native/NATIVE_BUILD_GRAPH.json",
    "reference-editors/opencut-classic/native/README.md",
    "reference-editors/opencut-classic/native/SHA256SUMS",
    "reference-editors/opencut-classic/native/SOURCE_CHANGES.json",
    "reference-editors/opencut-classic/native/native-from-t1046.patch",
    "reference-editors/opencut-classic/native/native-source.tar.gz",
    "reference-editors/opencut-classic/native/native.css",
    "reference-editors/opencut-classic/native/native.js"
  ],
  "required_checks": [
    {
      "id": "AC-1274-01",
      "test_id": "CLOSURE-T1274-AC01"
    },
    {
      "id": "AC-1274-02",
      "test_id": "CLOSURE-T1274-AC02"
    },
    {
      "id": "AC-1274-03",
      "test_id": "CLOSURE-T1274-AC03"
    },
    {
      "id": "AC-1274-04",
      "test_id": "CLOSURE-T1274-AC04"
    },
    {
      "id": "AC-1274-05",
      "test_id": "CLOSURE-T1274-AC05"
    },
    {
      "id": "AC-1274-06",
      "test_id": "CLOSURE-T1274-AC06"
    },
    {
      "id": "AC-1274-07",
      "test_id": "CLOSURE-T1274-AC07"
    },
    {
      "id": "AC-1274-08",
      "test_id": "CLOSURE-T1274-AC08"
    }
  ],
  "required_conditions": [
    "normal",
    "empty",
    "loading",
    "error",
    "batch-diagnostics",
    "long-content",
    "permission",
    "desktop",
    "narrow",
    "native-browser-zoom-200",
    "dirty-before-send",
    "cas-recovery",
    "receipt-recovery"
  ],
  "viewports": [
    {
      "width": 1366,
      "height": 900
    },
    {
      "width": 390,
      "height": 844
    }
  ],
  "coherence_groups": []
}
```
