# CreatorOS 通用「调度 Agent 作业」+ 自有数据采集 设计

> ## ⛔ SPEC 审核裁决(2026-06-30,spec-review gate):**FAIL —— 落地前必须重写后再过审**
>
> 跨上下文独立评审(对照宪法 + 真实代码,起 3 个核实子代理)。**两个 blocker 都是"SPEC 写于实现前、现状已被超越却没对账":**
> 1. **采集底座押错路线(reinvent-wheel)**:整份建在 `connectOverCDP`/`ws://localhost:9222` 上,但项目已在 commit `53efbb7` 重写为 `launchPersistentContext + 扫码登录`并显式弃用 CDP(对用户 Chrome 149 报 `Browser context management is not supported`、`/json/list` 0 target;见 `frontend/src/server/ingestion/douyin-cdp.ts:184-185` + memory `douyin-collection-approach`)。→ **改:`BrowserDriver` 起步实现直接落到已跑通的 `launchPersistentContext(.auth/)+扫码+headless复刷`,删 CDP/9222 作首选。**
> 2. **数据归属撞已 ✅ 的 T-001(fit-positioning)**:宪法级姊妹 SPEC `data-foundation §1.1` 已定"自己作品=`projects(source:imported)`,不另建作品库实体"且已落地(commit `9010166`)。本 SPEC 新建 `self_work`/`self_metric_snapshot` 平行表 = 逐字段核实纯重复建模(表达力更弱、丢幂等锚)。→ **改:删 `self_work`/`self_metric_snapshot`;"自己数据周期刷新"= 调度作业周期性调已有 `refreshDouyin→ensureImportedProject→ingestMetrics`,指标继续落 `metric_snapshots`/`metric_values`。只有 `benchmark_*`(对标账号)是真新增。**
>
> **3 个 major**:Sfix 修了已不存在的 bug(`topic-task-adapter.ts:68-80` 已按 basis 装配 signals/knowledge,只缺 benchmark/trend);新表迁移号缺(下一个空号 **0009**,0008 已被 T-001 占);已有 `ai_tasks`/`ai_task_steps`/`drainQueue` 队列未对账就另起 `job_run`(应 `scheduled_job→产 ai_task 走现有队列`,job_run 仅瘦触发记录)。3 个 minor 见 BACKLOG T-007 行 / git 审核记录。
>
> **好的一面(如实记)**:核心原语 `prompt+schedule→唤醒 Agent→recipe 重放` 成立、合飞轮定位;`runAgentNode`/`tool-registry`/全程 Vercel SDK 复用基础确实齐备。
>
> **⚠️ 需用户拍板的产品决策(escalate)**:`对标博主`采集(self/comment 之外的第三源)reviewer 标注为"可能让产品扩张成通用爬虫平台"的 fit-positioning 风险点。重写前请确认 `benchmark_*`/对标是否纳入本期范围。**未拍板前 T-007 不动。**
>
> 状态:设计稿,**审核 FAIL,待按上述重写后再过审**。落地前先过这份 spec。
> 决策已定(用户逐轮拍板):
> - **三类数据源都做,且统一在同一个「调度 Agent 作业 + CDP」原语下**:① 自己主页/作品/指标 ② 对标博主主页/作品/指标 ③ 评论。
> - **对标博主:用 CDP 驱动本机已登录 Chrome 看对标公开主页**(和看自己主页同一动作),程序化抽真值——**不碰抖音签名/反爬**;之前"对标难"是误以为要服务端破签名 API,CDP 路线解掉了。
> - **定时任务做成通用原语**:`提示词 + 调度器 → 周期唤醒 Agent → 用浏览器工具抓数据 → 落库`。换数据源 = 换 target,不写新采集器。
> - **采集能力全用 TS 重写,进 @creatoros/ai-worker**(复用 Phase 3 Agent Runtime;参照 dy_download/cheat-on-content 改写)。
> - **浏览器:CDP 驱动本机已登录 Chrome 起步**,工具接口抽象成 `BrowserDriver`,后续可 swap 服务端 Playwright。
> - **"行业热点"由对标驱动**:不是泛全网 WebSearch,而是"对标博主最近爆款"(`benchmark_snapshot` 按 `digg_delta` TOP)。

## 1. 核心洞察

把"定时任务"做成一个**通用原语**:一个作业 = 一段提示词 + 一个调度。调度器到点唤醒 Agent,Agent 用授权的浏览器工具去执行(抓自己主页数据等),产出结构化数据落库。

- **通用**:加新自动化 = 写提示词 + 配调度,不写新采集器代码。
- **复用现成**:"唤醒 Agent" = 带工具集跑一个 agent 节点(`runAgentNode` + `tool-registry`,已建)。
- **绕开鉴权**:CDP 驱动你**本机已登录**的 Chrome,用你现成的会话抓"自己的"数据 —— 不碰抖音签名/反爬,也不存任何平台 cookie(最符合 secrets 规则)。

## 2. 三条铁律(设计约束,违反即返工)

**① 数值程序化抽取,LLM 不"看"数字。** Agent 只编排"去哪页 / 点哪 / 要抓哪些字段";真数值由工具从 **DOM `evaluate` 或拦截的网络响应 JSON** 里取(确定性、可校验)。绝不让模型从截图/文本里"读"播放量——那会造数,违反"数据要真"。

**② 发现一次,确定性重放。** Agent 首跑摸清后产出一份 `recipe`(选择器 / 接口路径 / 步骤);之后定时运行**确定性重放 recipe,不调 LLM**;只有 recipe 失效(抓取为空/结构变)才再唤醒 Agent 重新发现并更新 recipe。既有适应力,又有 cron 的稳定与便宜。

**③ 作业是带约束的单元,不是裸提示词。** `ScheduledAgentJob = prompt + schedule + 工具授权(偏只读)+ 输出 schema + 落库目标 + provenance`。工具只读+落库(无发帖/删除/转账);落库走 backend service 守卫(AI 不直接写领域实体)。防止提示词漂移去做危险动作。

## 3. 架构

```
ScheduledAgentJob(用户配:名称 + 提示词 + 调度 + 目标源)
        ↓ 调度器到点(cron/interval) → fire-and-forget 起 agent 运行(像 topic.generate)
Agent 运行(@creatoros/ai-worker,runAgentNode + 授权工具)
   ├─ browser 工具(BrowserDriver·CDP 实现)：navigate / evaluate 取 DOM 真值 / 拦截网络 JSON
   └─ save 工具：结构化行 → 经 backend service port 落库(带 jobRunId)
        ↓
源表(自有)  self_work / self_metric_snapshot(自己作品+指标) · audience_signals(评论·已有) · …
        ↓ 每次运行记一条 job_run(provenance:job / started / finished / status / itemsNew/Updated / 步骤日志)
任务中心(新·页面)  作业列表 + 上次/下次运行 + 状态 + 「立即运行」+ 启用开关 + 运行详情(步骤日志)
        ↓ 消费
自己真数据周期刷新 → Dashboard/复盘读真表;评论作业 → audience_signals → 选题"评论"依据
```

**BrowserDriver 抽象**(关键,为了不锁死 CDP):
```ts
interface BrowserDriver {
  navigate(url: string): Promise<void>;
  evaluate<T>(fn: string): Promise<T>;        // 程序化取 DOM 真值
  onNetwork(filter): AsyncIterable<Response>;  // 拦截接口真 JSON
  close(): Promise<void>;
}
```
- 起步实现 `CdpBrowserDriver`:连本机 Chrome 的 CDP(`ws://localhost:9222`,Chrome 带 `--remote-debugging-port=9222` 启动)。
- 后续可加 `PlaywrightBrowserDriver`(服务端 headless + storageState)做真无人值守 —— 工具接口不变。

## 4. 数据模型(backend schema + 迁移)

| 表 | 关键列 | 说明 |
|---|---|---|
| `scheduled_job` | id, userId, name, prompt, schedule(cron expr), toolGrants(jsonb), outputKind, target(源标识), recipe(jsonb·nullable), enabled, lastRunAt, nextRunAt | 通用作业定义 |
| `job_run` | id, jobId, userId, startedAt, finishedAt, status(running/succeeded/failed), itemsNew, itemsUpdated, error, steps(jsonb·步骤日志) | 每次运行,provenance + 任务中心新鲜度 |
| `self_work` | id, userId, platform, externalId, title, publishedAt, url | 自己的作品 |
| `self_metric_snapshot` | id, workId, playCount, diggCount, commentCount, shareCount, snapshotAt, jobRunId | 周期指标快照(替/补一次性 douyin-real fixture) |
| `benchmark_account` | id, userId, platform, handle, secUid, displayName, followerCount, homepageUrl, monitorEnabled, lastSyncAt | 对标账号(用户配主页 URL) |
| `benchmark_work` | id, accountId, platform, externalId, title, publishedAt, url, transcript(nullable) | 对标作品 |
| `benchmark_snapshot` | id, workId, playCount, diggCount, commentCount, shareCount, diggDelta, commentDelta, snapshotAt, jobRunId | 对标增量快照;按 diggDelta TOP = "热点/最近爆款" |
| 复用 `audience_signals` | rawText, demandTag, payingIntent, source, ingestionRunId→jobRunId | 评论作业落这里 |

> `self_*` 与 `benchmark_*` 结构几乎同构(都是 作品+周期指标快照),只是归属不同(自己 vs 对标账号)、抓取 recipe 不同(自己主页 vs 对标主页)。同一 `runScheduledJob` 机制,不同 target。

> 注:P1 已有 `douyinProjects/douyinMetricSnapshots` 等(douyin-real fixture 一次性导入);本设计让"自己数据"从一次性 fixture 升级成**周期自动刷新的真表**。落地时先确认能否直接复用这些表,避免重复建模。

## 5. 调度器(cron)

- ai-worker 暴露 `runScheduledJob(ctx, jobId, ports)`:载 job → 有有效 recipe 则确定性重放,否则唤醒 Agent 发现 → 产结构化行 → save → 记 job_run。
- 触发:本机/dev 在 persistence-client 进程内 `node-cron` 轮询到点的 enabled job;部署后换平台 cron 打内部端点(密钥保护)。
- 「立即运行」= 手动触发同一 runner(fire-and-forget,UI 轮询步骤日志,复用选题弹窗那套)。
- 幂等:同 `(job, 自然日)` 不重复采(参照 cheat-data-refresh 按天幂等)。

## 6. 任务中心 UI(新页 `/automations` 或并入"数据源")

固定高度工作台(沿用 contentFill)。作业卡:名称 / 提示词摘要 / 调度(每天 09:00…)/ 上次运行+本次 new/updated / 下次运行 / 状态(正常/需重连 Chrome/失败)/「立即运行」/ 启用开关。运行详情抽屉:job_run 历史 + 步骤日志。
**这同时就是"数据链路可视化"**:每个作业 = 一条数据源,新鲜度/来路/产出一眼可见。

## 7. 消费 + 独立快赢

- **Sfix(独立·该立即修):basis 装配 bug** —— `runTopicGenerateV2` 现在只读 positioningBrief,要按 basis 真装配 signalsBrief/knowledgeBrief/benchmarkBrief,让出题按钮真的不同。
- **S0(独立快赢):富录入弹窗** —— 「新增选题卡」2 字段 → 居中 Dialog 分组录入整张候选卡(沿用审阅弹窗范式)。
- **热点/对标依据真喂选题**:`basis=trend`(行业热点)读 `benchmark_snapshot` 按 `diggDelta` TOP(对标最近爆款)+ 对标作品逐字稿摘要装配 `benchmarkBrief`,替掉旧的 WebSearch-only;可另留一个"对标博主"显式依据(学某账号风格)。historicalPerformers/trend 计数从 benchmark 真表来,替掉写死 0。
- 自己数据周期刷新后:Dashboard / 复盘读真表;评论作业 → audience_signals → 选题"评论"依据变活。

## 8. 风险与约束

- **CDP 本机依赖**:CDP 版要你电脑 + Chrome(带 `--remote-debugging-port`)开着,关机跑不了——起步可接受,真无人值守等 Playwright 版。
- **数值程序化抽取**(铁律①):杜绝 LLM 造数。
- **工具只读 + 落库走守卫**:无发帖/删除;AI 不直接写领域实体。
- **secrets**:CDP 版不存任何平台 cookie(用你的活会话);若后续上 Playwright 版,storageState 加密存、绝不入 Git。
- **限速**:抓取节流,按天幂等。
- **门卫**:浏览器/抓取逻辑只准在 ai-worker / 新 datasource 模块,不进 frontend(R2)。

## 9. 拆解(切片)

**独立快赢(不依赖调度系统,可立即做):**
- `Sfix` basis 装配 bug 修复 —— 小,该立即。
- `S0` 富录入弹窗 —— 半天级。

**调度 Agent 作业系统(spec review 后按序):**
- `D1` 数据模型(scheduled_job + job_run + self_work/self_metric_snapshot)+ datasource 模块骨架 + 契约。
- `D2` BrowserDriver 接口 + `CdpBrowserDriver`(连本机 Chrome CDP)+ browser/save 工具(程序化抽值),MockDriver 确定性单测。
- `D3` `runScheduledJob` runner(发现/重放)+ job_run 落库 + 步骤日志。
- `D4` 调度器(node-cron 到点起 job)+「立即运行」手动触发。
- `D5` 第一个真作业:抓自己抖音主页作品+指标 → self_metric_snapshot。
- `D5b` 对标作业:配对标账号主页 URL → 抓对标作品+增量快照 → benchmark_*(复用 D2-D4 同机制,新增对标主页 recipe)。
- `D6` 任务中心 UI(列表 + 运行详情 + 步骤日志)= 数据链路可视化。
- `D7` recipe 发现-重放优化 + 评论作业(抓评论 → audience_signals);消费接通:trend/对标依据读 benchmark + 评论依据读 signals。

每片 = contract→backend→ai-worker→frontend 的小垂直切片,三步验证 + 自截图 + 真链路冒烟。

## 10. 验收

- 任务中心每个数字都能追到真实 job_run(无写死);抓来的播放/赞数 == 页面实际值(程序化抽取,非 LLM 读)。
- 配一个"每天抓我主页"作业 → 到点自动跑 / 点「立即运行」→ self_metric_snapshot 有真快照 → Dashboard 数据是新鲜的。
- recipe 失效(页面结构变)时自动重新发现;Chrome 没开时如实标"需连接 Chrome",不假装有数据。
