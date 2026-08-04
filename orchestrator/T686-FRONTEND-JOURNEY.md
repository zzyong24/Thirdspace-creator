# T-686 定位前采真实联网补充浏览器旅程契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-686",
  "journey": "在已有定位的前采草稿中输入湖南餐饮行业 IP，真实联网后得到可采用的国内中文来源",
  "entry": "/positioning",
  "copy_guard": { "forbid_internal_ids": true },
  "required_checks": [
    { "id": "AC-POSITIONING-SEARCH-REAL", "test_id": "E2E-POS-SEARCH-REAL-01" },
    { "id": "AC-POSITIONING-SEARCH-LOCALE", "test_id": "E2E-POS-SEARCH-REAL-02" },
    { "id": "AC-POSITIONING-SEARCH-DRAFT-SAFE", "test_id": "E2E-POS-SEARCH-REAL-03" }
  ],
  "required_conditions": ["existing-master", "scratch-draft", "real-browser-search", "real-url", "minimum-window"],
  "watched_paths": [
    "backend/src/modules/positioning/positioning-research.ts",
    "backend/src/modules/positioning/positioning.service.ts",
    "frontend/src/server/persistence-client.ts",
    "frontend/src/features/positioning/positioning-discovery-workflow.tsx",
    "frontend/tests/e2e/recent-data-safety.spec.ts"
  ],
  "viewports": [
    { "width": 1440, "height": 900 },
    { "width": 1024, "height": 720 }
  ],
  "coherence_groups": [],
  "honesty": [
    "外部搜索结果必须含真实 http(s) URL，不得使用模型记忆",
    "联网失败必须显示真实错误且保留前采草稿",
    "搜索只发送用户可见关键词和地区语言约束"
  ]
}
```
