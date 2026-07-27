# T-510 Replacement CONTRACT 作者侧 Adversarial Pre-review

> 日期：2026-07-25  
> 被审工件：`2026-07-25-copilot-media-orchestration-replacement.contract.md`  
> 阶段：`T-510-2-contract`  
> Review mode：`author-side-adversarial / same-context / evidence-first`  
> Reviewer：原起草上下文的 Codex（作者侧反证审查）  
> Adversarial assessment：`FAIL`  
> Official independent verdict：`PENDING`

> WARNING：Reviewer 就是原作者上下文。本轮不是独立评审，也不构成 Contract Gate；它只把
> 生产代码、PGlite 原语、架构边界和旧失败记录中的反证整理为下一位独立 reviewer 的输入。

## 1. 一句话结论

CONTRACT 已真正解决旧 Round 3 的 canonical claim 矛盾：候选 workflow 与 binding 同事务，
conflict loser 抛异常回滚的算法在 PGlite 最小探针中成立；取消与 enqueue intent 的同行 revision
CAS 也能产生唯一提交顺序。

但完整副作用链仍有三个 blocker：

1. cancel 在外部 item persistence 进行中提交后，item 可以落库而 workflow 已成为 recovery 不再处理的
   terminal，checkpoint 无闭环；
2. workflow 初始 runner 与 workflow-as-outbox 没有可执行的唤醒、lease 恢复、child-link
   reconciliation 协议，也没有与 T-517 唯一运行时边界对齐；
3. public cancel 的可选 `expectedRevision` 单次 CAS 冲突后，response union 没有“未取消”的合法结果，
   可能形成假取消按钮。

因此作者侧预判 `Service Contract Gate` 与 `Contract Completeness Gate` 均会 FAIL；正式 Gate
在独立 reviewer 运行前仍是 `PENDING`。

## 2. 评审依据与代码事实

完整重读：

- Replacement PLAN/CONTRACT、旧 T-510 Round 3 FAIL；
- `product-to-code-orchestrator` 的 stage-router、state machine、spec reviewer、
  Service Contract Gate、Contract Completeness Gate；
- 产品宪法 P-02/P-05、R-INGEST/R-COPILOT、BR-01/BR-02；
- SYSTEM_ARCHITECTURE 与 T-508/T-517 边界。

关键代码：

- 当前分享导入在 resolve 前先创建 execution task：
  `backend/src/modules/intelligence/intelligence.service.ts:2668-2703`；
- 当前 item persistence 由多个 service/transaction 步骤组成：
  `backend/src/modules/intelligence/intelligence.service.ts:2712-2945`；
- 当前 transcript enqueue 先创建 execution task，再独立写 transcript：
  `backend/src/modules/intelligence/intelligence.service.ts:3586-3662`；
- execution enqueue 的幂等命中要求 `ownerType/ownerId/payload/priority/maxAttempts/costEstimate`
  全部相同：`backend/src/modules/execution/persistent-task.service.ts:267-338`；
- 当前 transcript runner 在 `markTranscriptRunning` 后直接进入下载/ASR port，没有 workflow gate：
  `backend/src/modules/intelligence/transcript-runner.ts:61-127`；
- 当前 execution lease recovery 与 startup drain 只认识 `execution_tasks`：
  `backend/src/modules/execution/persistent-task.service.ts:665-726`、
  `frontend/src/server/persistence-client.ts:5115-5117,5799-5803,9137-9146`；
- 跨模块 root-db port 不能嵌入 PGlite transaction：
  `backend/src/modules/execution/execution.service.ts:217-223`、
  `backend/src/modules/ai/ai.service.ts:471-485`；
- 当前 host 通过 `douyinAuthDirFor(ctx.accountId)` 选择登录态：
  `frontend/src/server/persistence-client.ts:5364-5383`，但 CONTRACT 未冻结该 collector/owner
  一致性约束。

## 3. 已验证成立的部分

本轮使用仓内实际 PGlite 做无仓库写入的临时探针：

```json
{
  "claimResults": ["winner", "loser"],
  "afterClaim": {"wf_count": 1, "binding_count": 1},
  "raceWinners": 1,
  "race": [1, 0]
}
```

据此不提交“canonical claim 本身不可行”的 finding：

- `workflow insert + binding insert + conflict throw` 同一 transaction 能让 loser 候选 workflow 回滚；
- 唯一 binding 最终为 1，workflow 最终为 1；
- 同一 revision 的 cancel/intent 条件更新只有一个成功；
- winner commit 前崩溃时两行共同回滚的方向与 PGlite 事务语义一致。

探针没有覆盖跨 service 外部写、进程 kill、child 先 claim、PostgreSQL driver，也不能替代正式双引擎
测试。

## 4. Blocker findings

### B-01：cancel 与在途 item persistence 的 terminal/checkpoint 语义自相矛盾

证据：

- §7.2：先把 workflow CAS 到 `persisting_item`，事务外调用
  `persistResolvedDouyinItem`，返回后才写 `itemId` checkpoint；
- §8：`any non-terminal before intent` 的 cancel 直接进入 `cancelled`；
- §8：任何 terminal → non-terminal 非法，recovery 只处理非终态；
- §7.2 又要求“若 cancel 已存在，写 itemId，state=cancelled”。

可复现窗口：

1. runner 已进入外部 item port；
2. cancel CAS 提交，workflow 变 terminal `cancelled`；
3. item port 成功提交 source/item/snapshot；
4. runner 返回时原 revision 已失效，而 contract 没有允许 terminal 内补 checkpoint 的 CAS、稳定
   receipt 查询或 reconciliation；
5. 进程若在 3/4 之间退出，cancelled workflow 永不再 recovery，已落 item 无法与 workflow 对账。

风险：违反 FR-MO-007、AC-MO-003、P-05 与 BR-02；任务卡可能显示无 item，但领域 item 已存在。

必须修改：为 item effect 定义持久稳定 receipt/查询键和 crash reconciliation。可选形状包括：

- cancel 在 `persisting_item` 只记录 `cancelRequestedAt`，等待 item receipt/checkpoint 后再进入
  terminal；或
- 明确定义 `cancelled` terminal 内只允许单调补 `itemId/itemReceipt` 的 CAS，并让 recovery 扫描
  “effect 可能已提交但 receipt 未投影”的 cancelled 行。

两种都必须给 barrier + kill 测试，不能只写“重读 revision”。

### B-02：workflow/outbox 没有闭合的 durable launcher、lease recovery 与 child-link 协议

证据：

- API-MO-003 commit 后只写“winner 进入后台 item persistence”，没有定义谁被唤醒；
- §7.4 的 dispatcher 只定义 `committed → materializing → ensureTask → materialized`；
- resource 有 `leaseOwner/leaseExpiresAt/attempt`，但没有 claim operation、lease expiry 转换、扫描条件、
  heartbeat、最大尝试、startup/live dispatch owner；
- `ensureTask` 只给 idempotency key，没有冻结现有 execution enqueue 所要求的完整
  owner/payload/priority/maxAttempts/cost tuple；
- child 在 `ensureTask` 后、workflow 写 `transcriptTaskId` 前已经可被现有
  `claimNext(kinds:["transcribe"])` 抢到；当前 runner 又会直接进入网络 port。

可复现窗口：

1. dispatcher 把 workflow 标为 `materializing`；
2. execution task 已提交为 queued；
3. 进程退出，或 transcript drain 先 claim child；
4. workflow 仍没有 `transcriptTaskId/state=transcript_task_queued`；
5. provider-start gate 失败时，contract 未定义 child 应 requeue、blocked、cancelled 还是失败；
6. 若 workflow 已 cancelled，§8 又排除 terminal recovery，child-link 可能永远不收口。

架构冲突：新增独立 workflow scanner/timer 会违反 T-517 已确认的“一个生产 ticker、一个通用 durable
run state machine”；完全不扫描则 API-MO-003 commit 后崩溃无法恢复。

必须修改：

- 定义唯一 live wake + startup recovery owner，明确不得新增业务 `setInterval`；
- 定义 workflow claim/heartbeat/expiry/retry/terminal recovery operation；
- 冻结 child 的完整 execution tuple，payload 必须含受保护的 `workflowId/itemId`；
- 定义 child 在 workflow link 尚未提交时的非终态处理；
- 定义 `ensureTask` 后 crash 的稳定 query/reconcile；
- 写清 T-517 前后归属，保证不出现第二通用运行时。

### B-03：API-MO-005 CAS 冲突后没有合法且诚实的返回

证据：

- `expectedRevision` 可缺省；service 读当前 revision 后只做一次 CAS；
- 冲突时“重读后返回真实结果，不无限重试”；
- response `result` 只有
  `cancelled_before_enqueue/cancelled_before_provider/cancel_requested_after_provider/already_terminal`。

可复现窗口：cancel 读 revision 4；无关 checkpoint 先提交 revision 5 且 workflow 仍可取消；cancel CAS
影响 0 行；重读得到未取消的 `item_persisted`。四个 result 都不真实，contract 也没有
`WORKFLOW_CONFLICT` 返回规则或第二次 CAS。

风险：用户点击取消但服务可能返回一个看似成功的结果，违反“严禁假按钮”和 FR-MO-011。

必须修改：二选一冻结：

- 客户端必须传 `expectedRevision`，CAS 冲突返回结构化 `WORKFLOW_CONFLICT` + current projection；
- service 在有限循环内重读并重新 CAS，直到真实 cancel commit 或观察到 terminal/provider-start，
  并定义尝试上限与最终 error。

## 5. Major findings

### M-01：collector 登录态与 owner account 的一致性没有进入契约

§9 只校验 request/resource 的 `userId + accountId`，`ResolvedDouyinShareV1.browserSessionRef` 则完全
来自 adapter。宪法 R-INGEST 要求默认登录 profile/source/account 一致；当前 host 实现也通过
`douyinAuthDirFor(ctx.accountId)` 与 `douyin-profile:${ctx.accountId}` 维持这一点。

必须在 resolver port 冻结：

- session/authDir 由 server 根据 account 派生，不接受模型/客户端/adaptor 任意覆盖；
- resolution receipt 带不可伪造的 owner/collector account 证明；
- persist 前校验 `browserSessionRef` 与 account 一致；
- 双账号负测覆盖错 session、归档 account 与 adapter 伪造 ref。

### M-02：operation error/permission/repeat/example 未达到 Completeness Gate

全局 `MediaWorkflowErrorCode` 不是逐 operation 的错误契约，也没有 transport status/envelope 映射。
抽查结果：

| Operation | Happy path | Error identifiers/status | Permission | Repeat/idempotency | Example |
|---|---|---|---|---|---|
| API-MO-001 | 有 | 缺 route 输入错误定义 | 当前会话 | 有 | 有 |
| API-MO-002 | 有 | 只写“resolve 类错误” | 有 | 有 | 缺 |
| API-MO-003 | 有 | 缺 winner-not-found/claim/readback 状态码 | 有 | 有 | §13 有 |
| API-MO-004 | 有 | 缺具体 status/envelope | 有 | 有 | 缺 |
| API-MO-005 | 有 | CAS conflict 语义矛盾 | 仅继承全局 | 部分 | 有 |
| API-MO-006 | 有 | 缺逐错误 status/envelope | 未单列 | 有 | 缺 |
| API-MO-007 | 有 | 有错误名、无 status/envelope | 有 | 未明确 | 缺 |
| API-MO-008 | 有 | 缺 | 缺 | 缺 | 缺 |
| API-MO-009 | 有 | 缺逐阶段错误与重复收费语义 | 缺 | 缺 | 缺 |
| API-MO-010 | 有 | 缺 Vision/bytes 错误映射 | 仅一句 user-scoped | 缺 | 缺 |

必须为每个 operation 列出完整 errors、response envelope/status、permission、repeat 与 concrete
example；尤其 API-MO-009 必须冻结 fee token/retry 是否复用同一 task，避免重复收费。

### M-03：状态机缺少失败与恢复转换

§8 没有定义：

- `canonical_claimed/persisting_item` 的 blocked/failed/lease-expired；
- `transcript_intent_committed/materializing` 的 child ensure 失败与 lease-expired；
- `blocked` retry 回到哪个精确 state 时，revision/checkpoint/attempt 如何变化；
- cancel 在 `canonical_claimed/persisting_item/transcript_intent_committed/materializing` 的逐态结果；
- provider gate 拒绝后 child task 的状态。

“对应 checkpoint 状态”不是可实现的枚举。必须给全转换表、执行 owner、guard、error code、
attempt/lease 变化和重复行为。

### M-04：逐 FR feasibility 中有不可验证自证

- FR-MO-003 写“现有 adapter 回执点，PLAN §14”，但 replacement PLAN §14 没有该 file:line；
- FR-MO-004 写“现有 Vision adapter，PLAN §13”，§13 只列调研表且没有目标 operation 的生产证据；
- FR-MO-005 的合法 resolver 仍是待拆 port，不能只以“T-508 诊断及现有分享 adapter”判来源完成；
- FR-MO-008/011 的结论依赖本评审已判 blocker 的 outbox/cancel 契约。

这些行可以继续标 HARD，但必须附具体 candidate、owner、核验 deadline 与真实证据路径；不能在
Gate readiness 中宣称 12 行已完成。

## 6. 可证伪测试审查

已有 `TEST-MO-003/005/006` 能覆盖理想提交顺序，但不足以关闭 blocker。必须新增或扩写：

| 必测窗口 | 断言 |
|---|---|
| cancel commit → in-flight item port commit → process kill | workflow 最终能读到唯一 item receipt；无孤儿、无复活 |
| workflow commit → live dispatch 前 kill | startup recovery 能继续，同一 workflow |
| child ensure commit → workflow link 前 kill | 重启读回同一 child，不重复、不进网络 |
| child claim 早于 workflow link | child 保持可恢复非终态，provider call=0 |
| materializing lease 过期 | 单 winner recovery，attempt 有界 |
| cancel 读 revision 后被 checkpoint 抢先 | 明确 conflict 或最终 cancel commit，不能假成功 |
| 错 account/session resolver | resolve/persist/network 均拒绝，跨号写入=0 |
| API-MO-009 相同 fee token 重试 | task/收费 operation 至多 1 |

正式证据仍须覆盖 PGlite 与 PostgreSQL；本轮内存探针不替代这些测试。

## 7. 作者侧 Structured findings

```json
{
  "verdict": "FAIL",
  "summary": "canonical claim 原语成立，但 item effect、workflow outbox 和 public cancel 仍存在不可恢复或假成功窗口。",
  "findings": [
    {
      "severity": "blocker",
      "category": "approach",
      "where": "§7.2 Winner item persistence；§8 State transitions",
      "issue": "cancel 可在外部 item port 进行中把 workflow 置为 terminal；item 随后成功时没有 terminal checkpoint/reconciliation 路径，崩溃会留下已落库但 workflow 不可恢复的 item。",
      "suggestion": "冻结 item effect receipt 与 cancellation settling/reconciliation 协议，并以 barrier+kill 测试证明。"
    },
    {
      "severity": "blocker",
      "category": "approach",
      "where": "§7.4 Workflow-as-outbox；§7.5 Provider-start；§8 recovery",
      "issue": "缺 durable launcher、workflow lease recovery、child 完整幂等 tuple、ensure 后崩溃对账及 child 早 claim 语义；自建 scanner 又会撞 T-517 唯一运行时边界。",
      "suggestion": "定义唯一 runtime owner、完整 claim/recovery operation、child payload/link receipt 和 T-517 前后迁移边界。"
    },
    {
      "severity": "blocker",
      "category": "completeness",
      "where": "API-MO-005 copilot.douyin.transcriptions.cancel",
      "issue": "可选 expectedRevision 的单次 CAS 冲突后可能仍处于可取消态，但 response union 没有未取消/conflict 结果，存在假取消。",
      "suggestion": "强制 expectedRevision 并返回 WORKFLOW_CONFLICT，或定义有界重读重试直到真实提交/终态。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§9 Permissions and ownership；ResolvedDouyinShareV1",
      "issue": "未冻结 collector browser session 与 owner account 一致性，低于宪法 R-INGEST 的默认归属要求。",
      "suggestion": "server 派生并验证 session，receipt 绑定 collector/owner，补双账号错 session 负测。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§5 Error schema；API-MO-001..010",
      "issue": "多个 operation 缺逐项 error status/envelope、permission、repeat/idempotency 或 concrete example，无法通过 Contract Completeness Gate。",
      "suggestion": "逐 operation 补齐五项并冻结 API-MO-009 费用重试幂等。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§8 State transitions",
      "issue": "blocked/failed/lease-expired/materializing/provider-gate-rejected 等转换和 owner 不完整，“对应 checkpoint 状态”会让实现分叉。",
      "suggestion": "补全状态×操作×guard×owner×revision/lease/attempt×error 的确定表。"
    },
    {
      "severity": "major",
      "category": "traceability",
      "where": "§15 Per-FR data-path feasibility；§18 Gate readiness",
      "issue": "FR-MO-003/004/005 的证据引用不精确，FR-MO-008/011 又依赖未闭合 blocker，却声称 12 行已完成。",
      "suggestion": "修正为可验证 file:line/RAT；未闭合项保持 HARD，并给 owner、候选解和 deadline。"
    }
  ]
}
```

## 8. Finding 处置与人的裁决

| Finding | 实现方处置 | 人的裁决 |
|---|---|---|
| B-01 在途 item/cancel receipt | `DISPOSED in draft`：CONTRACT §4.3、§7.2、§8 定义稳定 `itemEffectKey`、intelligence receipt query、`item_reconciling` 与 cancel-settling；未知 effect 时禁止 terminal，确认同一 `itemId` 后才 cancelled；TEST-MO-015 固化 barrier/kill | `PENDING independent re-review` |
| B-02 outbox/launcher/recovery/T-517 | `DISPOSED in draft`：§7.2/7.4 冻结 existing execution task 为 T-517 前唯一 runtime，列出 parent/child 完整 tuple、one-shot startup reconcile、ensure 后 kill/link reconcile、child early-claim=`WORKFLOW_LINK_PENDING`；workflow 删除 lease/attempt，禁止新 ticker | `PENDING independent re-review` |
| B-03 cancel CAS 假成功 | `DISPOSED in draft`：API-MO-005 强制 `expectedRevision`，只做一次 CAS；仍可取消但 stale 时 HTTP 409 `WORKFLOW_CONFLICT` + `currentRevision/currentWorkflow`，terminal/已请求取消才返回观察到的真实结果 | `PENDING independent re-review` |
| M-01 collector/owner 一致性 | `DISPOSED in draft`：`ResolvedDouyinShareV1` 与 §9 改为 backend 按 `ctx.accountId` 派生 collector session，receipt 带 `collectorAccountId/sessionRefHash`，client/model 不得传 session ref | `PENDING independent re-review` |
| M-02 operation completeness | `DISPOSED in draft`：§6.12 为 API-MO-001..011 给出 permission/status/errors/repeat/example，补统一 transport 规则、逐 operation concrete samples，并冻结 API-MO-009 fee-token 派生单 task/单收费 operation | `PENDING independent re-review` |
| M-03 状态机转换缺口 | `DISPOSED in draft`：§8 补 runtime pending、item reconcile、child linking/early claim、blocked/failed/cancel 逐态，以及 owner、revision/event、唯一 runtime lease/attempt、error/repeat 的规范表 | `PENDING independent re-review` |
| M-04 feasibility 证据 | `DISPOSED in draft`：§15 删除 FR-MO-003/004/005/007..010/012 的自证式 feasible，改为真实现状、candidate owner、HARD 与 TEST/BUILD 核验期限；§16 补 T-523 consumer 与 startup drain file:line | `PENDING independent re-review` |

以上七项均为“作者已处置契约文本缺口”，不代表实现或 RAT 已验证。跨端口 kill、双引擎、真实 adapter
和 migration consumer 证据仍为 `UNRESOLVED evidence`，由下一轮独立 reviewer 按 TEST-MO-014..016
裁决；本轮 `Adversarial assessment: FAIL` 历史与 `Official independent verdict: PENDING` 保持不变。

## 9. Gate 裁决

- 作者侧 assessment：`FAIL`；
- 正式 independent review verdict：`PENDING`；
- Service Contract Gate：`not-run / author predicts fail`；
- Contract Completeness Gate：`not-run / author predicts fail`；
- 退回 `T-510-2-contract` 重构；PLAN 的 T-517/T-523/事件归属 concerns 也须先处理；
- confirmation②、DESIGN、BUILD 保持关闭；
- 本 pre-review 未修改生产代码、BACKLOG 状态、canonical manifest/registry/trace，也未
  commit/build；它不声称独立评审已经发生。

## 10. 正式独立复评（2026-07-25，replacement Round 1）

### 10.1 独立性与总裁决

- reviewer：Codex 子代理独立上下文；未参与本 replacement CONTRACT 的起草或修订；
- review mode：`homogeneous-independent-context`；
- 模型限制：同一模型族不能消除同源盲区；本轮逐项对照 Gate、上游契约和当前生产候选代码；
- **Official independent verdict：`FAIL`**；
- findings：**2 blocker / 2 major / 0 minor**；
- Gate 12 Service Contract Gate：**FAIL**；
- Gate 15b Contract Completeness Gate：**FAIL**。

此外，上游 replacement PLAN 已在本轮因 RAT-MO-XP-01..04 全部 `not-run` 被独立裁决为
`FAIL`。下列 CONTRACT findings 是独立于该 upstream blocker 仍然成立的契约缺口，不重复把
PLAN finding 计入本文件数量。

### 10.2 用户指定焦点的逐项复核

| 焦点 | 独立裁决与证据 |
|---|---|
| T-523 cutover | **文本切面已处置，本轮无 finding。** §11、TEST-MO-014 已点名当前 `dispatchDouyinShare`、`transcribeAfterImport`、Copilot consumer 与 only-link/save/transcribe 三路 cutover。当前 worktree 的 `frontend/src/server/persistence-client.ts:11069-11099`、`backend/src/modules/ai-runtime/chat-runner.ts:644-690,1644-1669`、`backend/src/modules/ai-runtime/chat-tools.ts:3019-3072`、`backend/src/modules/intelligence/intelligence.service.ts:2668-2703,2888-2926` 证明这些是真实 production-path 切面。它们尚不是 release 或 TEST PASS 证据。 |
| `externalWorkId` canonical claim | **契约算法成立，本轮无 finding。** §3 与 §7.1 规定 resolver 只读、candidate workflow 与 binding 同事务、`ON CONFLICT DO NOTHING RETURNING` 失败即抛 `CanonicalClaimLost` 回滚整个 candidate transaction，之后才读 winner；因此 loser 的**已提交** workflow/event/binding 写入应为 0。真实双引擎并发证据仍是 `not-run`，不能把作者 spike 当独立 PASS。 |
| item persist / cancel unknown effect | **仍阻断。** §7.2 只有 prose 级 `effectKey`、persist/query/retry/reconcile，没有可实现的 receipt resource、三态 wire、原子 Unit of Work 与完整错误/重复语义；见 B-01。cancel CAS 本身已修正，但未知 item effect 无法诚实收敛。 |
| T-517 唯一 runtime / child ownership | **仍阻断。** 契约方向禁止第二 runtime 正确，但 parent kind/owner 尚未进入 execution 合同，且 child ensure 绕过 intelligence transcript receipt；见 B-02。T-517 当前独立 review 仍是 FAIL，未来 cutover 也不能被当作已闭合。 |
| stale cancel | **已处置，本轮无 finding。** API-MO-005 强制 `expectedRevision` 且只做一次 CAS；仍可取消但 stale 返回 HTTP 409 `WORKFLOW_CONFLICT` 与 `currentRevision/currentWorkflow`，terminal 或已请求取消才返回真实观察结果。 |
| account-derived session | **已处置，本轮无 finding。** resource/permission 规定 backend 从 `ctx.accountId` 派生 collector session，client/model 不得提交 `browserSessionRef`，receipt 校验 `collectorAccountId`。当前 host 代码 `frontend/src/server/persistence-client.ts:5364-5383` 也按 account 派生 auth dir/profile。 |
| T-501 capability evidence | **共享 wire 已对齐，本轮无 finding。** 最终快照中 T-501 §6.1 是唯一 `ReferenceCapabilityEvidenceV1` Defined-In，完整包含 `configurationId` 与 `slot="image.generate"`；T-510 §4.5/API-MO-008 已删除本地同名类型、直接引用该 resource，完整 unknown fixture 也包含两字段。T-501 Round 2 Gate 因其他 findings 仍是 FAIL，所以 production capability 依赖继续 blocked，T-510 按 `unknown` fail closed；这不再是 T-510 的 wire 缺口。 |

## 2026-07-25 T-501 additive 依赖修订记录（作者记录，非新 verdict）

T-501 把 API-MC-010 strict request 固定为 `{slot, capability}`，因此本合同 API-MO-008 已同步为
`{slot:"image.generate", capability:"referenceImage"}`。此前评审关于 shared wire 已对齐的判断
只覆盖旧 request 快照，不能自动覆盖本次 additive 变化；T-510 当前仍保持原有 FAIL/blocked，
等待其后续正式复评，不因本记录翻绿。
| operation/schema/error/idempotency | **不完整。** API-MO-010 paid Vision task 缺稳定 task/effect key、重复收费语义和对应错误；所谓 concrete samples 仍是字段投影；policy 缺运行时消费点；见 M-01。 |
| HARD completeness | **声明与表格不一致。** 多个 HARD FR 没有 owning PKG/slice、deadline 和证据行；见 M-02。 |
| 跨端口 RAT 未执行能否 PASS | **不能。** Product Gate 已先失败；并且 item effect/child materialization 正是这些未执行 RAT 要验证的致命窗口。CONTRACT 自身也因 B-01/B-02 不能通过 Gate 12/15b。 |

### 10.3 Findings

```json
[
  {
    "id": "CONTRACT-R1-B-01",
    "severity": "blocker",
    "category": "idempotency-recovery",
    "where": "§7.2 item persistence / item reconcile；§11 migration；FR-MO-007；AC-MO-013",
    "issue": "契约只描述 `persistResolvedDouyinItem(effectKey, snapshot)` 与 `getPersistedDouyinItemByEffectKey`，没有定义 receipt 资源、精确 request/response、`committed | not_committed | unknown` 三态、错误、retention、same-key/different-snapshot 冲突和重复调用行为，也没有要求 source + item + snapshot + receipt 在同一 Unit of Work 原子提交。§11 只模糊提出给“item/import receipt”增加 nullable unique `operation_effect_key`，没有表、联合唯一键、账号归属或原子边界。当前 `backend/src/schema/intelligence.ts:71-92` 的 `intelligenceItems` 没有该 key；若 domain write 已提交而 receipt/checkpoint 丢失，query 可能误判 not-found，随后重试产生重复或部分落库。T-517 当前 CONTRACT review 也仍将通用 effect receipt/query/reconcile 判为未闭合。",
    "suggestion": "冻结具名 ItemEffectReceiptV1 与 owner port：联合唯一 `(userId, accountId, effectKey)`、canonical request fingerprint、itemId、状态和时间；定义精确三态 query、所有 error/repeat/retention 语义及 same-key mismatch conflict；要求 source/item/snapshot/receipt 原子提交，并给出 unknown 状态的确定性 reconcile/event 转换，再用 RAT-MO-XP-01 当场验证 crash 窗口。"
  },
  {
    "id": "CONTRACT-R1-B-02",
    "severity": "blocker",
    "category": "ownership-runtime",
    "where": "§7.2 parent task tuple；§7.4 transcript child；§8 runtime ownership；§11 T-517 handoff",
    "issue": "契约提出 parent `kind=copilot_media_workflow`、`ownerType=copilot_media_workflow`，但当前 `backend/src/modules/execution/persistent-task.service.ts:24-37` 与 `contract/src/resources/intelligence.ts:76-83` 的枚举均不允许它们。更关键的是，§7.4 直接通过 execution service ensure `kind=transcribe` 并只链接 workflow，没有定义/创建 intelligence-owned `item_transcripts` receipt；现有 `backend/src/modules/intelligence/intelligence.service.ts:3586-3662` 在 enqueue 时同时 upsert 该记录，而 `backend/src/modules/intelligence/transcript-runner.ts:61-127` 通过 `getTranscriptTaskForExecution` 依赖它。按现契约直接 ensure 的 child 会被 runner claim 后因找不到 domain receipt 失败，`WORKFLOW_LINK_PENDING` gate 也不能补回该记录。未来 T-517 cutover 又依赖当前仍为 FAIL 的 T-517 契约，缺 drain/fence/in-flight ownership/rollback 的已通过证据。",
    "suggestion": "定义唯一 owner port（例如 intelligence `ensureTranscriptTaskForWorkflow`），使 execution task 与 item transcript receipt 以稳定 key 原子/可重放地产生并可查询；显式扩展 parent kind/owner contract 与 handler registry；冻结 parent/child live/startup drain。把 T-517 handoff 保持为独立阻塞依赖，直到其 fence、drain、lease/checkpoint 与 in-flight ownership 契约和 conformance evidence 通过，禁止双 runtime。"
  },
  {
    "id": "CONTRACT-R1-M-01",
    "severity": "major",
    "category": "operation-completeness",
    "where": "§6 operation matrix；§6.10 API-MO-010；§6.12/6.13 errors/examples；§12 policies",
    "issue": "Gate 15b 要求每个 operation 的完整 happy-path example、所有 named error/code、permission/state/repeat，以及政策字段的 runtime consumer。API-MO-010 只写“backend task 幂等”，没有 task resource、稳定 key/config version、重复与单次收费语义；matrix 写 provider 502，但统一 error union 没有对应 Vision provider error。API-MO-002/003 的 resolve/readback/background errors 也未逐操作穷举。§6.13 标作 concrete samples 的多个对象明确只是投影，缺 required fields，不能充当完整 wire fixture。resolver deadline、shareInput 长度、event retention/list limit、fee nonce/max attempts 等 policy 没有目标 `file:function` 消费点。",
    "suggestion": "逐 operation 补全 canonical request/response fixture、status/error map、permission/state/retry/repeat；为 API-MO-010 定义稳定 effect/task key、config fingerprint、收费幂等与 provider error；增加 policy-to-runtime `file:function` 消费表和 contract fixture 校验。"
  },
  {
    "id": "CONTRACT-R1-M-02",
    "severity": "major",
    "category": "hard-feasibility-traceability",
    "where": "§15 Per-FR data-path feasibility；PLAN §13 HARD-MO table；Gate 15b HARD 规则",
    "issue": "§15 声称所有 HARD row 都有 candidate、owning PKG/slice 与 deadline，但 FR-MO-009 只写“BUILD projection/event test”，FR-MO-010 只引用 TEST-MO-001，FR-MO-012 只写 consumer 归零；这些没有 owning package/slice 或独立 HARD row。FR-MO-004 被标 HARD，却没有与 PLAN HARD table 的明确对应；FR-MO-001 的“PLAN §13/14 file:line”也是自引用而非证据。Gate 15b 要求具体 candidate、owner、验证期限及 HARD 表对应行，当前声明不可审计。",
    "suggestion": "为每个 HARD FR 增加唯一 HARD id、候选解、owning package/slice、明确 deadline/Gate、精确 code/fixture evidence；无法补齐的行保持 HARD/blocked，不得以泛化的 BUILD 或 TEST 标签代替。"
  }
]
```

### 10.4 Gate 裁决与下一步边界

- Gate 12：**FAIL**。核心 item effect 与 child ownership 在 crash/retry 下尚无可实现的资源和端口；
- Gate 15b：**FAIL**。operation/error/idempotency/policy examples 与 HARD trace 不完整；
- replacement CONTRACT 不得锁定，confirmation②、DESIGN、BUILD 保持关闭；
- T-523 cutover、canonical loser committed writes=0、stale cancel 409/current、account-derived
  session 的文本修订可保留，下一轮不应无证据推翻；但它们不抵消上述 blockers；
- 下一轮只能按新产生的契约文本和当场 RAT/conformance 证据复评，不得把本轮“文本成立”误写为
  production PASS；
- 本轮只追加独立 review，不修改 PLAN、CONTRACT、生产代码、控制面、BACKLOG/status，也不
  commit/build。
