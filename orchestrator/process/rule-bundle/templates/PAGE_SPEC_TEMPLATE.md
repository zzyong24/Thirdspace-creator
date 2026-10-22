# 页面规格

> 一页/页面组的可构建、可验收契约。重点不是罗列组件，而是把“用户操作后会看到什么、
> 状态最终变成什么、下一步在哪里”写成可验证后置条件。

## 产物信息

- 阶段： `3-design`
- 状态： `draft | needs-user-confirmation | passed | accepted-risk`
- 任务编号：
- 上游 `FR` / `FLOW` / `IA` / `DEC` 编号：
- 路由或界面编号：
- 页面目的：

## 数据、操作与状态

- 所需数据与来源：
- 用户操作：
- 加载：
- 空状态：
- 错误与恢复：
- 就绪：
- 返回与刷新：
- 重复操作：
- 支持视口：正常 `<width>x<height>`；最小 `<width>x<height>`

`Not applicable` 必须带原因。不能用空白、spinner 永久挂起、整页刷新或无下一步的空/错态
冒充状态定义。

## 角色与状态的操作矩阵

当动作或可见内容依赖角色/实体状态时必填；否则写 `Not applicable: <reason>`。

| 查看者角色 \ 对象状态 | <state-A> | <state-B> |
|---|---|---|
| owner | <primary CTA / shown> | <primary CTA / shown> |
| non-owner | <primary CTA / shown> | <primary CTA / shown> |
| anonymous | <primary CTA / shown> | <primary CTA / shown> |

## 界面到服务绑定

每个真实交互只能绑定现有契约 operation，或明确标成 `planned`（可见“规划中”+ owner task）/
`static`。不存在的 API 不能被 UI 暗示为可用。

| 控件/操作 | 绑定状态 | 服务操作 | 输入/输出 | 规划项负责人 | AC-ID |
|---|---|---|---|---|---|
| <filter> | existing / planned / static | <OP-ID> | <typed shape> | <HARD/T-ID or —> | <AC-ID> |

## 用户意图到结果的转换

一行是一条用户可感知的完整转换。`即时反馈`、`最终状态`、`下一步`
和 `返回/刷新上下文` 均不可省略；局部函数正确不能替代组合状态正确。

| AC-ID | 前置状态 | 用户意图 | 即时反馈 | 最终状态 | 下一步 | 返回/刷新上下文 | TEST-ID |
|---|---|---|---|---|---|---|---|
| <AC-ID> | <before> | <user action> | <visible response> | <collection/selection/detail/write-back invariant> | <visible next step> | <preserve/reset rule> | <E2E-ID> |

### 条件项：列表与详情一致性

分类、搜索或排序改变可见集合后必须选择且只选择一种策略：`clear` 或 `auto-select`。

```text
selectedId == null || visibleIds.includes(selectedId)
detail == null || detail.id == selectedId
```

若集合为空，selection/detail 同时为空，并出现自然的下一步。不能出现“列表已经是 B，详情仍是
A”。`clear-or-reselect` 仅表示实现可采用二者之一；同一个确定转换仍须在上表写出唯一行为。

## 机器校验的旅程契约

此 block 是 `frontend-validation.mjs` 的输入；只登记必须通过的 AC、条件、两档窗口、组合状态，
以及这条旅程实际依赖的代码路径，不复制整份页面描述。`watched_paths` 使用项目内已存在的、
项目相对的 literal 文件/目录路径，覆盖页面实现、状态逻辑、adapter 和旅程测试；不要登记
BACKLOG、report、events 或生成输出。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "<T-ID>",
  "copy_guard": {
    "forbid_internal_ids": true
  },
  "watched_paths": [
    "src/<page-group>",
    "tests/e2e/<journey>.spec.ts"
  ],
  "required_checks": [
    { "id": "<AC-LIST>", "test_id": "<E2E-ID>" },
    { "id": "<AC-SELECTION>", "test_id": "<E2E-ID>" },
    { "id": "<AC-DETAIL>", "test_id": "<E2E-ID>" },
    { "id": "<AC-NEXT>", "test_id": "<E2E-ID>" }
  ],
  "required_conditions": ["loading", "empty", "error", "back", "refresh", "repeat"],
  "viewports": [
    { "width": 1440, "height": 900 },
    { "width": 1024, "height": 700 }
  ],
  "coherence_groups": [
    {
      "id": "<group-id>",
      "pattern": "master-detail",
      "control": "<category-filter>",
      "collection": "<list>",
      "selection": "<selected-id>",
      "detail": "<detail>",
      "transition": "<filter-change>",
      "policy": "clear | auto-select | clear-or-reselect",
      "check_ids": {
        "collection_matches_control": "<AC-LIST>",
        "selection_valid_or_empty": "<AC-SELECTION>",
        "detail_matches_selection_or_empty": "<AC-DETAIL>",
        "next_action_when_empty": "<AC-NEXT>"
      }
    }
  ]
}
```

没有 master-detail 结构时 `coherence_groups` 可为空，`required_checks` 仍须覆盖主旅程的即时反馈、
最终状态、下一步与上下文保持。只把真实适用且必须跑过的条件放入 `required_conditions`；列入后
不能在报告中口头豁免。strict 项目的 `watched_paths` 必须非空；路径变更时应更新契约并重新生成
验收 receipt，不能通过缩小路径范围保留旧 receipt。v2 的 `copy_guard` 还要求真实浏览器命令
导出各验收 checkpoint 的页面可见文本；标题、按钮、提示、toast、空/错态等出现 `T106`、
`T-106`、`API-203`、`FR-...` 一类控制面 ID，或 `Trace ID`、`IDEMPOTENCY_KEY_REQUIRED`、
`provider/schema/enum/webhook` 一类实现术语时直接失败。错误文案依次说明发生了什么、是否影响钱/
数据/工作、下一步怎么做；安全诊断值只作为次要、可复制的“参考编号”。内部值可留在 test id、
代码、trace 和诊断元数据里，但不得成为用户读到的解释。

## 验收与观测

- 验收项与负责人：
- 观察成功/失败所需指标：
- 无障碍要求：
- 未解决阻塞或已接受风险：

## 完成检查

- 每项结论追溯到用户输入、上游 ID、现有契约、代码证据或显式假设。
- binding、transition table 与 machine block 的 AC/TEST ID 一致。
- 页面组从产生意图到完成目标没有失联反馈、陈旧详情、丢上下文或死路。
- 新页面、实体、operation 或能力没有上游来源时，不得借“体验完善”加入范围。
