# T-881 前端旅程验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-881",
  "contract_path": "orchestrator/T881-FRONTEND-JOURNEY.md",
  "contract_sha": "ae9684481041",
  "commit_sha": "a21552378d4bf1725381e498bd6363d04ae9c196",
  "observed_at": "2026-08-18T05:21:37.000Z",
  "run": {
    "verify_key": "production-broll-remove:e2e",
    "command": "CREATOROS_TEST_PORT=3440 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/production-broll-remove.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "orchestrator/T881-BUILD-VALIDATION.md#真实页面旅程"
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
      {"id": "isolated-uploaded-video", "role": "经正式上传接口写入隔离项目的真实 mp4 素材"},
      {"id": "isolated-confirmed-editing-plan", "role": "经正式制作服务保存并由页面读取的已确认分镜"}
    ]
  },
  "levels": {
    "logic": {"status": "pass", "evidence_ref": "原子删除、并发版本冲突、旧任务隔离、失败兜底和渲染输入防线回归均通过"},
    "surface": {"status": "pass", "evidence_ref": "orchestrator/evidence/T-881-visible-copy.json"},
    "journey": {"status": "pass", "evidence_ref": "真实视频上传 → 确认分镜 → 页面剔除 → 接口回读 → 最小窗口刷新，1 passed"},
    "experience": {"status": "not-requested", "evidence_ref": "沿用 CreatorOS 现有分镜卡片与剔除动作，不冒充用户完成额外审美确认"}
  },
  "checks": [
    {"id": "AC-BROLL-REMOVE-PERSIST", "test_id": "E2E-BROLL-REMOVE-01", "result": "pass", "evidence_ref": "页面剔除后正式保存新的当前分镜，四处素材引用同时清空"},
    {"id": "AC-BROLL-REMOVE-READBACK", "test_id": "E2E-BROLL-REMOVE-01", "result": "pass", "evidence_ref": "正式读取接口返回的新分镜不再包含被剔除素材"},
    {"id": "AC-BROLL-REMOVE-REFRESH", "test_id": "E2E-BROLL-REMOVE-01", "result": "pass", "evidence_ref": "1024×720 刷新后仍显示已剔除状态，素材未回到当前分镜"}
  ],
  "coverage": [
    {"condition": "confirmed-storyboard", "result": "pass", "evidence_ref": "从正式服务保存的已确认分镜发起剔除"},
    {"condition": "real-video-asset", "result": "pass", "evidence_ref": "隔离项目使用真实 mp4 上传素材"},
    {"condition": "regular-window", "result": "pass", "evidence_ref": "1536×1024 完成剔除并显示保存结果"},
    {"condition": "minimum-window", "result": "pass", "evidence_ref": "1024×720 页面动作、说明和分镜预览可见"},
    {"condition": "refresh-readback", "result": "pass", "evidence_ref": "页面刷新后从正式接口回读，仍保持剔除"}
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-881-visible-copy.json",
    "artifact_sha256": "6cacc70449b8c33656cd7fa8479835e40101ca0dcc61e96e46e4e685b0493780"
  },
  "tdd_red_ref": "修复前页面剔除只改本地状态，已确认分镜、渲染输入和失败兜底仍保留旧素材；新增服务、页面与真实浏览器回归先失败，修复后转绿",
  "open_defects": [],
  "status": "pass"
}
```
