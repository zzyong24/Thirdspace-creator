# T-915 Copilot 任务状态投影

实际消费者：Copilot 全局任务 feed 的通知区，以及 `ChatDiagnosisCard` 的盲预测锁定链。旧通知丢弃 `executionTaskId/runtimeStatus`；锁定错误再次点击时生成新 attempt。`ExecutionTaskCard` 原本已操作原执行，本次保留；无生产引用的 `AdoptCandidateCard` 未扩写，已删除的旧取消组件未恢复。

通知依据真实执行状态展示 waiting_user、unknown_result、paused、partial；进入面板时显示待处理任务，旧完成通知不重复弹出。继续、重试、取消使用现有 `commandExecutionTasks` 和原 executionTaskId；未知结果没有重试按钮。指令失败保留幂等键并提示未确认。恢复后移除旧等待通知，feed 继续观察原任务；业务 awaiting_confirmation 不被 execution succeeded 覆盖。

盲预测同一次挂载请求保留 taskId、subjectId 和 attemptId；超时/失败后的刷新不创建新 AI 任务。原执行的等待/未知/失败通过同一控制组件处理，候选确认和锁定协议保持原样。页面重新挂载仍沿既有会话生命周期，本次没有新增客户端任务权威或持久化协议。

静态证据：5 个变更 TS/TSX 文件 esbuild 转换通过；状态组件、纯状态投影、通知模块定向 bundle 通过；git diff --check 通过。未执行构建产物，未运行测试、真实模型、数据库或媒体。未修改 intelligence 页面或短 IO 请求。
