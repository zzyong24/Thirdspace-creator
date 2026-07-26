# T-517 Automation Kernel PRODUCT SPEC 独立评审

> Artifact: `2026-07-24-creatoros-automation-kernel.md`  
> review_mode: `cross-family`  
> model: `gpt-5.6-sol`  
> execution: `codex exec --sandbox read-only --output-schema spec-reviewer.schema.json`  
> reviewer input: `prompts/spec-reviewer.md + docs/产品定位.md + PRODUCT SPEC`  
> human decision: `confirmed① 2026-07-24`

## Round 1

**Verdict: FAIL**

方向与统一底座目标成立，但存在致命可行性假设未前置验证、安全授权缺口、迁移竞态，以及 FR 与
Out of scope 的范围矛盾，不能通过 PLAN Gate。

### 原始 findings 与处理

| # | Severity / Category | Finding | 处理 |
| --- | --- | --- | --- |
| R1-01 | blocker / value-viability | PGlite occurrence 事务、并发 claim、回滚与 lease recovery 是致命且便宜可验假设，却推迟到 CONTRACT/BUILD | **接受。** 完成真实 PGlite 内存驱动 spike 与既有 PersistentTaskService 6 tests，证据落在 `docs/research/2026-07-24-automation-kernel-pglite-rat.md`；§4.4 回填结果并保留正式 BUILD Gate。 |
| R1-02 | blocker / fit-positioning | 无人值守付费/写入 handler 只有“提示”，没有授权建立、快照、claim 前复核、撤销/配置漂移阻断和不确定副作用 reconciliation | **接受。** 新增 `FR-AUTO-15`、`FLOW-AUTO-06`、`ENT-AUTO-06`，把 effect class、authorizationMode、版本化 AutomationGrant、claim 前复核、撤销/漂移 blocked 和 reconciliation 写成可验收契约。 |
| R1-03 | blocker / approach | 原迁移先复制对账再 fence，期间旧 writer 仍可变化，对账会立即失效 | **接受。** `FR-AUTO-13/FLOW-AUTO-05` 改为先安装 fence、进入 maintenance 停旧生产者并等在途收口，再做最终一致快照迁移/对账；明确切换前后不同回退边界和故障注入点。 |
| R1-04 | blocker / scope-reduction | 承诺 `context.health` 完整接入和按钮，但 Out of scope 又不实现领域 scanner/report，形成假按钮 | **接受。** T-517 只提供不接生产的 typed conformance fixture；T-516 领域 CONTRACT/确认②前不注册 handler、不创建 job、不显示开关/立即检查按钮。生产完整接入仍由已登记的 T-516 承接。 |

### Round 1 结构化原文

```json
{
  "verdict": "FAIL",
  "summary": "方向与统一底座目标成立，但存在致命可行性假设未前置验证、安全授权缺口、迁移竞态，以及 FR 与 Out of scope 的范围矛盾，当前不能通过 PLAN Gate。",
  "findings": [
    {
      "severity": "blocker",
      "category": "value-viability",
      "where": "§4.4 五大风险与 RAT；§10 HARD-AUTO-01；§17",
      "issue": "真实 PGlite 原子 occurrence/claim/recovery 未在确认①前验证",
      "suggestion": "完成最小真实驱动 spike 并回填"
    },
    {
      "severity": "blocker",
      "category": "fit-positioning",
      "where": "§4.1 FAQ 4；FR-AUTO-04/07；HandlerManifest；FLOW-AUTO-01/02",
      "issue": "无人值守付费/写入没有可执行授权契约",
      "suggestion": "定义授权范围、版本、快照、复核、撤销和 reconciliation"
    },
    {
      "severity": "blocker",
      "category": "approach",
      "where": "FR-AUTO-13；FLOW-AUTO-05；Pre-mortem #7",
      "issue": "先迁移对账后 fence 存在旧 writer 竞态",
      "suggestion": "先 fence/收口，再最终增量迁移与对账，补失败回退"
    },
    {
      "severity": "blocker",
      "category": "scope-reduction",
      "where": "FR-AUTO-11；IA-AUTO-01/02；Out of scope；AC-AUTO-06",
      "issue": "context.health 完整接入承诺与不实现领域逻辑矛盾",
      "suggestion": "纳入完整领域逻辑，或明确移出生产接入与 UI"
    }
  ]
}
```

## Round 2

**Verdict: FAIL**

整体方向、OSS 调研和迁移思路扎实，但无人值守领域写入与宪法 P-01 冲突，且授权、运行状态、
停止语义和迁移授权仍未形成可执行闭环。

### 原始 findings 与处理

| # | Severity / Category | Finding | 处理 |
| --- | --- | --- | --- |
| R2-01 | blocker / fit-positioning | `grant_at_enable` 仍可能让 handler 无人值守写领域事实，与 P-01“自主执行只产候选/decision/manifest”冲突；grant 不能替代逐项领域确认 | **接受。** 新增 `FR-AUTO-17/NFR-AUTO-13`：只允许运行账、用户委托来源返回的可验证 evidence 无人值守写入；AI/语义/创作/修复只能写候选。Manifest 声明 domainWriteClass 和 operation allowlist，runtime 只注入三重交集后的 typed service port，越权 blocked。 |
| R2-02 | major / completeness | Run 缺 grant/handler/config/effect 快照，Manifest 缺稳定 handlerVersion，无法执行“精确复核” | **接受。** `ENT-AUTO-02/03/06` 补 handlerVersion/definitionRevision、payload/config fingerprint、grant revision、effect/destination snapshot 和 operationIds；claim 逐字段精确匹配。 |
| R2-03 | major / completeness | skip、等待确认、retry wait、reconciliation 没有可持久承载的状态或事件 | **接受。** 扩充 `FR/ENT-AUTO-02` 有限状态；新增 append-only `ENT-AUTO-07 AutomationRunEvent`；misfire/overlap 也创建唯一 skipped run。 |
| R2-04 | major / traceability | 产品原则要求 cancel/retry，但没有用户流程、按钮条件或 disable 语义 | **接受。** 新增 `FR-AUTO-16/FLOW-AUTO-07/SCN-AUTO-08`，定义停用事务、协作取消、进程树终止、不确定结果 reconciliation、人工重试和幂等命令；IA 只展示真实支持的动作。 |
| R2-05 | major / completeness | 迁移没有说明旧 enabled job 如何获得新 AutomationGrant，存在静默扩权 | **接受。** `FR-AUTO-13/FLOW-AUTO-05` 规定只有精确可审计旧同意才能迁 grant；否则保留计划但暂停为 `reauthorization_required`，并把 grant scope/fingerprint/revocation 纳入对账。 |
| R2-06 | major / completeness | manual requestKey 没绑定 job/payload/config/grant，配置变化后可能错误命中旧 run | **接受。** `FR-AUTO-07/FLOW-AUTO-02/ENT-AUTO-02` 新增完整 manualRequestFingerprint；同 key 同 fingerprint 返回原 run，不同则 409 `IDEMPOTENCY_CONFLICT`。 |

## Round 3

**Verdict: FAIL**

Round 2 的迁移重授权与基础状态设计已有加强，但 P-01 写入边界仍未经产品宪法裁决；授权快照、
状态机、逐次授权和取消重试也尚未形成可执行闭环。依流程三轮后仍有 blocker，本任务停止在 PLAN，
不得继续 CONTRACT/BUILD，等待用户产品裁决。

### 原始 findings 与处理

| # | Severity / Category | Finding | 处理 |
| --- | --- | --- | --- |
| R3-01 | blocker / fit-positioning | `FR-AUTO-17` 把计划级 Grant 解释为可无人值守写指标、评论、作品明细，但 P-01 明定自主执行只产候选/decision/manifest；同时 `verifiable_ingestion` 禁止项目，R-INGEST 却要求自动采集幂等创建 imported project | **接受 finding，停止代替用户裁决。** 需要用户确认“创建/启用采集计划是否构成对未来可验证 evidence 的预授权”，并裁决 imported project 是受限 evidence projection、pending evidence，还是每次确认。裁决后更新产品宪法/DEC，并逐实体、字段、operation 列 allowlist。 |
| R3-02 | major / completeness | Run 只有 fingerprint 没有可恢复的脱敏 typed payload/config snapshot；Grant 缺 definitionRevision；manual fingerprint 未覆盖 definitionRevision、payloadVersion 和完整授权面 | **接受，待 blocker 裁决后回修。** 定义规范化 manifestAuthorizationFingerprint，并将脱敏 snapshot、schema digest、definition、写入类、授权模式、effect/destination/operation、幂等与运行策略一起固化到 grant/run/manual key。 |
| R3-03 | major / completeness | `confirm_each_run` Grant 没有 run/occurrence 绑定和 single-use，可能被后续 occurrence 复用 | **接受，待 blocker 裁决后回修。** 单次 grant 绑定 runId/occurrenceFingerprint；确认、绑定、queued 原子提交，claim 校验未消费/未撤销。 |
| R3-04 | major / completeness | 状态图缺 awaiting/queued/retry_wait→blocked、retry_wait→cancelled 和 reconciliation 出边；status CAS 与 event 追加未规定同事务 | **接受，待 blocker 裁决后回修。** CONTRACT 前补权威 transition table（from/to/trigger/guard/revision/event/idempotency/claimability），状态 CAS、attempt 和 event 同事务。 |
| R3-05 | major / completeness | 迁移使用 desiredEnabled/suspendedReason，但 AutomationJob 没有字段，无法区分主动停用与待重新授权 | **接受，待 blocker 裁决后回修。** 补 job 期望启用/暂停原因与重授权原子恢复规则，纳入列表和迁移对账。 |
| R3-06 | major / fit-positioning | P-05 要求长任务可取消/重试，但 manifest 可任意设 false，且没证明必迁长任务均支持取消、重试或 reconciliation | **接受，待 blocker 裁决后回修。** 为全部代表 handler 建 cancellation/retry/reconciliation 矩阵；长任务强制持久取消/checkpoint/进程树终止/安全恢复，只有可证明短时原子操作可不支持中途取消。 |

### 用户裁决与最终处置

用户明确指出：自动化落实的是采集证据和待确认预设，真正进入系统业务闭环才需要人的确认；无需
把正常定时采集复杂化为逐条授权。主 Agent 接受该产品裁决，判定 Round 3 对“持久任何领域记录”
与“进入 active 闭环”的等同过宽，并完成以下处置：

| Finding | 最终处置 |
| --- | --- |
| R3-01 | 已更新 `docs/产品定位.md P-01/R-INGEST`、`DEC-AUTO-001` 与 `FR-AUTO-17`：用户创建/启用来源即持续确认范围内 evidence/pending/imported preset；`source=imported` 是历史作品 evidence projection，可幂等创建；转 manual/active、正式稿件/经验、发布/删除/修复或驱动下游闭环才需人工确认。 |
| R3-02 | Run 新增脱敏 typed `payloadSnapshot/configSnapshot` 与完整 `manifestAuthorizationFingerprint`；Grant 补 definitionRevision/payloadVersion；manual fingerprint、claim、retry、迁移对账全部绑定完整授权面。 |
| R3-03 | `confirm_each_run` Grant 绑定 `runId + occurrenceFingerprint`、single-use；确认/绑定/queued 同事务，首次副作用前 CAS 消费。 |
| R3-04 | 新增权威 transition table，补全 blocked/cancelled/reconciliation 出边；所有状态、attempt、lease 与 event 同事务，命令带 expected revision 和 commandKey。 |
| R3-05 | AutomationJob 补 `desiredEnabled/enabled/suspendedReason`，定义重授权后原子恢复和主动停用区分。 |
| R3-06 | `FR-AUTO-11` 为全部必迁 handler 增 cancellation/retry/reconciliation 矩阵；长任务强制 cancellable/retryable，只有可证明 P95<1s 的无外部副作用原子 handler 可例外。 |

**Review adjudication：RESOLVED，等待 Product Gate 与确认①。** 历史 Round 3 机器 verdict 保留为
`FAIL` 审计证据，不篡改；产品 blocker 已由用户裁决，五项 major 已逐项落到可验收契约。

## Product Gate

**Status: PASS；确认① PASS（用户 2026-07-24 明确认可）。**

证据：17 FR/13 NFR/7 FLOW/7 ENT/3 IA/8 HARD/6 FAQ 完整；17 个 FR 均有价值注；
`NEEDS CLARIFICATION=0`；55 个 AUTO ID 全部登记；PGlite RAT 已回填；`orphan-scan` 0 error；
相关文档 `git diff --check` 通过。PLAN 已完成，可进入 CONTRACT；确认②前仍不得进入 BUILD。
