# T-803 BUILD Gate — Scene Graph 主体比例与双画幅重排

日期：2026-08-13

状态：PASS（真实 Chromium、双画幅全输出帧、12 条实际 MP4）

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-803",
  "contract_path": "orchestrator/T803-FRONTEND-JOURNEY.md",
  "contract_sha": "967ff077c1f8",
  "commit_sha": "a4404d8cd869a9ebafeef3d21578b92228280c0a",
  "observed_at": "2026-08-13T09:32:44.000Z",
  "run": {
    "verify_key": "scene-graph-loop:e2e",
    "command": "node orchestrator/process/verify-t802-scene-graph.mjs",
    "exit_code": 0,
    "output_ref": "真实 Chromium 检查 6 个主题、横竖双画幅、24fps 全输出帧，并验证主体占比与对象分离"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Chromium headless shell / Playwright 1.60 / Node 25.9",
    "viewports": [
      { "width": 1920, "height": 1080, "result": "pass" },
      { "width": 1080, "height": 1920, "result": "pass" }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      { "id": "cross-theme-selected-scenes", "role": "正式内容 Skill 已选中的六组跨主题 Scene Graph" },
      { "id": "hyperframes-renders", "role": "正式渲染器输出的十二条横竖视频" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "主体按对象数量和画幅分档，位置按归一化舞台中心计算" },
    "surface": { "status": "pass", "evidence_ref": "实测联合宽度 64.9%–98.1%、高度 53.4%–84.0%，最大单体面积不低于 9.1%" },
    "journey": { "status": "pass", "evidence_ref": "3456 个输出画面时点零文字碰撞、零出界、零降级；计划态主体最大相交 12.6%" },
    "experience": { "status": "not-requested", "evidence_ref": "已人工查看横竖总览和四时点分镜，但不冒充用户最终审美确认" }
  },
  "checks": [
    { "id": "AC-VISUAL-SCALE", "test_id": "E2E-T803-01", "result": "pass", "evidence_ref": "所有实际 Scene Graph 均超过联合宽高和最大单体面积硬门" },
    { "id": "AC-ASPECT-REFLOW", "test_id": "E2E-T803-02", "result": "pass", "evidence_ref": "横屏采用左右/宽路径构图，竖屏采用上下层级重排，不使用整体缩小" },
    { "id": "AC-OBJECT-SEPARATION", "test_id": "E2E-T803-03", "result": "pass", "evidence_ref": "主体计划态最大相交 12.6%，低于 18% 硬门" },
    { "id": "AC-ALL-FRAMES-SAFE", "test_id": "E2E-T803-04", "result": "pass", "evidence_ref": "6×2×288 个画面时点零文字/运动物件碰撞、零越界、零页面异常" }
  ],
  "coverage": [
    { "condition": "real-chromium", "result": "pass", "evidence_ref": "Playwright 启动真实 Chromium 加载正式模板 HTML" },
    { "condition": "six-cross-theme-winners", "result": "pass", "evidence_ref": "复用六个已独立评审晋级的跨主题胜者" },
    { "condition": "landscape-wide-composition", "result": "pass", "evidence_ref": "六条 1920×1080 样片按宽舞台重新定位主体" },
    { "condition": "portrait-vertical-reflow", "result": "pass", "evidence_ref": "六条 1080×1920 样片按上下层级重新定位主体" },
    { "condition": "all-output-frames", "result": "pass", "evidence_ref": "每个画幅覆盖 288 个帧中点，共 3456 个" },
    { "condition": "twelve-real-mp4", "result": "pass", "evidence_ref": "HyperFrames 以 24fps 实际重渲染 12 条 12 秒 MP4" }
  ],
  "tdd_red_ref": "T-803 测试在旧版 420×290/480×190 小主体尺寸上先失败；引入 hero/medium/dense 双画幅分档与归一化重排后转绿。",
  "open_defects": [],
  "status": "pass"
}
```
