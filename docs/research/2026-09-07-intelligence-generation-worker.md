# T-915：情报生成模型进程迁移

本提交提供 `createIntelligenceGenerationBridge`，主线负责生产工厂及路径接线。两条原 runner 仍领取、完成同一个 `execution_tasks`，只将真实 claim/attempt/fence 传给模型桥；不创建 `ai_task`、新队列或平行任务。

- `topic_preview`：保留分解、选题、纯文稿三阶段，分阶段写原业务 checkpoint；原可复用阶段不伪造模型调用。
- `script_candidate`：保留真实来源、已确认拆写、策略和原 `runScriptNode`，原 checkpoint/candidateText 与完成投影不变。
- 模型输入、Effective Skill 和无密钥模型身份首次冻结于原任务 payload；实际 provider 请求、回执与用量存原 `execution_calls`。未确认调用不会自动重发。
- 恢复用冻结输入重放已确认调用；输入真值或模型身份变化时拒绝重烧。Worker 使用原受控 supervisor；取消查原任务租约，宿主 stop 清理活动子进程。

生产接口：`createIntelligenceGenerationBridge(db,{entryPath,tasks,resolveModelSpec,resolveSkillSnapshot,now})` 返回 `topicPreviewGenerator`、`projectScriptGenerator`、`stop`。构建产物：`ai-worker/dist/intelligence-generation-worker.cjs`。

局部静态构建：esbuild 0.28.1，Node 24/CJS，`--bundle --packages=external`，仅 Worker entry 与 backend bridge 两入口通过。外部依赖没有全量打包验证，未运行测试、类型检查、真实模型、媒体或采集。`git diff --check` 通过。

明确剩余：用户编辑后采纳的相似度模型门发生于原生成任务结束之后，本批没有伪用已结束租约，也没有移除该门。该入口仍留在宿主，需单独设计原任务后续受控阶段。全局 T-915 未完成；不能把局部构建称为业务验证。
