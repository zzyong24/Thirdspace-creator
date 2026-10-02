# T1046 真实转写失败诊断（2026-10-03）

## 已验证
- 原公共 get 的 executionTaskId null 来自仅成功 aggregate 的字段，无法判断 worker 是否绑定；已补为 readAiTaskState 的真实绑定，并对成功 aggregate 核对绑定一致。
- execution worker 在 Web 已装配资产 ASR owner，默认 Whisper registry 真实执行。
- 同一 /tmp/t1046-live/media/rough-original-pcm.mov 通过实际 ffmpeg 抽 WAV，无注入 adapter、无新 AI task，CJS 打包与正式 worker 相同。
- frontend cwd：143 ms 失败 LOCAL_WHISPER_MODEL_LOAD；createRequire(frontend/package.json) 解析 @xenova/transformers 真实 MODULE_NOT_FOUND。
- ai-worker cwd：14.133 秒真实 Whisper-small 推理成功，全文：今天介绍一个做内容的方法,先把内容讲清楚。恩,这一句我重新说,先把内容讲清楚,再把它做成一组图片,最后检查每一张图是否连管。
- 本次未传有效 mapping timingAudio，timing:null 不能视为模型无时码。

## 根因与最小修复建议
Whisper eval worker 使用 process.cwd()/package.json 解析 transformers，而 Next 在 frontend cwd fork execution-worker；真实依赖在 ai-worker。修复建议优先以所在包或 worker 构建入口解析依赖，保留已有桌面 module resolver。所需范围 ai-worker/src/runtime/multimodal-whisper-local.ts 及对应 tests；未授权前不改。
worker-runtime 对非 GenerationFailure 的 ASR 错误统一写 WORKER_EXECUTION_INTERRUPTED，丢弃已有安全 LOCAL_WHISPER_* reference；supervisor 丢弃 child stderr。建议只映射固定安全内部码，不输出原始 provider 异常或凭据。

## 原请求恢复资格
failed 需要 execution.tasks.command 的 retry，resume 仅限 paused/waiting_user。当前通用 retry 不刷新 deadlineAt。资产ASR reserve 不传 task.retryOfCallId，原 rejected local call 会直接重放失败；恢复前须读原调用账本，严格延续原冻结输入与明确拒绝来源，不重发未知调用。

## 查询修正验证
- transcript-execution-id-red.log：真实公共 V2/native 2 FAIL，预期真实 executionTaskId、实际 null。
- transcript-execution-id-green.log：2 PASS，含 queued/running/waiting_user/failed，读取暂时失败与 OwnershipError 不吞。
- transcript-execution-id-types.log：既有全局类型错误仍存在，改动 2 文件无类型错误。
- delta: /tmp/t1046-backend-work/t1046-transcript-execution-id.delta.patch；父线程已应用，hash一致。

底层 ASR 成功不能替代公共生产链验收；尚需在修复后的原任务通过公开恢复、真实词句回执及用户采纳验证。

## 独立评审后的装配修正
round 3 PASS REV:bebbd1fff573 后，在隔离目录仅改 Whisper runtime 与原测试：桌面分层 resolver 优先；无 resolver 时以当前模块实际解析依赖入口作为 requireBase；无法解析时保留传统 cwd fallback。未改变模型输入、配置或预算。
- whisper-cwd-red.log：1 FAIL/20 PASS，真实旧行为未使用 Worker 依赖。
- whisper-cwd-green.log：2 文件39 PASS，覆盖 resolver/fallback 与已有取消/退出行为。
- whisper-cwd-types.log：0行，ai-worker TypeScript PASS。
- whisper-cwd-real-green.log：同一真实抽音、CJS 打包、frontend cwd，本地推理14.857秒成功；未注入 provider、未新建AI任务。
- 正式 ai-worker build 日志：whisper-formal-build.log。
- delta：/tmp/t1046-backend-work/t1046-whisper-cwd.delta.patch；hashes：whisper-cwd.delta.hashes.json。
公开流程由主线程在重建后的正式 Worker 上验收，保留原失败任务和截止时间。

## 真实词级转写降级诊断与 detached 修复
使用公开 nativeSources 的 exact 来源证明读取同 bytes，实际调用 extractProductionAsrAudio：mappingStatus=verified、verifyPcmMapping=true、输出/再次解码样本均228939，audioDigest=d1bef350b9ec1ff9da234e61269e440574397a9da2ed9120e617eefde2753446，与公共聚合完全相同（actual-extraction-timing.log/evidence.json）。抽音链无降级。
真实 Whisper word chunks 最后单位“管。”返回[13.96,17.14]，超过有效音频14.3086875秒，完整 strict provider timing 校验为null。没有裁切/猜边界，仍保留全文安全路径。
另确定性错误：Worker postMessage transfer 音频buffer后原pcm.length为0，adapter推理后比长度导致任何合法非空时码都消失。经授权仅冻结推理前 decodedSampleCount 后比较，时码合同/范围规则不变。
- whisper-detached-red.log：真实ArrayBuffer structuredClone transfer红测1FAIL/22PASS。
- whisper-detached-green.log：2文件41PASS（原39取消/解析回归+正确/不匹配样本证据）。
- whisper-detached-types.log：0行 TypeScript PASS。
- whisper-detached-build.log：正式构建PASS，保留已有CJS import.meta warning。
- delta: t1046-whisper-detached.delta.patch，hashes: whisper-detached.delta.hashes.json。
追加6秒真实静音的底层实际probe为负：324939样本/20.3086875s，Whisper尾部重复“我看你很想念你”且timing仍null（actual-whisper-padded-timing.log）。未导入公共工程、未覆盖原source proof、未造时间码，也不称词级验收成功。
