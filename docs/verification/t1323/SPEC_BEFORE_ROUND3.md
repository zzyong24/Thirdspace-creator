# T1323：恢复 Codex 混合工具账本的检查点读取

当前为独立待审草案，未 START、未授生产修改。用户全功能修复授权下，Root 于本轮确认单独登记；不将 T1320 的恢复失败掩成通过，也不把旧 chat824/825 的未知首因补为本因。

## 已发生事实

T1320 真实公开受控 v2 混流恢复保护 `runtime/green-protection-v2` 自然 exit1/53.279s（integrity PASS、recovery FAIL）。新 owned 公开 chat → Host system.features → 普通 topic.generate → 子模型完整结算，在原生根返回完成、settleExternalChatTurn 之前物理停止自己的 worker。原 execution 真实 unknown_result；自动 drain 0 claim。通过原公开 commandExecutionTasks.resume 后 attempt2，readCheckpoint 首抛“内部模型调用的父工具归属损坏”，没有进入新增投影，也没有新增 turn。

实际父树是 external_agent(root) → external_tool；ordinary tool 为 root，model → ordinary tool。Host 行由 external-task-tool.service.ts:73 真实创建；external-chat-call-tree.ts:16–33 明确支持。execution-checkpoint.service.ts:111 调用 generic partitionExecutionCalls，该函数只准所有子行是 model→tool，于 execution-call-tree.ts:13 拒绝合法 Host 行。reconstructCheckpointMessages:44 同样调用 generic partition，不能只改 read:111 后再撞第二处。

现成原件可证明这次新受控失败，但不是本任务自己的完整前置锁/RED。原 T1320 字节、失败与报告只读保留。

## 最小目标与保持规则

仅在已冻结、可信 Codex native external chat 任务中，使合法混合账本可被检查点消费者读取，并允许既有公开显式 resume 沿原 thread/turn 只读恢复。先用完整真实调用树与冻结身份验证所有 calls，再区分 checkpoint 消费角色；不是先过滤 external_tool，也不放宽通用 partition。优先只改 execution-checkpoint.service.ts 的 native 分支，复用现有 requireExternalChatCallTree 及必要既有 trusted proof 校验。无唯一原根、错 task/root/toolCallId/operationKey/冻结工具/参数来源/父子关系或未知 kind 均拒绝。保存和读取不能各用不同的放宽口径。

保持原 Pi/Agentic/model-only 重放消息前缀、顺序、唯一性与回执校验；native 不生成虚假 assistant/tool checkpoint 消息，不绕过原有 refs 验证。普通 worker tool/model 与 Host external_tool 的分类应由真实账本和冻结协议证明，不能按名称猜测。

pendingCalls、unknownUsage、incompleteReceipt、knownSpentTokens、spentTokens、reservedTokens、ledgerSequence、childCalls 及预算/期限仍取全部真实调用，不丢弃 Host/unknown 调用、不把 requests 的 totalTokens=null 伪造为0。不为跑通把 recovery 改 ready，也不放宽租约、fence、原生绑定、原 key、取消、授权、UNKNOWN、receipt 或费用政策。须读实际 native consumer：它只取已审 child 恢复名单而后读原 native thread；不得机械修改通用预算语义。若真实链在合法完整树验证之后另有拒绝，保首错、回报精确新范围，不临场扩大。

## 精确建议范围（待正式锁与独审）

生产 W 仅 `backend/src/modules/execution/execution-checkpoint.service.ts`。通用 execution-call-tree.ts、external-chat-call-tree.ts、worker/SDK/ledger/projection 全部只读。测试 W 新 `frontend/src/server/__module_integration__/codex-mixed-checkpoint.persistence-client.test.ts`；自有 `docs/verification/t1323/runtime/**`、IMPLEMENTATION_RESULT.md。无需修改旧 T1320 test/报告或当前候选。可在自有 runtime 复制已审 T1320 原生边界替身与 runner 后绑定具体 SHA，不运行旧 beforeAll/build，不写 dist 或公共缓存。

R 至少包括 checkpoint/call-tree/lease/ledger/external-task-tool、external-chat-call-tree、codex-read-recovery、ai-worker/src/execution/external-chat-worker-run.ts（真实v2 recoverRoutedChatChildren:70及:144选择）与 codex-native-turn.ts 的实际入口、T1320 最终生产与测试/fixture/worker binding、真实公开 transport/dispatcher/commandExecutionTasks。最终 C 需按实际稳定源码锁定完整来源；草案不拿未来 SHA 冒冻结。

## 必须先执行的完整 RED

新 owned PGlite/空认证目录，以 immutable worker 和真实公开 chat/prepare/dispatcher/SDK/native RPC 替身执行上述混流。完整运行前保存本任务生产/测试/配置/替身/immutable worker 与所有锁输入。完整合法 root/Host/tool/model 及完整 usage、原 thread/turn 均由生产端口落账；禁止直接 DB 捏正常账本或 mock checkpoint/complete/ledger。仅在明确原生根完成但结算前停自己 worker，以原公开 resume 进入真实 readCheckpoint。保存原请求、首中文 throw/安全 stack、调用树、账本/流/业务终态、RPC、turn/start 数和自然 exit1。不得操作旧825或任何旧UNKNOWN；0真实外部模型，合成协议仍如实计 root/child 调用。

## GREEN 与保护

修后同一完整新链可读真实 checkpoint、恢复原 native thread/read，不新 thread/turn/start，不重复模型/Host工具或账本，最终原公共任务 succeeded、完整消息/两类卡/普通候选唯一，真实最终 external-chat-turn commit 通过，终态重复幂等。单纯 helper 通过或恢复名单返回不代表整链通过。

同一真实受控账本下精确验证 wrong root/foreign task、未知 kind、external tool 父错/来源缺失、ordinary 子模型父错、重复 toolCallId、冻结来源/digest/receipt 篡改仍拒绝；原 native 未绑定/无恢复许可不重发。保完整 calls 的 pending/unknown/request-null token/预算返回事实，并验证 native consumer 不因本修复制造新调用。纯 ordinary Codex 与原 Pi/Agentic checkpoint 前缀成功及篡改拒绝对照可引用实际同字节证据，缺覆盖处精确补测。跨 user/group/account/fence/取消的原门保持，必要入口回归。保护 fixture 污染须在真实完整调用账本已经建立、原公开 resume 的 attempt2 仍合法 running/admission 窗口中注入，不能等 task succeeded 后仅被租约门拒。每项先有未污染基线成功，断言目标中文拒因/来源（不能任意 Error 充通过），保存拒绝前后全账本并恢复精确原行；恢复后基线再次通过及实际终态 commit。若无法安全命中该窗口，记录缺测，不伪造状态或以其它 guard 提前拒充覆盖。该污染不能充前 RED。

运行真实 backend/frontend 类型、boundary、semantic；timeout-policy 依 Root 同源码共享 Gate 安排精确引用，不能自填。test3600000ms、hook≥180000ms、外层86400s、retry0/singleworker；请求/观察≥120s，保更长原预算，不续期/重发未知任务。最终保失败、SHA/index/秘密扫描/own PID 清理。独立评审、actual PASS、lease/packet 后才实施；最终只签本地实际覆盖，真实供应商/新包/父矩阵另外验收。

## 独评增量记录

B 首轮 CONCERNS 两项保留：安全污染注入时机/断言必须避开终态租约提前拒；实际 v2 恢复consumer必须绑定正确源。上述为本次草案收敛，未改生产、未补拍任何历史RED，待B复核及C真实记录。
