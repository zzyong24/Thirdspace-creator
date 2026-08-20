# T-900 前端旅程验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-900",
  "contract_path": "orchestrator/T900-FRONTEND-JOURNEY.md",
  "contract_sha": "4c15b482965d",
  "commit_sha": "8aa26bf4f1832accd7ba3d532d6a7d59a3ffd224",
  "observed_at": "2026-08-20T03:10:09.000Z",
  "run": {
    "verify_key": "content-radar-one-click-project:e2e",
    "command": "CREATOROS_TEST_PORT=3439 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/content-radar-one-click-project.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "orchestrator/T900-BUILD-VALIDATION.md#真实页面旅程"
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
      {"id": "isolated-rss-partial-topic", "role": "正式来源、逐字稿与模型阶段产出的仅含改写初稿和单个辅助字段的候选"},
      {"id": "isolated-source-title-project", "role": "候选标题缺失时使用真实来源标题创建并回读的正式项目"}
    ]
  },
  "levels": {
    "logic": {"status": "pass", "evidence_ref": "改写初稿成为唯一创作完整度门，辅助字段缺失不阻断，来源标题回退与幂等回归通过"},
    "surface": {"status": "pass", "evidence_ref": "orchestrator/evidence/T-900-visible-copy.json"},
    "journey": {"status": "pass", "evidence_ref": "真实内容来源 → 手工逐字稿 → 局部模型输出 → 两条主动作可用 → 一键升级 → 项目回读 → 重放同一项目，1 passed"},
    "experience": {"status": "not-requested", "evidence_ref": "沿用 CreatorOS 现有内容雷达布局；本任务只放宽阻断规则，不冒充额外审美验收"}
  },
  "checks": [
    {"id": "AC-RADAR-PARTIAL-ACTION", "test_id": "E2E-RADAR-PARTIAL-01", "result": "pass", "evidence_ref": "仅有非空改写初稿时，确认写入选题池与一键升级项目在两档窗口均可点击"},
    {"id": "AC-RADAR-PARTIAL-SOURCE-TITLE", "test_id": "E2E-RADAR-PARTIAL-01", "result": "pass", "evidence_ref": "候选标题缺失时使用真实来源作品标题，未伪造观众痛点、核心冲突或内容形式"},
    {"id": "AC-RADAR-PARTIAL-READBACK", "test_id": "E2E-RADAR-PARTIAL-01", "result": "pass", "evidence_ref": "创建后的项目标题、来源和改写稿正式回读一致，重复立项返回同一项目"}
  ],
  "coverage": [
    {"condition": "partial-topic-candidate-with-draft", "result": "pass", "evidence_ref": "模型漏出候选标题、受众、痛点、冲突和内容形式时仍可继续"},
    {"condition": "regular-window", "result": "pass", "evidence_ref": "1536×1024 页面动作和说明完整可见"},
    {"condition": "minimum-window", "result": "pass", "evidence_ref": "1024×720 页面动作和说明完整可见且可点击"},
    {"condition": "promotion-replay", "result": "pass", "evidence_ref": "首次页面立项后再次提交返回相同项目标识"}
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-900-visible-copy.json",
    "artifact_sha256": "8dd619b5c922826d40a84c1898dabce3996b01672c915917f3d49f2c5e2256fb"
  },
  "tdd_red_ref": "orchestrator/T900-BUILD-VALIDATION.md#tdd-red",
  "open_defects": [],
  "status": "pass"
}
```
