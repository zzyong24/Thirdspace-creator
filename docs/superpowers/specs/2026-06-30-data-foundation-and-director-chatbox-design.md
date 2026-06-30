# 数据底座 + 上下文感知 ChatBox(编导对话化)设计

> 定稿 2026-06-30。canonical SPEC,审完经 /goal 实现。配套:[2026-06-30-project-lifecycle-0to1-spec](2026-06-30-project-lifecycle-0to1-spec.md)、[2026-06-30-data-source-pipeline-design](2026-06-30-data-source-pipeline-design.md)。
>
> **写在前面的为什么**:本轮把产品从"表单填写机"扳回"编导智能体"。两件事互为表里 ——
> **数据底座** = 编导的真实记忆(你真发过什么、表现如何、观众说什么);**ChatBox** = 你跟编导对话的那张嘴。
> 没有底座,编导在编;没有 ChatBox,功能零散得像表单。

## 0. 架构铁律(不可违背,Agent 实现时逐条对照)

1. **全程 Vercel AI SDK**(`modelFor` 按 capability 选模型)。**禁止** Claude Agent SDK / 旧 `LlmCompleter`。理由:能切换不同模型。`research.gather_material` 是唯一残留,本 SPEC §6 迁掉。
2. **AI 只产候选,不直接写领域实体**。所有 AI 输出 → 候选 → 人确认 → backend service 物化(confirm 门)。ChatBox 工具同样受此约束,不得绕过。
3. **每轮输出必须被 Zod schema 约束**(§4.2)。对话框不是自由聊天,每轮产结构化输出,校验失败由 Vercel SDK 自动重试。
4. **提示词 / 工具 / 输出 schema 三者皆可注入、皆留后台配置口子**(§4)。本期不做配置面,但口子(JSON Schema 序列化)必须留。
5. **不弱化 scope、不分阶段做减法**。§9 的"实现顺序"是依赖/优先级排序,不是把范围切成 V0.1/V0.2。

---

## 1. 数据底座:已发布作品 = 历史项目

### 1.1 模型决策(已与产品确认)

不建独立"作品库"实体。**真实已发布作品导入为 `project`(历史项目)**,进入统一项目体系,处于已发布态,中间字段多为空但可导入。在 CreatorOS 里**新做**的内容,发布后也汇入同一层 —— 底座 = 历史导入 + 新产出的统一真值。

**为什么不独立建实体**:用户要统一进项目体系(一处看所有作品);未来要基于历史作品反向冷启动(分享链接→导出视频→提逐字稿→初始化全流程),那时历史项目就地"激活"成活项目,无需迁移实体。

### 1.2 数据模型(字段级)

`projects` 表新增两列(迁移 `0008_project_source_platformref.sql（落地时取 backend/drizzle 下一个空号；0006/0007 已占用）`):

| 列 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `source` | text | `"manual"` | `manual`(手动新建)/ `topic`(选题立项)/ `imported`(真实采集导入)。现有行均 manual,行为不变。 |
| `platform_ref` | jsonb | `{}` | `{ platform: "douyin", externalId: "<aweme_id>", shareUrl?: string, publishedAt?: iso8601 }`。非导入项目为 `{}`。 |

- **逐字稿冷启动口子**:`platform_ref.shareUrl` 字段先留(可空);未来 `shareUrl → 导出视频 → 提逐字稿 → 反填 brief/script`。本期**不实现**该流程,但字段 + schema 注释留好,Agent 不得删。
- 契约 `projectResource` 加 `source: z.enum(["manual","topic","imported"]).default("manual")` + `platformRef: z.object({...}).default({})`。`createProject` body 接受可选 `source`/`platformRef`。
- domain `Project` 同步;`projects.repository` 投影两列;`projects.service.createProject` 透传(默认 manual)。

### 1.3 导入路径:refresh 发现即建历史项目

现状(本会话查实):`ingestion.douyin.refresh` 抓到 24 条真实作品,但 `ingestMetrics → resolvePublication(platform,externalId)` 找不到对应 publication(seed 的 `external_id` 为空)→ **全部 reject**(run 状态 partial,快照 0 新增)。这是落库归属断裂。

**修法**:douyin 真抓得到的每条作品(aweme_id + 真实标题 + 指标),走一个新的 **ensure-imported-project** 路径而非 reject:

1. `ensureImportedProject(ctx, { platform, externalId, title, publishedAt })` —— 幂等于 `(userId, platform, externalId)`:
   - 无 → 建 `project`(`source:"imported"`, `platform_ref={platform,externalId,publishedAt}`, `current_stage` 落"已发布/复盘"态, `title`=真实标题) + 其 `content_output` + `publication`(`external_id=aweme_id`)。
   - 有 → 返回既有 projectId(不重复建)。
2. 然后 metrics 挂到该 publication(`resolvePublication` 此时命中)→ `metric_snapshots`/`metric_values` 落库成功。
3. 评论同理:refresh 也抓评论 → 落 `audience_signals`(选题"评论"basis 的真实源)+ 复盘评论。**蓝本(真实可达)**:cheat-on-content `adapters/perf-data/douyin-session/crawler.py` 的 `fetch_comments_creator`(走创作者中心评论管理页,拦 `/aweme/v1/web/comment/list/`),TS 重写进 `frontend/src/server/ingestion/douyin-cdp.ts`(与作品抓取同文件、复用 `openContext` 持久化登录态)。字段级契约:comment fetch 入参 `{ awemeId, maxPages }`;`audience_signals` 列映射 `{ raw_text=评论文本, source="douyin_comment", demand_tag=null(待 AI 打), external_id=comment_id }`;幂等键 `(userId, external_id)`。

**效果**:`refreshDouyin` 从"刷新已知作品指标"升级为"**导入我的真实抖音作品 + 表现 + 评论**"。一键拉取后,界面直接出你 24 条真实视频的真实数据。

**实现落点**:`ensureImportedProject` 是 ingestion 经注入端口调 projects/publishing 的 service(不跨模块直连 repo,守 SPEC §22)。`refreshDouyin` 服务方法:fetch → 对每条 ensureImportedProject → ingestMetrics(此时全命中)→ completeRun。

### 1.4 mock 退场

- seed 的 46 条假作品(`douyin-real.ts` fixture)在**真实导入可用后**让位:`已发布内容 / 播放数据 / 评论 / 复盘` 各面读真实导入的项目/作品,不再读 fixture。
- 过渡期:fixture 作为"未连真账号时的演示数据"保留;一旦该用户有 `source:imported` 项目,UI 优先读真。判据:`projects where source='imported'` 非空 → 用真。

---

## 2. 三方向消费:底座 → 哪些模块、读什么

底座扮演两个角色 —— **回看(让你变准)** + **创作输入(创作新内容的来源库)** + **总览(驾驶)**。

| 方向 | 模块 | 读底座的什么 | 怎么用 |
|---|---|---|---|
| 回看 | **校准/复盘**(calibration) | 真实指标 + 评论 | 对照盲预测算偏差;**B2 编导自动评分**(真实指标→维度分→预填录入,人审核) |
| 回看 | **经验沉淀**(learnings) | 复盘结论 | 沉淀成约束未来评分的经验,回流 |
| 创作输入 | **选题**(topics) | 评论(需求/痛点) + 过往爆款表现 | 评论 basis 接真评论;爆款经验出题("反直觉开头对你有效") |
| 创作输入 | **定位**(positioning) | 真实内容 portfolio + 表现 | 反推/校准定位(你以为的定位 vs 数据里的定位) |
| 创作输入 | **知识库**(knowledge) | 过往脚本 / Hook / 金句 | 沉淀可复用知识,创作时引用 |
| 总览 | **首页驾驶舱**(dashboard) | 真实最近发布 / 播放趋势 / 什么在起效 | 真值替换 facade(治"dy-pub-00 假标题/0 播放") |

**关键缝**:这正是飞轮的物理实现 —— 底座的真实数据**同时**喂"学习"(校准→经验)和"创作"(选题/定位/知识),首页是它的驾驶舱。三方向**并行**规划,不分先后。

---

## 3. 上下文感知 ChatBox(进化 Copilot)

### 3.1 定位与边界

- **进化现有 `copilot-runner`**,不另起炉灶。它升级为"上下文感知 + 工具化"的对话面 = 你跟编导对话的入口。
- 全程 Vercel AI SDK(`useChat` + `/api/chat` `streamText`),不依赖 Claude SDK。
- **指挥 + 画布分工**:ChatBox 是指挥(对话、调度工具、多轮打磨);现有三栏工作台是画布(结构化呈现、采纳)。两者共享同一份数据 + 同一确认门。

### 3.2 ChatContext(三层注入 —— 心脏)

每个会话携带:

```ts
ChatContext = {
  surface: "topics" | "calibration" | "positioning" | "review" | "project" | ...,  // 页面层
  functionKey?: "topic.generate" | "calibration.diagnose" | ...,                    // 按钮层
  projectId?: string,
  selection?: { kind: string; ids: string[] },                                      // 选中的候选/作品
}
```

注入三层:
1. **页面层 `surface`** → 选中基础 skill(选题页 = 选题编导;校准页 = 复盘编导)。
2. **按钮层 `functionKey`** → 在基础 skill 上叠加专用 skill / 工具白名单(点"开始预测"→ 叠加盲预测 skill)。
3. **数据层** → `/api/chat` 装配对应 `CreativeContext` facets(定位 / 经验 / **数据底座真实指标+评论** / 当前项目)注入 system prompt。

全部走提示词模板 registry(脊柱-1 已建,`overrideTemplates` 已支持服务端推送)→ **可配置**。

### 3.3 架构:复用 vs 自造

| 拿 vercel/ai-chatbot 的 patterns | 复用 CreatorOS 已有 | 不要 |
|---|---|---|
| `useChat` + `/api/chat` `streamText` 流式 + stop/regenerate | `modelFor`(按 capability 选模型) | Auth.js(已有鉴权) |
| **tool calling + generative UI**(AI 回复里渲 React 组件) | 提示词模板 registry(skill 注入) | Neon(已有 PG) |
| 多轮消息结构 | `ai_conversations` / `ai_messages` 表(持久化**已存在**) | 整套脚手架 |
| | `CreativeContext` 装配 + 12 个 AI 节点(工具) | |

`/api/chat` 路由:收 `{ messages, chatContext }` → resolve skill(模板+工具+schema)→ 注入 CreativeContext → `streamText({ model: modelFor(spec), system, messages, tools })` → 步骤/消息落 `ai_conversations`/`ai_messages`。

### 3.4 AI 功能工具化(首波 5 个 —— 已确认)

首波(最对话化 + 最贴飞轮):**`topic.generate`、`topic.enrich`、`calibration.diagnose`、`review.analyze`、`positioning.generate`**。

- 每个节点注册为 Vercel SDK **tool**:`{ description, parameters: Zod, execute → 复用现有 runner }`。
- **工具结果 = 候选(非实体)**:渲成 generative UI(候选卡 / 维度评分表)嵌进对话 → 人逐条采纳(复用 `AdoptCandidateCard` / CollabField)→ confirm 门物化。**AI 不直接写实体**(铁律②)。
- **一键岛 = 快捷入口**:点现有"出题/诊断"按钮 = 打开 ChatBox 并预调该工具(`functionKey` 预填)。岛与对话同源、可来回。

二波:策划三件套(`planning.thesis/contract/outline`)+ `script.draft`。三波:`material.match` / `publish.platform_adapt`(偏自动)。`research.gather_material` 见 §6(先迁 Vercel)。

---

## 4. Skill 三位一体 + 配置口子

### 4.1 Skill 定义(扩展现有 PromptTemplate registry)

> **Skill = 提示词模板 ⊕ 工具集 ⊕ 输出 Zod schema**

```ts
Skill = {
  id: string; version: string;
  system: string; template: string; requiredFacets: string[];   // 已有(脊柱-1)
  tools: string[];          // 该 skill 允许调的工具白名单(按 ChatContext 注入)
  outputSchema: ZodType;    // 新增:每轮输出契约(防发散)
}
```

现有 `PromptTemplate`(`ai-worker/src/prompt/template.ts`)加 `tools` + `outputSchema` 字段;registry(`registry.ts`)的 `registerTemplate`/`overrideTemplates` 同步。

### 4.2 每轮输出契约(防发散脊梁)

- ChatBox 每轮用 `streamObject`(或工具的 result schema)绑 `skill.outputSchema` → Vercel SDK **校验 + 不符自动重试**(同现有 8 节点的 StructuredOutput 套路)。
- 输出形状(schema 至少两段):

```
{ reply: string,                                   // 给人看的话
  + skill 特定结构: candidates[] / scores[] / nextActions[] }   // 机器用 → 渲 generative UI、走采纳门
```

- **没有这一层,对话框退化成滔滔不绝的 chatbot**。有它,每轮可渲染、可采纳、可喂下游。

### 4.3 配置口子(后台可配,本期不做配置面)

- **现在**:`outputSchema` 在 skill 里写死(Zod / 代码)。
- **后台可配 / 服务端推送的口子**:Zod 不可序列化下发 → 用 **JSON Schema** 作配置载体。`zod-to-json-schema` 把 skill schema 导出;运行时把下发的 JSON Schema 转回校验器(`ajv` 或 `json-schema-to-zod`)。配置面/服务端改的是 **JSON Schema + 模板文本 + 工具白名单**,运行时套用 —— **不改代码**。
- registry 的 override 通道(`overrideTemplates`)扩展为同时覆盖 `system/template/tools/outputSchema(JSON Schema)`。
- **本期只留口子 + 用代码内 Zod**,不建配置 UI。

---

## 5. 数据模型 / 契约清单(字段级,Agent 对照实现)

**新增/改 contract**:
- `projectResource` + `source`(enum) + `platformRef`(object)。`createProject` body 接受可选 `source`/`platformRef`。
- (ChatBox)`ai.chat.send` 流式 op(或复用 `/api/chat` route + 现有 `ai_conversations`);`chatContext` 入参。
- (B2)`calibration.score` 节点 taskType + runner(真实指标→维度分→候选 result;采纳走现有 `recordResult` 手动 run 路径)。

**新增/改 schema + 迁移**:
- `0008_project_source_platformref.sql（落地时取 backend/drizzle 下一个空号；0006/0007 已占用）`:projects 加 `source text default 'manual'` + `platform_ref jsonb default '{}'`。
- prompt template 加 `tools` / `outputSchema`(代码层,无 DB)。

**新增 service**:
- `ensureImportedProject`(ingestion 经端口调 projects/publishing)。
- `refreshDouyin` 改:fetch → ensureImportedProject×N → ingestMetrics → completeRun(不再 reject 未知作品)。
- 评论抓取 + 落 audience_signals(选题评论 basis 源)。

**新增/改前端**:
- `copilot` 进化为 ChatBox(useChat + /api/chat + generative UI + ChatContext 注入)。
- 首波 5 节点注册为工具 + generative UI 渲染件(复用 AdoptCandidateCard)。
- 一键岛改为"开 ChatBox 预调工具"快捷入口。

---

## 6. research.gather_material 迁 Vercel(去 Claude SDK 收尾)

- 现 `research-runner` 用 Claude Agent SDK + WebSearch。迁到 Vercel AI SDK + Vercel/兼容的 web 搜索工具(`tool` + 搜索 API)。
- 迁完:**12 个 AI 节点 + Copilot/ChatBox 全程 Vercel,零 Claude SDK 依赖**(门卫可加断言:模块下无 `@anthropic-ai/claude-agent-sdk` import)。

---

## 7. 验收(每切片三步 + 真链路)

- 每切片:contract / backend / frontend `tsc --noEmit` + 受影响 `vitest` 全绿。
- 数据底座:`refreshDouyin` 后 `metric_snapshots` 新增、`projects where source='imported'` 出真实作品、界面"已发布/播放/评论"出真值。
- ChatBox:选题页打开 → 注入选题 skill;对话"基于最近评论出 5 个选题"→ 调 `topic.generate` 工具 → 候选卡渲进对话 → 采纳物化。每轮输出被 schema 约束(造一条违反 schema 的 mock 应触发重试)。
- 去 Claude SDK:门卫扫描通过。

---

## 8. 实现顺序(优先级排序,**非阶段弱化** —— 范围全做)

1. **数据底座导入**(§1):projects.source/platformRef + 迁移 + ensureImportedProject + refresh 改 → 一键拉取真正落库。**先做,它解锁真实数据**。
2. **B2 编导自动评分**(§5 calibration.score):真实指标→维度分→预填录入。飞轮闭环第一价值。
3. **三方向读侧接真**(§2):校准/选题评论 basis/定位/知识库/首页 读底座真值,mock 让位。
4. **ChatBox 骨架**(§3.1-3.3):进化 Copilot,/api/chat + useChat + ChatContext 注入 + 持久化。
5. **Skill 三位一体 + 首波 5 工具**(§3.4/§4):工具化 + generative UI + 每轮 schema 约束 + JSON Schema 口子。
6. **research 迁 Vercel**(§6)+ 门卫断言收尾。

---

## 9. 开放问题(实现时遇到再定,默认假设先走)

- ChatBox generative UI 的候选渲染:复用 `AdoptCandidateCard`(默认)还是新建对话内卡片?默认复用。
- 历史项目 `current_stage`:导入态用现有 `review`/已发布枚举,还是新增 `published` 态?默认复用现有,不新增枚举。
- 评论量级 / 抓取频率:首版手动触发 refresh,cron 定时留后续(数据源管线 SPEC)。
