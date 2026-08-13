# T-794 BUILD Gate — 内容驱动动效卡片与虚线网格

日期：2026-08-12

状态：PASS（Skill、内部契约、确定性渲染与真实 Chromium；不含用户真实模型端到端出片）

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
