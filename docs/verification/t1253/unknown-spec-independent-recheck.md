# T1253 UNKNOWN 窄合同独立复评

结论：PASS_SPEC_CLARIFICATION_ONLY，findings=[]。绑定候选 `b132114ba0b561dc362b9f10d2cb5471a12206a35ef6377bfa3324859661059c`，原 SPEC `093bbe2ef67ab4c94ad073243edf55dca90c678b5a2b1aa40443d8b406cd8f19`；仅允许正式 recheck，不代签实现或运行。

## 真实许可与边界

T1022:39 原许可只覆盖无外部副作用模型候选。persistent-task.service.ts:968、1004–1025 在原任务行锁下核 pending；model-call-recovery.ts:73–78 排除 Codex、asset.generate 和已有 provider job/result/ref。chat-generation-recovery.ts:95–149 核原提案、父工具身份与原子槽；text-node:241–283 和 ledger:83–101 再核 parent/hash/operationKey/accountingBasis/预留、原 retryOf 及新租约 attempt。旧 unknown 模型只有先永久 superseded 才获同原任务重试许可，原预留仍占预算，continuous/null deadline 不续期。任何未知外部工具、新身份或真实 Codex thread/turn 都未获得此许可。

## 当场观察逐族

完整原25实际为17PASS/8FAIL、无skip，原 res.destroy 与供应商回复没有改动。11快照和7原始回执全部逐SHA复核；source digest f63f0ae6…前后相同，stdio已close、owned组0、目录已清理。

- hooks：原根→旧子断线→合法新子共3HTTP；新子 retryOf 精确指旧子，原 key/hash/parent/accounting 一致，旧6889预留和null usage保留。最终父工具与新子 unknown/null，task unknown_result，formal为空。已settled根模型totalTokens5保持，不能称根模型unknown。
- draft：前3HTTP同一纯候选恢复，第4为携原script_draft tool回执的根续跑。旧5324预留/null usage仍保，新子原槽结算5；父回执版本1、no_evidence、retryable=false、sideEffect=none、evidence=[]、data.taskId/projectId=null。task/business partial，唯一conversation_reply也partial，不是作品候选成功。

观察收据尚未直接查询作品/稿件任务/可采纳候选产品表。候选明确要求后续原归属表0断言并禁止以formal refs空代证，故此待执行项不构成规格歧义，也不能提前署实现通过。后续test具体diff仍需独评，不能只把2改3/4或换刺激；完整25、原9/46、types及Gates必须真实执行。

本次只读核查；没有修改SPEC、原测试或生产代码，没有重跑模型/PG/App。独立formal JSON、完整sourcebinding与此报告同目录，作者未知底层具体模型版本，未虚构。
