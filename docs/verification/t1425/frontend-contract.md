# Tab切换源码界面旅程契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1425",
  "copy_guard": {"forbid_internal_ids": true},
  "watched_paths": [
    "backend/src/modules/articles/articles.service.ts",
    "frontend/src/app/(creator)/projects/[projectId]/page.tsx",
    "frontend/src/app/(creator)/projects/[projectId]/article/page.tsx",
    "frontend/src/app/(creator)/projects/[projectId]/production/page.tsx",
    "frontend/src/features/projects/project-route-data.ts",
    "frontend/src/features/draft-workbench/draft-workbench-data.ts",
    "frontend/src/features/draft-workbench/draft-workbench-page.tsx",
    "frontend/src/features/draft-workbench/draft-workbench-deferred.tsx",
    "frontend/src/features/script/script-structure-view.tsx",
    "frontend/src/features/article/article-workbench.tsx",
    "frontend/src/features/article/doocs-article-editor.tsx",
    "frontend/src/features/reference-editors/noterelay/noterelay-editor.tsx"
  ],
  "required_checks": [
    {"id":"TAB-CYCLE","test_id":"browser-tab-cycle"},
    {"id":"SCRIPT-ROUNDTRIP","test_id":"browser-script-roundtrip"},
    {"id":"ARTICLE-ZIP","test_id":"browser-article-zip"}
  ],
  "required_conditions": ["normal-and-small-viewport", "repeated-real-tab-navigation", "saved-script-preserved", "one-click-lazy-article-export"],
  "viewports": [{"width":1366,"height":900},{"width":1024,"height":768}],
  "coherence_groups": []
}
```
