# T-853 稿面素材真实预览验收报告

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-853",
  "contract_path": "orchestrator/T853-FRONTEND-JOURNEY.md",
  "contract_sha": "144cba0e6e37",
  "commit_sha": "97076f621ba5e7ee0d9c64d2fc0a64c4194f1435",
  "observed_at": "2026-08-16T13:43:48.000Z",
  "run": {
    "verify_key": "draft-ammo-media-preview:e2e",
    "command": "CREATOROS_TEST_PORT=3438 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/draft-ammo-media-preview.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "orchestrator/T853-BUILD-VALIDATION.md#真实页面旅程"
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
      {"id": "isolated-project-video", "role": "正式上传接口写入的真实 MP4 字节与项目用料链"},
      {"id": "signed-range-read", "role": "弹层打开后 assets.downloadUrl 换签名地址并完成 206 Range 读取"}
    ]
  },
  "levels": {
    "logic": {"status": "pass", "evidence_ref": "后端 32 项、前端 43 项聚焦测试通过；前后端类型检查通过"},
    "surface": {"status": "pass", "evidence_ref": "两档窗口均显示中文视频预览弹层与原生播放控制，弹层未越界"},
    "journey": {"status": "pass", "evidence_ref": "真实上传视频 → 双击预览 → 关闭刷新 → 紧凑窗口键盘预览，全程 1 passed"},
    "experience": {"status": "pass", "evidence_ref": "复用素材中心预览视觉与失败占位；关闭读屏文案从 Close 统一为关闭"}
  },
  "checks": [
    {"id": "AC-AMMO-VIDEO-LIVE-PREVIEW", "test_id": "E2E-T853-01", "result": "pass", "evidence_ref": "真实 MP4 在弹层中形成 controls 视频播放器且 readyState > 0"},
    {"id": "AC-AMMO-PREVIEW-LAZY-OFFICIAL-URL", "test_id": "E2E-T853-01", "result": "pass", "evidence_ref": "打开前下载地址请求为 0，双击后正式 assets.downloadUrl 恰好调用一次"},
    {"id": "AC-AMMO-PREVIEW-KEYBOARD", "test_id": "E2E-T853-01", "result": "pass", "evidence_ref": "刷新后聚焦素材卡按 Enter 成功打开同一播放器"},
    {"id": "AC-AMMO-PREVIEW-REFRESH-COMPACT", "test_id": "E2E-T853-01", "result": "pass", "evidence_ref": "900×720 刷新回读后弹层完整位于视口内"}
  ],
  "coverage": [
    {"condition": "real-uploaded-video-bytes", "result": "pass", "evidence_ref": "209KB MP4 经 create → PUT → complete 正式上传链写入"},
    {"condition": "official-assets-download-url", "result": "pass", "evidence_ref": "播放器地址来自正式 dispatch，浏览器实际读取返回 206"},
    {"condition": "page-refresh", "result": "pass", "evidence_ref": "page.reload 后服务端重新装配同一项目素材"},
    {"condition": "regular-and-compact-viewports", "result": "pass", "evidence_ref": "1536×1024 与 900×720 均完成操作"}
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-853-visible-copy.json",
    "artifact_sha256": "300b75440af11e617938000c20f430414c171edf236c3f16db7b0e87ca3aeef8"
  },
  "tdd_red_ref": "orchestrator/T853-BUILD-VALIDATION.md#red",
  "open_defects": [],
  "status": "pass"
}
```
