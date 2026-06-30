# CreatorOS 通用「调度 Agent 作业」+ 自有数据周期采集 设计

> ## ⛔ SPEC 审核裁决(2026-06-30,spec-review gate):**FAIL → 已按裁决重写,待 re-review**
>
> **重写于 2026-06-30,已落实下述全部修正(2 blocker + 3 major + 用户决策 + 1 minor),待 re-review。**
>
> 跨上下文独立评审(对照宪法 + 真实代码,起 3 个核实子代理)。**两个 blocker 都是"SPEC 写于实现前、现状已被超越却没对账":**
> 1. **采集底座押错路线(reinvent-wheel)**:原稿整份建在 `connectOverCDP`/`ws://localhost:9222` 上,但项目已在 commit `53efbb7` 重写为 `launchPersistentContext + 扫码登录`并显式弃用 CDP(对用户 Chrome 149 报 `Browser context management is not supported`、`/json/list` 0 target;见 `frontend/src/server/ingestion/douyin-cdp.ts:184-185` + memory `douyin-collection-approach`)。→ **已改:`BrowserDriver` 起步实现落到已跑通的 `launchPersistentContext(.auth/)+扫码 loginDouyin+headless 复刷 fetchDouyinMetrics`,删除 CDP/9222/`--remote-debugging-port` 作首选(§3 / §4 / §8)。**
> 2. **数据归属撞已 ✅ 的 T-001(fit-positioning)**:宪法级姊妹 SPEC `data-foundation §1.1` 已定"自己作品=`projects(source:imported)`,不另建作品库实体"且已落地(commit `9010166`)。原稿新建 `self_work`/`self_metric_snapshot` 平行表 = 纯重复建模(表达力更弱、丢幂等锚)。→ **已改:删 `self_work`/`self_metric_snapshot`;"自己数据周期刷新"= 调度作业周期性调已有 `refreshDouyin→ensureImportedProject→ingestMetrics`,作品落 `projects(source:imported)`、指标落 `metric_snapshots`/`metric_values`(复用 T-001),评论落 `audience_signals`(复用 data-foundation §1.3 口径)(§3 / §4)。**
>
> **3 个 major(已落实):**
> - Sfix 修了已不存在的 bug:`topic-task-adapter.ts:66-73` 早已按 basis 装配 signalsBrief/knowledgeBrief,Sfix 不再是本 SPEC 的活,**已删**(§7)。
> - 新表迁移号缺:**已定为 0009**(0008 已被 T-001 占),收敛后只剩 2 张新表逐字段列出(§4)。
> - 已有 `ai_tasks`/`ai_task_steps`/`drainQueue` 队列未对账就另起 `job_run`:**已改为 `scheduled_job` 到点产一条 `ai_task` 走现有 `drainQueue`/`runTask`/`ai_task_steps`**;`job_run` 瘦成纯"调度触发记录"(lastRun/nextRun/itemsNew/Updated),步骤日志复用 `ai_task_steps`,不另起一套(§4 / §5)。
>
> **1 个 minor(已落实):** 登录态过期从开放风险**降级为已有机制接线** —— headless 复刷遇未登录 → 复用 `DouyinNotLoggedInError` → `job_run` 标"需重连 Chrome" + 任务中心红标 + 停跑等用户 headed 扫码(§6 / §8)。
>
> **好的一面(保留)**:核心原语 `prompt+schedule → 唤醒 Agent → recipe 确定性重放` 成立、合飞轮定位(reviewer 认可);node-cron 进程内调度、`/automations` 任务中心 UI 复用基础齐备。本次重写**保留这些核心**,但全部收敛到"自己 + 评论"两源 + 复用现有队列/采集链。
>
> 状态:设计稿,**已按裁决重写,待 re-review**。re-review verdict≠FAIL 后方可开工(T-007)。
>
> 决策已定(用户逐轮拍板,**对标已砍**):
> - **本期数据源只剩两类**:① 自己主页/作品/指标 ② 评论。**对标博主(benchmark)本期不纳入**(reviewer 标注为"可能让产品扩张成通用爬虫平台"的 fit-positioning 风险点,用户拍板砍掉)。
> - **定时任务做成通用原语**:`提示词 + 调度器 → 周期唤醒 Agent → 用浏览器工具抓数据 → 落库`。换数据源 = 换 target,不写新采集器。
> - **采集能力全用 TS,落 `frontend/src/server/ingestion/douyin-cdp.ts` 已跑通的持久化登录态采集**(已实现 `launchPersistentContext(.auth/)+扫码 loginDouyin+headless 复刷 fetchDouyinMetrics`),不重写、不押 CDP connectOverCDP。
> - **浏览器:`launchPersistentContext(.auth/)` 自起 Chromium + 持久化登录态起步**,工具接口抽象成 `BrowserDriver`,后续可 swap 服务端 headless Playwright(storageState)。
> - **调度作业到点产一条 `ai_task` 走现有队列**(`drainQueue`/`runTask`),不另起一套 runner / 步骤日志。

## 1. 核心洞察

把"定时任务"做成一个**通用原语**:一个作业 = 一段提示词 + 一个调度。调度器到点产出一条 `ai_task`,既有队列(`drainQueue`)claim 后唤醒 Agent(`runTask`),Agent 用授权的浏览器工具去执行(抓自己主页数据 / 评论),产出结构化数据,**经 ingestion 已有链路**落到 `projects(source:imported)` / `metric_snapshots` / `audience_signals`。

- **通用**:加新自动化 = 写提示词 + 配调度,不写新采集器代码。
- **复用现成(三处)**:
  - **采集** = 已跑通的 `fetchDouyinMetrics`(`launchPersistentContext`)+ 待补的评论抓取,**同文件、同持久化登录态**。
  - **唤醒 Agent** = 既有队列 `ai_tasks → drainQueue → runTask`(`runAgentNode` + `tool-registry`),**不另起 runner**。
  - **落库** = 既有 `refreshDouyin → ensureImportedProject → ingestMetrics`(作品/指标)+ 评论 → `audience_signals`,**不另建源表**。
- **绕开鉴权**:自起 Chromium + 持久化 `.auth/` 复用你**扫码登录过**的会话抓"自己的"数据 —— 不碰抖音签名/反爬;cookie 只活在 `.auth/`,绝不落库、绝不入 Git(最符合 secrets 规则)。

## 2. 三条铁律(设计约束,违反即返工)

**① 数值程序化抽取,LLM 不"看"数字。** Agent 只编排"去哪页 / 点哪 / 要抓哪些字段";真数值由工具从 **DOM `evaluate` 或拦截的网络响应 JSON** 里取(确定性、可校验)。现有 `fetchDouyinMetrics` 已是这套(`page.on("response")` 拦 `WORK_LIST_HINTS` XHR JSON → `parseWorkList` 纯函数)。绝不让模型从截图/文本里"读"播放量——那会造数,违反"数据要真"。

**② 发现一次,确定性重放。** Agent 首跑摸清后产出一份 `recipe`(选择器 / 接口路径 / 步骤);之后定时运行**确定性重放 recipe,不调 LLM**;只有 recipe 失效(抓取为空/结构变)才再唤醒 Agent 重新发现并更新 recipe。既有适应力,又有 cron 的稳定与便宜。**对"自己作品+指标"这一源,首版即可不走 Agent 发现**——直接确定性重放已实现的 `fetchDouyinMetrics`;`recipe` 机制留给评论源 + 未来页面结构变更。

**③ 作业是带约束的单元,不是裸提示词。** `ScheduledJob = prompt + schedule + 工具授权(偏只读)+ 输出 schema + 落库目标 + provenance`。工具只读 + 落库(无发帖/删除/转账);落库走 backend service 守卫(AI 不直接写领域实体,合宪法核心原则 3)。到点产出的 `ai_task` 带 `taskType=scheduled.xxx`,沿用既有 `ai_tasks` 的工具白名单与 confirm 门。防止提示词漂移去做危险动作。

## 3. 架构

```
ScheduledJob(用户配:名称 + 提示词 + 调度 + 目标源 ∈ {自己作品, 评论})
        ↓ 调度器到点(node-cron) → 产一条 ai_task(taskType=scheduled.<source>, idempotencyKey=(jobId,自然日))
既有队列(drainQueue → claimNextQueued → runTask)  ← 不另起 runner
   ├─ 有效 recipe / 内建采集器 → 确定性重放(不调 LLM):
   │     · self.metrics → 直接调已实现 fetchDouyinMetrics(launchPersistentContext)
   │     · comments     → 调待补的 fetchDouyinComments(同文件、同 .auth/)
   └─ 无 recipe / 抓取为空结构变 → 唤醒 Agent(runAgentNode + tool-registry 授权 BrowserDriver 工具)发现 → 更新 recipe
        ↓ 程序化抽值(DOM evaluate / 拦 XHR JSON)→ MetricRecord[] / CommentRecord[]
        ↓ 经 ingestion 已有链路落库(不新建源表):
源(复用):作品+指标 → refreshDouyin → ensureImportedProject → ingestMetrics
                       → projects(source:imported) / metric_snapshots / metric_values   (T-001 ✅)
          评论       → audience_signals(source="douyin_comment", external_id=comment_id) (data-foundation §1.3)
        ↓ 每到点触发记一条 job_run(瘦:startedAt/finishedAt/status/itemsNew/itemsUpdated/aiTaskId)
        ↓ 过程步骤日志复用 ai_task_steps(经 aiTaskId 关联,不另起步骤表)
任务中心(新·页面 /automations)  作业列表 + 上次/下次运行 + 状态 +「立即运行」+ 启用开关 + 运行详情(读 ai_task_steps)
        ↓ 消费
自己真数据周期刷新 → Dashboard/复盘读真表;评论作业 → audience_signals → 选题"评论"依据变活
```

**BrowserDriver 抽象**(关键,为了不锁死实现、给 Agent 发现路径用):
```ts
interface BrowserDriver {
  navigate(url: string): Promise<void>;
  evaluate<T>(fn: string): Promise<T>;          // 程序化取 DOM 真值
  onNetwork(filter): AsyncIterable<Response>;    // 拦截接口真 JSON
  close(): Promise<void>;
}
```
- **起步实现 = `PersistentContextDriver`(已落地的底座)**:`@playwright/test` `chromium.launchPersistentContext(authDir, { headless })`(`douyin-cdp.ts:186-199` 的 `openContext`),不连用户现成浏览器(`connectOverCDP` 那条路对真实用户 Chrome 149 不稳,已弃用)。三个原语映射:
  - `navigate(url)` → `page.goto(url, { waitUntil: "domcontentloaded" })`。
  - `onNetwork(filter)` → `page.on("response", …)` 按 URL hint 收集 JSON(现有 `WORK_LIST_HINTS` 即此)。
  - `evaluate(fn)` → `page.evaluate(fn)`(DOM 兜底取值,当 XHR 拦不到时)。
  - 登录态:`headless=false` 弹窗扫码(`loginDouyin`,落 `.auth/`);`headless=true` 复刷抓取(`fetchDouyinMetrics`);未登录抛 `DouyinNotLoggedInError`(`isLoggedIn` 查 `sessionid` cookie)。
- **首版可不显式抽 `BrowserDriver` 类**:"自己作品+指标"源直接复用现成 `fetchDouyinMetrics`;`BrowserDriver` 接口是给"评论源 / Agent 发现路径 / 未来服务端 headless swap"预留的抽象层,落地时按需提取,不为抽象而抽象。
- **后续可加 `ServerHeadlessDriver`**:服务端 headless + `storageState`(加密存)做真无人值守 —— 工具接口不变。

## 4. 数据模型(backend schema + 迁移 0009)

**先讲复用(不新建表):**

| 复用表 | 来源 | 本设计怎么用 |
|---|---|---|
| `projects`(`source:imported`, `platform_ref`) | T-001 / data-foundation §1.1 ✅ | 自己作品落这,**不新建作品库实体**。`ensureImportedProject` 幂等于 `(userId, platform, externalId)`。 |
| `metric_snapshots` / `metric_values` | T-001 ✅ | 自己指标周期快照落这,`ingestMetrics` 经 `resolvePublication` 命中后 `appendSnapshot`。 |
| `audience_signals` | data-foundation §1.3 | 评论落这:`raw_text`=评论文本、`source="douyin_comment"`、`demand_tag=null`(待 AI 打)、`external_id=comment_id`;幂等键 `(userId, external_id)`。 |
| `ai_tasks` / `ai_task_steps` | 迁移 0007 ✅ | 调度到点产 `ai_task`(`taskType=scheduled.<source>`)走 `drainQueue`/`runTask`;过程步骤落 `ai_task_steps`(经 `aiTaskId` 关联)。**不另起 runner / 步骤表。** |

**真要新建的表(收敛后只剩 2 张,迁移取 `0009`):**

迁移 `backend/drizzle/0009_scheduled_job_and_run.sql`(0008 已被 T-001 占;DDL 同步进 backend schema + `createDb()` 的 raw DDL,沿用 ai.ts 范式:text PK、ISO8601 text 时间戳、jsonb、owned-root 带 `user_id`)。

| 表 | 列 | 类型 | 说明 |
|---|---|---|---|
| `scheduled_job` | `id` | text PK | 通用作业定义(owned-root)。 |
| | `user_id` | text not null | ownership boundary(ctx.userId 写时戳)。 |
| | `name` | text not null | 作业名(任务中心展示)。 |
| | `prompt` | text not null default '' | 作业提示词(Agent 发现路径用;内建采集器源可空)。 |
| | `source_kind` | text not null | `self.metrics` \| `comments`(本期两源;枚举由 contract Zod 校验)。 |
| | `target` | jsonb not null default '{}' | 源标识(如 `{ externalSourceId }` 自己源 / `{ awemeId, maxPages }` 评论源)。 |
| | `schedule` | text not null | cron 表达式(node-cron)。 |
| | `tool_grants` | jsonb not null default '[]' | 工具白名单(偏只读 + 落库)。 |
| | `recipe` | jsonb | nullable;Agent 发现产出的确定性重放配方(选择器/接口路径/步骤)。 |
| | `enabled` | boolean not null default true | 启用开关。 |
| | `last_run_at` | text | nullable;上次到点触发时刻。 |
| | `next_run_at` | text | nullable;下次到点时刻(node-cron 算)。 |
| | `created_at` | text not null | ISO8601。 |
| `job_run` | `id` | text PK | **瘦"调度触发记录"**(owned-root):一次到点触发一行。 |
| | `user_id` | text not null | ownership boundary。 |
| | `job_id` | text not null | 关联 `scheduled_job`(经 requireJob ownership gate)。 |
| | `ai_task_id` | text | nullable;本次触发产的 `ai_task` id(步骤日志经它读 `ai_task_steps`,**不在此存步骤**)。 |
| | `status` | text not null default 'running' | `running` \| `succeeded` \| `failed` \| `needs_reconnect`(未登录,见 §6)。 |
| | `items_new` | integer not null default 0 | 本次新增条数(作品/快照/评论)。 |
| | `items_updated` | integer not null default 0 | 本次更新条数。 |
| | `error` | text | nullable;失败原因 / "需重连 Chrome"。 |
| | `started_at` | text not null | ISO8601。 |
| | `finished_at` | text | nullable until terminal。 |

> **为什么 `job_run` 不再扛步骤日志**:原稿 `job_run.steps(jsonb)` 与既有 `ai_task_steps` 重复建模。收敛后步骤一律落 `ai_task_steps`(经 `job_run.ai_task_id → ai_tasks → ai_task_steps`),`job_run` 只剩"调度触发 + 新鲜度统计"。任务中心运行详情抽屉直接读 `ai_task_steps`(复用既有窗口步骤日志渲染)。

## 5. 调度器(cron)+ 队列接线

- **调度器**:本机/dev 在 persistence-client 进程内 `node-cron` 轮询 enabled job;到点**不直接跑采集**,而是:
  1. 产一条 `ai_task`(`taskType=scheduled.<source_kind>`,`idempotencyKey=(jobId, 自然日)` —— 同 job 同自然日复用同一 task,天然按天幂等,参照 cheat-data-refresh)。
  2. 写一条 `job_run`(`status=running`, `ai_task_id`=刚产的 task id)。
  3. 触发既有 `drainQueue`(或等其轮询)。`claimNextQueued → runTask`:`runTask` 按 `taskType` 选 Skill / 工具集(`scheduled.self.metrics` 走"直接重放 fetchDouyinMetrics"的内建采集分支;`scheduled.comments` 走评论抓取分支);过程步骤经现有 `recordStep` 落 `ai_task_steps`。
  4. 采集完 → 经 ingestion 链路落库 → 回填 `job_run`(`status`, `items_new/updated`, `finished_at`)。
- **部署后**:换平台 cron 打内部端点(密钥保护)产 `ai_task`,队列侧不变。
- **「立即运行」** = 手动产同款 `ai_task` + `job_run`(fire-and-forget),UI 轮询 `ai_task_steps`(复用选题弹窗那套步骤轮询)。
- **幂等**:同 `(job, 自然日)` 经 `ai_tasks_user_idempotency`(`(user_id, idempotency_key)` 唯一)天然去重 —— 同一天重复触发返回既有 task,不重复采(复用既有 `createTask` 幂等语义,**不自造幂等**)。

> **关键:不另起一套 runner / 步骤日志。** 调度只负责"到点 → 产 task + 触发记录";真正的"唤醒 Agent / 重放 / 落步骤"全部落在既有 `drainQueue`/`runTask`/`ai_task_steps` 上。`job_run` 与 `ai_task` 一一对应(`job_run.ai_task_id`)。

## 6. 登录态过期(已有机制接线,非开放风险)

headless 复刷遇未登录 → 已实现的 `fetchDouyinMetrics` 抛 `DouyinNotLoggedInError`(`douyin-cdp.ts:241`)。接线:

1. `runTask` 的采集分支 catch 到 `DouyinNotLoggedInError` → 不当作普通失败,标 `job_run.status='needs_reconnect'`、`error='需重连 Chrome:登录态过期,请在任务中心点「登录抖音」扫码'`。
2. 该 job **暂停后续到点触发**(`enabled` 不变,但调度器见最近一次 `needs_reconnect` 跳过自动跑),等用户处理。
3. 任务中心该作业卡**红标"需重连 Chrome"**;点「登录抖音」→ 调既有 `loginDouyin`(headed 弹 Chromium 扫码,落 `.auth/`)→ 成功后恢复自动跑。

> 这把"登录态过期"从原稿的开放风险,降级为**复用既有 `DouyinNotLoggedInError` + `loginDouyin` 的确定性接线** —— 无新机制,只是把已有错误类接到调度状态机 + UI 红标。

## 7. 消费 + 独立快赢

- **~~Sfix basis 装配 bug~~**(已删):`runTopicGenerateV2`(`topic-task-adapter.ts:66-73`)**早已**按 basis 装配 `signalsBrief`(评论)/`knowledgeBrief`(知识),非本 SPEC 的活。对标既已砍,原 `trend`/`benchmark` 一路也移出本期(现 `trend` basis 装配空 brief,留作未来扩展,不在本期接 benchmark)。
- **S0(独立快赢):富录入弹窗** —— 「新增选题卡」2 字段 → 居中 Dialog 分组录入整张候选卡(沿用审阅弹窗范式)。与调度系统无依赖,可独立做。
- **评论依据真喂选题**:评论作业 → `audience_signals`(`source="douyin_comment"`)→ 选题 `basis=comments` 读真评论装配 `signalsBrief`(`topic-task-adapter.ts` 已接 `context.signalsBrief`,只待评论真采集落地)。**这是本期"评论源"的下游闭环**。
- 自己数据周期刷新后:Dashboard / 复盘读真表(T-001 / data-foundation §1.4 的 `hasImportedProjects` 让位机制已就绪,周期刷新只是让真表持续新鲜)。

> **行业热点 / 对标依据本期不做**:原稿"`basis=trend` 读 `benchmark_snapshot` 按 diggDelta TOP"整条随对标砍掉;`benchmarkBrief` 装配、historicalPerformers/trend 从 benchmark 真表取数,均移出本期。

## 8. 风险与约束

- **本机依赖(降级后)**:起步版要你电脑 + 自起的 Chromium(`launchPersistentContext`,**非**你日常 Chrome、**无** `--remote-debugging-port`)能跑;关机跑不了 —— 起步可接受,真无人值守等服务端 headless 版(`ServerHeadlessDriver` + `storageState`)。
- **登录态过期 = 已有机制**(§6):`DouyinNotLoggedInError` → `job_run.needs_reconnect` + 红标 + 停跑 + 点「登录抖音」恢复。**非开放风险。**
- **数值程序化抽取**(铁律①):杜绝 LLM 造数;现有 `fetchDouyinMetrics` 拦 XHR JSON + `parseWorkList` 纯函数即此。
- **工具只读 + 落库走守卫**:无发帖/删除;AI 不直接写领域实体(合宪法核心原则 3)。
- **secrets**:cookie 只活在 `.auth/`(持久化 profile),不落库、不入 Git;服务端 headless 版上线时 `storageState` 加密存。
- **限速**:抓取节流(现有 `fetchDouyinMetrics` 礼貌滚动 + `maxPages` 上限),按 `(job, 自然日)` 幂等。
- **门卫**:浏览器/抓取逻辑只准在 `frontend/src/server/ingestion`(已落点)/ ai-worker 采集分支,不扩散进通用 frontend(R2)。

## 9. 拆解(切片)

**独立快赢(不依赖调度系统,可立即做):**
- `S0` 富录入弹窗 —— 半天级,与调度无依赖。

**调度 Agent 作业系统(re-review verdict≠FAIL 后按序):**
- `D1` 数据模型(`scheduled_job` + `job_run`,迁移 0009)+ contract(jobResource / runResource)+ `scheduled_job`/`job_run` service(经端口,不跨模块直连 repo)。
- `D2` 评论抓取 `fetchDouyinComments`(同 `douyin-cdp.ts`、复用 `openContext` 持久化登录态;蓝本 cheat-on-content `fetch_comments_creator` 拦 `/aweme/v1/web/comment/list/`)+ 纯函数 `parseCommentList` 单测;落 `audience_signals`(经 ingestion 端口)。
- `D3` 调度器(node-cron 到点 → 产 `ai_task`(`taskType=scheduled.<source>`)+ 写 `job_run`)+ `runTask` 的两个采集分支(self.metrics 直接重放 `fetchDouyinMetrics` / comments 走 `fetchDouyinComments`)+ 落库回填 `job_run`。
- `D4` 登录态接线(§6):`DouyinNotLoggedInError` → `job_run.needs_reconnect` + 停跑 + 「登录抖音」恢复。
- `D5` 「立即运行」手动触发(产同款 `ai_task` + `job_run`,fire-and-forget)。
- `D6` 任务中心 UI `/automations`(作业列表 + 上次/下次 + 状态(正常/需重连 Chrome/失败)+「立即运行」+ 启用开关 + 运行详情读 `ai_task_steps`)= 数据链路可视化。
- `D7` recipe 发现-重放优化(页面结构变 → Agent 重新发现更新 recipe);消费接通:选题 `basis=comments` 读 `audience_signals` 真评论。

每片 = contract→backend→ai-worker→frontend 的小垂直切片,三步验证(`tsc --noEmit` + 受影响 `vitest`)+ 自截图 + 真链路冒烟。

## 10. 验收

- 任务中心每个数字都能追到真实 `job_run` / `ai_task_steps`(无写死);抓来的播放/赞数 == 页面实际值(程序化抽取,非 LLM 读)。
- 配一个"每天抓我主页"作业(`source_kind=self.metrics`)→ 到点自动产 `ai_task` 走 `drainQueue` / 点「立即运行」→ `metric_snapshots` 有真快照、`projects(source:imported)` 是真作品 → Dashboard 数据新鲜。
- 配一个"每天抓我评论"作业(`source_kind=comments`)→ `audience_signals`(`source="douyin_comment"`)出真评论 → 选题 `basis=comments` 依据变活。
- recipe 失效(页面结构变)时自动重新发现;Chrome 登录态过期时如实标 `needs_reconnect`(红标"需重连 Chrome"),不假装有数据;点「登录抖音」扫码后恢复。
- 同 `(job, 自然日)` 重复触发不重复采(`ai_tasks_user_idempotency` 命中返回既有 task)。
