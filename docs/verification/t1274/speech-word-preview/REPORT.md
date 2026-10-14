# T1274 真实词删除候选预览补验

2026-10-14，在私有 3919 服务真实 UI 完成；共享工作区包含播放器修复 912c93166。此处只补原 `SPEECH_READONLY_RESULT.json` 中 real-word-delete 的预览/媒体路径，不重复 ASR 或模型调用，不重发原 rough unknown，不采纳候选。

原身份：grp-94c2affe-708 / project-94c2affe-710 / output-94c2affe-721，revision 3。复用 precise 的真实系统合成语音 ASR 23 词及原 provider receipt，不伪造 nativeSources/transcript，也不将系统语音当真人识别质量证据。

实际路径：新 Chrome 浏览器1366×900→素材/转录→转录→高级文字→读取当前时间轴→把 `[s1] 今天` 改成 `~~[s1] 今天~~`→生成剪辑候选→预览这次修改→点击原生视频播放钮→返回当前画面→丢弃候选。`ui-candidate.json` 完整 scene 与原 `speech-readonly-2026-10-14T07-15-53-914Z/real-word-delete-response.json` 一致。播放时 currentTime=0.458196、paused=false，截图 `playing.png` 已实际查看；原素材画面为纯色，不把它描述为人物内容。实际 blob 下载为 `candidate.mp4`，144356 bytes。

为遵守不得额外保存的授权边界，本浏览器有只阻断 save/apply/restore/render/source prepare-adopt/transcript create-adopt/rough 的请求保险；没有返回伪成功或替代应用响应。实际 blockedWrites=0，prepareTarget 读取没有触发 save。前后 `before.json` / `after.json` 完整 DTO 相同，revision 始终3；dispatch没有正式写、ASR、模型或 rough 操作。浏览器与trace正常关闭。

时间范围：真实ASR首词源区间0..5760 ticks，源时基1/16000秒，因此删除0.36秒。实际UI候选 trimStart=43200/120000=0.36，duration=940800/120000=7.84，trimEnd=0，sourceDuration=984000/120000=8.2，余下源区间[0.36,8.2]，rate保持1。overlay/audio完整保持，词间151200ticks及末尾19200ticks未转录区间没有缩短。ffprobe视频640×360、25fps、196帧、7.840000秒，完整ffmpeg解码exit0，符合帧级时长预期。

音频实际存在：AAC44.1kHz双声道、7.918005秒。使用原fixture真实SHA核对后将源与候选都解码成16kHz单声道PCM；候选0.2..2.2秒窗口与原源的归一化互相关峰0.995859，匹配source-output偏移0.312125秒。相对逻辑剪点0.36秒，观察到47.875ms前导延迟。此为编码样本对齐限度，不能把容器7.918005秒说成视频时长，也不能将此签作首尾有效样本精确通过；保留给既有T1277核对。本轮没有人工听感审核，也没有以波形相似度替代语义/听审。

结论仅限：原真实词候选已实际进入native预览、可播放、实际MP4完整解码、视频时间范围符合候选且正式对象零写。音频边界精确性保留上述观测，不代签整个T1274或产品PASS。原rough unknown和原失败记录均未修改。
