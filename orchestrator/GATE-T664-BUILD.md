# T-664 BUILD Gate：内置 IP 课程产品化改写

> 状态：课程正文、阅读旅程与生产构建验收通过；双平台安装包流水线在任务合并后统一触发。

## 课程真实浏览器旅程

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-664",
  "contract_path": "orchestrator/T664-FRONTEND-JOURNEY.md",
  "contract_sha": "d4a038027767",
  "commit_sha": "9199904a1236176f966ec35f51acfa73a080cbd1",
  "observed_at": "2026-08-03T03:21:21.000Z",
  "run": {
    "verify_key": "built-in-ip-course:e2e",
    "command": "CREATOROS_TEST_PORT=3431 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/built-in-ip-course.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "Node 24 / Chromium：1 passed；课程目录、产品化正文、完成、刷新、窄屏和下一课连续旅程通过"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "Chromium / Playwright 1.60 / Node 24.14",
    "viewports": [
      { "width": 1440, "height": 900, "result": "pass" },
      { "width": 1024, "height": 720, "result": "pass" }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      { "id": "packaged-course-6-22-119-v3", "role": "repository-packaged-course-assets" },
      { "id": "local-progress-lesson-01", "role": "real-browser-local-progress" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "课程结构、文案禁词、checksum 与知识点完整性校验通过" },
    "surface": { "status": "pass", "evidence_ref": "1440x900 与 1024x720 两档窗口无横向溢出" },
    "journey": { "status": "pass", "evidence_ref": "目录 → 第一课 → 完成 → 刷新恢复 → 目录进度 → 窄屏继续 → 下一课" },
    "experience": { "status": "not-requested", "evidence_ref": "机器旅程不冒充用户主观体验确认" }
  },
  "checks": [
    { "id": "AC-COURSE-HOME", "test_id": "E2E-COURSE-01", "result": "pass", "evidence_ref": "课程首页显示 CreatorOS IP 创作实战课及 6 模块、22 讲、119 个知识点" },
    { "id": "AC-COURSE-LESSON", "test_id": "E2E-COURSE-02", "result": "pass", "evidence_ref": "课时展示学完你会、交付物、核心方法、案例、自测、实践和验收标准" },
    { "id": "AC-COURSE-PROGRESS", "test_id": "E2E-COURSE-03", "result": "pass", "evidence_ref": "标记完成后刷新仍保留，目录显示真实进度" },
    { "id": "AC-COURSE-RESPONSIVE", "test_id": "E2E-COURSE-04", "result": "pass", "evidence_ref": "1024x720 可继续学习并进入第二课，无横向溢出" },
    { "id": "AC-COURSE-SOURCE", "test_id": "TEST-COURSE-01", "result": "pass", "evidence_ref": "随包资产保持 6/22/119，来源与授权元数据保留，正文课堂转述禁词为 0" }
  ],
  "coverage": [
    { "condition": "fresh", "result": "pass", "evidence_ref": "清空本机课程进度后显示从第一课开始", "reason": "" },
    { "condition": "lesson", "result": "pass", "evidence_ref": "第一课完整产品化阅读内容可见", "reason": "" },
    { "condition": "complete", "result": "pass", "evidence_ref": "标记完成真实写入本机进度", "reason": "" },
    { "condition": "refresh", "result": "pass", "evidence_ref": "刷新后完成状态与目录进度仍在", "reason": "" },
    { "condition": "minimum-window", "result": "pass", "evidence_ref": "1024x720 无横向溢出且动作可达", "reason": "" },
    { "condition": "next-lesson", "result": "pass", "evidence_ref": "下一节进入商业定位先于个人特点并显示上一节入口", "reason": "" }
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-664-visible-copy.json",
    "artifact_sha256": "2e9ce0a24b197e3ed5aaa97493813722e8ba11303fde76f5a6b1ffb5ddeeb4a3"
  },
  "tdd_red_ref": "旧课程正文审计命中课堂转述口吻；产品化改写与禁词门禁后转绿",
  "open_defects": [],
  "status": "pass"
}
```

## 已通过的代码 Gate

- 课程随包校验：PASS，6 模块、22 讲、119 个知识点。
- 随包课程组合 SHA-256：`7886cd6c1a4c13f577b4da146c4b71128e875b6b1379e4b9678b11279fe078ec`。
- 课程阅读器聚焦测试：3/3 PASS。
- 相关前端聚焦回归：67/67 PASS。
- 相关后端聚焦回归：60/60 PASS。
- frontend / backend typecheck：PASS。
- frontend production build：PASS。
- boundary scan：PASS；0 条新增物理架构违规。
- 真实浏览器旅程：1/1 PASS。

## 内容编辑结果

- 课程标题统一为“CreatorOS IP 创作实战课”。
- 22 讲全部具备学习结果与可检查交付物。
- 119 个知识点统一为结论、执行顺序、适用边界和可检查产出。
- “薛老师 / 老师原话 / 课堂 / 课上”等课堂转述禁词审计为 0。
- 历史案例保留方法解释价值，并统一增加时效与结果边界说明。
