# 产品审计:/knowledge 知识库 + /experience 经验沉淀

> 审计日期 2026-07-02 · 分支 refactor/agent-and-structure · dev server :3000 实测(只读)。
> 四桶口径:real(真库数据)/ fixture(种子/canonical)/ hardcoded(组件写死)/ planned(诚实「规划中」占位)。
> 所有结论带证据(file:line 或 curl 实测);未验证处显式标注。

---

## 一、/knowledge 知识库

### 1.1 功能定位

全局资源中心:沉淀笔记 / 参考 / 片段(snippet)/ 记录(transcript)/ 灵感,给创作过程复用。对照宪法 §7「数据底座喂知识库(可复用 Hook/金句)」——**方向合定位**,实测库里确有 T-030 导入的抖音金句/文案(real)。与七步流水线的关系是横向支撑:研究阶段产资料、复盘阶段产金句,策划/脚本阶段取用。不违反 §8 边界(无编辑器、无视频类型、无变现)。

**但有一个致命断点:页面只能看到条目标题,看不到任何条目内容**(详见 1.5-D1)——作为「知识库」,知识本体不可读。

### 1.2 区块与交互清单

页面结构(knowledge-page.tsx:146-169):新建知识区 → 工具栏(搜索+chips)→ 5 指标卡 → 三栏 grid(分类 | 最近更新表 | 洞察栏)→ 修订表单(选中行后)→ 知识图谱。

| 区块 | 元素 | 点了发生什么 | 接线 | 状态 |
|---|---|---|---|---|
| 新建知识区 | 「新建知识」按钮 | toggle 内联表单 | 本地 state(knowledge-interactive-region.tsx:213-222) | works(实测 HTML 有渲染) |
| 新建知识区 | 表单(标题/类型×5/内容/保存) | `client.createKnowledge` → `router.refresh()` | op `knowledge.create`(contract/src/operations/knowledge.ts:24;persistence-client.ts:1063 装配 knowledge transport) | works-by-code(写路径完整;写操作未实测——审计只读纪律) |
| 工具栏 | 搜索输入 | client 端过滤 recent 列表(title+tags 子串)+ URL `?q=` 镜像 | knowledge-interactive-region.tsx:183-202 | works;**但 placeholder 称可搜「关联项目」,实际只搜标题+标签**(:372 vs :199) |
| 工具栏 | 筛选 chips(全部/参考/笔记/片段/记录) | client 端按类型过滤 | :58-64, :196 | works;缺「灵感」chip(可创建 inspiration 类型但无法筛选,:66-75 注释自认) |
| 指标卡 ×5 | 无交互 | — | display only | works(展示) |
| 知识分类面板 | 分类行 | **无 handler** | F1d 注释「intentionally inert」(:304-310) | dead(装饰);与 chips 同维度但一个能筛一个不能 |
| 最近更新表 | 行点击 | 选中高亮 + 页面底部出现「添加修订」表单 | :123, :584 | works |
| 修订表单 | 「保存修订」 | `client.createKnowledgeRevision` → refresh | op `knowledge.revisions.create`(contract knowledge.ts:46) | works-by-code(未实测写) |
| 热门标签 | tag chip | `Link href="/knowledge?q=<name>"`(KNOW-13 已从死参 `?tag=` 改到搜索) | :675-682 | works;**但当前永远空**(taxonomy.tags.list 实测 0 条,且全前端无任何创建/绑定 tag 的 UI) |
| 记忆洞察 | 洞察条目 | 无 handler | inert(F1d) | dead(展示) |
| 未整理 | 条目行 | 无 handler | inert(F1d:「categorize → knowledge.relations.create, deferred」) | dead;**「未整理」没有任何整理动作可做** |
| 可复用片段 | 片段行 | 无 handler | inert(F1d:「insert into script — belongs to Artifacts」) | dead;卡片描述「快速插入到脚本的模板」与实际(不能插入)不符 |
| 知识图谱 | 折线图 | 无交互 | display only | works(展示,但见 1.5-B2 语义问题) |

### 1.3 数据来源(四桶)

| 数据 | 来源链 | 桶 | 证据 |
|---|---|---|---|
| 5 指标卡:知识条目 26 / 本周新增 15 / 知识关联 2 / 复用片段 1 | `knowledge.list` + `knowledge.relations.list` fan-out → knowledge module service/repo → knowledge_items / knowledge_relations 表 | real | curl knowledge.list 返回 26 条;渲染 HTML「知识条目 26 … 知识关联 2」实测 |
| 指标卡:记忆命中率 | 无读 op | **planned**(value "—" delta「规划中」) | knowledge-data.ts:305-315;渲染实测 |
| 知识分类(参考17/记录6/笔记2/片段1) | 同 knowledge.list client 侧 tally | real | knowledge-data.ts:327-343;渲染实测 |
| 最近更新表 26 行(标题/类型/更新时间) | knowledge.list → buildRecentRowsFromItems | real | 渲染实测 26 行 |
| **最近更新表的「标签」列** | `canonicalDataset.entityTags` + `canonicalDataset.tags`(前端 fixture 文件!) | **fixture** | selectors/knowledge.ts:361 `tags: tagsForKnowledge(item.id)` → :380-387 读 canonicalDataset;实测「Hook 公式」行显示 fixture 标签「Hook」,而真 op taxonomy.tags.list 返回 0 |
| 热门标签 | `taxonomy.tags.list`(real op) | real(实测空 →「暂无标签」) | curl 返回 total 0;渲染「暂无标签」 |
| 记忆洞察(高关联条目×2) | relations fan-out 派生(degree 排名) | real(派生) | knowledge-data.ts:437-460;渲染实测 2 条 |
| 未整理(8 条金句) | knowledge.list − 有边条目 | real(派生;语义=「无关联边」) | knowledge-data.ts:377-397;渲染实测 |
| 可复用片段列表(1 条「Hook 公式」) | knowledge.list 过滤 snippet | real | 渲染实测 |
| **片段的 preview 文案「可复用片段」** | 组件写死字面量(不取内容) | **hardcoded** | knowledge-data.ts:362-365 `preview: "可复用片段"` |
| 知识图谱 series | relations 边按类型端点计数 | real(派生;但 UI 文案说是「条目数」——错标,见 B2) | knowledge-data.ts:406-429;渲染 summary「共 4 条,最多的类型是 参考(2 条)」 |
| 库内容本身的构成 | 26 条 = T-030 抖音导入金句/文案(dy-know-* 与 knowledge-f80c3125-* 等)+ canonical 种子 5 条(Hook 公式/发布前自检清单/访谈01/本地优先栈趋势/Arc-Dia 调研) | real 表中混有 seed 起源行 | curl 实测 id 前缀分布 |

### 1.4 数据流向(写路径)

- 新建知识表单 → `knowledge.create`(island → HTTP dispatch → persistence-client → knowledge transport → service → PG knowledge_items + 首版 revision)→ `router.refresh()` 重新 SSR。
- 修订表单 → `knowledge.revisions.create` → knowledge_revisions 表。
- 其它入库来源(非本页触发):AI 素材搜集 confirm(material_list → KnowledgeItem)、T-030 导入。
- **无删除/归档 UI**(contract 有 `knowledge.archive`,页面不消费)。
- **无 tag 写路径、无 relation 写路径**(contract 有 op,全前端无消费者;grep 证据见 1.5-D2)。

### 1.5 设计不合理

| # | 严重度 | 问题 | 证据 |
|---|---|---|---|
| D1 | high | **知识条目内容不可读**:无 /knowledge/[id] 详情路由,页面无任何地方展示条目 content;`knowledge.get` / `knowledge.revisions.list` 在 knowledge feature 内零消费。用户存了金句/文案,只能看见标题。修订表单能「往看不见的内容上追加修订」——盲写 | `find app -type d` 只有 knowledge/ 平级目录;grep getKnowledge/listKnowledgeRevisions 在 features/knowledge/ 无命中 |
| D2 | high | **标签体系没有生产端**:全前端无 `taxonomy.tags.create` / `entityTags.assign` 消费者 → 热门标签块永远空、表格标签列永远只剩 canonical fixture。一个读侧做真、写侧不存在的半吊子体系 | grep -rln createTag/assignEntityTag 在 features+components 零命中;curl tags.list=0 |
| D3 | medium | 「未整理」语义隐晦(=无关联边,非用户认知的「没归类」),且无任何整理动作(关联创建 op 无 UI);这个列表对用户是永久死结 | knowledge-data.ts:369-376 注释;F1d 注释「deferred」 |
| D4 | medium | 同一 knowledgeType 维度三处重复展示(分类面板 / 筛选 chips / 图谱),其中分类面板 inert、chips 可筛——同概念交互不一致 | knowledge-interactive-region.tsx:486-532 vs :382-403 |
| D5 | medium | 可复用片段 preview 是写死「可复用片段」四个字,无内容预览;描述承诺「快速插入到脚本」但无动作 | knowledge-data.ts:362-365;:763 |
| D6 | low | 「最近更新」卡实际渲染全部 26 条(buildRecentRowsFromItems 不截断),名实不符;>200 条时 pageSize=200 静默截断 | knowledge-data.ts:159-162, selectors/knowledge.ts:348-363;渲染 26 行 |
| D7 | low | 搜索 placeholder 称「搜索条目、标签或关联项目」,实际只搜标题+标签 | :372 vs :193-202 |
| D8 | low | relations fan-out 是 N 并发请求/条目(26 条=26 次 dispatch,200 条=200 次) | knowledge-data.ts:220-249 |

### 1.6 疑似 bug

| # | 严重度 | 描述 | 证据 |
|---|---|---|---|
| B1 | high | **同页同概念双数据源矛盾**:表格标签列走 canonical fixture(「Hook 公式」行显示「Hook」「知识」等),热门标签块走真 op(显示「暂无标签」)。用户看到行上有标签、标签云说没有标签 | selectors/knowledge.ts:380-387 vs knowledge-data.ts:468-491;两者渲染实测并存 |
| B2 | high | **知识图谱错标**:SectionCard 描述「按类型分布的条目数」、ChartFrame 描述「按类型聚合的知识条目数」,但 series 值是**关联边端点计数**——库里 17 条「参考」,图上「参考=2」。summary「共 4 条」指边端点,不是条目 | knowledge-page.tsx:184-193 vs knowledge-data.ts:406-429;渲染 summary 实测 |
| B3 | medium | relations 读全部失败时 `buildUnsorted` 返回 [] → 渲染「全部已整理」——读失败被展示成「全部已整理」的假好消息 | knowledge-data.ts:381 `if (edges === null) return []` + :731-737 空态文案 |
| B4 | low | 记忆洞察块是四个洞察栏块中唯一没有空态文案的(0 洞察时渲染空白卡) | knowledge-interactive-region.tsx:689-717(对比 PopularTags :661-668 有空态) |
| B5 | low | 修订表单渲染在 grid 之下、远离所选行,且不显示所选条目标题——不知道在给谁写修订 | knowledge-interactive-region.tsx:311-338 |

### 1.7 待对齐点

- 「知识图谱」用折线图表达分类分布,与名称承诺(节点-边图)不符;其它页面 ChartFrame 语义是趋势。
- 空态/错误态纪律:本页是诚实 tri-state(error → ErrorState;空 → EmptyState)——**姊妹页 /experience 不是**(读失败回退整套 fixture),同产品两种纪律。
- 「规划中」标注手法(value "—" + delta 规划中)值得全局统一推广。

---

## 二、/experience 经验沉淀

### 2.1 功能定位

复盘飞轮的经验资产库:Learning(经验)的管理面——查看 / 验证 / 废弃 / 应用到项目 / **回流到校准**(生成 CalibrationRuleSuggestion,由校准中心采纳)。直接对应宪法 §3 飞轮「沉淀经验回流让下一条更准」与 §5 原则 4「复盘必须反向沉淀经验回流」。**定位正确,回流到校准是宪法级正确的机制**;问题在执行质量(见下)。

### 2.2 区块与交互清单

页面结构(experience-page.tsx:166-193):顶部 7-tab → 主列(4 摘要卡 → 最近发现 → 6 分类卡 → 记录表带筛选 tabs)→ 右栏(价值概览 → 应用效果图 → 热门经验 → 快速记录)。

| 区块 | 元素 | 点了发生什么 | 接线 | 状态 |
|---|---|---|---|---|
| 顶部二级导航 | 7 个 tab(全部/选题策划/…/复盘沉淀) | **只切换自身高亮,页面内容零变化** | PageTabs 无 `onValueChange`、无 TabsContent(experience-page.tsx:199-218;page-tabs.tsx 注释「does NOT own page routing」但调用方也没接) | **dead**(实测 HTML:Radix tabs,aria-controls 指向不存在的 content) |
| 记录表上方 | 又一排 7 个同名 tab | client 端筛选记录表(不发请求) | experience-interactive-region.tsx:159-183, :142-145 | works |
| AI 洞察总结 | 4 摘要卡 | 无交互 | display | works(展示;数据半真半假见 2.3) |
| 最近发现 | 列表行 | 无交互 | display | works(展示) |
| 经验库分类 | 6 卡 | 无交互(不联动筛选 tabs) | display | works(展示) |
| 记录表 | 「应用经验」 | `learnings.applications.create(learningId, applyTargets[0])` → refresh | contract learnings.ts:42-53;island :89-100, :241 | **works-but-wrong:永远应用到列表第一个项目**(实测 applyTargets[0]=project-podcast-launch,种子演示项目),无项目选择器 |
| 记录表 | 「验证」/「废弃」(仅 candidate 行) | `learnings.evaluate` → refresh | contract :54-66;island :102-113 | works-by-code(未实测写) |
| 记录表 | 「回流到校准」 | `learnings.calibrationSuggestions.create` → 成功显示「已回流到校准」/ 失败显示「需先有 Rubric」 | contract :72-87;island :123-140;backend learnings.transport.ts:92 已注册 | works-by-code(未实测写) |
| 右栏 | 价值概览 / 应用效果图 / 热门经验 | 无交互 | display | works(展示;应用效果图是 fixture,见 B3) |
| 快速记录 | 「新建经验」「从项目导入」「记录失败案例」3 按钮 | **一键** `learnings.create({title: 按钮文案, insight: ""})` → refresh,无任何表单/选择 | island :318-334;backend learnings.service.ts:279-291 | **works-but-wrong**:实测库里已有 6 条垃圾(标题=「新建经验」×2「从项目导入」×2「记录失败案例」×2,insight 全空);「从项目导入」不导入任何项目;「记录失败案例」建出来的是 strategy 类型 |

### 2.3 数据来源(四桶)

| 数据 | 来源链 | 桶 | 证据 |
|---|---|---|---|
| 记录表 10 行(标题/分类/更新/复用次数/状态) | `learnings.list` → learnings module → learnings 表(reuseCount 由 learning_applications 聚合) | real | curl 实测 10 条;渲染 10 行 |
| 4 摘要卡的 **value**(10 / 3 / 10% / 7) | 同 learnings.list client 侧计数 | real | experience-data.ts:151-186;渲染实测 |
| 4 摘要卡的 **delta/trend**(▲+18 / ▲+12 / ▲+4% / ▼-3) | DEFAULT_SUMMARY_CARDS 原样保留 | **fixture** | selectors/experience.ts:48-81;experience-data.ts:171-185 只 patch value;渲染实测「总经验沉淀 10 ▲ +18」 |
| 最近发现 4 行 | learnings.list 最新非废弃 top4 | real(但内容被垃圾记录污染:实测 3/4 行是「记录失败案例/从项目导入 · 置信度 0」) | experience-data.ts:294-302;渲染实测 |
| 经验库分类 6 卡 counts(8/1/0/0/0/1) | learnings.list 按 learningType→分类 tally | real | experience-data.ts:194-217;渲染实测 |
| 价值概览(总10/已验证3/复用率10%/待改进7) | 同上 real 计数 | real | experience-data.ts:224-242;渲染实测 |
| **应用效果折线图**(2月24→6月84,summary「最近 5 月经验被引用 264 次,整体上升」) | `fixtureVm.applicationEffect` 直通 | **fixture**(无任何「规划中」标注,以真数据口吻陈述) | experience-data.ts:318-320;selectors/experience.ts:192-201;summary 硬造「整体上升」experience-page.tsx:519-521;渲染实测「264 次」 |
| 热门经验(1 条,被引用 1 次) | learnings.list 按 reuseCount>0 排序 | real | experience-data.ts:250-263;渲染实测 |
| tabs 7 项 / 快速记录 3 按钮 | fixture 结构常量 | fixture(结构性,可接受) | selectors/experience.ts:33-41, :224-240 |
| 应用目标(applyTargets) | `projects.list`(page1 size50) | real;**但后端忽略 pageSize,实测返回全量 139 条,meta 谎报 pageSize 50** | curl 实测(pageSize=5 也返回 139);page.tsx:47-60 |
| **读失败整页回退** | learnings.list throw → `buildExperienceViewModel()` 整套 fixture(642/386/62%/24 + 假发现 + 假记录) | **fixture 回退(无错误提示)** | experience-data.ts:277-285 |

### 2.4 数据流向(写路径)

- 快速记录 → `learnings.create`(title=按钮文案, insight="", 后端强制 learningType="strategy"、confidenceScore=0)→ learnings 表。
- 应用经验 → `learnings.applications.create` → learning_applications 表(带 project 所有权门),reuseCount 派生自该表。
- 验证/废弃 → `learnings.evaluate` → validationStatus 状态机。
- 回流到校准 → `learnings.calibrationSuggestions.create` → calibration_rule_suggestions 表(校准中心读端采纳)。
- 另一条入库路径(非本页):复盘页 promoteReviewInsight(带真实 learningType)。

### 2.5 设计不合理

| # | 严重度 | 问题 | 证据 |
|---|---|---|---|
| D1 | high | **双 tab 行,一死一活**:顶部「经验沉淀二级导航」7 tab 与记录表上方「经验分类筛选」7 tab 文案完全相同;顶部纯死(只改自身高亮),下方才真筛。用户第一反应点顶部 → 无反应 →「怪」 | experience-page.tsx:178+199-218(无 onValueChange)vs experience-interactive-region.tsx:159-183;渲染实测两排 tablist |
| D2 | high | **快速记录无录入过程**:三个按钮一键落库,标题=按钮文案、内容为空——违背「快速记录」本意(记录=有内容);「从项目导入」应有项目选择、「记录失败案例」应落 failure 类型,均没有。产生的垃圾直接污染摘要卡计数、最近发现、分类计数(自我污染循环) | island :318-334;service :279-291;curl 实测 6/10 条为此类垃圾 |
| D3 | medium | 分类术语三重不对齐:①六分类(选题策划/脚本结构/拍摄执行/后期剪辑/互动运营/失败案例)与宪法七步(立项→研究→策划→脚本→制作→发布→复盘)阶段名不对应,代码注释却自称「七步 tab filter」;②同一桶双名——failure 类型在记录表 chip 显示「复盘沉淀」、分类卡显示「失败案例」;③「拍摄执行/后期剪辑」沿用通用创作流程词而非本产品词汇(与 §8「不做视频编辑器」虽不冲突——只是经验分类——但词面上容易让用户以为产品管拍摄剪辑) | experience-data.ts:53-79(LEARNING_TYPE_TO_CATEGORY:failure→复盘沉淀)vs :204-217(experience-failures 卡名「失败案例」计数取「复盘沉淀」桶);selectors/experience.ts:122-129 |
| D4 | medium | 「最近发现」在真数据下退化为记录表复读(同一批 learnings 的另一种排版),effectLabel 只剩「置信度 0」噪音;fixture 版承诺的效果数据(完播率+14%)真版无来源 | experience-data.ts:134-145;渲染实测 |
| D5 | low | 分类卡与筛选 tabs 不联动(点分类卡不筛表) | experience-page.tsx:409-454 无 handler |
| D6 | low | 验证后无法从 UI 撤销(validated 行不再显示任何评估按钮) | island :247-268(仅 isCandidate 渲染) |

### 2.6 疑似 bug

| # | 严重度 | 描述 | 证据 |
|---|---|---|---|
| B1 | high | 快速记录一键产垃圾 + 「记录失败案例」类型错置(后端 createLearning 写死 learningType:"strategy",失败案例进「选题策划」桶) | backend/src/modules/learnings/learnings.service.ts:285;curl 实测:6 条垃圾全部 learningType=strategy,渲染「记录失败案例 · 选题策划」 |
| B2 | high | 摘要卡 real value + fixture delta 拼接:「总经验沉淀 10 ▲+18」「待改进 7 ▼-3」数学上自相矛盾(总量 10 却周增 18) | experience-data.ts:171-185;selectors/experience.ts:48-81;渲染实测 |
| B3 | high | 应用效果图表纯 fixture 却以真口吻陈述:「最近 5 月经验被引用 264 次,整体上升」;同一右栏内「热门经验:被引用 1 次」「平均复用率 10%」直接打脸。无「规划中」或「示例数据」标注 | experience-data.ts:318-320;experience-page.tsx:519-521;渲染实测 264 vs 1 |
| B4 | high | 「应用经验」永远应用到 `applyTargets[0]`(实测=project-podcast-launch,canonical 种子项目)——用户无法选择目标项目,复用计数会持续灌进一个演示项目 | experience-interactive-region.tsx:87 `applyTargets[0]?.id`、:241;curl projects.list 首条实测 |
| B5 | medium | learnings.list 读失败 → 整页静默回退 642/386/62% fixture,无错误态(与 /knowledge 的诚实 error 态相悖) | experience-data.ts:277-285 |
| B6 | medium | `projects.list` 忽略 pageSize:请求 pageSize=5,meta 返回 pageSize=50,data 139 条全量(本页 applyTargets 消费该 op;bug 本体在 projects 后端,跨页影响) | curl 实测两次(50→139,5→139) |
| B7 | low | 顶部死 tab 的 aria-controls 指向不存在的面板(Radix Tabs 无 content),可访问性破缺 | 渲染 HTML `aria-controls="radix-…-content-all"` 无对应节点 |

### 2.7 待对齐点

- **两库分工没讲清**:/knowledge(KnowledgeItem:素材/金句/参考)与 /experience(Learning:结论/规律)是两套实体、两个入口、两种卡片语言,但页面 UI 都在说「沉淀」「洞察」「发现」——knowledge 有「记忆洞察」,experience 有「最近发现」,同为「系统提炼要点」。用户视角这是两个长得像又说不清差别的库。宪法 §7 其实分得清(知识库=可复用素材;经验=校准回流),页面没有把这个分工表达出来。
- **诚实度纪律不一致**(全产品对齐项):knowledge 页三态诚实 + 「规划中」占位;experience 页 fixture delta、fixture 图表、fixture 整页回退全部无标注。用户「怪怪的」的直接来源之一。
- **术语**:「复盘沉淀」vs「失败案例」同桶异名;六分类 vs 七步流水线词表不对齐。
- **快速记录 vs 确认门**:宪法 §5「AI 只产候选,人确认」——快速记录是人主动写,不违宪;但一键空记录违背「记录」的最低信息量,建议至少弹 title/insight/type 表单(仓内已有富录入弹窗先例,T-007 S0)。
- projects.list 分页失效是跨页面 bug,应在 projects 模块修,本页受益。

---

## 三、跨页综合判断(给对齐分析)

1. **两页读侧确实「做真」了大半**(knowledge.list / relations / tags / learnings.list / projects.list 全是真 op 真库,实测可复核),用户感到「怪」的不是没接数据,而是**真假混排**:真 value + 假 delta(exp 摘要卡)、真列表 + 假标签列(knowledge 表格)、真复用数 + 假引用曲线(应用效果 264 vs 1)。半真比全假更让人不适。
2. **写侧三大硬伤**:快速记录一键垃圾(已污染真库)、应用经验盲打第一个项目、知识条目内容不可读不可整理(tag/relation 无生产端)。
3. **死交互两处**:experience 顶部 7-tab(整排死)、knowledge 分类面板/洞察栏多数行(有意 inert 但无标注)。
4. 修复优先级建议:exp-B1/B2/B3/B4 + kn-D1(条目详情)> exp-D1(删死 tab)> kn-B1/B2 > 其余。
