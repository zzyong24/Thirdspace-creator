# 视频产出大功能 · 设计 SPEC(竖版 + 富动画构图 + 预览 + 朝向必填 + 素材真用上)

> 日期:2026-07-13 · 状态:设计定稿(用户已拍板 5 块方向)· 对应 BACKLOG:T-290/291/292/293/294(+ 新增 T-295)
> 定位对照([docs/产品定位.md](../../产品定位.md)):本 SPEC 不改数据归属、不引新服务/新架构,是既有视频管线(production-workbench → video.decisions → exec.video.render → HyperFrames)之内的**功能补全 + 质量修复**。宪法张力仅一处:朝向由"建议"改"必填"(§5),SPEC 内说明理由。**故无需 spec-review 架构 gate**;仍走「写 SPEC → 拆 Task 进 BACKLOG → 从看板开工」。

## 0. 背景与目标

用户在打包桌面版真机连续测试视频产出,反馈 5 件事,选择「四个一起当一个大功能做」+ 追加素材问题:

1. **动画有点简单**——成片只有"整块淡入弹出",无进度式揭示/专属隐喻。
2. **我的脸没在框框里**——口播人脸被裁出画面。
3. **要支持竖版**——抖音 9:16,横竖版都要;有专门的 `video-editing` skill 要集成。
4. **成片要能在产出框预览**。
5. **立项的横版/竖版字段改必填**。
6. **(追加)上传的素材一个都没被用上**——截图/录屏 B-roll 全没进成片。

**根因已定位(见各节)**,统一到一份 SPEC。核心资产:`video-editing` skill(`~/.skills-manager/skills/video-editing/`)的构图规则 + 富动画方法论,要真正接进 executor 合成模板 + video.decisions 的 AI 提示。

## 1. 竖版产出(T-290)

### 现状
- delivery 尺寸硬编码:`frontend/src/features/production/assemble-video-render-props.ts:166` `delivery:{width:1920,height:1080,fps:30}`。`AssembleOptions`(:33-42)无 orientation 入口。
- 契约 `contract/src/resources/video-render.ts:25-31` `videoRenderDelivery{width,height,fps}` 是自由 int → **竖版不需改契约**,传对值即可。
- executor(`backend/src/modules/execution/video-render/executor.ts:257`)CLI 只传 `--fps`,**不传分辨率**;真实尺寸由合成模板 `#root[data-width][data-height]` + `html,body{width;height}`(`template.ts:560-564`)决定。
- orientation 存 `projectBriefDetail.orientation`(`contract/src/resources/projects.ts:42,49`,jsonb 内,无独立列),写入 `new-project-dialog.tsx:226`,读投影已在 `cover-runner.ts:149-174`(封面按 orientation 切 9:16/16:9,同款映射可参考)。
- **从 project 读进渲染 props 的通路当前完全不存在**:制作页 `production/page.tsx` 的 `resolveProject` 只投影 `{id,title}`。

### 改造
1. `assemble-video-render-props.ts`:`AssembleOptions` 加 `orientation?: "portrait"|"landscape"`;`:166` delivery 按 orientation 派生(portrait→`{1080,1920}` / landscape→`{1920,1080}`,fps 30 不变)。默认 landscape(兜底,不破坏存量)。
2. `production/page.tsx`:`resolveProject`/`listProjects` 投影补 `briefDetail.orientation`,透传 `ProductionWorkbench`。
3. `production-workbench.tsx:178-214` props 加 `orientation` → 传 `VideoDecisionPreview`。
4. `video-decision-preview.tsx:249-254` 组装调用把 orientation 塞进 opts。
5. **`template.ts` 竖版布局分支(真正的工作量)**:现有布局常量(`TH_RIGHT/TH_PIP/CONTENT_X/Y/PIP_SAFE_*/rightEdge`)全按 1920×1080 写死(`template.ts:79` 注释"v1 固定")。加 portrait 布局分支:口播头、信息卡区、B-roll 框、进度条按 1080×1920 重排(口播头竖版可上半屏大图 / 卡片下半屏纵向流;PiP 圆形位置随之调)。以 `video-editing` skill 的竖屏为**默认取向**(见 §7)。

### 风险
- 竖版核心不是换 delivery 数字,是 template 布局分支;否则尺寸对了元素全溢出。
- 重建 codegraph:`assembleVideoRenderProps`。

## 2. 构图修复:口播人脸进框(T-291)

### 根因(精确)
`template.ts:383` 口播 `<video>` = `object-fit:cover; object-position:center 20%`。`cover` 把源裁切填满目标框:圆形 PiP 286×286 正方形 cover 竖屏源(9:16)裁掉上下大半;`object-position:center 20%` 是**全局写死的猜测补偿**,不做人脸检测,脸偏下/构图不居中就出框。右侧卡 500×804 对竖屏源也横向裁。**与 skill 铁律"不随意拉伸/裁切口播画面"直接冲突。**

### 改造(方案 A,最小且合 skill)
- `template.ts:383` 口播头改 `object-fit:contain`(完整不裁),配深色底(`background:#08090a`,同 broll)补边;必要时加同源模糊背景层延展补黑边(可选增强,先上 contain)。
- 圆形 PiP 对竖屏源尤其严重 → 优先 contain。若 contain 后 PiP 圆形留黑边影响观感,PiP 形态可在竖版下改为圆角矩形(保口播完整 > 圆形美观)。
- (可选后续,不阻塞)方案 B:决策层出 `talkingHead.facePosition`/竖版 focal,契约+组装器+模板三处打通——**本期不做**,contain 已根治裁脸。

### 风险
- 低。contain 后有黑边是可接受代价(完整 > 填满);skill 明确"不裁 > 无边"。

## 3. 富动画接入(T-295,治"动画简单")

### 现状(动画是死代码路径)
- 当前 GSAP 词汇只有 `appear`(`template.ts:117-123`)= `autoAlpha:0→1 + y位移 + scale:1.04→1`,即**整块淡入弹出**——正是 skill `animation-ideation.md` 判为"偷懒"的形态。
- `special` 预设(`renderSpecial` :226-331:pipeline 节点错峰+连接线生长 / comparison 左右滑入 / steps 逐条点亮)**存在但是死代码**:`decideScenes`(`video-decisions-runner.ts:256-261`)只回 title/startSec/endSec/summary,**从不产出 `special`** → 富动画从不触发。
- 决策层**没有动画/构图意图产出**:动画形态完全由 template.ts 确定性规则硬编码,AI 不参与"哪句配对比条、哪句配数字递增、哪句配隐喻"。

### 改造(决策层出动画意图 + template 实现配方)
1. **决策层加动画意图**(二选一,推荐 b):
   - a. 让 `decideScenes` 产出 `special`(pipeline/comparison/steps),接 `buildScenesDecisionSchema`;
   - b. **给 card 增 `motion` 枚举**(`bar|counter|metaphor|strike|reveal|plain`),`decideCards` 按 `animation-ideation.md` 5 问产出(见 §7 映射表)。推荐 b:粒度到卡、覆盖面广、隐喻/计数/对比条都能表达。
2. `ai-worker/src/prompt/templates/video-decisions.ts`:video.cards(:85-112)prompt 补动画意图产出规则(5 问 → motion 枚举)+ 构图约束("口播是主体不拉伸、素材 contain 完整、一个 beat 一个强视觉不堆叠");video.scenes(:47-70)补节奏留白约束。
3. `contract/src/resources/video-render.ts`:card schema 加 `motion` 枚举字段(默认 `plain` 向后兼容);`video-decisions.ts` output schema + runner `buildCardsDecisionSchema` refine 同步。
4. `template.ts`:把 `animation-ideation.md` 的已验证 GSAP 配方逐条落成生成器分支(见 §7):对比条形图生长、数字递增计数器(`{val:0}` onUpdate)、崩塌隐喻(砖墙 stagger)、"建立→推翻"划掉(比 chip+红线更足)、进度式揭示替换整块 appear。`renderCard`/`appear`/`renderSpecial` 按 motion 分派。
5. **一个 beat 一个强视觉**:节奏约束进 prompt(别三秒堆两大动画;情绪句留白)。

### 风险
- **契约改动**:props schema + output schema + runner refine;跨模型稳定性重测(MiniMax 必须能出 motion 枚举——本仓已全 runStructuredNode,风险可控)。
- 模板动画需真机渲染验证(hyperframes lint + 出片),非单测可覆盖。
- 重建 codegraph:`generateVideoRenderHtml`/`renderCard`/`decideCards` + card output schema。

## 4. 成片预览(T-292)

### 现状
- 产出区只列文件清单无播放器:`execution-task-card.tsx:249-317`(awaiting_confirmation 列 artifacts 文件名)、:344-348(succeeded 只显"✓已采纳")。
- final.mp4 **采纳后**才经 `createGeneratedAsset` 入库拿到 `adoptedAssetIds[0]`(assetId)→ 才有签名 URL(`production-workbench.tsx:626-637`)。沙箱 artifact path 不可直接播。
- 现成可复用:`asset-live-preview.tsx:73-82` 已对 `type==="video"` 渲 `<video controls>`(用 `resolveAssetPreviewUrl`,`asset-preview-url.ts:34`,带 TTL 缓存/并发合流)。

### 改造
- `execution-task-card.tsx:344-348`(succeeded 态)或 `production-workbench.tsx:983-1004`(④ section,status ready 且有 resultAssetId):拿 `adoptedAssetIds[0]` → `resolveAssetPreviewUrl` → 复用 `AssetLivePreview` 或 `<video controls>` 内联播放。
- 走"采纳→播 adopted asset"路径,绕开沙箱预览(当前无 artifact 临时签名 route,本期不造)。

### 风险
- 低,无契约改动。final.mp4 几十~几百 MB,executor 转码已带 `+faststart`(`executor.ts:527`,moov 前置)利于边下边播。

## 5. 朝向必填(T-293)

### 现状
- 表单 orientation 有默认非强制:`new-project-form.tsx:118` `EMPTY_DEFAULTS.orientation="portrait"`(预选竖版);`canCreate`(:155)只校验 name → 从不拦 orientation。
- 契约 `projects.ts:49` `orientation: projectOrientation.optional()`(在 briefDetail 内)。
- brief gate(`brief-workbench.tsx:97`)当前明确把 orientation 排除在 REQUIRED 外("画幅非必填,建议")。

### 改造("去默认强制选",**只在 create 入口强制,briefDetail 保持 optional**)
1. `new-project-form.tsx:51` `NewProjectFormValues.orientation` 改 `""|"portrait"|"landscape"`(未选态);`:118` `EMPTY_DEFAULTS.orientation=""`(去预选)。
2. `:155` `canCreate` 加 `&& values.orientation!==""`;`OrientationSelector`(:446-480)支持未选态 + 必填标记 `*`(仿 :270)。
3. **契约:不动 `projectBriefDetail.orientation` 的 optional**(否则存量裸 `{}` brief parse 全炸,`projects.ts:65` `default(()=>parse({}))` 依赖字段可空);必填只在**新建 create body schema**层强制(或纯前端表单门)。
4. 同步更新 `new-project-form.test.tsx`(组件注释 :7-24 锁了字段顺序/校验契约)。

### 风险 / 宪法张力
- 改必填是产品定调翻转(`brief-workbench.tsx:97`、`projects.service.ts:389` 原注"非必填,建议")。SPEC 定调:**横/竖版是渲染布局的前置决策,缺了没法正确出片 → 刻意收紧为 create 必填**。存量项目不受影响(briefDetail 仍 optional,老项目读取不炸)。
- 重建 codegraph:`NewProjectFormValues`。

## 6. 素材真被用上(T-294)—— 制作页素材区 + 生成即重决策

### 根因(实锤,时序 + 流程,非过滤逻辑)
- **B-roll 用哪些素材在 `video.decisions` 那一刻一次性冻结。** 实测该项目决策跑在 16:30,用户 5 个录屏素材 16:42 才上传(决策后 12 分钟)→ 决策时清单只有口播视频这 1 项(步骤流实证「③B-roll 匹配:0 条(清单 1 项)」)→ AI 正确没拿口播当 B-roll → `broll:[]`。
- **"重新生成"只重渲染不重决策**:`onConfirmDecisions`(`production-workbench.tsx:516-595`)直接拿冻结的 `payload.renderProps` 建 render 任务,**不重跑 video.decisions**;恢复路径(:443-468)读已存候选,复用冻结 inventory 快照。→ 素材加了也进不来。
- **制作页无 B-roll 素材区**:只有 ②上传粗剪+SRT(role=clip/reference,stage=production);用户素材走稿面链(stage=script role=reference)。
- **listBrollInventory 不筛 stage**(`persistence-client.ts:3562-3566`,按 projectId 取全部 materialLinks)→ stage=script 素材理论上能进,**前提是决策重跑一次**。
- **既有隐患**:`listBrollInventory` 只筛 assetType 不筛 role(:3553)→ 粗剪口播原片(role=clip,type=video)会被当 B-roll 候选喂给 AI → 可能把口播原片自己当空镜插入。

### 改造

**A. 制作页 B-roll 素材区(列当前素材 + 补传 + 剔除)**
1. `production-workbench.tsx` 在 ②上传 与 ③AI 分场决策 之间新增 section:
   - 列素材:`client.listMaterialLinks({projectId})` 过滤 `entityType==="asset"` 且 role∈B-roll(见下),经 `resolveAssetPreviewUrl` 显缩略(复用 `AssetThumbnail`/`AssetLivePreview`)。
   - 补传:复用 `uploadProductionAsset`(:126),`role` 传 `"broll"`(`material-links.ts:15` role 自由 string,**无需改契约枚举**),stage 传 `production`。
   - 剔除:需 `deleteMaterialLink` op——**先查 `contract/src/operations/material-links.ts` 是否已有 delete;无则补一条 op(契约改动)**。
   - 补传 UI 让用户填一句描述 → 落 asset.description(`libraryFacet` `video-decisions-runner.ts:212-221` 把 label+description 喂 prompt,描述直接决定 AI 匹配质量)。

**B. 生成即重决策(从复用冻结决策 → 每次读当前素材重跑 video.decisions + 渲染)**
1. `onConfirmDecisions`(:516-595)/ 新增"重新生成(读最新素材)"入口:改为**先重新 dispatch `video.decisions`**(`dispatchDecisions` :420,runner 内 `listBrollInventory` :500 每次实时读)而非直接用冻结 `renderProps`;等新候选回来再组装渲染。
2. 恢复路径(:684-691):awaiting_confirmation 候选恢复时给"素材已变,重新决策"选项,而非静默复用冻结候选。
3. 重决策前先 discard 在途旧 render(`renderTaskId`),避免双任务。

**C. inventory 排除 role=clip(既有隐患修复)**
- `persistence-client.ts:3545-3584` `listBrollInventory`:过滤 materialLinks 时排除 `role==="clip"`(粗剪口播原片不当 B-roll);整库回退分支(:3576)也应仅取真 B-roll 素材(排除已知口播 clip asset)。

### 风险
- 契约改动:可能补 `deleteMaterialLink` op;role="broll" 不需改枚举。
- 重建 codegraph:`runVideoDecisions`/`listBrollInventory`/`onConfirmDecisions` + materialLinks op(若加 delete)。

## 7. video-editing skill 方法论(接入依据)

来源 `~/.skills-manager/skills/video-editing/`(SKILL.md + references/animation-ideation.md + references/hyperframes-pipeline.md)。

### 构图规则(→ template.ts 约束 + video.cards/scenes prompt)
1. 口播主体绝不拉伸/裁切(先用背景/遮罩/构图/PiP 解决)→ 治 §2 `template.ts:383` cover。
2. 用户素材一律 `object-fit:contain` 完整展示,绝不 cover;遮敏感用不透明遮罩块不靠裁 → template broll(:507)/image(:219)已合规,口播头违规。
3. 录屏/演示给足尺寸和时长,不缩窗/不秒闪 → 竖版布局给 B-roll 足够大框。
4. 圆形 PiP + 竖屏布局为默认取向 → §1 portrait 分支。
5. 视频必须是 clip(带 id/data-start/track),不能套进另一带 data-start 的 div(否则冻成静帧);图片可套 → template 已遵守(:505)。
6. 背景图用 `<img>` 图层,别用 CSS `background:url()`(逐帧渲染不捕获 CSS 背景图)→ 未来加背景图注意。
7. 字体 `Inter, sans-serif` generic 兜底,别具名中文字体 → template:560 已合规。

### 富动画方法论(→ video.cards prompt + template GSAP 配方)
**三原则**:① Show don't tell(能画就别只配字幕);② 进度式揭示(一节一节出现,整块淡入弹出=偷懒);③ 专属隐喻拒绝通用模板。

**5 问 → motion 映射(枚举 card.motion)**:
| 命中 | motion | 动画 |
|---|---|---|
| 前后/多少/快慢对比 | `bar` | 对比条形图(条从 0 生长 + 标签依次显) |
| 数字/规模/速度 | `counter` | 数字递增计数器 |
| 抽象概念可具象 | `metaphor` | 视觉隐喻(墙崩/门开/链条/流水线/灯泡/阶梯) |
| 列举/步骤/接力 | `reveal` | 依次点亮的流程图/清单 |
| 建立后否定/推翻 | `strike` | "建立→推翻"划掉(图标先亮起像要用,再被划掉/碎裂/盖红戳,比 chip+红线足) |
| 其它/纯陈述 | `plain` | 进度式揭示的统帅卡(非整块淡入) |

**已验证 GSAP 配方**(逐条落 template 分支):
- 条形图:条 `transformOrigin:"left center"` + `fromTo({scaleX:0},{scaleX:1,dur:.7-.9,power2.out})` 依次;标签条长完 `fromTo(autoAlpha:0,x:-10→)`;结论句 `back.out(1.5)`。
- 流程/接力:N 节点纵向 `fromTo(autoAlpha:0,x:-30→0)` 错峰 0.7s;箭头 `scaleY:0→1,transformOrigin:"top center"`。
- 崩塌:砖 div flex-wrap 成墙,先砌 `stagger:.02`,关键词再崩 `to({y:780,rotation:"random(-45,45)",autoAlpha:0,stagger:{each:.05,from:"random"}})`。**高潮隐喻不配音效**。
- 划掉:图标先"亮起像要用"再整体划掉/碎裂/盖红戳;要"建立→推翻"张力,不是直接划一条线。
- 数字递增:`{val:0}` GSAP `to({val:target,onUpdate})`;或大字 `scale:.9→1,back.out` + 单位后缀延迟出现。

**节奏留白**:一个 beat 一个强视觉,别三秒堆两大动画;情绪句/重要陈述留白不堆元素、不配吵音效。
**自检**:这动画只能配这句吗?能套任何句=太通用重做;它是"长出来"还是"弹出来"?后者改进度式。

## 8. 契约改动汇总
- `contract/src/resources/video-render.ts`:card schema 加 `motion` 枚举(默认 plain,§3)。**不改** delivery(自由 int 已够竖版)。
- `contract/src/operations/material-links.ts`:若无 delete op 则补 `deleteMaterialLink`(§6-A)。
- `contract/src/resources/projects.ts`:**不动** briefDetail.orientation optional(§5,存量兼容);必填只在 create 入口。
- output schema:`video-decisions.ts` 的 cards output + runner `buildCardsDecisionSchema` 同步 motion(§3)。

## 9. 切片 → 任务映射(拆进 BACKLOG)
| 任务 | 切片 | 依赖 | 大小 | 触及主文件 |
|---|---|---|---|---|
| T-293 | 朝向必填(create 入口) | 无 | 小 | new-project-form.tsx |
| T-290 | 竖版 delivery + template portrait 布局分支 | orientation 可读 | 中 | assemble-video-render-props.ts / production 链 / template.ts |
| T-291 | 口播 contain 进框 | 无 | 小 | template.ts:383 |
| T-295 | 富动画:决策层 motion 意图 + template GSAP 配方 + prompt | 契约 motion | 大 | video-decisions.ts / video-render.ts / runner / template.ts |
| T-292 | 成片 `<video>` 预览 | 无 | 小 | execution-task-card.tsx / production-workbench.tsx |
| T-294 | B-roll 素材区 + 生成即重决策 + 排除 role=clip | (可选)deleteMaterialLink op | 中 | production-workbench.tsx / persistence-client.ts |

**文件重叠**:template.ts(T-290/291/295)、production-workbench.tsx(T-290/292/294)高度重叠 → 因安全约束**禁 worktree 并行**,重叠切片**串行**做(按上表顺序:先小而独立的 T-293/T-291/T-292,再 T-290 布局,再大的 T-295,最后 T-294 流程);或按文件归组由同一 agent 连做。

## 10. 验证方案(真机纪律)
- 每切片改服务端/模板/skill 代码后**必须重启 sidecar + dev preview 走真实路径**(单测过≠live 生效,pitfalls §验证纪律)。
- 视频出片类(T-290/291/295)**必须真机渲染出 final.mp4 验收**(hyperframes lint + 实际播放看口播进框/竖版尺寸/动画形态),不靠单测。
- T-294 验证:上传素材 → 点生成 → 步骤流「B-roll 匹配:N 条(清单 M 项)」M>1 且成片真用上素材。
- T-292 验证:采纳后产出区能播 final.mp4。
- 全绿门:backend / frontend / ai-worker 三仓测 + tsc clean。
- 任务边界:BACKLOG 更新 + commit + `codegraph index --force` 重建(用 §各节"重建符号"query 验证)。
