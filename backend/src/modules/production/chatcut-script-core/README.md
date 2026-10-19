# T1274 原生 Markdown 剪辑纯引擎

这是一条“读工程 → 编辑投影 → 确定性计划/diff → 候选”的纯 backend 叶子。没有数据库、第二工程真相、缓存、模型调用或新运行时。用户采纳、CAS、归属、版本、真实预览仍由原生产 service 和候选 owner 实施。

## 接口与接线

- `readNativeScriptMarkdown(plan, sceneId, trackIds?)` 返回完整 scene/源库 stamps、formatVersion=1、Markdown、只读 libraryDocs、alias→真实 trackId 和完整 editable/protected 集合。
- `planNativeScriptMarkdown(plan, sceneId, {markdown,declaredTrackIds,stateStamp,libraryStamp})` 返回 `scene/warnings/errors/operations`。发生可独立定位的片段错误且其原位置不受前序时间依赖影响时保原片段并 warning；不能隔离的错误保原该轨并 errors；其他合法轨候选继续。调用方必须明确展示部分结果。
- base 使用 HEAD 已有 ProductionReferencePlan；新契约包装由主会话实现。失效/不存在的可信基础工程属于既有 service 前置错误；用户 Markdown/声明轨道错误返回行号诊断。
- `operations` 的 `update/clone/add/delete` 描述候选变化，不是提交回执；没有保存或媒体执行证据。

## 格式（本地 v1）

沿参考04/22：header markers、`## V1/A1`、`### source`、`[cN]`/`[sN]`/`[gap]`/`[silence]`。增加已有身份与真实时间所需的最小元信息：

```md
<!-- markdown-state:format:1 -->
<!-- markdown-state:stamp:sha256:<完整64位hash> -->
<!-- markdown-state:lib-stamp:sha256:<完整64位hash> -->
<!-- markdown-state:timeline:<URL编码sceneId> -->
<!-- markdown-state:body -->
## V1 <!-- markdown-state:track:<URL编码trackId> -->
<!-- markdown-state:scope:<URL编码完整descriptor JSON> -->
[gap 120000t]
### asset-a <!-- markdown-state:source:media-a:asset-a -->
[c1] 240000t source=0..240000t rate=1 <!-- markdown-state:item:element-a -->
[s1] 原词
[silence=60000t] <!-- markdown-state:range:60000..120000 -->
[s2] 后词
```

`t` 是原生120000 ticks/s。gap/duration使用时间轴ticks；source/silence使用源原生ticks，经已冻结timebase精确换算，保留retime实际rate。图片没有词句/视频probe要求，c行区间仅表达图片的明确显示时长，旧trim仍完整保留。

- cN是本次base的稳定原元素锚；可整体删除、搬动或重复整个组。未进入完整editable集合的所有元素保留，省略保护注释不代表删除。原scene、轨道扩展、参数、mask、effects、动画与独立轨不按文本重建。
- sN在media+asset下映射真实transcript+token；word与segment各用既有词/句边界，不按字数估时。没有精确词句时间就只提供完整clip/真实冻结源范围；非原生格点token不发假锚。
- 删除词/句用整行`~~[sN] 文本~~`。保留区间按原顺序并合并连续源区间，断开的部分通过19算法延续/clone原配置。
- silence仅是未转录源区间，不宣称声学静音；子行缩短、删除、遗漏会保原片段并提示沿既有停顿听审。本函数没有听审确认端口，不新增自动删静音规则。完整片段删除仍有效。
- 新增来自精确source header与`[clip source=480000..600000t rate=1]`，或只读源库的明确sN；不创建新轨道/不支持类型。视频/音频需要被冻结的源真实时长；图片身份沿既有明确image媒体引用。音轨新增还须hasAudio。
- 每条声明轨必须保留真实header与完整scope descriptor。错误scope、缺轨header或未知新alias不能被当成删除。缺少顶部元信息且本次可信外部base完全吻合才恢复并warning；缺正文标记不可恢复。
- stateStamp覆盖完整nativeDocument、编辑器/production revision、媒体文件引用；libraryStamp覆盖全部nativeSources、sourceTranscripts（含时码/全文/receipt/evidence）、mediaRefs。对象键按确定性字符序列canonical，数组不排序，两种stamp均完整sha256。

## 来源与必要修改账本

来源根：`/Users/zyongzhu/ThirdSpace/03-知识/ChatCut-架构分析/extracted/`。`reference/NN-original-blocks.md`保留指定文件全部原TypeScript代码块与原文件SHA256；原占位/接口缺漏原样留作审计，不作为运行时导入。

| 参考 | 运行承接 | 必要适配（没有另造语义算法） |
|---|---|---|
| 04 markdown-state | format.ts、adapter parseRows | 原逐行parser/正则格式；t替代30fps帧估时、header复合媒体身份与完整scope、未知行定位错误、损坏下一cN不吞入上一组 |
| 22 renderer | adapter render/chunksFor | 保留轨道与逐item源切换；A-B-A不按asset归并；真实原生ticks、真实词句、gap和未转录源区间；无修改回传原对象完整结构 |
| 28 auto-correct-chain | normalize.ts、resolveGroup | 复用normalizeWithMap/compact；按原asset/source边界，用真实复合token身份；首命中改唯一命中；未提供fuzzy/cross-asset，不猜重复句 |
| 19 apply-diff-algorithm | diff.ts、applyTrackDiff | 原preserved→source overlap→claimants update/clone→fresh→delete算法；Ms改Tick；范围仅完整editable originals；原配置深拷贝、fresh带真实mediaId；不保留原DB伪代码 |
| 35 apply-flow-complete | planNativeScriptMarkdown | 沿stamps→parse/correct→plan→diff→校验的5阶段；结束于候选，不transaction提交；完整sha256；可信base恢复缺元信息；局部保原或整轨保原 |
| 27 ScriptError/message+hint | NativeScriptMarkdownError/issue | message/hint继续给出修复路径，增加实际line；本接口不接字段变更，没有copy不用的Levenshtein/字段词表 |
| 33 batched errors | errors/warnings返回 | 完整结构化错误不丢；模型/UI摘要由已有消费方按需限制，纯引擎不凭错误文本正则声称统一drift |
| 34 alias验证 | format.ts、真实轨映射 | 沿V/A正则；仅使用已有映射，不创建原renderer不支持的新轨。P别名只表示本次保护轨，无新建含义 |

语义边界：文本归一化仅协议纠错；源交集仅决定既有元素身份延续；删留/排序/复制来自Markdown明确输入。不以关键词或相似度选择镜头，不补造时间、媒体身份或转录。

## 当场TDD与验证

在隔离worktree `t1274-markdown`、base `ed9cfbf8d4cb38fdb188abb11a82442899f9a29b` 执行：

- 2026-10-13 21:08:23 初次RED：module不存在，suite failed、0 test。
- 21:15:08 初版16用例GREEN。
- 21:18:37 行为RED：22 tests、2 failed，未知旧type no-op被validator误拒、非法声明轨道抛异常。21:19:45修复后22 PASS。
- 21:20:39 行为RED：23 tests、1 failed，明确image clip被错误要求视频probe。修复后21:23:17为23 PASS；中间一次失败是新测试移除source却没移除其transcript的无效夹具，已修夹具，未放宽断言。
- 21:24:08 行为RED：24 tests、1 failed，损坏同素材下一cN header落入前组、误推定删除旧元素。已窄修parser，最终GREEN以本子任务回报的实际命令输出为准。

聚焦命令：`pnpm --dir backend exec vitest run src/modules/production/production-script-markdown.test.ts`。

全backend `tsc --noEmit` 实际exit=2，591行既有跨模块诊断（script-runner/settings等），本写集无匹配诊断；未修改任何写集外文件。聚焦新路径类型检查在最终回报记录。

未验：公开read/propose/adopt包装、账号组/归属/CAS、UI实际预览、保存回读、真实媒体与安装版、全局Gate。当前固定native validator仍拒绝旧未知type存在时的非空修改、rich未知params的clone或剪短后越界动画；引擎保原并明确errors，主会话将在实际消费链处理保护未变旧类型，不把局部suite当全链成功。依赖只复用现有node_modules软链，未安装全量依赖。

最终聚焦验收（2026-10-13）：

- 21:28:58 `production-script-markdown.test.ts` **24/24 PASS**，包括前述当场行为RED的全部原断言。
- 聚焦新路径 `tsc --noEmit --target ES2022 --module esnext --moduleResolution bundler --strict --noUncheckedIndexedAccess --skipLibCheck --esModuleInterop --types node production-script-markdown.ts production-script-markdown.test.ts` **exit=0**。途中明确图片body的重复trim字段诊断已窄修，未放宽编译选项或测试断言。
- 全backend全局exit=2保留，不声明全仓类型通过；不包含真实媒体、保存/采纳或UI验收。


T1274公共接入复核增量：安全保原时同时保留ranges错误的行号/hint（keptErrors不反杀可独立的候选）；nativeChangedMediaIds仅按完整JSON前后值列实际新增/变化媒体，旧保原/删除不下载非目标可选文件。公共read/propose复用冻结来源/真实ID，变更仍读原service port，采纳复用CAS；这些窄适配不承担语义选词或素材选择。原unknown type输出投影与before-aware同轨保护见contract，新增/改写schema不放宽。末轮公共PGlite初始化超时，不能冒充集成通过。
