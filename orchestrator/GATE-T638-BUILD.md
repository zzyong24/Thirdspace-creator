# GATE-T638-BUILD — 历史逐字稿依赖、通知聚合与低高度侧栏

结论：BUILD PASS。没有真实逐字稿时不再提前创建重建任务；转写完成后自动续排一次重建；同因
批量失败合并为一张带真实数量的通知。低高度窗口保留当前账号与用户身份，导航区独立滚动。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-638",
  "contract_path": "docs/superpowers/specs/2026-07-31-reconstruct-dependency-and-small-window-ui.md",
  "contract_sha": "8558794f4480",
  "commit_sha": "736eeaf77f531b65427c31449249ef7781d4e1d9",
  "observed_at": "2026-07-31T16:10:53.000Z",
  "run": {
    "verify_key": "onboarding-sidebar:e2e",
    "command": "CREATOROS_TEST_PORT=3429 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/onboarding-and-small-sidebar.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "Node 25 / Playwright e2e：2 passed；合并后主线 1024x640 真实页面保留账号与用户身份，导航可滚动且无横向溢出"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "Google Chrome stable / Playwright 1.60",
    "viewports": [
      { "width": 1440, "height": 900, "result": "pass" },
      { "width": 1024, "height": 640, "result": "pass" }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      { "id": "dependency-transition-40-items", "role": "isolated-pglite-transcript-reconstruct" },
      { "id": "browser-short-window-1024x640", "role": "isolated-browser-sidebar-layout" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "重建/转写/通知聚焦测试证明依赖续排与 40 条失败聚合" },
    "surface": { "status": "pass", "evidence_ref": "E2E：1440x900 正常侧栏与 1024x640 短窗口均通过" },
    "journey": { "status": "pass", "evidence_ref": "无稿不排 → 绑定真稿后续排；批量失败一张通知；短窗口身份始终可见" },
    "experience": { "status": "not-requested", "evidence_ref": "等待用户在最终安装版进行主观体验确认" }
  },
  "checks": [
    { "id": "AC-RCN-DEPENDENCY", "test_id": "TEST-RCN-01", "result": "pass", "evidence_ref": "reconstruct-enqueue 与 transcribe-runner：无稿 0 条、绑定真稿后只续排一次" },
    { "id": "AC-RCN-AGGREGATION", "test_id": "TEST-RCN-02", "result": "pass", "evidence_ref": "task-notifications：40 个同类型同原因失败合并为 1 张，count=40" },
    { "id": "AC-RCN-SHORT-SIDEBAR", "test_id": "E2E-RCN-01", "result": "pass", "evidence_ref": "1024x640：identity footer 在视口内，scroll region 可见，宣传卡隐藏" }
  ],
  "coverage": [
    { "condition": "pending", "result": "pass", "evidence_ref": "没有逐字稿时重建排队数为 0", "reason": "" },
    { "condition": "ready", "result": "pass", "evidence_ref": "转写 runner 绑定逐字稿后调用重建续排", "reason": "" },
    { "condition": "bulk-failure", "result": "pass", "evidence_ref": "同因批量失败聚合数量保持真实", "reason": "" },
    { "condition": "short-window", "result": "pass", "evidence_ref": "1024x640 E2E 无身份截断和横向溢出", "reason": "" },
    { "condition": "refresh", "result": "pass", "evidence_ref": "页面刷新后低高度布局与身份区仍保持", "reason": "" }
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-638-visible-copy.json",
    "artifact_sha256": "eef61a93b79def4ace17fff09f9f5b4d2886fb99f11786798b38ce48ce7bdbef"
  },
  "tdd_red_ref": "红测曾捕获逐字稿未就绪仍创建重建、转写完成不续排、40 条失败弹 40 张通知及短窗口身份被挤出",
  "open_defects": [],
  "status": "pass"
}
```

## 其他验证

- 前端相关聚焦测试纳入 141 tests PASS；后端转写相关聚焦测试纳入 38 tests PASS；
- frontend/backend typecheck：PASS；reconcile：PASS。
