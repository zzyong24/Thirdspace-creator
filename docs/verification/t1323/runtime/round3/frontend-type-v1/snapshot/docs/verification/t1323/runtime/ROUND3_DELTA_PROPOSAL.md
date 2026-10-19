# T1323 round3：复用真实普通工具绑定器的最小增量草案

本文仅供 C 正式化同 lineage 的 SPEC/DEC/锁与 B 独立复审。Root 已认可新增 dispatcher 的方向，但当前未授该生产文件写权；本轮只新增本文，不修改源码、测试、旧报告或控制状态，不运行测试。原 round2 PASS、首个完整 RED、前置失败与修后新失败均保留。

## 实际新失败与当前冻结

`ordinary-source-red-v1/execution-result.json`：自然 exit1，42.496 秒，运行 HEAD `a09959afd0351b558f89fbf8f5fa91819d54dfe2`。它是修后安全保护失败，不是原生产前 RED，也不是夹具提前触发租约门。

原件在 `cases/ordinary-source-red-v1/recovery/`：`attempt2-before-checkpoint-guards.json`、`checkpoint-valid-unknown-baseline.json`、`guard-ordinary-source-input-polluted.json`、`ordinary-input-target-observation.json`、`before-cleanup.json`；完整运行前源码/测试/config/native/worker/binding 在 `ordinary-source-red-v1/snapshot/` 与 `BEFORE_INPUTS.json`。

真实公开创建和准备 → immutable worker → Host `system.features` → ordinary `topic.generate` 与完整子模型回执 → 原生根完成但结算前物理停止自有 worker → 原公开 resume。attempt2 在原 `readCheckpoint` 调用前保持 `running`、有效 admission、根 `unknown`，未污染 baseline 已成功。

仅将 `payload.codexCalls[原root].tools[真实ordinary toolCallId].input` 从原参数改为合法 JSON `{"basis":"comments"}`，保 toolCallId/name、原 `call.inputDigest`、`chatModelIdentities` 与其他原行不变。真实 `readCheckpoint` **fulfilled**；随后“应抛 ConflictError”的夹具断言失败。原行由 finally 恢复，worker 最终 unknown_result；不能将后续 AssertionError 当产品准确拒绝。该 run 首次失败即止，尚未执行同污染下的 save/早幂等路径，不能冒已测。

当前暂冻 SHA256：

| 文件 | SHA256 |
| --- | --- |
| `backend/src/modules/execution/execution-checkpoint.service.ts` | `58ba6478f2f9a554c185e07729f1158e6db1560c69103251edc4db79d58827ec` |
| `frontend/src/server/__module_integration__/codex-mixed-checkpoint.persistence-client.test.ts` | `4673a8e4cc61500197b15b7b72989b4f1ba0cdd27fb421a4d81f84da5a8975c4` |
| `backend/src/modules/execution/model-worker-dispatcher.ts`，尚未修改 | `91f1ac7402e6567b8c254769b2c3202e4ffe4e6d04f7c6e1ff2b7f350ceb08db` |

先前 `green-v1` 的完整恢复 1PASS/44.614 秒与 `green-guards-v1` 的 17 项 read/save 双入口保护、额外消息/fence 检查及最终恢复 1PASS/66.694 秒均是真实局部结果；它们没有覆盖本次 ordinary input 变更，不能代本次完整性通过。

## 原因与最窄接线

`requireExternalChatCallTree` 证明普通工具的原生来源、操作键和子模型冻结身份，却不重算普通工具参数摘要。当前 checkpoint 仅检查 native.tools 对应 operationKey 以及已结算 receipt 的 ID/name；所以只改原 native input 仍能通过。

应复用现有 `createAgenticToolBinding(actualTools).forCall(task,calls,ordinaryCall,{readonlyRecovery:true})`，让真实生产参数 schema 的规范化、默认值、定义版本、execution/effect、validationOutcome 和摘要规则全部保持单源。该既有选项已通过 `originalCodexReadBinding` 支持真正 unknown 原生根，只提供只读来源证明；不能伪造 root started/settled、克隆修改状态或借别的 call。

不得在 checkpoint 手写第二套摘要算法，不得从 JSONB frozen JSON Schema 随意重建解析器代真实工具对象。JSONB properties 键序、schema 默认/转换及 invalid_input 的 validationOutcome 都会影响现有绑定结果；原 `submitted-task-preparation.service.ts` 已有此键序风险说明。checkpoint 本身没有实际工具构造依赖，也不能跨层导入 application/root registry。此文件仅引用该既有风险，不新增该源写权或执行依赖。

唯一新增生产 W 建议为 `backend/src/modules/execution/model-worker-dispatcher.ts`，保原 checkpoint W 与同一新增组合 test/runtime/result W，其余不扩：

1. 仅真实冻结的 Codex native chat 检查点入口需要普通工具 validator。沿实际 `chat.run`、冻结 modelInput/原生协议选择，不根据当前页面账号或实时模型配置判断，也不把 Pi、Agentic、非 chat model 或 ACP 误接进 native 分支。非 native、空账本与零 ordinary 的合法树不解析 chat tools、不制造新要求，保原路径、消息前缀与回执规则；最终同事务仍重新确认当前账本，不能凭事务外预读把后来已出现的普通工具漏验。
2. dispatcher 复用已有 `getChatTools(ref)` 和该 ref 的 `scope.externalToolMap`（现最终 commit 已沿此 map 调原 forCall）。解析必须在 checkpoint 的 lease 事务**外**完成，不能在持有 execution 行锁时再次进入 resolver/lease 造成重入等待。
3. 原 active scope 按完整 executionTaskId/attempt/fence 查找。新增 await 工作纳入该 scope 的 `pending`，遵循原 AbortController；await 前后核信号及 active scope 仍是原对象，结束在 finally 删除 pending。停机/取消/换 fence 后不能消费迟到 resolver 结果。不得增加账号/groupVersion 新准入策略或修改原期限。
4. 向 read/save 传 server-only 命名同步 validator。回调闭包只持真实 tools/binder；调用时使用 checkpoint `withLease` 当前同事务读到的真实 task、完整 calls 和当前 ordinary call，不能把事务外 task/calls 旧快照当授权。回调内不解析工具、不 I/O、不递归读 lease，只调用原 forCall 的只读恢复选项。
5. checkpoint 先校完整原生 root、Host proof/definition/version/input/digest/key/outcome、所有普通调用和子树，再角色分区。普通工具逐行通过命名 validator 后才进入角色消费；未知、错归属、重复 ID 与篡改不能被过滤隐藏。若 native ordinary 需要 validator 而缺少，不得默默降级成现有薄校验。
6. **native save 的早幂等返回也必须经过当前完整账本验证。** 原 same expectedRevision/requestDigest 分支在读 calls 前即 return；若只在 reconstruct 加 validator，重复 save 仍会绕过。native 分支应在同一事务读当前 task/calls、完整校验后再返回原幂等 receipt；非 native 保原顺序。原 revision/ledgerSequence/前缀/同 key 规则和原子性不变，不能用强制加 revision 掩盖遗漏。

实现细节可由正式 SPEC 收敛，但不得把异步 resolver 放进 lease、借通用布尔 skip 绕权限、透传预取旧 task、从 Worker 接收验证器、改原 worker/native tree/ledger 或绕过未知结果政策。

新增只读依赖请明确纳入真实锁：`backend/src/modules/execution/tool-parameter-recovery.ts`，原 binder 的 `explainToolParameterIssues` 实际来源；沿原 `toolValidationRecoveryVersion` 与 invalid_input/validationOutcome 规则消费，不改此源。dispatcher 当前原 SHA 和原 binder/原 parser 的既有读取也须按新最终 packet 绑定；不把本文静态核查冒最终受测锁。

## 新受测与拒因要求

在更新的真实 before 锁下，继续同一受控完整公共路线，0 真实供应商模型，不操作旧 UNKNOWN/候选服务/用户库，不续期、不重发原任务。实际 worker 加载路径仍是已审原 immutable 绝对路径，复制文件只用于 snapshot；字节相同不代表复制目录有相同外部依赖布局。

- 保本次 ordinary-source-red-v1；新 GREEN 先未污染真实 baseline，合法 running attempt2 同窗口仅改 native ordinary.input，分别实际调用 read、首次 save 和已有 same expectedRevision/requestDigest 的幂等 save，必须抛原 binder 的 `ConflictError: 工具调用与冻结参数不符`，不能提前被 stale/fence/status/revision 门拒。每条保污染前后 calls/payload/目标拒因，精确恢复后重新成功，原 worker 最终同 thread/read/commit 成功。
- 实测普通来源/name/operationKey/schema 或版本变化与参数顺序相关族。断言原 binder 对应的准确拒因或规范化结果，不用“任意 Error”充保护：真正语义变更须拒；仅 JSON 对象属性换序、默认参数或合法 invalid_input 回执应与原 binder 的实际规则一致，不能因新 validator 手写规则误拒原合法族。若原 binder 对某种变体自身不兼容，保真实失败并报告，不修改历史摘要或解析器绕过。
- 必须有**真正 external_agent 原根而无 Host 行**的 pure ordinary Codex 对照；不能拿普通 model-only/Pi helper 测试代它。非 native Pi/Agentic/model-only 的原消息前缀/回执/损坏树对照仍按既有规则，验证未调用 native resolver。
- 原 Host/child/root/frozen proof/digest/duplicate/foreign/fence 等保护按最终两源实际字节复核，未变化旧结果可精确标绑定与局限，不冒新源已测。native root unknown 不变；无原绑定/只读许可者仍拒，不新 thread/turn/start，不重复模型或 Host 调用，不提前投影 proposal。
- pending/unknownUsage/incompleteReceipt/knownSpentTokens/spentTokens/reservedTokens/ledgerSequence/childCalls 仍从全部真实 calls 计算。requests-null 不补0，recovery 不改 ready；实际 v2 worker 只取已审恢复名单，再读原 thread。保完整 calls/事件/最终消息/候选/卡唯一及终态重复幂等。

类型/边界/语义与完整 before/原 exit/索引/秘密检查/自有 PID 清理沿原要求；共享 timeout 仍由 C 最后独占，不在本草案重复运行。当前尚未新增生产授权/执行 round3；需 C 正式 SPEC/DEC/锁、B 同 lineage 独评、实际工具收据与新 packet/lease 后才继续修改第二源与新测。
