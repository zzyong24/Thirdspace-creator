# T-1046 同一 OpenCut 工程的 AI 粗剪真实验收

2026-10-03。沿用用户客户端当前 MiniMax-M3 配置，在隔离项目通过 CreatorOS 正式上传、原片登记、转写、Skill 候选、采用与成片服务验收。本文只记录实际发生的结果；不代表已安装客户端或正式包通过。

大白话：用户在完整 OpenCut 工作台导入原片，手工分割、选择片段，让 AI 提建议；勾选并确认影响后，结果回到同一时间轴，还能撤销、保存和导出。没有真实词句时间码时，仍能整段粗剪，不能根据文字猜切点。

```mermaid
flowchart LR
 A[导入真实原片] --> B[转写和选择片段]
 B --> C[AI 提候选]
 C --> D[勾选并核对剪辑影响]
 D --> E[同一时间轴与原生撤销重做]
 E --> F[保存、刷新、导出 MP4]
```

## 实际通过

- 完整 OpenCut 的素材、预览、属性、时间轴真实运行。手工按 S 分割，Shift 多选；900×600 与 1440 尺寸检查保留主要编辑区，见 ui/native-900-toolbar-fixed.png、ui/native-1440.png。
- 原片经公开服务建立 exact 文件和探针证明。真实本地 Whisper 转写成功，任务 ai-task-186c9f73-142，执行 exec_1da83cb0-475b-41eb-8cbd-18fd60d7790b，回执 ui/real-asr-result.json。
- 识别返回尾部时间码越过实际音频 14.3086875 秒，故诚实降级全文。没有伪造逐字时间码，也未把词句级真实验收记 PASS。旧失败回执保留，超过截止时间未伪装重试。
- 首次真实 MiniMax 整段候选采用：14.68→10.68 秒、两主轨片段→一段，独立文字 0–2 秒保留；原生 Ctrl+Z 撤销恢复两段，Ctrl+Shift+Z 重做恢复一段，见 ui/native-ai-undo.png。
- 两条真实建议一次采用：候选 ai-task-d49583b2-190 / exec_93b4b7f2-5771-4baa-983b-ed32a86fd5b0；确认合并删除 0–4 秒，第三段前移；29→30 版本，10.68→6.68 秒。见 ui/multi-candidate-result.json、ui/multi-adopt-result.json。此轮发现工程 duration 派生值未同步，原回执保持不可变；保存到31后刷新读回6.68秒。
- 修复后用新真实候选再次验收：ai-task-0a6f1785-109 / exec_2cecd347-3d5c-4c11-9b94-f2bb95ab805e；32→33，6.68→4.68秒，metadata.duration=561600，剩余真实片段 trimStart=1200000。页面显示“已采用到当前时间轴，可继续编辑或撤销”，未误报修改。见 ui/final-clean-adopt-public.json、ui/final-clean-adopt.png。
- 10.68 秒工程实际导出并登记为作品成片；从正式成片预览下载文件并 ffprobe 核对 H.264 640×360 视频轨10.680000秒与AAC音轨10.750839秒（编码尾部）。实际文字帧保留，见 ui/actual-export-probe.json、ui/export-frame-1.png、ui/export-frame-5.png；工程27正式读回见ui/export-saved-plan.json。
- 最后4.68秒版本的再次导出在会话中断时仍处理中，未记录完成。恢复错误页被浏览器安全策略阻止，不把这一轮补写成成功。上一轮真实导出与交付证据有效。

## 修复及回归

1. 本地 Whisper 优先桌面 resolver，无 resolver 时按实际 Worker 模块解析依赖；转移 PCM buffer 前冻结 sample count，保持严格时间码范围验证。
2. prepareDocument 比较完整保存内容，只忽略原生自动更新时间；同一未确认保存重放原请求。采纳后复用同一完整比较，真实 Undo、媒体及后续编辑继续保留。
3. 后端新采纳同步 OpenCut 的主场景 duration：truthy isMain，否则首场景，取所有轨道最大结束tick。旧回执不回写。
4. 原生 apply-tracks 是单次Command，核对完整前轨与归属；未知ACK重放原回执，CAS冲突保留草稿。原可选素材失效只降级对应素材。
5. 粗剪提示词v2让summary/reason/uncertainty说大白话，ID保留在结构化目标。新的真实候选已不在理由里堆内部ID。

当场红绿证据：frontend-deltas/delivery-adopt-dirty、asr-diagnosis/native-duration-*、asr-diagnosis/whisper-*。契约及backend/frontend的协议测试属于测试夹具，不能冒充真实模型。

根工作树复验日志：frontend-final-regression.log、frontend-adopt-final.log、frontend-final-tsc.log、native-duration-final.log、worker-final-regression.log（Whisper及模板59项）、LED047 led047.log、独立复核 independent/、OpenCut bundle-final-verify.log。冻结源码由Bun重新构建，8项静态hash一致；构建差异说明见build-runtime-difference.md。

## 剩余与诚实边界

- 全仓 reconcile 既有35 errors/1 warning归T-916；SDK物理边界归T-1026，material.match语义边界归T-1027，未提高基线或删门卫。全仓类型、契约历史测试失败继续保留，不写全绿。
- 根工作树仍有其它任务的大量未提交变更。T-1046 的实现与证据冻结不等于干净检出或安装包验收；前端正式代码绑定receipt及依赖基线收敛仍待完成，任务不置完成。
- 真实词句级供应商时间码、正式Mac/Windows包及父任务T-850所有字幕关联能力未在本轮全部验证。
- T-1047已完成研究；组图的新主流程未实现。继续以“内容→逐页规划→统一风格与参考图→逐页出图/重做→整组核对→封面、简介、标签、审核”衔接现有画布，快图用于单页细调。
- 用户密钥仅在临时600权限文件与验收进程使用，未入仓库；临时文件已删，重启的本地服务不再带该密钥。
