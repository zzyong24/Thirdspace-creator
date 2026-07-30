# 内容雷达筛选与排序交互设计

> Task: `T-622`  
> 日期：2026-07-29  
> 状态：待用户确认  
> 上游：[内容雷达产品规格](2026-07-23-content-radar-restructure-design.md) · [服务契约](2026-07-23-content-radar-service-contract.md)

## 1. 用户要解决的问题

内容进入雷达后，用户当前只能按来源切换、搜索标题并逐条点开判断状态。内容数量增长后，很难快速回答：

1. 哪些内容还没有逐字稿，需要先转写？
2. 哪些已经有逐字稿，但还没有生成选题？
3. 哪些选题候选还在等我确认？
4. 哪些已经进入选题池，不需要重复处理？
5. 收藏或点赞最高的内容分别有哪些？

目标不是增加一套“高级检索器”，而是在现有主从工作台里提供轻量、可组合、不会互相矛盾的筛选和排序。

## 2. 已核对的当前事实

- `intelligence.items.list` 已有服务端 `query`、`sort` 和单个 `transcriptStatus`，但 UI 固定请求 `sort: newest`。
- UI 搜索只过滤当前已加载的最多 100 条数据，不代表完整结果集。
- 当前 `sort=engagement_desc` 把点赞、评论、收藏和分享相加，不能表达“收藏最多”或“点赞最多”。
- 列表行只返回 item、latestMetric、sourceCount；逐字稿与选题转化状态只能点开详情后读取。
- 逐字稿真相在 `itemTranscripts`；选题候选/确认真相在 `intelligenceTransforms`，不需要新建状态表。
- 已确认选题必须以 `transform.status=confirmed` 且存在 `targetTopicId` 为准，不能由前端猜测。

## 3. 推荐布局

控件放在用户截图标记的中间空白区域，作为内容列表的一级工具栏；搜索保持在下一行。

```text
┌──────────────────────────── 内容列表工具栏 ────────────────────────────┐
│ [逐字稿：全部 ▾] [选题：全部 ▾] [清除筛选]        [排序：最新收录 ▾] │
├───────────────────────────────────────────────────────────────────────┤
│ 🔍 搜索标题、作者或摘要                              23 / 90 条内容 │
└───────────────────────────────────────────────────────────────────────┘
```

- “逐字稿”“选题”改变集合，放左侧。
- “排序”只改变顺序，放右侧，与筛选形成视觉分组。
- “清除筛选”仅在任一筛选生效时出现；不重置搜索和当前来源。
- 宽度不足时，两个筛选合并成一个“筛选 · N”按钮；排序继续独立显示。
- 筛选、排序和搜索在切换分类/来源时保留，离开内容雷达后恢复默认，避免旧筛选长期造成“内容丢了”的错觉。

## 4. 筛选项

### 4.1 逐字稿

| 用户看到的值 | 真实判定 |
|---|---|
| 全部 | 不限制 |
| 未提取 | `not_requested` 或 `skipped` |
| 提取中 | `queued` 或 `running` |
| 已提取 | `done` 且正文非空 |
| 失败或受阻 | `failed` 或 `blocked` |

“提取中”和“失败或受阻”不能混进“未提取”，否则用户会对正在执行的内容重复发起任务。

### 4.2 选题

| 用户看到的值 | 真实判定 |
|---|---|
| 全部 | 不限制 |
| 尚未生成 | 没有可用候选，也没有已确认 transform；失败任务仍归此项并在卡片标出失败 |
| 生成中 | 最新 transform 的执行任务为 `queued/running/pause_requested/cancel_requested` |
| 待确认 | 存在 `status=candidate` 且候选正文可用 |
| 已转为选题 | 任一 transform 为 `confirmed` 且 `targetTopicId` 非空 |
| 失败或受阻 | 没有已确认结果，且最新 transform 的任务为 `failed/blocked` |

不直接使用含糊的“未转化”：一个候选已经生成但尚未确认时，它既不是“尚未生成”，也不是“已转为选题”。拆出“待确认”后，用户知道下一步该做什么。

### 4.3 最常用组合

- 待转写：`逐字稿=未提取`
- 待生成选题：`逐字稿=已提取` + `选题=尚未生成`
- 待确认选题：`选题=待确认`
- 已完成转化：`选题=已转为选题`

第一版不额外画四个快捷按钮；组合值会完整显示在两个筛选控件上，避免工具栏拥挤。后续真实使用数据证明某个组合高频后，再增加一个快捷入口。

## 5. 排序

| 用户看到的值 | 排序规则 |
|---|---|
| 最新收录（默认） | `capturedAt DESC` |
| 收藏最多 | latest metric 的 `collectCount DESC` |
| 点赞最多 | latest metric 的 `likeCount DESC` |

互动数据为 `null` 代表未知，不得伪装成 0；未知值统一排在有真实数据的内容之后。数值相同时按 `capturedAt DESC`，最后按稳定 item id 排序，避免刷新后顺序跳动。

不把现有“综合互动”暴露给用户：把四类互动直接相加没有明确业务解释，无法替代收藏或点赞排序。

## 6. 列表反馈

- 内容卡右下角增加一个单一进度标签：`待转写 / 提取中 / 待生成选题 / 生成中 / 待确认 / 已转为选题 / 需要处理`。
- 标签由服务端列表投影返回，不逐卡请求详情，不由前端拼状态。
- 计数显示为“23 / 90 条内容”；左侧是筛选后总数，右侧是当前来源范围总数。
- 搜索、筛选或排序变化时保留旧列表并显示轻量 loading；成功后原子替换，避免整页闪白。
- 如果当前选中内容被筛掉，自动选中结果第一条；结果为空则清空详情并显示“没有符合条件的内容”和“清除筛选”。
- 请求失败时恢复变更前的控件和值，保留旧列表，并提示“筛选失败，已保留原结果”。

## 7. 契约增量

确认后扩展既有 `intelligence.items.list`，不新增平行查询接口：

```ts
type IntelligenceItemListQuery = {
  query?: string;
  sort: "newest" | "collect_desc" | "like_desc";
  transcriptState?:
    | "not_extracted"
    | "processing"
    | "extracted"
    | "attention";
  topicState?:
    | "not_generated"
    | "processing"
    | "candidate"
    | "confirmed"
    | "attention";
};
```

列表行增加只读投影：

```ts
type IntelligenceItemProgress = {
  transcriptState:
    | "not_extracted"
    | "processing"
    | "extracted"
    | "attention";
  topicState:
    | "not_generated"
    | "processing"
    | "candidate"
    | "confirmed"
    | "attention";
  actionState:
    | "needs_transcript"
    | "transcribing"
    | "needs_topic"
    | "generating_topic"
    | "needs_confirmation"
    | "converted"
    | "attention";
};
```

这些字段都是 `itemTranscripts + intelligenceTransforms + execution_tasks` 的查询投影；不复制写入、不增加第二份状态真相。

## 8. 控件绑定

| 控件/交互 | 绑定 |
|---|---|
| 逐字稿筛选 | `intelligence.items.list.transcriptState` |
| 选题筛选 | `intelligence.items.list.topicState` |
| 排序 | `intelligence.items.list.sort` |
| 搜索 | `intelligence.items.list.query`，250ms debounce |
| 状态标签 | 列表响应 `progress.actionState` |
| 清除筛选 | 本地清除两个筛选值并重新请求同一 list operation |

所有控件都有真实 operation；不画未接线按钮。

## 9. 主从状态约束

任何搜索、筛选、排序或来源切换后都必须满足：

```text
selectedId == null || visibleIds.includes(selectedId)
detail == null || detail.item.id == selectedId
```

排序变化时，只要原选中内容仍在结果集内就保持选中；筛选使其不可见时才选择第一条，避免右侧详情与中间列表不一致。

## 10. 验收

1. 使用超过 100 条的真实内容验证，搜索/筛选/排序结果不受前端加载上限影响。
2. 组合“已提取 + 尚未生成”只显示真正可以继续生成选题的内容。
3. 已确认选题即使之后有失败的重试 transform，仍归“已转为选题”。
4. 收藏/点赞未知值排在真实 0 之后，且 UI 继续显示“未知”。
5. 切换筛选后列表、选中卡片、右侧详情始终一致。
6. 正常宽度与最小桌面宽度均可操作；窄宽时控件折叠但不消失。
7. 空结果、请求失败、处理中、失败受阻均有真实反馈与下一步。

## 11. 待确认

建议确认以下范围后进入 CONTRACT/BUILD：

1. 默认仍按“最新收录”，不默认按收藏或点赞。
2. 采用两个可组合筛选（逐字稿、选题），并把“待确认”从“未转化”中独立出来。
3. 第一版不增加快捷预设按钮，优先保持工具栏清爽。
