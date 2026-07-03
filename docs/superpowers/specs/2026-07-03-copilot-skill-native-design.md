# Copilot Skill 化:AI-native 创作编排工作台

> SPEC 日期:2026-07-03 · 任务:T-077 · 状态:✅ PASS(2026-07-03 MiniMax 审,2 minor 已内联 [gate-F1/F2])——可开工
> 用户战略原话:「我们这个本身是一个 Agent,它肯定支持接入 Skill,也内置很多 Skill。比如脚本制作阶段新建了项目,策划还没填,我直接在对话框里跟它聊了之后让它来填。写文案每个人风格不一样,它的 Skill 都是可以定制的,侧重点也不一样,文案的结构也在 Skill 里可以定制。它是一个 AI-native 的创作编排工作台。」
> 上游:T-040 服务端可配提示词(已落地:`skill_config_overrides` 表 + `settings.prompts.list/get/put` ops + `overrideTemplatesFromConfig` 热生效 + 18 模板全走运行时 `getTemplate`)· 宪法 §6 编导对话化 / §9.3 Skill 三位一体。

## §0 现状与差距

**引擎已在**:每个 AI 能力已是一个 Skill(PromptTemplate 三位一体:system/template+facets/tools+outputSchema),REGISTRY 注册、服务端覆盖热生效、chatbox 按 surface 挂 skill 与工具白名单、确认门与 trace 成型。**缺的是三块**:

1. **管理面**:Skill 散在代码里,用户无处看见「系统会什么」、无处定制(T-040 明确把编辑 UI 留待后续 = 本片)。
2. **对话干活的覆盖度**:用户点名的「聊完让它填策划」没有工具——选题卡(briefDetail)只能手填。
3. **Skill 自感知**:Copilot 不知道自己有哪些技能,无法回答「你能干什么」、无法主动建议用对的技能。

## §1 设计

### §1.1 Skill 管理面:设置 →「技能」页签(统一收集与管理)

- **技能列表**:遍历 REGISTRY 全部已注册 Skill(18+),按用途分组(对话技能 chatbox.* / 创作节点 topic.*、script.*、positioning.* 等 / 采集分类 asset.classify、knowledge.classify)。每行:中文名(复用 TOOL_TRACE_LABELS 词表,缺的补)+ 一句话用途 + 「已定制」徽章(存在 override 时)。
- **技能详情(点开)**:查看/编辑 `system` 与 `template`(textarea;facets 说明区 = template 编辑框下方一张只读小卡,逐行列出该 Skill 的 facets 占位符名与中文含义,来源 requiredFacets+模板注释词表 [gate-F2]);保存 → `settings.prompts.put`(热生效,T-040);「恢复默认」→ put 空字段(空串归一 undefined = 回退内置,T-040 语义)。tools/outputSchema 本期只读展示(改坏即崩,编辑留待后续;显示当前值)。
- **风格与结构定制的落点(关键决策,不造第二套参数系统)**:写文案的「个人风格」与「文案结构」就是 `script.draft` 等 Skill 的 template 本身——用户在技能详情里直接改模板(如把 HOOK-铺垫-干货-CTA 段落顺序改成自己的结构、加「禁用营销腔、第一人称」等风格约束)。全局口吻已由定位 facets 的 tone(表达风格)经 positioningBrief 注入所有 prompt,不再另建风格参数表。
- **新建 Skill(接入)**:本期不做新建 UI——新 Skill 需要配套工具/schema 代码,UI 化是假可用(YAGNI)。§3 记录将来路径。

### §1.2 对话填策划:`brief.fill` 工具(用户点名场景)

- chatbox 新工具 `brief.fill`(白名单:project surface):模型读当前项目 briefDetail 现状(经 selection/context 注入)+ 对话内容 → 产结构化选题卡候选 `{targetAudience, contentGoal, coreMessage, corePain?, format?}`(对齐 briefDetail 字段,查现有 shape 为准)→ 工具卡渲字段对照(现值 → 建议值,diff 感)→ 人点「写入选题卡」→ client `patchProject({briefDetail})` → refresh。铁律②确认门。
- 稿面选题卡「选题待补」态加引导:「让编导帮你填 →」深链右栏对话预填「根据我们聊的,帮我把选题卡填了」。

### §1.3 Copilot 技能自感知

- chat system prompt 注入**技能清单 facet**(`skillsBrief`:当前 surface 白名单内每工具一行,格式「中文名(工具名):一句话用途」,行数=白名单工具数、上限 20 行超出截断 [gate-F1]),让模型能回答「你能干什么」并在对话中主动建议(「这个我可以用『记录经验』帮你存下来,要吗?」)。
- 全部 surface 生效;生成逻辑落 chat-runner 装配(与 honestyBlock 并列)。

## §2 切片

- **T-077a 技能管理页签**:设置新「技能」页签(列表+详情编辑+恢复默认),复用 settings.prompts.* ops,零新契约。
- **T-077b brief.fill**:工具三件套(ai-worker 白名单+chat-tools+确认门卡)+ 稿面选题卡引导深链。
- **T-077c 技能自感知**:skillsBrief 注入 chat system。

## §3 未来路径(本片不做)

外部 Skill 接入 = 新增 PromptTemplate 行级注册(REGISTRY 支持运行时 register)+ 工具实现;待有真实外部 Skill 需求时开 UI/包格式。MCP server(T-063f)已让外部 AI 调本系统,反向(本系统装外部 Skill)对称留待。

## §4 全局约束

确认门/诚实数据/无弹窗/多模态可配全部适用;prompts.put 已有 op,gate-F3 契约零删除;每片测试全绿+真机验收。

## §5 验收标准

1. 设置「技能」页签列出全部注册 Skill;改 `script.draft` template 加一句风格约束并保存 → 对话「生成脚本」产出可见该约束生效(prompt 抓包或产出体现);恢复默认后回内置。
2. 项目对话说「帮我把选题卡填了,观众是 AI 新手,目标是涨粉」→ brief.fill 卡渲字段对照 → 点「写入选题卡」→ DB projects.brief_detail 更新 → 稿面选题卡显新值。
3. 对话问「你能干什么?」→ 回答列出当前面可用技能(与白名单一致,不编造)。
