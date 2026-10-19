# T1323 独立初审

审核者：`/root/sol_daily_implementation_current`，GPT-6.1 Sol/high。仅只读源码和原件；没有运行测试、HTTP、模型或读取数据库/raw log/凭据。没有修改 SPEC、ANALYSIS、输入锁、生产或共享控制。

## 输入绑定与结论边界

- SPEC：`docs/features/t1323-codex-mixed-tool-checkpoint-read.md`，SHA256 `140a4d78f80ca04b8a841a5754e88b840e54748ccebb55640ae3974cf9b6877d`。
- ANALYSIS：`docs/verification/t1323/ANALYSIS.md`，SHA256 `cda89a63c2da234a85de65c7503524ae04dd3d3c3743342f2764654ca125faa7`。
- 本审读 T1320 原 `RECOVERY_LIMITATION.json` 及真实 `green-protection-v2/recovery` 的 controlled-stop / public resume / after-drain / native RPC 原件，完整新前置锁与 T1323 自己的 RED 尚未发生；不以旧快照补拍为本任务前证。

总体方向可在单一 `execution-checkpoint.service.ts` 内实施：可信 native 分支先核全树，再适配两处 partition 消费；保原 generic helper 及全部 calls 的预算、UNKNOWN、费用事实。没有发现必须增加生产文件的事实。当前需要下述保护执行条件校准及消费者来源补正，供作者/C 正式化后再锁、独审工具与 packet；本文不是正式 PASS 收据。

## Findings

### REV-001 · major · 保护的活跃窗口和目标拒因须明确

SPEC 末段要求“保护 fixture 污染须在真实链完成后受控注入且恢复原行”。如果“完成”指 execution 已 succeeded，则 `readCheckpoint` 经 `leases.withLease(ref,"admission")` 会先抛“当前执行已停止或租约到期，不能启动新动作”，任何树篡改都可能仅靠任意 Error 断言变绿，未进入新 native 分类/来源验证。这会使已经列出的 wrong root、proof、digest、receipt 等保护无法证明真实守卫。

请把操作窗明确为：完整真实 root/Host/ordinary/model 已由生产端口形成，且仍处于拥有合法 ref 的 running 恢复 attempt2、最终提交前；或者独立新 owned 等价样本的相同合法窗口。在该窗先证明未污染 checkpoint/调用树成功，再逐项注入，断言确切目标错误及 stack/阶段已经通过 lease admission、未请求新 turn；恢复后 exact rows 相等且原完整链成功。跨身份/错误 fence 的准入负例独立记录，不能冒树保护。禁止为了保护测试把一个已终态任务手动改回 running。

这是需在正式锁前消除的测试合同歧义，不要求扩大产品策略或生产 W。

### REV-002 · minor · 实际 v2 恢复消费者应作为主来源

ANALYSIS 的消费者主锚是 `ai-worker/src/execution/external-chat-recovery.ts:11–23`。实际被测 v2 输入在 `external-chat-worker-run.ts:144` 进入同文件的 `recoverRoutedChatChildren`（:70 起）；该分支依已冻结的路由/身份恢复原 child。旧 external-chat-recovery 是 else 路径，不能单独代签当前 v2 消费者已核。

请在正式 read-set/input lock 中包含当前 `external-chat-worker-run.ts`、`recoverRoutedChatChildren` 直接消费的 routed child 模型恢复源，以及原旧分支作为兼容对照；描述以真实 v2 路径为主。草案已声明“最终 C 锁实际消费者”，本文不将未来锁冒成已经存在。

## 已核的正确要求

1. 原四 call 树由生产端口产生：external_agent(root unknown)→external_tool(settled)，ordinary tool(root settled)→model(settled)。generic partition 的首次拒绝是合法 external_tool 子项，不是普通 model 父树损坏。该 helper/checkpoint/native recovery 源与固定 0e1dc622 候选相同，T1320 恢复失败先于新增 ensureInputs，非新增投影回归。
2. 不能只在 read:111 过滤 Host 行；`reconstructCheckpointMessages` 自身也调用 generic partition，save/read 两侧必须采用同一受验证分类。未知 kind/不可信来源不可静默丢弃，也不能把 native root 伪造为普通 model 消息。原非 native refs 前缀、顺序、唯一性和回执验证保持。
3. 可信 native 准入应核实际冻结 Codex 协议、唯一原 root 和原 thread/turn、全部真实调用及原定义/参数 proof/digest/receipt；单用 `requireExternalChatCallTree` 返回不代表每个 external 参数来源均已验证。SPEC 已要求必要 trusted proof 和相应负例，具体实现仍需实核，不能从工具名称猜授权。
4. 全部 calls 继续决定 pending、unknownUsage、knownSpent/spent/reservedTokens、ledgerSequence、预算与 deadline。requests 的 totalTokens=null 保留，native consumer 可只消费已审恢复名单；不能改 recovery=ready 或把 null 造为0来过关。
5. 新独立公共完整 RED→修复→GREEN 的设计必要且正确：owned 数据/真实 public prepare/dispatcher/immutable worker/ledger，外部 native RPC 才替身，生产 stop 自有 worker、原公开 resume attempt2，只读原 thread/turn，不新 turn/start/模型/Host 执行。最终必须真实 commit、唯一候选/卡/消息/finish及幂等，helper 或名单成功不够。
6. Pi/Agentic/model-only/纯 ordinary Codex 对照、错误 scope/fence/取消与树篡改均保留；引用旧证据必须绑定同字节，缺的补精确范围。旧825 UNKNOWN、现包/controller/用户 DB 不操作。

## 本轮产物状态

原 source/input lock、正式评审工具收据、packet/lease、T1323 新执行证据均尚未形成，本文不签已锁/已实施/已验证。Root/C 处理上述两点后，由独立流程实际定审；本审核文件完成后单文件写权以消息 RELEASE。
