# T-516 SERVICE CONTRACT 独立评审记录

> 被审工件：`docs/superpowers/specs/2026-07-24-copilot-context-health-and-freshness.contract.md`  
> review_mode：`cross-family`  
> reviewer model：`gpt-5.6-sol`  
> 执行方式：`codex exec --skip-git-repo-check -s read-only --output-schema spec-reviewer.schema.json`  
> Round：3/3（全部原始结论永久保留）  
> 原始 verdict：Round 1 `FAIL`；Round 2 `CONCERNS`；Round 3 `FAIL`  
> 人的裁决：`Gate failed`（STOP 上限触发，退回 CONTRACT 重构；确认②尚未发生）

## Round 1 原始输出

```json
{
  "verdict": "FAIL",
  "summary": "契约方向与已确认 PRODUCT SPEC 基本一致，但撤销冲突分支被结构性截断，且异步候选、任务恢复、快照一致性和若干状态契约仍不足以支撑完整落地。",
  "findings": [
    {
      "severity": "blocker",
      "category": "scope-reduction",
      "where": "§4 API-CTX-011；上游 SC-CTX-05、FLOW-CTX-04",
      "issue": "上游明确要求 revision 冲突时展示差异并要求再次确认，但请求把 confirmConflict 定义为只能取 false，响应也止于 mode=conflict，没有重新基于当前 revision 生成安全反向修订、编辑差异并再次确认的操作。",
      "suggestion": "增加显式撤销重基线流程：基于当前 revision 生成可编辑 inverse candidate，再以新的 expectedRevision 二次确认。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§4 API-CTX-001..012、§4.1",
      "issue": "只有 4 个操作给出具体例子，缺 HTTP 状态映射和逐操作非法源状态。",
      "suggestion": "为每个操作补 happy path、错误映射、状态矩阵和 repeat behavior。"
    },
    {
      "severity": "major",
      "category": "traceability",
      "where": "API-CTX-007、candidate、内部 ports",
      "issue": "AI queued 分支没有结果 schema、账号/evidence/baseRevision 复验、candidate 原子创建与设置轮询链。",
      "suggestion": "定义生成状态查询、AI result consumer 与失败恢复。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "HealthRunStatus、API-CTX-003、job_run、错误恢复",
      "issue": "running scan 缺僵尸判定、启动 reconciliation、重试和终态规则。",
      "suggestion": "定义 lease/heartbeat 或确定性 stale-run 恢复故障矩阵。"
    },
    {
      "severity": "major",
      "category": "approach",
      "where": "PORT-CTX-003 Publishing canonical summary",
      "issue": "跨 service ports 没有共享 snapshot/uow，也没定义 batch，无法证明一致性或 500ms。",
      "suggestion": "定义 transaction-scoped UnitOfWork、批量校验和一次重试边界。"
    },
    {
      "severity": "major",
      "category": "traceability",
      "where": "FR-CTX-12 数据链路",
      "issue": "没有具体修改原 project/publication 投影的 source/publishedAt resource/operation。",
      "suggestion": "补既有 wire schema、来源映射、nullable 与 contract test。"
    },
    {
      "severity": "major",
      "category": "approach",
      "where": "调度兼容、scheduled_job/job_run",
      "issue": "job_run 唯一历史与基础扫描仍建 ai_task 形成双执行真相；jobKind/sourceKind 无判别约束。",
      "suggestion": "基础扫描只用 job_run；scheduled job 改为 jobKind discriminated union。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "issue/candidate 状态机",
      "issue": "dismiss issue 时 pending candidate 未定义；resolved 同证据再出现会被唯一约束锁死。",
      "suggestion": "定义事务联动和 resolved→open recurrence。"
    },
    {
      "severity": "major",
      "category": "traceability",
      "where": "PORT-CTX-001/002；FR-CTX-03",
      "issue": "只引用 Chat route，未定义所有 runner 不可绕过的 model-dispatch 闸。",
      "suggestion": "列入口族并定义 fail-closed 的统一模型调用封装与旁路 grep gate。"
    }
  ]
}
```

## Round 1 disposition

| Finding | 处理 | 修订方向 |
|---|---|---|
| R1-01 撤销冲突分支缩水 | 接受 | 增加 UndoRebaseCandidate、prepare/confirm 两步、编辑白名单与再次冲突 |
| R1-02 operation 不完整 | 接受 | 补 14 个操作实例、HTTP 映射、逐 mutation 状态矩阵 |
| R1-03 AI queued 断链 | 接受 | 增加 generation status API、result schema、consumer port 与原子固化 |
| R1-04 running 恢复 | 接受 | 使用 process epoch + 既有 stale-on-boot，定义 crash 矩阵和 retryOf |
| R1-05 snapshot 不成立 | 接受 | 增加 transaction-scoped ReadUnitOfWork 与 batch ports，serialization 最多重试一次 |
| R1-06 source/publishedAt 投影 | 接受 | 明确修改 `RecentProjectContextItem` 既有读端口与 nullable/source 语义 |
| R1-07 双执行真相 | 接受 | 基础 scan 禁止 ai_task；scheduled job 用判别 union |
| R1-08 issue/candidate 联动 | 接受 | dismiss 事务联动；resolved 同证据复现时 reopen |
| R1-09 runner 可旁路 | 接受 | 增加 ValidatedModelInvocation 品牌令牌、两类 dispatch gateway 与旁路扫描 |

Round 1 FAIL 永久保留；修订后运行 Round 2，不把本轮改写为 PASS。

## Round 2 原始输出

```json
{
  "verdict": "CONCERNS",
  "summary": "核心方向正确，账号联合归属、扫描幂等和 context.health 崩溃收口已有明显补强，但普通定位写入的 revision 语义、失败回显、AI 异步终态、候选重开及兼容迁移仍未形成可直接落地的闭环。",
  "findings": [
    {
      "severity": "major",
      "category": "completeness",
      "where": "§2.1(6)、§5 PORT-CTX-004、§7 creator_profiles 增量、§12 兼容性",
      "issue": "repair 之外的普通定位编辑、statement append 与定位 AI confirm 没有被要求递增同一 revision，旧候选可能覆盖后续编辑。",
      "suggestion": "所有定位聚合写路径统一递增 revision，并补普通编辑后 confirm/undo 必须冲突且写入 0 的向量。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§7 数据模型与唯一约束",
      "issue": "context 父子资源只有联合列/索引，没有逐关系的 user_id+account_id 复合外键。",
      "suggestion": "为 report→run、candidate/generation→issue、generation→ai_task、event→candidate/issue、undo→event 增加复合外键与迁移预检。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§3.3、§7.1、§12",
      "issue": "report transaction 前崩溃时只有 failed job_run，没有 report；摘要无法同时诚实展示最新失败和上次成功。",
      "suggestion": "拆分 latestRun 与 latestSuccessfulReport，并覆盖旧成功+本次中断。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§3.6、§5 PORT-CTX-005、§6 generation 状态机",
      "issue": "AI task succeeded 与 candidate commit 之间崩溃、consumer 丢事件、cancel/interrupted 尚无确定性恢复，generation 可能永久悬挂。",
      "suggestion": "定义 task→generation 完整终态映射、启动/周期 reconciliation 与 succeeded-but-unconsumed 幂等重放。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§4 API-CTX-006/007、§6 candidate 状态机、§7 candidate 唯一约束",
      "issue": "dismissed issue 重开后，旧 candidate 已 dismissed 且唯一键阻止新候选，用户可能永久无法再生成建议。",
      "suggestion": "candidate 使用不可变 attempt/version，保留旧审计并限制同一 issue/evidence 最多一个 pending。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§3.5、§4 API-CTX-007、§7.2(2)",
      "issue": "API 说点击后生成 candidate，迁移章又说首次扫描直接生成，生成时点矛盾。",
      "suggestion": "选择单一时点并贯穿事务、generation 与幂等测试。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§2.3、§7.2、§12",
      "issue": "新 union 强制 jobKind，但旧客户端缺字段的解析与 schema/code/constraint 部署顺序、非法 timezone 裁决未定义。",
      "suggestion": "补旧 operation 兼容矩阵、expand/backfill/constrain 顺序和缺失时区的诚实阻断/修复入口。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§3.5 ContextRepairEventResource",
      "issue": "event before/after 使用 unknown，既不可执行也可能把整个敏感 profile 回传。",
      "suggestion": "按 patch kind 定义窄 RepairSnapshot union、长度与脱敏规则。"
    }
  ]
}
```

## Round 2 disposition

| Finding | 处理 | 修订方向 |
|---|---|---|
| R2-01 统一 revision 不完整 | 接受 | profile upsert、statement create、定位 AI confirm、repair/undo 统一聚合写端并按事务递增 |
| R2-02 父子属主只靠 repository | 接受 | 所有 parent/child 建联合候选键、复合 FK 与非零即阻断的迁移预检 |
| R2-03 最新失败无法回显 | 接受 | summary 拆为 latestRun 与 latestSuccessfulReport |
| R2-04 AI generation 可永久悬挂 | 接受 | task 终态映射、统一 tick reconciliation、成功未消费幂等重放 |
| R2-05 重开后无新候选 | 接受 | candidate 不可变 attempt + active partial unique；旧 attempt 永久审计 |
| R2-06 candidate 生成时点矛盾 | 接受 | 扫描只建 issue；所有 candidate 都在用户显式点击后生成 |
| R2-07 调度兼容迁移不完整 | 接受 | 旧 op 缺 jobKind 确定性补 collection；expand/backfill/constrain；legacy UTC 显式可见 |
| R2-08 event 快照为 unknown | 接受 | RepairSnapshot 判别 union，只含 patch 触及字段并限制长度 |

Round 2 的 8 个 major 全部接受并修订；进入最后一轮 Round 3。若仍有 blocker，按 STOP 规则回退，
不得继续原地磨。

## Round 3 原始输出

```json
{
  "verdict": "FAIL",
  "summary": "契约已正确覆盖 latestRun/latestSuccessfulReport 分离、显式点击后生成候选、统一 profile revision 的主要写路径与 AI task 终态重放，但撤销补丁并非可逆，且复合外键、调度兼容和并发生成仍存在可执行性缺口。",
  "findings": [
    {
      "severity": "blocker",
      "category": "completeness",
      "where": "§3.5 RepairPatch/RepairSnapshot、§3.6 UndoRebaseCandidateResource、§4 API-CTX-011/013、§6 Undo 重基线",
      "issue": "撤销补丁代数无法表达原状态：clear 只能写空，stable fields 没有 set/unset 存在性语义，statement before 也无法表示已有上一版本，因此 FR-CTX-10 的完整撤销不可实现。",
      "suggestion": "定义闭合可逆命令：恢复 quarantined statusNote 原值；stable fields 使用 set/unset tagged op；statement before 支持 previous/no statement，并以 append 恢复版本而非删历史。"
    },
    {
      "severity": "major",
      "category": "approach",
      "where": "§2.3、§7、§7.2(5/10)、§12",
      "issue": "跨部署 expand/backfill/contract 被错误描述为同一 migration transaction，旧 collection 读端也未明确过滤 context.health 行。",
      "suggestion": "拆成可独立回滚的发布序列；兼容窗口旧 collection operations 只返回 collection 行/旧形状，并覆盖新旧写端并存与旧二进制回滚。"
    },
    {
      "severity": "major",
      "category": "approach",
      "where": "§3.5、§3.6、§7",
      "issue": "candidate.aiTaskId、generation.candidateId、repairEvent.runId 三条关联仍漏复合外键与状态约束。",
      "suggestion": "补三条 nullable 复合 FK、同号状态约束、迁移预检和跨 user/account 拒绝向量。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§4 API-CTX-007、§5 PORT-CTX-005、§6、§7",
      "issue": "两个不同 requestKey 并发读取 max+1 时，attempt 分配、胜负返回、孤儿/重复 AI task 和只收费一次没有原子仲裁。",
      "suggestion": "锁 issue 或使用持久 counter；同事务分配 attempt/插 generation，冲突败方返回胜者；两分支共用并发测试。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§4 API-CTX-007、§5 PORT-CTX-005、§12",
      "issue": "generation 与 ai_task 创建缺原子/durable dispatch 边界，崩溃可留下孤儿 task 或永久 queued+null taskId。",
      "suggestion": "同 canonical DB 事务创建 generation+task 后再 claim，或持久 outbox；AI 非终态必须有 taskId，并补三处故障注入。"
    }
  ]
}
```

## Round 3 disposition 与 STOP 裁决

| Finding | 处理 | 裁决 |
|---|---|---|
| R3-01 撤销代数不可逆（blocker） | 接受 | CONTRACT Gate FAIL；必须重构可逆命令模型，不能进入 DESIGN/BUILD |
| R3-02 调度 expand-contract 自相矛盾 | 接受 | 重构迁移发布序列与旧 collection 读隔离 |
| R3-03 三条复合 FK 漏项 | 接受 | 补全关联清单与状态 CHECK |
| R3-04 attempt 并发无原子仲裁 | 接受 | 引入 issue 行锁/持久 counter 与胜者回读 |
| R3-05 generation/task 创建不原子 | 接受 | 采用同库事务或 durable outbox，禁止半创建 |

三轮上限已用尽且 Round 3 仍有 blocker。按评审执行契约，不再启动 Round 4，也不把本轮 findings
边改边宣布通过；T-516 退回 CONTRACT 重构，确认②与生产实现均不得开始。
