# 记忆层现状 + 对话式改 skill/记忆 —— 调研报告

- 日期:2026-07-14
- 任务:T-314(Pi 全产品落点)第 3 路调研 —— 摸清本产品「记忆/持久化」与「skill」现状与缺口,评估「给 Pi 接记忆层」+「和 Pi 对话改 skill/记忆」的可行性与安全护栏。
- 方法:codegraph + 源码/schema 直读 + 关联 SPEC。全部结论带 `file_path:行号` 锚点。
- 宪法约束:本地优先 / 数据归属用户([docs/产品定位.md](../产品定位.md) §9、[docs/PROTECTION.md](../PROTECTION.md));skill 驱动品味对齐飞轮方向([2026-07-10-skill-driven-creative-agent-design](../superpowers/specs/2026-07-10-skill-driven-creative-agent-design.md))。

## 结论速览(先给)

1. **产品已有相当厚的「结构化记忆」资产**,但它们是**领域数据库记录**(projects/artifacts/learnings/positioning/predictions/metric_snapshots…),不是一个统一「agent 记忆层」。全部落 **file-pglite(`~/.creatoros/db`)+ 本地文件系统 assets**,本地优先成立,可做 Pi 长期记忆的**素材来源**,但需一个「记忆读端口/检索层」把它们喂给 Pi。
2. **真正缺的是三样**:①**跨会话对话记忆**(现在换个会话 = 失忆,只吃账号级 brief);②**品味/偏好的结构化留存 + 自动回流**(改稿 delta 捕捉 T-183、learning 作用域 T-087a、自动晋级 T-284c 全部**设计过但未建/暂停**);③一个**面向 agent 的统一记忆检索接口**(现有 learnings 是「全量 list + 战绩排序」硬塞,无相关性检索进创作节点)。
3. **「对话改 skill / 记忆」技术上完全可做**——底座已在(`skill_config_overrides` 热覆盖 + **版本历史 + 一键回滚**已建;learning.capture 候选门已在)。**缺的只是对话入口 + diff 卡 + 采纳门**(`skill.evolve` 工具在 [T-087 SPEC](../superpowers/specs/2026-07-03-skill-evolution-loop.md) 设计完整但**用户暂停**)。最大风险 = **改 skill = 改行为/半改代码**:注入误改、经验污染、弱模型(MiniMax)乱改。护栏范式仓内**已有现成四类**可复用,不需从零造。

---

## ① 记忆 / 持久化资产清单

**物理落点(本地优先验证)**:数据库驱动 `resolveDbDriver`([backend/src/db.ts:245-306](../../backend/src/db.ts))三态 —— `postgres`(env `DATABASE_URL`,云/docker)/ `file-pglite`(桌面缺省 **`~/.creatoros/db`**,`resolveDataDir` :259-266)/ `memory-pglite`(测试)。桌面版走 file-pglite,**数据全在用户机器**。大文件(assets/视频/封面)走本地文件系统对象存储 [backend/src/modules/assets/localfs-object-storage.ts:187](../../backend/src/modules/assets/localfs-object-storage.ts)(`fs.writeFile` 到 storage root,DB 存 `storageKey`,disk 存 bytes),storage root 可迁移([migrate-storage-root](../../backend/src/modules/assets/migrate-storage-root.test.ts),storage-dir-migration SPEC)。**结论:宪法「本地优先 / 数据归属用户」成立。**

| # | 资产 | 类型 | 存哪(file_path) | 格式 | 能当 Pi 长期记忆? |
|---|---|---|---|---|---|
| 1 | **项目/作品** | 结构化 DB | `projects`(+projectStage/briefDetail)[schema/projects.ts](../../backend/src/schema/projects.ts) | pglite 行 + jsonb | ✅ 项目态上下文(定位/选题/brief) |
| 2 | **内容产物(文案/脚本/逐字稿)** | 结构化 DB | `artifacts`+`artifactVersions`(thesis_tree/content_contract/output_script,正文在 contentData)[schema/artifacts.ts](../../backend/src/schema/artifacts.ts) | 版本化 jsonb,append-only | ✅ 真实创作历史正文(飞轮「真记忆」宪法§7) |
| 3 | **知识库(产品内)** | 结构化 DB | `knowledge_items`(+revisions/relations,四原子)[schema/knowledge.ts](../../backend/src/schema/knowledge.ts);向量检索 `hybridSearch`([persistence-client.ts:5116](../../frontend/src/server/persistence-client.ts)) | 行 + 关系边 + embedding | ✅ 可复用 Hook/金句/论据(**已有向量检索,但只服务 UI 搜索页,未接创作节点**) |
| 4 | **经验库 learnings(飞轮沉淀)** | 结构化 DB | `learnings`(learningType/`validationStatus` candidate\|validated\|discarded/confidenceScore)+ `learningApplications` [schema/learnings.ts:30-50](../../backend/src/schema/learnings.ts) | 行 | ✅ **飞轮核心记忆**;但注入是「全量 validated top20 硬塞」无相关性过滤 |
| 5 | **定位 / creatorProfile(品味载体)** | 结构化 DB | `creator_profiles`(persona/audience/`facets`/`downstreamRules`)+ `positioning_statements`(**append-only 版本化**,change_reason)[schema/positioning.ts:26-114](../../backend/src/schema/positioning.ts) | 行 + jsonb facets | ✅ 账号「品味」最结构化的一份;downstreamRules 渲成硬约束注入 |
| 6 | **盲预测 / 校准 / rubric** | 结构化 DB | `predictions`/`calibrationResults`/`rubrics`/`rubricVersions`/`calibrationRuleSuggestions` [schema/calibration.ts:53-91](../../backend/src/schema/calibration.ts) | 行 | ✅ 「预测 vs 实绩偏差」= 飞轮反馈记忆 |
| 7 | **复盘 reviews** | 结构化 DB | `reviews`/`reviewInsights`/`reviewPublications` [schema/reviews.ts:30-57](../../backend/src/schema/reviews.ts) | 行 | ✅ 复盘洞察 |
| 8 | **对标爆款拆解** | 结构化 DB | `benchmark_works`(`teardownStatus`,`card` jsonb 待 T-284a 落 5 段拆解)[schema/benchmark.ts:32-54](../../backend/src/schema/benchmark.ts) | 行 + jsonb | ✅ 对标记忆(拆解要素当前多数丢弃,T-284a 待补) |
| 9 | **发布后真实数据** | 结构化 DB | `metric_snapshots`/metricValues/retentionPoints [schema/analytics.ts](../../backend/src/schema/analytics.ts) | 时序快照 | ✅ 真实表现回流(飞轮燃油) |
| 10 | **观众评论 / 信号** | 结构化 DB | `audience_signals` [schema/candidate.ts / ingestion](../../backend/src/schema/ingestion.ts) | 行 | ✅ 需求侧记忆 |
| 11 | **对话历史 copilot** | 结构化 DB | `ai_conversations`(scope:global\|project:\<id\>\|surface:\<name\>)+ `ai_messages`(role/content/**parts** jsonb)[schema/ai.ts:31-67](../../backend/src/schema/ai.ts) | 行 | ⚠️ **只在单会话线程内持久**;**跨会话无记忆**(见 §②) |
| 12 | **AI 任务过程流** | 结构化 DB | `ai_tasks`/`ai_task_steps`/results/references [schema/ai.ts:69-200](../../backend/src/schema/ai.ts);`session_id` 列(resume 位) | 行 | ➖ 执行审计,非长期记忆 |
| 13 | **model-config / 偏好** | 结构化 DB | `model_configurations`(按 capability)/`agent_configurations`/`user_preferences`/`storage_configs` [schema/settings.ts:19-65](../../backend/src/schema/settings.ts) | 行 | ➖ 配置;`user_preferences` 仅 UI 缺省(defaultHome 等),**非「品味」偏好** |
| 14 | **skill 覆盖 + 版本史** | 结构化 DB | `skill_config_overrides` + `skill_config_override_versions` [schema/settings.ts:88-108](../../backend/src/schema/settings.ts) | 行 | ➖ skill 配置(见 §③) |
| 15 | **知识库(全局 Claude skill,非本产品)** | 文档/文件 | `~/ThirdSpace` vault(thirdspace-vault skill)| Markdown+frontmatter | ➖ **与本产品无关**:那是用户个人 Obsidian 库,不在 CreatorOS 数据链;别混淆 |

**「结构化 DB 记录」= #1–14 全部**(pglite 行/jsonb);**「文档/文件」= assets 二进制(#附)+ #15 全局 vault(产品外)**。产品内**没有** Markdown/文件形态的「记忆文档」——记忆都是 DB 记录。

---

## ② 记忆层缺口分析

**A. 跨会话对话记忆:缺(现在换会话=失忆)。** 会话持久化只在**单一 conversation 线程内**:`ai_messages` 按 `conversationId` 恢复(刷新重建 parts,[schema/ai.ts:52-55](../../backend/src/schema/ai.ts));`scope` 决定历史列表过滤与「恢复取最近」([ai.ts:38-41](../../backend/src/schema/ai.ts),T-096 会话 scope 契约)。但**开新会话时,模型不会拿到「过去别的对话里你说过/纠正过什么」**——每轮上下文由 `assembleCreativeContext`([frontend/src/server/ai/creative-context.ts](../../frontend/src/server/ai/creative-context.ts))装配的**账号级 brief**(positioning/learnings top20/assets/signals…)+ 本会话历史窗口拼成。跨会话唯一「记得」的通路 = **沉淀进 learnings/positioning 的那部分**,且需**显式 capture + 人工 validated** 才回流。→ 用户在对话里随口表达的偏好/纠正,**留不住**。

**B. 品味/偏好的结构化留存 + 自动回流:半有,关键环未建。**
- 已有:learnings(需人工采纳+validated)、positioning facets(需生成+确认)。
- **缺口 1 — 改稿 delta 捕捉未建**:用户改 AI 稿的 before→after(最强品味信号)无采集。设计在 [skill-driven SPEC §3-L1.2 / T-183](../superpowers/specs/2026-07-10-skill-driven-creative-agent-design.md:103),**未开工**。
- **缺口 2 — learning 无 Skill 作用域**:当前 `learnings` 表**无** `appliesToSkills`/`reuseCount`/`evidenceStrength` 列(直读 [schema/learnings.ts:30-50](../../backend/src/schema/learnings.ts) 只有 learningType/validationStatus/confidenceScore)。写稿经验会漏进选题 prompt。作用域设计在 [T-087a](../superpowers/specs/2026-07-03-skill-evolution-loop.md) **暂停**。
- **缺口 3 — 经验自动晋级未建**:learning 卡在 candidate→validated 人工闸,人不点=对生成影响 0([T-284c](../../BACKLOG.md) 📋 过审可开工,未做)。
- **缺口 4 — 相关性检索注入未建**:知识库/经验是「全量 list + 战绩排序」硬塞创作节点,向量 `hybridSearch` 已建但**只接 UI 搜索页,未接创作 context**([skill-driven SPEC §2.2/§3-L3 / T-186](../superpowers/specs/2026-07-10-skill-driven-creative-agent-design.md:50))。

**C. 统一「记忆层」抽象:无。** 产品有 ~14 张记忆相关表,但**没有一个统一的「memory read/write 端口」**把它们作为「agent 长期记忆」暴露。现状是各 reader 在组合根 `persistence-client.ts` **逐节点硬接线**(漏接一行=断链,[skill-driven SPEC §2.3](../superpowers/specs/2026-07-10-skill-driven-creative-agent-design.md:52) 实锤多处断链)。Context 层([2026-07-03-context-layer-redesign](../superpowers/specs/2026-07-03-context-layer-redesign.md))定义了 16 行「实体×粒度」只读查询目录,是**最接近「记忆读接口」的现成物**,但它是「对话内模型按需查」,非「agent 自动记忆召回」。

**给 Pi 接记忆层的落点判断**:
- Pi(`@earendil-works/pi-agent-core`)是**无状态循环引擎**,记忆要我方喂([2026-07-14-pi-runtime-integration-research](2026-07-14-pi-runtime-integration-research.md))。
- **最省力正解 = 复用 Context 层查询工具作 Pi 的「记忆检索工具」**(把 §① 资产包成 Pi 的 domain tool,和 T-256c 三适配器同法),而非新建 memory store。
- **真需要新建的**:①跨会话「用户偏好/纠正」的沉淀位(可复用 learnings + 补 Skill 作用域,或新一张轻表)②相关性检索注入(接 hybridSearch,T-186)③一个「记忆写入门」(agent 产候选→确认→落 learnings/knowledge,复用现有采纳门,铁律③)。

---

## ③ skill 形态与加载机制

**形态 = 提示词三位一体,不是代码。** 一个 skill = `PromptTemplate`:`system`(角色+方法论)⊕ `template`(user 模板,`{{facet}}` 占位)⊕ `requiredFacets` ⊕ `tools`(工具白名单)⊕ `outputSchema`(Zod,每轮输出契约)。定义 [ai-worker/src/prompt/template.ts:27-51](../../ai-worker/src/prompt/template.ts);模板本体在 [ai-worker/src/prompt/templates/*.ts](../../ai-worker/src/prompt/templates/)(约 22 个)。**换 skill = 换模板文本/白名单,不动 runner code**。

**注册与加载**:
- 内置全量注册 `registerAllTemplates()` → 常驻 `REGISTRY: Map`([ai-worker/src/prompt/registry.ts:96,130](../../ai-worker/src/prompt/registry.ts))。**进程装配期调一次**(frontend 靠 getTemplate/runStructuredNode 惰性 bootstrap)。
- 18~22 个内置 skill 清单:对话技能 `chatbox.*`(topic/calibration/positioning/review/distill)+ 创作节点(topic.generate/script.draft/planning.thesis/…)+ 采集分类(knowledge.classify/distill/relate/comment.qa-sift)。中文词表全览 [frontend/src/features/settings/skills-data.ts:62-170](../../frontend/src/features/settings/skills-data.ts)。
- 消费:各 runner 直调 `runStructuredNode`([ai-worker/src/nodes/structured-node.ts](../../ai-worker/src/nodes/structured-node.ts))→ 从 registry 取 outputSchema → `generateObject` 绑 Zod 校验。**`.claude/skills/` 那套 Claude Agent SDK 编排已退役**([ai-worker/src/index.ts](../../ai-worker/src/index.ts),skill-driven SPEC §2.3 明示别被误导)。

**谁能改 skill、怎么生效(三条 override 通道,全热更不重启)**:
1. **代码内**:`overrideTemplates`(Zod 形式)。
2. **DB 配置**:`skill_config_overrides` 表(列:id/version/system/template/tools/required_facets/output_schema)→ `overrideTemplatesFromConfig` 套进常驻 REGISTRY,**热更不重启**([backend/src/modules/ai-runtime/skill-config-overrides.ts:126-179](../../backend/src/modules/ai-runtime/skill-config-overrides.ts))。op:`settings.prompts.list/get/put`([contract/src/operations/settings.ts:105-139](../../contract/src/operations/settings.ts))。设置页「技能」页签可查看/编辑([skills-section.tsx](../../frontend/src/features/settings/skills-section.tsx))。**恢复默认 = put 空串**(归一 undefined 回退内置)。
3. **远程签名 bundle**:Ed25519 验签下发(`remote-prompt-bundle.ts`),**skill 粒度锁 D1**:本地手改过的 skill,远程一字不碰([skill-config-overrides.ts:144-159](../../backend/src/modules/ai-runtime/skill-config-overrides.ts))。

**已建的安全底座(超出 T-087 SPEC 所述)**:
- **版本历史 + 一键回滚**:`skill_config_override_versions` 表([drizzle/0028](../../backend/drizzle/0028_skill_config_override_versions.sql))+ op `settings.prompts.versions.list` / `settings.prompts.rollback`([contract/src/operations/settings.ts:143-159](../../contract/src/operations/settings.ts))——每次 put/rollback 都记一条版本快照,回滚本身也记新版本(审计链不断)。**这是「对话改 skill」最关键的安全网,已经在了。**
- **注意**:`tools`/`outputSchema` 虽可被 put 覆盖,但 T-077 已裁「改坏即崩」,`skill.evolve` 设计只允许改 `system/template` 文本,tools/schema 不准动。

**自建全新 skill 能力 = 不存在。** grep `createSkill`/`skill.create` 零命中。只能改现有 18~22 个。「访谈式自定义 skill」在 [T-185](../superpowers/specs/2026-07-10-skill-driven-creative-agent-design.md:176) 设计,**未建**。

---

## ④ 对话改 skill / 记忆的可行性 + 安全护栏建议

### 可行性:高。底座齐,只缺对话入口。

「和 Pi/编导对话改 skill 或记忆」拆成两类,都**已有落地路径,缺的是对话触发面**:

| 目标 | 底座现状 | 缺口 |
|---|---|---|
| **对话改记忆(经验)** | `learning.capture` 候选卡(复盘 chatbox 已在,人点才落库)；learnings 状态机人工晋级 | 只缺:①跨会话偏好沉淀位(§②B)②作用域绑定(T-087a) |
| **对话改 skill(prompt)** | `settings.prompts.put` 热更 + **版本历史 + 回滚已建**；`skill.evolve` 对话工具(读当前生效 template → 产**最小 diff** → diff 卡 → 采纳走 put)**设计完整** | 只缺:`skill.evolve` 工具本体 + diff 卡 —— [T-087b](../superpowers/specs/2026-07-03-skill-evolution-loop.md:84) **用户暂停**(2026-07-04,红线「随意引用经验污染 skill 很麻烦」) |

**关键澄清**:skill 是 **prompt(数据),不是可执行代码**。改 skill = 改模型行为,**不改代码、不需重启**(热更走 REGISTRY 重套)。但 MEMORY「改服务端/skill 须重启+真机验证」仍适用于**验证**——单例持旧模块,声称改好前必真机复测那条 skill 行为(尤其 MiniMax)。

### 最大风险(三条)

1. **改 skill = 改行为,弱模型乱改**:用户 MiniMax 下让 agent 自己产 template diff,可能改出降质/自相矛盾/丢诚实门的 prompt。**这是「半改代码」级风险,不是普通数据编辑。**
2. **注入攻击 / 误改**:对话里被诱导「把某段写进写稿技能」或「删掉诚实门」→ 若无门直写会污染。
3. **经验污染扩散**:坏经验混进 validated + 无作用域 → 漏进所有 skill 的 prompt,难发现难归因(用户原始红线)。

### 护栏建议(全部复用仓内现成范式,不新造机制)

**A. 采纳门 / 确认门(铁律③,最硬)**:agent **零直写**权限。改 skill/记忆一律走「产候选 → diff 卡/候选卡 → 人点采纳 → service 物化」。skill 走 `settings.prompts.put`,经验走 `learning.capture`——两条通道**都已有确认门**,`skill.evolve` 只需接上不新开写路径([T-087 §2 闸3](../superpowers/specs/2026-07-03-skill-evolution-loop.md:76))。

**B. 版本 + 一键回滚(已建,直接用)**:`skill_config_override_versions` + `settings.prompts.rollback` 已在(§③)。任何对话改 skill 后可秒退上一版 / 恢复默认。**这条是把风险 1/2 变可逆的关键**。

**C. 范围收窄 / 白名单物理隔离**:①`skill.evolve` 只改 `system/template` 文本,**tools/outputSchema 禁改**(改坏即崩)。②经验作用域 `appliesToSkills`(T-087a),绑定即边界,不跨 skill 扩散。③工具白名单按 surface 收窄(现成 SURFACE_TOOL_SCOPES),`skill.evolve` 只挂 review + 通用 chatbox。

**D. 引用门槛(状态机闸)**:只有 `validated` 经验可注入;candidate/discarded 永不进 prompt;candidate→validated **只能人工**(状态机封死 AI 通路,[T-087 §2 闸1](../superpowers/specs/2026-07-03-skill-evolution-loop.md:74))。

**E. 注入防护范式(现成)**:`local-env-probe` 的白名单+形态门([backend/src/modules/ai-runtime/local-env-probe.ts:29,75,86](../../backend/src/modules/ai-runtime/local-env-probe.ts):`TOOL_PROBE_ALLOWLIST`/`isShellSafeToolName`/`resolveToolsToProbe`,注入名永不到 spawn)+ `local.read` 的 denylist 硬拒 + 确认卡([chat-tools.ts:2331](../../backend/src/modules/ai-runtime/chat-tools.ts))+ 诚实门(ANTI_FABRICATION_CLAUSE)—— 同款「白名单 + 硬门 + 确认卡」直接套到 skill 编辑面。

**F. 干跑 / 预算 / abort(agentic 现成)**:若走 Pi 自主循环改 skill/记忆,复用 T-256b 护栏壳(`filterToolsToScope` 白名单 + `LoopController` 步数/预算硬顶 + 干跑预览 + 副作用确认门 + abort 贯通,[backend/src/modules/execution/agentic/](../../backend/src/modules/execution/agentic/))。改 skill/记忆属**副作用等级 writeback/publish**,干跑门可强制。

**G. 污染检测归因(T-087c)**:注入即记 `learningApplications`(现表),复盘面列「本稿引用了哪些经验」供就地降级([T-087 §2 闸4](../superpowers/specs/2026-07-03-skill-evolution-loop.md:77))。

### 落点建议(给 T-314 SPEC 参考)

- **对话改记忆**:低风险,可先做。补「跨会话偏好沉淀」(改稿 delta T-183 或对话内 `preference.capture` 候选)→ 复用 learnings + 作用域 → 相关性注入。
- **对话改 skill**:高风险高价值,**恢复 T-087 `skill.evolve` 设计**(diff 卡 + 采纳门 + 已建的版本/回滚)是最短路径,不必等 Pi;Pi 若要动 skill,必须经同一确认门 + 干跑门,不给 raw 写权。
- **Pi 记忆层**:不新建 memory store,**把 §① 资产包成 Pi 的记忆检索 domain tool**(复用 Context 层 + T-256c 适配器范式)+ 一个经确认门的记忆写入工具。
