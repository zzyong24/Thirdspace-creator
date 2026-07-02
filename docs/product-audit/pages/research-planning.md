# 产品审计 · 研究 + 策划阶段页

> 审计范围:`/projects/[id]/research`、`/projects/[id]/planning`
> 审计日期:2026-07-02 · dev server localhost:3000(T-046 免登录直通,所有请求解析为本机主用户)
> 方法:宪法对照 + 代码链路(page.tsx → features → contract op → persistence-client → backend service)+ 只读 curl 真机验证。**未执行任何写操作**(未点采纳/未建实体/未触发 AI/未触发采集)。
> 证据标注:`file:line` 为代码证据;「live」为 curl 实测证据;「未验证」= 诚实标注。

---

## 一、研究工作台 `/projects/[id]/research`

### 1.1 功能定位

七步流水线第 2 步(立项→**研究**→策划→…)的工作台:为脚本"备料"。L2 创作向重写后,页面产物定位为四类创作素材(钩子/案例/数据点/金句),移除了旧的竞品分析表/威胁评估(research-workspace-page.tsx:13-17)——与宪法 §5「人出判断、AI 出草稿苦力」及"编导不是表单填写机"一致,**定位本身合宪法**。

入口链:`app/(creator)/projects/[projectId]/research/page.tsx:31-48` → `buildResearchWorkspaceViewModel`(research-workspace-data.ts)→ `ResearchWorkspacePage`(research-workspace-page.tsx)。Server Component,session 必解析(session.server.ts:29-53 单机直通),所以线上路径**总是走真读侧**,fixture 只做每字段回退。

页面可达性(live):`curl /projects/dy-proj-61/research` → 200;`/projects/project-podcast-launch/research` → 200。

### 1.2 区块与交互清单

| 区块 | 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|---|
| 项目创意卡 | 标题/摘要文本 | 展示 | `projects.get`(page.tsx:46 → research-workspace-data.ts:144-148) | works(live:dy-proj-61 返回真数据) |
| 项目创意卡 | 定位契合度 Badge | 挂载时算分,tooltip 显示 reasons | `positioning.gate.evaluate`(positioning-fit-badge.tsx:47-51)→ positioning.service.ts:286-336(纯读,确定性打分) | works(live:dy-proj-61 → fit=0「命中关键词 0/3」) |
| 趋势与背景 | 3 张趋势卡 | 展示 | 无真数据源:canonical 项目 = fixture(selectors/research.ts:94-116);真项目 = 空数组(research-workspace-data.ts:235) | works 但内容 fixture/空,详见 1.4 |
| 趋势与背景 | 「↗ 趋势」指示器 | 纯装饰(aria-hidden) | 无 | 装饰,恒显示 ↗ 与 tone 无关(research-workspace-page.tsx:172-179) |
| 创作素材方向 | 四类说明卡(钩子/案例/数据点/金句) | 静态说明 | 无(硬编码 MATERIAL_CLASSES,research-workspace-page.tsx:204-213) | works(设计上就是静态 guide) |
| 资料收集 | 类型 tabs 全部/文章/视频/报告/播客 | **点击只动下划线,不筛选列表** | PageTabs 无 onValueChange、无 TabsContent(research-workspace-page.tsx:263-265;page-tabs.tsx 仅 TabsList);代码注释自认 no-op(research-workspace-page.tsx:302-304) | **dead(装饰)** — 与 T-018 修掉的策划页同类 bug,研究页仍存留 |
| 资料收集 | 资料行 | 纯展示,不可点击(无链接到知识条目) | `materialLinks.list` → `knowledge.get`(research-workspace-data.ts:163-196) | works 但当前全库为空(live:所有项目 materialLinks total=0) |
| 右栏·AI 搜集素材 | 「帮我搜素材」按钮 | createAITask → 轮询 → 审阅 → 采纳 | `ai.tasks.create`(taskType research.gather_material)→ persistence-client.ts:2026-2046 live dispatch `runGatherMaterial` → ai-worker runResearchNode(generateObject 四类 schema) | works(live:存在 awaiting_confirmation 任务 ai-task-39eea584-322,resultData 含真实钩子文案) |
| 右栏·AI 搜集素材 | 候选逐条 改/删(CollabField) | 就地编辑 title/why_relevant,× 删除 | `ai.tasks.results.patch` + `ai.tasks.confirm`(adopt-candidate-card.tsx:259-293) | 代码链路完整;采纳点击未验证(写操作,审计不执行) |
| 右栏·AI 搜集素材 | 「原文」链接 | 打开素材 url | m.url(gather-material-island.tsx:93-103) | **dead-by-data**:runner 摊平时 url 恒为 ""(ai-worker research-node.ts:84-104),链接永不渲染 |
| 右栏·研究笔记 | 笔记行 编辑/删除按钮 | 编辑=新增修订;删除=归档 | `knowledge.revisions.create` / `knowledge.archive`(research-notes-island.tsx:52-57,70-74) | 接线真,但 **UI 不可达**:笔记恒为空(见 1.4),按钮从未渲染过 |
| 右栏·研究笔记 | 「添加笔记」按钮 + 表单 | **对第一条笔记的 KnowledgeItem 追加修订** | notes[0].knowledgeId 作目标(research-notes-island.tsx:44-46,181) | **dead**:notes 空 → addTargetKnowledgeId=null → 按钮隐藏,**永远无法创建第一条笔记**;且语义错(见 1.6 B2) |
| 右栏·证据收藏 | 「关联证据」按钮 | 建 supports 关系 | `knowledge.relations.create`(evidence-collection-island.tsx:42-55) | 接线真;**点击无任何可见反馈**(页面无处渲染 relations),live 未点(写操作) |
| 右栏·证据收藏 | 「取消关联」按钮 | 删 supports 关系 | `knowledge.relations.delete`(evidence-collection-island.tsx:57-70) | 同上;两按钮恒并排显示,无关联状态可见 |
| 右栏·相关标签 | 标签 chips | 跳 `/search?tag=<name>` | Link(research-workspace-page.tsx:326-333) | **半 dead**:search 页只读 `q`,完全忽略 `tag` 参数(search/page.tsx:34-35),落到空搜索页 |

### 1.3 数据来源(四桶归类)

| 数据 | 来源链 | 真伪桶 |
|---|---|---|
| 项目创意标题/摘要 | projects.get → projects service → projects 表 | **real** |
| 定位契合度分数 | positioning.gate.evaluate → 确定性 scorer(读 positioning_statements) | **real** |
| 趋势卡(canonical 4 项目) | selectors/research.ts:94-116 硬编码「浏览器市场 2.8 亿用户 / AI Native 浏览器赛道 +42% / 已收集 120 份用户调研样本」;buildTrendCards **无视 projectId**(`void projectId`) | **fixture(跨项目泄漏)** |
| 趋势卡(其余项目) | research-workspace-data.ts:235 置空 | 诚实空态 |
| 资料收集列表 | materialLinks.list → knowledge.get → knowledge_items 表 | **real**(当前全空,live 验证) |
| 研究笔记 | 同上,过滤 knowledgeType='note' + revisions.list 取头修订 | **real 但无生产者**(恒空,见 1.4) |
| 证据收藏(canonical) | fixture buildEvidence(research.ts:177-206,canonical 知识条目 id) | **fixture** |
| 证据收藏(真项目) | research-workspace-data.ts:243 置空 | 诚实空态 |
| 相关标签(canonical) | fixture entityTags 或兜底 ["AI","浏览器"](research.ts:208-220) | **fixture** |
| AI 素材候选 | ai.tasks.results.list → ai_task_results 表(真模型输出) | **real**(live 验证真实文案) |

### 1.4 数据流向 + 关键事实

**写路径:**
- gather 采纳(confirm)→ `knowledge.createKnowledge(knowledgeType:"reference")` + `materialLinks.create(role:"reference", stage:"research")`(ai.service.ts:503-542)→ 回流本页资料收集(source 列标「文章」)与策划页关键素材。
- 笔记编辑/删除 → knowledge.revisions.create / knowledge.archive(当前 UI 不可达)。
- 证据关联/取关 → knowledge.relations.create/delete(写了但页面看不见)。

**关键事实(live 验证):**
1. **material_links 表当前全库为空**(canonical 4 项目 + dy-proj-* 全部 total=0)→ 资料收集/研究笔记在**所有项目上都是空态**,包括旗舰 demo 项目 project-ainativebrowser(live:「暂无研究笔记」)。
2. **笔记无任何生产者**:唯一落知识的路径 gather 采纳建的是 `reference`(ai.service.ts:522),永远不产 `note` + 项目关联 → 研究笔记卡是**结构性死区**(空态 → 添加按钮隐藏 → 死锁)。
3. **fixture 跨项目泄漏(live 证明)**:`/projects/project-podcast-launch/research`(播客项目)渲染出「浏览器市场 2.8 亿用户 / AI Native 浏览器赛道 / Arc·Dia 用户调研 / 已收集 120 份用户调研样本 / 本地优先栈趋势」——**播客项目满屏浏览器行业假数据**。selectors 全部 `void projectId`(research.ts:93,120,157,178)。用户的「怪怪的」大概率源于此类。
4. **T-030 重建管线的研究产物在本页不可见(live 证明)**:reconstruct.project(30 个 succeeded)把研究重建写成 `trend_analysis` artifact(origin='reconstructed',真内容:coreTopic/keyPoints/dataPoints/cases,live 验证 artifact-764bd7c1-691 v2)。但研究页只读 materialLinks/knowledge,**没有 artifacts 读侧** → `/projects/project-f0ea420f-611/research` 页面上「研究重建」内容零渲染(live grep 无命中)。花真金白银跑出来的重建研究,研究页展示不了。
5. gather 节点**不做 web 搜索**(research-node.ts:19-21 注释明示:纯结构化生成,不挂 web search;anthropicWebSearchTools 仅导出备用)→ UI 文案「AI 搜集素材/帮我搜素材」名不符实,产出 url/source 恒空。
6. brief 为空时,占位符「（暂无项目立意，去策划阶段补充）」被当作 `angle` 传进 AI prompt(research-workspace-data.ts:112,231 → gather-material-island.tsx:156 → research-runner.ts:53-57,70)。

### 1.5 设计不合理

| # | 问题 | 严重度 |
|---|---|---|
| D1 | fixture 跨项目泄漏:canonical 项目一律显示 AI 浏览器主题的趋势卡/证据/标签,与项目内容无关(播客项目显浏览器数据) | **high** |
| D2 | 研究笔记结构性死锁:空态隐藏添加按钮,且系统无任何 note 生产者 → 整卡永久空转 | **high** |
| D3 | 重建研究(trend_analysis artifact)与研究页读侧(knowledge/material-links)存储语义割裂,重建成果不可见 | **high** |
| D4 | 「搜集素材」不搜网,纯生成;「原文」链接永不出现 → 用户期望被文案误导 | medium |
| D5 | 资料类型 tabs 纯装饰不筛选(T-018 同类 bug 未修到研究页) | medium |
| D6 | 证据收藏交互无反馈闭环:关联/取关写了 relations 但页面无处读,点了"没反应" | medium |
| D7 | 相关标签 → /search?tag= 断链(search 页不消费 tag) | medium |
| D8 | 采纳后的钩子/金句在资料收集里 source 列显示「文章」(reference→文章 映射,research-workspace-data.ts:117-126),类型语义错位 | low |
| D9 | 「已收集 120 份用户调研样本」等描述硬编码在 fixture,看起来像动态统计 | low |

### 1.6 疑似 bug

| # | 描述 | 证据 | 严重度 |
|---|---|---|---|
| B1 | 资料类型 tabs 点击不筛选(装饰 tabs) | research-workspace-page.tsx:263-265 无 onValueChange/TabsContent;注释 302-304 自认 no-op | medium |
| B2 | 「添加笔记」= 对第一条笔记追加修订 → **覆盖第一条笔记的显示内容**而非新增一行(读侧取最大 revisionNumber 为唯一内容,research-workspace-data.ts:100-105);且 notes 空时按钮隐藏 → 第一条笔记永远建不出来 | research-notes-island.tsx:44-46,176-186 | **high**(当前被"恒空"掩盖,一旦有笔记即触发) |
| B3 | 相关标签链接 /search?tag= 参数被忽略 | research-workspace-page.tsx:326-333 vs app/(creator)/search/page.tsx:34-35(只读 q) | medium |
| B4 | 关联证据/取消关联点击后无可见变化(无 relations 读侧;两按钮无状态互斥) | evidence-collection-island.tsx:42-70,100-119 | medium |
| B5 | 重建研究内容在研究页不可见 | live:research-recon.html 无「研究重建/核心主题」命中;research-workspace-data.ts 无 artifacts 读 | **high** |
| B6 | 占位符文本污染 AI 输入(angle=「（暂无项目立意…）」) | research-workspace-data.ts:112,231 → research-runner.ts:70 | low |

---

## 二、策划工作台 `/projects/[id]/planning`

### 2.1 功能定位

七步流水线第 3 步(策划):产三份关键产物——**内容合同**(受众/价值/节奏/CTA 四承诺)、**论点树**(核心/支撑/证据/反驳)、**结构方案**(脚本阶段的入口票)。T-018 后瘦身为两个真 tab(内容合同/论点树),砍掉三个空壳 tab(受众洞察/差异化亮点并入合同,证据地图并入论点树侧栏)——**合宪法**(§5 AI 产候选人确认;§8 未越界)。三个 AI 节点(planning.thesis/contract/outline)全部走 runStructuredNode 跨模型路径(persistence-client.ts:2408-2472),符合架构铁律 §9.1。

入口链:`app/(creator)/projects/[projectId]/planning/page.tsx:31-55` → `buildPlanningWorkspaceViewModel`(planning-workspace-data.ts)→ `PlanningWorkspacePage` + 3 个 island。

页面可达性(live):`/projects/dy-proj-00/planning` → 200,渲染真项目题+脚手架合同+空论点树+3 个 AI 按钮。

### 2.2 区块与交互清单

| 区块 | 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|---|
| 页签区 | 内容合同 / 论点树 两 tab | 真切换面板(forceMount 保 island 状态) | Radix TabsContent(planning-tabs-region.tsx:71-105) | works(T-018 修复后) |
| 内容合同 | 4 张承诺卡 | 展示(草案/已确认徽标) | 采纳过 → content_contract artifact 当前版 contentData.cards(planning-workspace-data.ts:160-193);否则 fixture 脚手架 | works;canonical 项目前两张**硬编码「已确认」**(selectors/planning.ts:142-151),假审批状态 |
| 内容合同 | 「查看全部」按钮 | 无 onClick | 无 | **dead**(planning-workspace-page.tsx:209-216) |
| 内容合同 | AI 内容合同 island「帮我生成内容合同」 | createAITask → 轮询 → 审阅 → 采纳为新版本 | planning.contract → runPlanningContract(persistence-client.ts:2434-2461)→ confirm artifact_version 分支透传 contentData(ai.service.ts:872-900 附近) | works(live:dy-proj-00 存在 awaiting 任务,resultData 为真实合同文案);采纳点击未验证(写) |
| 论点树 tab | 核心论点卡 | 展示 project.title + brief | planning-workspace-data.ts:421-427 | works,但**语义错位**:项目标题被当"核心论点"(导入项目显示「未命名作品」为核心论点) |
| 论点树 tab | 论点树四列(核心/支持/证据/反驳) | 展示节点 | thesis_tree artifact 当前版 contentData.nodes(planning-workspace-data.ts:199-240);无则 canonical fixture / 空 | works(live:重建项目 f0ea420f-611 的 v2 5 节点将被读到;dy-proj-00 空 →「暂无数据」×4) |
| 论点树 tab | AI 论点树 island「帮我搭论点树」 | 同 AdoptCandidateCard 循环 | planning.thesis → runPlanningThesis(persistence-client.ts:2408-2431) | works(链路同 contract);采纳点击未验证(写) |
| 论点树 tab | AI 结构方案 island「帮我生成结构方案」 | 同上,产结构类型/开头/段落/结尾/CTA | planning.outline → runPlanningOutline(persistence-client.ts:2464-2489) | works;**但采纳后本页无任何读侧展示结构方案**(见 2.5 D4) |
| 右栏 | 证据地图 | 展示置信度行 | canonical = fixture evidenceLinks(planning.ts:240-257,恒 av-ainativebrowser);真项目 = 空(planning-workspace-data.ts:434) | fixture/空;无生产者 |
| 右栏 | 关键素材 + 「全部素材」按钮 | 展示 planning/research 阶段用料链 | materialLinks.list → assets.get/knowledge.get 扇出(planning-workspace-data.ts:252-314) | 读侧 real(当前全空);**「全部素材」按钮 dead**(planning-workspace-page.tsx:434-441 无 onClick) |

### 2.3 数据来源(四桶归类)

| 数据 | 来源链 | 真伪桶 |
|---|---|---|
| 核心论点标题/正文 | projects.get(title/brief) | **real**(但语义=项目题,非论点) |
| 论点树节点(采纳/重建后) | artifacts.list → artifacts.versions.list 最大版本 contentData.nodes | **real**(live 验证 f0ea420f-611 v2 有 5 真节点) |
| 论点树节点(canonical 未采纳) | fixture thesisNodes,恒 av-ainativebrowser(planning.ts:177-205 `void projectId`) | **fixture(跨项目泄漏)** |
| 内容合同卡(采纳后) | content_contract 当前版 contentData.cards | **real** |
| 内容合同卡(未采纳) | CONTRACT_CARDS 脚手架(planning.ts:64-89);canonical 前两张状态 approved | **hardcoded 脚手架**(有「策划脚手架,随 AI 生成回填」说明,算半诚实;**approved 状态是假的**) |
| 证据地图 | canonical fixture / 空 | **fixture** / 诚实空态 |
| 关键素材 | materialLinks 扇出 | **real**(当前空) |
| AI 候选(三节点) | ai.tasks.* 全家桶 | **real** |

### 2.4 数据流向

**写路径:**
- 三 island 采纳 → confirm artifact_version 分支 → `artifacts.createVersion(createdByType:"ai")` 追加不可变版本 → 读侧最大 versionNumber 回显(合同/论点树)。SEAM:结构方案/论点树/合同喂脚本阶段。
- **⚠️ 页面 GET 即写库(write-on-read)**:`resolveArtifactId` 在项目缺 thesis_tree/content_contract/content_outline 时**当场 createArtifact**(planning-workspace-data.ts:127-154,371-394)。live 证据:dy-proj-00 存在 3 个自动建的 planning artifacts(artifact-764bd7c1-657/659/661,各带空 v1),恰为页面浏览副产物。含义:
  1. 看一眼策划页 = 给项目建 3 个实体(46 个导入历史项目逐个点开会批量造实体);
  2. Next.js Link prefetch 可能在 hover 时就触发建实体;
  3. 与「确认门:AI/系统不擅写领域实体」的产品直觉相悖(虽然建的是空容器,不算 AI 产物)。
- reconstruct.project(T-030,非本页触发)写 thesis_tree(origin='reconstructed')→ 本页论点树**能**读到(与研究页形成对照:策划读侧兼容重建,研究读侧不兼容)。

### 2.5 设计不合理

| # | 问题 | 严重度 |
|---|---|---|
| D1 | 页面 GET 副作用建 3 实体(write-on-read),历史/导入项目被动污染 | **high** |
| D2 | canonical 项目内容合同前两张硬编码「已确认」——假审批状态,用户以为自己确认过 | medium |
| D3 | 论点树 fixture 跨项目泄漏(canonical 非浏览器项目也显示 AI 浏览器论点树;同研究页 D1 同源) | **high** |
| D4 | 结构方案采纳后本页无读侧:AI 结构方案 island 采纳完成即回 idle,成品去哪了页面上不可见(只能等脚本阶段消费),用户闭环断裂 | medium |
| D5 | 「查看全部」「全部素材」两个死按钮 | medium |
| D6 | 「核心论点」卡显示项目标题:标题≠论点,导入项目显示「未命名作品」当核心论点,观感荒谬 | medium |
| D7 | AdoptCandidateCard 能力不一致:研究 gather 候选可逐条改/删,策划三节点只能整批采纳(rawItems 只认 resultData.items,adopt-candidate-card.tsx:127-131,256),同一组件两种行为无任何提示 | low |
| D8 | 证据地图与关键素材同栏但诚实度不同:一个 fixture 一个真空态 | low |

### 2.6 疑似 bug

| # | 描述 | 证据 | 严重度 |
|---|---|---|---|
| B1 | 页面浏览自动建 artifacts(write-on-read) | planning-workspace-data.ts:127-154;live:dy-proj-00 三个 artifact-764bd7c1-* 空 v1 | **high** |
| B2 | canonical 合同卡假「已确认」状态 | selectors/planning.ts:142-151(index<2 → approved) | medium |
| B3 | 论点树/证据地图 fixture 无视 projectId(跨项目内容泄漏) | planning.ts:177-205,240-257(`void projectId` + 恒 av-ainativebrowser) | **high** |
| B4 | 潜在双 thesis_tree 竞态:重建管线与页面 getOrCreate 都会建 thesis_tree,`rows.find()` 取第一个,island 写与读侧可能指向不同 artifact(当前库未复现,标注**未验证**) | planning-workspace-data.ts:140-141 vs reconstruct 写入路径(persistence-client.ts:2762) | low(未验证) |
| B5 | 术语不一致:页面列名「支持依据」vs island 徽标「支撑依据」 | planning-workspace-page.tsx:90 vs planning-thesis-island.tsx:31 | low |

---

## 三、跨页待对齐点(供全局对齐分析)

1. **fixture 泄漏是「怪」的主源**:宪法 §7 明令「替换所有 mock/seed」,但 4 个 canonical demo 项目仍从 selectors 注入 AI-浏览器主题的趋势卡/证据/标签/论点树/假审批状态,且 selector 全部无视 projectId → 任何 canonical 项目(含播客)显示同一套浏览器假数据(live 证明)。要么把 canonical demo 项目从产品移除,要么让 fixture 按项目主题走。
2. **研究产物存储语义分裂**:重建管线写 `trend_analysis` artifact,研究页读 knowledge/material-links——同一"研究"两套互不相通的存储;策划页(读 artifact)能吃到重建,研究页吃不到。需要统一「研究产物 = artifact」或补研究页 artifact 读侧。
3. **「搜集素材」文案 vs 纯生成现实**:全站对 AI 能力的措辞需统一口径(搜/生成/整理),避免暗示不存在的 web 检索。
4. **source/origin 语义不一致**:dy-proj-*(老导入种子)source='manual',新导入项目 source='imported';reconstruct §5 守卫只认 imported → 老导入作品永远不能重建。命名口径需 T-030 对齐。
5. **AdoptCandidateCard 逐条编辑能力**只对 `resultData.items` 形节点生效,四个策划/研究节点行为不一致,组件契约需显式化。
6. **知识条目类型 ↔ 页面分类映射**(reference→文章,transcript→视频,其余→资料)过于粗糙:钩子/金句都算「文章」;研究页 tabs 的报告/播客两类永远没有对应生产者。
7. **空态死锁模式**(研究笔记):「列表空 → 隐藏添加入口」在别处如有复用需一并排查。
8. 术语:「数据点」(guide 卡)vs「数据」(徽标/前缀);「支持依据」vs「支撑依据」。

## 四、验证登记(诚实清单)

**live 验证过(只读)**:两路由 200;projects.get / materialLinks.list / knowledge.get / knowledge.revisions.list / artifacts.list / artifacts.versions.list / positioning.gate.evaluate / ai.tasks.list / ai.tasks.results.list 全部返回真库数据;播客项目研究页 fixture 泄漏;重建项目研究页内容不可见;dy-proj-00 策划页渲染与 3 个自动建 artifact。

**未验证(写操作,审计禁做)**:三 AI 节点「采纳」点击后的落库回显;笔记编辑/删除(UI 当前不可达);证据关联/取关点击;AdoptCandidateCard 浏览器内水合恢复(P4)实际表现;B4 双 thesis_tree 竞态。
