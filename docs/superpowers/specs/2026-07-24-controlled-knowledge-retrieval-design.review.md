# T-497 独立 SPEC 评审

> 评审模型：Codex `gpt-5.6-sol`（独立上下文）  
> 第一轮日期：2026-07-24  
> 第一轮结论：`CONCERNS`

## 第一轮发现与处理

| ID | 发现 | 处理 |
|---|---|---|
| K-R1-01 | 缺价值/可行性、替代方案与风险说明 | 接受；补充用户证据、替代方案、RAT 与风险表 |
| K-R1-02 | 缺至少两个现成方案/OSS 调研 | 接受；补充 LlamaIndex、Haystack、LangChain 官方方案比较 |
| K-R1-03 | “脚本无引用字段”的证据不足 | 接受；补充仓库全局负向检索范围和命中边界 |
| K-R1-04 | 元数据没有字段落点、默认值、回填和 revision 失效规则 | 接受；补充真值表、派生 `context_chunks` 投影及迁移规则 |
| K-R1-05 | 召回、阈值、冲突和风险模式仍有歧义 | 接受；补充确定性候选数、阈值、排序、冲突键和风险来源 |
| K-R1-06 | Context Manifest 聚合根不完整 | 接受；补充 manifest/entry 字段、生命周期和事务边界 |
| K-R1-07 | 引用校验失败的重试/费用/终态不完整 | 接受；采用本地校验、零自动付费重试、保留候选并显式待核实 |
| K-R1-08 | 缺 FR→契约→服务→UI→迁移→测试矩阵 | 接受；补充可追溯矩阵 |

## 第二轮

> 结论：`CONCERNS`

| ID | 发现 | 处理 |
|---|---|---|
| K-R2-01 | 缺五类风险、PR-FAQ 和 pre-mortem | 接受；补充证据、阈值、时点、FAQ 与四条可证伪死因 |
| K-R2-02 | reindex 缺 durable task、投影状态和原子切换 | 接受；补充 staging/active、task 终态、幂等、重试/取消/重启恢复 |
| K-R2-03 | `factKeys` 无值，冲突不可实现 | 接受；改为规范化 `ContextFact` 与确定性可比规则 |
| K-R2-04 | 高风险事实只有 sourceRefs，无法覆盖正文 | 接受；改为连续 segment schema + coverage gate，并规定高风险候选始终需专业确认 |
| K-R2-05 | 普通/专业模式对无效引用的验收矛盾 | 接受；拆成 warning 与 blocked 两条断言 |
| K-R2-06 | manifest 未快照排序策略输入 | 接受；补充 trust/scope/freshness/risk/rank/reason/token 快照 |
| K-R2-07 | 切块/token 算法不确定 | 接受；补充 `chunk-policy-v1`、UTF-8 offset、700/80、表格与 tokenizer 降级 |
| K-R2-08 | “真实采纳次数”排序项无落点 | 接受；删除该排序项，不拿生成/点击次数冒充 |

## 第三轮

> 结论：`FAIL`  
> review_mode：`cross-family`  
> 模型：`gpt-5.6-sol`

| ID | 严重度 | 发现 | 人的裁决/下一步 |
|---|---|---|---|
| K-R3-01 | blocker | 存量私募法律资料默认 normal，会绕过 high-stakes 采纳门；风险又在 included 后计算 | 未驳回；第三轮上限已到，退回 PLAN。先确定模型调用前的风险下限规则 |
| K-R3-02 | major | project/topic scope applicability 未定义完整 | 接受；上游重写时补精确 predicate |
| K-R3-03 | major | `ContextRequirements` 缺字段级契约 | 接受；上游重写时把散落默认收成单一 schema |
| K-R3-04 | major | conflict 只存 factsHash，历史不能复演理由 | 接受；需在审计强度与本地存储成本之间重新裁决 |
| K-R3-05 | major | 默认自动受控尚待用户确认，却已写成强制 FR | 接受；必须先由用户确认默认策略 |
| K-R3-06 | major | durable task/citation 复用证据仍不完整 | 接受；重写时补 file:line 或明确新建 |

**Gate 裁决**：同一工件已达三轮上限且仍有 blocker，不继续原地修补；T-497 退回 PLAN，
先确认默认模式与法律资料的前置风险识别规则，禁止进入 Contract/Build。
