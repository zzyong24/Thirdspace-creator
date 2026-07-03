# Context 层统一重设计:全数据可达 + 人机同源双消费

> SPEC 日期:2026-07-03 · 任务:T-099(切片一 = T-098 可先行)· 状态:✅ PASS(2026-07-03 MiniMax 审,0 findings:方案直接根因两起实锤事故、目录即宪堵死补丁漂移、全 additive 无 scope reduction、扩展既有范式不造轮)——可开工
> 用户架构裁决原话(入宪级引用):「**我们的所有数据都应该通过 Context 能够获取到,这是 Context 存在的意义——人设、项目、所有文案、所有项目数据、所有知识库,这些都属于我们的 Context。**」
> 宪法依据:§6 编导对话化(ChatBox 注入 skill+真实数据底座)· §5 原则 5「人出判断,AI 出草稿苦力」· §7 数据底座(真实创作历史是飞轮记忆)· §9 铁律 1(全程 Vercel AI SDK)。
> 上游/同批:T-081(context.projects compact 模式,已落地)· T-096 会话 scope 契约(同批 SPEC,§6 边界)· T-093 知识库 AI 搜索(同批 SPEC,§6 边界)。

## §0 第一性定位

Context 层的存在理由只有一句:**系统里创作者的每一份真实数据,模型都摸得到;模型摸到的每一份数据,用户都看得到——同一份真值,双向可达。**

两起实锤事故(动机,BACKLOG T-098/T-099 在案):

- **事故一(转录幻觉)**:模型调 `context.projects` 拿到 80 条真实作品数据,向用户复述时**整批重写标题**——DB 比对 0 命中(「精神角落」「算力税」「Nano Banana」等全是编的),还编造空标题与序号装饰。根因:真数据只喂了模型、没渲 UI,数据到用户的唯一通路 = 模型的嘴,弱模型长清单转录必幻觉。
- **事故二(覆盖面残缺)**:定位对话实录,模型自述「**项目库没有给我内容正文,只有标题**」→ 拿标题脑补内容做定位分析。根因:全系统没有任何一条「读作品正文/脚本全文」的查询通路,模型摸不到就编。

三层病根,本 SPEC 逐层给方案:

| 病根 | 现象 | 方案(章节) |
|---|---|---|
| ① 数据只喂模型不渲 UI | 模型被迫当「人肉显示器」→ 转录幻觉 | §2 人机同源双消费路径:工具结果一份真值,模型读 + 前端卡直渲;模型只有指针权、无转录权 |
| ② 覆盖面残缺 | 仅 4 个清单工具;无正文/单项目全档/定位档案/指标明细/经验查询 | §1 Context 资源目录:实体 × 三档读粒度总表,缺失项即实施切片 |
| ③ 无统一设计 | 补丁式(T-055c/T-058/T-081 逐个加),无实体×粒度目录 | §1 目录即宪:新增数据面先查表落位,禁止再打散补丁 |

边界:Context 层是**只读数据面**。写路径(候选→采纳门)不属于本 SPEC,现有产候选工具与确认门一律不动。

## §0.5 设计依据(现状盘点实锤,全部查证于当前代码)

### A. 工具面(模型能查什么)

| 事实 | 位置 |
|---|---|
| 只读 context 工具**仅 4 个**:`context.projects`(清单,T-081 compact:标题截 40 字/单页 200)、`context.comments`(评论清单,分页)、`context.knowledge`(标题+摘要分词 OR 模糊搜)、`context.materials`(素材清单搜索) | `frontend/src/server/ai/chat-tools.ts:802-874`;clamp 逻辑 `:594-610`;knowledge 匹配 `:618-642` |
| 分页真相已成惯例:结果带 `total/offset/hasMore`,honesty 要求如实告知「还有 N 条没看」 | `chat-tools.ts:299-303`;`chat-runner.ts:242` |
| 读端口 `ContextReaders`(5 个方法)由 composition root 绑 user-scoped 读源;未装配诚实降级空 | `chat-runner.ts:57-112,504-519` |
| 白名单按 surface 收窄:topic/project 挂全部 4 个;calibration/positioning 挂 4 个;**review 刻意零挂**(2026-07-02 实测:清单工具进复盘对话 → MiniMax 照抄标题凑经验,memory 在案) | `ai-worker/src/prompt/templates/chatbox-turn.ts:67-90`;`chatbox-surfaces.ts:70-76,121-127,166-170` |
| **缺口(模型摸不到的)**:任何长文本正文(脚本/逐字稿/知识全文)、单项目全档(brief 全字段/产物/发布)、定位完整档案(facets/downstreamRules/陈述史)、指标明细(metric_snapshots 时间线)、经验查询(learnings)、候选池(candidates)、预测对照(predictions)、发布记录(publications) | 全目录见 §1 表 |

### B. 注入面(系统自动喂什么)

`assembleCreativeContext`(`frontend/src/server/ai/creative-context.ts:302-515`)装配 14 个字段:positioningBrief(母版+facets+downstreamRules 硬约束)、learningsBrief(validated top20)、assetsBrief、accountsBrief(仅 positioning surface 注入)、signalsBrief(30 条)、knowledgeBrief(T-079c 四原子分段战绩 top5)、thesisBrief/contractBrief/outlineBrief(项目产物,带 reconstructed 标记)、orientationHint、review 四字段(仅复盘路径)。chat-runner 再拼 honestyBlock(5 条能力边界,`chat-runner.ts:237-246`)、skillsBriefBlock(技能自感知)、reviewSubjectBlock、selectionBlock。另有 worksBrief(全部作品压缩列表,仅进 positioning.generate 的 prompt,`creative-context.ts:596-617`)。——**注入面已相当厚,但它是「摘要喂料」,不是「按需查询」;二者分界从未定义**(§4 补)。

### C. 渲染面(用户能看到什么)

| 事实 | 位置 |
|---|---|
| 工具结果按 `kind` 分发渲卡:9 个产候选工具都有专属卡(候选/hook/整稿/素材/经验/brief 对照/诊断/复盘经验/定位) | `frontend/src/features/copilot/ai-copilot-content.tsx:1322-1454`;`chat-result-cards.tsx` |
| **`context.*` 自认不渲卡**:「这三个的 kind(context.*)不在前端 dispatch 的已知分支里,会被安全跳过(不报错):模型把数据读进上下文后**用文字回答**即可」——即架构注释亲手把模型指定为显示器 | `chat-tools.ts:286-288` |
| 兜底只有 trace 行:可折叠 `<details>` 里塞 JSON.stringify 截 800 字——调试痕,不是数据 UI | `ai-copilot-content.tsx:1305-1321,1455-1456` |
| **唯一例外 = 活范式**:`context.materials` 有 `ChatMaterialListCard`(T-055c,清单直渲+逐条「加入弹药」)——证明「context 工具结果渲卡」在现架构下零障碍 | `ai-copilot-content.tsx:1403-1416` |

### D. 实体面(系统里到底有什么数据)

contract 包 `contract/src/resources/` 共 60 个 resource,与创作者数据相关的核心实体:projects(+projectStage/briefDetail)、artifacts+artifactVersions(thesis_tree/content_contract/content_outline/output_script 等,正文在 contentData)、creatorProfile+positioningStatement、publications(publishing)、metric_snapshots/metricValues/retentionPoints(analytics)、audience_signals、knowledge_items(+revisions/relations,四原子)、assets、learnings(+applications)、candidates、predictions/rubric/calibrationResults、platform_accounts、content_calendar。——§1 目录以此为底册逐一落位。

## §1 Context 资源目录(核心交付:实体 × 读粒度总表)

**命名文法**(统一,新增数据面先查此表落位):

```
清单档:context.<复数名词>            —— compact 行,分页,可搜
详情档:context.<单数名词>.detail     —— 单实体全字段
全文档:context.<单数名词>.text       —— 长文本按窗口读取(offset/maxChars)
```

**总表**(现状列:✅=已有 ❌=缺失 ➖=不适用;缺失项即 §5 切片来源):

| # | 实体 | 粒度 | 现状 | 工具 | 数据源(读端口绑定) | UI 渲染卡 |
|---|---|---|---|---|---|---|
| 1 | 项目/作品 | 清单 | ✅工具/❌卡 | `context.projects`(compact 已有) | projects repo(已绑) | **缺 → 作品清单卡**(T-098) |
| 2 | 项目/作品 | 详情 | ❌ | `context.project.detail`:brief 全字段+阶段+发布状态+产物索引(type/版本数)+最新指标摘要 | projects getProject + briefDetail + listProjectArtifacts + publications + 最新 snapshot(复用 ReviewSubjectReader 口径) | 缺 → 项目档案卡 |
| 3 | 内容产物(文案/脚本/逐字稿) | 清单 | ❌ | `context.artifacts`:某项目产物清单(artifactType/当前版本/updatedAt/字数) | artifacts listProjectArtifacts(已有公开读源) | 缺 → 产物清单卡 |
| 4 | 内容产物 | 全文 | ❌(**事故二直接病根**) | `context.artifact.text`:{ projectId, artifactType, offset?, maxChars? } → 正文窗口(元数据头+text+totalChars+hasMore) | artifacts 当前版本 contentData(output_script transcript 走 ReviewSubjectReader.getScript 同读法) | 缺 → 全文阅读卡(折叠正文可展开、可翻窗) |
| 5 | 定位档案 | 详情 | 注入✅/查询❌ | `context.positioning.detail`:母版全 facets+downstreamRules+当前陈述+陈述版本数+账号画像(accountsBrief 数据并入,不单开工具) | PositioningReader(已有)+ AccountsReader(已有) | 缺 → 定位档案卡(复用 ChatPositioningCard 只读态) |
| 6 | 发布记录 | 清单 | ❌ | `context.publications`:platform/url/publishedAt/关联项目,分页 | publishing 公开读源 | 缺 → 发布清单卡 |
| 7 | 指标明细 | 详情 | ❌ | `context.metrics`:{ projectId? } → 单作品快照时间线(播放/点赞/评论/分享/留存点)或账号级最近 N 作品指标行 | analytics(snapshot 口径复用 dashboard 的 views??plays + 最新帧,不新造) | 缺 → 指标表卡 |
| 8 | 观众评论 | 清单 | ✅工具/❌卡 | `context.comments` | candidate listSignals(已绑) | **缺 → 评论清单卡**(T-098) |
| 9 | 知识库 | 清单/搜 | ✅工具/❌卡 | `context.knowledge`(分词 OR 匹配,T-093 落地后可换 hybrid,§6) | knowledge service(已绑) | **缺 → 知识清单卡**(T-098) |
| 10 | 知识库 | 详情 | ❌ | `context.knowledge.detail`:单条全字段(type/title/note/sourceNote/tags/战绩 usedCount/关联边) | knowledge get + relations + materialLinks 反查(T-079c 战绩投影已有) | 缺 → 知识原子卡(对齐 KnowledgeDetailPreview 信息面) |
| 11 | 知识库 | 全文 | ❌ | `context.knowledge.text`:transcript/reference 长文窗口读(与 #4 同窗口协议) | knowledge 正文字段 | 复用 #4 全文阅读卡 |
| 12 | 素材库 | 清单 | ✅工具/✅卡 | `context.materials` + `ChatMaterialListCard` | assets service(已绑) | **✅ 全目录唯一双路齐备——本设计的活范式** |
| 13 | 经验库 | 清单/查 | 注入✅/查询❌ | `context.learnings`:{ query?, learningType?, status? } → 含 validated/candidate 状态(brief 只喂 validated,查询可见全量并标注状态) | learnings 公开读源 | 缺 → 经验清单卡(复用 ChatLearningsCard 只读态) |
| 14 | 选题候选池 | 清单 | ❌ | `context.candidates`:title/status/score/来源,分页 | candidate 公开读源 | 缺 → 候选池清单卡 |
| 15 | 校准/预测 | 清单 | ❌ | `context.predictions`:预测 vs 实绩对照(prediction+calibrationResult 拼行)+ 当前 rubric 版本摘要 | calibration 公开读源 | 缺 → 校准对照卡 |
| 16 | 平台账号 | 清单 | 注入✅ | ➖ 不单开工具:数据并入 #5 定位档案(YAGNI,账号画像脱离定位无独立问询场景) | AccountsReader | ➖ |

**统计**:16 行;已有工具 4(双路齐备仅 1);**新增查询工具 10 个**(#2/3/4/5/6/7/10/11/13/14/15,其中 #11 复用 #4 协议);**补渲染卡 3 个存量 + 每个新工具各 1**(#11 复用)。

**目录即宪**:今后任何模块新增数据面,先在本表加行(实体×粒度×卡),不许再绕过目录打工具补丁——这是病根③的制度解。

## §2 人机同源双消费路径(病根①的方案)

### 2.1 一份真值,两路消费

```
context.* 工具 execute → 结构化真值 JSON(kind 标记,user-scoped 读端口,零编造)
   ├─(a)AI SDK tool-result part 进模型上下文 —— 模型读,用于归纳/判断/引用
   └─(b)同一 part 流回前端,按 kind 分发渲卡 —— 用户看,真数据 UI 直渲
```

两路读**同一个 `part.output`**,卡不二次请求(ChatMaterialListCard 现范式)。数据到用户的通路从「模型的嘴」改为「卡」,模型的嘴只负责说观点。

### 2.2 kind→卡全覆盖注册表(删掉「安全跳过」)

- 前端建 `CONTEXT_CARD_REGISTRY: Record<kind, 卡组件>`,`context.*` 的每个 kind 必须注册。
- **锁测**:单测遍历 `allChatTools` 全部 context.* 工具的结果 kind 集合,断言注册表全覆盖——**新增 context 工具而不配卡 = 测试红**,`chat-tools.ts:286-288` 那类「前端安全跳过」注释永久失效。
- 运行时兜底:未知 kind 渲**通用表格卡**(按结果的 items 数组字段自动列表格)而非只渲 trace 行——即使注册漏网,用户看到的也是真数据表格,不是模型转述。

### 2.3 模型行为契约:只有指针权,无转录权

honestyBlock(`chat-runner.ts:237-246`)追加第 6 条(与 T-098 措辞同源):

> 6. context.* 工具返回的清单/详情/全文,用户已在对话中的数据卡上看到原文。你对这些数据只有**指针权**——可以引用条目(说第几条/哪个标题/id)、归纳统计、对比分析;**禁止逐字复述清单内容**(标题列表、评论原文批量照抄都算)。用户要看数据时,告诉 TA「已展示在卡片中」。

卡承担展示义务的配套形态:清单卡默认渲前 8 条 + 「展开全部 N 条」+ total 真相;详情卡全字段;全文卡折叠正文可展开、可翻窗。空结果诚实空态(「项目库还是空的」),不渲假行。

## §3 上下文预算策略(三档粒度,compact 先例推广)

| 档 | 预算规则(execute 侧强制,非君子协定) |
|---|---|
| 清单 | compact 行:标题截 40 字(`compactTitle` 先例);默认 20/封顶 50;盘点模式 compact=true 单页 200(`clampContextLimit` 先例推广到全部清单工具) |
| 详情 | 单实体全字段;**长文本字段只回前 200 字 + totalChars**,并在字段旁标注「全文用 context.<x>.text 读取」——详情档永不夹带全文 |
| 全文 | 强制窗口:`maxChars` 默认 4000/封顶 8000,`offset` 按字符;返回 `{ text, offset, totalChars, hasMore }`;模型按需翻窗,honesty 第 4 条(如实告知没看全)天然适用 |
| 全局 | 所有 context 工具结果统一带分页/窗口真相字段;单次工具结果软上限 ~8KB(execute 序列化后超限自动降 compact 并标注);工具 description 写明三档用法,引导模型「先清单后详情后全文」漏斗式读取 |

## §4 注入 brief vs 查询工具的分界(定清,防两面漂移)

| | 注入 brief(系统自动喂) | 查询工具(模型按需查) |
|---|---|---|
| 本质 | 账号级**恒常事实摘要**——每轮都该在场的判断底座 | 变动数据/大体量数据的**按需通路** |
| 判定 | 每轮对话都需要 && 摘要后体量小(约 <1KB/块) | 长尾、大体量、用户问到才需要 |
| 现属 | 定位(含 facets/rules)、validated 经验 top20、技能清单、诚实规则、项目产物三 brief、复盘对象四字段、选中态 | 目录 §1 全部 16 行 |
| 重叠取舍 | **brief 是地图,工具是领土**:同一实体两路并存时,brief 只保留「战绩 top N + 计数」导航摘要(knowledgeBrief 四原子分段先例),绝不复制工具可查的明细;brief 末尾标注「全量用 context.<x> 查询」 | 工具结果不裁剪成 brief 口径——它按 §3 三档给全 |
| 演进规则 | 新数据默认**先做工具**;只有当「模型每轮都因缺它而判断失准」被实证时才升格进 brief(注入面只增不滥) | —— |

白名单维持「按任务收窄」先例(review surface 零挂清单工具,memory 教训):目录里的工具**不自动全 surface 挂载**,每个 surface 按任务面逐个评估;全局入口(T-096 scope=global)挂全目录。

## §5 切片(拆 BACKLOG 任务;每片 0→1 一次做完,含端口+绑定+工具+卡+白名单评估+测试)

| 切片 | 内容 | 依赖 |
|---|---|---|
| **切片一 = T-098(已立项,先行止血)** | 存量 3 个无卡工具补清单卡(projects/comments/knowledge;materials 卡为范式)+ §2.2 注册表与全覆盖锁测 + 通用表格卡兜底 + honesty 第 6 条 + 扫全系统其他「无卡纯转述」出口(chatbox-surfaces 结构化输出里的 diagnoses/proposals/learnings 内联通道核对是否同病) | 无,可即开 |
| 切片二:详情类 | `context.project.detail` / `context.positioning.detail` / `context.knowledge.detail` + 各卡 | 切片一(注册表) |
| 切片三:全文类(**事故二根治**) | `context.artifacts` / `context.artifact.text` / `context.knowledge.text` + 产物清单卡 + 全文阅读卡(窗口协议 §3) | 切片一 |
| 切片四:指标/发布类 | `context.metrics` / `context.publications` + 指标表卡 + 发布清单卡 | 切片一 |
| 切片五:经验/候选/校准类 | `context.learnings` / `context.candidates` / `context.predictions` + 各卡 | 切片一 |

切片二~五彼此独立可并行交付,每片交付即目录对应行由 ❌ 翻 ✅;禁止片内再切阶段做减法。

## §6 与同批 SPEC 的边界(各一句话)

- **T-096 会话 scope**:scope 管「哪条**对话历史**可见」,Context 层管「哪些**账号级数据**可查」——context.* 工具是 T-096 §1.5 明文判定的「账号级事实底座」,对所有 scope 一视同仁可用,本 SPEC 不碰会话归属。
- **T-093 AI 搜索**:T-093 是知识库**页面上给人用**的检索入口(embedding hybrid),`context.knowledge` 是**对话内给模型用**的查询通路;二者共享 SearchService seam——T-093 落地后 `context.knowledge` 的分词 OR 匹配(`chat-tools.ts:618`)可升级走同一 hybrid 检索,但两入口互不替代、互不阻塞。

## §7 全局约束

- **只读铁律**:context.* 全部纯读,不产候选、不写实体;写路径仍走既有「候选卡→采纳门」,一个不动。
- **诚实数据**:读不到 → 空/空数组 + 诚实空态;分页/窗口真相字段必带;绝不塞假数据、不凑数(全线现惯例延续)。
- **契约零删除**:新读 op 全 additive;现有 4 工具入参/结果形状不破坏(只加可选字段)。
- **user-scoped**:所有读端口经 composition root 绑 user-scoped 读源(ctx.userId 收窄),与现 ContextReaders 同法。
- **不写实现代码于本 SPEC**;中文文案规范;dev server 改持久层代码须重启(memory 在案)。

## §8 验收标准(可验证断言)

1. **无卡不成列(事故一根治,核心断言)**:seed 80 条真实项目 → 对话问「我的项目库有哪些」→ (a) 作品清单卡渲出,卡内标题与 DB 逐条比对 **0 diff**;(b) assistant 回复**文本**中出现的完整卡内标题 **≤2 条**(指针引用许可,批量转录即红)——「模型无法在无卡情况下向用户罗列清单」的机器可验形式,落为自动化回归。
2. **正文可达(事故二根治)**:定位对话让模型分析某已发布作品 → prompt 抓包可见 `context.artifact.text` 结果含该作品**真实逐字稿片段**(与 DB 全等);模型回复不再出现「项目库没有给我内容正文」类自述(实录场景重演过验)。
3. **覆盖锁测**:遍历 allChatTools 的 context.* kind 集合 vs CONTEXT_CARD_REGISTRY,全覆盖断言进 CI;故意注册一个无卡 context 工具 → 测试红(负例过验)。
4. **目录兑现**:§1 表 10 个新增工具全部可调,返回值 SQL 抽查与 DB 全等;每工具有卡且卡内数据与 tool-result part 同源(无二次请求,network 面板核验)。
5. **预算硬门**:`context.artifact.text` 单次返回 ≤ maxChars(超长逐字稿构造用例);compact 清单 200 条序列化 ≤ 软上限;详情档长文本字段恒 ≤200 字 + totalChars。
6. **注入面回归**:honesty 第 6 条出现在所有 surface 的 system(装配测试);review surface 仍零挂清单工具(白名单收窄不回退);brief 不复制工具明细(knowledgeBrief 仍为 top5 分段)。
7. `pnpm test` 全仓绿;真机走查:每个新工具在对话里各触发一次,截图归档(卡渲染 + 模型指针式回复)。
