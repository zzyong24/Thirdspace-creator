# T-622 独立契约评审回执

> 评审对象：[内容雷达筛选与排序交互设计](2026-07-29-content-radar-filter-sort-design.md)、
> [内容雷达产品规格](2026-07-23-content-radar-restructure-design.md) 与
> [内容雷达服务契约](2026-07-23-content-radar-service-contract.md)
>
> 评审日期：2026-07-29
>
> 评审结论：`PASS`

## 初审发现与修正

1. 旧契约中的 `transcriptVersionId` 与“不提供逐字稿版本”的用户决策冲突；已统一删除版本语义，以唯一 transcript 行和候选 `transcriptHash` 作为绑定证据。
2. `topicState` 的候选、生成中与失败状态原先存在重叠；已确定互斥优先级：
   `converted → awaiting_confirmation → generating → attention → not_generated`。
3. 列表字段曾在不同文档中使用不同命名；已统一为
   `transcriptState / topicState / progressState`。

## 复审结论

- 无阻塞项、无重大契约歧义。
- 不新增数据表或第二份状态真相。
- 上传、重新转写与候选落地均有 backend 锁定约束，前端禁用不作为安全边界。
- 可以进入 BUILD。
