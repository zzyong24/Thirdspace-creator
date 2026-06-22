# CreatorOS 运行时协同设计 — 怎么跑通 · 模块如何协同

> 在动手 P0 前先想清楚:**一条内容从头到尾在运行时怎么流转,各模块靠什么协同(而不是各管各的孤岛)。**
> 一句话:**模块不直接互相调用,而是通过三条总线协同 —— ①Project/阶段状态机(谁在哪一步)②CreativeContext 上下文装配(AI 拿到全部上游)③candidate-confirm 采纳总线(AI 产出怎么落成真数据)。飞轮靠"复盘产 Learning → 注入下一轮上下文 + 进化打分 rubric"闭合。**

---

## 1. 五个协同机制(全局只有这五个,理解了就理解了整个运行时)

### 机制① Project = 主轴,阶段状态机 = 单一事实源
- 一条内容 = 一个 **Project**,内含 1+ 个 **ContentOutput**(一条选题可多平台产物)。
- Project 在六阶段间推进:`research→planning→script→production→publishing→review`。
- **当前的坑**:阶段状态被切成两半(workspace 的"下一步"只跳 URL、overview 的"下一步"才真落库)。**协同前提是先合并成一个**:`projects.transitionStage` 是唯一写入,stepper 同时**读它 + 点它**。
- 每个阶段有**进入门**(gate):比如 script 阶段要求 research 已产出 ≥1 条证据、定位已锁。门不过 → AI/按钮置灰并提示缺什么。
- **协同含义**:任何模块想知道"这条内容到哪一步了",只读 `Project.stage`,不自己维护副本。这根除"岛与岛状态漂移"。

### 机制② CreativeContext = AI 的"接力棒",上游模块靠它喂下游
每次 AI 调用(任何阶段)都需要同一个上下文包,由一个 **Context Assembler**(查询服务,只读)从各模块**公共服务**装配——这是模块协同喂 AI 的**唯一入口**:

```
assembleCreativeContext(ctx, projectId) → CreativeContext {
  positioning:  { statement, keywords[], 产品锚[], 变现目标 }      ← Positioning 模块
  topic:        { candidateId, title, angle, contentRole, 预测分 } ← Candidate 模块
  research:     { knowledgeItems[], evidence[] }                  ← Knowledge(项目内)
  script:       { currentVersion, outline }                       ← Artifacts 模块
  learnings:    { 相关爆款要素[], 方法论[], 上次什么爆了 }          ← Learnings 模块(飞轮回流)
  monetization: { 产品锚, contentRole, 漏斗阶段 }                  ← Monetization 模块
  project:      { id, stage, targetPlatforms[] }                  ← Projects 模块
}
```

- **协同含义**:模块之间**不直接耦合**。Script 模块永远不 import Positioning 模块——它只拿到装配好的 context。新增一个上下文源(比如把"对标账号拆解"喂进去)= 在 Assembler 加一次读,**零改下游**。
- 这就是 spec §7.4 点名的"AI 阶段接力"——agent 跨阶段记得上一步,靠的不是 agent 记忆,而是**每次都重新装配的确定性上下文**。

### 机制③ candidate-confirm = AI 写入的唯一总线(产品的心脏)
AI **永不直接写业务表**。所有 AI 产出走同一条总线:

```
UI(某阶段) ──createAITask(capability, projectId)──▶ AI 模块(立即返回 taskId, status=running)
                                                       │
            后台 in-process runner ◀──────────────────┘
                │ assembleCreativeContext(读所有上游模块)
                │ query(Claude 真模型, context, 该阶段的 Skill)   ← 用你的订阅 token
                ▼
            agent ──submit_candidate(结果)──▶ AITaskResult(status=awaiting_confirmation)
                                                       │
UI 轮询 taskId ◀───────────────────────────────────────┘
   └─ 渲染【采纳组件】(diff/预览, 像审 PR)
        user ──confirmTask(taskId)──▶ AI 模块 ──▶ 归属模块.createFromAIResult(result)
                                                  └─ 落成真实体 + 该阶段门解锁
```

- **协同含义**:AI 模块只**编排**,不**落地**。每个归属模块暴露一个 `createFromAIResult` 入口,自己把 candidate 物化成本模块的实体。一个采纳组件,所有阶段复用。

### 机制④ 阶段→能力→归属 映射表(这张表就是协同规约)
每个阶段绑定一个 AI 能力,读什么上下文、产什么 candidate、采纳后落进哪个模块——**全部确定**:

| 阶段 | AI 能力 | 读(上下文) | candidate 类型 | 采纳后物化进 |
|---|---|---|---|---|
| 选题 | `topic_generate/score` | 定位 + 受众信号 + **复盘Learnings** | `candidate_list`(打分+理由+出处) | Candidate(选题池)|
| 研究 | `research_gather` | 定位 + 选中选题 | `material_list`(带出处)| KnowledgeItem[] + evidence |
| 脚本 | `script_draft/rewrite` | **全量 context** | `artifact_version`(分镜)| Artifact 版本 |
| 发布 | `platform_adapt` | 脚本 + 目标平台 | `publication_drafts[]`(一稿多平台)| Publication[] 每平台一条 |
| 复盘 | `review_analyze` | 发布 + 指标 | `learning_list`(爆款要素)| Learning[] |

- **协同含义**:看这张表就知道"谁喂谁、谁产谁"。新增 AI 能力 = 加一行,不动总线。

### 机制⑤ 飞轮闭合 = 复盘不直接改选题,而是走两条回流通道
复盘产出 `Learning[]`(爆款要素,带 confidence)。它**不**反手去写选题表,而是:
- **通道A(上下文回流)**:Learnings 进入下一轮 `topic_generate` / `script_draft` 的 context →"AI 出选题/写脚本时参考上次什么爆了"。
- **通道B(rubric 进化)**:校准模块 `Prediction`(发布前盲预测)vs `CalibrationResult`(发布后实际)→ `bumpRubricVersion` → 选题打分的 rubric 自己进化。
- **协同含义**:飞轮闭合靠"共享上下文 + 评分标准进化"两条软通道,**没有任何模块硬调用另一个**。这就是为什么模块能解耦却仍协同。

---

## 2. 端到端跑通:一条视频从 0 到复盘(证明跑得通)

> 跟着一条内容走一遍,每步标注【用户做什么 / AI 做什么 / 上下文从哪来 / 落进哪个模块】。

**0. 定位(一次性,全局约束)**
用户在定位中心写人设/关键词/产品锚 → `PositioningStatement`(不可变版本)。后续每次 AI 都读它。

**1. 选题** — 用户点「AI 帮我出选题」
→ `createAITask(topic_generate)` → runner 装配 context(定位 + 受众信号 + **上轮复盘 Learnings**)→ Claude 出 5 条**打分(爆款潜力×定位契合×变现潜力)+ 理由 + 出处**的候选 → 采纳组件展示 → 用户采纳 2 条 → 落进 Candidate 池。
→ 用户对中意的一条点「盲预测」→ 校准模块记 `Prediction`(锁死,发布后才校准)。
→ 点「晋升为 Project」→ 建 Project + ContentOutput,Project.stage=`research`。

**2. 研究** — 进入 Project 工作台 research 阶段,点「AI 帮我搜素材」
→ `createAITask(research_gather)` → context(定位 + 这条选题)→ Claude 真联网搜、按定位判相关性 → `material_list`(带出处)→ 采纳 → 落成项目内 `KnowledgeItem[]` + `evidence`。
→ research 门解锁(≥1 证据)。点「进入下一步」→ `transitionStage(planning→script)`。

**3. 脚本** — script 阶段,点「AI 起草脚本」
→ `createAITask(script_draft)` → context(**全量**:定位+选题+研究证据+复盘爆款要素)→ Claude 产**分镜脚本**(钩子→痛点→价值→卡点→CTA,表结构 `[口播|画面|字幕|时长]`)→ 采纳 → 落成 `Artifact` 版本(真落库,可改可存可回滚)。
→ 局部改写:选中钩子点「AI 改写这段」→ 同总线,采纳即替换。

**4. 制作** — production 阶段(不自建 NLE)
→ 生成分镜/字幕/封面文案/数字人口播选项 → 导出到剪映/Pr。产物状态落 `Production`。

**5. 发布** — publishing 阶段,点「AI 一稿多平台改写」
→ `createAITask(platform_adapt)` → context(脚本 + 目标平台)→ Claude 把一份脚本适配成抖音竖屏/B站中视频/小红书图文/公众号长文 + 每平台标题/标签/封面 → `publication_drafts[]` → 采纳 → 每平台落一条 `Publication`,挂到对应矩阵号 + 内容日历排期。

**6. 复盘** — review 阶段,点「AI 帮我复盘」
→ `createAITask(review_analyze)` → context(发布 + 回流指标)→ Claude 归因 + 提炼**爆款要素** → `learning_list` → 采纳 → 落成 `Learning[]`。
→ 校准收口:`CalibrationResult`(实际)对上第1步的 `Prediction`(盲预测)→ `bumpRubricVersion`。
→ **飞轮闭合**:这批 Learning 自动进入下一条内容第1步选题的 context;rubric 已进化。

**7. 变现(横切)**
内容创建时即打 contentRole(引流/信任/转化);发布的内容通过追踪链接归因到 `Lead/Conversion`;漏斗按角色统计。诚实漏损桶保留。

---

## 3. 异步执行 & 数据一致性(怎么不卡死、不串台)

- **不卡 HTTP**:`createAITask` 立即返回 `running`;agent 是 30-60s 起子进程的活,放**后台 in-process runner**(方案A,留干净接口以后可换独立 worker)。
- **UI 轮询**:前端按 taskId 轮询 status,`awaiting_confirmation` 时拉出 candidate 渲染采纳组件。
- **一个 pglite**:runner 的 creatoros MCP 读写、UI 读写,**共享同一个 globalThis 钉住的 pglite 单例**(已验证)——agent 读到的就是 UI 看到的,不串台。
- **token**:runner 从 `~/.creatoros-oauth-token`/env 读订阅 token,跑真 Claude,无 API key、无按量计费(已验证可跑)。

---

## 4. 落地顺序(协同基建先行,再铺各阶段 AI)

| 步 | 干什么 | 属于哪个机制 |
|---|---|---|
| **S1** | 合并阶段状态机:一个 `transitionStage`,stepper 可点+落状态 | 机制① |
| **S2** | 写 `assembleCreativeContext` 查询服务(先接定位+选题+研究)| 机制② |
| **S3** | 通用**采纳组件** + `confirmTask` 前端接线 + 各模块 `createFromAIResult` | 机制③ |
| **S4** | 后台 runner + 轮询 + 第一条真链路:**研究 `research_gather`**(端到端打样)| 机制③④⑤ |
| **S5** | 复用总线铺其余能力:选题→脚本→多平台→复盘 | 机制④ |
| **S6** | 飞轮回流:Learnings 进 context + 校准进化 rubric + 全局跨链点穿 | 机制⑤ |

> S1–S4 是**协同基建**:一旦"阶段状态机 + 上下文装配 + 采纳总线 + 后台 runner"四件套立起来,**研究阶段先端到端跑通一条**,后面每个 AI 能力都是"加一行映射表 + 写一个 Skill",不再动架构。这就是"想清楚怎么跑通"的答案:**先把四件套这条骨干打通,再逐阶段挂能力。**
