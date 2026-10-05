# T-1062 单条原片粗剪：Skill、词句与停顿合同缺口核对

2026-10-05；证据冻结在诊断 WIP `c5316506`。读当前整合 T-1062 SPEC、冻结 T-850/T-1046 SPEC、公开/内部类型、service/model prompt及原生源码归档。只写本 `/tmp` 报告；本子任务没有运行模型、浏览器、用户媒体或修改产品。这是本次审计执行范围，不代表用户禁止后续合法隔离验收。

结论：**单条原片里按真实词/句删除口误、重复或失败重录，已有合同和机械实现；目前真实 ASR 词句证据仍不足，且存在严格精度/实例限制。长停顿保留一部分并缩短，则除了 ASR 证据之外还缺候选表达与采用合同。** 不能只加强 Skill 文案就声称停顿压缩可用，也不能把整体 clip 删除当成单条原片的局部粗剪通过。

## 1. SPEC 和当前公开合同到底承诺什么

- `docs/features/t850-visible-rough-cut-workbench.md` FR-850-3：真实词级才按词剪、真实句级只按整句，改字幕文字不自动剪音视频；FR-850-4：模型理解重讲、废弃试讲、强调、临场微调，不确定保留。主轨支持分割/修边/删除、真实源范围和实例映射。第62行明确手工编辑union中的 `removeTranscriptRange`，不是任意文本秒数推测。
- `docs/features/t1046-native-ai-rough-cut.md` 原生合同第4–6项：模型输出保留原suggestion union；token局部适配只支持1倍速、无动画/effects/masks局部裁切的基础原片；rich局部review_only；主轨ripple，独立文字/叠层/背景音乐/分离音频保持绝对位置并先展示影响。
- 当前 T-1062 有限验收表要求完整重录、局部删口误/重复、处理停顿及字幕独立项影响。B-roll、动效、双语跟读、16音效只核已有链路，不能为pause缺口扩成完整ChatCut精剪产品。

`contract/src/resources/production-rough-cut.ts` 的真实 union：

```ts
// create.selection
{sceneId?, trackId?, clipIds,
 transcriptSelection?: {transcriptId,tokenIds} | {transcriptId,textSelection:{start,end,offsetEncoding:'utf16'}}}

// ModelSuggestion
{suggestionId,decision:'keep'|'remove'|'review',reason,uncertainty,
 target:
  | {kind:'clip',clipId}
  | {kind:'tokens',clipId,transcriptId,tokenIds}
  | {kind:'unlocated_text',transcriptId,textSelection}}
```

`productionRoughCutAdoptBody` 只选择已有 suggestionIds，并含revision/request及nativeImpactConfirmation/rebind；没有自动重录选择器、独立任意source range、pause gap或保留停顿时长字段。`ProductionNativeRoughImpact.removedRanges` 是后端从合法目标派生的结果，不能把这个响应字段当作模型输入裁切权限。

`contract/src/internal/production-rough-cut.ts` 的 task 输入只是 `{projectId,contentOutputId,productionRequestId,frozenInputDigest}`，服务端回读唯一原预约；它不接受客户端plan，也不授权模型自报秒数。

## 2. 单条原片词句口误删除：已有链，不需要再添任意range字段

| 输入情况 | 当前合法行为 | 不能声称的行为 |
| --- | --- | --- |
| 一条长clip、真实word tokens | 模型选所选实例中真实token IDs，采用后切除这些token时间窗，保留其他内容 | 仅凭识别全文定位字/秒数；跨token内部拆更细字符 |
| 一条长clip、真实segment tokens | 按供应商真实完整segment范围删留 | segment内某个词/字精准删除 |
| 只有全文 text | 可按已选完整clip建议keep/remove/review；显式UTF-16选区可用unlocated_text供复核；手工真实分割后可整clip删留 | 把局部全文文字按字符比例映射成时间；未分割的长clip整删伪装“已删一处口误” |
| 单条clip中存在多次完整重录 | 真实word/segment时可选失败重录的tokens；全文时先手工分出有真实边界的clip，再模型比较/用户采用 | 文本相似度算法决定最佳录次；把多个不完整试讲拼成用户未讲过的完整句 |
| native rate!=1 或任意动画/effects/masks | 局部目标review_only；整clip删除和原生手工编辑仍有效 | 即使有效ASR也自动局部裁切rich实例；以一个不支持项hardfail全部合法建议 |

语义选择由已配置模型承担，代码只是验证范围。实际 chain：

1. `production-rough-cut-reservation.create` 保存 current revision，冻结完整basePlan/真source/transcript/用户instruction/scene+main track/clip实例，native无显式transcriptSelection时自动提供所选来源完整transcripts，有权威稿则经owner port读取并冻结。
2. `production-rough-cut-adapter` 用原 StructuredBusinessAdapter，skillId=`production.rough-cut`、capability=`script.draft`，prepare只读原预约，冻结roughCutContext；prompt v2输出严格schema。`validation.status=partial`返回`production_rough_cut_partial`，不能冒充正常`production_rough_cut` settlement。
3. `validateRoughSuggestions` 验所选clipId、token属于同transcript/source、完整在clip.sourceIn/out、explicit pick覆盖；native无explicit pick允许完整真实transcript tokens。`unlocated_text`仍必须位于显式textSelection，不能把默认整clip的全文上下文当任意局部text选区授权。
4. `nativeRemovalRanges` 只选择真实video实例（或合法之前采用生成的child）；拒绝text granularity、错source/错token、越界/已部分切除、变速/rich局部。每个token.sourceTick经`sourceNativeTickExact`精确转换到120000tick/s，不能精确整除就review_only；不是四舍五入猜切点。
5. 对1倍基础实例，`nativeStart=element.startTime + exact(token.start)-element.trimStart`，end同理，完整在当前实例。`applyNativeRoughSuggestions`对合法删除窗取union，保留补集并更新startTime/duration/trimStart/trimEnd；首残段保留旧id，后续创建稳定新id和creatorosRoughParentId。仅指定scene主轨闭合实际删除窗，其它scene/未知字段不动；重复mediaId另一个实例不误删。
6. v2的 `applyRoughSuggestions→applyMainTrackEdits(removeTranscriptRange)` 同样按真实token范围拆保留段，并按明确实例锚重映overlay；native不保存v2影子工程，`projectProductionRoughPlan`只读投影不是保存真值。

因此“只有整clip删除代码”这一判断不成立；但真实供应商word/segment公共流程→真实局部候选→实际听审采用，仍需单独证据，已有fixture token test不能替代。

当前modelContext提供instruction、clips、sources、真实转写及可选权威稿，adapter输出JSON facet；没有在本链给模型实际音频采样或画面。完整表达/上下文一致性的语义选择可以基于这些文本；声音表现更好、呼吸是否自然、停顿里是否还有声音不能仅凭该上下文声称AI已听审，仍需真实音频证据或用户对照。

## 3. ASR 校验严格到什么程度

不是请求选了word就一定得到word：`productionSourceTranscript`严格text/segment/word union，text没有tokens。纯文本不会被补假时间码。

- `ai-worker/src/runtime/asr-provider-timing.ts.readActualProviderTiming` 保留供应商原units/原range/rawResponse/audio摘要，时间需精确转换整数样本；range身份唯一、非重叠有序、正时长且不超validSampleCount。不会裁掉超界尾词或根据文字拆词。
- `contract/src/internal/asset-asr-timing.ts` 的真实PCM mapping当前只允许同采样率完整原生PCM、无source skip/discard或output trim，并要求完整source/output decoded帧和samples覆盖。没有合法时钟证据就text降级，不把压缩音频、padding或多段音频的未知映射说成词级已支持。
- `production-asr-timing.ts.verifyPcmMapping/mapAssetAsrTiming` 核exact asset/file/digest/probe/timebase/duration、抽取receipt/digest及所有decoded frames/mapping segments；provider音频digest/sampleRate/count必须匹配；样本边界必须精确落在source tick且范围内。tokenId从aggregateReceipt/call/provider unit机械生成，不由模型或客户端造。
- `asset-asr-owner.service.complete` 当前只有**单一**真实调用且非text timestampMode、mappingStatus=verified时可能生成word/segment。`readAggregate`复核执行任务、settled调用、真实原response、manifest/digests，并重新映射核tokens/timingReceipt。多chunk合法全文不等同跨chunktiming支持。
- `production-transcripts.service.adopt` 再核成功aggregate、原exact字节、source proof、相同冻结输入与回执，才把不可变transcript存入工程；字幕校字不会改这个原来源。

冻结历史证据 `docs/research/evidence/t1046/ui/real-asr-result.json` 明确 granularity=text。`asr-diagnosis/asr-real-diagnostic.md` 记录同exact音频mapping verified、228939/16000=14.3086875秒；真实Whisper尾单位[13.96,17.14]超音频，strict timing=null。detached buffer长度实现bug已修，但这条真实源仍没有合格word证明。追加静音probe也负，不能宣称已验收词句。

## 4. NativePatchReplay 保证应用与撤销，不生成新的剪切范围

冻结原生archive：`c5316506:frontend/public/reference-editors/sources/opencut-classic/native-source.tar.gz` SHA256=`0da70debcdf5a6656c65847606314f523c29e8f59e83e27e02077521130e9420`；本次从Git bytes内存读取源码，没有运行归档脚本。

- `frontend/.../video-reference-workbench.acceptVersion` 从原expectedRevision读取beforePlan，与已采纳version的afterPlan找真实scene改变；prepareDocument会先保存本地修改。构造`apply-tracks {outputId,sceneId,beforeTracks,afterTracks,expectedBeforeDigest}`并缓存native-adopt requestId。
- archive `apps/web/src/embedded/native-operations.ts` 的`NativePatchReplay`：同requestId核完整payload fingerprint，未知ACK重发只读原receipt；Undo后重播不再写after。owner/scene、完整main+overlay+audio before及digest不符typed409零Command；异步hash期间再核完整前值。
- `NativeTracksSnapshotCommand` `handlesRipple=true`，只替换明确scene的完整tracks，保留其他scene/当前选区/播放头与媒体；undo恢复该scene的before。后端已ripple，原生命令不再二次ripple。
- backend adopt要求nativeImpactConfirmation中的集合完全匹配所选suggestions，sceneDigest包含完整轨道、source/transcript，事务内重算触点及所选union、核exact source/CAS/settlement；不能凭模型返回的轨道直接执行。

这条链能把现有合法token删留变成同一原生时间轴上的可撤销修改。它没有把pause语义变range的逻辑；只有before/after快照协议不等于任意语义操作已实现。

## 5. 长停顿缩短：明确缺合同表达，ASR有效也不能自动补齐

当前token target只删除token本身范围。native `nativeRemovalRanges`逐token建窗再union；v2 `production-main-track.ts:48–53`在每个token.start之前保留cursor→start间隙。不是把“首词start到末词end”全部删除。

例（真实timed tokens的机械例，不是实测）：词A=[1s,2s]、词B=[5s,6s]，中间gap=[2s,5s]。选择A、B tokens删的是[1,2]与[5,6]，gap会保留。选择只保留A/B也不会缩gap，因为keep不改工程。模型不能返回`sourceIn/sourceOut`，不能mint一个代表[2,5]的空token。即使后台知道左右token时间，也不能自行把缺token区间断言为无声，更不能用固定0.25秒阈值代替语义创作判断。

目前可行的原合同路线是用户在真实原生时间轴听审、分割/修边停顿，再删已分出的真实clip；若仍需保0.25秒等，用户手工留相应源范围。这证明手工停顿处理，不证明单条原片AI自动pause压缩。少数真实ASR供应商可能把空白单位也作为真实token回执，但当前没有该可依赖合同/实际证据，不能当常规pause目标支持。

## 6. 现有合同内的最小 Skill 方法补充（建议文本，不改代码）

可加入可配置 `production.rough-cut` 方法，不改变schema、采用协议、执行权或任务边界：

> 先通读所选真实内容，优先保留意思完整、前后衔接自然的重录。对明确放弃的试讲、口误后的重新表达、没有承载意思的重复提出删留理由。自然临场补充、有意强调、必要连接和呼吸不要仅因重复或不在稿中就删除；权威稿用于理解，不强迫逐字一致。不要把几次未说完整的话拼成新的完整句。只有可验证的完整片段或真实词句ID才能给remove；不确定使用review，当前内容保留并说明需听审的位置。全文没有定位时只给复核或完整片段建议，不猜时间。长停顿若没有可采用的范围合同，只说明需手工听审处理，不输出假的token或clip目标。

它强化的是语义方法：既不硬编码词表、相似度打分，也不把“恩/重复/稿外”自动判成废话。模型决定候选，用户决定采用，代码继续只守真ID/时钟/权限/CAS/幂等。提高模型语义取舍仍需真实听审效果证据，不能以prompt文字变更当功能PASS。

## 7. 若要AI直接缩短停顿：最小需独立合同评审的提案

这属于T-1062有限“处理停顿”验收项的合同缺口，不要求新增完整精剪功能；但现有T1046明确“保留原suggestion union”，所以不得暗塞字段直接实现。需修订具体合同并独立评审，再串行实施/验收。

建议**只新增一个真实gap目标**，不开放模型任意秒数range：

- backend从同一verified timed transcript中相邻真实token边界产生只读gap记录：`gapId,clipId,sourceId,transcriptId,leftTokenId,rightTokenId,sourceStartTicks,sourceEndTicks`及来源digest，冻结在原reservation。区间必须正且完整落所选1倍基础clip；gapId绑定原source/transcript/实例，不能把同源另一个实例混进来。
- model suggestion union新增 `{kind:'pause_gap',clipId,transcriptId,gapId,retainedTicks}`，retainedTicks为源timebase整数，`0 <= retainedTicks < verifiedGapDuration`。模型只选已冻结gap，不自报start/end；reason/uncertainty仍原字段。保留区段位置须在合同写死为可审查机械规则，例如保留gap前端retainedTicks、删余下部分，并在用户对照界面显示实际keep/remove窗，不能模糊写“压至约0.25秒”。
- **gap不等于静音证明**：ASR两词间可能有呼吸、非词声音、未识别语音或强调。没有真实音频证据时必须标待听审，不能仅凭ASR没有词就自动remove；用户明确确认真实预览及影响后才采用。代码核时钟范围、不判断内容；如未来加音频分析必须通过同一真实source/call证据并独立定其合同，不能在本提案偷塞VAD算法替模型判断。
- reuse原candidate/settlement、sceneDigest、impact confirmation、union/ripple、原生单Command/Undo与exact source；新target必须被`validateRoughSuggestions/nativeRemovalRanges`等完整识别。不能仅在前端按钮提交新字段。old请求/结果按旧schema继续重放；新protocol/version与冻结digest明确，不重写历史。
- 这个最小提案只解决相邻真实词/句间gap。原片首尾无token停顿、token内部pause、没有timing、丰富/变速片段不在该目标可表达范围，需明确review/manual；不能将此局部提案声称全部停顿已支持。若要覆盖这些合法输入，合同评审须明确对应verified边界族与安全手工降级，不能隐含猜边界。

必须拒绝/保持review的案例：

1. 全文text或超界/重叠/非整数时钟provider timing；不按字符或标点造gap。
2. gapId不存在、digest/word位置变化、两token不相邻、跨source/transcript/clip、边界超当前trim、已采用或手工裁掉一部分。
3. retainedTicks为负/非整数/超gap，删除窗空或不足可表达播放范围；原生不能精确落120k格点，不round。
4. rate!=1、动画/effect/mask局部实例；保持原clip可手工继续，不hardfail其它actionable建议。
5. current scene/完整tracks或来源变了、未确认独立项/所选union、typed409或unknown ACK时新造request重发；沿原冲突/回执恢复。
6. 没有听审证据却把语气停顿/呼吸/未识别语音判为必删，或合并不同失败试讲制造句子；语义不确定就保留/review。

## 8. 结果怎么诚实验收

现有合同内必须分别记录：真实全文ASR、真实word/segment校验、单条clip局部口误删留、完整重录选择、同轨采用/撤销/保存刷新/MP4、停顿手工处理。单词句通道缺时码是运行证据缺口；pause目标尚不存在是合同/能力缺口，不能混记。

可以先验证当前tokens合同，不必为了词句删除新增任意range；需要新的pause字段则先独立合同评审再实现，不能在本子任务越过审查改代码。本报告没有执行新模型或媒体旅程；冻结真实证据仍仅全文与整clip主路线，未执行/未完成不写full PASS。
