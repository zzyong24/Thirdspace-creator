# 内容辅助型文生图 loop 001

日期：2026-08-12
变量：只比较 `video.broll v4` 与 `v5`；冻结三个口播主题、素材库为空、竖屏。
生成者与评委分离；评委只读匿名 A/B 文本，不查看版本、diff 或作者。

## RED 基线

v4 能选对 `process / analogy / contrast`，但只给 `visualBrief + searchQuery`：

- 没有“观众看完多理解什么”；
- 没有“为什么这里值得切画面”；
- 没有可直接交给生图模型的最终 prompt；
- C1/C2 依赖图内节点名或 Markdown/HTML 标签；
- 没有无文字、无水印、无假界面和竖屏安全区约束。

## GREEN 单变量

v5 新增 `visualClaim / reason / generationPrompt`，并将生成资格收窄为不冒充事实的
`analogy / process / contrast / mood`。`fact_evidence` 只找真实来源，`info_card` 交给
`video.cards`。创作者定位只调视觉语言，不改主张和事实。

三个新版画面关系分别是：

1. 输入—处理—输出管线中，处理中断而备用机器尚未接入；
2. 同一内容从下层档案库传到上层展厅；
3. 档案已满，但通往 AI 的连接桥断开。

## 匿名评分

评尺：[`content-support-rubric.md`](content-support-rubric.md)

| Case | 旧版 | 新版 | 变化 | 硬失败 |
| --- | ---: | ---: | ---: | ---: |
| C1 | 66 | 98 | +32 | 0 → 0 |
| C2 | 65 | 98 | +33 | 0 → 0 |
| C3 | 68 | 100 | +32 | 0 → 0 |
| 平均 | 66.33 | 98.67 | +32.33 | 新版 0 |

关键三项“认知增量 + 可见关系 + 生图可执行性”均值：`35.33 → 53.67`，提升
`18.33`。三题均未下降，满足平均 `+8`、单题不低于 `-3`、零硬失败和关键维度不下降四个晋级门。

结论：`video.broll v5` 晋级。

## REFACTOR

GREEN 后 typecheck 暴露旧分镜快照没有新字段。新字段改为 schema 可选，保证旧任务可读；v5
提示词仍要求新生成结果填写。随后补下游传递：`material.match` 能看到 `visualClaim / reason /
visualBrief`，但不接收只供文生图的 `generationPrompt`，避免把生成风格污染真实素材匹配。
