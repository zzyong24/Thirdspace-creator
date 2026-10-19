# T-1276 严格收尾旅程合同草案

状态：已准备，未执行、未登记allowlist。遵循 CLOSURE_AUDIT；不得用草案替代完成回执。下面watched_paths必须在实际运行前后干净且HEAD不变。历史模型、ASR、写入和故障证据各保原发生时间；新命令只做新鲜只读公共/浏览器复查。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1276",
  "copy_guard": {
    "forbid_internal_ids": true
  },
  "watched_paths": [
    "backend/src/application/generation/transactional-task-runtime.ts",
    "backend/src/modules/production/production-editor.repository.ts",
    "backend/src/modules/production/production-sources.ts",
    "backend/src/modules/production/production.service.ts",
    "contract/src/operations/production.ts",
    "contract/src/resources/production-editor.ts",
    "docs/verification/t1274/closure/fresh-readonly.cjs",
    "docs/verification/t1274/closure/witnesses.json",
    "frontend/src/features/production/production-workbench.tsx",
    "frontend/src/features/reference-editors/native-editor-contract.ts",
    "frontend/src/features/reference-editors/native-editor-surface.tsx",
    "frontend/src/features/reference-editors/video-reference-workbench.tsx",
    "frontend/src/server/__module_integration__/production-source-group.persistence-client.test.ts",
    "frontend/src/server/persistence-client.ts",
    "frontend/tests/e2e/t1274-editing-workspace.spec.ts"
  ],
  "required_checks": [
    {
      "id": "AC-1276-01",
      "test_id": "CLOSURE-T1276-AC01"
    },
    {
      "id": "AC-1276-02",
      "test_id": "CLOSURE-T1276-AC02"
    },
    {
      "id": "AC-1276-03",
      "test_id": "CLOSURE-T1276-AC03"
    },
    {
      "id": "AC-1276-04",
      "test_id": "CLOSURE-T1276-AC04"
    }
  ],
  "required_conditions": [
    "original-request-recovery",
    "probe-sha",
    "source-adoption",
    "same-business-receipt",
    "wrong-group",
    "preference-freeze",
    "desktop",
    "narrow"
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
