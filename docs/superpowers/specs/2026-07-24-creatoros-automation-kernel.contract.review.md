# T-517 Automation Kernel CONTRACT 独立评审

> Stage: `2-contract`
> Reviewer: `codex exec / gpt-5.6-sol / read-only`
> 被审对象：`2026-07-24-creatoros-automation-kernel.contract.md`
> 说明：评审进程只读，未修改仓库。

## Round 1 — 2026-07-24

**结论：FAIL**

方向符合产品定位与物理架构，但当前契约尚不能直接实现。评审发现 1 个 blocker、7 个 major：

1. `API-AUTO-003/012/018` 的计划授权、单次授权、首次副作用消费、重试与 lease recovery
   之间没有闭合，存在静默授权或重复副作用风险。
2. 27 个 operation 仍有未定义 alias、错误简称、自然语言示例；兼容 operation 未逐项冻结。
3. event schema 无法严格重放 attempt，且数据库唯一键引用了 schema 中不存在的
   `commandKey/eventSemantic`。
4. `retry_wait` 推进、撤权后的 running 状态、`queue_one` 并发约束没有唯一执行者。
5. job/grant/migration 的 requestKey 没有持久 receipt；`expectedUpdatedAt` 不是可靠 CAS。
6. 领域 capability 只有字符串 allowlist，尚未冻结 typed port；漏 `share_import`。
7. 授权第三方的数据链路缺精确目的地、凭据范围、采集窗口与仓内证据。
8. compatibility 写错现网 wire：漏 `scheduledJobs.setEnabled`，误写不存在的 `delete`；
   cutover phase 尚未字段级类型化。

处置：进入 CONTRACT Round 1 修订；确认②和 BUILD 继续保持关闭。

### Round 1 finding disposition

| Finding | 处置 |
| --- | --- |
| 授权 blocker | 增完整 GrantConfirmation/ConfirmationSummary；create 无确认只能 suspended；新增 reservation→首次 capability effect CAS consume→领域 receipt→recovery/reconciliation 协议 |
| operation 字段不完整 | 补全全部 alias、AutomationErrorCode、27 项规范化错误/响应/关键失败 envelope；compat 子 operation 逐项冻结 |
| attempt 不可重放 | event 改严格 typed union，加入 attempt/epoch/lease/heartbeat/checkpoint/effect/commandKey/eventSemantic；定义重放不变量 |
| 状态执行者不闭合 | API 017 成为 retry-ready 唯一 promoter；revoke transaction 直接转换 running；queue_one 增部分唯一约束和 job row lock |
| 非 run 幂等/CAS | 新增 automation_command_receipts；job/grant/fence/phase 全改单调 revision |
| capability 只是字符串 | 冻结 15 个 typed domain ports、owner/幂等/禁止字段、代表 handler 授权矩阵与越权负测；补 share_import |
| 第三方数据来源不具体 | 按七类 handler 补第三方目的地、账号/收藏夹/URL scope、仓内 file:line、窗口、落库和读回 |
| compatibility/cutover | 对齐现有六个 scheduledJobs 与两个 jobRuns wire；删除虚构 delete；补 phase enum/revision/hash/失败恢复 |

修订后本地结构检查：27/27 operation、0 undefined alias、0 clarification marker、
compat 包含 setEnabled 且无 delete；`reconcile` 0 error（仅既有 BACKLOG bloat warning）。

## Round 2 — 2026-07-24

**结论：FAIL**

Round 1 的 revision/receipt 骨架成立，但评审发现 1 blocker、7 major：

1. Grant 的单值 consumed 字段错误地把“single-use=只属于一个 run”实现成“一个 run 只能有一个
   effect”；浏览器/模型调用也可能先发生、后消费授权。
2. 27 项仍缺统一 strict request/success/error 类型和逐项完整 fixture；API 003 分支有歧义。
3. event 不是 discriminated union，缺 sequence/revision 和按事件必填证据。
4. overlapSlot 未入模型、jobless promoter 与 attempt 唯一递增点未定义。
5. capabilities 仍退化为 unknown map；self.metrics 新作品链和 favorites→candidate child 断口。
6. destination 字段不一致且不可执行，缺逐 request/redirect 的 SSRF/模型目的地约束。
7. legacy update/setEnabled/runNow 的 command key、授权漂移与组合事务不闭合。
8. cutover 缺持久 control row、完整 hash 与 system-scope receipt。

处置：全部接受。进入最终 Round 2 修订；若第三轮仍有 blocker，按技能 STOP 规则回退 CONTRACT
重做，不用无限重试掩盖工件问题。

### Round 2 finding disposition

| Finding | 处置 |
| --- | --- |
| multi-effect / 真实网络先发生 | 新增 automation_effects；single-use 改为 single-run；所有 browser/HTTP/model/external/domain 调用统一经 effect broker，在 provider 前 reserve，逐 effect receipt/recovery |
| 27 operation 不够 strict | 新增 OperationContractMap、OperationErrorMap/EffectiveOperationError、范围/默认/nullable 规则及 27 项完整 canonical fixture；API 003 唯一分支化，024 分离持久 envelope 与 runtime context |
| event 非严格 union | 改 Zod discriminated union；加 eventSequence、before/after revision 与每类必填证据；定义 timeline validator |
| overlap/jobless/attempt | overlapSlot 入 run；API 017 jobless run-row CAS；attempt 唯一在 API 018 claim +1；补三类并发矩阵 |
| capability/data chain | 定义 CapabilityOperationId→CapabilityMap 静态映射与 manifest Pick；self.metrics 补 imported projection 链；favorites 补 candidate-only child handler |
| DestinationScope/SSRF | 统一 canonical DestinationScope；逐 request/redirect 校验 host/path/resource/session/model；模型 adapter 仍在 ai-runtime |
| legacy adapter | 六个 scheduledJobs 与两个 jobRuns 逐项冻结字段、原子组合、legacyRequestId、自然日 run key、412 迁移入口与 concrete fixtures |
| cutover control | 新增 automation_cutover_state、system receipt actor、writer/ticker invariants、handler+grant canonical hash 与恢复规则 |

## Round 3 — 2026-07-24

> `review_mode: cross-family`
> `model: gpt-5.6-sol`
> `sandbox: read-only`

**结论：FAIL**

最终评审仍发现 5 个 blocker、7 个 major。按
`product-to-code-orchestrator` 的同一工件三轮 STOP 上限，本 CONTRACT 不再原地补丁式修订：
退回 CONTRACT 重新建模，Service Contract Gate / Completeness Gate 均不得标绿，确认②与 BUILD
继续关闭。

### Structured findings JSON

```json
{
  "verdict": "FAIL",
  "summary": "该 CONTRACT 已覆盖大部分主路径，但授权 manifest、逐 effect 可重放、legacy 授权兼容和单 writer cutover 仍存在不可实现或相互矛盾的字段级契约，不能作为 DESIGN/BUILD 的唯一实现真值。",
  "findings": [
    {
      "severity": "blocker",
      "category": "completeness",
      "where": "§3.7 AutomationHandlerManifest；API-AUTO-003/004/007/009/011；§7 handler 授权表",
      "issue": "多个 operation 依赖 manifest 的 managedBy/create template、editableFields、manual allowed、retryable，但 manifest schema 和 HandlerManifestDescriptor 均没有这些字段。授权表还使用了枚举外的 inherited parent run scope、local internal；必迁 child handler 无法由 strict registry 唯一授权。",
      "suggestion": "把 create/manual/edit/retry/management policy 加入 manifest 与 fingerprint；为 child run 定义显式 delegated grant schema，并将所有 handler 改为合法 authorizationMode。"
    },
    {
      "severity": "blocker",
      "category": "approach",
      "where": "§3.3 AutomationRunEventResource；§3.5 AutomationEffectResource；§3.8 effect broker；API-AUTO-013/020",
      "issue": "effect 有 reserved/not_committed/unknown/committed 状态，但 event union 没有 effect unknown/not_committed/reconciliation 事件；领域写与 Kernel receipt 之间也没有可执行的同事务 Unit of Work 或 receipt 查询 port，崩溃后可能重复副作用。",
      "suggestion": "补齐 effect 状态机、append-only event、CAS/revision 和逐 effect reconciliation；每个领域写 capability 必须定义同事务 receipt 或可查询的幂等 receipt port。"
    },
    {
      "severity": "blocker",
      "category": "completeness",
      "where": "API-AUTO-027；§6 cutover 状态；§11 Compatibility 与 cutover",
      "issue": "cutover 没有 rollback/restore/解除 fence operation，却承诺 switch 前可恢复；fence 与旧 lease drain 的写白名单未区分，长 phase 也没有 lease/processEpoch/checkpoint/recovery。",
      "suggestion": "定义可执行 rollback/restore 与合法转换，区分禁止新 enqueue/业务 mutation 和允许既有 lease 收口，并为长 phase 增加 durable lease/checkpoint/recovery。"
    },
    {
      "severity": "blocker",
      "category": "completeness",
      "where": "API-AUTO-025、§15/§15.1 legacy failure；现有 contract/src/envelope.ts",
      "issue": "合同既要求严格复用现有 legacy errorEnvelope，又要求 412 携带该 envelope 不支持的 nextAction/confirmationSummary；旧 UI 无法完成重授权。API 025 还遗漏 command receipt 的 idempotency conflict。",
      "suggestion": "确认并定义 additive legacy error schema，联动 contract client/旧 UI fixture；或在现有 details 内定义完整 typed reauthorization payload，并补 idempotency conflict。"
    },
    {
      "severity": "blocker",
      "category": "completeness",
      "where": "§9.2 owner constraints；§11 migration；API-AUTO-025/026/027；LegacyScheduledJobResource",
      "issue": "legacy scheduledJob.accountId 可为空，但目标 job/run/grant 强制 userId+accountId；合同没有 null-owner 的归属、隔离留档或不可见规则，直接迁移会违反 P-02 并产生串号风险。",
      "suggestion": "增加 null-owner inventory/quarantine 分类；只有可验证 ownership 锚才迁移，其余进入不可执行且普通账号不可枚举的只读档案，并纳入 count/hash/exception Gate。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "§3.6 GrantConfirmation/ConfirmationSummary；API-AUTO-005/007/013 strict registry",
      "issue": "Summary 原样加 accepted 会多出 strict GrantConfirmation 不允许的展示字段；API 007 的 occurrenceFingerprint 依赖尚未生成的 runId；API 013 的必填 compensationConfirmation 与无确认 preflight 互相矛盾。",
      "suggestion": "定义单一 ConfirmationToken/Response；API 007 固定先建 awaiting 再调 012；API 013 增不带 confirmation 的 preflight union。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "API-AUTO-020；§3.6 AutomationHandlerResult；§5.1 OperationContractMap",
      "issue": "finish request 不是 discriminated union，允许成功无摘要、失败无错误、取消携成功结果；AutomationHandlerResult.resultSummary 也允许 null。",
      "suggestion": "按 outcome 建严格 union，并由 effect ledger 校验 sideEffectEvidence 完整性。"
    },
    {
      "severity": "major",
      "category": "approach",
      "where": "§7 CapabilityOperationId/CapabilityMap 与 handler allowlist",
      "issue": "effect.external.write 的任意 operation/requestRef 是通用外写逃生口；缺 operationId→effectClass/domainWriteClass/destination-kind 元数据；intelligence.sync/source_sync 合并 allowlist 导致权限过宽。",
      "suggestion": "删除通用 external write，增加静态 capability metadata map，并拆分 intelligence.sync 与 source_sync 的最小 operationIds。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "API-AUTO-018 automation.runtime.claim；§6 状态迁移",
      "issue": "批量 claim 遇单个坏 run 时，合同同时暗示转 blocked 和整批错误；response 没有 blocked/deduped，未定义 rollback、部分提交或继续扫描。",
      "suggestion": "明确逐 run transaction/savepoint，并返回 claimed/blocked/deduped 与安全原因。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "API-AUTO-025/026 legacy projection",
      "issue": "waiting 新状态映射到 legacy running 时没有处理 startedAt 非空约束；也未冻结新 handler/manual_only/interval 对 legacy 六类列表的可见性与映射。",
      "suggestion": "逐字段冻结状态投影；legacy 只暴露明确可映射 handler，并定义不可映射行为。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "API-AUTO-006；§3.1 AutomationJobResource；§9.1 automation_jobs",
      "issue": "archive operation 没有 archivedAt/status、默认查询过滤、FK/历史保留和重复归档规则。",
      "suggestion": "补 archive 的资源字段、物理字段、合法转换、可见性与恢复/不可恢复策略。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "API-AUTO-016 automation.diagnostics.export",
      "issue": "operation 声称只读，却创建 artifact 并写桌面文件；没有 destinationRef/requestKey，也没定义重复导出、覆盖拒绝和失败清理。",
      "suggestion": "拆成 snapshot + save 两个 typed operation，或补 destinationRef/fingerprint/requestKey 与完整失败语义。"
    }
  ]
}
```

### Round 3 finding disposition

| Finding | 裁决 | 理由 / 回退要求 |
| --- | --- | --- |
| manifest 缺执行策略与 child 授权 | 接受 | strict registry 的输入不足，属于可实现性 blocker；重做时增加 manifest policy 与 delegated grant |
| effect 状态与领域 receipt 断口 | 接受 | 当前无法证明 crash 后不重复写/付费；重做 effect UoW/receipt/reconciliation |
| cutover 无可执行恢复 | 接受 | 迁移承诺与 operation/state 不一致；重做 rollback、drain allowlist 与长 phase 恢复 |
| legacy 412 wire 不兼容 | 接受 | 现有 Zod envelope/旧 client 不会消费新字段；必须先确认 additive wire 并冻结 UI 跳转 |
| legacy null-account 未裁决 | 接受 | 直接补当前账号会串号；必须 quarantine 或人工归属，不能猜 |
| confirmation wire 三处冲突 | 接受 | 改成 token/response，先建 run 后确认，preflight 有独立 union |
| finish 非 discriminated union | 接受 | 会产生假成功/非法终态；重做 outcome union |
| external write/allowlist 过宽 | 接受 | 违反最小能力原则；删除通用逃生口并加 metadata map |
| bulk claim 部分失败不明确 | 接受 | 多实现会分叉；冻结逐 run transaction 与返回摘要 |
| legacy 状态/handler 投影不完整 | 接受 | waiting 的 startedAt 与新 handler 可见性会解析失败或误导 |
| archive 无持久语义 | 接受 | 不能让 BUILD 自行决定硬删或软删 |
| diagnostics export 伪只读 | 接受 | 文件写入必须有目的地、幂等和失败清理契约 |

**人的裁决**：尚未请求。由于存在 blocker，本轮不把任何 finding 作为 accepted-risk 交给用户绕过；
先退回 CONTRACT 重做，完成后需新工件/新评审，再申请确认②。
