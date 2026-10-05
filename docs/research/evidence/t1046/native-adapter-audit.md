# T-1046 原生粗剪适配只读审计与合同草案

2026-10-02；仅阅读，未修改生产文件。核对当前 OpenCut 源码归档、CreatorOS v2 源/ASR/粗剪预约链和 native3 宿主。未进行真实模型验收。

## 结论

复用既有探针、exact Asset、ASR、Skill reservation/settlement、owner revision/CAS/receipt。native3 是唯一可写编辑真相。可用只读 V2 形状投影复用模型目标校验，不持久化投影片段、overlayDraft 或 renderProps。用户采纳后在原生 scene/track/element 上做明确切除与时间映射，再由原生预览/导出读取该工程。

```mermaid
flowchart LR
 A[原生素材与主轨] --> B[真实探针与ASR证明]
 A --> C[只读片段投影]
 B --> C
 C --> D[既有Skill候选与结算]
 D --> E[用户明确采纳]
 E --> F[同一原生工程局部Patch]
 F --> G[原生预览、撤销、保存、导出]
```

## 当前真实形状与时间

归档 nativeDocument.version=31；metadata.id=outputId；scenes[].id；currentSceneId；每 scene.tracks={main:VideoTrack,overlay:OverlayTrack[],audio:AudioTrack[]}。main 可混 image/video，不应把 image 当 ASR video。每个 element 有 id/name/type/startTime/duration/trimStart/trimEnd/sourceDuration?/params/animations?；video 有 mediaId、isSourceAudioEnabled?/retime?/effects?/masks?/hidden?。

**不是纳秒。** corresponding Rust `/tmp/creatoros-reference-video/opencut-classic/rust/crates/time/src/media_time.rs:10` 实际 `TICKS_PER_SECOND=120_000`。归档 web 的 `wasm/media-time.ts` 从 WASM 读取此常量。所有原生 timeline 字段是 120000 tick/sec 格点；媒体池 metadata.duration 是 seconds，不能拿它授权源时长。后端 source.timebase 与 durationTicks 从真实探针读取，是另一时间格点。

OpenCut 的 duration 是**可见成片跨度**。sourceInNative=trimStart；sourceSpanNative=round(duration×有效retime.rate)；sourceOutNative=trimStart+sourceSpanNative。trimEnd 是源尾被裁跨度；sourceDuration 可选。有效速率来自 retime/rate.ts，原生 clamps 0.01..5（无效 rate 回退1）；backend 不应偷偷以另一公式解释它。整片删除不必换算切点；局部删留应遵循原生 round-once split。投影源范围有理数换算：nativeTick/120000 → sourceTick×num/den，使用 BigInt 边界计算；不要先转浮点秒再乘回去、不要以客户端媒体池时长替代真实探针。投影若不可精确表达，可展示真实原生/source 双边界并限制只对该局部目标采用，其他合法整片候选仍可采用。

selection-manager.getSelectedElements() 返回 `{trackId,elementId}[]`，不含 sceneId。bridge 目前只支持 load/snapshot/export/insert-media；没有选区、seek 或局部 apply 协议，snapshot不带选区。

## 推荐最小公共合同

1. `productionReferencePlan` 增加 optional `nativeSources:[{mediaId,source:productionSourceMedia}]`、`sourceTranscripts:productionSourceTranscript[]`（缺省读为[]），全局来源 identity/同 exact ref绑定校验。sources 与 transcript 是冻结来源证明，不是第二时间轴。普通 save 原样保留服务器已验证的来源；不能客户端自造/改探针、tokens、provider receipt、digest。原生媒体被暂时移出池时仍保留已有来源证明/历史，不隐式删ASR。
2. `productionSourceAdoptBody` 增 optional `mediaId`：native3 时必须属于当前 referenceEditor.mediaRefs 且 assetId/assetFileId 与 settled probe 完全一致。native3 `addWholeClip` 不能触发 v2 mainTrack 添加，应明确不适用或只返回 source绑定；真实视频的原生插入由现有工作台操作。legacy v2行为保持。
3. `transcripts.create/get/adopt` 复用原 body/sourceId，在 native3 从 nativeSources 读取来源。create/adopt 都核原 owner/revision/exact bytes，保存 provenance 到 sourceTranscripts。不给AI写库；原Worker负责ASR回执。
4. 粗剪 create.selection 增 optional `sceneId`/`trackId`（native3要求真实 scene和main track；v2缺省合法）。clipIds是该scene.main的video element ids，不靠数组序号。不同scene或重复source实例不得串切。无需修改现有 ModelSuggestion union；模型仍返回 clipId/tokenIds。只读投影包含 elementId/sceneId/trackId/mediaId/原生start/duration/retime，以及真实源范围。预约冻结 `basePlan` union(v2|native3)，并把 native触点/绑定/投影协议版本纳入冻结 digest；原 reservation读回/settlement不能重算另一份当前工程。
5. get response 可加 native target view / affected time spans，供客户端对照；返回 actionability 必须实际决定当前可采用项，支持逐项/明确多项。unlocated_text/keep/review保持只读。
6. Bridge增加 `context`（snapshot+currentSceneId+selectedElements+playheadTime+ticksPerSecond=120000）、`seek`（sceneId+精确ticks）、`apply-tracks`（sceneId+expectedBeforeDigest+before/after tracks及版本receipt身份），仍严格同origin/window/session。apply不能reset整个EditorCore；执行一个 native TracksSnapshotCommand/专用Command保留 undo/redo、media和播放头，并可重试同request读回。不接受后台自由JSON覆盖。

## Patch、闭合间隙与图层保持的精确边界

- 以选定 scene 的原生主轨 video instance 为触点。整clip删除保留其他scene、其他主轨image、所有未知键和未触及params/effects/masks。相同mediaId重复使用不能一起删。
- token删除仅定位真实timed transcript+对应exact来源+选中instance，union真实token源范围，从该instance得到成片删除窗口。原子执行多个建议；同项整clip与token重叠合并，禁止重复生成重叠片段。
- 主轨后续 element 按**实际删除成片窗口**机械平移闭合间隙；保留原有未删除间隙，不把整scene无条件从0重新排成连续V2轨道。后续触点顺序/所有会被ripple的时间字段须纳入 digest，否则用户先手移动后仍会被旧建议覆盖。
- 剩余片段用完整原element克隆，并更新id/startTime/duration/trimStart/trimEnd/sourceDuration；首个剩余实例保留旧ID，其余稳定新ID。animations必须按原生 splitAnimationsAtTime裁切和右半局部重置，不原样复制完整动画。effects/masks里的局部keyframe若同样有时间，应走同源裁切或对该局部目标明确“需手工复核”；整片删除仍安全可采用。此函数只读归档的 `commands/timeline/element/split-elements.ts` 已处理顶层animations，后端直接照搬duration截片将损坏动画。
- 字幕、B-roll、音轨存在明确 `clip+source` anchor 才按源实例映射；native现有text没有caption身份或anchor，因此**不能假定所有text都是ASR字幕**。可增加 creatoros anchor 到ASR生成的原生text，而手工text/image/BGM保持 timeline绝对锚。
- 若用户明确选择“闭合间隙并移动所有轨道”，用同一全scene删除窗口映射各track：完全在保留域内元素平移，跨切点元素分割/裁时间及media入点/动画，完全被剪区覆盖的元素进入 affectedReview（保留在工程可恢复区或由明确选择删除），不能把它静默丢掉。若未选择all-tracks ripple，保持独立轨道原时间并显示实际受影响项。两种模式都必须在候选对照区说明，不能隐式混用。要满足T850字幕随主轨，新增ASR字幕必须写明确来源锚点，旧手工图层不可推断。
- 分离音频是特殊实际输入族：`toggle-source-audio-separation.ts`只是创建同mediaId、同源时间的audio并将video.isSourceAudioEnabled=false；没有video instance反向链接。不能凭同mediaId/同时间猜关联（重复源实例和手工改音轨会误切）。新分离操作可加显式instance lineage；旧分离音频保持独立轨道，提示同步调整或要求用户明确选择音频目标。基础剪辑/整clip删视频不应因此整工程hardfail。
- 多scene：仅对已冻结scene处理，其他scene逐字段保留。原生当前export只导出currentScene（frozen-export.ts），必须用户看到“当前画面/场景”，不能声称多scene已合成整片。

## 所需最小文件改动

- contract/resources/reference-editor.ts、production-rough-cut.ts、production source adopt schema所在文件；新增 native原生目标/证明schema宜集中 production-rough-cut.ts。internal productionRoughCutTaskInput无需新增model通道。
- backend production-sources.ts、production-transcripts.service.ts、production-rough-cut-reservation.ts、production-rough-cut-touch.ts；新增集中 native机械投影/patch helper；production.service.ts manualsave保provenance/checkexactrefs。
- 组合根 frontend/src/server/persistence-client.ts 的 assertExactSources 目前直接 plan.mainTrack.sources：必须泛化读源catalog，端口 type当前只接受ProductionPlanV2；不能“native转换出v2后存到工程”绕过。组合根窄适配属必需write_set。
- frontend reference-editors/video-reference-workbench.tsx 与reference-editor-frame.tsx，native context/seek/apply接受真实回执；既有 production-transcript-panel/production-rough-candidate-panel hard typed ProductionPlanV2，需只读 view props/接口泛化，不能通过伪造ProductionEditorDocument.plan=v2让原组件保存影子。component等待请求恢复/sessionStorage scope可复用。
- upstream archive embedded/bridge.ts、commands narrow native snapshot apply、source-time helpers/动画split共享、host tests；重新归档/构建/manifest校验。切勿只编辑public打包JS。

## 已发现阻断与必须验证

1. 目前 sources/transcripts/rough全部parseV2，native3直接调用会失败。source catalog合同、组合根端口和source adoption需要先review。
2. 当前native普通save允许宽JSON，backend只有exact refs通用校验；新增provenance与native粗剪须有真实version31/时间安全整数、scene/track/element身份唯一/媒介绑定/来源范围校验，不能自报duration授权。
3. 权威口播稿目前未进入rough modelContext：已有context仅instruction/selection/clips/sources/transcript；若FR明确要求稿件对照，需inject既有owner读取权威稿端口并冻结来源版本，禁止信客户端全文。write_set含相关port可由主会话扩。
4. pending保存目前所有错误都保持锁定，typed409没有“保留本地稿/重新读取”恢复区；接入AI前应解除已知拒绝和未知ACK的混淆。冻结同请求重试不能生成新键。
5. native load采用全refs Promise.all，任何旧文件不可用会阻断整个workbench。这不能新增为粗剪整单failure；基础工程仍应可读，单不可用元素标注并安全跳过可选层；真实来源不足的候选限制局部采纳。
6. 验收必须覆盖120k↔真实timebase有理数、speed、gap、重复源实例、多scene、图片主轨、分离音频、animation、token跨切点、手工字幕、零主轨、单项/多项/先采纳再采纳、CAS/rebind/晚响应/unknown ACK恢复、ASR text无假切点、真实模型候选和实际MP4切点声音。现报告仅技术查证，全部真实模型旅程仍待测。

## 供前端/后端并行实施的窄字段约定（按主会话最新范围）

默认只自动采用 1x、无局部动画/不能正确裁切局部 effect keyframe 的真实 timed token 范围；rich 局部建议 review_only，整clip删除仍按instance支持。主轨删除窗口闭合，独立text/BGM/overlay保留原绝对时间并在采用前明确列出受影响项，不自动猜caption/音频关联。手工原生剪辑不受AI限制。

- `productionReferencePlan.nativeSources?: Array<{mediaId:string;source:ProductionSourceMedia}>`
- `productionReferencePlan.sourceTranscripts?: ProductionSourceTranscript[]`
- `productionSourceAdoptBody.mediaId?: string`（native必需；调用addWholeClip:false；v2省略保持默认）。schema实际在 `contract/src/resources/production-editor.ts:61`。
- `productionRoughCutCreateBody.selection.sceneId?: string`、`selection.trackId?: string`（native要求该scene.tracks.main.id，clipIds必须它的视频元素；旧body缺省保持V2）。
- `productionRoughCutRequest.nativeImpact?: {sceneId:string;trackId:string;ticksPerSecond:120000; suggestions:Array<{suggestionId:string;removedRanges:Array<{startTick:number;endTick:number}>;shiftedElementIds:string[];independentItems:Array<{trackId:string;elementId:string;type:string;startTick:number;endTick:number;reasonCode:'INDEPENDENT_TIMELINE_ITEM'}>}>}`。生成get时按真实当前native和既有可用候选机械计算；无法精确计算者对应suggestion actionability=review_only/reasonCode='RICH_LOCAL_TIMING_REVIEW'，不伪造removedRanges。移位主轨触点属于currentTouchDigest。前端显示将删区间、哪些主轨后移以及需手工调整的独立项，随后明确采纳。
- 对照seek定位用目标clip original.startTime及真实token source映射，秒=120000 ticks conversion，不能直接旧V2累计mappingSpan代表有gap的native位置。
- 采用返回仍为原 `ProductionEditorVersion`（plan=原生3）；后端CAS只更新native scene tracks与原immutable metadata保留。前端 onSaved 收实际native回执，bridge `apply-tracks {sceneId,expectedBeforeDigest,beforeTracks,afterTracks}` 单command应用并保留undo；有dirty本地工程必须先save冻结再create/adopt，不能拿旧owner revision随意覆盖当前iframe。
- 前端读 source/transcript/catalog可直接从本来native owner.plan读取；原组件扩 `view:{sources,clips,sourceTranscripts,sceneId?,trackId?}` 的只读props。不用把document.plan改v2。view.clips可含原existing ProductionMainClip及nativeTimelineStartTick供定位，不承担任何保存真相。
- 能复用的 get/create/adopt 操作ID全部不变；taskInput/Skill settlement也不变。新增metadata版本仅影响basePlan frozen union及digest，旧预约不能在新代码下重写解释。
