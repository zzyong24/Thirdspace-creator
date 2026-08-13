# T-802 BUILD Gate — 可组合 Scene Graph 跨主题动效

日期：2026-08-13

状态：PASS（正式 Skill、独立 judge、真实 Chromium 全输出帧、12 条实际 MP4）

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-802",
  "contract_path": "orchestrator/T802-FRONTEND-JOURNEY.md",
  "contract_sha": "7eedbc3b84aa",
  "commit_sha": "eb8ddc1810224fd787c9d31d1343ebeb515dd029",
  "observed_at": "2026-08-13T09:00:00.000Z",
  "run": {
    "verify_key": "scene-graph-loop:e2e",
    "command": "node orchestrator/process/verify-t802-scene-graph.mjs",
    "exit_code": 0,
    "output_ref": "真实 Chromium 在 6 个主题、横竖双画幅、24fps 全输出帧上通过"
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
      { "id": "cross-theme-minimax-output", "role": "MiniMax-M3 通过 official Skill 生成的匿名候选" },
      { "id": "independent-codex-judge", "role": "与生成模型隔离的内容评审结果" },
      { "id": "hyperframes-final-samples", "role": "正式 renderer 生成的 12 条横竖 MP4" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "v4 schema、严格原文溯源、引用、动作方向与降级测试通过" },
    "surface": { "status": "pass", "evidence_ref": "6 个赢家的实际 DOM/GSAP 三轴指纹 100% 唯一" },
    "journey": { "status": "pass", "evidence_ref": "真实 Chromium 检查 6×2×288 个画面时点，零碰撞、零越界、零降级" },
    "experience": { "status": "not-requested", "evidence_ref": "独立内容评尺与机器视觉验收不冒充用户主观审美确认" }
  },
  "checks": [
    { "id": "AC-SCENE-V4", "test_id": "E2E-SCENE-01", "result": "pass", "evidence_ref": "候选文件锁定 video.cards@v4；设置 official registry 测试同正文" },
    { "id": "AC-SCENE-DIVERSITY", "test_id": "E2E-SCENE-02", "result": "pass", "evidence_ref": "6/6 完整三轴指纹唯一；contrast 与 sequence 同关系组各轴均至少 3 种" },
    { "id": "AC-SCENE-SAFETY", "test_id": "E2E-SCENE-03", "result": "pass", "evidence_ref": "3456 个输出画面时点零文字/物件碰撞、零出界、零页面异常" },
    { "id": "AC-SCENE-BOTH-ASPECTS", "test_id": "E2E-SCENE-04", "result": "pass", "evidence_ref": "6 个主题均输出 1920×1080 与 1080×1920 的真实 MP4" }
  ],
  "coverage": [
    { "condition": "real-chromium", "result": "pass", "evidence_ref": "Playwright 启动真实 Chromium 并加载正式模板 HTML" },
    { "condition": "six-cross-theme-winners", "result": "pass", "evidence_ref": "独立 judge 六个最终赢家 87/89/91/89/91/93" },
    { "condition": "landscape-delivery", "result": "pass", "evidence_ref": "6 条 1920×1080 MP4 与完整逐帧浏览器审计" },
    { "condition": "portrait-delivery", "result": "pass", "evidence_ref": "6 条 1080×1920 MP4 与完整逐帧浏览器审计" },
    { "condition": "all-output-frames", "result": "pass", "evidence_ref": "每画幅 288 个帧中点，12 画幅共 3456 个" },
    { "condition": "no-scene-fallback", "result": "pass", "evidence_ref": "12 个正式 HTML 的 sceneCount 均大于 0，fallbackCount 为 0" }
  ],
  "tdd_red_ref": "实现前 v3 Skill 测试期待 v4 失败；runner 接受追加伪主张；renderer 对不同 scene 使用同一固定机器结构。实现后对应测试转绿。",
  "open_defects": [],
  "status": "pass"
}
```

## 自动 Loop 结果

首轮独立 judge 将 `customer-evidence` 评为 83 分、非套版 9/15，未达晋级门。系统把具体扣分反馈
回灌同一个 `video.cards@v4` Skill，只重跑该题两个候选；独立复判选出 93 分、非套版 13/15 的
“消息信号→付费强度→小单验证后放大”机制，再重新运行全局横竖逐帧审计并保持 PASS。

完整候选、评审、逐帧报告、接触表与 MP4 见
`output/content-samples/composable-scene-graph-loop/README.md`。
