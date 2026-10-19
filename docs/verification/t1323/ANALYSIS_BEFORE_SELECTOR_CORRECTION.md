# T1323 只读分析

确定的新受控缺陷是 checkpoint 通用树分类不接受生产合法 external_tool 子项，不是 T1320 投影回归，也未证明原825首因。

证据入口：`docs/verification/t1320/runtime/RECOVERY_LIMITATION.json`、`cases/green-protection-v2/recovery/{after-controlled-stop,public-readonly-resume,after-drain}.json`、native-rpc.ndjson 与 green-protection-v2/execution-result.json。该 run integrity1PASS/recovery1FAIL，exit1/53.279s；不是全套PASS。原树：external_agent sequence1(parent null,unknown,total12)；external_tool sequence2(parent root,settled,requests/null)；tool sequence3(parent null,settled,total0)；model sequence4(parent tool,settled,total12)。真实 IDs 见上述原件，不复刻旧任务或用户认证。

源码锚：external-task-tool.service.ts:66–73 实际原生 Host identity 与父指针；external-chat-call-tree.ts:9–35 可信完整 native tree；execution-call-tree.ts:9–17 仅 model 子行的原通用规则；execution-checkpoint.service.ts:44/111 两次 partition 调用。必须同时处理 read 和其消息重建路径，不能在111过滤一次之后让44仍拒。

实际 v2 native 消费在 ai-worker/src/execution/external-chat-worker-run.ts:70 recoverRoutedChatChildren，并由:144按executionEngine选择；此函数readCheckpoint只取已审恢复名单，随后恢复原call、原native读。external-chat-recovery.ts 是另一路旧辅助函数，不拿它代本次真实 v2 worker绑定。正式INPUT_LOCK须包含真实v2入口与codex-native-turn.ts以及immutable worker原件。两条路径均不要求把requests-null token改零或recovery改ready；完整calls仍决定pending/usage/账本。Pi/Agentic完整checkpoint协议保持。

推荐最窄实现是 checkpoint 内受冻结 native 分支的可信树分类适配，先验证全树，再复用明确角色的消息/子项读取。通用 helper保持只读，避免无意允许其它执行模式新增子kind。具体怎么向重建函数传已验证分类由实现者决定，但对任意未知/错误call不能直接丢弃；saved refs/顺序/唯一性/真实回执必须保。新生产W、完整before锁、新公共RED、独审与执行授权尚未发生，本草案不冒已准入。


B首次独评CONCERNS另要求：完整账本已建立后、resume attempt2仍running且租约/admission有效时逐个污染；未污染读取先成功，每项验证确切拒因而非任意Error，精确恢复原行后再通过。task succeeded之后的租约拒绝不算树校验保护成功。该新方案未执行，不冒已有证明。
