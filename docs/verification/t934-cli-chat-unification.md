# T-934 公开聊天入口统一

用户确认：通用回复入口应退役。复用 T-930 Pi 单引擎、T-932 方法加载与 T-933 实际验收范围，不新增执行器、数据库或业务采纳权限。

公开发消息和页面均通过同一个 prepareChatReply 装配入口，使用 prepareDurableChatTurn 和 createChatTurnSubmissionService 创建 chat.run。CLI 的会话、项目及附件从当前账号服务读取；附件解析与页面共用。消息与任务同事务保存，成功提交后只唤醒 chatWorker。

```mermaid
flowchart LR
  CLI[CLI 发消息] --> Prepare[共同方法与工具装配]
  UI[页面聊天] --> Prepare
  Prepare --> Save[持久 chat.run 任务]
  Save --> Pi[Pi 工具循环]
```

2026-09-08 独立审查指出 PGlite 单连接事务内调用全局上下文读取会自锁，实施改为事务外准备源消息和冻结装配；事务内锁会话并比较历史摘要，变化则拒绝，消息及任务都不残留。项目归属在装配前检查，事务内不调用全局端口。

直接 ai.tasks.create(copilot.assist) 在已有幂等任务重放检查之后拒绝新建；旧任务和历史仍可读，不删除真实数据。不把 taskType 这个历史业务分类误认为第二执行器。

验证：真实 PGlite 五项测试通过（提交、任务失败回滚、跨账号拒绝、历史竞争拒绝、退役入口拒绝），其中装配主动读取全局 db，证明未在事务内自锁；frontend tsc 通过。尚需当前候选生产装配复核、打包与真机搜索验收，不能据此声明业务效果通过。

独立实现复核确认接线与字段一致，补上事务前 Worker 就绪检查。新路径真实 PGlite 保存点提交及回滚已通过；没有把旧测试改成空断言。
