# 知识库二期:真·知识图谱 + 评论回流 + AI 搜索

> SPEC 日期:2026-07-03 · 任务:T-091 / T-092 / T-093 · 状态:✅ PASS(2026-07-03 MiniMax 审,0 findings:零造轮子、确认门/诚实数据贯彻、契约全 additive、弃项均有量化触发阈值)——可开工
> 上游:[knowledge-asset-redesign](2026-07-03-knowledge-asset-redesign.md)(T-079,四原子/蒸馏/观点地图)——本 SPEC 是它的二期,其 §4「未来」已列「观点↔证据显式关联边(knowledge_relations 已有,待有真实密度再开 UI)」,本期开这道口。
> 用户裁决(BACKLOG 原话):T-091「观点地图与『全部』之间加『知识图谱』tab:真实图谱(节点=四原子知识,边=knowledge_relations 关联+materialLinks 引用),非 tag 分组卡墙」;T-092「采集的评论(audience_signals)进知识库:接 T-079 四原子的 qa 类型;设计去噪门……避免 7 条真评论时代变成垃圾场」;T-093「搜索是知识库必备入口,且要 AI 搜索」。
> 现状诊断(DB 实查 2026-07-03,postgres://…/creatoros):37 条知识(quote 7 / evidence 6 / claim 3 / qa 2 / reference 9 / transcript 6 / note 3 / snippet 1,四原子迁移已生效);`knowledge_relations` 仅 **2 条边**(references / supports,均 user 建);`material_links` entity_type='knowledge' **18 条引用边**、覆盖 3 个 project;`audience_signals` **0 行**(T-050 删种子后未再采);`search_documents` 已索引 knowledge 37 条,`embedding` 列存在但**全空**。

## §0 第一性定位

知识库的存在理由不变:**让下一条内容更快做出来、做得更好**。本期三件事都是这条主线的支流,不是新方向:

- **图谱(T-091)答「我的观点靠什么撑、被什么用」**——claim 缺 evidence 支撑 = 弹药虚;原子被哪条内容用过 = 战绩溯源。图谱是**关系的诚实呈现**,不是炫技可视化:边只画真实存在的两类(人/AI 确认过的 `knowledge_relations` + 用料链 `material_links`),没有边就诚实地稀疏。
- **评论回流(T-092)答「观众真正在问什么」**——qa 原子(评论区真实疑问)是四原子里唯一天然来自观众的,它的正规来源就是采集回来的 `audience_signals`,而不是靠人手抄。但评论 99% 是噪音(夸/水/表情),**去噪门是本设计的主体**,回流只是管道。
- **AI 搜索(T-093)答「我记得存过一条……在哪」**——原子化后库会涨到几百条,tag 聚类和时间流都答不了口语化的模糊回忆(「那条关于本地记忆的数据」)。搜索是**只读检索**,不产实体,不需确认门;但**无结果必须诚实空,不许生成式编造**。

边界:图谱不做自动布局编辑器/知识白板;评论回流只产 qa 原子,不做舆情分析;AI 搜索不做独立对话问答页(ChatBox 已挂 context.knowledge 喂料,对话式问答归它)。

## §0.5 设计依据(不造轮子调研)

**仓内现状(全部实查):**

- **图数据两件套现成**:`knowledge_relations`(backend/src/schema/knowledge.ts:sourceKnowledgeId/targetKnowledgeId/relationType 自由字符串/strength 数值/createdByType user|ai——契约 `knowledgeRelationResource` 早已支持 AI 建边的 provenance)+ `material_links`(entity_type='knowledge',material_links_entity_ix 反查索引现成)。knowledge 模块已有 9 个 op,其中 `createRelation / listRelations / removeRelation` 三个关系 op 已实现(service 已做 self-link 拒绝 + 双端 ownership 校验);**缺口只有一个:listRelations 是 per-source(单源查询),没有 user-scoped 全量边列表 op**。
- **图渲染库现成**:frontend 已依赖 `echarts ^6.1.0` + `echarts-for-react ^3.0.6`(复盘分析页 analytics-review-interactive-region 等已在用)。ECharts 内建 `series-graph`(force 布局 + roam 缩放拖拽 + 节点/边事件 + category 图例),节点量级 <100 时性能与交互都富余。
- **蒸馏确认门模式现成**:T-079b 的 `knowledge.distill` 模板(ai-worker/src/prompt/templates/knowledge-distill.ts,Zod outputSchema+default 兜底+空原子诚实抛错)+ runner(frontend/src/server/ai/knowledge-distill-runner.ts,`resolveModelSpec(ctx, capability)` + `modelFor(spec)` + `runStructuredNode`)+ 倾倒场批量确认门 UI(knowledge-dump-zone,勾选/改 type/改 title→「采纳选中 N 条」)。T-092 的评论筛选、T-091 的 AI 建边都**复刻这条模板→runner→确认门管线**,不发明新模式。
- **评论采集链现成**:douyin-cdp(frontend/src/server/ingestion/douyin-cdp.ts)拦截创作者中心 `/aweme/v1/web/comment/list/` XHR,字段口径对齐 cheat-on-content `_normalize_comment_creator`;经 Ingestion 落 `audience_signals`(source='comment',携 rawText/likeCount/publicationId);**幂等锚 T-065 已建**:`external_id = douyin:comment:<cid>`,部分唯一索引 `ux_audience_signals_user_source_external`,重复采集 onConflict 跳过。
- **搜索现状两层**:①T-062d 知识库页搜索 = **纯客户端过滤**(knowledge-interactive-region 对 recent 列表 title/tags contains,`?q=` URL 同步)——只能精确子串,不越过当前列表;②backend search 模块 = `search_documents` ILIKE over 冗余 `search_text` 列(knowledge 37 条已索引),**`embedding JSONB` 列建表时已预留但从未写入**(schema 注释原话:「pgvector/tsvector swap is a stage-N change behind the same column + SearchService.search seam」)——语义搜索的落点当年就留好了。
- **模型可配管线现成**:`resolveModelSpec(ctx, "<capability>")` 是唯一入口,新 capability 只需注册(memory 铁律:多模态与模型一律用户可配,绝不写死)。

**外部参考与取舍:**

- **Obsidian graph view / Roam graph**:采「图谱是库的透镜而非编辑器」——只呈现与溯源,建边走独立动作;弃其全局毛球图默认态——无过滤的 hairball 无信息量,我们默认按 type 着色 + 图例过滤 + 孤点收进「未连接」侧栏计数。
- **图渲染选型对比**(结论:**用已有 ECharts graph,零新依赖**):`react-force-graph`/`d3-force`(新依赖+SSR 适配成本,能力与 ECharts graph 重合)、`cytoscape.js`/`@antv/G6`(面向千节点级图分析,本库 <100 节点,杀鸡牛刀且 bundle +300KB)、`sigma.js`(WebGL,同重)。ECharts 已在仓内多页服役、测试 setup 已 mock、主题已接——引任何新图库都违反铁律#5 不造轮子。触发升级条件写明:节点 >500 或需子图布局算法时再评估 G6,现在不预支。
- **RAG 问答式知识库(NotebookLM 类)**:弃——检索目标是「找到原子去引用」不是「读一段生成的答案」,且对话问答 ChatBox 已覆盖;生成式答案还会撞「诚实数据」红线(编造风险)。
- **pgvector**:弃(本期)——双栈(postgres + pglite)引扩展成本高,而库量级几百条,**JS 进程内余弦相似度对全量 embedding 扫一遍 <10ms**,`embedding` jsonb 列现成。升级条件写明:knowledge 文档 >5000 条再上 pgvector,seam 不变(SearchService.search 后面换实现)。
- **评论去噪参考 cheat-persona(仓外 cheat-on-content)**:采其「评论→受众画像先分层再消费」思想(高赞≠高价值,疑问句/需求句才是);弃其全量灌分析——T-092 只捞「可成 qa 原子」的少数,其余留在 audience_signals 供选题需求侧(既有 linkSignalToCandidate 链)消费,两条下游不打架。

## §1 真·知识图谱 tab(T-091)

### 1.1 数据口(backend,additive)

- **新 op `knowledge.relations.listAll`**:user-scoped 返回该用户全部 `knowledge_relations` 行(现 listRelations 是 per-source,画全图 N+1 不可接受)。契约 additive 加 op;repo 单查询;沿用 list 信封。
- **图谱装配读三份现成数据**(server 侧一次装配成 GraphVm,不让前端拼):`knowledge.list`(节点:active 全类型,四原子 + reference/transcript 等旧类型一视同仁——旧类型是出处存档,在图上是 quote/evidence 的邻居,不该被隐藏)+ `relations.listAll`(语义边)+ materialLinks entity_type='knowledge' 反查(引用边,连到 **project 节点**——project 以第二类节点入图,标题即项目名,是战绩锚点)。
- **GraphVm 形状**:`{ nodes: [{ id, kind: 'knowledge'|'project', knowledgeType?, title, usedCount?, usedInPublished? }], edges: [{ source, target, kind: 'relation'|'usage', relationType?, strength?, createdByType?, stage?, role? }], stats: { knowledgeNodes, projectNodes, relationEdges, usageEdges, isolatedCount } }`。全部真值,无一编造。

### 1.2 渲染与交互(frontend)

- **tab 位置**:knowledge-interactive-region 的 `KnowledgeViewSwitch` 由二态 `atlas | all` 扩为三态 **`atlas | graph | all`(「观点地图 | 知识图谱 | 全部」)**,graph 居中(用户指定:观点地图与全部之间)。默认视图仍 = 观点地图(T-079c 裁决不动)。
- **渲染 = ECharts `series-graph` force 布局**(零新依赖,§0.5):节点按 kind+knowledgeType 分 category 着色(claim/evidence/quote/qa/存档类/project 六色,图例可点选过滤);节点大小 ∝ `usedCount`(战绩越多越大,usedInPublished 加描边);`roam: true` 缩放拖拽;边样式区分两类(relation 实线、usage 虚线指向 project)。
- **点节点看详情**:knowledge 节点点击 → 复用既有 `KnowledgeDetailPreview`(T-062c,零新组件);project 节点点击 → 跳该项目稿面。
- **边可溯源**:边 hover/点击 tooltip 展示真值——relation 边:`relationType + strength + 「由 user/AI 建立」`;usage 边:`「被〈项目名〉在 <stage> 阶段作 <role> 引用」+ createdAt`。
- **诚实空态/稀疏态**(现实:今天只有 2+18 条边):边数为 0 或全图连通度低时,图上方渲 stats 条:「N 条知识 · M 条关联 · K 条引用 · 孤立 X 条」+ 引导语「关联还很少——用下方『AI 找关联』让 AI 提议,或在详情里手动关联」。**绝不生成假边填场面**。
- 桌面端优先(现产品形态);移动端该 tab 渲 stats 摘要 + 提示到桌面查看,不硬塞 force 图。

### 1.3 AI 建边(候选→确认门,铁律#2/#4)

- **新模板 `knowledge.relate`**(ai-worker,复刻 distill 模板骨架):输入 facet = 知识原子清单(id+type+title+sourceNote,截断防爆);outputSchema = `{ candidates: [{ sourceId, targetId, relationType: enum('supports','contradicts','references','extends'), reason(一句话依据,≤60字) }] }`(Zod default 兜底;空候选诚实返回,不硬凑)。prompt 硬约束:只在语义上真有关系的原子间提议;reason 必须引用双方内容;同对原子只提一条。
- **模型可配**:`resolveModelSpec(ctx, "knowledge.relate")`,不写死(多模态可配铁律)。
- **确认门 UI**:图谱 tab 内「AI 找关联」按钮 → 候选边列表(每条:source 原子卡 ←relationType→ target 原子卡 + reason,可勾选/可改 relationType)→「采纳选中 N 条」→ 逐条走既有 `knowledge.relations.create`,**`createdByType='ai'`**(契约枚举现成)——AI 不直接写 `knowledge_relations`,人不点采纳一条边都不落。已存在同向同类型边的候选,门内直接标灰「已存在」不可勾(service 幂等兜底:重复 create 返回既有边不重插)。
- 手动建边保留:详情预览内「关联到…」入口(若 T-062c 未带则本期补),走同一 create op(createdByType='user')。

## §2 评论回流知识库(T-092)

### 2.1 管道全景(三级去噪门)

```
audience_signals(source='comment',T-065 幂等锚已防采集重复)
  → ①硬规则预筛(代码,零 AI)
  → ②AI 蒸馏筛(comment.qa-sift,只产候选)
  → ③人工确认门(勾选采纳)
  → knowledge.create(type='qa')
```

- **①硬规则预筛**(service 层纯函数,先把量打下来):排除 rawText 去空白后 <4 字、纯 emoji/标点、命中水词表(「沙发」「学到了」「支持」「第一」「路过」等,常量表可维护);排除已回流的(2.3 幂等);默认按 likeCount desc + 新近取 top 200 进②(防 prompt 爆)。
- **②AI 蒸馏筛,新模板 `comment.qa-sift`**(不复用 knowledge.distill——它面向单篇长文,这里是多条短评的批处理,输入输出形状都不同):输入 facet = 预筛后评论批(每条 signalId+rawText+likeCount);outputSchema = `{ candidates: [{ title(归一成一个清晰问题,≤80字), note(可空,补充语境), sourceNote(自动拼:「抖音评论 @昵称,赞 N」样式), signalIds: string[](支撑此问题的评论,≥1) }] }`。prompt 硬约束:**只留真实疑问/需求/反驳**(夸赞、附和、闲聊一律丢);**同义合并**——多条评论问同一件事 = 一个 qa 候选(signalIds 聚合,这是去噪的核心杠杆);title 忠于评论原意,不拔高不发明。模型 capability `comment.qa-sift` 可配。
- **③确认门**:复刻蒸馏批量确认门交互(勾选/改 title/改 note)→「采纳选中 N 条」→ 逐条 `knowledge.create`:`knowledgeType='qa'`、`sourceType='import'`(既有枚举,不扩;评论经采集导入,语义吻合)、`sourceNote` 带上支撑评论数(「抖音评论 ×3,最高赞 57」)、**`sourceMetadata = { origin: 'comment_backflow', signalIds: [...], signalExternalIds: ['douyin:comment:<cid>', ...] }`**(溯源与幂等的双料锚)。

### 2.2 入口(两个,都在既有工作面上)

- **知识库页**:倾倒场旁「评论回流」按钮(常驻)——点击拉「未回流评论」跑①②渲③。`audience_signals` 为 0 行(今日现状)时诚实空态:「还没有采集到评论——先在复盘页采集作品评论」+ 跳转链接,不渲假门。
- **复盘页评论区**(T-030/T-042 已有按作品评论列表 + 热榜):每条评论加「入知识库」轻动作 → 单条直进③确认门(预填 title=评论原文,人改成问题式)——高价值单条不必等批处理。

### 2.3 幂等(与 T-065 锚衔接,双层防重)

- **采集层**(已有,不动):`external_id = douyin:comment:<cid>` 部分唯一索引,同一评论跨 run 只有一行 signal。
- **回流层**(本期建):「未回流」判定 = signal 的 externalId **不出现在任何 active knowledge_items 的 `sourceMetadata.signalExternalIds`** 中(jsonb containment 查询,postgres/pglite 双栈原生支持;repo 一次反查取已回流集合,内存 diff,无 N+1)。①预筛自动排除已回流评论 → 重复点「评论回流」不会重复产候选;确认门采纳前 service 再校验一次(并发兜底),命中则该条跳过并在门内标注「已入库」。同义合并场景:一个 qa 挂多个 signalExternalIds,其中任一已回流即整组视为已回流(防同问题反复入库)。

### 2.4 与选题需求侧的分工(防两条下游打架)

audience_signals 现有下游 `linkSignalToCandidate`(评论→需求候选,选题侧)**不动不抢**:回流知识库消费「有知识价值的疑问」(写稿时要回答的),选题侧消费「有选题价值的需求」(值得单独做一条内容的)。同一条评论允许两边各自消费,互不加锁——两个用途,两本账。

## §3 知识库 AI 搜索入口(T-093)

### 3.1 方案对比(用户点名要对比)

| 方案 | 原理 | 优势 | 劣势 | 判定 |
|---|---|---|---|---|
| A. 关键词 | 现状:客户端 contains(T-062d)+ 服务端 ILIKE(search 模块) | 零成本、即时、精确命中可靠 | 同义/口语查询召回为 0(「本地记忆」搜不到「local memory trend」;「那条数据」搜不到 evidence) | **保留作精确层与降级兜底** |
| B. 语义 embedding | 原子入库时算 embedding 存 `search_documents.embedding`(列已预留);查询时 query embedding 与全量余弦相似度排序 | 口语模糊查询可召回;检索结果=真实原子,零编造风险;库 <5000 条时进程内计算 <10ms,无新存储依赖 | 需配 embedding 模型(一次性);存量需回填 | **✅ 核心方案** |
| C. LLM 对话问答(RAG) | 检索+生成答案 | 体验华丽 | 慢(秒级)贵;答案是生成文本,撞「诚实数据」红线;与 ChatBox(已挂 context.knowledge)重复建设;检索目标是「找到原子去引用」不是读答案 | **❌ 不做独立入口**,对话问答归 ChatBox |

**推荐 = B 为核 + A 兜底的 hybrid**:关键词精确命中排最前(exact > semantic 的朴素融合:ILIKE 命中集优先,其余按余弦分数补位,分数低于阈值截断——**不足额不硬凑**)。

### 3.2 设计

- **embedding 管线**:新 capability **`knowledge.search.embed`** 经 model-config 解析(用户可配,不写死任何 provider——铁律);Vercel AI SDK `embed`/`embedMany`。写入时机:knowledge create / revision 时同步算单条(量小,不排队);一次性回填脚本补存量 37 条(跑一遍 search reindex seam)。存到 `search_documents.embedding`(jsonb number[],建表即预留,零迁移)。
- **查询 op**:search 模块 `SearchService.search` seam 后加 semantic 路径(schema 注释预言的 stage-N swap,本期兑现):query → embed → 与该 user 的 knowledge 类 documents 余弦排序 → 与 ILIKE 命中融合。知识库页搜索默认 `entityType='knowledge'` 收窄(教训 memory 在案:面窄的 surface 别挂宽域工具);全局搜索页不动。
- **入口 UI**:知识库工具栏既有搜索框升级为 AI 搜索入口(位置已醒目,不另造浮层):**输入即时 = 现客户端过滤不动**(手感零回退);**回车 = 服务端 hybrid 搜索**,结果区渲原子卡列表(type 徽章 + title + sourceNote + 战绩行 + 匹配来源标注「精确/语义」),点卡进 `KnowledgeDetailPreview`。搜索历史落既有 `search_history` 表。
- **诚实降级**:`knowledge.search.embed` 未配置(无 key/无模型)→ 回车走纯 ILIKE,结果区顶部标注「AI 语义搜索未启用:请在设置→模型配置里为 knowledge.search.embed 配置 embedding 模型」;**不静默装 AI**。零结果 → 诚实空态「没有匹配的知识原子」,不生成、不推荐凑数。

## §4 未来(本期不做)

图谱子图聚焦(以某原子为中心的 N 度邻域);观点表现回写细化到边权重;pgvector(>5000 条触发);评论定时自动回流(现手动触发,调度归 T-007 子系统);qa 原子「已在某稿回答过」状态回写。

## §5 全局约束

- **确认门**:AI 建边(§1.3)与评论筛选(§2.1)全部只产候选,人采纳才物化;AI 搜索(§3)只读不写、无需门,但零结果诚实空。
- **诚实数据**:图谱只画真实边、空态不编;评论 0 行渲引导不渲假;搜索不凑数。无任何 fixture/mock 进生产路径。
- **契约零删除**:新 op(relations.listAll / qa-sift / relate / semantic search)与 GraphVm 全 additive;既有 9 个 knowledge op、audience_signals 表结构、search_documents 列一个不改不删。
- **模型可配**:`knowledge.relate` / `comment.qa-sift` / `knowledge.search.embed` 三个新 capability 全走 model-config,不写死 provider。
- **不引新依赖**:图渲染用已有 echarts;embedding 存已有 jsonb 列;无 pgvector、无新图库。
- 每切片测试全绿 + 真机验收截图;dev server 改采集/持久层代码须重启(memory 在案)。

## §6 切片与验收标准(可操作可量测)

### T-091 知识图谱 tab(一次做完:数据口 + 渲染 + AI 建边)

1. 知识库页出现三态切换「观点地图 | 知识图谱 | 全部」,graph 居中;默认仍是观点地图。
2. 图谱 tab 渲出真实数据:**37 个 knowledge 节点 + 3 个 project 节点、2 条 relation 边 + 18 条 usage 边**(与 DB 实查一致,数字随库演进);stats 条数字与 SQL 手查一致。
3. 点任一 knowledge 节点 → 详情预览打开且内容正确;hover usage 边 → tooltip 显示真实项目名与 stage/role;hover relation 边 → 显示 relationType 与「由 user 建立」。
4. 点「AI 找关联」→ 候选边列表(每条带 reason)→ 勾选 2 条采纳 → `knowledge_relations` 新增 2 行且 `created_by_type='ai'`(SQL 抽查);未勾选的一条不落库;重复采纳同一对 → 不产生重复行。
5. 图例点掉 claim → claim 节点隐藏;`relations.listAll` op 契约测试 + 装配层测试全绿。

### T-092 评论回流(qa 原子)

1. `audience_signals` 为空时点「评论回流」→ 诚实空态 + 跳复盘采集的引导,无假候选。
2. 真实采集一批评论后触发回流:水评(「学到了」「沙发」)被①预筛掉(不出现在候选);AI 候选全部是疑问/需求式 title;多条同义评论合并为一个候选且 signalIds ≥2(构造用例验证)。
3. 勾选采纳 N 条 → `knowledge_items` 新增 N 行:`knowledge_type='qa'`、`source_metadata.origin='comment_backflow'`、`signalExternalIds` 与源评论 cid 对应(SQL 抽查);未勾选不落库。
4. **幂等**:采纳后再次点「评论回流」→ 已回流评论不再出现在候选;同一评论重复采集(T-065 锚)+ 重复回流,库中 qa 不重复。
5. 复盘评论区单条「入知识库」→ 预填确认门 → 采纳后同上锚齐全;qa 原子出现在观点地图/全部/图谱三视图。

### T-093 AI 搜索入口

1. 配置 `knowledge.search.embed` 模型后:存量知识回填 embedding(`search_documents` knowledge 行 embedding 非空,SQL 抽查);新建原子入库即带 embedding。
2. 口语模糊查询(如「本地记忆那条数据」)回车 → 语义命中对应 evidence 原子(关键词 contains 搜不到、语义搜得到的用例至少 1 个过验);结果卡带「语义」标注;精确子串命中排在语义命中前。
3. 未配 embedding 模型时回车 → 纯关键词结果 + 「AI 语义搜索未启用」提示条;不报错不假装。
4. 零命中查询 → 「没有匹配的知识原子」空态,结果区无凑数内容;`search_history` 落一行真实记录。
5. 输入即时过滤手感与 T-062d 现状一致(不回退);search 模块新路径测试 + 页面交互测试全绿。
