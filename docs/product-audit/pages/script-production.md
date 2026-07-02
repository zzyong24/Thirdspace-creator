# 产品审计 · 脚本 + 制作阶段页

> 审计日期 2026-07-02 · 审计人:页面组 subagent(脚本+制作)
> 方法:宪法对照 + 代码链路(file:line)+ 真机只读验证(dev :3000,curl dispatch / 页面 HTML)。
> 每个结论带证据;未验证的显式标注。**未做任何写操作**(未点采纳/未建实体/未触发 AI 任务)。

---

## 一、/projects/[id]/script(脚本工作台)

### 1.1 功能定位

七步流水线第 4 步「脚本」的工作台:TipTap 富文本编辑器(写/改脚本正文)+ 版本记录(横条)+ AI 分镜脚本节点(script.draft,采纳门)+ 右栏「大纲结构 / AI 写作建议 / 金句」。上游接策划的结构方案(SEAM-02:content_outline → 大纲),下游脚本分镜流入制作页提词(SEAM-03)。定位本身合宪(§4 七步、§5 AI 只产候选)。

入口:`frontend/src/app/(creator)/projects/[projectId]/script/page.tsx`
页面:`frontend/src/features/script/script-workspace-page.tsx`
读侧:`frontend/src/features/script/script-editor-data.ts`
fixture:`frontend/src/fixtures/selectors/script.ts`

### 1.2 区块与交互清单

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| 页签条(大纲/正文/金句卡片/脚本模式/AI 改写/版本记录,6 个) | 点击只切换高亮 | PageTabs(Radix Tabs)无 TabsContent、页面未接 onValueChange(page-tabs.tsx:36-66;script-workspace-page.tsx:180-196) | **dead(纯视觉)**,真机证实 6 个 data-tab-id 渲染 |
| 工具栏 加粗/斜体/删除线 | TipTap toggleBold 等,aria-pressed 反映真选区 | script-rich-editor.tsx:63-85 | works(本地编辑真) |
| 工具栏 标题 H1/H2/H3 | toggleHeading | script-rich-editor.tsx:97-119 | works |
| 工具栏 列表/引用 | toggleBulletList/OrderedList/Blockquote | script-rich-editor.tsx:128-147 | works |
| 保存按钮 | getHTML→htmlToSections→`artifacts.versions.create`→router.refresh | script-rich-editor.tsx:235-275 | **works 仅当 artifactId 非 null;artifactId=null 时只翻本地「已保存」状态,什么都没存**(rich-editor.tsx:239-242) |
| 版本卡「恢复」 | `artifacts.restore`(append-only 克隆)→refresh | script-version-restore.tsx:28-41 | works(仅 artifactId 非 null 时渲染) |
| AI 分镜脚本卡「帮我写分镜脚本」 | AdoptCandidateCard:`ai.tasks.create`(script.draft)→轮询 `ai.tasks.get`→`ai.tasks.results.list`→采纳 `ai.tasks.confirm` | script-draft-island.tsx:68-91;adopt-candidate-card.tsx:4-26 | works(AI 底座真:ai.tasks.list 共 190 条任务)——**但仅在 vm.scriptArtifactId 非 null 时渲染**(workspace-page.tsx:157-163) |
| 右栏三卡(大纲/AI 建议/金句) | 只读展示 | 见数据来源表 | 展示,无交互 |

### 1.3 数据来源(四桶)

| 数据 | 来源链 | 桶 |
|---|---|---|
| 编辑器初值 | route→loadScriptEditorData(artifactId)→`artifacts.get`+`artifacts.versions.list`→contentData.html 优先/sections 拼 | **real**(前提:artifactId 解析成功且 DB 有版本) |
| 编辑器初值(fallback) | buildScriptViewModel→buildSections **硬过滤 `av-ainativebrowser-output-script`,无视 projectId**(selectors/script.ts:127-141) | **fixture(跨项目泄漏)** |
| 版本记录 | versionsOverride=真 `artifacts.versions.list`;null 时 fixture buildVersions **硬过滤 `artifact-ainativebrowser-*`**(script.ts:202-219) | real / **fixture 泄漏** |
| 大纲 | SEAM-02 优先:`artifacts.list`(projectId)找 content_outline→当前版本 sections(editor-data.ts:291-334);否则真脚本 sections 派生;都无→fixture 7 条 SCRIPT_OUTLINE_FALLBACK(script.ts:48-56) | real / fixture |
| AI 写作建议 | scriptData 非 null→诚实空态「点上方生成」(data-empty=guide);否则 buildAISuggestions **硬编码 3 条 Arc/Dia/Sigma OS 文案**(script.ts:165-188) | planned(诚实)/ **hardcoded** |
| 金句 | 真:当前版本 emphasis/golden_quote 段;fixture:**全库 golden_quote 段无视项目**(script.ts:190-200) | real / fixture 泄漏 |
| scriptArtifactId(一切真读写的钥匙) | **只从前端 canonicalDataset 解析**(script.ts:117-125),不查 DB | **fixture** |
| topic(喂 script.draft) | vm.topic = canonical project.title | fixture |

### 1.4 数据流向(写路径)

- 保存 → `artifacts.versions.create` body `{contentText, contentData:{html,sections}, changeSummary:"编辑脚本"}` → artifact_versions 表(append-only)。
- 恢复 → `artifacts.restore {versionId}` → 克隆成新当前版本。
- AI 采纳 → `ai.tasks.confirm` → ai.service 的 artifact_version confirm 分支 append 新版本(createdByType:"ai")。
- 保存在途竞态有两道防护(savePendingRef + lastSavedHtmlRef,rich-editor.tsx:198-227)——设计良好。

### 1.5 设计不合理

1. **【高】6 页签全是死的**:「脚本模式」「AI 改写」「金句卡片」没有任何对应内容/面板;AI 改写(script.rewrite)实际入口在全局 Copilot(features/copilot/ai-copilot-content.tsx),页签是幌子。用户点了没反应=「怪」的直接来源。
2. **【高】真实项目的编辑器是「假编辑器」**:DB-only 项目(全部 46 个 dy-proj、运行时新建项目)scriptArtifactId=null → 保存不落库、无 AI 分镜入口、无版本恢复。页面看起来能编辑,实则黑洞。
3. **【中】金句标注无 affordance**:金句判定=「整段被 strong 包裹」(bridge.ts:198-201),但工具栏没有「标为金句」按钮,空态文案「把想强调的句子标为金句段」没告诉用户怎么标。
4. **【低】页面组件顶部文档注释严重过期**(说「four locked tabs 主脚本/章节/引用/摘要」「no actual rich-text editor framework (D-008)」,实际 6 tabs + TipTap 已接,workspace-page.tsx:6-23)。

### 1.6 疑似 bug

| # | 描述 | 证据 | 严重度 |
|---|---|---|---|
| S1 | **fixture 跨项目泄漏**:任何 canonical 项目(如 project-podcast-launch)无自有脚本时,编辑器显示 ai-native-browser 的脚本正文、版本条显示它的「主脚本·v/分镜脚本·v」、AI 建议显示 Arc/Dia/Sigma OS 硬编码文案 | curl `/projects/project-podcast-launch/script`:4×"AI Native Browser"、3×"Arc / Dia / Sigma OS"、2×"主脚本 · v"、2×"分镜脚本 · v"、2×"在开场加入「完播率」承诺";根因 selectors/script.ts:127-141/165-188/202-219 硬过滤/硬编码 | high |
| S2 | **DB 里的真脚本在脚本页不可见**:dy-proj-00 在 DB 有 dy-art-00-script(master_script,真口播稿)但页面 artifactId 走 fixture 解析→null | curl `artifacts.list dy-proj-00` 后端有该 artifact(经 dy-art-00-script 确认存在于 douyin-real.ts:14 且 DB 返回其它项目正常);curl 页面无「帮我写分镜脚本」、无脚本内容、2×"暂无版本记录";根因 script.ts:117-125 只查 canonicalDataset | high |
| S3 | **人工保存永久丢分镜时间码**:htmlToSections 输出无 startSeconds/endSeconds(bridge.ts:160-167),与 bridge.ts:143「时间码真值仍留在 sections」注释矛盾;AI 初稿的时间码在首次人工保存后从 contentData.sections 消失→制作页提词时间戳变空 | 代码链路(未跑写操作验证,标:代码级确认/运行级未验证) | medium |
| S4 | 保存时 section id 按 index 重排(`script-section-${n}`),制作页 SEAM-04 章节溯源存的 scriptSectionId 跨保存失效 | bridge.ts:160-163;interactive-region.tsx:991-1006 | low |

---

## 二、/projects/[id]/production(制作工作台)

### 2.1 功能定位

第 5 步「制作」:制作模式选择(真人口播/知识演示/AI 数字人)+ L5 录制工作台三区(AI 素材清单 material.match / 上传绑定 / AI 生成 asset.generate)+ 录制脚本提词(SEAM-03)+ 素材库(已配素材)+ 预览(规划中)+ 录制/字幕/导出设置 + 时间线(章节结构)。「只产文案+结构+管素材,不做剪辑」的定位与宪法 §8 一致,预览/导出/剪辑均诚实标规划中真禁用。

入口:`.../production/page.tsx`;页面壳 `production-workspace-page.tsx`;读侧 `production-workspace-data.ts`;交互岛 `production-interactive-region.tsx` + 三个子岛。

### 2.2 区块与交互清单

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| 模式卡 真人口播/知识演示 | 本地高亮 + `outputs.production.put {productionMode}` → refresh | interactive-region.tsx:220-235 | **写 works,读 broken**:selector 不读 viewModel.mode,刷新后永远回高亮第一张卡(见 P3) |
| 模式卡 AI 数字人 | 禁用 | 「规划中 · 敬请期待」徽标(interactive-region.tsx:295-304) | planned(诚实) |
| AI 素材清单「帮我配素材」 | AdoptCandidateCard→material.match→采纳建 materialLinks | material-match-island.tsx:71-94 | works(需 wiring;topic 入参有 P6 问题) |
| 上传素材 dropzone | `assets.uploads.create`→PUT presigned→`assets.uploads.complete`→`materialLinks.create`(上传即绑定)→refresh | upload-dropzone.tsx:62-132 | works(需 wiring;canBind=false 时诚实禁用) |
| AI 生成素材(文生图/视频) | 表单(kind/prompt/画幅)→AdoptCandidateCard→asset.generate | asset-generate-island.tsx:119-345 | **诚实禁用中**:settings.models.list 无 image.generate/video.generate 配置(curl 证实)→渲染「未配置文生图模型 + 去设置」(asset-generate-unconfigured 真机在 HTML 中) |
| 「脚本编辑」链接 | 跳 `/projects/[id]/script` | interactive-region.tsx:333,357-365 | works(路由) |
| 素材分类 tabs(B-roll/图片/视频/音频/配乐/片头片尾) | 本地过滤缩略图 | interactive-region.tsx:419-429 | **半假**:b-roll/score/bumper 的 id 永不匹配 asset.type,「无匹配显示全部」兜底让过滤形同虚设 |
| 预览 播放/暂停/重置 | 真禁用 | title「实时预览规划中」(interactive-region.tsx:652-665) | planned(诚实,合宪 §8) |
| 设置开关 rec-overlay / sub-ai-generate | 本地翻转 + `outputs.production.put {recordingConfig/subtitleConfig}` | interactive-region.tsx:699-816 | **写 works,读 broken**(见 P4) |
| 其它设置值(摄像头/麦克风/字号…) | 只读,标「示例」徽标 | interactive-region.tsx:828-837 | hardcoded(已诚实标注) |
| 设备检测 / 预览字幕效果 | 非交互「(规划中)」文本 | interactive-region.tsx:752-760 | planned(诚实) |
| 导出视频按钮 | 真禁用 + 「规划中」徽标 + 说明文案 | interactive-region.tsx:842-869 | planned(诚实,原假导出流程已移除) |
| 时间线 添加章节 / 添加新片段 | 本地 append + `productions.segments.create`(带 SEAM-04 scriptSectionId)→refresh | interactive-region.tsx:975-1011 | **写 works,读 broken**(见 P5);且空态无添加按钮(见 P9) |
| 时间线片段卡 | 本地选中高亮 | interactive-region.tsx:1042-1082 | works(纯本地) |

### 2.3 数据来源(四桶)

| 数据 | 来源链 | 桶 |
|---|---|---|
| production mode | `projects.outputs.list`→`outputs.production.get`(get-or-create)→productions 表 | **real(但 UI 不消费,见 P3)** |
| 已配素材 | `materialLinks.list(projectId)` 过滤 asset→`assets.get` | real |
| 素材库「全部」计数 | `assets.list` pageSize 500 计数 | real |
| 录制脚本行 | `artifacts.list`→script 类 artifact→当前版本 contentData.sections(workspace-data.ts:117-175) | real(**不回退 contentText**,douyin 脚本读不到,见 P11) |
| 多模态已配 | `settings.models.list` hasSecret 按 capability(page.tsx:117-135) | real(当前未配→诚实禁用) |
| output aspectRatio(AI 生成默认画幅) | `projects.outputs.list`.aspectRatio(dy-out-60 真值 "9:16") | real |
| preview 海报/时长 | canonical 项目→fixture「AI Native Browser 深度解析/00:12:00」;真项目→「暂无预览/00:00」(workspace-data.ts:367-369) | **fixture / 诚实占位** |
| 时间线 | canonical 项目→fixture 8 段(什么 AI/最佳契机…,selectors/production.ts:250-286);真项目→[] | **fixture / 空** |
| 素材缩略图(demo 兜底) | fixture 注入 7 个假素材(B-Roll 03-06/主封面图/配乐 01,production.ts:195-239)仅 materialLinks 读**失败**时用于 canonical 项目 | fixture |
| 设置三组值 | SETTING_GROUPS 硬编码(production.ts:48-86),VM 恒用 fixture(workspace-data.ts:371-372) | **hardcoded(UI 已标「示例」)** |
| 素材分类 taxonomy | ASSET_CATEGORIES 静态(production.ts:27-34) | hardcoded(静态分类,可接受) |

### 2.4 数据流向(写路径)

- 模式选择/设置开关 → `outputs.production.put` → productions 行(productionMode/recordingConfig/subtitleConfig)。**只写不读回**。
- 添加章节 → `productions.segments.create`(SEAM-04 按位置带 scriptSectionId)→ production_segments 表。**只写不读回**(后端 listSegments 服务存在:production.service.ts:174-176,前端无人调)。
- 上传 → uploads.create/complete → assets + asset_files;materialLinks.create → material_links(用料链)。读回 ✓(refresh 后已配素材重读)。
- AI 采纳(material.match / asset.generate)→ ai.tasks.confirm → material_links / assets。读回 ✓。
- **页面渲染即隐式写**:`outputs.production.get` 是 get-or-create(production.service.ts:137-140),浏览制作页会为 output 建 production 行(读页面产生写副作用)。

### 2.5 设计不合理

1. **【高】空态门把工作台整个吞掉(鸡生蛋死锁)**:`isEmpty = scriptLines&&assets&&timeline 全空` → 渲染「暂无制作内容」空态,而上传/AI 匹配/AI 生成/模式选择全部藏在 island 里(production-workspace-page.tsx:95-99,108-125)。一个新项目/douyin 项目想上传第一个素材,入口根本不出现。真机证实 dy-proj-60、dy-proj-00(有 output dy-out-60/dy-out-00、production 行也建了)都渲染 data-page-state="empty"。**当前没有任何一条真实项目路径能用到 L5 录制工作台。**
2. **【高】三个「写真读假」环**(模式/设置开关/章节):交互落库成功但 UI 永远显示 fixture 初值,用户操作被「吃掉」的观感=不可信。违反宪法 §5「阶段有明确交付物」的往返精神。
3. **【中】canonical 项目 fixture 泄漏**:podcast-launch 制作页显示「AI Native Browser 深度解析」预览海报、假时间线(什么 AI/最佳契机)、B-Roll 03 浏览器导航等假素材(curl 证实 3×海报文案、2×B-Roll 03、2×什么 AI)。isFixtureProject 判据 `fixtureVm.scenario!=="empty"` 把所有 canonical 项目当 demo(workspace-data.ts:299)。
4. **【中】制作模式三卡与宪法 §8「不分视频类型」存在张力**:真人口播/知识演示/AI 数字人 更像「视频类型」而非录制配置;映射的 productionMode(remote_recording/screen_capture/studio)里 studio 无任何卡对应。需产品裁决。
5. **【低】录制设置两行同名「摄像头」**(rec-camera 值行 + rec-overlay 开关行,production.ts:54,57)——rec-overlay 应叫「摄像头画中画/悬浮窗」。
6. **【低】AI 生成 initialPrompt 文案不实**:声称「已从分镜「画面」字段带入」,实际取 scriptLines[0].text = 口播正文(interactive-region.tsx:145;workspace-data.ts:160-166 body 优先)。

### 2.6 疑似 bug

| # | 描述 | 证据 | 严重度 |
|---|---|---|---|
| P1 | 空态门吞工作台(同 2.5-1,注册为 bug 因为它让 L5 全量功能对真实项目 100% 不可达) | curl dy-proj-60/dy-proj-00 production 页 data-page-state="empty"、无 recording-workbench/upload/AI 区;dy-out-60 存在(outputs.list 证实) | high |
| P2 | **首次加载竞态:录制工作台随机消失,刷新才出现**。路由 Promise.all 并发 resolveWiring + buildVM(page.tsx:150-156),两路同时对同一 output 跑 ensureProductionForOutput = SELECT-then-INSERT 无 onConflict(production.repository.ts:128-145)→ 后插者唯一约束异常 → resolveWiring catch → wiring=undefined → 工作台不渲染 | 真机复现:ai-native-browser 第一次渲染 recording-workbench=0(production 行不存在);dispatch `outputs.production.get` 建行(production-51fc2a8b-335, updatedAt 13:05)后再渲染 workbench=1、帮我配素材/AI 生成素材出现 | high |
| P3 | 持久化的 productionMode 不回显:ProductionModeSelector 只收 wiring 不收 mode,activeMode 恒= 第一张卡(interactive-region.tsx:205-214);VM 组装了真 mode(workspace-data.ts:353)无人消费。选「知识演示」→落库→刷新→高亮回「真人口播」 | 代码链路(运行级未验证——验证需写操作) | high |
| P4 | 设置开关不回读:初值取 fixture item.value==="开启"(interactive-region.tsx:731-739),VM settings 恒 fixture(workspace-data.ts:371-372);production.recordingConfig/subtitleConfig 落库值从不读回 | 代码链路;dy-out-00 production 行 recordingConfig:{} 而 UI 显示「开启」 | medium |
| P5 | 章节写真读假:createProductionSegment 落库,但 ProductionDataClient 无 listSegments,VM timeline 恒 fixture/空 → 刷新后消失 | workspace-data.ts:66-113(接口无 segments 读);production.service.ts:174-176 listSegments 后端在而前端未接 | medium |
| P6 | material.match 的 topic 对真实项目=「暂无预览」:topic={viewModel.preview.posterLabel}(interactive-region.tsx:162),真项目 posterLabel="暂无预览"(workspace-data.ts:369)→ AI 素材匹配拿垃圾主题 | 代码链路 | medium |
| P7 | canonical 项目 fixture 泄漏(同 2.5-3) | curl podcast-prod:3×「AI Native Browser 深度解析」2×「B-Roll 03 浏览器导航」2×「什么 AI」 | medium |
| P8 | 素材分类假过滤 + 空态无添加章节按钮 | interactive-region.tsx:426-429(fallback 显示全部);1024-1032(添加按钮在非空分支内) | low |
| P9 | readScriptLines 不回退 contentText:douyin 脚本(仅 contentText,如 dy-av-00-script)在制作页提词读不到;与脚本页读侧(sectionsFromVersion 有 contentText 回退,editor-data.ts:147-162)口径不一 | dy-av-00-script 真值确认只有 contentText+hook(douyin-real.ts);workspace-data.ts:150-152 只读 sections | medium |

### 2.7 与宪法对照

- ✓ §8 不做视频编辑器:预览/导出/剪辑真禁用标规划中;时间线只做章节结构。
- ✓ §5 AI 只产候选:material.match / asset.generate / script.draft 全走 AdoptCandidateCard 采纳门。
- ✓ 多模态用户可配:未配 hasSecret → 禁用 + 引导去设置(项目规则「绝不写死 MiniMax」遵守)。
- ✗ §7 数据底座「替换所有 mock/seed」:两页 fixture 泄漏(S1/P7)+ hardcoded 设置值,是「怪」的最大来源。
- ⚠ §8 不分视频类型:制作模式三卡需产品裁决(见 2.5-4)。
- ⚠ §5 前一阶段产物自动流入下一阶段:SEAM-02/03 有,但对 douyin/新建项目全断(S2/P9)。

---

## 三、跨页待对齐点(供全局对齐)

1. **artifactId 解析双轨**:脚本页走前端 fixture(canonicalDataset),制作页 readScriptLines 走 DB `artifacts.list` —— 同一项目两页看到的「脚本」可能完全不同(dy-proj-00:脚本页空、制作页理论可读)。应统一为 DB 解析。
2. **contentText 回退口径不一**:脚本页读侧回退 contentText,制作页不回退。
3. **同物多名**:「分镜脚本 / 主脚本 / 录制脚本 / 正文」四个名字指同一 artifact 家族;页签「正文」vs 卡片「主脚本」。
4. **「AI 改写」入口错位**:脚本页有页签,功能实际在 Copilot。
5. **AI 节点 topic 入参口径**:script.draft 用 project.title(fixture),material.match 用 preview.posterLabel(真项目=「暂无预览」)。应统一从项目/输出标题取。
6. **读页面产生写**:outputs.production.get 渲染即建行(get-or-create),与「确认门」精神有张力,且是 P2 竞态的温床。
7. **isEmpty/isFixtureProject 判据**:「canonical=demo 数据可展示」的假设已随 douyin 真数据接入失效,需要全站统一「demo 项目」白名单或删除 demo 泄漏路径。
