# T-928 截图故障与重构实际状态核对

用户要求先排查选题生成中重复取消按钮、聊天生成失败，更新CodeGraph，并确认是否已移除旧架构。以当前源码、安装包及最新日志为证据；不将已打包等同全量重构验收。先只读定位，存在明确局部缺陷时在既有T-919/T-915契约下修复；改变产品/架构前独立SPEC评审。

不直接读写业务数据库，不批量删除旧路径，不运行用户暂缓的业务测试或全局reconcile，不改参考工程。代码清理需证明没有生产消费者；兼容旧冻结任务的路径单独说明。不因截图有7个按钮就断言存在7个真实任务。

## 2026-09-08 排查结论

CodeGraph 已执行 `codegraph index --force --quiet .`，随后 status 显示 up to date：2,634 文件、32,888 节点、75,057 边。调用图确认 TopicTaskControls 仅由 ItemDetail 渲染一次。

### 截图中的重复取消按钮

`frontend/src/features/intelligence/intelligence-workbench.tsx` 中 TopicTaskControls 与相邻 TopicCandidateEditor 同用 `latestTransform.id` 作为 key。轮询替换详情时，这违反兄弟节点 key 唯一性，存在错误复用风险。本轮改为 `task-controls:<id>` 与 `candidate-editor:<id>`，保留各自随任务重置的行为。同时让原链接保持单行、不被标题挤成竖排。

这是已确认的源码缺陷，尚未真机复现截图，因此不把截图的全部成因判定为已闭环，也不推断实际提交了七个任务。未改任务取消、恢复、幂等和后台执行语义。

### 聊天生成失败：尚未确认根因

当前安装运行日志 sidecar-2026-09-08-3.log.enc 在 10:50:54–10:54:40 UTC 多次记录 `[api/chat] stream failed class=Error reason=unknown`。此日志出自聊天路由准备/提交执行的 catch，不能证明模型已开始运行。相邻启动日志有 CLIENT_CONFIG_ACCESS_CHANGED，但尚无证据证明它导致这些聊天失败。

路由以 omitMessage 隐去异常信息，界面通用失败分支还会覆盖 publicMessage，因此目前无法从截图定位具体原因。不能通过放开原始日志泄露密钥或对话内容来补诊断。

公开 CLI 的版本和 help 正常，但 status/access status 均返回 CONNECTION_NOT_FOUND；未继续调用业务接口，未读取业务数据库。下一步需要在应用设置开启本次启动 CLI 完整访问，再通过公开任务状态区分提交失败与 Worker 执行失败，必要时加阶段与安全错误码。没有擅自重提生成任务。

### 安装版本与源码不同步风险

当前安装应用 sidecar SHA256 为 5940a17f74cc978bed17b6db05ceb7f1800d3e3ae341bc32644d63fb1a4fab4d；T926 打包产物内 sidecar 为 5a5691ae863c4c378031d5fb40aa18c2d6174ecfba06dae55044e65d8bcb9fb1。只能确认二进制不一致，不能据此反推代码差异。此次源码修复尚未重新打包、安装。

## 重构退役盘点

| 路径 | 当前消费者与结论 |
|---|---|
| chat-turn-submission.service → chat-worker-run → chat-pi-loop | 新聊天冻结 executionEngine=pi；Pi 主执行路径已接入 |
| chat-worker-run → chat-model-stream | 无新版引擎字段的旧冻结任务仍走兼容路径；未确认旧任务清空，暂不可删 |
| chat-pi-loop 的 streamText、structured-node、durable-generation-model | 仍是正常生产使用的单次模型适配、结构化节点、调用账本；AI SDK 尚未完全下线，但不能等同旧 Agent Loop |
| execution/agentic/deterministic-engine.ts；createAgenticExecutor | 静态图中只发现导出/测试，可作为清理候选；agentic-executor.ts 的 DEFAULT_AGENTIC_SYSTEM_PROMPT 仍被 persistence-client 消费，不能整文件删除 |
| runExecutionTask / executor-registry | 仍服务 echo.manifest 和 video.render，不是无效代码 |
| frontend/src/server/persistence-client.ts | 仍约 11,157 行，组装层拆分未完成；不能宣称全项目高内聚迁移已结束 |
| 老默认 48 次/10 分钟、8 次/20k | 有旧冻结/缺少冻结预算时的兼容消费者；新任务 continuous 预算不能用这些默认值推断已失效 |

## 交付证据与保留项

本轮仅局部 UI 源码修复、静态消费者盘点与 CodeGraph 更新。按用户指示未运行业务测试、真机生成或全局 reconcile；不记录为 PASS。T-928 保持进行中，聊天故障根因、安装验证与实际旧任务存量待核查。T-915/T-919 不能据此标记全量完成。

独立源码复核（2026-09-08，continuous_budget）：局部 diff 无阻断问题；角色前缀 key 保留按任务重建行为，链接样式与可收缩标题兼容。仅代码复核，未运行测试。源码修改后再次增量更新 CodeGraph，命令退出 0。`git diff --check` 通过。
