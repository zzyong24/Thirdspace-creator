# T1323 本地结果独立复核

Root 独立于实施者 R 复核：认可当前两生产源的窄修与已审受控覆盖，可由 C 精确整合。此结论不代表统一 timeout Gate、新包、真实 Codex 供应商或父功能矩阵通过，不关闭整任务。

已实际读取最终生产 diff、原 binder、dispatcher 生命周期、最终测试关键断言与实施报告；独立逐项核验 OUTPUT_INDEX 的 1,603 件、389,714,605 字节，全部 bytes/SHA 相符。另核 green-full-v2、green-tail-v1、backend-checkpoint-v1、backend-type-v1、frontend-type-v3 的运行前快照，分别 69/69/67/67/68 项，无缺失或哈希差异。最终源也在 T1321 的独立输入复核中逐项核对。

固定身份：checkpoint `e5cb65fd0a2d479aacb4174a8e45b4926015af069bc025be6a665c3ca5d87933`；dispatcher `d08da799e1246adfa00245402bdfe44c88418de4e4664b76adba834578086f33`；test `c9c12147903cf0fbdefa08bfe801513b779056b59828f0310e945683f610db54`。报告 `83a115975b4ddac97caa3a6add8a4e2365a6eed0f3cf5cdfc60869af9ddfaf02`；索引 `371b9cc8ea2b4d8480420eb2216b6f72c99e2d09aeb19c829477385ac6ef0ed3`。

参数校验复用实际工具的原 forCall，不重建 schema 或摘要。解析器获取在 lease 外，受同 ref 的 pending/abort/scope 约束；当前完整账本在同事务中复核，native 幂等 save 也先验证。预读无 ordinary 而事务中新出现 ordinary 时拒绝缺 validator，不能静默跳过。non-chat 分支保持原入口，合法零 ordinary 不新增工具解析。完整 calls、unknown 根及 requests 的 null token 保留。

Root 实际核对普通参数三入口观测：合法 running attempt2、root unknown，只改 native input、保持原调用摘要与模型身份，read/首次 save/幂等 save 均精确抛原 binder 的“工具调用与冻结参数不符”。读过最终 tail 的实际工具引用证明：拷贝前 map 与实际消费者不同，原失败为测试改错引用；修改真实消费者后 schema/version/source/key 双入口准确拒绝，恢复原行后同线程完成。wrong fence 准确首门为 STALE_EXECUTION，不冒摘要门覆盖。

六个成功样本采用同最终两生产源的证据拼接：green-full-v2 为真实 5PASS/1FAIL，green-tail-v1 仅补四个未完成族与主混流终态。不是一次六例全绿。原 17 保护的最终源证据是串行准确断言与逐项污染/拒绝/恢复快照，因后续 schema 首失败没有该轮完整错误汇总；原汇总仅属于先前单源版本，报告已明确。没有补拍历史证据。五个已过变体和 tail 均真实原 attempt2 succeeded；ordinary/order/default 各原根与子模型两次合成 turn/start，invalid/host-only 各一次，共 17 账本行、10 次合成 turn/start。恢复无新增模型回合，重复终态 commit 保持 calls/events 不变。invalid_input 是原 binder 的正式错误回执，不能算实际业务生成成功。

原 checkpoint 24 项回归、后端类型、最终测试前端类型与边界/语义检查结果支持本地结论。所有原 RED、修后保护 FAIL、fixture/type 失败保留。资源清理与有限敏感值扫描有实际结果及排除范围；不据此保证未扫描目录或未知格式无秘密。

后续只需按原授权继续统一 Gate、一次 T1321 真实诊断及最终新包分模块验收，不为本次评审扩大产品或测试范围。Root 未重新执行实现测试或模型调用；实际宿主模型身份未读回，不声称速度模式已核验。
