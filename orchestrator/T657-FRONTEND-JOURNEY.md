# T-657 定位前采国内中文搜索真实浏览器旅程契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-657",
  "journey": "在已有定位的前采草稿中确认联网补充默认采用中国大陆与简体中文范围",
  "entry": "/positioning",
  "copy_guard": { "forbid_internal_ids": true },
  "required_checks": [
    { "id": "AC-POSITIONING-MASTER", "test_id": "E2E-POS-SAFE-01" },
    { "id": "AC-POSITIONING-DRAFT", "test_id": "E2E-POS-SAFE-02" },
    { "id": "AC-POSITIONING-SEARCH-LOCALE", "test_id": "E2E-POS-SEARCH-01" }
  ],
  "required_conditions": ["existing-master", "scratch-draft", "cn-default", "minimum-window"],
  "watched_paths": [
    "backend/src/modules/positioning/positioning-research.ts",
    "backend/src/modules/positioning/positioning-research.test.ts",
    "frontend/src/features/positioning/positioning-discovery-workflow.tsx",
    "frontend/tests/e2e/recent-data-safety.spec.ts"
  ],
  "viewports": [
    { "width": 1440, "height": 900 },
    { "width": 1024, "height": 720 }
  ],
  "coherence_groups": [],
  "honesty": [
    "默认地区和语言读取真实控件值",
    "搜索相关性由后端真实排序与过滤回归证明，不用伪造网页结果",
    "已采纳证据和未采纳候选使用不同保留语义"
  ]
}
```
