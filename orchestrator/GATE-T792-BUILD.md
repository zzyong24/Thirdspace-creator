# T-792 BUILD Gate — 内容辅助型文生图提示词

日期：2026-08-12
状态：PASS（提示词与 Skill 切片；不含跨供应商真实成图审美保证）

## 范围

- `video.broll v4 → v5`：画面认知任务、理由与跨供应商 `generationPrompt`；
- `material.generate`：通用生图调用说明与 prompt 字段说明；
- `cover.brief v1 → v2` 与封面确定性 prompt：单一主视觉关系、指定短文案和额外文字约束；
- 真实素材匹配继续消费认知与理由，但不消费仅供文生图的风格 prompt；
- 不新增页面、API、数据库、模型参数、供应商或第二套生成链。

## TDD 证据

RED（修改 Skill 前）：

- `ai-worker/src/prompt/templates/video-decisions.test.ts`：2 条失败，证实现版无新字段且仍为 v4；
- `backend/src/modules/ai-runtime/chat-tools.test.ts`：1 条失败，证实通用工具仍是裸 prompt 说明；
- `backend/src/modules/ai-runtime/cover-runner.test.ts`：1 条失败，证实封面 prompt 无单一关系、额外文字与水印约束；
- `backend/src/modules/ai-runtime/video-decisions-runner.test.ts`：1 条失败，证实新认知/理由尚未传给素材匹配。

GREEN：

```text
ai-worker prompt tests: 23 files / 143 tests PASS
backend focused tests: 4 files / 289 tests PASS
ai-worker typecheck: PASS
backend typecheck: PASS
semantic-boundary-scan: PASS
boundary-scan: 0 新增违规（既有基线 5）
orphan-scan: 0 error（既有 100 warnings）
```

## Skill 前向评估

- 三个冻结主题由独立生成者按 v4 取 RED、按 v5 重新生成；
- 独立评委按匿名混排评分，不读取版本映射；
- 总分均值 `66.33 → 98.67`，变化 `+32.33`；
- 单题 `+32 / +33 / +32`；
- 关键三项均值 `35.33 → 53.67`；
- 新版零硬失败，满足全部晋级门。

完整记录：[`content-support-loop-001.md`](../ai-worker/evals/image-prompt/content-support-loop-001.md)

## 公开调研与边界

调研仅使用 OpenAI、Google Cloud 与 Midjourney 官方资料，结论与落点见
[`2026-08-12-content-supporting-image-prompt-research.md`](../docs/research/2026-08-12-content-supporting-image-prompt-research.md)。

本 Gate 证明提示词结构、事实边界、兼容性与跨题前向表现；不同用户自配生图供应商的最终画风、
文字能力与一致性仍由各自模型决定。本轮没有用某一个供应商的成图冒充所有供应商都已真机通过。
