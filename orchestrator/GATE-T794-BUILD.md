# T-794 BUILD Gate — 内容驱动动效卡片与虚线网格

日期：2026-08-12

状态：PASS（Skill、内部契约、确定性渲染与真实 Chromium；不含用户真实模型端到端出片）

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-794",
  "contract_path": "orchestrator/T794-FRONTEND-JOURNEY.md",
  "contract_sha": "5331b21b16b1",
  "commit_sha": "d7118da859cc72a0011f6500a605ab32c8777b9a",
  "observed_at": "2026-08-12T19:31:00.000Z",
  "run": {
    "verify_key": "motion-card-preview:e2e",
    "command": "node orchestrator/process/verify-t794-motion-card-preview.mjs",
    "exit_code": 0,
    "output_ref": "真实 Chromium 横竖两档、五种关系、字幕安全区与虚线网格全部通过"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Chromium headless shell 1223 / Playwright 1.60 / Node 25.9",
    "viewports": [
      { "width": 1920, "height": 1080, "result": "pass" },
      { "width": 1080, "height": 1920, "result": "pass" }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      { "id": "official-render-template", "role": "正式视频模板与时间线" },
      { "id": "content-relation-set", "role": "五种冻结内容关系" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "原文溯源、必要角色与坏计划降级测试通过" },
    "surface": { "status": "pass", "evidence_ref": "五种关系独立结构与静态虚线网格在两档画幅可见" },
    "journey": { "status": "pass", "evidence_ref": "正式模板生成本地成片页面并由真实浏览器加载时间线" },
    "experience": { "status": "not-requested", "evidence_ref": "机器验收不冒充用户主观观看确认" }
  },
  "checks": [
    { "id": "AC-MOTION-RELATIONS", "test_id": "E2E-MOTION-01", "result": "pass", "evidence_ref": "数字、对比、步骤、因果、建立后推翻均有独立结构" },
    { "id": "AC-MOTION-SAFE-AREA", "test_id": "E2E-MOTION-02", "result": "pass", "evidence_ref": "两档画幅内全部未越界且与字幕至少保留 20 像素间隔" },
    { "id": "AC-MOTION-GRID", "test_id": "E2E-MOTION-03", "result": "pass", "evidence_ref": "正式成片页面含 64 像素低对比静态细虚线网格" },
    { "id": "AC-MOTION-FALLBACK", "test_id": "TEST-MOTION-04", "result": "pass", "evidence_ref": "坏计划只移除计划，合法旧卡和旧 motion 继续渲染" }
  ],
  "coverage": [
    { "condition": "real-chromium", "result": "pass", "evidence_ref": "Playwright 启动本机真实 Chromium 并加载正式模板页面", "reason": "" },
    { "condition": "five-content-relations", "result": "pass", "evidence_ref": "五个关系标记与页面结构逐一核验", "reason": "" },
    { "condition": "landscape-delivery", "result": "pass", "evidence_ref": "1920×1080 逐卡浏览器几何核验", "reason": "" },
    { "condition": "portrait-delivery", "result": "pass", "evidence_ref": "1080×1920 逐卡浏览器几何核验", "reason": "" },
    { "condition": "subtitle-safe-area", "result": "pass", "evidence_ref": "横版卡片底边 702/字幕顶边 954；竖版 1762/1794", "reason": "" },
    { "condition": "invalid-plan-fallback", "result": "pass", "evidence_ref": "runner 聚焦测试覆盖不可溯与角色不完整计划", "reason": "" }
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-794-visible-copy.json",
    "artifact_sha256": "45a3f9f1a201875d5d1c73fffaddcf2ab6cb0fdc7eb7285ac1c28d88e6828eda"
  },
  "tdd_red_ref": "v2 测试先失败于旧模板仍为 v1 且 visualPlan 不存在；实现后聚焦测试转绿。",
  "open_defects": [],
  "status": "pass"
}
```

## 落地范围

- `video.cards v1 → v2`：新增可选 `visualPlan`，先声明 magnitude、contrast、sequence、
  cause_effect、replacement、statement，再提供 1–6 个口播原文部件。
- runner：对每个部件执行原文溯源和协议 role/数量/长度边界；坏计划只移除计划，不删除合法旧卡。
- 内部渲染契约与组装器：向后兼容透传 visualPlan，旧候选仍按 `kind/motion` 渲染。
- HyperFrames/GSAP：五种核心关系有独立 DOM 和渐进配方；statement 也有分片揭示配方。
- 背景：全片原低亮实线网格改为 64px 静态细虚线网格，继续叠加局部辉光。
- 不新增页面、数据库、公开 API、第二套视频引擎或音效。

## TDD 证据

RED：

- `video-decisions.test.ts` 首次运行 1 条失败：模板版本仍是 v1，visualPlan schema 不存在。
- 同批 runner / assembler / renderer 红测先写后实现，分别锁定原文溯源、契约透传和五种独立关系 DOM。

GREEN：

```text
ai-worker focused: 1 file / 9 tests PASS
backend focused: 2 files / 126 tests PASS
frontend assembler: 1 file / 8 tests PASS
backend full suite: 224 files PASS / 2 skipped; 2824 tests PASS / 4 skipped
ai-worker full suite: 47 files / 355 tests PASS
ai-worker / backend / frontend / contract typecheck: PASS
```

## 评分 Loop

- 冻结三题：数字量级、流程因果、保存对话≠理解用户。
- v1 平均 `68.67`，v2 平均 `96.33`，提升 `+27.66`。
- 单题提升 `+26 / +27 / +30`，关系可见+渐进揭示平均 `24.67 → 38.67`，新版零硬失败。
- 完整记录：`ai-worker/evals/motion-card/2026-08-12-iteration-1-results.md`。

## 真实浏览器验收

`node orchestrator/process/verify-t794-motion-card-preview.mjs` 在正式模板 HTML 与 GSAP 时间线上运行：

- Chromium 横版 `1920×1080`、竖版 `1080×1920` 均 PASS；
- 五类关系全部存在独立 DOM，主时间线为 15 秒；
- 横版视觉区 `(168,298,964,404)`，底边 702，字幕顶边 954；
- 竖版视觉区 `(78,1358,964,404)`，底边 1762，字幕顶边 1794；
- 全部在画布内且未侵入字幕安全区；HTML 包含真实细虚线网格。

## 诚实边界

本 Gate 证明 Skill 契约、溯源门、渲染器和真实浏览器版式工作。评分是基于冻结样本的自评，不冒充
独立盲评；当前没有调用用户实际配置的模型重新生成完整 `video_decisions` 并渲染一条真实人物成片。
若真实模型不产 `visualPlan`，系统会诚实走旧兼容路径；下一轮应优化 Skill 示例，不让代码按词面猜关系。
