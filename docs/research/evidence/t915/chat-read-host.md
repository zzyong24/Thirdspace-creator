# T-915：真实领域只读工具接入宿主回执与账本

createChatReadToolHost 将已审计的 19 个领域只读工具适配为 ChatBackendTool。原型只提供真实参数和定义版本；授权与执行每次按宿主 RequestContext、ExecutionRef 调用 resolver 重新装配。缺账号、工具已不在范围、定义版本变化均不执行原型闭包。resolve 必须由正式组合根依据任务冻结上下文实现；本批尚未提供该正式持久 resolver。

```mermaid
flowchart LR
 A[租约恢复真实账号] --> B[按任务重新解析工具]
 B --> C[核对白名单、版本、参数、授权]
 C --> D[执行真实只读服务]
 D --> E[真实卡片数据或明确无副作用错误]
 E --> F[统一账本结算与回放]
```

none 不能推出可在宿主执行：material.gather 虽是 none 仍含网络搜索，明确拒绝此适配器装配；local.tools/workspace 和所有写入/候选工具也不在本适配器范围。19 个读取的范围不替代完整 T-915 工具迁移范围。

执行使用原始异常入口与标准 abortSignal，不重复包装成成功空数据。成功内容保留原卡片 data，供现有 Worker 的 output.data 路径传给模型；结果 kind 必须与登记名一致。显式业务 error 不记成功。瞬态只读失败返回 sideEffect:none + transient，而非抛入宿主通用 unknown 兜底。401/403 返回权限阻断，取消不启动读取。适配器不自行重试，恢复仍由统一账本与运行时负责。

异常也使用已有 CHAT_TOOL_ERROR_ENVELOPES 生成 data.kind、结构占位与人话 error，保持卡片兼容，不把可能敏感的原始异常正文返回模型。成功结果继续使用原 native 工具的预算。

真实 runtime 集成在隔离 PGlite 中调用当前 context.projects 服务，并经 createExecutionChatToolPorts 的真实租约、授权、执行、结算及投影路径：同一 user 两个 account 各自读取，原型账号不泄入执行；同一 callId 回放不重新查询；注入 503 只读故障后调用结算 settled，结果为明确错误而非 unknown。此处模型调用回执是 fixture 写入账本，不是商业模型、真实 Worker 进程或公开聊天提交验收。任务和域数据只在测试库，不触碰用户数据。

测试证据：首次 5 项中 1 项失败，原因是 unavailable 回执多带 reason，不符严格协议；修复后通过。后续错误卡片新增断言当场 1 项失败，补原卡片信封后通过。最终 backend 4 文件 20 项、frontend 实际 runtime/账本 1 项通过。前后端各遇到测试类型声明问题，修正后最终类型检查通过。独立只读复核已覆盖上下文绑定、权限格式、信号、结果分类与集成范围，评审者未独立运行测试。

前置 TDD 证据缺失：本批初版适配器先写实现、后写测试；首次严格协议红测发生于初版实现之后，不伪报为实现前红测。后续卡片修复有当场前置红测。本批不能据此声称完整 TDD Gate PASS；完整任务验收时该缺口仍须明确处理，未登记 accepted-risk。

范围门首次因说明注释中的 IPC 术语触发新增复杂度提示；本适配器没有增加进程通信协议，已改为准确描述其 JSON 序列化行为，复跑通过。边界仍为原有 5 条无新增，orphan 0 errors / 100 warnings。

未完成项：正式可信上下文/Skill resolver、动态任务工具装配、公开聊天入口、真实 provider/Worker 和全部跨平台验收继续属于 T-915。没有推送、安装、部署，未调用 taskctl complete。

最终全局 reconcile 为 211 errors / 1 warning，与上一批一致，T-916 既有欠债保留。T-915 继续进行。
