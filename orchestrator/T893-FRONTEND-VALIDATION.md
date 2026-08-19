# T-893 前端旅程验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-893",
  "contract_path": "orchestrator/T893-FRONTEND-JOURNEY.md",
  "contract_sha": "978fc25d7238",
  "commit_sha": "7c83551501c6b29d8929b25ebcd809d7242ca4a3",
  "observed_at": "2026-08-19T04:00:09.000Z",
  "run": {
    "verify_key": "content-radar-one-click-project:e2e",
    "command": "CREATOROS_TEST_PORT=3439 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/content-radar-one-click-project.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "orchestrator/T893-BUILD-VALIDATION.md#真实浏览器验收"
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
      {"id": "isolated-w3c-rss-item", "role": "公开 RSS 通过正式采集服务写入隔离账号的真实作品"},
      {"id": "isolated-long-manual-transcript", "role": "页面粘贴 15479 字并通过正式 uploadManual 服务保存和回读的逐字稿"}
    ]
  },
  "levels": {
    "logic": {"status": "pass", "evidence_ref": "纯文本调用硬超时、任务续租、启动恢复消费与原子领取测试通过"},
    "surface": {"status": "pass", "evidence_ref": "orchestrator/evidence/T-893-visible-copy.json"},
    "journey": {"status": "pass", "evidence_ref": "公开 RSS 采集作品 → 长逐字稿弹窗 → 两档窗口 → 页面保存读回 → 选题生成与一键立项，1 passed"},
    "experience": {"status": "not-requested", "evidence_ref": "沿用 CreatorOS 现有弹窗视觉；本轮只验证操作区不出屏与正文内部滚动"}
  },
  "checks": [
    {"id": "AC-TRANSCRIPT-DIALOG-SAVE", "test_id": "E2E-TRANSCRIPT-DIALOG-01", "result": "pass", "evidence_ref": "1536×1024 与 1024×720 均能看到并点击保存逐字稿，底边不超过视口"}
  ],
  "coverage": [
    {"condition": "real-collected-item", "result": "pass", "evidence_ref": "W3C 公开 RSS 经正式同步服务采集到隔离账号"},
    {"condition": "long-transcript", "result": "pass", "evidence_ref": "15479 字正文的 scrollHeight 大于 clientHeight，正文内部滚动"},
    {"condition": "regular-window", "result": "pass", "evidence_ref": "1536×1024 弹窗标题、正文和保存操作完整可用"},
    {"condition": "minimum-window", "result": "pass", "evidence_ref": "1024×720 保存按钮仍在视口内且可点击"},
    {"condition": "write-readback", "result": "pass", "evidence_ref": "页面调用 intelligence.transcripts.uploadManual 后弹窗关闭并继续真实生成旅程"}
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-893-visible-copy.json",
    "artifact_sha256": "7548403f62851a2f31e3715a8dccbd927f7f53574f61b3be499656fb407e8e3e"
  },
  "tdd_red_ref": "修复前 provider 永不返回时超时回归连续三次在测试上限内挂起；旧代码没有 topic_preview 启动消费者，长逐字稿弹窗也没有视口上界和内部滚动区",
  "open_defects": [],
  "status": "pass"
}
```
