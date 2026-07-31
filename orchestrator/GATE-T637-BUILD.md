# GATE-T637-BUILD — 新手引导改为连续成果路径

结论：BUILD PASS。设置中的“重新打开引导”会真实回到首页；新号与已有作品账号分别走连续的
6/7 步成果路径，历史项目、定位、对标、选题与项目的解锁顺序由真实状态决定。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-637",
  "contract_path": "docs/superpowers/specs/2026-07-06-onboarding-guided-flow-design.md",
  "contract_sha": "61bcf54db408",
  "commit_sha": "bd137c1c2504e53ece13e2ddfa6b5488aeb0c4f6",
  "observed_at": "2026-07-31T14:37:41.000Z",
  "run": {
    "verify_key": "onboarding-sidebar:e2e",
    "command": "CREATOROS_TEST_PORT=3429 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/onboarding-and-small-sidebar.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "Playwright e2e：2 passed；真实页面从设置重开引导并切换新号/已有作品分支"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "Google Chrome stable / Playwright 1.60",
    "viewports": [
      { "width": 1440, "height": 900, "result": "pass" },
      { "width": 1024, "height": 720, "result": "pass" }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      { "id": "browser-state-fresh-existing", "role": "isolated-browser-onboarding-state" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "onboarding data/steps/card：聚焦测试 96 项覆盖状态与分支" },
    "surface": { "status": "pass", "evidence_ref": "E2E：常规与最小窗口完整显示步骤、状态和下一步动作" },
    "journey": { "status": "pass", "evidence_ref": "设置重开 → 首页出现引导 → 新号 6 步 → 已有作品 7 步 → 刷新保持" },
    "experience": { "status": "not-requested", "evidence_ref": "等待用户在最终安装版进行主观体验确认" }
  },
  "checks": [
    { "id": "AC-ONB-REOPEN", "test_id": "E2E-ONB-01", "result": "pass", "evidence_ref": "点击 pref-reopen-onboarding 后 URL 回到 / 且引导可见" },
    { "id": "AC-ONB-FLOW", "test_id": "E2E-ONB-02", "result": "pass", "evidence_ref": "页面只呈现账号、历史项目、定位、对标、选题、项目成果链" },
    { "id": "AC-ONB-EXISTING", "test_id": "E2E-ONB-03", "result": "pass", "evidence_ref": "已有作品分支显示 7 步并包含历史项目" },
    { "id": "AC-ONB-FRESH", "test_id": "E2E-ONB-04", "result": "pass", "evidence_ref": "新号分支跳过历史项目，连续显示 6 步" },
    { "id": "AC-ONB-COPY", "test_id": "E2E-ONB-05", "result": "pass", "evidence_ref": "两档窗口无横向溢出，可见文案扫描无内部追踪 ID" }
  ],
  "coverage": [
    { "condition": "complete", "result": "pass", "evidence_ref": "已有完成状态在步骤卡真实显示", "reason": "" },
    { "condition": "hidden", "result": "pass", "evidence_ref": "先写入隐藏状态，首页不显示引导", "reason": "" },
    { "condition": "reopen", "result": "pass", "evidence_ref": "设置按钮清除隐藏状态并返回首页", "reason": "" },
    { "condition": "existing", "result": "pass", "evidence_ref": "已有作品分支展示历史项目步骤", "reason": "" },
    { "condition": "fresh", "result": "pass", "evidence_ref": "新号分支不展示历史项目步骤", "reason": "" },
    { "condition": "back", "result": "pass", "evidence_ref": "重开动作从设置返回首页", "reason": "" },
    { "condition": "refresh", "result": "pass", "evidence_ref": "刷新后分支选择和完整路径仍在", "reason": "" }
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-637-visible-copy.json",
    "artifact_sha256": "325a3bd8a2e6f9dbf645ee041ed8bfcf3faa820c39d818f4b20ccfb8b7562f64"
  },
  "tdd_red_ref": "红测曾捕获重新打开只改 localStorage 不导航、自动化被暴露为用户步骤、已有作品与新号路径断裂",
  "open_defects": [],
  "status": "pass"
}
```

## 其他验证

- 前端聚焦测试：10 files / 141 tests PASS（含其他同批模块）；
- frontend typecheck：PASS；
- 本次改动行无新增 ESLint 问题；全文件扫描仍命中侧栏与 Copilot 在 HEAD 已存在的 React Compiler 基线。
