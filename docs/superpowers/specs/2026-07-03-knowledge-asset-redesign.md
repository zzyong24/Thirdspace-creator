# 知识库第一性重做:创作观点与证据的资产库

> SPEC 日期:2026-07-03 · 任务:T-079 · 状态:⚠️ CONCERNS 已处置(2026-07-03 MiniMax 审:1 major 补 §0.5 设计依据 + 2 minor 内联 [gate-F1~F3])——可开工
> 用户裁决:「目前的知识库做得很差,没啥价值,没法看」→ 第一性方案陈述后拍板「开始」。
> 诊断证据(DB 实查):30 条知识内容已是原子(金句/数据点)但①内容塞 title 正文全空 ②「金句:/数据:/需核实」是标题文本前缀而非类型系统 ③被用料链引用 18 次但界面零战绩呈现 ④时间流列表无主题聚类。

## §0 第一性定位

知识库唯一存在理由:**让下一条内容更快做出来、做得更好**;检验标准 = 写稿时被调用。资产只有四种:**观点 claim**(立场/角度/比喻,内容复利核心)、**证据 evidence**(案例/数据/亲测/踩坑)、**金句 quote**(可独立传播的表达)、**观众问题 qa**(评论区真实疑问)。边界:爆款结构/钩子规律归经验沉淀;截图录屏归素材中心;热点归选题信号。

## §0.5 设计依据(不造轮子调研,gate-F1)

**仓内现状**:30 条知识(reference 19/transcript 6/note 4/snippet 1),原子化已自然发生(AI gather 产「金句:/数据:」前缀条目),但被三层错位糟蹋(见头部诊断);`knowledge.classify` 模板只判单文档五分类,不做拆解;`knowledge_relations` 关联表已建(本期不动,§4);用料链 materialLinks 已记录 18 次知识引用 = 战绩数据源现成。**结论:本设计是对既有 items/revisions/relations/materialLinks 四件套的语义修正与管线升级,零新表(仅加一列),不是重造。**

**外部参考与取舍**:
- **Zettelkasten / Obsidian 原子笔记**:采「一条知识=一个可独立引用的原子」原则(本设计核心);弃其自由双链网络——单人创作者无维护双链的时间预算,连接交给 AI 馆长与 tag 聚类。
- **Roam block reference**:采「引用即埋点」思想——但我们用已有的 materialLinks(用料链)实现引用统计,不引入块级引用系统(重)。
- **Notion database 类型化字段**:采「类型+结构化属性」(type/source_note);弃通用自定义字段——四原子(claim/evidence/quote/qa)是**创作用途特化**,来自「写稿时会调用什么」的反推,比通用字段系统更窄更准(YAGNI)。
- **仓外 project-distiller 蒸馏方案**(memory 在案的 OSS skill+KB):蒸馏 prompt 设计(全文→原子+保真约束)借鉴其拆解规约,不照搬其存储层(我们有自己的 contract/repo)。

## §1 数据层(T-079a)

- **契约 knowledgeType 枚举扩展(additive)**:加 `claim | evidence | quote | qa`;旧值(note/reference/inspiration/snippet/transcript)保留兼容存量与出处存档,录入侧不再主动产旧值(reference 仍用于「外部参考/原文存档」)。
- **`knowledge_items` 加 `source_note TEXT` 列**(迁移下一号,查 journal):出处与可信度一等公民(如「Reddit r/ClaudeAI @sysadmthrowaway 原帖,需核实」),从标题里解放。
- **存量迁移脚本**(一次性,随迁移执行):标题前缀规则拆解——`金句：X — 出处` → type=quote/title=X/source_note=出处;`数据：X(出处)` → evidence 同拆;`评论区高频问题:X` → qa;transcript/其余保持。迁移前 SELECT 打印对照表进迁移注释,可回查。
- **战绩投影**:knowledge.list 响应加 `usedCount`(materialLinks entity_type=knowledge 反查计数)与 `usedInPublished`(所挂项目存在 published publication)。repo 一次 grouped 查询,无 N+1;契约 resource 加两个字段(additive)。

## §2 蒸馏管线(T-079b)

- **ai-worker 新模板 `knowledge.distill`**(替代 classify 在知识流的位置;classify 模板保留供他用):输入 facet=全文(截断防爆),outputSchema=`{ atoms: [{ type: claim|evidence|quote|qa, title(一句话本体,≤80字), note(评注/上下文,可空), sourceNote(出处,可空) }], suggestedTags: string[] }`,prompt 要求:原子必须可独立引用、逐字保真(金句/数据不许改写)、同义合并、每篇 3~12 个。
- **倾倒场知识流升级**(→ 架构铁律#2:AI 只产候选,经 confirm 门物化;#4:输出被 schema 约束):归类单卡 → **蒸馏批量确认门**:原子列表(每条可勾选/可改 type 与 title)→「采纳选中 N 条」批量 createKnowledge(带 source_note/tags);原文默认同时存一条 type=reference 的存档(标题=原文标题或首行,勾选可关);失败内联保留输入(gate 惯例)。手动补录入口保留。
- **AI 馆长(轻)**:蒸馏输出的 suggestedTags 即主题挂载(采纳时随原子写入 tags);相似原子去重/合并建议列 §4 未来,本期不做。

## §3 呈现与喂料(T-079c)

- **知识库页默认视图 =「观点地图」**:按 tag 主题聚类的分组卡墙(无 tag 归「未归类」组,**固定排在卡墙底部、默认折叠可展开** [gate-F3]);每张知识卡:type 徽章(观点/证据/金句/问题/参考)+ title 本体 + source_note 小字 + **战绩行**(「被 N 条内容用过」,usedInPublished 加亮标);组头显主题名+组内 claim/evidence 计数(「弹药足不足」一眼可见)。默认排序:战绩 desc → 新近。原时间流列表保留为「全部」切换视图;倾倒场/搜索/详情预览(T-062c/d)不动。
- **context.knowledge 喂料升级**:knowledgeBrief 按 type 分段(【我的观点】【证据】【金句】各取战绩 top N),替代现在的扁平 title 列表——出题/写稿的注入质量随原子化+战绩排序质变(消费点已在 T-062b 接好,只改 brief 组装)。

## §4 未来(本期不做)

相似原子 AI 合并建议;观点↔证据显式关联边(knowledge_relations 已有,待有真实密度再开 UI);观点表现回写(作品数据→观点战绩细化到播放量)。

## §5 全局约束

确认门/诚实数据/无弹窗/gate-F3 契约零删除(枚举与字段全 additive);多模态可配(distill 走 model-config);每片测试全绿+真机验收。

## §6 验收标准

1. 存量 30 条迁移后:「金句:」前缀消失,type/source_note 结构化正确(SQL 抽查);列表标题不再是百字长串。
2. 倒一篇真实逐字稿进倾倒场 → 蒸馏出 ≥3 个原子(type 各异)→ 勾选采纳 → 库中出现,tags 挂主题,原文存档为 reference。
3. 知识库默认视图 = 主题分组卡墙,战绩行真值(被用 18 次的那批可见「被 N 条内容用过」);切「全部」回列表。
4. basis=knowledge 出题 prompt 抓包可见【我的观点】/【证据】分段注入。
5. 五包测试全绿;真机截图归档。
