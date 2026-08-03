# T-664 内置 IP 课程产品化改写真实浏览器旅程契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-664",
  "journey": "打开产品化改写后的内置 IP 课程，阅读课时，标记完成并在刷新与窄窗口中继续学习",
  "entry": "/knowledge?view=course",
  "copy_guard": { "forbid_internal_ids": true },
  "required_checks": [
    { "id": "AC-COURSE-HOME", "test_id": "E2E-COURSE-01" },
    { "id": "AC-COURSE-LESSON", "test_id": "E2E-COURSE-02" },
    { "id": "AC-COURSE-PROGRESS", "test_id": "E2E-COURSE-03" },
    { "id": "AC-COURSE-RESPONSIVE", "test_id": "E2E-COURSE-04" },
    { "id": "AC-COURSE-SOURCE", "test_id": "TEST-COURSE-01" }
  ],
  "required_conditions": [
    "fresh",
    "lesson",
    "complete",
    "refresh",
    "minimum-window",
    "next-lesson"
  ],
  "watched_paths": [
    "frontend/public/courses/xuehui-ip-practical-course",
    "frontend/scripts/productize-built-in-course.mjs",
    "frontend/scripts/verify-built-in-course.mjs",
    "frontend/src/features/knowledge/built-in-ip-course.ts",
    "frontend/src/features/knowledge/knowledge-course-reader.tsx",
    "frontend/tests/e2e/built-in-ip-course.spec.ts"
  ],
  "viewports": [
    { "width": 1440, "height": 900 },
    { "width": 1024, "height": 720 }
  ],
  "coherence_groups": [],
  "honesty": [
    "课程数量、课时数量与知识点数量只读随包真值",
    "正文使用 CreatorOS 教学语言，不把历史案例写成效果承诺",
    "学习进度只来自本机真实操作，不伪造已学状态",
    "内置课程只读，不覆盖用户自己的知识"
  ]
}
```
