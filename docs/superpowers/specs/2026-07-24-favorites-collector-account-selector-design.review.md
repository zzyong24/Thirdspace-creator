# T-496 独立 SPEC 评审

> 评审模型：Codex `gpt-5.6-sol`（独立上下文）  
> 第一轮日期：2026-07-24  
> 第一轮结论：`FAIL`

## 第一轮发现与处理

| ID | 严重度 | 发现 | 处理 |
|---|---|---|---|
| F-R1-01 | blocker | owner 大号、collector 小号与 `R-INGEST` 的 profile/source/account 一致规则冲突 | 接受；把用户本轮确认记录为仅 `favorites_folder` 的窄例外，并把不变量改写为 owner tuple 与 collector tuple 分别一致 |
| F-R1-02 | major | 缺存储位置、配置版本、旧数据回填、唯一键、不可变规则 | 接受；补充 v1→v2 迁移、JSON config、external key、唯一索引与换号语义 |
| F-R1-03 | major | collector 在排队后失效时缺 source/run/task 明确终态和恢复 | 接受；补充创建期和运行期状态矩阵、错误码、调度器行为与 CTA |
| F-R1-04 | major | 缺 FR 到 operation/schema/test 的可追溯矩阵 | 接受；补充稳定 TEST ID 和落点 |
| F-R1-05 | major | 缺现成委托身份模式调研 | 接受；补充 RFC 8693 与 AWS SourceIdentity 两种模式比较；不引入其认证实现，只借鉴 subject/actor 分离与不可变审计 |

## 第二轮

> 结论：`CONCERNS`

| ID | 发现 | 处理 |
|---|---|---|
| F-R2-01 | 缺完整 Value & Viability | 接受；补五类风险、依赖/隐私、替代方案、FAQ、pre-mortem 和第 28 天指标 |
| F-R2-02 | v1→v2 未处理 externalKey 重复、索引切换与失败恢复 | 接受；补 canonical 合并、分批回填、checkpoint、索引 gate 和正向修复 |
| F-R2-03 | opaque ref 与真实 authDir 持久化自相矛盾 | 接受；领域表只存 opaque ref，物理路径仅 adapter runtime 解析 |
| F-R2-04 | “自动 paused”没有确定触发点 | 接受；不造事件总线，在 scheduler/manual start 与 worker claim 两处验权并 CAS 收口 |
| F-R2-05 | blocked/error/retry 缺现网证据 | 接受；补 contract、finish/retry 和 lease recovery 的 file:line |
| F-R2-06 | 文首 gate 状态混杂 | 接受；拆成用户范围确认、独立评审、人工裁决三项 |

## 第三轮

> 结论：`FAIL`  
> review_mode：`cross-family`  
> 模型：`gpt-5.6-sol`

| ID | 严重度 | 发现 | 人的裁决/下一步 |
|---|---|---|---|
| F-R3-01 | blocker | 小号登录态能否在 owner 大号上下文真实读取收藏夹，仍缺一组双账号真机 RAT | 未驳回；第三轮上限已到，退回 PLAN。实施前必须在用户授权的双账号环境完成 RAT |
| F-R3-02 | major | 第 28 天指标不能依赖默认遥测 | 接受；后续只可用明确同意的研究队列或用户主动导出 |
| F-R3-03 | major | 存量 canonical/membership 合并缺逐表迁移矩阵 | 接受；待 RAT 通过后重写迁移段，不在本轮继续磨评审 |
| F-R3-04 | major | account/source version CAS 缺字段与硬删竞态协议 | 接受；待核实现有账号删除语义后重写 |

**Gate 裁决**：同一工件已达三轮上限且仍有 blocker，不继续原地修补；T-496 阻塞在真实双账号
RAT 与上游 PLAN 重做，禁止进入 Contract/Build。
