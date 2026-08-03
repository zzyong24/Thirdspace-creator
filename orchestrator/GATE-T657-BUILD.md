# T-657 BUILD Gate：定位前采国内中文搜索

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-657",
  "contract_path": "orchestrator/T657-FRONTEND-JOURNEY.md",
  "contract_sha": "5c4712dbd9ed",
  "commit_sha": "5fd4979031552f4cc91f59d6539b30d79a601e21",
  "observed_at": "2026-08-03T03:33:57.000Z",
  "run": {
    "verify_key": "recent-data-safety:e2e",
    "command": "CREATOROS_TEST_PORT=3432 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/recent-data-safety.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "Node 24 / Chrome stable：2 passed；定位数据安全、国内中文搜索默认值与信源删除旅程通过"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "Google Chrome stable / Playwright 1.60 / Node 24.14",
    "viewports": [
      { "width": 1440, "height": 900, "result": "pass" },
      { "width": 1024, "height": 720, "result": "pass" }
    ]
  },
  "data": { "mode": "non-fixture", "witnesses": [{ "id": "hunan-catering-positioning", "role": "real-discovery-session" }] },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "后端相关性与二次搜索替换测试通过" },
    "surface": { "status": "pass", "evidence_ref": "搜索地区和语言控件在两档窗口可见" },
    "journey": { "status": "pass", "evidence_ref": "真实账号、正式母版和 scratch 前采页面连续打开" },
    "experience": { "status": "not-requested", "evidence_ref": "不冒充用户主观确认" }
  },
  "checks": [
    { "id": "AC-POSITIONING-MASTER", "test_id": "E2E-POS-SAFE-01", "result": "pass", "evidence_ref": "已有正式母版持续可见" },
    { "id": "AC-POSITIONING-DRAFT", "test_id": "E2E-POS-SAFE-02", "result": "pass", "evidence_ref": "scratch 前采独立显示" },
    { "id": "AC-POSITIONING-SEARCH-LOCALE", "test_id": "E2E-POS-SEARCH-01", "result": "pass", "evidence_ref": "默认地区为中国大陆、语言为简体中文，并明确二次搜索替换未采用结果" }
  ],
  "coverage": [
    { "condition": "existing-master", "result": "pass", "evidence_ref": "真实创建定位母版", "reason": "" },
    { "condition": "scratch-draft", "result": "pass", "evidence_ref": "真实创建 scratch session", "reason": "" },
    { "condition": "cn-default", "result": "pass", "evidence_ref": "控件值为 cn / zh-CN", "reason": "" },
    { "condition": "minimum-window", "result": "pass", "evidence_ref": "1024x720 页面仍可用", "reason": "" }
  ],
  "visible_copy": { "artifact_path": "orchestrator/evidence/T-657-visible-copy.json", "artifact_sha256": "9dff16d70e205930ed4affe196704aae56ae8e942c8950c58d53924abbd71039" },
  "tdd_red_ref": "湖南餐饮行业 IP 曾命中省份百科和政府页面；相关性约束测试先红后绿",
  "open_defects": [],
  "status": "pass"
}
```

后端聚焦回归已覆盖：二次搜索替换未采纳候选、已采纳证据保留、国内中文语义优先，以及通用省份页面过滤。
