# T-915 情报逐字稿 ASR 迁移：局部证据

原入口：`runIntelligenceTranscriptTask` 领取原 `kind=transcribe / ownerType=item` 任务，宿主 `transcript.transcribe` 内直接执行 ASR。新工厂 `createIntelligenceTranscriptBridge` 沿该 claim 监督独立 `intelligence-transcript-worker.cjs`，复用原音频存储、模型选择、分片请求账本、云端拒绝后本地回退叶子。没有建立 ai_task 或第二任务；`transcribe.douyin` 只作现有 IPC 输入协议，后端实际权限绑定原逐字稿行、账号、作品与来源。

`transcript-runner` 传入实际 claim。成功内容仅从已结算 ASR 分片重建，仍交原 `finishTranscript` 投影；完整非空结果可回放，不因进程回执丢失重新付费。云端空正文不能提前完成，仍进入原本地回退。未知、拒绝、取消和等待状态交还原任务恢复，runner 不覆盖其终态。

公共监督由 `claimed-worker-supervision` 复用，领域绑定没有放入任意 prompt 端口。原 `bindTranscribeExecution` 继续限定 ai_task 工件/终态，新增共享音频绑定只扩展音频与 ASR 叶子。既有 `transcribe.douyin` Worker 改为复用同一 ASR registry 工厂，适配器集合未删减。

局部静态证据（2026-09-07）：变更 TypeScript 文件 esbuild 转换通过；新增 Worker 与 backend 工厂分别局部 bundle 通过（外部依赖保留、未执行产物）；`git diff --check` 通过。以上不是类型检查、业务验证或真实 ASR 成功证据。遵用户指示未跑测试、全量构建、reconcile，未访问 DB、媒体或真实模型。

主线仍须替换 persistence 工厂、装配 entryPath/停止/sidecar 复制。source 的网页取流与抽音仍由业务服务 ports 提供；不是浏览器物理迁移完成。当前这条旧情报链没有文本整理模型调用，未隐含添加该能力。收藏/对标 `transcribeOneAweme` 独立旧入口、编辑稿采纳相似度模型门另行收口。明确 failed/waiting_user 经同 fence 锁内投影失败/blocked（保留旧正文）；retry/unknown/control 保留原恢复状态。未验证模型配置/凭据异常、真实本地 Whisper、跨进程取消与恢复。

## 收藏与单条对标追加

新增 `claimed-asr-stage.service`，通过锁内 `bindResource` 复用已有音频、凭据准备和 ASR 账本，不建立通用任意资源 API。收藏工厂仅接受原 `scheduled.favorites` claim、真实 item/aweme 及当前登记启用的 folder；每作品输入冻在原任务 `favoritesAsrResources`，继续原收藏逐字稿落点。其监督来自 scheduled generation 工厂同一个 `runWorker`；没有另一个 Supervisor。Worker 只复用 `runBoundAsrStageInWorker`。

原 `benchmark.works.transcribe` 是用户单条请求，没有 scheduled claim。新 `createBenchmarkTranscriptionService` 用真实 `benchmark.transcribe` aiTask，经原 authority 映射一次 execution task；work/aweme/source/configuration 参与提交幂等键。专属 marker 不进入 `transcribe.douyin` 业务消费者，只复用 ASR IPC 叶子。成功仅将真实回执写回 `benchmark_works`，不创建项目、artifact 或自动 reconstruct。超时通过 `BenchmarkTranscriptionPending` 返回可恢复的原 task IDs，后台原任务继续；生产须注册其 recoverQueued/drain/stop。

以上新增工厂、共用 Worker core、contract 均只做局部 esbuild bundle 与 diff 静态检查；未执行产物或真实业务。生产装配由主线完成。主线已报告编辑稿采纳相似度门另行接通，本追加不再把它列为当前遗留。仍待用户实测：ASR 云/本地、跨重启恢复、配置异常与单条 endpoint 等待/超时行为。
