# T1249 独立合同审查

结论：PASS_CONTRACT_ONLY，findings=[]。绑定正式 SPEC SHA256 `627e62fa21b4a46e672b99ba3ac647437c03294f2b65fa004abdc60c093f7339`，候选diff及真实消费者见来源绑定 `ab90a75f62567ebc75b47552bb79d6bc1ffe26043c671c25f0ebcc4d29a9d0ec`。作者是root；审核者未改正式SPEC、产品或测试，未record控制面、未运行模型/PG/Worker/App。实际审核模型unknown/inherited。

五族校准与原真实合同一致：

| 输入族 | 原错误及真实consumer | 校准后必须保留的精确断言 |
| --- | --- | --- |
| completed | Worker累计文本已经包含前文；completion从全部根model文字拼成完整正文 | final.text固定“先查询。有来源的结论”，前文仅一次；saved.content完整等于final.text，不能再拼前文 |
| approval/length | submission冻结toolOutcomeProjectionVersion=1，applyChatToolOutcome在宿主data添加可信__creatorosOutcome | ledger原status/data/summary/error/continuation/sideEffect、Worker原data输出、真实execution callId及完整schemaVersion1展示包装逐个独立期待；不调用生产投影helper造expected |
| denied | submission冻结toolFailureReceiptVersion1；后端原tailFailed在最新settled stop且未交付proposal/committed时追加固定notice | 执行0、approval:false、原output-denied、Worker原正文保留；后端追加完整notice且AI/execution精确partial，不改模型/Worker原completed为成功交付 |
| repeat | execution-chat-tool-ports显式reuseReadResults:false；两个不同provider toolCallId代表两次新外部观察 | read-1/read-2分别执行，第二无reusedCallId；同最终checkpoint第三次run HTTP/execute计数都不增；原5call、15token、序列/来源完整保留 |
| unknown/empty/http429 | 原明确未知阻断、最终空回复失败、429拒绝回执 | 原三个body和反例不改；必须在真实完整八例复跑中交付，不以五族/helper替代 |

候选保持坏version、错误fence、跨account/frozen-input漂移拒绝；恢复前后execute计数；并发completion同receipt、单result和usage。只用手工明确固定期望与真实ledger字段构建展示expected，未剥__creatorosOutcome或改production策略。原3PASS/5FAIL回执保留，不能将本评写成八例已绿。

原T1026合同明确“同一call历史重放保留，新读取不能永久复用早期观察”及固定后台partial说明；T1249对父B041的澄清没有把新read-2冒充同checkpoint重放。源实现尚可继续重跑，不授权其他原测试集批量放宽。

实施验收仍须完整原单文件8body，test/hook至少180000、retry0/bail0、上游真实Worker/Pi/SSE及同账本completion链，外层包括全部串行/启动/清理；返回真实JSON、EOF/exit与owned临时库清理。此评不代签该运行、官方模型、App或全局Gate。
