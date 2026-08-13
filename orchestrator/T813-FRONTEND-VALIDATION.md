# T-813 联网素材先阅读后保存体验验收报告

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-813",
  "contract_path": "orchestrator/T813-FRONTEND-JOURNEY.md",
  "contract_sha": "8042091c559b",
  "commit_sha": "94016cb6a3f540b221cacf3fa59dce1744f8590e",
  "observed_at": "2026-08-13T15:44:32Z",
  "run": {
    "verify_key": "web-material-read-save:e2e",
    "command": "CREATOROS_TEST_PORT=3435 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/web-material-read-save.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "Playwright：1 passed（真实 Chrome，隔离 PGlite，9.9s）"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Google Chrome 151.0.7922.110 / Playwright / Next.js 16.2.9",
    "viewports": [
      { "width": 1536, "height": 1024, "result": "pass" },
      { "width": 1024, "height": 768, "result": "pass" }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      { "id": "isolated-account-project", "role": "浏览器通过正式 dispatch 在隔离数据库创建真实账号与项目" },
      { "id": "deterministic-tool-stream", "role": "仅模型与网页工具输出采用确定性响应；浏览器请求体、组件状态和保存动作走真实产品链" },
      { "id": "stable-asset-mutations", "role": "真实浏览器发出的 assets.commit 与 materialLinks.create 请求均携带同一服务端素材 ID" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "后端 236 项、前端 116 项聚焦测试通过；contract/backend/frontend TypeScript 检查通过" },
    "surface": { "status": "pass", "evidence_ref": "搜索卡只显示阅读全文；阅读卡显示临时上下文、覆盖度、提取方式与后置保存入口" },
    "journey": { "status": "pass", "evidence_ref": "真实账号/项目 → 搜索线索 → 阅读全文 → 临时上下文 → 稳定素材保存 → 项目关联完整通过" },
    "experience": { "status": "pass", "evidence_ref": "1536×1024 下验证未读不可保存，切换 1024×768 后继续完成阅读和保存，关键操作可见可点" }
  },
  "checks": [
    { "id": "AC-READ-BEFORE-SAVE", "test_id": "E2E-T813-01", "result": "pass", "evidence_ref": "搜索线索卡仅有阅读全文，阅读成功前页面不存在保存到项目入口" },
    { "id": "AC-BOUND-URL-COVERAGE", "test_id": "E2E-T813-02", "result": "pass", "evidence_ref": "web.read 请求绑定所点 URL；卡片显示已读 32/共 32 字、本页已读完与 readability" },
    { "id": "AC-STABLE-ASSET-SAVE", "test_id": "E2E-T813-03", "result": "pass", "evidence_ref": "commit 先校验 expectedSourceUrl，再以同一 asset-web-read-e2e 创建当前项目 reference/script 关联" }
  ],
  "coverage": [
    { "condition": "real-chromium", "result": "pass", "evidence_ref": "Google Chrome 151 真实运行" },
    { "condition": "real-isolated-account-and-project", "result": "pass", "evidence_ref": "正式 dispatch 在隔离 PGlite 创建账号与项目" },
    { "condition": "deterministic-provider-tool-stream", "result": "pass", "evidence_ref": "确定性 material.gather/web.read 响应消除外部网络波动，不冒充联网真抓取" },
    { "condition": "regular-and-compact-viewports", "result": "pass", "evidence_ref": "1536×1024 验证先读规则，1024×768 完成阅读与保存" }
  ],
  "tdd_red_ref": "实现前 11 项新回归测试失败，暴露搜索卡可直接保存、所点 URL 未绑定、阅读资产不能稳定保存和全文预览字段缺失；实现后全部转绿。",
  "open_defects": [],
  "status": "pass"
}
```
