# 素材能力升级:真联网检索 + 自动化截图 + AI 生成素材

> SPEC 日期:2026-07-03 · 任务:T-084 · 状态:✅ PASS(2026-07-03 MiniMax 审,0 findings:考古有 commit 实锤、三通路合宪、无 scope reduction)——可开工
> 用户裁决(实录 2026-07-03):对话里让 AI 找素材,AI 自述「我对 XX 的具体结论没有可靠源…训练数据没覆盖…检索大概率给你的是(编造)」。裁决:① WebSearch 工具要给它;② 自动化截图、自动生成素材这些「在 Claude Code 都跑通了」的能力要支持进系统。多模态模型走 model-config 用户可配(项目铁律,绝不写死 MiniMax)。

## §0 第一性定位

素材搜集的唯一存在理由:**给正在写的这条内容供弹药**——弹药必须**真**(有来源可查证)或**诚实标注不真**(模型记忆、需核实)。当前 `material.gather` 工具描述宣称「真实搜集…带来源」([chat-tools.ts:707](../../../frontend/src/server/ai/chat-tools.ts)),执行却是纯 LLM 记忆生成 = **名实不符,系统性编造风险**。本 SPEC 把「素材从哪来」补成三条真通路:

1. **联网检索**:搜到的是互联网上真实存在的内容,URL 一等公民存证;
2. **自动化截图**:给 URL,服务端真开浏览器截图,落素材中心——截图 = 不可抵赖的真证据;
3. **AI 生成**:文生图/文生视频,明确标 `generated`(AI 素材不冒充真证据,video-asset-kit 决策逻辑同源)。

三条通路终点一致:**候选确认门 → 用户采纳 → 素材中心/知识库 + 用料链**(宪法原则 #3:AI 只产候选,人确认关键产物)。

## §0.5 设计依据(考古实锤 + 现状盘点,不造轮子调研)

### A. WebSearch 考古:当年有,分两步丢的

| 阶段 | commit | 状态 | 实锤 |
|---|---|---|---|
| S3 时代 | (Claude Agent SDK) | ✅ 有 —— gather runner 真 Claude + WebSearch | BACKLOG 历史 S3 行 |
| T-006 迁 Vercel SDK | `42baed7`(6-30) | ✅ 保留 —— `apiFormat==="anthropic"` 即挂 `anthropicWebSearchTools()`(@ai-sdk/anthropic 服务端内置 web_search),`runResearchNode({...tools})` 多步工具循环 | `git show 42baed7` research-runner.ts:42-75 |
| 第一刀:收窄 | `fb8d056`(7-01) | ⚠️ 只对**真 Anthropic**挂 —— 用户默认模型 MiniMax-M3 走 anthropic **兼容**端点(api.minimaxi.com/anthropic),不支持 web_search server tool,报 `invalid params (2013)` → task cancelled(「帮我搜素材」卡死根因) | commit fb8d056 diff:`isGenuineAnthropic` 判定 |
| 第二刀:摘除 | `ffb7951`(7-01,v2 结构化重写) | ❌ 彻底删 —— 改 `generateObject + outputSchema` 纯结构化生成,`tools: []`,**连真 Anthropic 也不再挂**;模板注释自述「web search 只真 Anthropic 可用,模型可配」 | [research-gather.ts:6-20,77](../../../ai-worker/src/prompt/templates/research-gather.ts);[research-runner.ts:10-20](../../../frontend/src/server/ai/research-runner.ts) 现行零 web search 引用 |

**现行编造链路**:chatbox `material.gather`([chat-tools.ts:705-712](../../../frontend/src/server/ai/chat-tools.ts))→ `deps.gatherMaterials`([chat-runner.ts:389-404](../../../frontend/src/server/ai/chat-runner.ts))→ `runResearchNode`(不传 tools)→ `runStructuredNode` 纯生成。模板已尽力自救(「宁缺毋滥,绝不编造数据或来源」「url 选填拿不准留空」),但模型记忆天花板决定了「实时/长尾内容 = 无米之炊」,这正是用户实录里 AI 自己承认的。

**残留资产**:`anthropicWebSearchTools()` 导出仍在(research-node.ts:58-70,注释「保留导出供未来真 Anthropic 路径选用」);**仓内无任何独立搜索 API 配置**(.env.example / env.local 无 Tavily/SERP/Exa/Brave/Bing key)。依赖版本:`ai@^7.0.4`、`@ai-sdk/anthropic@^4.0.1`、`@ai-sdk/openai-compatible@^3.0.1`。

### B. 多模态生成:链路已通九成,只缺对话工具一环

- **model-config 解析层已完整**:[multimodal/resolve.ts](../../../frontend/src/server/ai/multimodal/resolve.ts) 四 capability(`image.generate`/`video.generate`/`transcribe.audio`/`asset.classify`)+ 三层回退(DB row → `CREATOROS_IMAGE_*`/`CREATOROS_VIDEO_*` env → 诚实抛 `MultimodalConfigError`,**无免配兜底,不假装能生成**)。
- **生成工厂已实装**:ai-worker `multimodal-factory.ts` 统一契约 `GeneratedAsset{assetBytes}`;MiniMax 适配器(文生图同步 + 文生视频异步轮询)在 `multimodal-minimax.ts`;registry 按 provider 分派、可扩新 provider(persistence-client.ts:4221-4223 组装)。
- **生成→落库→候选已通**:[asset-generate-runner.ts:86-159](../../../frontend/src/server/ai/asset-generate-runner.ts) 生成字节 → `createGeneratedAsset`(backend [assets.service.ts:95-103](../../../backend/src/modules/assets/assets.service.ts) 服务端直写 ObjectStorage,local-fs/S3 双适配)→ `recordCandidate(resultType="generated_asset")` → AdoptCandidateCard 采纳门(现有消费方:制作页 asset-generate 岛,T-055f 钦点保留)。
- **唯一缺口**:chatbox 工具白名单 14 个工具([chat-tools.ts:648-876](../../../frontend/src/server/ai/chat-tools.ts))**无生图/生视频工具**——对话里说「给我生张图」无路可走。

### C. 截图:浏览器基建已有,通用截图能力没有

- [douyin-cdp.ts](../../../frontend/src/server/ingestion/douyin-cdp.ts) 已有完整 Playwright 封装:`launchPersistentContext(.auth/)` 持久登录态(576-590)、依赖注入 openContext(单测不碰真浏览器)、限流网关、UA/Referer 反爬处理——但职责是抖音 XHR 拦截采集,**无「给 URL 截图」的通用能力**。
- 仓外参照:video-asset-kit skill 的 `capture.py`(Playwright 连 :9222 常驻 Chrome 或无头 Chromium,慢导航防爬)——方法论可抄,实现须落仓内 TS(宪法铁律 #5 + memory 在案「别 shell video-asset-kit CLI」)。
- 落库通路现成:截图字节走同一个 `createGeneratedAsset`。

### D. 外部选项与取舍(联网检索怎么接)

| 方案 | 可用性 | 取舍 |
|---|---|---|
| provider 原生 server-side search(Anthropic web_search) | 仅真 Anthropic 官方端点;MiniMax/DeepSeek 兼容端点报 2013(fb8d056 实测) | **采**——用户真配 Claude 时白赚,但只能当增强不能当依赖 |
| 模型端工具循环(把 search 做成 client tool 让模型多步调) | 结构化节点 `generateObject` 无工具循环;回自由文本循环 = 重蹈「MiniMax 产不出可解析输出」覆辙(ffb7951 修掉的坑) | **弃**——不回工具循环 |
| **独立搜索 provider + 检索前置注入** | 搜索 API(博查/Tavily/SerpAPI/Brave 等)与模型解耦;先搜后把结果当 facet 注入 `generateObject` | **采(主路)**——任何模型可用,schema 约束保留,provider 用户可配(model-config 同表同款) |

**关键设计立场**:不把「检索」做成模型的工具,而做成**节点的前置步骤**——`search(query) → 结果注入 prompt facet → generateObject 综合`。这保住了 ffb7951 换来的「任何模型都产可解析输出」,又补回真实信源。

## §1 联网检索修复(T-084a)

### 1.1 SearchPort 抽象 + capability `web.search`

- **新 capability `web.search`**,复用 `model_configurations` 表(capability 在 contract 全线是自由字符串,零 schema/contract 改动——与 `transcribe.audio` 加入时同理)。provider 枚举首发:`bocha`(博查,中文内容优)/`tavily`/`serpapi`;`baseUrl`/`secretReference`/`secretValue` 语义同现行。设置页「联网搜索」卡与「素材归类模型」卡同款(T-055h① 先例)。
- **frontend 解析层**:`resolveSearchSpec(ctx)` 仿 `resolveMultimodalSpec` 三层回退(DB row → `CREATOROS_SEARCH_*` env → 抛 `SearchConfigError`);**无免配兜底,不假装能搜**。
- **ai-worker 执行层**:`searchWeb(spec, query): Promise<SearchResult[]>`,`SearchResult = { title, url, snippet, publishedAt?, siteName? }`;按 provider 分派 REST adapter(与 multimodal-factory 同款 registry 模式)。分层沿用既定切分:解析在 frontend、provider 调用在 ai-worker。

### 1.2 研究节点改「先检索后综合」两步

`runResearchNode` 加可选入参 `searchResults?: SearchResult[]`:

- 调用方(research-runner / chat-runner 的 `gatherMaterials`)先 `resolveSearchSpec` + `searchWeb(query)`(top N,N=8~10,超时 10s 失败降级);
- `research-gather` 模板升 v3:新增选填 facet `searchResults`(格式化为「【联网检索结果(真实,今日抓取)】编号+标题+URL+摘要」块),prompt 铁律改为:**「有检索结果时,cases/dataPoints 的 source 必须引用检索结果的真实 URL(带编号回链);检索结果之外的内容一律标『模型记忆,需核实』」**。`generateObject` 结构化输出不变,schema 加 `sourceUrl` 选填字段(hooks/quotes 不强制,cases/dataPoints 强烈要求)。
- **真 Anthropic 增强路**:`isGenuineAnthropic`(fb8d056 判定逻辑复活)且用户未配 `web.search` 时,可挂回 `anthropicWebSearchTools()`(导出还在)——作为兜底增强,不是主路;两者都配时独立搜索优先(结果可控、可存证)。

### 1.3 跨模型诚实降级(衔接 honestyBlock)

未配 `web.search` 且非真 Anthropic 时(= 今天的现状):

- `gatherMaterials` 不抛错,照常纯生成,但结果整体打标 `grounding: "model_memory"`(有检索则 `"web"`);
- ChatGatherCard 头部显式黄条:「⚠️ 未配置联网搜索——以下素材来自模型记忆,来源需自行核实。[去设置配联网搜索]」;每条无 sourceUrl 的素材徽标「需核实」;
- chat-runner `honestyBlock`([chat-runner.ts:237-246](../../../frontend/src/server/ai/chat-runner.ts))追加第 6 条:「素材搜集工具当前(未)配置联网检索——(未配时)你给出的素材来自训练记忆,必须主动告知用户不是实时检索结果,绝不假装搜过网」(按 resolveSearchSpec 探测结果注入对应措辞);
- `material.gather` 工具 description 改诚实:按是否配置动态措辞,去掉无条件的「真实搜集…带来源」。

### 1.4 检索结果→素材落库(来源一等公民)

- 复用既有 ChatGatherCard「存入弹药」采纳门(T-057④:knowledge.create + materialLink),**零新门**;
- 落库时 `sourceUrl` 写 `sourceMetadata.sourceUrl`、`source` 写 `web`(T-055g 来源链 `knowledgeSourceLabel` 已支持 sourceUrl 域名显示,自然接上);T-079 落地后对应 `source_note` 同写;
- 卡片上每条带可点的来源域名链接(新窗打开),用户采纳前可先查证——**采纳的是查证过的真素材,不是 AI 的转述**。

## §2 自动化截图(T-084b)

### 2.1 通用截图模块 `web-capture.ts`

新建 `frontend/src/server/ingestion/web-capture.ts`(与 douyin-cdp 平级,同款依赖注入范式):

- `captureUrl(url, opts): Promise<{ bytes, contentType, finalUrl, title }>`:Playwright chromium 无头 → `page.goto(url, waitUntil: "networkidle", timeout 20s)` → 全页或视口截图(opts.fullPage,默认视口)→ PNG 字节;
- 复用 douyin-cdp 的成熟做法:桌面 UA 头、慢速导航节奏;`openContext` 注入可测;
- **登录态**:首发只做公开页(干净无头 context);登录墙页面走 §4 未来(接 `.auth/` 持久 profile 需按站点管理,超出本期);
- **诚实报错边界**(逐类,不含糊):导航超时/DNS 失败 → 「页面打不开:<错误>」;HTTP 4xx/5xx → 带状态码报错;命中登录墙/验证码启发式(URL 重定向到 login、页面含验证码特征)→ 「该页面需要登录/有反爬验证,当前只支持公开页面」。错误原样进对话工具结果,模型如实转述(honestyBlock #5:做不到就直说)。

### 2.2 对话工具 `material.screenshot` + 落库

- chatbox 新工具 `material.screenshot`,inputSchema `{ url, fullPage? }`;白名单挂 project surface(与 material.gather 同 skill);
- execute:`captureUrl` → `createGeneratedAsset`(既有,assetType=image,name=「截图·<页面title>」,`mediaMetadata.sourceUrl=url` 来源存证)→ 返回 `{ kind: "material.screenshot", asset: { id, name, url预览, sourceUrl } }`;
- 前端 `ChatScreenshotCard`:缩略图 + 来源 URL + 「加入弹药」(= createMaterialLink 挂当前项目,复用 ChatMaterialListCard 同款按钮语义)。**注**:截图字节已真实产生,落 asset 不算 AI 写领域实体(与上传同性质的存储动作);「挂进这条内容用料链」才是判断,留给人点——与 asset-generate 候选门同界线。

## §3 AI 生成素材(T-084c)

### 3.1 对话工具 `material.generate`

- chatbox 新工具 `material.generate`,inputSchema `{ kind: "image" | "video", prompt, style? }`;
- execute **不直接生成**(视频异步轮询可达分钟级,不能阻塞对话回合):dispatch 既有 `asset.generate` task(persistence-client dispatch → `void runAssetGenerateTask`,live dispatch 范式,memory 在案)→ 立即返回 `{ kind: "material.generate", taskId, status: "queued" }`;
- 前端 `ChatGenerateCard`:显示任务进行中 → 轮询 task/candidate → 完成后渲缩略图 + 「采纳进素材库」= 既有 AdoptCandidateCard confirm 流(asset-generate-runner 的 candidate 采纳门原样复用);失败(含 `MultimodalConfigError` 未配模型)→ 卡内诚实显示「未配置生图/生视频模型,[去设置]」;
- **零新生成链**:model-config(用户可配,铁律)→ multimodal-factory → asset-generate-runner → candidate,全部既有;本切片只加「对话入口 + 卡片呈现」两件。
- 生成素材落库固定标 `origin: generated`(素材列表可辨「AI 生成」徽标)——AI 素材不冒充真证据(video-asset-kit 决策逻辑:AI 隐喻图点缀,真证据优先)。

### 3.2 工具描述的诚实措辞

description 写明「生成的是 AI 图/视频素材(非真实拍摄/截图);创作者采纳后进素材中心」;未配模型时工具仍在白名单(模型可如实告知用户「需要先去设置配生图模型」并给出路径),不静默消失也不假装能生成。

## §4 未来(本期不做)

登录墙页面截图(`.auth/` 按站点持久 profile 管理);检索结果整页存档(网页快照→知识库 reference);多轮检索(模型按首轮结果追加搜索);生成素材的参考图(i2i/i2v);搜索 provider 聚合与配额管理。

## §5 切片(可独立交付,一次从 0 到 1)

| 切片 | 内容 | 依赖 |
|---|---|---|
| **T-084a 联网检索修复** | capability `web.search` + resolveSearchSpec + ai-worker searchWeb(bocha/tavily/serpapi adapters)+ 设置页搜索卡 + research-gather v3(searchResults facet + sourceUrl schema)+ gatherMaterials 前置检索 + 真 Anthropic 增强路 + honestyBlock 动态第 6 条 + ChatGatherCard 来源链接/「需核实」徽标/未配黄条 | 无 |
| **T-084b 自动化截图** | web-capture.ts + material.screenshot 工具 + ChatScreenshotCard + 落 asset 带 sourceUrl + 三类诚实报错 | 无(与 a 并行) |
| **T-084c 生成素材对话化** | material.generate 工具(dispatch 既有 asset.generate task)+ ChatGenerateCard(轮询/采纳/未配引导)+ generated 徽标 | 无(与 a/b 并行) |

## §6 全局约束

- **模型/搜索 provider 全部用户可配**(model-config 同表同款),绝不写死任何厂商;不强依赖某厂商服务端工具(Anthropic web_search 只做增强路)。
- **结构化脊梁不破**:研究节点保持 `generateObject + outputSchema`,检索走前置注入,不回自由文本工具循环(ffb7951 教训)。
- **确认门**:三通路终点都经人确认才挂用料链;AI 不直接写领域实体(截图/生成的 asset 存储动作除外,见 §2.2 注)。
- **诚实数据**:未配即说未配(SearchConfigError/MultimodalConfigError 全链可见);模型记忆素材必标「需核实」;截图失败逐类报真原因;honestyBlock 同步。
- 契约零删除(capability 自由字符串、schema 字段 additive);每片测试全绿 + 真机验收;敏感 key 只进 .env.local / 库存 secretValue。

## §7 验收标准

1. **检索做真**:配好 `web.search`(任一 provider)后,MiniMax-M3 下对话「帮我搜 XX 素材」→ ChatGatherCard 素材条目带真实可点 URL(人工抽查 ≥3 条 URL 可打开且内容相关);dev 日志可见 searchWeb 真请求。
2. **诚实降级**:删掉搜索配置 → 同一句话 → 卡片显黄条「未配置联网搜索…需核实」,对话文本里模型主动声明非实时检索(不再出现「我搜到…」话术);honestyBlock 抓包可见第 6 条。
3. **来源落库**:采纳一条带 URL 素材 → 知识/弹药条目来源链显示域名、sourceMetadata.sourceUrl 落库(SQL 抽查)。
4. **截图**:对话给一个公开 URL → 截图卡渲缩略图 → 「加入弹药」→ 素材中心可见该图 + sourceUrl;给一个登录墙 URL → 卡内报「需要登录…只支持公开页面」,不产垃圾图。
5. **生成**:配好 image.generate → 对话「生成一张 XX 配图」→ 生成卡进行中→完成缩略图 → 采纳 → 素材中心出现 `generated` 徽标素材;未配 video.generate 时要求生视频 → 卡内「未配置生视频模型,[去设置]」,任务不假跑。
6. 三包(frontend/ai-worker/backend)测试全绿;真机截图归档 `frontend/docs/t084-*/`。
