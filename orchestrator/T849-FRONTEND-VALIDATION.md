# T-849 发布物料查看验收报告

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-849",
  "contract_path": "orchestrator/T849-FRONTEND-JOURNEY.md",
  "contract_sha": "96d9183e84b5",
  "commit_sha": "1743acc1618a95376796831b4594c89ff4926cc9",
  "observed_at": "2026-08-16T13:01:36.110Z",
  "run": {
    "verify_key": "publish-package-readback:e2e",
    "command": "CREATOROS_TEST_PORT=3437 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/publish-package-readback.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "orchestrator/T849-BUILD-VALIDATION.md#真实页面旅程"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Google Chrome + Playwright + Next.js 本地隔离运行时",
    "viewports": [
      {"width": 1536, "height": 1024, "result": "pass"},
      {"width": 900, "height": 720, "result": "pass"}
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {"id": "isolated-rich-package", "role": "正式 dispatch 写入的多行简介与双标签生成物料"},
      {"id": "isolated-published-fact", "role": "同一作品下较新且只有标题的已发布事实"}
    ]
  },
  "levels": {
    "logic": {"status": "pass", "evidence_ref": "后端生成归一 4 项、前端读侧与界面 22 项聚焦测试通过；前后端类型检查通过"},
    "surface": {"status": "pass", "evidence_ref": "两档窗口弹窗均显示单行简介和两个真实标签，不出现暂无正文或暂无标签"},
    "journey": {"status": "pass", "evidence_ref": "真实创建双发布记录 → 查看完整物料 → 刷新 → 小窗口再次查看，全程通过"},
    "experience": {"status": "pass", "evidence_ref": "弹窗内容层级与原界面一致；单行简介适合直接复制，标签保持可扫读"}
  },
  "checks": [
    {"id": "AC-PUBLISH-PACK-RICH-REVISION", "test_id": "E2E-T849-01", "result": "pass", "evidence_ref": "较新的标题型已发布事实存在时，弹窗仍选择含正文和标签的生成物料"},
    {"id": "AC-PUBLISH-PACK-SINGLE-LINE", "test_id": "E2E-T849-01", "result": "pass", "evidence_ref": "第一段、第二段与收尾之间统一为单个空格"},
    {"id": "AC-PUBLISH-PACK-REFRESH", "test_id": "E2E-T849-01", "result": "pass", "evidence_ref": "刷新页面后再次打开仍显示同一简介与两个标签"},
    {"id": "AC-PUBLISH-STATUS-PRESERVED", "test_id": "E2E-T849-01", "result": "pass", "evidence_ref": "页面保留已发布状态且不重复显示登记已发布"}
  ],
  "coverage": [
    {"condition": "rich-package-plus-title-only-published-fact", "result": "pass", "evidence_ref": "隔离数据库通过正式接口按失败顺序写入两条记录"},
    {"condition": "single-line-description", "result": "pass", "evidence_ref": "多行与制表符输入在弹窗中归一为一行"},
    {"condition": "page-refresh", "result": "pass", "evidence_ref": "刷新后由服务端读侧重新装配，内容仍完整"},
    {"condition": "regular-and-compact-viewports", "result": "pass", "evidence_ref": "1536×1024 与 900×720 均通过，紧凑窗口弹窗未越界"}
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-849-visible-copy.json",
    "artifact_sha256": "cf2ffbe7f749cacc16dcfb2ad145a7518fa334681c59c091ef5a9b931975374c"
  },
  "tdd_red_ref": "orchestrator/T849-BUILD-VALIDATION.md#red",
  "open_defects": [],
  "status": "pass"
}
```
