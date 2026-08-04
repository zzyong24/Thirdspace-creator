# T-666 BUILD Gate：定位母版非破坏草稿

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-666",
  "contract_path": "orchestrator/T666-FRONTEND-JOURNEY.md",
  "contract_sha": "28a70990fa45",
  "commit_sha": "5fd4979031552f4cc91f59d6539b30d79a601e21",
  "observed_at": "2026-08-03T03:33:57.000Z",
  "run": {
    "verify_key": "recent-data-safety-fixed:e2e",
    "command": "node orchestrator/process/run-recent-data-safety-fixed.mjs",
    "exit_code": 0,
    "output_ref": "Node 24 / Chrome stable：2 passed；已有母版与 scratch 草稿共存旅程通过"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "Google Chrome stable / Playwright 1.60 / Node 24.14",
    "viewports": [
      { "width": 1440, "height": 900, "result": "pass" },
      { "width": 1024, "height": 720, "result": "pass" }
    ]
  },
  "data": { "mode": "non-fixture", "witnesses": [{ "id": "official-master-and-scratch", "role": "real-positioning-state" }] },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "reset operation 失败关闭与正式定位不变回归通过" },
    "surface": { "status": "pass", "evidence_ref": "母版、历史和前采草稿在两档窗口同时可见" },
    "journey": { "status": "pass", "evidence_ref": "真实母版 → scratch 前采 → 定位中心共存展示" },
    "experience": { "status": "not-requested", "evidence_ref": "不冒充用户主观确认" }
  },
  "checks": [
    { "id": "AC-POSITIONING-MASTER", "test_id": "E2E-POS-SAFE-01", "result": "pass", "evidence_ref": "当前母版和一句话定位持续可见" },
    { "id": "AC-POSITIONING-DRAFT", "test_id": "E2E-POS-SAFE-02", "result": "pass", "evidence_ref": "scratch 前采作为独立草稿区显示" },
    { "id": "AC-POSITIONING-SEARCH-LOCALE", "test_id": "E2E-POS-SEARCH-01", "result": "pass", "evidence_ref": "草稿操作可继续，正式母版未被替换" }
  ],
  "coverage": [
    { "condition": "existing-master", "result": "pass", "evidence_ref": "正式 profile 与 statement 真实落库", "reason": "" },
    { "condition": "scratch-draft", "result": "pass", "evidence_ref": "scratch session 真实落库", "reason": "" },
    { "condition": "history-visible", "result": "pass", "evidence_ref": "版本历史与当前母版仍显示", "reason": "" },
    { "condition": "minimum-window", "result": "pass", "evidence_ref": "1024x720 仍可同时查看", "reason": "" }
  ],
  "visible_copy": { "artifact_path": "orchestrator/evidence/T-666-visible-copy.json", "artifact_sha256": "c1f3e6400d4ddf9f0062f534428665bf3dc5e5585c981cc2b2757c43404de90e" },
  "tdd_red_ref": "旧页面在 active discovery 时整页替换正式定位；母版持续展示与 reset 拒绝测试先红后绿",
  "open_defects": [],
  "status": "pass"
}
```

旧客户端即使继续调用 `positioning.master.reset`，后端也不会清空已有定位；只有用户明确采纳完整候选后才会生成新版本。
