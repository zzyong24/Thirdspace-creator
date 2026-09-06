# T-915：聊天准备与宿主快照同源

prepareDurableChatTurn 接受服务端已验证的输入和明确 Skill snapshot，在首个异步等待前复制账号、消息、选区、原文与快照。实际上下文、工具和模型消息在该快照作用域内组装；返回独立 hostContext 副本供提交器持久化。主模型凭据不在准备时读取。旧 prepareChatTurn/runChatStream 保持原行为。

```mermaid
flowchart LR
 A[服务端已验证输入与指定 Skill] --> B[同步复制账号与上下文]
 B --> C[在指定快照作用域组装提示词与工具]
 C --> D[准备结果与独立宿主快照副本]
```

真实前置红测：新入口缺失，2 fail / 142 pass。实现并补反例后，聊天 runner 145 项、提交与读取服务 19 项，共 164 项通过。验证修改原消息、来源、Skill、账号，修改返回快照后执行真实工具闭包，两个并发账号，以及外层快照不同或缺失 guide 的情形。前后端类型检查通过。独立设计与代码复核无本批具体阻断，评审者未独立重跑测试。

边界剩余既有 5 条，无新增；orphan 为 0 errors / 100 warnings。CodeGraph 已刷新。误用不存在的 scope-guard.mjs，命令失败，不作为范围门通过证据；保留原日志。随后使用真实 governance-guard.mjs task-preflight 检查本批明确写入文件，通过范围与复杂度门。没有改动任务范围。

本批仅完成准备入口：生产路由尚未调用，工具执行恢复原 Skill 的 resolver 也尚未接通；没有以 schema/复制代替真实附件、选区和实体归属验证，没有商业模型或正式用户数据验证。测试使用隔离 fixtures，不宣称整条迁移完成。

pmem sync 完成；本轮全局 reconcile 仍为 211 errors / 1 warning，未通过。保留 T-916 历史债务，本批不完成 T-915。
