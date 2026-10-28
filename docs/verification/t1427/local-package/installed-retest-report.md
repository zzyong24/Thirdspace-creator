# T-1427 安装版复验事实

2026-10-25；源码候选 `778ea4559850b0d8dfbf279c312dc4c21d72866e`。本地包已安装并真实启动，保留原数据；不表示总验收或官方 Pi 恢复成功。

- 安装包：`/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`，SHA-256 `47e3473e9560192a4c7aa42894b2499e0a9b2bd1f909f0e2b201d11449533d89`。本地 ad-hoc，未公证。
- `settings.models.test(default)`：按官方文本路由完成真实 128 token 上限的流式连接探测，返回成功。原件见 `official-probe/`。
- 完整官方 Pi 对话：`ai-conv-4be54f78-256` / `ai-task-4be54f78-261` / `execution-task-4be54f78-262`，首轮进入 `waiting_user`，错误码 `CHANNEL_MODEL_PAYMENT_REQUIRED`；没有正常回复，后续记忆和工具轮未提交。原件见 `official-chat-retest/matrix.json` 与同目录 receipts。
- `settings.models.test(copilot.assist)`：外层调用成功但业务 `ok=false`，明确“不支持该能力连接测试”；未调用模型，不计通过。原件见 `official-copilot-probe/`。
- 纯组 `workbench.tasks.inspect`、`workbench.tasks.events` 已在新安装版成功回读原执行任务，诊断入口修复生效。
- 每轮配置变更均比较 revision 并回读；目前文本路由已恢复原 `codex`，revision 62。后续操作必须重新读取，不能沿用此数字覆盖并发修改。
- 原失败任务 `ai-task-5e73167d-401` / `execution-task-5e73167d-402` 仍保留 attempt 2 的旧 402；最后一次恢复未消耗。新诊断对话是独立验收，不作为原任务的替代结果。

连接探测与正式聊天请求不同，不能用前者抵消后者失败。源码显示普通正式聊天上限为 8192，含完整系统上下文和工具；这只是差异事实，尚无权威证据认定 402 的账户/预算原因。当前未推送。
