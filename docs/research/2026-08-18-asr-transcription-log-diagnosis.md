# T-884 ASR 转写失败日志只读诊断

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
