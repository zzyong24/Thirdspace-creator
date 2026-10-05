# T-850 原始口播粗剪与可操作的剪辑工作台

2026-10-02 用户明确要求：“粗剪 剪辑工作台要支持 替换掉现在的纯黑盒式剪辑 还是参考 chatcut”。承接原 T-850，不另建重复任务。本 SPEC 是新增粗剪范围的当前权威；原 T-1035/T-1037/T-1038 排除原始主录像剪切、口播只读的条款在本任务范围内由本 SPEC 替代，其余约束继续有效。当前为范围与合同设计，未交付实现。

## 用户结果与参考

用户上传未剪口播即可开始。AI 给出可看、可改的粗剪初稿；用户看原片、读文字、调整删留及剪切，再在同一工作台添加字幕、素材、信息卡并生成成片。整个过程有真实预览、保存与恢复，不再必须先在外部剪辑软件导出粗剪视频和 SRT。原粗剪+SRT、直接上传成品仍可用。

本轮已打开核对 ChatCut 官方 [工作区](https://chatcut.io/docs/editor-overview)、[时间轴](https://chatcut.io/docs/timeline)、[逐字稿剪辑](https://chatcut.io/docs/transcript-and-captions)。参考其播放器、文字与时间轴联动、手工与 AI 操作同一工程的体验。不是嵌入 ChatCut 服务或照搬其全部功能，不承诺本任务新增多机位、任意转场或剪映工程导出。

```mermaid
flowchart LR
 A[原始口播视频] --> B[转写及可定位文字]
 B --> C[AI 删留候选／手工粗剪]
 C --> D[播放器＋文字＋时间轴联动]
 D --> E[对照／调整／撤销]
 E --> F[保存同一作品工程]
 F --> G[字幕素材卡片编辑]
 G --> H[预览与生成该版本成片]
```

## 必须完整支持

| 需求 | 用户可操作行为 | 验收 |
| --- | --- | --- |
| FR-850-1 原片进入 | 上传真实录像并自动发起既有转写；显示上传/转写状态、可恢复错误及真实时长；转写失败仍可手工按时间剪切 | 原片+自动转写和已有粗剪+SRT 两条公共链路均可进入；刷新恢复同一作品 |
| FR-850-2 可视粗剪 | 主口播轨可选择、定位、分割、修剪入出点、删除并闭合间隙、按明确选择重排；画面音频绑定，显示原片时间与成片时间 | 所选片段实际改变预览和最终 MP4；撤销恢复声音/画面及顺序 |
| FR-850-3 文字剪视频 | 点击真实时间码文字定位原片；删除选中文字对应的音视频范围；显示将删除的时间并可预览/撤销 | 词级时间码才能按词剪；只有 SRT 句级时间码时按整句选择，明确提示粒度，不伪造词边界；改文字只改字幕，不自动删视频 |
| FR-850-4 AI 可检查 | Skill/模型读取真实原片转写、权威口播稿和用户选区，提出逐段删留及理由；逐项或明确全部采用，原片/候选对照预览 | 临场微调、强调、重讲与废弃试讲由模型理解；无凭据明确不可用，不阻断手工剪；不确定默认保留 |
| FR-850-5 同一工程 | 粗剪与字幕、素材、卡片共用当前作品 revision、播放头与保存历史；助手以真实片段 ID 提局部候选 | 手工修改后旧候选检查触点前值，冲突保留草稿；不能重新生成整片覆盖手工操作 |
| FR-850-6 时间重排 | 保留源片范围到成片范围的显式映射；字幕随实际保留范围裁切/重排，后续素材/信息卡按其明确锚点映射 | 删除中段、修边、重排、同源重复使用后，预览/成片文字和音画一致；无可映射范围的素材项显示受影响并由用户调整，不静默丢弃 |
| FR-850-7 体验布局 | 播放器和文字为主区，下方可缩放时间轴；选中项参数与 AI 侧栏可折叠，支持键盘；主要保存/预览操作可见 | 1440×900 与 900×600 可用，1000 片段按视口渲染；加载、保存、生成反馈清楚，慢响应不覆盖新输入；LED-047 回归 |

## 数据、服务与实现边界

复用 T-1037 的 production→video output→project 归属、版本/CAS/请求回执、Asset 和现有 execution；不另建剪辑工程数据库、任务执行器或当前方案。原片不可变且不自动删除，粗剪是同一方案中的非破坏性主轨片段。旧 renderProps 没有主轨编辑时沿现有整段播放，不能让新增质量门阻断原合法生成。

合同新增主轨片段稳定 clipId、真实 sourceAssetId、sourceIn/sourceOut、明确顺序及源时间/成片时间映射；分割保留旧身份来源并创建新稳定 ID，重排和修边不因数组位置换身份。时间按真实媒体探针与 timebase 校验，不使用客户端自报时长授权。源范围非空、有限且不越原片边界；合成时长从保存主轨派生，不接受客户端任意总时长。

每个源引用还必须冻结真实 assetFileId/不可变媒体版本及其探针身份，不能仅凭可换文件的 assetId 恢复旧剪辑；执行时通过 Asset 公共端口核对归属及原文件，缺失显示可恢复错误，不能偷偷使用替换后的文件。文字删选区、字幕/素材/卡片映射均绑定具体 clipId 与源范围；同一源录像重复插入两次，删除某个实例的文字只影响所选实例，原 ASR 词/句 ID 不能代替片段实例身份。

扩展既有 editor.get/save/apply/preview/render 和严格编辑 union，覆盖主轨 split/trim/remove/reorder、字幕映射及 AI 候选的 expectedItem 前值校验；操作全部先验真后原子保存。每次写入按当前账号重新读取作品、素材、版本；同请求恢复原冻结回执，异内容同 requestId 拒绝；保存不生成，生成只冻结已保存版本。Worker 仅产候选，经用户采用后由 backend service 写入。真实读写合同、映射结构和渲染输入变更须独立评审后才改生产代码。

ASR 原始词/句时间码与源资产绑定，不因改字幕文本重写来源；只有真实词级结果才开放词级选区。模型负责语义删留，代码只校验 ID、时间、权限、幂等与明确选择，不能用关键词或字符串相似度做删留判断。时间映射是确定性机械转换，须标注 SEMANTIC_BOUNDARY_ALLOW 并测试，不替代创作判断。

原始 ASR 是不可变来源，当前字幕是可编辑独立投影，不因剪切或校字覆盖来源。权威口播稿存在时用于模型对照，缺稿仍能上传、转写和手工剪辑，模型可按真实转写提出带不确定性说明的候选；不能以缺稿阻断入口。删光主轨允许保存可恢复的空编辑工程，仍可撤销或重新添加原片；空工程不调用最终渲染，明确提示“请保留或添加至少一段视频”，不伪造成功成片。空编辑草稿与可渲染方案在合同中明确区分，不能借现有 scenes.min(1) 阻止保存合法空草稿。

预览与最终渲染读取同一主轨及映射，不得预览跳播一套、导出整片另一套。沿现有渲染/媒体物化能力先验证音画同步、连续切点与源片随机定位，再决定必要的窄适配；不先换渲染内核。预览失败保留草稿并可重试；旧上传/制作/成品入口保持可达。保存中的保护、失败保留输入和旧响应隔离沿 T-1038 与 DEC-T1043-02。

## 实施依赖与完整验收

## 2026-10-02 详细服务与渲染合同候选

用户已要求全面落地及自测。以下接入保留原 execution/Asset/HyperFrames，不换渲染内核。待独立合同评审后实现；源码支持不等于真实媒体已验。

### 主轨方案及公共编辑

同一 `recordingConfig.videoEditingPlan` 增加 editorVersion:2。旧v1/无版本只读不自动迁移，明确转换保存留原件。v2增加mainTrack，sources包含稳定sourceId、真实assetId/assetFileId、fileDigest/probeDigest、timebase{num,den}/durationTicks/hasAudio；clips包含全工程唯一clipId/sourceId/sourceInTicks/sourceOutTicks/可选derivedFromClipId，数组是用户明确顺序。探针元数据从后端真实文件生成，不接受客户端改时长/digest授权。

tick及timebase均有限安全整数、timebase正值、in<out<=source.durationTicks；主轨可空保存但不可渲染，专门draft schema与compileRenderablePlan区分，不放宽旧正式renderProps合法性。输出映射按精确有理数累计生成微秒start/end和真实时长，不以每段舍入累积。分割左边保留clipId，右边新ID并记录来源；移动修边不换ID。同源重复片段各有独立实例。

在原editor.get/save/apply/versions/restore/receipt/preview/render扩展v2支持，原操作兼容。严格编辑union新增：splitMainClip(clipId/expectedItemDigest/sourceSplitTick)、trimMainClip(clipId/expectedItemDigest/in/out)、removeMainClip(clipId/expectedItemDigest)、reorderMainClips(完整ID顺序/expectedOrderDigest)、addMainClip(已冻结sourceId/范围/明确插入位置/新clipId)、removeTranscriptRange(clipId/transcriptId+digest/真实词句ID及granularity)。同批先验真，再原子保存方案/映射/字幕投影/历史/回执。CAS冲突保留草稿；requestId原输入恢复原结果，异输入409。模型候选冻结源文件/转写digest/片段或顺序触点，无关版本改动可在前值不变时明确重绑；改过/删掉触点零写入。

所有写入重读output→project→当前账号及源文件、工程真值；越权/缺失404、坏结构400、冲突409。旧生成/备料/成品入口保留，先scope legacy，再校验新改触点；不能新增质量门拒绝旧合法任务。

### 转写与映射

新增真实资产文件转写的业务绑定，复用原execution/ASR provider/local fallback，不能伪装douyin awemeId。sourceTranscript冻结transcriptId/sourceId/assetFileId/audioDigest/providerReceiptId、granularity:word/segment/text及tokens[{tokenId,text,startTicks,endTicks}]；真实word/segment透传，纯text不生成假时间码、只保留手工时间剪。转写失败仍可编辑主轨。源ASR不可变，字幕投影独立；校字不切主轨。

字幕/素材/卡片明确anchor union：clip实例+source范围，或timeline绝对微秒区间。clip锚随明确实例变化，timeline锚保持用户绝对位置；旧工程首次转换展示锚定方式，不能推断语义。手工切点穿过句级字幕时裁显示时间、保留整句文字并提示复核，不猜字归属。无映射的可选素材/卡片保留数据且标受影响，预览与导出相同安全跳过并warnings，用户可重定位/移除，不能反杀正常主轨输出。机械映射/裁切标SEMANTIC_BOUNDARY_ALLOW并测试。

### 冻结文件、同源渲染与预览

executionTaskInput及run-execution-task/sandbox/materializeAsset窄端口贯穿optional assetFileId；指定时必须读精确文件、核验归属/字节身份，缺文件禁止回退currentFile。旧调用缺省沿原逻辑。Asset新增通用媒体文件冻结/读取端口，不能拿文章assertAssetFileOwned(active=true)的image限制验证视频。制作输入必须指定文件，预览用精确下载URL不持久化短时URL。

本地hyperframes@0.7.54实际CLI读取data-media-start，并对视频/音频应用source偏移；模板每clip编译独立video(data-start/output秒、data-duration、data-media-start/source秒、data-has-audio)，采用每clip独立mountAs alias物化同源字节，避免HF按同src去重导致重复片段漏音频。alias由后端稳定身份生成，不含客户端路径，现有CoW/物化保持原件。模板人物几何/氛围层共用人物组；collectMediaFiles/executor/URL绑定均支持实例，不全局替换用户文字。原单#th无主轨方案仍保持旧输出。

预览bridge从成片播放头经MappingSpan定位当前clip源时间，不再用单#th.currentTime当整片时间。一个iframe时钟同时驱动媒体/GSAP/lifetime，媒体未ready时真实暂停准备；跨切点切实例，连续seek/pause废弃晚到play promise。保留channelId/commandId/旧实例隔离/sandbox及卸载清理；父页只显示iframe实际时间，不另跑第二时钟。预览与MP4同一编译props/映射与源文件版本。

前端复用production-visual-editor/draft/fields/entry及开源timeline；原片上传即可形成可保存草稿，不以video+srt+voiceoverText三者全齐作粗剪入口门。转写、模型失败各自有可继续状态。1440×900与900×600主播放器、主轨、保存可见；逐字稿/参数/AI折叠，不删除控件来冒充体验完成。

### 独立复核后的合同澄清

v2唯一可写形状为{editorVersion:2,mainTrack,overlayDraft,sourceTranscripts}加保留的未知扩展；overlayDraft含meta/scenes/captions/broll/delivery/可选direction，不含可写talkingHead或duration。v2不再把renderProps作为当前真值；get/preview/render中的compiledRenderProps是服务端从同一草稿机械编译的临时返回，不持久化成第二可写副本。明确转换时旧完整方案保留到不可变legacySnapshot及旧历史；原未知键继续保留。空mainTrack不编译可渲染props，保存/历史仍合法。

SourceTranscript为严格granularity union：text含不可变完整text，不含tokens或假时间；segment/word含完整text及真实带时间tokens。sourceInTicks>=0、durationTicks>0；tick投影到输出微秒后不足1微秒的范围无法表达为可播放片段，编辑时明确要求选择可播放范围，不静默造时长或删除源数据。旧合法v1路径不经这个新剪切边界检查。

新增`outputs.production.editor.sources.prepare/get/adopt`：prepare输入outputId/assetId/assetFileId/requestId，返回原execution中的真实media.probe taskId/状态；get按原requestId读真实探针候选；adopt带expectedRevision/requestId，核验settled探针、原源文件及用户明确选择，写入mainTrack.sources并返回sourceId/新revision。探针任务与回执存现有execution及production媒体请求表，冻结实际文件及结果摘要，缺回执恢复同task，不用客户端时长。prepare不修改工程；adopt在事务中保存源/工程历史/回执。读源历史经工程快照，不从Asset当前文件恢复。

新增`outputs.production.editor.transcripts.create/get/adopt`：create明确已冻结sourceId/工程revision/requestId，绑定原execution的asset.asr任务与精确源文件；get回读真实granularity/text/tokens/provider回执；adopt经expectedRevision/requestId将不可变来源加入sourceTranscripts，可选生成字幕投影但不改原ASR。转写创建不要求权威口播稿、不修改主轨；失败可重试原冻结输入，真实时间码缺失仍只开放手工剪。任务类型/Worker注册、public操作严格schema及media request持久表在实现中同一contract定稿核验，不假装已存在。

MappingSpan字段为clipId/sourceId/sourceInTicks/sourceOutTicks/outputStartUs/outputEndUs。源秒数=ticks×timebase.num/timebase.den；各段使用精确有理数累加后对累计边界四舍五入到微秒，不逐段截断；endUs>startUs，否则边界错误保留输入。split切点必须严格在原in/out之间。允许至少1000片段；单工程最大20000 clip、source最多1000、单apply批次1000项，作为有限资源边界不判断内容，达限提示拆分明确操作，不静默丢项。token时间保留供应商原始结果证据，再按真实源timebase机械规范化；text族不含timed tokens。

AssetFile端口返回数据库/objectStorage核验的权威checksum及字节长度；源prepare实际读取精确文件计算SHA-256作为fileDigest，probeDigest绑定该fileDigest与规范探针结果。render冻结输入包含assetFileId/fileDigest/probeDigest；executor精确物化后重算文件摘要，与源catalog及冻结输入比较，坏字节/缺文件明确失败且零current fallback。预览resolver同样核验精确文件身份，不能只比assetId。探针和ASR结果仅从该原task真实settled回执取信，客户端自报tokens/providerReceiptId不能落为来源。

### 实现与验收文件范围

contract production-editor/video-render/execution/ASR；backend production/Asset/execution及正常schema迁移；worker ASR透传和粗剪Skill候选；frontend生产工作台/bridge及组合根端口。媒体探针、源文件和ASR新增合同先独立评审，不在用户库补DDL。旧v1/v2空draft/词句文本三族全部公共链回归；真实MP4必须删中段、反序、重复同源、切点帧/音频和同步对照，不能以HTML或拖动测试通过代替。完整前端、contract、backend、boundary/orphan/LED-047/reconcile按事实记；模型缺凭据标未验，实包沿T1041。

本轮源码核对：`frontend/src/features/production/production-workbench.tsx` 仍提示先在外部软件粗剪并上传视频/SRT；`backend/src/modules/production/production-editor-plan.ts` 的可编辑项只有 scene/card/caption/broll；`backend/src/modules/execution/video-render/template.ts` 主口播仍按一段视频从零播放。现有时间轴组件选型只能复用交互，不能据此称粗剪已支持。必须补齐主轨合同、源/成片映射及同源媒体预览/渲染才能替换当前流程。

与 T-1037/T-1038/T-1039 共用工程合同、可视工作台与助手候选；已有版本保存与组件选型可复用。本任务合同定稿评审后接入上述实现，不把现有“口播只读”验收当粗剪通过。T-1041 最终验收增加本任务原片旅程；完整范围不按版本或优先级裁减。

先真实红测，再实现：公共服务双账号/同项目双视频、CAS/回执恢复、旧方案兼容；删除中段/修边/重排/重复原片片段的映射；词级与句级粒度、字幕跨切点、素材受影响处理；AI 冲突及逐项采用。真实浏览器执行上传原片→转写→候选对照→手工修剪→撤销/重做→保存刷新→字幕素材卡片调整→预览→生成→查看导出，必须有实际 MP4 的切点、帧与语音同步对照。模型凭据缺失时记录未验，不用夹具冒充。正常/最低窗口、LED-047、contract/frontend/backend/boundary/orphan/reconcile 按实际结果记录；实包沿 T-1041，不补拍历史 PASS。
