# T-510 Replacement PLAN 作者侧 Adversarial Pre-review

> 日期：2026-07-25  
> 被审工件：`2026-07-25-copilot-media-orchestration-replacement.md`  
> 阶段：`T-510-1-plan`  
> Review mode：`author-side-adversarial / same-context / evidence-first`  
> Reviewer：原起草上下文的 Codex（作者侧反证审查）  
> Adversarial assessment：`CONCERNS`  
> Official independent verdict：`PENDING`

> WARNING：Reviewer 就是原作者上下文，本轮不是独立评审，也不构成 spec-review Gate。本文只记录
> 作者侧主动反证发现，必须再由不同上下文、优先不同模型的 reviewer 复核。

## 1. 一句话结论

Replacement PLAN 的产品方向符合 CreatorOS 宪法，且旧方案的两个顺序矛盾已经被正确重构为
“只读 resolve 后 claim”与“workflow 行线性化”。但 PLAN 尚未把已经进入生产工作区的 T-523
补丁、T-517 唯一运行时边界和状态事件留存归属纳入完整范围；最致命的跨端口崩溃窗口也仍只安排在
未来 BUILD 验证。因此结论为 `CONCERNS`，不能据此打开 CONTRACT Gate、confirmation② 或 BUILD。

## 2. 评审依据

完整重读：

- [产品宪法](../../产品定位.md)：P-01、P-02、P-05、R-COPILOT、R-INGEST、BR-01、BR-02；
- `product-to-code-orchestrator/SKILL.md`、`prompts/stage-router.md`、
  `rules/orchestrator-state-machine.md`、`prompts/spec-reviewer.md`；
- `gates/01-product-gate.md`；
- [SYSTEM_ARCHITECTURE](../../../orchestrator/SYSTEM_ARCHITECTURE.md)；
- [旧 T-510 Round 3 FAIL](2026-07-24-copilot-media-orchestration-optimization.review.md)；
- [Replacement PLAN](2026-07-25-copilot-media-orchestration-replacement.md)；
- [T-508 诊断](../../research/2026-07-24-copilot-media-tool-routing-diagnosis.md)；
- [T-508/T-517 任务边界](../../tasks/T484.md) 与当前 `BACKLOG.md`。

代码证据：

- 当前 `enqueueDouyinShareImport` 仍在解析前创建 `share_import`：
  `backend/src/modules/intelligence/intelligence.service.ts:2668-2703`；
- T-523 已把 `transcribeAfterImport` 接入当前分享建档链：
  `backend/src/modules/intelligence/intelligence.service.ts:2888-2926`、
  `frontend/src/server/persistence-client.ts:11069-11099`；
- 当前 startup recovery 只 drain 既有 execution 队列：
  `frontend/src/server/persistence-client.ts:5115-5117,5799-5803,9137-9146`；
- T-517 明确要求最终只有一个通用 durable run state machine 与一个生产 ticker：
  `docs/tasks/T484.md:1296-1335`。

## 3. 作者侧 PGlite 最小探针

本轮使用仓内实际 `@electric-sql/pglite` 在内存临时建 `wf/binding` 两表，不修改仓库：

1. 两个并发 transaction 都先插候选 workflow，再以同一 canonical tuple 插 binding；
2. conflict loser 抛 `CanonicalClaimLost`，使整个候选事务回滚；
3. 同一 `revision=1` 并发执行 cancel 与 intent 条件更新。

真实结果：

```json
{
  "claimResults": ["winner", "loser"],
  "afterClaim": {"wf_count": 1, "binding_count": 1},
  "raceWinners": 1,
  "race": [1, 0]
}
```

结论：PLAN 选择的数据库基础原语可行；只要生产实现保持“workflow+binding 同一 transaction，
conflict 必须 throw”这一形状，canonical loser 的已提交写入可以为 0，同 revision 的两个更新也只有
一个成功。该探针运行于 Node 22，而仓库声明 Node 25；它只能证明 PGlite 原语，不是生产 Gate。

## 4. 量规结论

| 维度 | 结论 | 证据与判断 |
|---|---|---|
| 合定位 | PASS | 对应宪法“过程可恢复”“人工确认门”“账号是数据归属”“长任务取消/重试”；仅链接 preview 与 DEC-021 一致 |
| 价值与生存性 | CONCERNS | PR-FAQ、替代品、否决形态、风险、门槛、pre-mortem、阈值齐全；但最致命跨端口 crash/cancel 风险仍只安排到 BUILD |
| 方案合理性 | CONCERNS | canonical/CAS 原语通过最小探针；workflow dispatcher/recovery 与 T-517 的唯一运行时归属尚未冻结 |
| 不造轮子 | PASS | 比较了 execution task、Postgres/PGlite 原语、Temporal/BullMQ、XState，并给出 file:line |
| 完整性/可执行 | CONCERNS | NFR-MO-008 要求状态事件保留，但 domain model、flow、owner 没有事件资源 |
| 可追溯 | CONCERNS | 只写 T-508 临时路径，漏掉已经实现相同范围的 T-523 与当前生产 consumer |
| 范围缩水 | PASS | 没有删除取消、恢复、能力门或并发验证，没有分期偷渡 |

## 5. 作者侧 Structured findings

```json
{
  "verdict": "CONCERNS",
  "summary": "产品方向与核心数据库原语成立，但当前补丁切换、Automation Kernel 边界和事件归属尚未闭合。",
  "findings": [
    {
      "severity": "major",
      "category": "traceability",
      "where": "§2 T-508 与 T-510 的边界；FR-MO-012；AC-MO-011",
      "issue": "工件只要求退役“T-508 临时路径”，但 T-508 本身明确未改生产代码；当前真正落入生产工作区的是 T-523 的 transcribeAfterImport 路径。BACKLOG T-523 还写“普通粘贴只建档”，与 DEC-021 和本 PLAN 的“仅 preview、写入 0”不同。若不点名 T-523 及其 consumer，TEST-MO-014 可能 grep 错目标并留下第二套行为真相。",
      "suggestion": "把 T-523 作为显式 cutover 输入：列出 dispatchDouyinShare、transcribeAfterImport、share_import runner 等真实 consumer；冻结仅链接行为以 DEC-021 为准；规定哪些代码退役、哪些只保留为内容雷达手动入口、哪些测试迁成 API-MO-001 契约测试。"
    },
    {
      "severity": "major",
      "category": "approach",
      "where": "§2 T-510 长期责任；§12 HARD-MO-02/03；§15 Out of scope",
      "issue": "PLAN 新增带 lease/attempt/recovery 的 CopilotMediaWorkflow，却没有裁决它的 dispatcher/recovery 属于既有 execution runtime、T-517 future handler，还是新的业务扫描器。T-517 已确认“一个生产 ticker、一个通用 durable run state machine”；如果 T-510 自建 setInterval/startup scanner，会重演 T-517 正在消除的双运行真相。",
      "suggestion": "在 PLAN 冻结物理责任：CopilotMediaWorkflow 只拥有领域状态；唤醒/lease/recovery 必须复用唯一 execution runtime 的已登记 handler/启动 drain，禁止新增 timer。说明 T-517 落地前后的兼容归属和迁移触发器。"
    },
    {
      "severity": "major",
      "category": "value-viability",
      "where": "§6.4 五大风险与 RAT；§17 AC-MO-003..005",
      "issue": "工件把“跨端口建档、child materialization、cancel 与 crash”列为发布阻断，但只把 barrier/fault-injection 安排在 BUILD。Product Gate 要求致命且半天内可验的假设在签核前完成 RAT。本轮最小 PGlite 探针只证明 transaction rollback 和同行 CAS，不证明外部 service 已写、workflow checkpoint 未写时的恢复闭环。",
      "suggestion": "PLAN 通过前补一个无生产改动的状态模型/临时 PGlite RAT，至少覆盖 item port 返回前 cancel、child ensure 后进程退出、child 先被 claim 三个窗口，并把失败结果用于 CONTRACT 修订。"
    },
    {
      "severity": "major",
      "category": "traceability",
      "where": "NFR-MO-008；ENT-MO-01..05；FLOW-MO-03/04",
      "issue": "NFR-MO-008 承诺“状态事件至少 30 天或最近 50 次”，但实体表没有 workflow event，流程没有写入/查询/清理 owner；CONTRACT 也只有允许日志字段。该要求目前无法追踪到资源、operation 或测试。",
      "suggestion": "二选一并走确认：增加账号归属的 append-only workflow event 资源及 retention/query/cleanup 契约；或把要求收窄为本地脱敏日志保留，并删除“每 workflow 最近 50 条状态事件”的产品承诺。"
    }
  ]
}
```

## 6. Finding 处置与人的裁决

| Finding | 实现方处置 | 人的裁决 |
|---|---|---|
| T-523 cutover 漏追踪 | `DISPOSED in draft`：PLAN §2、FR-MO-012、§14、AC-MO-011 已点名 T-523 的 `dispatchDouyinShare/transcribeAfterImport` 真实 consumer，冻结仅链接 preview、显式保存旧 import、显式转写新 workflow；T-508 只作为诊断 fixture 迁移 | `PENDING independent re-review` |
| T-517 唯一运行时归属未冻结 | `DISPOSED in draft`：PLAN §2、ENT-MO-03、HARD-MO-06、AC-MO-012 冻结 workflow 仅为领域投影；T-517 前复用 existing execution runtime，后迁唯一 automation runtime；禁止新 ticker/launcher/lease/attempt | `PENDING independent re-review` |
| 致命跨端口 RAT 未完成 | `EVIDENCE PARTIAL / BLOCKER REMAINS`：2026-07-25 按 PLAN §6.4 当场运行临时 PGlite/fake-port 与现有 service harness，证据见 [`2026-07-25-t510-cross-port-rat.md`](../../research/2026-07-25-t510-cross-port-rat.md)。真实结果为 `XP-01 PASS(protocol-only)`、`XP-02 PASS(narrow)`、`XP-03 FAIL`、`XP-04 FAIL / NOT CONSTRUCTIBLE`；另得到 canonical loser committed writes=0 与 cancel/intent 单 revision CAS 的窄 PGlite 证据。四项未全绿，未跑 PostgreSQL 双引擎，不能改写为 Gate PASS。 | `PENDING independent re-review` |
| 状态事件留存无 owner | `DISPOSED in draft`：PLAN NFR-MO-008、ENT-MO-06、AC-MO-015 增加 backend media orchestration owned append-only event、同事务 CAS、联合归属读取、保留/脱敏测试 | `PENDING independent re-review` |

处置仅说明作者已修改 draft，不回写本轮 `Adversarial assessment: CONCERNS` 的历史判断，也不把
`Official independent verdict: PENDING` 改成 PASS。跨端口 RAT 后续虽已有混合运行证据，但
`XP-03/04` 仍 FAIL，且 production-port/双引擎证据仍 unresolved。

## 7. Gate 裁决

- 作者侧 assessment：`CONCERNS`；
- 正式 independent review verdict：`PENDING`；
- Product Gate：`not-run / author predicts fail`；
- Replacement PLAN 必须修订并处理以上 major findings；
- CONTRACT review 可以作为问题定位证据，但 CONTRACT Gate、confirmation②、DESIGN、BUILD 继续关闭；
- 本 pre-review 未修改 BACKLOG 状态、canonical manifest/registry/trace，也未声称用户已裁决或
  独立评审已经发生。

## 8. 正式独立复评（2026-07-25，replacement Round 1）

### 8.1 独立性与范围

- reviewer：Codex 子代理独立上下文；未参与本 replacement PLAN 的起草或修订；
- review mode：`homogeneous-independent-context`；
- 模型限制：同一模型族不能消除同源盲区；本轮结论仍以工件、仓库现状和 Gate 原文为准；
- 评审范围：replacement PLAN、`docs/产品定位.md`、T-523/T-501/T-517 依赖工件、Product
  Gate 与仓库当前 worktree；
- **Official independent verdict：`FAIL`**；
- findings：**1 blocker / 0 major / 0 minor**。

### 8.2 已核对且本轮不再报 finding 的修订

| 核对项 | 独立结论 |
|---|---|
| T-523 production-path cutover | PLAN §2、FR-MO-012、§14、AC-MO-011 已明确区分普通 only-link preview、显式保存和显式转写，并点名 `dispatchDouyinShare` / `transcribeAfterImport` consumer。仓库当前 worktree 的 `frontend/src/server/persistence-client.ts:11069-11099`、`backend/src/modules/ai-runtime/chat-runner.ts:644-690,1644-1669` 与 `backend/src/modules/ai-runtime/chat-tools.ts:3019-3072` 证明该切面确实存在。该 worktree 证据不等于已经发布或 Gate PASS。 |
| T-517 唯一运行时方向 | PLAN §2、ENT-MO-03、HARD-MO-06、AC-MO-012 已冻结“领域投影不持有第二套 lease/attempt/runtime”，T-517 前后唯一运行时方向清楚；具体 parent/child 可执行契约仍由 CONTRACT Gate 裁决。 |
| 状态事件 owner | NFR-MO-008、ENT-MO-06、AC-MO-015 已补 backend owner、account ownership、同事务写入与 retention 验收，本轮不重复原 major finding。 |
| 宪法与价值边界 | 工件保持“仅链接不落库、显式保存、显式转写、AI 只产候选、账号隔离、数据缺失诚实置空/0”，未发现偷缩已确认范围或偏离 `docs/产品定位.md` 的新问题。 |

### 8.3 阻断 finding

```json
[
  {
    "id": "PLAN-R1-B-01",
    "severity": "blocker",
    "category": "value-viability",
    "where": "PLAN §6.4 RAT-MO-XP-01..04；Product Gate §前置 Assumption Validation Gate",
    "issue": "PLAN 自己把跨端口 item persist、child materialization、cancel 与 crash 窗口判定为“最致命且半天内可验证”，但 RAT-MO-XP-01..04 仍全部是 `protocol specified / not-run`。现有作者侧 PGlite spike 只覆盖同一数据库 transaction rollback/CAS，没有覆盖 service port 已产生外部效果而 workflow checkpoint 未提交、进程 kill 后 query/reconcile、child early-claim 等窗口。Product Gate 明文要求此类致命且低成本假设在签核前完成 RAT；把 fault-injection 推迟到 BUILD 不能替代该 Gate，也不能补拍成 PASS。",
    "suggestion": "在 PLAN 再评前，按已写明的 barrier/fake-port/PGlite 协议实际运行 RAT-MO-XP-01..04，保留当场命令、fixture、状态快照和输出；失败结果必须回灌 CONTRACT，成功结果也只能证明被执行的窗口。"
  }
]
```

### 8.4 Gate 裁决

- Product Gate：**FAIL**；
- 对“PLAN/CONTRACT 能否在跨端口 RAT 未执行时通过”的回答：**不能**。这不是可延期的 BUILD
  证据，而是 PLAN 签核前的致命假设验证要求；
- 本结论不否定作者已经把 RAT 协议写清楚；阻断的是实际证据为 `not-run`；
- CONTRACT 可继续作为缺口定位草案被评审，但 upstream PLAN 未过，因此不能锁定 CONTRACT、
  不能进入 confirmation②、DESIGN 或 BUILD；
- 本轮不修改 PLAN、CONTRACT、生产代码、控制面、BACKLOG/status，也不补造历史 PASS。

### 8.5 后续 RAT 证据更新（2026-07-25，不改写本轮历史 verdict）

独立复评之后，作者执行侧按 finding 的原协议运行了临时 harness，完整命令、fixture、hash 与状态快照见
[`2026-07-25-t510-cross-port-rat.md`](../../research/2026-07-25-t510-cross-port-rat.md)。

| RAT | 当场结果 | 对本 finding 的影响 |
| --- | --- | --- |
| `RAT-MO-XP-01` | `PASS — protocol only`：两个 barrier 均真实 `SIGKILL`；未知期间非终态，receipt 查回后 item=1、ASR=0、最终 cancelled | 证明 fake receipt port 的协议形状可行；生产 receipt port 仍缺失 |
| `RAT-MO-XP-02` | `PASS — narrow`：现有 `PersistentTaskService` ensure 后 `SIGKILL`，重启用完整 tuple 取回同一 child，task=1 | 仅关闭 stable-tuple task 去重窄断言；未关闭 intelligence transcript receipt owner |
| `RAT-MO-XP-03` | `FAIL`：early claim 得到 `OwnershipError: Transcript task not found`，没有 `WORKFLOW_LINK_PENDING`，task 留在 running 到 lease recovery；network=0 | 暴露当前 handler/link gate 不可构造，blocker 保留 |
| `RAT-MO-XP-04` | `FAIL / NOT CONSTRUCTIBLE`：缺 parent kind/owner、handler 与 one-shot reconcile operation | blocker 保留 |

因此“全部 not-run”这一证据状态已被后续运行取代，但四项仍未全绿；本 Round 1 的
`Official independent verdict: FAIL` 与 Product Gate `FAIL` 不变。只有新 independent re-review 才能依据
后续修订和新证据给出新的 verdict。
