# T-1073 Worker 分区修复证据

本分区基于 `e56cd2735774762908d59022aad265554849972a`，只落实已审规格 FR-001 / FR-002。大白话：转录自己的线程在任务结束前确认退出；音频回执交给 Worker 后，宿主就释放这份历史副本。

```mermaid
flowchart LR
 A[转录任务创建本次 registry] --> B[本地推理线程]
 B --> C[成功、失败或取消]
 C --> D[finally 等待线程退出]
 E[宿主回复音频] --> F[Worker 接收或撤回等待]
 F --> G[累计水位与已消费区间]
 G --> H[宿主释放回执字节]
```

## 最终行为

Whisper provider 拥有可等待、幂等的 `close`。任务取消、finally 关闭和线程 error 共用终止屏障；`terminate` 失败时仍等实际 `exit`，禁止提前启动替代线程。转录入口 finally 关闭本次 registry，共用同一实例的 provider aliases 只关闭一次。惰性启动、真实调用账本、失败单作品结果、取消后不保存作品均保留。

私有 `consumed-v1` 协议通过 ready / run 双向协商。每次调用有单调 `callSeq`，requestId 确定性绑定 execution / attempt / fence / callSeq，同一旧 ID 不能改序列再次 invoke。在途同请求仍共用一次 invoke。Worker 根据当前 pending 的补集生成累计水位和紧凑区间；宿主合并区间并释放已消费回复，区间关闭空隙后收缩。没有历史 ID tombstone 集合。较早请求挂起不会挡住后面的已消费音频。确认丢失后，后续完整确认及重复回复触发的确认重发可以恢复释放。

陈旧 fence 的调用、确认与回复不能改动当前执行。乱序新序列、冒用 ID、已确认历史重放不会重新 invoke。断连撤回等待；取消与结算沿用原持久 deadline / 归属，没有给 continuous 续期，没有新增音频容量上限或截断。

兼容边界：新宿主遇到未声明协议的旧 Worker，仍保留原 requestId 缓存到 run 结束；新 Worker 遇到未协商协议的旧宿主，继续使用原 UUID 及回复格式。旧协议的历史字节保留没有冒称修复。公共 operations 和持久数据 schema 均未改变。

## 当场 RED 与资源观测

Vitest 原始输出以对应 `.log.gz` 保存，可解压恢复执行时原始字节；`vitest-log-sha256.json` 记录原始字节数和 SHA256。可读 `.log` 仅移除末尾多余空行，执行内容与结果未改。归档解压后的字节数与 SHA256 均已逐份复核。

修改生产源码前运行正确行为测试，原始结果在 `RED-whisper.log`、`RED-ipc.log`。Whisper 实际转录入口的成功、失败、取消均未调用释放归属；三个用例全部 RED。音频测试使用实际 supervisor 和实际 createExecutionWorker，100 份 512 KiB 合成音频，运行中全部 100 个 Buffer 存活，合计 50 MiB；直到任务结束才释放。原始数值在 `RED-ipc-memory-observation.json`。

初版仅有连续水位后，又对较早心跳挂起的并发场景实测 RED，运行中仍保留 100 个 Buffer；记录在 `RED-ipc-parallel.log` 和 `RED-ipc-parallel-memory-observation.json`。这条 RED 发生在加入紧凑确认区间之前，不作为最初生产代码的历史证据。

最终 GREEN 观测：

| 真实消费者 witness | 实测结果 | 原始文件 |
| --- | --- | --- |
| 实际转录入口、实际 ASR 编排、真实 worker_threads 轻量回执，连续成功 3 轮 | 每轮 liveThreads = 0、closeCalls = 1；推理失败及取消也等退出 | `whisper-thread-observation.json`、`GREEN-worker-focused.log` |
| 实际 supervisor + 实际 Worker，串行 100 份音频，同请求在途重投及半数确认丢失 | 25 / 50 / 75 / 100 份后的 liveBuffers 均为 0；external 约 1.85 → 1.88 MiB | `ipc-memory-serial-observation.json` |
| 上下文 seq1 已完成、seq2 心跳挂起、seq3…102 音频并发且逆序完成 | 100 份后 liveBuffers = 0；external 约 1.85 → 1.88 MiB；首末完成索引原样记录 | `ipc-memory-parallel-observation.json` |
| 实际 supervisor，旧协议、在途重投、陈旧 fence / 确认、旧 ID 改序列、乱序和已消费重放 | 新协议 invoke = 3，旧协议 invoke = 1；8 MiB 音频完整传递 | `GREEN-supervisor-regression.log`、`GREEN-ipc.log` |

观测是机制验证，串行窗口约 4 秒、并发窗口约 1 秒；外层测试和进程执行预算均为 120000 ms。没有等待两分钟才取消，也没有使用短执行预算。RSS、真实模型容量、安装版长时间堆快照没有作为本轮验证结论。

## 验证命令与限制

```bash
cd ai-worker
pnpm exec vitest run src/execution/worker-runtime.test.ts src/execution/transcribe-worker-run.test.ts src/execution/transcribe-asr-run.test.ts src/execution/transcribe-postprocess-run.test.ts src/runtime/multimodal-whisper-local.test.ts src/runtime/multimodal-whisper-local.cancel.test.ts --testTimeout 120000 --hookTimeout 120000
pnpm exec tsc --noEmit

cd ../backend
pnpm exec vitest run src/modules/execution/worker-supervisor.memory.test.ts src/modules/execution/worker-supervisor.test.ts --testTimeout 120000 --hookTimeout 120000
pnpm exec tsc --noEmit

cd ../contract
pnpm exec vitest run --config ../docs/verification/t1073/worker/contract-vitest.config.mjs src/internal/execution-worker.test.ts --testTimeout 120000 --hookTimeout 120000
pnpm exec tsc --noEmit
```

Worker 聚焦 83 测通过；supervisor 回归 16 测通过；私有契约 7 测通过。新增 cancel / error 停止屏障与消费确认 / 断连回归均通过。Worker 和 contract 类型检查通过。backend 类型检查有 12 条失败；CompilerHost 将本次改动读取替换为指定基线，并排除新增测试后同样得到 12 条，文件位置、类型错误码逐条一致。保留原始 `typecheck-backend.log` 与 `typecheck-backend-baseline.log`，没有声称后端类型全绿。

基线比较可在仓库根重跑：

```bash
node docs/verification/t1073/worker/backend-baseline-typecheck.cjs "$PWD" e56cd2735774762908d59022aad265554849972a
```

fixture 只使用合成音频、轻量回执线程及临时编译产物；未下载或运行 Whisper 模型，未使用真实账号、数据库、任务或媒体。现有 supervisor 测试会构建本工作树被忽略的 `ai-worker/dist`，该生成目录获主会话许可，未纳入候选提交。完整跨分区 Gate、timeout / boundary / orphan / reconcile 与控制面收尾由主会话整合后执行。本分区没有修改或推进控制面，也不修复原排查列出的渲染后代、PCM 峰值或共享浏览器其他静态风险。
