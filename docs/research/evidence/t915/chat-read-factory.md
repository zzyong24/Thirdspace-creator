# T-915：只读工具动态工厂与真实 Worker 串接

createChatReadTaskToolHost 把已有租约上下文 resolver 与只读工具 host 接成 dispatcher 的动态工厂。原型只保留参数与版本，授权和执行仍读取该任务真实上下文；只提供已审计的短读取部分，未装配的其它工具仍会被 dispatcher 完整清单验证拒绝，不把缩减工具集冒充完整聊天。

```mermaid
flowchart LR
 A[真实任务提交与原 Skill 快照] --> B[动态工厂]
 B --> C[正式 Worker 请求工具]
 C --> D[真实账号业务服务]
 D --> E[下一轮模型请求包含项目事实]
 E --> F[调用账本与回复落库]
```

前置红测：工厂不存在，1 fail / 1 skipped。实现后集成文件两项通过：既有宿主读取/回放/503，以及新增双账号并发正式 Worker 用例。使用真实 createChatTurnSubmissionService、getChatRuntime 的 Skill/project 服务、宿主 reader/resolver、工具账本和动态 dispatcher；Worker 是当场构建的正式二进制。模型请求不是手工补写的回执，本机 HTTP fixture 实际收到首轮请求并要求 context.projects，下一轮请求包含对应账号的真实项目标题、不含另一账号标题。共四次模型请求、两次领域读取、两次工厂解析；每任务三条 settled 调用和一条 assistant 回复。

测试模型响应和提示词均为受控 fixture，仅验证真实执行路径与数据传递，不证明商业模型语义质量、生产聊天提示词准备或公共 route 迁移。数据库为隔离内存库，没有访问用户数据或商业供应商；开发密钥降级提示不是桌面密钥测试证据。

前后端类型检查通过。独立只读复核无本批具体阻断，评审者未重跑测试。正式组合根目前仍只启动原 model/agentic Worker；新 chat Worker 工厂尚未绑定到正式组合根，因为非短读取工具尚需完整执行适配。剩余入口、模型/浏览器迁移、性能和双平台验收继续保留于 T-915，不以本批子链路完成全部需求。

边界保持既有 5 条，orphan 为 0 errors / 100 warnings，精确写入文件的范围与复杂度检查通过，CodeGraph 已刷新。

pmem sync 完成；本轮全局 reconcile 仍为 211 errors / 1 warning，未通过。保留 T-916 工程债务与完整 T-915 待验范围。
