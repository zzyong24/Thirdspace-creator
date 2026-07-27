# T-513 独立评审记录

> SPEC：`2026-07-24-account-scoped-skill-isolation-design.md`  
> 评审模式：cross-family  
> 评审模型：`gpt-5.6-sol`  
> 日期：2026-07-24

## Round 1

- **结论：FAIL**
- **摘要**：方向正确，但多账号存量归属被无依据地自动决定，且显式跨号复用被延后；
  迁移、运行时快照和入口覆盖未达到可执行标准。

### Findings 与处理

| 严重度 | Finding | 处理 |
|---|---|---|
| blocker | 旧覆盖无账号证据，不能自动归给“最早账号” | 接受。改为只有唯一 active 抖音号时自动迁移；0 个或多个账号时隔离，须由用户显式选择归属账号。 |
| blocker | SPEC 一边要求显式跨号复用，一边把能力推迟到 T-335 | 接受。T-513 增加账号间复制契约、冲突语义与测试；T-335 仍负责通用导出/导入与第三方安全审查。 |
| major | 未定义旧版本历史迁移 | 接受。补当前行与全部历史快照的同事务迁移、ID 映射、幂等标记、冲突和回滚测试。 |
| major | ALS 与显式 snapshot 两可，漏入口会静默回落 | 接受。唯一执行契约改为显式不可变 snapshot；ALS 仅作进程内传递，运行入口缺 snapshot 必须失败。 |
| major | 没有完整 Skill 消费入口矩阵 | 接受。补全 Registry Skill、内联非 Skill 节点、同步/异步入口及静态扫描 Gate。 |
| major | 仓内复用证据不精确 | 接受。补 `file:line`、Node engine 与反证搜索命令。 |
| major | 风险验证和指标口径不足 | 接受。补 ALS/快照/迁移裁决 RAT 结果，并定义发布前后错误率窗口与事件口径。 |

Round 1 的 FAIL 不作为开工凭据；修订后必须重新独立评审。

## Round 2

- **结论：FAIL**
- **摘要**：显式复制、snapshot 契约、入口矩阵与指标基本闭合，但仅凭“唯一 active 账号”
  仍不能证明旧 Skill 的历史账号归属；覆盖确认缺 CAS，摘要规范不唯一。

### Findings 与处理

| 严重度 | Finding | 处理 |
|---|---|---|
| blocker | 1 active + 1 archived 仍会把旧值错迁给 active 账号 | 接受。取消所有基于账号数量的自动迁移；旧全局覆盖一律 pending，必须由用户显式认领。 |
| major | copy/claim 的二次 replace 没有绑定用户看到的目标版本 | 接受。新增单调 `rowRevision` 与 `expectedTargetRevision`；同事务锁/CAS，版本变化重新返回冲突。 |
| major | “canonical JSON”不足以得到唯一 digest | 接受。固定 RFC 8785 JCS、I-JSON 输入、数组保序和固定测试向量；创建端/恢复端共用 contract 实现。 |

Round 2 的 FAIL 不作为开工凭据；按 STOP 上限，Round 3 是本工件最后一轮原地复审。

## Round 3

- **结论：FAIL**
- **摘要**：账号隔离方向正确，但同一遗留 Skill 仍可能被并发认领到两个不同账号；
  PUT 的 CAS 字段、旧任务升级处置、修订后 RAT 与孤儿遗留值归属也未闭合。

### Findings 与裁决

| 严重度 | Finding | 裁决 |
|---|---|---|
| blocker | 只锁目标账号行，A/B 两个不同目标可同时 claim 同一 legacy override | 接受。必须新增 legacy claim 单一终态，对 `legacyOverrideId` 先锁/CAS `pending→claimed/kept`，保证最多一个终态。 |
| major | PUT 未定义 `expectedTargetRevision` 字段级契约 | 接受。replacement SPEC 必须完整定义创建、更新、缺字段与 409 最新摘要。 |
| major | 升级时既有无 snapshot 的 queued/running 任务没有处置 | 接受。不能伪造历史快照；须转明确不可恢复/需重试终态并保留原因，由用户确认后新建任务。 |
| major | RAT 仍验证已废弃的 single=auto 规则 | 接受。该迁移 RAT 作废；replacement SPEC 必须按全 pending 规则重跑并覆盖跨目标并发 claim。 |
| major | `updated_by` 为空/失效时孤儿旧值没有安全认领规则 | 接受。需以本机单用户边界设计来源未知的显式认领和多用户拒绝条件。 |

## STOP 结论

同一工件已完成 3 轮“修订 → 独立复审”，Round 3 仍有实质 blocker。依据
`product-to-code-orchestrator` 的 spec-review STOP 规则，本 SPEC 不得继续原地打补丁，也不得
作为 CONTRACT/BUILD 准入证据；T-513 回 PLAN 重做 replacement SPEC。旧工件保留为失败证据。
