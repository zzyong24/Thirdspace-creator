# 决策模式库（Decision Patterns）

> 按具体技术取舍检索的补充材料；普通任务不预读整个库。先按公共规则选择最小满足需求的实现，只有未决重大取舍才打开对应卡。卡内证据用于解释选择，不自动新增审批或双写账本。

## 模式索引
| ID | 模式 | 一句话 | 默认 |
|---|---|---|---|
| [PAT-001](patterns/PAT-001-borrow-vs-build.md) | Borrow-before-Build 先借后造 | 现有能力不足时比较采用/适配/fork/自研 | 最小满足当前合同的方案 |
| [PAT-002](patterns/PAT-002-inmemory-vs-real-db.md) | 内存/嵌入 vs 真 DB | 持久化底座选型 | 真 DB,除非纯测试夹具 |
| [PAT-003](patterns/PAT-003-sync-vs-async.md) | 同步 vs 异步 | 耗时/后台操作 | >2s 或后台 → async 任务化 |
| [PAT-004](patterns/PAT-004-contract-first-vs-direct.md) | 契约优先 vs 直写 | 跨边界数据交换 | 跨边界 → 契约优先 |

## 按需入口

| 当前取舍 | 参考 |
|---|---|
| CONTRACT / BUILD 中现有能力不足，需新增依赖或非平凡自研 | PAT-001 |
| 持久化底座选型 | PAT-002 |
| 同步与异步执行边界 | PAT-003 |
| 跨边界数据合同 | PAT-004 |

模式卡给出证据问题和建议默认；具体项目合同与当前用户要求优先。未知事实先验证，不因卡片缺项自动扩大实现。
