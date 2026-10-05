# T-1046 OpenCut 同工程 AI 辅助粗剪与基本视频编辑

2026-10-02 用户要求剪辑工作台继续集成，目标为 AI 辅助粗剪及基本视频编辑。承接 T-850 的源文件、真实转写、删留候选与采纳边界，以及 T-1039 的同工程助手；本任务只补已集成 OpenCut 与这些既有能力之间的断线，不新建编辑器、数据库、执行器或模型通道。

用户进入已打开的视频工作台即可使用原生分割、修边、删除、移动、文字与声音编辑；AI 读取真实源媒体和转写提出粗剪删留建议，用户对照后采纳，结果直接呈现在同一 OpenCut 时间轴。手工修改、原片、其他图层和历史保持可读。没有时间码的转写只能建议、不能猜测切点；缺模型/转写失败仍可手工编辑。保存不启动模型或渲染。

```mermaid
flowchart LR
 A[原片进入 OpenCut] --> B[真实转写与当前工程]
 B --> C[现有 Skill 提粗剪候选]
 C --> D[用户对照并采纳]
 D --> E[同一原生时间轴]
 E --> F[手工微调、保存与导出]
```

实现前核对现有粗剪预约、转写及原生文档的物理适配范围，补精确合同并独立评审。必须复用真实 owner/revision/CAS/exact Asset 和既有 AI settlement，不保存一份隐藏的 v2 影子工程。机械映射只处理真实 ID/范围/时间，不理解语义；标注 SEMANTIC_BOUNDARY_ALLOW 并测试。同请求保留冻结输入，重试不重复提交；账号/作品切换、取消和并发不串结果；明确冲突允许恢复。

验收包括原生基础剪辑真实操作、真实可配置模型的粗剪候选、单项及多项采纳后原生时间轴/音画读回、刷新保存及导出；契约/后端/前端回归和 LED-047。夹具仅验证协议，不能写成真实模型通过；全仓遗留 Gate 继续独立登记。本任务实施合同尚待独立复核。

## 原生同工程接入合同（2026-10-02）

当前唯一编辑真相是 editorVersion:3/referenceEditor.nativeDocument（OpenCut31）。原生 timeline 时间单位为每秒120000tick（上游 Rust media_time.rs 常量），不是纳秒或毫秒。媒体池 duration 只是显示元数据，不能替代后端真实探针授权范围。以下机械适配不决定语义删留。

1. productionReferencePlan 增可选 nativeSources:[{mediaId,source:productionSourceMedia}] 与 sourceTranscripts，缺省读取为空。它们只是已验证 exact文件/探针/ASR来源证明，不能保存第二份可写mainTrack。普通 save 原样保留已采纳证明，拒绝伪造、修改或删除已有证明；原生媒体移出池仍保留历史证明。证明注册时 mediaId 必须绑定当前ref且exact assetId/assetFileId一致。
2. 原 source.prepare/get/retry 保持，source.adopt 增可选 mediaId；native3 要求明确真实mediaId并addWholeClip:false，只注册源证明，既有v2行为兼容。ASR create/get/adopt 沿原 sourceId/revision/settlement，native3 从来源证明读取并保存不可变转写；缺时间码只保留全文，不生成假切点。
3. rough create.selection 增可选 sceneId/trackId，native3必须真实指定scene.main轨；clipIds 是真实video实例ID。预约basePlan扩v2/native3 union，冻结完整原生输入/来源/转写与投影协议；模型/结算复用现有 production.rough-cut Skill和唯一执行权，不新增通道。只读投影可复用既有目标校验，但不落库、不充当作品plan，不从current重算frozen模型输入。源与120k时间按BigInt有理数转换；采用不得猜边界。
4. 模型输出保留原 suggestion union。模型上下文包含所选实例的真实全文/词句、源范围和用户指令；若有权威稿，通过既有owner端口读取并冻结来源版本，不接受客户端正文冒充权威稿。无权威稿仍可基于真实转写粗剪。
5. 整clip删除只改精确scene/track/element，重复mediaId不误删另一实例；token局部粗剪支持1倍速且无需动画/effect局部裁切的基础原片实例。其他rich局部目标明确review_only并说明原因，整clip及手工编辑仍可用，不让不支持项拖垮其他合法建议。只按用户选中的可采用项原子patch。保留原间隙，仅按实际删除窗口平移主轨后续项；完整clone保留未知字段，首段保持旧id、后续段新稳定id，调整源入点/尾裁/时长。
6. 独立文字、叠层、背景音乐、已分离音频保持原绝对位置，不能猜同源关联或默默删除。候选采用前展示实际受影响项与本次仅闭合主轨的说明；用户明确选择后才采用。已有丰富叠层需要调整的粗剪仍可手工继续，不能以整工程hardfail替代局部review。未来字幕来源锚点/全轨映射继续由T-850负责，不把本次适配冒充父需求全面完成。
7. 当前目标、完整主轨顺序及ripple时间字段纳入触点digest。新手工修改先保存，采用时重读当前owner/来源/候选；变化触点拒绝覆盖并保留草稿，无关编辑可按现有显式rebind。多项/逐项采用后剩余建议依据原回执重绑，不丢重复源实例或其他scene。
8. 宿主添加可折叠AI粗剪区，复用已有效的转写/候选组件，给组件只读view，不伪造v2作品plan。先保存本地稿再生成/采用；生成不是自动采用，保存不是渲染。真实source准备、转写状态、候选理由、受影响项、失败恢复入口要可见。缺模型/转写失败不阻断原生基础编辑。900×600保持原播放器/时间轴主要区可用。
9. 同源桥增加context/seek/apply-tracks：context返回snapshot与真实选区、scene、playhead和120000timebase；seek显式scene与tick；apply-tracks核对before主轨和scene/owner，再以一次原生命令更新tracks，保留undo/redo、媒体和播放头；不reset整个EditorCore。未知ACK原请求缓存复用，typed拒绝不伪装未知；明确版本冲突提供保留本地稿/重新读回入口。
10. 来源暂不可读时仍保留原工程与手工输入，限制到真实受影响的目标，不能把旧可选素材失效变成全部剪辑不可用。原生导出当前scene的实际行为在页面明确，不宣称已合成全部scene。

## 当场验收矩阵

红→绿测试必须覆盖proof不可伪造、120k/timebase换算、gap、重复源实例/图片主轨、多scene、speed/rich局部review-only、分离音轨不误关联、零主轨可保存、单项/多项/继续采用、CAS/rebind/unknown ACK/切作品、ASR无时间码不自动切。实际页面验证基本编辑、AI转写→候选→明确采用→同一时间轴→撤销/保存/刷新/MP4；真实模型不可用须明确记缺失，不以stub写PASS。原生源码改变必须重归档、重建与hash校验。

## 独立评审确认边界补充

- get.nativeImpact 返回当前完整scene的sceneDigest与各建议窗口；digest涵盖sceneId/完整main/overlay/audio所有字段和时间、目标、来源与native粗剪协议。UI以实际选中建议窗口union去重后计算真实ripple与受影响独立项，不把各单项平移值简单相加；明确展示后确认。adopt.body增nativeImpactConfirmation:{suggestionIds,sceneDigest}，native采用必需，集合必须与采用正文suggestionIds完全相同。后端在原事务内按当前完整scene重算digest、重算所选union影响，不符返回409零写入并保留本地稿，不能靠仅main未变或旧revision rebind认为用户已确认新影响。v2保持原行为。
- bridge apply-tracks必须核对当前metadata.id/outputId、真实sceneId以及完整beforeTracks（main+overlay+audio全部字段）；before/after是明确scene的tracks，不仅主轨。前值不一致零应用并保留本地输入，提供重新保存/读取再采用的恢复途径，不用旧after覆盖后来独立轨修改。专用原生命令显式操作sceneId，执行和undo都从当前scene列表只替换该scene的tracks，保留其他scene、当前选区/播放头与媒体，不依赖activeScene导致撤销串场景。相同requestId未知ACK重播只回原回执、一次Command；即使用户已撤销再重播也不能重新写after。
- projectProductionRoughPlan(plan,{sceneId?})是contract中共享的纯机械只读view，native缺省currentSceneId、预约使用冻结selection.sceneId；绝不作为saved document.plan，也不冒充真实时间轴预览。seek使用原生真实element.startTime，不以投影累计时间猜定位。

## 真实验收发现的运行装配修复（2026-10-03）

本地 Whisper 在 Next 从 frontend 启动的独立执行 Worker 内按 cwd 解析依赖，实际出现 LOCAL_WHISPER_MODEL_LOAD；同音频在 ai-worker 依赖目录真实识别成功。依赖解析应优先保留现有桌面分层 resolver；无分层 resolver 时使用当前 Worker 模块能实际解析的 @xenova/transformers 路径建立 requireBase，最后保留传统 cwd 兼容路径。只修本地运行装配，不新建模型通道、执行器或改变冻结原输入。红绿测试覆盖 frontend cwd、worker 依赖存在、桌面 resolver 优先及传统路径；正式 CJS Worker 重建后必须由原公共转写流程验证。原失败回执继续保留；超过截止时间或有未知调用不伪装可恢复，真实验收不能靠改数据库延长预算。
