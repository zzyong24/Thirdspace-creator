# T-790 BUILD Gate — `script.draft` 文案 Skill 迭代

日期：2026-08-12
状态：PASS

## 结果

- 正式写稿方法从 `v7` 升为 `v8`：用一个旧判断与一个新判断组织整条口播，选择 2–3 种不同施压动作连续推进，不再把钩子、痛点、价值、卡点、CTA 当成并列槽位硬填。
- 定位只影响论敌、作者立场、证据选择和语气，不复制“三把刀”的粗口、编号、反问或原句表面特征。
- T-791 在此基础上把完整资料输入补入模板，最终随包版本为 `v9`；`v8` 的写法纪律和盲评胜出变量保持不变。

## TDD 与回归

```text
ai-worker script.draft / grounding / completion-policy tests: PASS
backend script runner / chat tool contract tests: PASS
schema、候选采纳门、shots[] 输出契约: 未改变
semantic-boundary-scan: PASS
boundary-scan: 0 新增违规（既有基线 5）
```

## 匿名评估

冻结三题、基线 `v7`、单变量挑战与专用 `sanbadao-copy-scorer` 盲评记录见
[`sanbadao-loop-001.md`](../ai-worker/evals/script-draft/sanbadao-loop-001.md)。正式 `v8`
平均 `86 → 100`（`+14`），三题分别 `+17 / +18 / +7`，说服核心不下降，零硬失败。
