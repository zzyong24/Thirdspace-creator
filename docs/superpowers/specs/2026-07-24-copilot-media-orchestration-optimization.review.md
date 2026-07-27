# T-510 Copilot 媒体工具编排优化 SPEC 独立评审记录

## Round 1

- 日期：2026-07-24
- review mode：cross-family
- reviewer：`gpt-5.6-sol`
- verdict：`FAIL`
- 原始结论：方案方向基本合理，但“仅粘贴链接即自动建档”违反候选采纳不变量且无 DEC；
  价值验证、现网证据及异步契约未达到开工标准。

### Findings 处置

| 严重度 | Finding | 处置 |
|---|---|---|
| blocker | 仅链接即建档违反“AI 候选、用户采纳后写库” | **接受**。改为只读 preview；点击“建档”或本条明确保存/转写动作后才写库 |
| major | 缺 Value & viability | **接受**。补五类风险、替代品、四个否决形态、RAT、成功阈值、pre-mortem、PR-FAQ |
| major | 缺 OSS/现成方案调研 | **接受**。比较现有 ai_tasks、Temporal、BullMQ、XState，采用内部持久任务 |
| major | provider/asset/vision 断言无 file:line | **接受**。新增现网事实表，并把 T-501 未交付项明确列为发布 Gate |
| major | share/transcript/checkpoint 断言无证据 | **接受**。补 contract/service/schema/runner/file:line |
| major | 异步父任务行为不唯一 | **接受**。补父任务状态机、首次响应、事务边界、checkpoint、lease、重启扫描 |
| major | 幂等键由模型填写且算法不明 | **接受**。从工具入参移除，由 backend 派生 provisional/canonical key 并定义冲突读回 |
| major | “已使用参考图”不可证明 | **接受**。改为四阶段 evidence；无 provider 独立回执只写“已随请求提交” |
| major | FR/NFR 存在孤儿要求 | **接受**。补 requirement→contract→责任层→AC/TEST 追踪表 |

所有 finding 都有明确规格修订，无驳回项。Round 2 复审前不进入 CONTRACT/BUILD。

## Round 2

- 日期：2026-07-24
- review mode：cross-family
- reviewer：`gpt-5.6-sol`
- verdict：`CONCERNS`
- 原始结论：方向与授权边界符合宪法，但 canonical 幂等并发、父任务状态模型、能力探针有效性
  及价值论证仍有可执行性缺口。

### Findings 处置

| 严重度 | Finding | 处置 |
|---|---|---|
| major | canonical key 未原子占用，短长链并发仍会重复 | **接受**。新增 canonical binding 唯一行，副作用前 `INSERT … ON CONFLICT` 原子选 winner |
| major | ai_tasks 六态与 workflow state 混淆，承诺取消但无规格 | **接受**。新增 1:1 workflow 表、状态映射及三个取消时点语义 |
| major | reference verified 未绑定当前配置 | **接受**。补 config fingerprint、7 天 TTL、设置变更原子失效及负测 |
| major | `asset.visual.inspect` 待建无反证 | **接受**。补 CodeGraph + rg 可复现空结果 |
| major | referenceImage 独立探针待建无反证 | **接受**。补 CodeGraph + rg 可复现空结果并区分 adapter 与 probe |
| major | 父组合状态机待建无反证 | **接受**。补 CodeGraph + rg 空结果并明确只借现有机制先例 |
| major | 替代品“切换触发”不是观测条件 | **接受**。为五个方案补阈值与检验时点 |
| major | T-501 依赖与迁移成本缺失 | **接受**。补依赖风险行、功能关闭 Gate 和 additive 零用户迁移 FAQ |
| minor | 追踪矩阵缩写不稳定、范围映射 | **接受**。全部改为完整 ID，并拆分 FR-MO-005/006/007 |

Round 3 是本工件最后一轮复审；未 PASS 则按 Gate 规则回 PLAN，而不继续原地磨。

## Round 3（最终轮）

- 日期：2026-07-24
- review mode：cross-family
- reviewer：`gpt-5.6-sol`
- verdict：`FAIL`
- 原始结论：定位、复用边界和价值论证已较完整，但建档前幂等屏障的执行顺序自相矛盾，
  取消与 ASR 入队之间也缺少原子并发契约。

### Findings 与裁决

| 严重度 | Finding | 裁决 |
|---|---|---|
| blocker | 现有 `share_import` 先写库后才得到 externalWorkId，但 canonical binding 又要求持久副作用前用 externalWorkId 抢占，顺序不可能成立 | **接受，退回 PLAN**。下一版必须把导入语义重构为“只读 resolve externalWorkId → 原子抢占 canonical binding → winner persist，loser 关联退出”，不能在本版继续补丁式改写 |
| major | 取消写入与 transcript enqueue 没有共享串行化点 | **接受，退回 PLAN**。下一版必须定义二者锁同一 workflow 行，原子完成“检查取消 + 创建/复用 transcript + 状态迁移”，ASR runner 只能 claim 已提交且未取消的子任务 |

### STOP 裁决

同一工件已达到 3 轮“修复→复审”上限且仍有 blocker。依据 spec-reviewer STOP 规则：

- 本 SPEC 不得进入 CONTRACT/BUILD；
- 不进行第 4 轮原地修补；
- T-510 退回 PLAN，下一版从分享解析/持久化边界重新建模；
- 生产代码仍为 0 修改。
