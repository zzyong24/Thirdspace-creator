# 用户上传素材主权:文档解析 + 最高优先权重 + AI/搜索深度结合(T-146)

> SPEC 日期:2026-07-05 · 任务:T-146 · 状态:📝 待过 spec-review gate
> 用户诉求(实录 2026-07-05):「制作项目时除 AI 找素材,也支持用户上传 PDF/Word/MD 文档进弹药库;用户上传素材**优先级最高**,结合选题生成文案时**权重最大**;搜索/找素材时要**深度结合这些素材**(非盲目按标题搜)。场景例:带货博主 PR 发的产品资料 + 带货主题 = 最高优先级素材(PR 只是一例)」。
> 用户设计裁决(2026-07-05 AskUserQuestion):①解析深度 = **抽全文 + AI 摘成要点卡**;②优先级 = **二元自动:用户上传 = 最高**;③结合强度 = **硬约束(文案必须紧扣核心事实)**。

## §0 第一性定位

素材有两个来源,主权不同:
1. **AI 找的**(联网检索/截图/生成,已由 T-084 `material-capability-upgrade` 做真)——二手,可能泛、可能偏。
2. **用户上传的第一手资料**(PR 产品资料、采访记录、自己的研究文档)——**创作者手里的真相**,应当**盖过** AI 到处找的。

T-146 补的是第 2 条:让用户上传的文档成为**该内容的最高优先弹药**——AI 写文案紧扣它的核心事实、联网搜索贴着它搜,而不是只认一个标题到处泛搜。这是与 T-084 **互补的另一半**(T-084 = 素材来源要真,T-146 = 用户第一手资料主权),不重造。

## §0.5 现状盘点(已勘查 + 亲验,防重造)

大量地基已有,真正新增很小:

| 维度 | 现状(锚点) | 判定 |
|---|---|---|
| 文档上传 | `assetType` 枚举含 `document`(`assets.service.ts:39`);`asset-upload-button.tsx` 的 `assetTypeForFile()` 把非图/视/音的一切归 `document`;两阶段上传落 ObjectStorage(local-fs/S3)。**PDF/Word/MD 现在就能上传落盘** | ✅ 上传通,**缺文本抽取** |
| 文本抽取 | 全仓无 `pdf-parse`/`mammoth`/`pdfjs` 依赖;`asset_files` 无 `extractedText`;`asset-classify-runner.ts` 只对 image 用视觉模型,document 不解析 | ❌ 完全没有 |
| 弹药区 | draft-workbench 的 `ammo-*.tsx`;数据源 = `materialLinks.list`→knowledge/asset fan-out(`draft-workbench-data.ts:23`)。`material_links`(`entityType∈{knowledge,asset}`+`role`+`addedByType`) 是「料库⇄创作」一等公民边 | ✅ 挂载通,**缺优先级字段** |
| 优先级/权重 | assets 仅 `isFavorite`;material_links 的 `role` 是分类非优先级;`assembleCreativeContext` 全平铺。唯一加权先例:positioning `downstreamRules`→「【必须遵守】」硬约束、knowledgeBrief 按战绩排序 | ❌ 完全没有,**但有加权范式可抄** |
| AI 文案注入 | `assembleCreativeContext`(`creative-context.ts`)有 `assetsBrief` 字段 + `AssetsReader`,但只 id+名字+类型清单、**不含文本**;`script-runner.ts`/`runScriptNode` **根本没传 assetsBrief** | ⚠️ 字段在、**写稿没接、无文本** |
| 搜索 query | `chat-runner.ts:629` `effQuery = query?.trim() \|\| selectionTitle`,**只用标题**;`runResearchNode` 只注入 positioning+topic+searchResults,不注入素材。T-084 已建 `searchResults` facet 注入范式 | ❌ 不结合素材,**但 facet 范式可复用** |

**可直接复用(不重造)**:上传/存储链;`asset-classify-runner` 的「上传后 void 触发、model 可配、诚实跳过、写 mediaMetadata」范式;reader 端口 + `assembleCreativeContext`;positioning「【必须遵守】」+ knowledgeBrief 战绩排序两个加权范式;T-084 的 `search_factory` + facet 注入;`material_links` 一等公民边。

## §1 文档文本抽取(增量①,扩展 assets)

**目标**:用户上传 PDF/Word/MD → 抽全文落库 → AI 摘成结构化「资料要点卡」(用户裁决①)。

### 1.1 存储字段(additive)
- `asset_files` 加 `extracted_text TEXT`(全文,可空)+ `extract_status TEXT`(pending/done/failed/unsupported)。
- 「资料要点卡」落 `assets.mediaMetadata.materialSummary`(jsonb,结构化:`{ keyPoints: string[], facts: string[], sellingPoints?: string[], rawExcerptRef }`)。

### 1.2 抽取 runner(仿 asset-classify-runner 范式)
- 新建 `frontend/src/server/ai/material-extract-runner.ts`:上传 `document` 完成后 **void 触发**(不阻塞上传回合,同 asset-classify 的 best-effort 范式)。
- **两阶段**:
  1. **确定性抽全文**(无 AI):按 mimeType 分派 —— PDF→`pdf-parse`、docx→`mammoth`、md/txt→UTF-8 直读。落 `extracted_text`。加密/扫描件/损坏 → `extract_status='failed'` + 诚实标注(不假装成功)。
  2. **AI 摘要要点卡**(用户裁决①):把全文(超长按 token 预算分段/截断)喂**可配文本模型**,`generateObject` 绑 `materialSummary` outputSchema(keyPoints/facts/sellingPoints)。摘要提示铁律:**「只提炼原文已有的事实/数据/卖点,不得补充原文没有的内容;拿不准的字段留空」**(承 research-gather 的「宁缺毋滥绝不编造」)。
- **模型走 model-config 可配**(铁律,绝不写死):复用现有文本能力解析层(script/text 模型),或加 `document.summarize` capability(自由字符串,零 contract 改动,同 `transcribe.audio`/`web.search` 加入方式)。**实现期定,倾向复用现有文本模型**避免 capability 膨胀。未配/失败 → 诚实降级:只留 `extracted_text` 全文、`materialSummary` 空,注入时退化为「全文截断」模式(见 §3)。

### 1.3 前端呈现
- 素材详情面板(`asset-detail-panel.tsx`)对 document 类型显「资料要点卡」(keyPoints/facts)+「查看全文」;`extract_status='failed'` 显诚实提示「该文档无法自动解析文本(可能是扫描件/加密),AI 将无法读取其内容」。

## §2 优先级/权重(增量②,落 material_link)

**用户裁决②:二元自动,用户上传 = 最高。** 优先级是**项目内语义**(同一素材在不同项目可不同),故落 `material_links`(asset 挂项目那条边),不落 asset 全局。

- `material_links` 加 `priority TEXT DEFAULT 'normal'`(枚举 `high`/`normal`)。
- **自动规则**:`addedByType='user'`(用户上传/用户手动挂)→ 建 link 时 default `priority='high'`;`addedByType='ai'`(AI 找的)→ `normal`。零手动操作(用户选的二元自动)。
- 字段保留可扩展(日后要「手动 pin/调级」只需加 UI 写这一列,数据模型已就位)——但**本期不做手动 UI**(YAGNI,用户选二元自动)。

## §3 AI 文案注入(增量③,扩展 creative-context + script-runner)

**用户裁决③:硬约束(文案必须紧扣核心事实)。**

- `AssetsReader`/`assetsBrief` 升级:携带 document 素材的 `materialSummary`(要点卡)或 `extracted_text`(截断兜底);按 `material_link.priority` 分流。
- `script-runner.ts`/`runScriptNode` **接上 assetsBrief**(现状根本没传)。
- **加权渲染**(套 positioning「【必须遵守】」硬约束范式):高优先素材单独成段——
  > 【用户第一手资料 · 最高优先 · 必须遵守】以下为创作者提供的核心资料。文案**必须紧扣其核心事实、数据、卖点**,不得脱离、弱化或编造与之矛盾的内容。这些是本条内容的事实地基。
  > <要点卡:keyPoints / facts / sellingPoints>
- **平衡「紧扣事实」vs「只会复述」**:硬约束限定在**事实/数据/卖点层**(不许改/不许编造),但**表达角度、钩子、结构留给 AI 自由发挥**(prompt 显式说明:「事实必须忠于资料,但开头/角度/叙述由你创作」)。既满足用户「硬约束紧扣核心事实」,又防止 AI 沦为复读机。
- `normal` 优先素材进既有普通 `assetsBrief`(参考级,非硬约束)。

## §4 搜索深度结合(增量④,复用 T-084 facet 范式)

**目标**:搜索/找素材不再「盲目按标题搜」,而是贴着用户高优先资料搜。

- `gatherMaterials`(`chat-runner.ts:629` 与 `research-runner.ts` 两条路径)构造 search query 前:读**当前项目的 high-priority 用户素材** `materialSummary`(keyPoints/关键实体)→ **扩展/精化 query**(标题 + 资料关键词/实体,而非纯标题)。
- 把高优先素材要点作 **facet 注入 `runResearchNode`**(复用 T-084 `searchResults` facet 加法):让结构化综合「贴着 PR 资料产素材」而非泛搜。
- `research-gather` 模板加选填 facet `userMaterialFacet`,提示:「以下为创作者第一手资料要点,搜集/综合素材应优先服务于它,补充它、佐证它,而非跑题」。

## §5 与 T-136(多账号)的衔接

正交,不冲突:T-136 给 `assets`/`material_links` 加 `account_id`(账号级素材库);本 SPEC 的 `extracted_text`/`materialSummary`/`material_link.priority` 是内容维度,与 account 维度独立。两者可并行;若 T-136 切片 b 先落,本 SPEC 的表变更叠加即可(都是 additive)。

## §6 数据与契约(全 additive)

- 迁移(新 `backend/drizzle/00XX_*`,additive):`asset_files` 加 `extracted_text`/`extract_status`;`material_links` 加 `priority DEFAULT 'normal'`;(`materialSummary` 走既有 `mediaMetadata` jsonb,无需新列)。
- 契约:`AssetsReader` 返回结构加 `materialSummary?`/`extractedText?`/`priority?`(additive,旧消费不破);material-links create op 支持 `priority`(可选,默认按 addedByType 派生)。
- 依赖:加 `pdf-parse`、`mammoth`(docx);md/txt 零依赖。
- 契约零删除;capability 若加 `document.summarize` 走自由字符串;敏感 key 只进 .env.local。

## §7 切片(一次从 0 到 1,非分期减法)

| 切片 | 内容 | 依赖 |
|---|---|---|
| **a 文档抽取链** | pdf-parse/mammoth 依赖 + `extracted_text`/`extract_status` 字段 + `material-extract-runner`(确定性抽全文 + AI 摘要要点卡,model 可配)+ 上传后 void 触发 + 三类诚实降级 + 详情面板要点卡呈现 | 无 |
| **b 优先级** | `material_links` 加 `priority` + 用户上传 default `high`/AI `normal` 自动规则 | 无(与 a 并行) |
| **c AI 注入硬约束** | AssetsReader 携要点卡/全文 + script-runner 接 assetsBrief + 高优先素材「【必须遵守】」加权段(事实硬约束+表达自由) | a(要文本)+ b(要优先级) |
| **d 搜索结合** | gatherMaterials query 扩展(标题+资料关键词)+ 素材要点 facet 注入 research-node(复用 T-084 facet) | a(要要点卡) |
| **e 验收闭环** | 上传 PR 资料 PDF → 抽文本+要点卡 → 高优先 → 写文案紧扣资料事实(不跑偏不复述)→ 搜索贴资料搜 | a-d |

## §8 验收标准

1. **文档解析**:上传一份多页 PDF(及 docx/md 各一)→ `extracted_text` 落库、`materialSummary` 要点卡生成(SQL/详情面板可见);上传加密/扫描 PDF → `extract_status='failed'` + 详情面板诚实提示,不产垃圾要点。
2. **优先级自动**:用户上传素材挂项目 → `material_link.priority='high'`;AI 找的素材 → `normal`(SQL 抽查)。
3. **AI 硬约束注入**:项目挂一份高优先产品资料 → 生成文案 → 文案紧扣资料的核心事实/卖点(人工验:不编造资料没有的卖点、不脱离核心事实),且开头/角度非机械复述(有创作)。对照:移除该素材再生成,文案明显不再紧扣。
4. **搜索结合**:项目有高优先资料时「帮我找素材」→ dev 日志可见 search query 含资料关键词/实体(非纯标题);research facet 注入可见。
5. **诚实降级**:未配文档摘要模型 → 退化为全文截断注入(不崩、不假装有要点卡);解析失败素材不进 AI 上下文冒充可读。
6. 三包(frontend/ai-worker/backend)typecheck 0 + 各切片单测(解析分派/优先级派生/加权渲染/query 扩展)+ 真机上传验收。

## §9 宪法对照(合定位)

对照 [产品定位](../../产品定位.md):
- **§7 数据底座**:「创作者真实…导入…替换所有 mock/seed」——用户上传第一手资料是**最真的数据底座**,强化飞轮「真实数据喂创作」,完全合定位。
- **§5 核心原则 #3**(AI 只产候选,人确认):文档抽取的全文/要点卡是**注入 AI 的 context**,不直接写领域实体;AI 基于资料产文案候选,仍走采纳门。合。
- **§5 #5**(人出判断品味,AI 出草稿苦力):用户给第一手资料(判断「什么是核心」),AI 出紧扣资料的草稿。合。
- **§6 ChatBox 每轮 Zod schema 约束**:要点卡/素材综合走 `generateObject + outputSchema`,防发散。合。
- 结论:**合定位**。是把「真实数据底座」从「已发布作品」扩展到「用户第一手创作资料」,同源同向。

## §10 风险与开放问题

- **风险**:①长文档 AI 摘要 token 成本(可配模型 + 分段/截断兜底);②扫描件/加密 PDF 无文本层(诚实降级,不 OCR——OCR 列 §未来);③硬约束太硬 → AI 复读(§3 已用「事实硬约束+表达自由」平衡,验收 3 专测此项);④优先级二元可能不够细(用户选二元自动,字段留扩展位)。
- **OQ1 文档摘要模型**:复用现有文本模型 vs 加 `document.summarize` capability?倾向复用(避免 capability 膨胀),gate/实现期定。
- **OQ2 全文超长**:要点卡摘要 + 全文截断注入的 token 预算阈值定多少?实现期按模型上下文窗口定,诚实标「资料过长已截断」。
- **OQ3 OCR(未来)**:扫描件/图片型 PDF 是否要接 OCR(视觉模型)?本期不做,`extract_status='unsupported'` 诚实标注。
- **未来(本期不做)**:OCR 扫描件、手动优先级 UI(pin/星级)、跨项目素材复用、素材版本管理。
