# 知识库 + 经验沉淀重设计(裁决台 + 回流 + 倾倒场)

> SPEC 日期:2026-07-03 · 任务:T-062 · 状态:✅ PASS(2026-07-03 MiniMax cross-family 审,3 minor 已内联 [gate-F1~F3],见同名 .review.md)——可开工
> 上游:docs/产品定位.md(宪法,尤其原则 5)· 2026-06-30-data-foundation-and-director-chatbox-design.md §2 · 2026-06-30-project-lifecycle-0to1-spec.md §9-11 · 2026-06-30-page-binding-spec.md §6/§14

## §0 用户拍板记录

- 2026-07-03 用户:「经验中和知识库这里你准备怎么设计?好好规划一下」→ 提案后回复「start」,即认可:
  1. **两板块不合并,角色钉死**:知识库=创作素材输入(拿什么),经验沉淀=约束规则(怎么做);
  2. **经验沉淀重心 = 裁决台**(candidate 队列 + 评估 + 回流),不是笔记本;
  3. **切片顺序**:①经验裁决台 ②KNOW-X 修真 ③知识倾倒场 ④假数据清理。
- 继承的既有裁决(T-060 批):禁止 agent 运行时弹窗,交互收敛 Copilot 工具卡 + 确认门;素材「倾倒场」范式(倒进去自动归类);T-059 战略方向 = 全功能 CLI 化,一切能力走 contract ops。

## §1 定位与宪法对照

| | 知识库 `/knowledge` | 经验沉淀 `/experience` |
|---|---|---|
| 回答 | 创作时「拿什么?」 | 决策时「怎么做?」 |
| 内容 | 素材、金句、Hook、逐字稿、参考 | 验证过的规则(开头怎么写有效、什么结构翻车) |
| 生命周期 | 版本化(`knowledge_revisions` append-only,越攒越多) | 状态机(candidate → validated / discarded,要淘汰) |
| 消费方 | 选题/脚本 prompt 的输入 context | 校准 rubric、选题约束、盲预测 |

宪法原则 5:「复盘必须反向沉淀经验回流到选题/定位/校准,而不只看数据」。现状断点:

- **B1(飞轮断圈)**:复盘 AI 产 learnings candidate,但前端无评估 UI(candidate→validated 无按钮)、无文本编辑、`learnings.calibrationSuggestions.create` 无前端调用 —— 飞轮后半圈整条断。
- **B2(假出题)**:「基于知识库出题」的 prompt 实际不含知识内容(KNOW-X):knowledgeBrief 未透传 runTopicTask,learningsBrief 同缺。
- **B3(录入高摩擦)**:知识手录是表单;经验手录无入口 —— 与「倾倒场」裁决相悖。
- **B4(假数据残留)**:空账号知识关联数回退 fixture 386(KNOW-08);热门标签 `?tag=` 无人消费(KNOW-13)。

## §2 切片① 经验裁决台(/experience 重构)

页面重心从「7 标签分类浏览」改为**待裁决队列优先**的两栏工作台(沿用固定高度独立框滚范式):

### §2.1 布局

- **左栏 = 裁决队列**:`validationStatus = candidate` 的 learnings 按 createdAt 倒序排队。每卡:
  - learningType 徽章(8 类中文名)+ title + insight 全文;
  - **证据行**:来源(复盘诊断 → 关联 project 标题可点穿 / 手录);confidenceScore 与「被 N 个项目应用」(`applicationCount` 真值,0 就显 0);
  - 三动作:`采纳`(→ validated)、`不采`(→ discarded)、**inline 编辑**(title/insight 可改后再采纳 —— CollabField 同款「人审/改/删」范式);
  - 采纳后追加动作:「**回流校准**」按钮(见 §2.3)。
- **右栏 = 已验证经验库**:validated 列表(按 learningType 分组可折叠),每卡显 confidenceScore、应用数、回流状态;discarded 收进底部折叠区(可翻案:re-evaluate 回 candidate)。
- 顶部汇总卡保留但收窄为 3 张真值:待裁决 N / 已验证 N / 已回流校准 N。

### §2.2 契约增量(唯一新 op)

- `learnings.patch`(`PATCH /learnings/:learningId`)[gate-F1]:body `{ title?: string(min 1), insight?: string, learningType?: LearningType(8 枚举同 create) }`,response = `learningResource`(同 `learnings.get`);与 `learnings.create` 的 schema 差异仅在字段全可选。repo/service/transport 按模块化惯例;registry 白名单 + 三层测试同步。
- 其余全部复用既有 ops:`learnings.list/evaluate/applications.create/calibrationSuggestions.create`。

### §2.3 回流校准(轨 B 前端补全)

- validated 卡上「回流校准」→ 展开内联表单(**不是弹窗**):dimensionKey/label/weight 按 learningType 服务端默认值预填,用户可改 → `learnings.calibrationSuggestions.create` → 卡上显「已回流 · 待校准中心采纳」状态徽章。
- 校准中心已有 CalibrationRuleSuggestion 读侧,无需改。

### §2.4 手录入口(Copilot,不做表单)

- chatbox 新工具 `learning.capture`(白名单 chatbox.review + chatbox.topic + project):对话里说「记一条经验:……」→ 模型结构化产 `{title, insight, learningType}` 候选卡 → 点「存为经验」→ client 直调 `createLearning`(status 默认 candidate,进裁决队列)。铁律②确认门:AI 只产候选,人点才物化。
- RightRail 旧「快速记录」按钮改为 Copilot 深链预填(同 T-060① 范式),表单退役。

## §3 切片② KNOW-X 修真(知识/经验真喂出题与脚本)

- `creative-context` 装配扩两个 brief:
  - `knowledgeBrief`:最近 N(默认 20)条 knowledge 的 title + type + 摘要(内容截 ~200 字),按 basis=knowledge 时全量注入,其他 basis 注入压缩版;
  - `learningsBrief`:全部 validated learnings 的 title + insight(validated 才够格当约束;candidate 不进 prompt)。
- 注入点 [gate-F3]:在 `topic.generate` 与 `script.draft` 现有模板的 context/constraints 段**尾部追加两个 facet 占位**——「--- 知识库参考 ---\n{knowledgeBrief}」与「--- 已验证经验约束 ---\n{learningsBrief}」;走现有 ai-worker 模板 + 服务端覆盖机制(getTemplate 运行时取),不新建 template variant。
- 验收:basis=knowledge 出题的 prompt 抓包可见真实知识条目;脚本草稿 prompt 含 validated 经验文本。空库时 facet 落「(暂无沉淀)」,诚实不编。

## §4 切片③ 知识倾倒场(/knowledge 录入重做 + 预览)

- 页面顶部加 **KnowledgeDumpZone**(复用 ammo-dump-zone 交互骨架):粘贴文本/URL、拖入 .md/.txt → AI 节点 `knowledge.classify`(新 ai-worker 模板,capability 走 model-config)判 `{knowledgeType, title, tags, summary}` → **确认门卡片**(可改 type/title)→ 采纳 `knowledge.create`;分类失败展示**内联错误提示**(非 toast 即逝),原始输入保留在输入框供修改重试或手动填写 type/title 补录,不静默兜底 [gate-F2]。
- 表单式「新建知识」退役为倾倒场的「手动补录」次入口(仅保留标题+正文最小字段)。
- 知识卡详情加内容预览(markdown 渲染;URL 型显示来源链接),与素材预览同范式。
- `material.gather` 存入弹药的知识(既有链路)不变,自然汇入同一库。

## §5 切片④ 假数据清理

- KNOW-08:空账号「知识关联」指标回退 fixture 386 → 改真值 0(诚实空态)。
- KNOW-13:热门标签 chip `?tag=` → knowledge list 真消费该参数过滤;或若成本超预期,chip 降级为纯展示并去链接(二选一,倾向前者)。

## §6 全局约束

1. **无 agent 运行弹窗**(T-060 裁决):所有 AI 参与走 Copilot 工具卡/页面内联卡 + 确认门。
2. **诚实数据**:读失败 → 错误态;空库 → 空态;指标无 op → 「—/规划中」。禁 fixture 兜底新增。
3. **CLI 化对齐(T-059)**:本 SPEC 全部能力过 contract ops(仅新增 `learnings.patch` 一个),不留页面私有 API。
4. **多模态可配**:`knowledge.classify` 与 `learning.capture` 的模型经 model-config capability 解析,不写死。
5. 任务边界照旧:每切片完成 → 测试全绿 + 真机验收 + BACKLOG 落账 + `codegraph index --force`。

## §7 验收标准(端到端)

1. 复盘产出一条 candidate → /experience 队列可见 → inline 改措辞 → 采纳 → validated 区可见 → 「回流校准」→ 校准中心出现该 rule suggestion。
2. 对话「记一条经验:完播率高的都在前 3 秒放结论」→ 工具卡 → 存为经验 → 队列出现。
3. basis=knowledge 出题,SSE 抓包 prompt 含真实知识条目标题;script.draft prompt 含 validated 经验。
4. 粘贴一段文字进知识倾倒场 → AI 归类卡 → 采纳 → 知识库出现且 type/tags 合理;知识卡可预览内容。
5. 新空账号 /knowledge 关联数显 0;标签 chip 点击列表真过滤。
