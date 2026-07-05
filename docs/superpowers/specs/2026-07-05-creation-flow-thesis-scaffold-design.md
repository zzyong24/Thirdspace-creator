# 创作流重设计:选题→素材→论点骨架→脚本(补回被简化的「论点/素材」地基)

> **状态**:待过 spec-review gate(创作流/数据结构改动)。
> **任务**:T-127(BACKLOG)。**前置**:T-126 联网搜索解耦(素材研究环要真联网;用户拍板先做 T-126)。
> **宪法对照**:[产品定位.md](../../产品定位.md)。
>
> **裁决注(2026-07-05,MiniMax reviewer)**:verdict=**CONCERNS**,总评「方向合定位、零新表可信、~80% 复用主张成立」。3 major 全采纳内联:①OQ1/OQ2 已裁断为正文结论(OQ1=稿面内可折叠区;OQ2=立论点步聚合 thesis+outline,contract 作定位约束背景 —— 见 §C/§G);②T-127c 占位发货风险 → 分层验收(T-126 前 CTA 诚实标 model_memory 占位、T-126 后接真,见 §B/§8);③半自动一键设计依据补进 §B 首句(合宪法「人出判断」需知情授权耗额度 +「功能内嵌当前页」+ 不阻塞编辑流)。

## 0. 用户诉求 + 拍板决策(2026-07-05)

用户:「选题之后直接写脚本可能不行——得先联网搜索找素材,再结合定位+选题受众+结构去写脚本才合理。最初版本还分论点/分素材的结构,现在简略了反而不太好弄。」

**AskUserQuestion 三决策**:
- **①素材研究触发** = 进创作流时**一键触发(半自动)** —— 不全自动费搜索额度、不去别页手动,给显眼「搜素材」入口点一下后台跑,是流程必经环。
- **②论点骨架** = **可见可编辑的独立一步** —— AI 产「核心论点 + N 分论点·每分论点挂 1-2 素材」→ 用户加/删/重排/换挂载 → 满意再生成脚本。数据蓝图非重编辑器,接近原版分论点/分素材,可控性最高。
- **③顺序** = **T-126 先行 → T-127 全链**。

## 1. 背景与目标

**问题**:现在 选题→写脚本 是「无米之炊」—— 没先搜素材、没基于素材立论点,脚本空/泛。原「论点/素材」骨架(`thesis_nodes`/`evidence_links` 表)是撑内容的地基,lifecycle 简化(「不分类型 + CollabField」)把这层一起削了 → 现在「不太好弄」。

**目标**:在选题和脚本之间补一条**引导式创作链**:`选题 → 素材研究(联网)→ 论点结构化(可见可编辑骨架)→ 写脚本`。骨架用**轻量结构化数据蓝图**(artifact + jsonb)承载,不复重编辑器/不复旧表。

## 2. 宪法对照(合定位)

- 合飞轮定位:研究→立论→脚本是「作品做深」的核心链,素材/论点/结构都进用料链与复盘飞轮。
- 合「AI 只产候选走确认门」:每步 AI 产 artifact_version candidate,用户采纳/编辑,不直接定稿。
- 合「能力用户可配」:素材研究走 T-126 检索抽象(不绑厂商)。
- 合「简化但不失骨架」:不复 `thesis_nodes`/`evidence_links` 表(已 DROP),骨架用 artifact jsonb 轻量承载 —— 保留简化红利,补回结构价值。

## 3. 现网事实(已勘查,2026-07-05)

- **阶段机**:`brief → research → planning → script → production → publishing → review`(`frontend/src/lib/stage-labels.ts` + `contract primitives`)。**但可跳过、非强制顺序**;选题采纳→`promote`(candidate.service.ts:324)建项目落 `current_stage=brief`。research/planning 阶段页 **301 重定向进稿面**(draft-workbench),无独立工作台。
- **planning 节点**:`planning.contract`(runner 活,产 4 卡 audience/value/pacing/cta)、`planning.outline`(runner 活,产 structureType/opening/sections/ending/cta)—— 都从 Copilot 对话 `fn=planning.xxx` 调,产 artifact candidate。`planning.thesis` = **孤儿**(artifact 类型 `thesis_tree` 还在 gate、但无 generator runner,thesis 现是自由文本)。
- **素材研究**:`research-runner.ts` `runGatherMaterial` → `research-node.ts:172` `runResearchNode`,产 hooks/cases/dataPoints/quotes → `MaterialItem[]` → `material_list` candidate。**只在 Copilot 对话触发、非必经**;联网搜索绑模型(=T-126)。
- **用料链**:`materialLinks {projectId, contentOutputId?, entityType(knowledge|asset), entityId, role?, stage?}`;稿面弹药区(`ammo-dump-zone.tsx`)读它。
- **script.draft**:`script-runner.ts` → `script-node.ts`。**facets 已预留 `{thesis, contract, outline}` 可选注入(SEAM-01)**,但现大多喂空;还吃 positioning/learnings/knowledge/topic/orientation/extraBrief。产 `ScriptShot[]` → artifact_version。
- **旧结构**:`thesis_nodes`+`evidence_links` 表 **迁移 0015 已 DROP**;artifact 枚举留 `thesis_tree`/`evidence_map` 但无 generator。Brief detail = 7 平级字段无层级。
- **稿面**:统一创作环境(左:选题卡→脚本编辑器→审核门→发布包→弹药抽屉;右:常驻 Copilot)。

**结论:地基 ~80% 已在。** 缺的是:① `thesis.generate` runner(复活孤儿);②把散在 Copilot 的素材/论点收成**引导式一键流 + 可见可编辑骨架**;③ planning 产物**自动回填** CreativeContext 喂 script.draft(现手动);④阶段锁(素材/论点变引导必经)。

## 4. 设计

### §A 引导式创作链(阶段编排)

选题采纳建项目后,稿面顶部给一条**引导式进度轨**(非强制锁死,但默认引导按序走):`Brief → 搜素材 → 立论点 → 写脚本`。每步一个显眼主 CTA,完成一步点亮下一步。跳步允许(老手直接写),但默认引导补齐地基。

### §B 素材研究环(半自动一键)· 决策①

- **为何半自动(非全自动/纯手动)[reviewer-3 设计依据]**:①联网检索消耗搜索额度,需**用户知情并授权**(合宪法「人出判断与品味」——不背着用户自动烧额度);②避免用户跑去 Copilot 对话页手动触发(合宪法「功能工具化内嵌当前页」——搜素材入口就在创作流里);③一键后台跑**不阻塞当前编辑流**。半自动 = 人按一下授权 + 机器后台干活,是「人出判断 × AI 出力气」的对齐点。
- 稿面「搜素材」主 CTA(进创作流即可见)→ 一键 dispatch `material.gather`(**后台异步**,非阻塞)→ 走 **T-126 检索抽象**拿真联网素材 → 落 `material_list` candidate + 自动建用料链(挂 projectId)。
- 素材带受众信号(选题卡的 targetAudience + 检索到的受众线索)供下游论点结构化用。
- **依赖 T-126·分层交付[reviewer-2]**:T-126 未落地前,「搜素材」CTA 仍可点,但**诚实展示「素材来源:model_memory(待接真联网)」占位标注** —— 用户明确知道这是占位态、非完整功能;T-126 交付后**自动切真联网**(grounding≠model_memory)。占位期不冒充「已联网」,不污染飞轮数据质量。

### §C 论点结构化环(可见可编辑骨架)· 决策②(核心)

- **复活 `thesis.generate` runner**(补孤儿):facets = `{positioning, audience, materials(用料链素材摘要), topic}` → 产**论点骨架**:
  ```
  { coreThesis: string,               // 核心论点(一句话立场)
    branches: [                        // N 个分论点
      { claim: string,                 // 分论点主张
        materialRefs: [materialLinkId] // 挂 1-2 条素材(用料链条目)
        note?: string } ] }
  ```
- **骨架工作台(可见可编辑)· [裁决 OQ1] = 稿面内可折叠区**(不新增路由,与现有稿面单页一致):稿面新增「论点骨架」可折叠区,渲染 coreThesis + branches;用户可**加/删/重排分论点、换挂载素材、编辑主张**(CollabField 风格,改即存新 artifact_version)。不是重编辑器,是结构化蓝图卡。
- 数据承载:`thesis_tree` artifact_version 的 `contentData`(上面 jsonb 结构)+ `contentText`(Markdown 呈现)。**不复 `thesis_nodes`/`evidence_links` 表**;素材挂载用 `materialRefs → materialLinkId` 引用现有用料链(零新表)。

### §D 写脚本消费骨架 · SEAM 回填

- script.draft **已有 `{thesis, contract, outline}` facet seam** —— 让 `thesis` facet 从 §C 的论点骨架 artifact 产出装配(CreativeContext 新 Reader:读最新 `thesis_tree` → thesisBrief),`contract`/`outline` 沿用现有 planning 节点产物。
- 写脚本从此**有据可依**:按核心论点铺立场、按分论点顺序铺分镜、每分论点用挂载的素材做支撑。

### §E CreativeContext 回填(打通 SEAM)

- CreativeContext 加/接线 Reader:`thesisReader`(读 thesis_tree)、`materialsReader`(读用料链素材)自动填进 script.draft facets —— 现在这些 seam 大多喂空,本环把「产物→下游 facet」自动打通(不再靠手动 hook)。

### §F 引导 gate(半强制)

- planning/thesis 变**引导式建议必经**(非硬锁):进「写脚本」步时,若无论点骨架 → 软提示「建议先立论点(基于已搜素材),脚本更有据」+ 一键补;用户坚持可跳。对齐现有审核门「折中门」范式(红硬拦/黄软提醒),这里用黄软提醒。

### §G thesis / outline / contract 三者稿面并置 · [裁决 OQ2]

- **「立论点」步聚合 thesis + outline**(论点定了顺带定结构):骨架区里先立核心论点+分论点(§C),再据分论点顺序生成 `content_outline`(现有 planning.outline)—— 论点是「说什么」、结构是「怎么排」,同一步内衔接,产出并列展示在骨架区。
- **`content_contract`(受众/价值/节奏/CTA 约束卡)作定位约束背景**:不占「立论点」主视觉,而是作为 thesis/outline/script 各步都读的**约束上下文**(现有 planning.contract 产物,喂进 CreativeContext 的 contract facet)。避免三张结构化面在稿面平铺互相抢注意力。

## 5. 现成方案 / 复用调研(gate 必查)

**~80% 复用现网,仅少量新建**:
- **复用**:artifact 框架(candidate+采纳)、`runStructuredNode` 防发散脊梁、planning-contract/outline runner(作 thesis.generate 的范本)、`material_list` candidate→用料链路径、script.draft 的 `{thesis,contract,outline}` SEAM-01(已建,等回填)、CreativeContext 7-Reader 装配链、稿面弹药区读用料链。
- **新建**:① `thesis.generate` runner + 模板(仿 planning-outline-runner)；②论点骨架可见可编辑工作台区(前端);③素材研究「一键」CTA(前端,dispatch 现有 material.gather)；④CreativeContext thesisReader/materialsReader 回填接线；⑤引导轨 UI + §F 软 gate。
- **不复旧表**:`thesis_nodes`/`evidence_links` 保持 DROP,骨架用 artifact jsonb + 用料链引用(零新表,合简化红利)。

## 6. 数据与契约

- **零新表**:论点骨架 = `thesis_tree` artifact_version 的 contentData jsonb(§C 结构);素材挂载 = `materialRefs` 引用现有 `materialLinks.id`。
- 契约:`thesis.generate` 走现有 AI task dispatch + candidate 采纳(artifact_version),无新读 op(读 artifact 现有 op 够);若骨架工作台需按 materialRef 拉素材详情,复用 `materialLinks.list` + `knowledge.get`(additive 无)。
- **AI 只产候选走确认门**:thesis.generate 产 candidate,用户采纳/编辑落 artifact_version(铁律②不破)。

## 7. 切片(拆 BACKLOG 预告 —— 过 gate 后逐条拆进 BACKLOG,引用本 SPEC,ID T-127a~)

- **T-127a thesis.generate 复活**:runner + 模板(仿 planning-outline)+ 骨架 outputSchema(coreThesis+branches+materialRefs);dispatch + candidate 采纳分支。
- **T-127b 论点骨架工作台**:稿面「论点骨架」区,渲 + 可编辑(加/删/重排分论点、换挂载素材),改存新 artifact_version。
- **T-127c 素材研究一键 CTA**:稿面「搜素材」主 CTA → dispatch material.gather(后台)→ 落用料链;轮询回显。**分层交付[reviewer-2]**:阶段1(T-126 前)CTA 可点但素材诚实标 `model_memory(待接真联网)`占位态、不冒充已联网;阶段2(T-126 后)自动切真联网 grounding≠model_memory。BACKLOG 验收写明两层,占位态不算完整交付。
- **T-127d SEAM 回填**:CreativeContext thesisReader/materialsReader → script.draft facets 自动装配。
- **T-127e 引导轨 + 软 gate**:稿面引导进度轨(Brief→搜素材→立论点→写脚本)+ 写脚本前无骨架的黄软提醒。
- **T-127f 验收**:真项目走完选题→搜素材→立论点(编辑骨架)→写脚本闭环,脚本可见引用了论点+素材;跳步仍可用。

## 8. 验收标准

- 真项目从选题采纳进稿面 → 引导轨可见;一键「搜素材」后台落素材进用料链。**分两层验收**:T-126 前——素材标 `model_memory(待接真联网)`占位、用户明确知情此为占位态;T-126 后——grounding≠model_memory 真联网。
- 「立论点」产可见骨架(核心论点+分论点挂素材),用户能加/删/重排/换挂载并存新版本。
- 「写脚本」自动吃到论点骨架(thesis facet 非空),脚本铺陈可追溯到论点+素材。
- 老手跳步(直接写脚本)仍可用,软 gate 不硬拦。
- 零新表;thesis.generate 产候选走确认门。

## 9. 风险与开放问题

- **R1(高)**:强依赖 T-126。缓解:T-127c 先接现有通路占位(model_memory 诚实标),T-126 落地后自动接真(决策③已排 T-126 先行,风险可控)。
- **R2(中)**:引导轨若做成硬锁会惹恼老手(违「简化」红利)。缓解:§F 用黄软提醒不硬拦,可跳步。
- **R3(中)**:论点骨架工作台是新前端面,复杂度别失控回到「重编辑器」。缓解:限定为结构化蓝图卡(coreThesis + branches 列表 + 素材 chip),不做富文本编辑器。
- **OQ1(已裁决,见 §C)**:论点骨架 = **稿面内可折叠区**(不新增路由)。不再是开放问题。
- **OQ2(已裁决,见 §G)**:「立论点」步聚合 thesis+outline,contract 作定位约束背景。不再是开放问题。
