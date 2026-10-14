# T1284 原 V1 字幕作品公共复验

**PASS：同一旧字幕作品恢复原声音轨，画面与正式方案保持不变。** 原 T1281 无声音轨失败继续保留，没有覆盖、修改或重发旧任务。

| 核验项 | 当场结果 |
|---|---|
| 原作品与正式方案 | output-65bafd60-322，revision=1；完整 DTO 在预览、提交、确认下载后均与原失败前相同 |
| 新明确业务请求 | 989f36fc-091b-4cf5-b3cd-6a860ed5a2b3 |
| 新渲染任务 / 确认素材 | ai-task-8dc55592-14 / asset-8dc55592-81 |
| 原任务 | ai-task-65bafd60-363 保持 succeeded，完整 execution DTO 前后相同；原无声 MP4 不变 |
| 预览与执行输入 | 公共 preview HTML 只存在 exp/token 签名值差异；真实 Chrome 视频加载播放，geometry 与原相同；新旧冻结 props 完全相同，仍无 clips |
| 新业务幂等 | 同 requestId 再次公共调用返回相同 taskId、attemptId |
| 成片 | H.264 360×640，24fps，48 帧，2 秒；新增 AAC 2 秒；FFmpeg 完整音视频解码通过 |
| 原音轨区间 | 源 0..2 秒与成片比较 32,000 个 16kHz 单声道 PCM 样本，相关度 0.999997876451436；RMS 0.088183 对 0.088100，真实非静音 |
| 原画面保持 | 新旧全部 48 帧解码 RGB 逐字节相同，MAE=0，SHA256 均为 dac23d164500389eaff4783f2bc481f350bfdd4b5222fcd1201263bdae5990a2 |

新 MP4 SHA256 为 `04afaa9b6db1a8a2416834f8d7f5d283ad5d0fec3bbfdba81e66bbf9aa916b9e`，590,755 bytes。证据为 `result.json`、`media-content-proof.json`、`decoded.json`、各公共原请求/响应及 `render.mp4`。声音结论来自信号核验，未声称人工听感验收。源仍为此前真实 probe 的动态测试媒体，不是 ASR 或口播。

![与原失败成片逐帧相同的字幕画面](/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1284/public-legacy-caption/render-frame.png)

原失败目录全部 69 个文件先复制到 `original-failure/`，哈希记录在 `original-failure-archive.json`；结束后再核对原目录和归档全部相同，见 `archive-integrity.json`。原缺 caption.id 的 409 也仍在归档中。新测试首轮在提交渲染前因相对 URL 的签名归一化遗漏而 FAIL，保留于 `attempt-1-signature-normalizer/`；修正为只去除 exp/token 动态值，媒体路径、scope、script URL 和全部 HTML/CSS/JS 均不删除后通过。这个测试错误没有产生额外渲染任务。

没有主动模型、ASR、粗剪请求。render 原有可选视觉审核实际返回 reviewed/warn（static_editing，字幕卡布局静态），deliveryQuality=pass；保留警告，未称视觉模型审核 PASS。未改生产代码、正式输入、源媒体或旧任务。

所有公共请求已完成，state.pending=null，浏览器已关闭，可停止验收服务进行构建。脚本 `run.mjs` 保存原业务请求/待定状态，未知结果不自动重发；当前已确认完成，勿盲目重跑。`check-media.py` 仅对现存本地媒体做 PCM 与逐帧比较，不访问服务。
