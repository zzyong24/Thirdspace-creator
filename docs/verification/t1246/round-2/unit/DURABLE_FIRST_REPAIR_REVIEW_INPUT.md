# B041/B042 首次真实聊天端口迁移后的独评输入

`durable-chat-port-first.json/.txt/-exit.json`：原完整八例，retry 0，实际 exit 1，3 PASS / 5 FAIL；外层未耗尽、进程组无残留。源码前后绑定均已保存。未覆盖或删除首轮失败。

- completed：Worker 的 final.text 实际已包含“先查询。”，旧保存断言再加一次导致期待双前缀。候选仅精确改保存 content 等于原 final.text，并独立保留首段文字、合并顺序及唯一出现断言；不删原 token/parts/原子保存断言。
- approval / length：后端受控投影增加 `__creatorosOutcome`（真实 callId、status、summary、sideEffect、error、continuation），Worker 原 parts 没有该 UI 元数据。候选按原已确认工具账本回执验证每个新增字段，并保原正文/顺序/输入/输出断言；不能随意删字段后比较，也不能仅镜像 helper 实现冒充端到端检查。
- denied：真实保存正文追加完整 partialNotice，父 task 为 partial，原因是被冻结 toolFailureReceiptVersion=1，末次真实拒绝且无已交付候选。候选保原没有执行、授权拒绝和所有权断言，新增 notice 精确断言并保前文相同；是否把旧 succeeded 期望迁移到 partial 需独立合同确认。
- repeat：`execution-chat-tool-ports.service.ts:103-104` 明确 `reuseReadResults:false`，原 read-1 与新 read-2 是不同调用，新调用实际执行两次；原测试还立即重跑同一最终 checkpoint，重放不再调用。不能把两个 distinct call 当幂等重放。候选须分别证明：两个真实工具调用各一次；同一 checkpoint 重放执行次数不增加；第二工具回执不是 reusedCallId 且原 5 调用/15 token/顺序全部保留。此项与父 SPEC B041 “重复调用 reuse”措辞需补独评收据后才能改。

known-negative 三例（unknown / empty / http429）原断言实际通过；不据此认定授权、长回合或重复读取全绿。源码和回执 SHA 绑定见 `b029-durable-consumer-source-binding.json`，非官方账户/全功能真机。
