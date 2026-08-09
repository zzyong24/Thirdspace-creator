# T-724 项目归属收敛与复盘排期闭锁旅程契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-724",
  "journey": "自动化先导入外部作品后，用户把既有创作项目登记为同一作品，项目列表只保留手工项目作为可操作归属；被替代 imported 投影进入已归档；未完成的复盘项目归入复盘中且不可排期",
  "entry": "/projects",
  "copy_guard": { "forbid_internal_ids": true },
  "required_checks": [
    { "id": "AC-PROJECT-CANONICAL-OWNER", "test_id": "E2E-T724-01" },
    { "id": "AC-PROJECT-ARCHIVED-HIDDEN", "test_id": "E2E-T724-02" },
    { "id": "AC-PROJECT-REVIEW-TAB", "test_id": "E2E-T724-03" },
    { "id": "AC-PROJECT-REVIEW-NO-SCHEDULE", "test_id": "E2E-T724-04" }
  ],
  "required_conditions": [
    "real-account-data",
    "manual-project-and-imported-projection-for-same-publication",
    "archived-imported-projection",
    "active-review-drafting-output",
    "backend-schedule-fail-closed",
    "normal-and-minimum-viewports"
  ],
  "watched_paths": [
    "backend/src/modules/content-calendar/content-calendar.service.ts",
    "backend/src/modules/content-calendar/content-calendar.service.test.ts",
    "backend/src/modules/ingestion/ingestion.service.ts",
    "backend/src/modules/ingestion/ingestion.merge-bound-project.integration.test.ts",
    "backend/src/modules/projects/projects.repository.ts",
    "backend/src/modules/projects/projects.service.ts",
    "backend/src/modules/projects/projects.service.test.ts",
    "backend/src/modules/publishing/publishing.service.ts",
    "backend/src/modules/publishing/publishing.service.test.ts",
    "frontend/src/features/projects/projects-page.tsx",
    "frontend/src/features/projects/projects-page.test.tsx",
    "frontend/src/features/draft-workbench/register-published-form.tsx",
    "frontend/src/features/draft-workbench/register-published-form.test.tsx"
  ],
  "viewports": [
    { "width": 1440, "height": 900 },
    { "width": 1024, "height": 720 }
  ],
  "coherence_groups": [
    {
      "id": "project-lifecycle-consistency",
      "members": [
        "项目 Tab",
        "当前阶段标签",
        "排期操作",
        "后端排期写入"
      ]
    }
  ],
  "honesty": [
    "不得删除被替代的 imported 项目、封面、媒体、指标或历史排期",
    "已归档 imported 投影不得继续混入全部项目或已发布项目",
    "currentStage=review 的未完成项目必须显示真实复盘状态，不得因旧 output.status 重新开放排期",
    "手工项目冲突必须展示真实 canonical 项目，不得静默改绑"
  ]
}
```
