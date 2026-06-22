# CreatorOS 编导流水线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 CreatorOS 从"翻页填表的 CRUD"落地成"专业编导的 AI 创作流水线"——一条内容在 定位→选题→研究→脚本→制作→发布→复盘 七阶段里被 AI 驱动推进,人只做编导判断(采纳),复盘回喂选题形成飞轮。

**Architecture:** 全部建在已验证的五件套协同骨干上(阶段状态机 / CreativeContext 上下文装配 / candidate-confirm 采纳总线 / 后台 runner / 飞轮回流)。每个 AI 节点 = 一个 `taskType` + 一个 prompt/Skill + 复用同一个采纳组件,落进各自归属模块。`research_gather` 节点已端到端打通(commit 1db2f51/01e45df),是本计划所有节点的**参考模板**。

**Tech Stack:** Next.js(App Router)· @creatoros/contract(Zod 契约)· pglite + Drizzle(单例持久化)· @anthropic-ai/claude-agent-sdk(订阅 token,后台 runner)· Playwright(端到端验证)· vitest(单测)。

---

## 第一部分:编导视角的流水线蓝图(规划)

> 这是"专业编导怎么做内容"的系统建模。每阶段标注:**编导意图**(一个专业编导在这步想达成什么)· **AI 能力**(taskType)· **读什么上下文** · **产什么物**(candidate→落进哪) · **人的判断点**(编导在哪拍板)。

### 飞轮总览
```
复盘洞察 → ①选题(爆款潜力×定位×变现) → ②研究(素材+对标) → ③分镜脚本(钩子/节奏/CTA)
        → ④制作(分镜→字幕→封面,交接剪映) → ⑤一稿多平台分发 → ⑥数据复盘 → 沉淀方法论 ↻回喂选题
```
横切:**定位**(全局约束,每次 AI 都读)· **变现**(内容角色 引流/信任/转化 + 漏斗)· **料库**(知识/素材,用料链 ⇄ 创作)· **校准**(发布前盲预测→发布后实际→rubric 进化)。

### 阶段→能力→归属 映射表(协同规约 · 实现按此)

| 阶段 | 编导意图 | AI 能力 taskType | 读上下文 | candidate 类型 | 采纳后落进 | 人的判断点 |
|---|---|---|---|---|---|---|
| ①选题 | "什么选题能爆且对我有用" | `topic.generate` | 定位 + 复盘Learnings + 受众信号 | `candidate_list`(打分+理由+对标) | Candidate 选题池 | 10 选 2-3 + 盲预测 |
| ②研究 | "这选题要哪些料/对标" | `research.gather_material` ✅已 | 定位 + 选中选题 | `material_list`(带出处) | KnowledgeItem + **用料链** | 采纳相关料 |
| ③脚本 | "前3秒怎么钩,节奏怎么卡,CTA怎么埋" | `script.draft` / `script.rewrite` | 全量(定位+选题+研究+复盘爆款要素) | `artifact_version`(分镜表) | Artifact 版本 | 重度编辑(编导的活) |
| ④制作 | "按分镜配料/字幕/封面" | `material.match` / `production.caption` | 分镜 + 素材库 | `material_link_list` / `caption` | 用料链 / Production | 选料、交接剪映 |
| ⑤发布 | "一稿改多平台,各自标题封面排期" | `publish.platform_adapt` | 脚本 + 目标平台 | `publication_drafts`(每平台一份) | Publication[] | 微调、排期 |
| ⑥复盘 | "为什么爆/不爆,提炼方法论" | `review.analyze` | 发布 + 回流指标 | `learning_list`(爆款要素) | Learning[] + 校准结果 | 验证洞察 |

### 节点实现模板(每个 AI 节点都长这样 — 以 research_gather 为参考)
1. **taskType**:`<stage>.<capability>`,UI `createAITask` 时传。
2. **CreativeContext**:`assembleCreativeContext` 读上游模块公共服务,拼上下文(机制②)。
3. **后台 runner**(`frontend/src/server/ai/<node>-runner.ts`,server-only):懒加载 SDK → 跑真 Claude(必要时 allowedTools)→ 解析产出 → `aiService.recordCandidate({resultType, resultData})`(机制③)。
4. **触发器**:persistence-client 的 wrapped ai transport,`queued + 该 taskType` → 后台 fire runner(机制④)。
5. **confirm 分支**:`ai.service.confirmTask` 加 `resultType` 分支 → 调归属模块端口物化。
6. **采纳 UI**:复用通用采纳组件(Task A3),挂到对应阶段工作台。
> 新节点 = 写 3(prompt+解析)+ 4(一行触发判断)+ 5(一个 confirm 分支)+ 6(挂一次组件)。**不动骨架。**

---

## 第二部分:文件结构(改动地图)

**协同骨干(Phase A 新建/改)**
- `frontend/src/server/ai/creative-context.ts` — 扩展:加 `learnings` / `materials` 上下文源。
- `frontend/src/server/ai/agent-run.ts` — **新建**:抽出 research-runner 里通用的"跑 Claude + 解析"骨架,各节点 runner 复用。
- `frontend/src/components/ai/adopt-candidate-card.tsx` — **新建**:通用采纳组件(createAITask→轮询→采纳),从 gather-material-island 抽象。
- `backend/src/schema/material-links.ts` — **新建**:用料链(BillOfMaterials)表 + DDL。
- `frontend/src/server/modules/material-links/` — **新建模块**:用料链 repo/service/transport(user+project scoped)。
- `contract/src/operations/ai.ts` — 加 `ai.tasks.get` 读 op。
- `contract/src/operations/material-links.ts` — **新建**:用料链 ops。
- `frontend/src/components/project/project-stage-stepper.tsx` — 改:stepper 可点。
- `frontend/src/server/modules/projects/...` — 改:统一 `transitionStage`(workspace 也落状态)。

**节点(Phase B–D)**
- `frontend/src/server/ai/topic-runner.ts` · `script-runner.ts` · `platform-adapt-runner.ts` · `review-runner.ts` · `material-match-runner.ts` — 各节点 runner。
- 各阶段工作台 feature 下挂采纳组件(topics / script / publishing / review / production)。
- `frontend/src/server/modules/ai/ai.service.ts` — 各 confirm 分支。
- `frontend/src/app/(creator)/calibration/` + 侧栏 — 挂载孤儿 calibration 组件。

---

## 第三部分:Phase A — 协同骨干硬化(先做,解锁全部下游)

### Task A1: ai.tasks.get 读 op(稳健轮询 + 失败可见)

**Files:**
- Modify: `contract/src/operations/ai.ts`
- Modify: `frontend/src/server/modules/ai/ai.transport.ts` (AI_OP_IDS + case)
- Test: `frontend/src/server/modules/ai/ai.acceptance.test.ts` (op-id 列表 7→8)

- [ ] **Step 1**:`contract/src/operations/ai.ts` 在 `listTaskResults` 后加:
```ts
  getTask: defineEndpoint({
    id: "ai.tasks.get",
    method: "GET",
    path: "/ai/tasks/:taskId",
    params: taskParams,
    response: aiTaskResource,
    fr: ["FR-AI-TASKS-GET"],
  }),
```
- [ ] **Step 2**:`ai.transport.ts` `AI_OP_IDS` 加 `"ai.tasks.get"`;switch 加:
```ts
        case "ai.tasks.get": {
          const task = await service.getTask(ctx, p.taskId ?? "");
          return { data: task, meta: { requestId } };
        }
```
- [ ] **Step 3**:`ai.acceptance.test.ts` 的 op-id 断言数组加 `"ai.tasks.get"`,标题 7→8。
- [ ] **Step 4**:`pnpm vitest run src/server/modules/ai` → 全过。
- [ ] **Step 5**:`git commit -m "feat(ai): + ai.tasks.get read op for robust task polling"`

### Task A2: runner 在起跑时把任务翻到 running(状态真实)

**Files:**
- Modify: `frontend/src/server/modules/ai/ai.service.ts` (加 `markRunning`)
- Modify: `frontend/src/server/ai/research-runner.ts` (起跑即 markRunning)
- Test: `frontend/src/server/modules/ai/ai.service.test.ts`

- [ ] **Step 1**:`ai.service.ts` 接口加 `markRunning(ctx, taskId): Promise<void>`;实现:`queued→running`(stamp startedAt),已 running 则 no-op,非法则忽略(best-effort)。
```ts
    async markRunning(ctx, taskId) {
      const repo = repoFor(ctx);
      const task = await repo.requireTask(taskId);
      if (task.status === "queued") {
        await repo.updateTaskStatus(taskId, { status: "running", startedAt: deps.now() });
      }
    },
```
- [ ] **Step 2**:`research-runner.ts` `runGatherMaterial` try 开头加 `await deps.ai.markRunning(ctx, task.id);`(`GatherDeps.ai` 已是 AiService)。
- [ ] **Step 3**:`ai.service.test.ts` 加用例:createTask→markRunning→getTask status==="running"。
- [ ] **Step 4**:`pnpm vitest run src/server/modules/ai` → 全过。
- [ ] **Step 5**:`git commit -m "feat(ai): flip task to running at agent start (honest status)"`

### Task A3: 通用采纳组件 AdoptCandidateCard(全节点复用)

**Files:**
- Create: `frontend/src/components/ai/adopt-candidate-card.tsx`
- Modify: `frontend/src/features/research/gather-material-island.tsx` (改为薄包装 AdoptCandidateCard)
- Test: `frontend/src/components/ai/adopt-candidate-card.test.tsx`

- [ ] **Step 1**:抽象 gather-material-island 的状态机(idle/running/review/done/error + createAITask→轮询(用 A1 的 getTask 判 cancelled→error,listTaskResults 取候选)→采纳)成参数化组件:
```ts
export interface AdoptCandidateCardProps<T> {
  title: string; description: string; startLabel: string;
  taskType: string;
  inputData: Record<string, unknown>;
  parseItems: (resultData: Record<string, unknown>) => T[];
  renderItem: (item: T) => React.ReactNode;
  adoptLabel: (n: number) => string;
}
```
轮询:每 4s `getTask`;`status==="awaiting_confirmation"` → `listTaskResults` 取候选 `parseItems` → review;`status==="cancelled"||"failed"` → error;`MAX_POLLS` 超时 → error。采纳 = `confirmTask` → `router.refresh()`。
- [ ] **Step 2**:`adopt-candidate-card.test.tsx` 用 mock client(vi.mock `@/lib/contract-client`)测三态流转:start→running、awaiting→review(渲染候选)、采纳→confirmTask 调用。
- [ ] **Step 3**:`gather-material-island.tsx` 改为 `<AdoptCandidateCard taskType="research.gather_material" inputData={{projectId,topic,angle}} parseItems={d=>d.items} renderItem={renderMaterial} .../>`,删掉自带状态机。
- [ ] **Step 4**:`pnpm vitest run src/components/ai src/features/research` → 全过;`pnpm typecheck` → 干净。
- [ ] **Step 5**:`git commit -m "refactor(ai): extract reusable AdoptCandidateCard from gather island"`

### Task A4: 用料链 BillOfMaterials(料库 ⇄ 创作的连接实体)

**Files:**
- Create: `backend/src/schema/material-links.ts`
- Modify: `backend/src/db.ts` (DDL) + `backend/src/index.ts` (export)
- Create: `contract/src/operations/material-links.ts` + `contract/src/resources/material-links.ts`
- Create: `frontend/src/server/modules/material-links/{material-links.repository,service,transport,index}.ts`
- Modify: `frontend/src/server/persistence-client.ts` (注册 + DDL seed)
- Test: `frontend/src/server/modules/material-links/material-links.service.test.ts`

- [ ] **Step 1**:`material-links.ts` schema(全 user+project scoped,软外键):
```ts
export const materialLinks = pgTable("material_links", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  projectId: text("project_id").notNull(),
  contentOutputId: text("content_output_id"),     // nullable
  entityType: text("entity_type").notNull(),       // 'knowledge' | 'asset'
  entityId: text("entity_id").notNull(),
  role: text("role").notNull().default("reference"), // reference|evidence|broll|clip|cover|snippet
  stage: text("stage").notNull().default("research"),
  addedByType: text("added_by_type").notNull().default("user"), // user|ai
  createdAt: text("created_at").notNull(),
});
export const MATERIAL_LINKS_DDL = `CREATE TABLE IF NOT EXISTS material_links (... 同上字段 ...);`;
```
- [ ] **Step 2**:契约 ops:`materialLinks.list`(query projectId,isList)、`materialLinks.create`(body entityType/entityId/role/stage/projectId/contentOutputId)、`materialLinks.delete`(params linkId)。resource = 上述字段。
- [ ] **Step 3**:repo(`list(projectId)` / `create` / `delete`,全部 `eq(userId)` + `eq(projectId)`)+ service(RequestContext)+ transport(注册 3 ops + meta.page/pageSize)。
- [ ] **Step 4**:service 测:create→list 见到、跨 project 不串、delete 生效、跨 user 404。
- [ ] **Step 5**:`backend/src/db.ts` 加 `MATERIAL_LINKS_DDL` exec;`index.ts` export;`persistence-client.ts` 注册 transport + `MATERIAL_LINKS_OP_IDS` 入 PERSISTED_OPS。
- [ ] **Step 6**:`pnpm vitest run src/server/modules/material-links` + `pnpm typecheck` → 全过。
- [ ] **Step 7**:`git commit -m "feat(material-links): bill-of-materials entity linking library↔creation"`

### Task A5: research_gather 落料即建用料链(补打通第一条活链)

**Files:**
- Modify: `frontend/src/server/modules/ai/ai.service.ts` (AiKnowledgePort 加 link;material_list confirm 分支建链)
- Modify: `frontend/src/server/persistence-client.ts` (注入 materialLinks port)
- Test: `frontend/src/server/modules/ai/ai.service.test.ts`

- [ ] **Step 1**:`ai.service.ts` 加 `AiMaterialLinksPort { link(ctx, {projectId, entityType, entityId, role, stage}): Promise<void> }`,ServiceDeps 加 `materialLinks`。`material_list` confirm 分支里,每条 `createKnowledge` 拿到 `{id}` 后,若 `task.projectId` 存在则 `await deps.materialLinks.link(ctx, {projectId: task.projectId, entityType:"knowledge", entityId:id, role:"reference", stage:"research"})`。
- [ ] **Step 2**:persistence-client 注入 `materialLinks: { link: (ctx,i)=>materialLinksService.create(ctx,i) }`。
- [ ] **Step 3**:`ai.service.test.ts` material_list confirm 用例断言 link port 被调 N 次。
- [ ] **Step 4**:`pnpm vitest run src/server/modules/ai` + typecheck → 全过。
- [ ] **Step 5**:dev 重启,curl 端到端:gather→confirm→`materialLinks.list?projectId=` 返回 N 条。
- [ ] **Step 6**:`git commit -m "feat(ai): gather confirm links materials to the project (first live bill-of-materials)"`

### Task A6: 阶段状态机统一(stepper 可点 + 单一 transition)

**Files:**
- Modify: `frontend/src/components/project/project-stage-stepper.tsx` (段可点 → Link/transition)
- Modify: `frontend/src/features/.../project-header-actions.tsx`(workspace「进入下一步」改调 `transitionProjectStage` 再导航)
- Test: 相关 workspace 测 + `frontend/src/app/api/v1/dispatch/route.test.ts`

- [ ] **Step 1**:确认契约已有 `projects.stages.transition`(stage 参数);stepper 的每个段改成调用它的客户端 island(点击 → `client.transitionProjectStage({params:{projectId, stage}})` → `router.push(stageHref)`)。仅允许跳到"已解锁"阶段(≤当前+1 或已完成),其余置灰。
- [ ] **Step 2**:workspace header「进入下一步」从纯 `<Link>` 改为:先 `transitionProjectStage(next)` 再 `router.push(nextHref)`(与 overview 同语义,消除两套)。
- [ ] **Step 3**:更新受影响 workspace 快照测(stepper 现在是 button/link)。
- [ ] **Step 4**:`pnpm vitest run src/features src/app/api/v1/dispatch` → 全过。
- [ ] **Step 5**:`git commit -m "fix(pipeline): unify stage transition — clickable stepper, single next-step semantics"`

### Task A7: CreativeContext 扩展(learnings + materials)

**Files:**
- Modify: `frontend/src/server/ai/creative-context.ts`
- Modify: `frontend/src/server/persistence-client.ts` (注入 learnings/materials reader)
- Test: `frontend/src/server/ai/creative-context.test.ts`

- [ ] **Step 1**:`CreativeContext` 加 `learningsBrief: string`(复盘爆款要素摘要)+ `materials: {title,role}[]`(本项目用料清单)。`assembleCreativeContext` 加两个可选 reader(`LearningsReader.topRelevant(ctx,topic)` / `MaterialsReader.listByProject(ctx,projectId)`),失败降级空。
- [ ] **Step 2**:persistence-client 注入 readers(learningsService.getSuggestions / materialLinksService.list)。
- [ ] **Step 3**:`creative-context.test.ts` 断言:有/无 learnings、有/无 materials 各装配正确,reader 抛错时降级。
- [ ] **Step 4**:`pnpm vitest run src/server/ai` + typecheck → 全过。
- [ ] **Step 5**:`git commit -m "feat(ai): CreativeContext gains learnings + project materials (机制②扩展)"`

---

## 第四部分:Phase B — 高杠杆编导节点(选题会 + 分镜脚本)

> 编导认知:选题+脚本是杠杆点。两者都按"节点模板"实现,复用 Task A3 采纳组件 + A7 上下文。

### Task B1: 选题会 AI 节点 `topic.generate`

**Files:**
- Create: `frontend/src/server/ai/topic-runner.ts`
- Modify: `ai.service.ts`(`candidate_list` confirm 分支 → CandidateService.createFromAIResult)、`persistence-client.ts`(触发器加 `topic.generate`;注入 candidate port)
- Modify: `frontend/src/features/topics/...`(挂 AdoptCandidateCard:「AI 帮我出选题」)

- [ ] **Step 1**:`topic-runner.ts`(模板第3步):prompt = 让 agent 基于 `context.positioningBrief + context.learningsBrief + 受众信号` 产 5-8 条选题,每条 `{title, angle, contentRole, scores:{爆款潜力,定位契合,变现潜力}, reason, 对标}`,输出 JSON。`recordCandidate({resultType:"candidate_list", resultData:{items}})`。
- [ ] **Step 2**:触发器(模板第4步):persistence-client wrapped transport 加 `task.taskType==="topic.generate"` → 后台 `runTopicGenerate`。
- [ ] **Step 3**:confirm 分支(模板第5步):`candidate_list` → 每条 `candidateService.createCandidate(ctx, {title, angle, contentRole, source:"ai"})`(经 AiCandidatePort)。
- [ ] **Step 4**:UI(模板第6步):topics 页挂 `<AdoptCandidateCard taskType="topic.generate" inputData={{}} parseItems renderItem={renderTopicCard} .../>`。
- [ ] **Step 5**:dev 重启 curl 端到端:createAITask(topic.generate)→候选→采纳→`candidates.list` 增 N 条。Playwright:topics 页按钮→running。
- [ ] **Step 6**:`git commit -m "feat(topics): AI 选题会 node (topic.generate) on the candidate-confirm bus"`

### Task B2: 校准/盲预测挂载(选题的预测端)

**Files:**
- Create: `frontend/src/app/(creator)/calibration/page.tsx`(挂已存在的 `calibration-interactive-region.tsx`)
- Modify: `frontend/src/components/shell/sidebar.tsx`(加 校准 入口,紧邻 选题)

- [ ] **Step 1**:建 `/calibration` 路由,server 读 `pages` 或直接渲染 `CalibrationInteractiveRegion`(已写好、当前孤儿);补它依赖的 server 读(rubric/prediction list)。
- [ ] **Step 2**:sidebar `PRIMARY_NAV` 在 `topics` 后加 `{ id:"calibration", label:"校准", href:"/calibration", ... }`。
- [ ] **Step 3**:Playwright:`/calibration` 加载无报错,盲预测表单可填。
- [ ] **Step 4**:`git commit -m "feat(calibration): mount the orphaned blind-prediction surface (七步⑤⑥)"`

### Task B3: 分镜脚本 AI 节点 `script.draft` + 真落库

**Files:**
- Create: `frontend/src/server/ai/script-runner.ts`
- Modify: `frontend/src/features/script/script-interactive-region.tsx`(「保存」真调 `createArtifactVersion`;挂 AdoptCandidateCard「AI 起草分镜」)
- Modify: `ai.service.ts`(已有 `artifact_version` confirm 分支,复用)、`persistence-client.ts`(触发器加 `script.draft`)

- [ ] **Step 1**:`script-runner.ts`:prompt = 基于**全量 context** 产**分镜脚本**(JSON:`{sections:[{口播,画面,字幕,时长}], hook, cta}`),卡爆款公式。`recordCandidate({resultType:"artifact_version", artifactId, resultData:{body: <分镜序列化>, summary}})`(复用现成 confirm→createVersion)。
- [ ] **Step 2**:触发器加 `script.draft`。
- [ ] **Step 3**:修脚本真落库:`script-interactive-region.tsx`「保存」从翻本地 saveStatus 改为 `await client.createArtifactVersion({params:{artifactId}, body:{contentText, changeSummary}})` → `router.refresh()`。
- [ ] **Step 4**:UI 挂 `<AdoptCandidateCard taskType="script.draft" inputData={{projectId, artifactId}} .../>`;采纳即 createVersion。
- [ ] **Step 5**:dev 重启 curl + Playwright 端到端。
- [ ] **Step 6**:`git commit -m "feat(script): AI 分镜起草 node + real script persistence"`

### Task B4: 脚本内联改写 `script.rewrite`

**Files:**
- Modify: `script-runner.ts`(加 rewrite 模式:context + 选中片段 → 改写)、`script-interactive-region.tsx`(选中段「AI 改写这段」→ createAITask→采纳替换)

- [ ] **Step 1**:`script.rewrite` taskType,inputData 带 `{artifactId, sectionText, instruction?}`;runner 产改写后的段 → `recordCandidate(artifact_version)` 或一个 `section_rewrite` 轻量分支(只替换选中段)。
- [ ] **Step 2**:UI:每段加「AI 改写」→ AdoptCandidateCard(inline 模式)→采纳替换该段。
- [ ] **Step 3**:Playwright 验证。
- [ ] **Step 4**:`git commit -m "feat(script): inline AI rewrite (采纳即替换)"`

---

## 第五部分:Phase C — 分发 + 飞轮闭合

### Task C1: 一稿多平台 `publish.platform_adapt`

**Files:** `frontend/src/server/ai/platform-adapt-runner.ts` · `ai.service.ts`(`publication_drafts` confirm→PublishingService.createPublication×N) · publishing 工作台挂组件。

- [ ] **Step 1**:runner:context(脚本 + `project.targetPlatforms`)→ 每平台产 `{platform, title, body, tags[], coverIdea}`(抖音竖屏短/B站中视频/小红书图文/公众号长文 各自风格)→ `recordCandidate({resultType:"publication_drafts", resultData:{drafts}})`。
- [ ] **Step 2**:触发器加 `publish.platform_adapt`。
- [ ] **Step 3**:confirm 分支:每 draft `publishingService.createPublication(outputId, {platform, ...})` + revision。
- [ ] **Step 4**:publishing 工作台挂 AdoptCandidateCard;采纳后每平台一条 Publication。
- [ ] **Step 5**:curl + Playwright 端到端。
- [ ] **Step 6**:`git commit -m "feat(publish): 一稿多平台 platform_adapt node"`

### Task C2: 复盘 AI `review.analyze` + 飞轮回流

**Files:** `frontend/src/server/ai/review-runner.ts` · `ai.service.ts`(`learning_list` confirm→LearningsService) · review 工作台挂组件 · 校准回流。

- [ ] **Step 1**:runner:context(发布 + 指标快照)→ 归因 + 提炼 `{insight, recommendation, learningType, confidence}` 爆款要素 → `recordCandidate({resultType:"learning_list", resultData:{items}})`。
- [ ] **Step 2**:confirm 分支:每条 `learningsService.createLearning(ctx, {...})`。
- [ ] **Step 3**:飞轮:Task A7 已让 `topic.generate`/`script.draft` 的 context 读 learningsBrief —— 故复盘产出的 Learning **自动回喂**下一轮选题/脚本(无需额外接线,验证即可)。
- [ ] **Step 4**:校准收口:review 阶段若有该内容的 `Prediction`,记 `CalibrationResult`(实际)→ 可触发 `bumpRubricVersion`。
- [ ] **Step 5**:curl 端到端:复盘产 Learning → 新 `topic.generate` 的候选 reason 里出现"参考上次X爆款要素"(人工核验上下文注入)。
- [ ] **Step 6**:`git commit -m "feat(review): AI 复盘 node + flywheel feedback into 选题/脚本"`

---

## 第六部分:Phase D — 料库协同闭环

### Task D1: 素材库做真(去装饰 + 真上传 + 用料链消费)

**Files:** `frontend/src/features/assets/...`(筛选/搜索/分页接真 `assets.list` query;上传接真 file;删除装饰控件)· 详情面板加「附到当前项目」→ `materialLinks.create`。

- [ ] **Step 1**:assets 页筛选/搜索/分页从装饰改为驱动 `assets.list` 的 query 参数(type/source/page)。
- [ ] **Step 2**:上传接真 file picker → `createUpload`+`completeUpload`(去掉写死桩 payload)。
- [ ] **Step 3**:删除或隐藏纯装饰控件(批量/视图切换/假计数),侧栏类型计数改为真 `assets.list` 聚合。
- [ ] **Step 4**:详情面板加「附到项目」选择器 → `materialLinks.create({entityType:"asset", role:"clip"})`。
- [ ] **Step 5**:Playwright 验证筛选/上传/附链。
- [ ] **Step 6**:`git commit -m "feat(assets): real library — working filters/upload + attach-to-project (用料链)"`

### Task D2: 素材匹配 AI 节点 `material.match`(制作阶段)

**Files:** `frontend/src/server/ai/material-match-runner.ts` · `ai.service.ts`(`material_link_list` confirm→materialLinksService) · production 工作台挂组件。

- [ ] **Step 1**:runner:context(分镜 sections + `assets.list` 该用户素材)→ 为每个镜头匹配库内素材,产 `{sectionIndex, assetId, role, reason}[]` → `recordCandidate({resultType:"material_link_list", resultData:{matches}})`。
- [ ] **Step 2**:触发器 + confirm 分支:每 match `materialLinksService.create({entityType:"asset", role, stage:"production"})`。
- [ ] **Step 3**:production 工作台挂 AdoptCandidateCard「AI 配素材」;采纳后时间线/用料清单显示挂上的素材。
- [ ] **Step 4**:curl + Playwright 端到端。
- [ ] **Step 5**:`git commit -m "feat(production): AI 素材匹配 node (镜头↔素材库 via 用料链)"`

### Task D3: 全局跨链点穿(消灭孤岛的最后一步)

**Files:** dashboard / publishing / monetization / experience 各卡片加 `<Link>` 到对应实体。

- [ ] **Step 1**:发布中心「查看」→ 链到内容/项目详情;dashboard 待办/建议/最近发布卡 → 各自实体;monetization 线索 → 归因内容;experience learning → 产生它的发布。
- [ ] **Step 2**:Playwright 巡检:各页关键卡片可点穿、无死链。
- [ ] **Step 3**:`git commit -m "feat(nav): cross-module deep links — close the island gaps"`

---

## 第七部分:自检(Self-Review)

**Spec coverage**:七阶段映射表每行都有任务 —— ①选题 B1+B2 · ②研究 已done+A5 · ③脚本 B3+B4 · ④制作 D2 · ⑤发布 C1 · ⑥复盘 C2 · 飞轮 A7+C2 · 料库 A4+A5+D1+D2 · 跨链 D3 · 骨干 A1-A3+A6。无遗漏。

**Placeholder scan**:无 TBD;每个 runner 任务给了 prompt 产出 schema、confirm 分支给了归属服务调用、UI 给了组件挂法。节点模板 DRY 引用(A3 组件 + 模板六步)而非"similar to",每个节点任务列出**具体** taskType/schema/落点。

**Type consistency**:`recordCandidate({resultType, resultData})`、`confirmTask` 分支按 `resultType`、`AdoptCandidateCard` props(taskType/inputData/parseItems/renderItem)、用料链字段(entityType/entityId/role/stage)全计划内一致。candidate 类型集合固定:`material_list`/`candidate_list`/`artifact_version`/`publication_drafts`/`learning_list`/`material_link_list`。

**依赖顺序**:A(骨干)→ B(选题/脚本)→ C(分发/飞轮)→ D(料库)。A4/A5(用料链)在 D2(素材匹配)前;A7(context 扩展)在 B/C(节点读 learnings/materials)前;A3(采纳组件)在所有节点 UI 前。顺序自洽。
