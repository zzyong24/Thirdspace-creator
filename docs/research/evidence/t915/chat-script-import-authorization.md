# T-915：逐字导入授权节点提取

本批把原聊天执行器里的逐字导入提示词准备与 JSON 决策解析移入 `chat-script-import-authorization.ts`，由原消费者直接调用。完整最新指令、来源、逐字锚点、原主模型和单次调用保持原行为。这是独立 Worker 接线的准备，不代表 `script.draft` 已接入持久恢复；正式 `/api/chat` 仍未切换。

## 实测证据

- 首次测试因新增模块尚不存在而加载失败，见 `chat-script-import-red.log`。这不是断言级 TDD 红测。
- 提取后发现 `wrapUserData` 导入路径错误，已改为原实现所在的 `chat-context`，没有复制实现。
- `chat-script-import-green.log`：2 个文件、154 个测试通过，包含原聊天执行器回归和授权节点测试。
- `chat-script-import-types.log`：backend TypeScript 检查退出码 0。
- 独立只读审查：未发现提示词、解析、调用行为变化或新增循环依赖；审查者未运行测试。
- 全局对账退出码 1，仍为 211 errors / 1 warning，与上批一致；见 `chat-script-import-reconcile.log`。不宣称工程全绿，也不据此宣布 T-915 完成。

## 下一项实际接线

Worker 执行授权模型，Host 从已结算模型回执解析授权与精确来源，再通过现有整稿原子提交服务创建子任务。必须同时覆盖取消、未知调用不重发、提交回执丢失重放，以及同回合多工具恢复。生成模式无需增加授权模型调用。
