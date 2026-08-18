# T-884 / T-885 ASR 转写失败日志只读诊断

## 样本

- 文件：用户提供的 `sidecar-2026-08-18.log.enc`
- 大小：2328 bytes
- 解密：使用仓库正式 `creatoros-logdec` 与本机开发者私钥只读解密，退出码 0，无截断或损坏警告。
- 日志覆盖：`2026-08-18T08:54:29.711Z` 至 `2026-08-18T08:55:44.542Z`，约 75 秒。

## 已证实事实

1. sidecar 正常启动，Next.js 监听 `127.0.0.1:58214`，两次记录 `SIDECAR_STARTUP_VERIFIED`。
2. 设备授权日志为 `licensed=false status=inactive`；启动同步渠道配置时记录
   `CLIENT_CONFIG_LICENSE_UNAVAILABLE`，状态为 `blocked`。
3. 随后应用收到壳侧停机哨兵，数据库安全落盘，sidecar 以 code 0 正常退出。
4. 整份日志不存在 `intelligence-transcript`、`transcribe-runner`、任务入队/领取、
   `resolve-source`、`extract-audio`、`resolve-model`、`asr`、ffmpeg、MiMo、云端 provider 或
   `whisper-local` 记录，也没有 ASR task ID、item ID、HTTP 状态或模型错误。

## 结论

这不是一次包含 ASR 执行失败的日志。当前只能确定：在该 75 秒会话中转写 runner 没有被调用。
因此不能把根因归到 API Key、模型名、上游 HTTP、媒体格式、ffmpeg、MiMo 或本地 Whisper。

授权失效会阻断渠道受管配置同步，是值得核对的前置线索；但当前 `resolveTranscribeSpec` 对在线/渠道
配置解析失败会回退本地 Whisper，故 `CLIENT_CONFIG_LICENSE_UNAVAILABLE` 本身不足以证明转写失败。
如果用户确实在同一会话点击转写并看到失败，则故障点更可能位于任务创建/派发之前；若失败发生在
其他时间，则本次提供的是错误的轮转文件或错误时间窗。

## 最小补充证据

请用户在应用内复现一次，看到失败后不要立即关闭应用，并立即发送日志目录中修改时间最新的
`sidecar-YYYY-MM-DD[-N].log.enc`；同时提供失败发生时间和页面可见的任务参考编号/错误文案。
不需要提供 API Key。拿到包含 `intelligence-transcript` 或 `transcribe-runner` 的同一次日志后，才能
可靠定位是入队、取流、抽音、模型解析、在线 ASR 还是本地回退阶段。

---

## T-885 补充轮转日志复核

### 样本与时间线

- `sidecar-2026-08-18.log(1).enc`：2328 bytes，覆盖
  `2026-08-18T08:54:29.711Z` 至 `08:55:44.542Z`。内容与 T-884 的短启动会话一致，仍不含
  ASR 执行。
- `sidecar-2026-08-18-1.log.enc`：48974 bytes，覆盖
  `2026-08-18T08:55:45.212Z` 至 `11:26:22.766Z`。运行目录为 Windows
  `runtime-images/1.1.0-fc59d1f8f73e`，包含真实转写失败链。
- 两份日志均由正式 `creatoros-logdec` 与本机开发者私钥只读解密；未把明文日志写入仓库，未重跑
  任务、未修改配置或用户数据。

### 已证实的失败边界

| 环节 | 结果 | 证据 |
| --- | --- | --- |
| 抖音视频解析 | 成功回退 | 匿名 `iesdouyin` 解析失败后进入登录态 detail 路径，后续仍完成取流 |
| 音频抽取 | 成功 | 4 个内容雷达样本分别得到 2,897,195、2,921,963、3,623,531、2,861,483 bytes |
| 模型选择 | 成功 | 全部解析为 `whisper-local`，不是 MiMo、Qwen 或其他云端 ASR |
| 本地 ASR | 稳定失败 | 4 个不同 item 在 140、140、167、144 ms 内失败；同一 item 重试仍在 149 ms 失败 |
| 批任务汇总 | 部分成功语义 | `ai-task-9219c5b5-845` 最终记为 `succeeded`，但至少 3 个 aweme 明确逐条失败；该状态不代表全量转写成功 |

抽样 item：`intelligence-item-9219c5b5-1015`、`-1019`、`-1023`、`-1027`。批任务中明确失败的
aweme：`7658330268477951286`、`7673818573218925860`、`7668326270039543091`。

### 公共根因

本轮已经排除“视频本身不可用、没有抽出音频、云端接口超时、API Key 错误或某一条作品异常”。
公共失败点是 **Windows 分层安装包里的本地 Whisper worker 无法消费 `local-ai` 层的模块解析契约**：

1. 正式 Windows 少文件 runtime 把 `@xenova/transformers`、ONNX 与 sharp 移到
   `layers/local-ai/vendor`，依靠 `frontend/creatoros-module-resolver.cjs` 才能解析。
2. 主 server 的生成入口会加载该 resolver；但
   `ai-worker/src/runtime/multimodal-whisper-local.ts` 创建的 `worker_threads` eval worker 只执行
   `createRequire(workerData.requireBase)`，没有在 worker 内加载 resolver，也没有收到
   `CREATOROS_RUNTIME_ROOT`/resolver 路径。
3. Node worker 有独立模块加载上下文，主线程注册的模块 hook 不能作为 worker 的生产契约。于是
   worker 从 `frontend/package.json` 原生向上查找 `@xenova/transformers`，而分层 runtime 已没有传统
   `frontend/node_modules` 锚，模型加载立即失败。
4. 当前 Windows closure smoke 只在仓库进程直接 `import("@xenova/transformers")`，没有用随包
   Node 启动真实 Whisper worker；因此构建可绿，但用户路径仍会失败。这与此前 HyperFrames 子进程
   “RAT 加载了解析器、生产 consumer 没加载”的同类边界一致。

140～167 ms 的稳定短耗时也与“音频已抽取后，worker/模块加载立即失败”一致，不符合首次下载数百 MB
模型或长音频推理的耗时形状。

### 可观测性缺口

`LocalWhisperTranscribeError` 当前故意不保留 `cause`，日志最终只剩
`reason=unknown message="本地转写失败，请重试。"`。这避免了绝对路径或敏感信息外泄，但也把
`MODULE_NOT_FOUND`、缺失包名以及“解码/模型加载/推理”阶段一起抹掉。当前根因由运行态阶段、分层
布局与 worker 消费代码交叉证实；日志本身无法再恢复已经被包装器丢弃的底层原文。

### 修复验收边界

后续代码修复不能只把用户文案换得更详细，也不能只重复现有主线程 import 自检。应同时满足：

1. 分层 runtime 的 Whisper worker 显式加载随包 resolver，并绑定同一受校验的 runtime root；传统
   `node_modules` 开发态保持兼容。
2. 安全记录稳定的 `stage`、`errorCode` 与脱敏后的包名，继续隐藏用户名、绝对路径、token 与原始音频。
3. Windows 安装包使用随包 Node、真实 worker 入口和短音频 fixture 完成一次本地 ASR smoke，拿到非空
   文本；不能以主进程 `import("@xenova/transformers")` 代替。
4. 部分成功批任务在页面/任务卡上展示成功数与失败数，避免顶层 `succeeded` 掩盖逐条失败。
