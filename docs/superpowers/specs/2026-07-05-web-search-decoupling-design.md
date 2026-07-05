# 联网搜索解耦设计(检索能力从「模型 provider 内置工具」剥离)

> **状态**:待过 spec-review gate(架构/数据通路改动)。
> **任务**:T-126(BACKLOG)。**下游**:T-127 创作流「素材研究」环依赖本 SPEC 落地(用户 2026-07-05 拍板「先做 T-126 再做 T-127 全链」)。
> **宪法对照**:[产品定位.md](../../产品定位.md) + 铁律「多模态/能力用户可配,绝不写死某厂商」。
>
> **裁决注(2026-07-05,MiniMax reviewer)**:verdict=**CONCERNS**,总评「解耦方向正确合定位」。6 finding 全采纳、已内联处置:①trendradar-mcp 非 drop-in(仓库 `mcp-server` 仅 Server 端、无 MCP client)→ **默认改 RSS via WebFetch(§B)**,trendradar-mcp 降为可选增强(需补 MCP client,§7 T-126f);②browser-scrape 复用方式明确为**独立搜索 context**(§C);③OQ1 裁决为 **per-capability 覆盖 + 全局默认**(§D);④验收补量化超时/降级/grounding 规则(§8);⑤GPL 免责声明(§5);⑥切片补拆 BACKLOG 说明(§7)。

## 0. 用户诉求(2026-07-05)

用户:「为什么现在不支持联网搜索?之前通过 Chrome DevTools 让 Agent 操作浏览器、或接 RSS 就能联网搜索,现在必须配联网搜索的模型,这是什么导致的?」+「这个能力在 cheat-on-content 我已经加上了,包括它还能自己截图。」

## 1. 背景与目标

**现状根因**:联网搜索 = 让 LLM 调 **provider 内置的 web-search 服务端工具**(典型 Anthropic 的 `web_search`)。只有 Anthropic 系模型带这个工具;用 MiniMax 等无此工具的模型 → **根本不搜网**,退化成模型凭训练知识编(现已诚实标 `grounding: "model_memory"`)。问题:**搜索被绑死在「模型 provider 的能力」上**,不是我们自有的能力 —— 用户配了非 Anthropic 模型就搜不了真网。

**目标**:把「搜索」与「模型」**解耦** —— 检索层自己出真结果,喂**任意配置的 LLM** 只做综合。用户无论配什么模型都能真联网检索。

## 2. 宪法对照(合定位)

- **合「能力用户可配,绝不写死」**:检索 provider 与生图/生视频/ASR 一样,走用户可配抽象,不绑单一厂商。
- **合「诚实数据」铁律**:检索结果如实标来源(真联网 URL vs 热榜 vs 模型记忆),不假装联网。
- **合「AI 只产候选走确认门」**:检索产 `material_list` candidate,不直接写库(现状已如此,不变)。
- **合飞轮定位**:素材是「选题→论点→脚本」链的地基(T-127),真素材才撑得起真内容。

## 3. 现网事实(已勘查,2026-07-05)

- 素材搜集:`frontend/src/server/ai/research-runner.ts` `runGatherMaterial` → `ai-worker/src/nodes/research-node.ts:172` `runResearchNode`;产四类(hooks/cases/dataPoints/quotes)→ 摊平 `MaterialItem[] {title, url, source, why_relevant, sourceUrl?}` → `material_list` candidate(既有采纳→KnowledgeItem 路径)。
- 联网搜索现状:`resolveModelSpec(ctx, "research.gather")` 解析模型;**不自带 web search**,仅真 Anthropic 端点可选挂 `anthropicWebSearchTools()`;否则模型用自身知识产素材,标 `grounding: "web" | "model_memory"`。
- 触发:**仅在 Copilot 对话**(无独立工作台),非必经。
- 模型可配基建:`model_configurations` 表 + `resolveLlmConfig` 三层回退(已支持按 capability 配模型 + 密钥);多模态(生图/视频/ASR)已走 `resolveMultimodalSpec` 平行抽象(见 memory multimodal-models-user-configurable)。

## 4. 设计

### §A 检索 provider 抽象(核心)

把 `material.gather` 的**检索步**从「模型内置工具」抽象成一个 `RetrievalProvider` 接口(与 `resolveMultimodalSpec` 平行),**三态用户可配**:

| provider | 机制 | 依赖 | grounding 标注 |
|---|---|---|---|
| `model-web-search`(现状) | LLM 调 provider 内置 web_search(仅 Anthropic 系真有) | 配 Anthropic 系模型 | `web` |
| `mcp-hotlist`(RSS/热榜)默认 | **默认 RSS via WebFetch**(拉源→抓真文章/热榜,**无需 MCP client**);trendradar-mcp 为可选增强(需补 MCP client,见 §7 T-126f) → 喂任意 LLM 综合 | RSS 源 URL(默认)/ 可选 MCP server | `hotlist` |
| `browser-scrape`(浏览器自动化) | playwright `launchPersistentContext` 驱动真浏览器搜 Google/百度/抖音 → 抓结果(可自截图存证)→ 喂任意 LLM | 已装 playwright(复用抖音采集基建) | `browser` |

- **用户在设置/model-config 选检索 provider**(默认见 §D)。检索与「综合用的 LLM」分开配 —— 综合走既有 `resolve.ts` 任意模型。
- **降级链**:配了哪个用哪个;都没配/失败 → 落回 `model_memory`(现状诚实兜底,不崩)。
- **不写死厂商**:三态都是抽象,MiniMax 用户配 `mcp-hotlist` 或 `browser-scrape` 即可真联网。

### §B 检索结果统一契约

三态 provider 各自实现,但**统一产 `MaterialItem[]`**(现有形状不变)+ `grounding` 标注扩枚举(`web|hotlist|browser|model_memory`)。综合 LLM 拿真结果做「为什么相关/怎么用」的创作向加工(现有 runResearchNode 逻辑复用,只是喂进去的是**真检索结果**而非模型脑补)。

### §C browser-scrape 的「自截图」·context 边界[reviewer-2]

- **复用方式明确**:复用抖音采集的 playwright **代码/配置封装(启动参数、版本、反爬姿势),但起独立搜索 context** —— 搜索无需登录态,不共用抖音登录实例;两者 context 生命周期独立、互不污染登录态。
- 检索时 `page.screenshot()` 存证(落 `.cache/` 调试目录,不进库、不提交)—— 对应用户说的「还能自己截图」,用于人工核验检索真实性 + 反爬调试。

### §D 默认与配置面

- 默认 provider:**`mcp-hotlist`(RSS via WebFetch,无 MCP client 依赖)**(最省事、无浏览器开销);未配任何源时 → `model_memory` 兜底。
- **[裁决 OQ1] 配置粒度 = per-capability 覆盖 + 全局默认**(对齐现有 `resolveLlmConfig` 分层):`model_configurations` 加一个 retrieval 维度 —— 全局默认行 + 可选 per-capability 覆盖行(如 `research.gather` 用 browser-scrape、topics basis 用 mcp-hotlist)。`resolveRetrievalProvider(ctx, capability)` 回退链:**capability 专属行 → 全局默认行 → mcp-hotlist(RSS)→ model_memory**。对齐多模态 provider 配置范式,不新造一套设置体系。

## 5. 现成方案 / OSS 调研(gate 必查)

**用户 2026-07-05 指认 cheat-on-content 已有整套解耦联网搜索,直接抄不重造**(`/Users/zyongzhu/Workbase/cheat-on-content`):

- **`mcp-hotlist` 复用**:`adapters/trend-sources/`(weibo-hot / zhihu-hot / aihot / **trendradar-mcp** —— 57k★ 中文热榜聚合,newsnow API 拉微博/知乎/抖音/B站/头条;独立 MCP server 暴露 `get_latest_news` / `search_news` / `analyze_topic_trend` 等 25+ tool)。由 `cheat-trends` / `cheat-seed` skill 用 **WebFetch + MCP tool** 消费 → normalize 到 candidate-schema(sha256 稳定 id)→ 去重 → 粗打分 → 落候选。**trendradar-mcp 是 drop-in**(配 MCP 即用;GPL 只经协议调用不传染)。
- **`browser-scrape` 复用**:`adapters/perf-data/{douyin-session,xhs-explore,bilibili-stat}/crawler.py`(playwright `async_playwright` + `launchPersistentContext` 持久化登录态 + `page.screenshot()`,不逆向签名/不伪造请求)。CreatorOS 抖音采集已有同源基建(memory douyin-collection-approach)。
- **移植性质**:cheat-on-content 是 Python skill/adapter,CreatorOS 是 TS → **模式移植非代码拷贝**(照抄的是「拉源/驱动浏览器→抓真结果→normalize→喂 LLM」的架构,不是 .py 文件);browser-scrape 复用 CreatorOS 现有 playwright 采集链的启动/反爬封装。
- **[reviewer-1] trendradar-mcp 非 drop-in 更正**:仓库 `mcp-server` 只用 `@modelcontextprotocol/sdk` 的 **Server 端**(暴露自家 MCP),**无 MCP client**(调外部 MCP)。故 trendradar-mcp 需先补一个 MCP client(sdk 已含 Client 类,未接线)→ 列为可选切片 §7 T-126f。**默认 mcp-hotlist 走 RSS via WebFetch,不依赖它**。
- **[reviewer-5] GPL 免责**:trendradar-mcp 本体 GPL-3.0;「只经 MCP 协议远程调用不构成 linking/衍生」是常见判断但非法律意见,**请用户自行评估**;在意者可用 RSS 源兜底或自建兼容 MCP server(功能不阻塞)。
- 备选评估:直接接第三方搜索 API(SerpAPI/Tavily/Bing)—— 也解耦但需付费 key + 又引入一种「必须配的东西」,与用户「接 RSS/浏览器就行」的直觉不符;列为 provider 可扩点但非默认。

## 6. 数据与契约

- `MaterialItem[]` 形状不变;`grounding` 枚举扩 `hotlist|browser`。
- `model_configurations`:additive 一个 retrieval-provider 维度 + 各 provider 配置(不动现有列语义)。
- `material_list` candidate 采纳路径不变(AI 只产候选走确认门,铁律②)。
- **零破坏**:现状 `model-web-search`(Anthropic)保留为一态;未配用户行为不变(仍 model_memory 兜底)。

## 7. 切片(拆 BACKLOG Task 预告 —— 过 gate 后按此拆,每切片一条引用本 SPEC)

- **T-126a 检索抽象地基**:`RetrievalProvider` 接口 + `resolveRetrievalProvider`(平行 resolveMultimodalSpec)+ grounding 枚举扩 + material.gather 检索步接口化(现 `model-web-search` 收敛为一态实现)。
- **T-126b mcp-hotlist provider**:接 trendradar-mcp / RSS 源(WebFetch + MCP tool),normalize→MaterialItem[];默认态。
- **T-126c browser-scrape provider**:复用 playwright 采集基建,搜→抓→自截图存证→MaterialItem[]。
- **T-126d 配置面**:model-config/设置加检索 provider 选择 + 各 provider 凭据/源(对齐多模态范式)。
- **T-126e 验收**:三态各真链路冒烟(配 MiniMax 综合模型 + 各 provider 均能出真素材,grounding 标注正确);未配兜底 model_memory 不崩。
- **T-126f(可选)MCP client 接线**:补 `@modelcontextprotocol/sdk` Client 侧接线,让 mcp-hotlist 可选走 trendradar-mcp(而非仅 RSS)。**非默认路径必需**,排最后;不做也不影响 a~e 的默认 RSS 通路。

> **拆条说明**:以上切片是**预告**,本 SPEC 过 gate 后须逐条拆进 `BACKLOG.md`(每条一行、状态 📋、引用本 SPEC),ID 沿用 T-126a~T-126f。验收对照 BACKLOG 追踪,不在本 SPEC 内当执行总账。

## 8. 验收标准(含量化规则[reviewer-4])

- 配非 Anthropic 模型(MiniMax)+ 任一非 `model-web-search` provider → 素材搜集**能拿到真联网结果**(grounding≠model_memory),喂 MiniMax 综合产 material_list。
- 三态 provider 用户可切;都没配 → model_memory 诚实兜底不报错。
- **超时/降级规则**:单次检索请求 **15s 超时** → 沿回退链降级(capability 行→全局默认→mcp-hotlist→model_memory);任一环失败(超时/0 结果/凭据缺)→ 降级不阻断,最坏落 model_memory + 前端提示「本次为模型记忆,需核实」。
- **grounding 判定规则**:检索真抓到带 URL 的结果条目 → 标 provider 对应值(`web`/`hotlist`/`browser`);检索返回 0 条或全程降级到模型脑补 → 标 `model_memory`。每条 MaterialItem 的 grounding 独立判定(混合结果按条标)。
- browser-scrape 能存检索截图落 `.cache/` 目录且可查(人工核验用)。
- 零破坏:现有 Anthropic web_search 路径仍工作;`material_list` 采纳→KnowledgeItem 路径不变。

## 9. 风险与开放问题

- **R1(中)**:trendradar-mcp 是外部 MCP server,用户需自装(GPL 本体不打包)。缓解:文档引导 + RSS 源作无 MCP 的兜底态。
- **R2(中)**:browser-scrape 受目标站反爬/改版影响(cheat-on-content README 亦承认 ★★ 稳定性)。缓解:失败降级到 mcp-hotlist / model_memory,不阻断创作流。
- **R3(低)**:检索延迟比模型内置工具高(要真抓网)。缓解:material.gather 本就后台异步跑(非阻塞对话),T-127 半自动一键触发后台执行。
- **OQ1(已裁决,见 §D)**:检索 provider = **per-capability 覆盖 + 全局默认**(对齐 resolveLlmConfig 分层)。不再是开放问题。
