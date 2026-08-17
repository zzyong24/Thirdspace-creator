# T-870 前端旅程验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-870",
  "contract_path": "orchestrator/T870-FRONTEND-JOURNEY.md",
  "contract_sha": "8de49a088ce1",
  "commit_sha": "6792cfcf619fa031d2f673ef1d8c1f5cdfbb642d",
  "observed_at": "2026-08-17T12:23:39.000Z",
  "run": {
    "verify_key": "content-radar-one-click-project:e2e",
    "command": "CREATOROS_TEST_PORT=3439 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/content-radar-one-click-project.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "orchestrator/T870-BUILD-VALIDATION.md#真实页面旅程"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "Google Chrome stable + Next.js 本地隔离运行时",
    "viewports": [
      {"width": 1536, "height": 1024, "result": "pass"},
      {"width": 1024, "height": 720, "result": "pass"}
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {"id": "isolated-rss-topic-candidate", "role": "正式采集、逐字稿与选题生成服务产出的代表性候选"},
      {"id": "isolated-promoted-project", "role": "页面点击后由正式立项服务创建并回读的项目"}
    ]
  },
  "levels": {
    "logic": {"status": "pass", "evidence_ref": "候选确认、正式立项、失败保留与重复请求幂等回归均通过"},
    "surface": {"status": "pass", "evidence_ref": "orchestrator/evidence/T-870-visible-copy.json"},
    "journey": {"status": "pass", "evidence_ref": "真实内容雷达候选 → 一键升级 → 项目页面 → API 回读 → 重放同一项目，1 passed"},
    "experience": {"status": "not-requested", "evidence_ref": "沿用 CreatorOS 现有卡片、按钮和响应式层级；不冒充用户完成额外审美确认"}
  },
  "checks": [
    {"id": "AC-RADAR-UPGRADE-ACTION", "test_id": "E2E-RADAR-UPGRADE-01", "result": "pass", "evidence_ref": "两档窗口均显示并可点击一键升级项目"},
    {"id": "AC-RADAR-UPGRADE-NO-SECOND-CONFIRM", "test_id": "E2E-RADAR-UPGRADE-01", "result": "pass", "evidence_ref": "未确认候选在一次点击内完成保存和立项并直接进入项目"},
    {"id": "AC-RADAR-UPGRADE-READBACK", "test_id": "E2E-RADAR-UPGRADE-01", "result": "pass", "evidence_ref": "项目标题正式回读一致，重复立项返回同一项目"}
  ],
  "coverage": [
    {"condition": "unconfirmed-candidate", "result": "pass", "evidence_ref": "正式选题生成 runner 产出未确认候选后从页面发起升级"},
    {"condition": "regular-window", "result": "pass", "evidence_ref": "1536×1024 页面动作和说明完整可见"},
    {"condition": "minimum-window", "result": "pass", "evidence_ref": "1024×720 页面动作和说明完整可见且可点击"},
    {"condition": "promotion-replay", "result": "pass", "evidence_ref": "首次页面立项后再次提交返回相同项目标识"}
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-870-visible-copy.json",
    "artifact_sha256": "ce9dd9382f13e7dd2fed40e43233c3e6d86332f63f01eb4624b51f16aa8bae47"
  },
  "tdd_red_ref": "修复前重复立项抛状态错误且内容雷达没有一键升级动作；新增服务与组件测试先失败，修复后转绿",
  "open_defects": [],
  "status": "pass"
}
```
