# CreatorOS 数据源链路设计(对标博主 + 评论 → 选题)

> 状态:设计稿,待 review。落地前先过这份 spec。
> 决策已定(用户拍板):**两源并行** · **采集功能迁移进 CreatorOS(非调用外部)** · **全重写成 TS(进 @creatoros/ai-worker)** · **cron 周期采集**。

## 1. 目标与背景

让选题的数据源**真实、自有、可周期采集、可视化**。当前 CreatorOS 的 7 个选题源里:

- ✅ 真:评论问题 / 客户咨询(`audience_signals`)、知识库(`knowledgeService`)、项目复盘(`learningsService`)、手动灵感(`candidates.source='idea'`)
- ❌ 假:**历史爆款**(写死 0)、**行业热点**(写死 0,仅靠实时 WebSearch 不落库)
- ⚠️ 真 bug:新 `runTopicGenerateV2` 只读了 `positioningBrief`,**没按 basis 装配评论/知识 brief** —— 现在点"基于评论/知识"出的题其实和"基于定位"一样。

外部采集器 `dy_download`(Python,抖音账号监测/作品/逐字稿/增量快照,有 sqlite+FastAPI)和 `cheat-on-content`(Python,douyin/bilibili/xhs 评论适配器,Markdown/JSON)是**移植的源代码与参照**,不是运行时依赖。

## 2. 架构(6 层)

```
① 采集 Worker(新·TS·@creatoros/ai-worker)
   ├─ 抖音对标采集器  account 监测 → 作品列表 + 元数据 + 增量快照
   └─ 评论采集器      平台评论 → 原文 + 聚类
        ↓ 经 backend service port 写 CreatorOS Postgres(AI 不直接写,走 service 守卫)
② 源表(自有)  benchmark_account / benchmark_work / benchmark_snapshot(新) · audience_signals(有) · trend_item(新)
        ↓ 每次采集记一条 ingestion_run(provenance:source / started / finished / counts / status)
③ 调度(新)   cron 周期触发采集 runner,按天幂等(参照 cheat-data-refresh inventory→refresh→aggregate)
④ 数据源中心(新·页面)  各源:采集器状态 / 条数 / 最新样本 / 上次同步 / 「立即采集」
        ↓ 消费
⑤ topic.generate  修 basis 装配 bug;新增第 5 依据「对标博主」读 benchmark_work;评论 basis 读 audience_signals
⑥ 录入弹窗(问题一)  「新增选题卡」2 字段 → 富字段 Dialog
```

**模块归属(守门约束)**:采集 runner 在 `@creatoros/ai-worker`(像 topic-node 一样,纯逻辑 + 注入 port);落库走 backend 新模块 `datasource`(或扩 `ingestion`)的 service;前端只读。不跨模块直 import repository。

## 3. 数据模型(backend schema + 迁移)

复用已有:`audience_signals`(评论/咨询,字段 rawText/demandTag/payingIntent/source/linkedCandidateId/ingestionRunId)。

新增:

| 表 | 关键列 | 来源映射(dy_download) |
|---|---|---|
| `benchmark_account` | id, userId, platform, handle, secUid, displayName, followerCount, signature, monitorEnabled, lastSyncAt | monitor_accounts |
| `benchmark_work` | id, accountId, platform, externalId, title, publishedAt, transcript(nullable), videoUrl | downloads + transcripts |
| `benchmark_snapshot` | id, workId, diggCount, commentCount, shareCount, diggDelta, commentDelta, snapshotAt | monitor_snapshots(带 delta) |
| `trend_item` | id, userId, source, keyword, title, heat, capturedAt, raw | 热点采集落库(替掉写死 0) |
| `ingestion_run` | id, userId, source(benchmark_douyin / comment_douyin / trend / …), startedAt, finishedAt, status, itemsNew, itemsUpdated, error | 每次采集一条,provenance + 数据源中心新鲜度 |

provenance 不变量:任何采集进来的行都带 `ingestionRunId`,能追到"哪次采集、什么时候、从哪个源"。

## 4. 采集器设计(TS 重写)

### 4.1 抖音对标采集器(诚实说清难点)

抖音抓取分两档,难度天差地别 —— **spec 必须诚实标注**:

- **低风险档(先做)**:给定作品分享链/账号作品页,走 `iesdouyin.com` 公开分享页(无 cookie),拿到作品元数据 + 逐字稿(`douyin-transcribe` skill 已验证此通路可行,现在用 TS 重写其 HTTP+正则解析)。→ 填 `benchmark_work` + `transcript`。
- **高风险档(后做/需鉴权)**:账号级监测(完整作品列表、粉丝数、周期增量快照)需要抖音 web API 的 `a_bogus/X-Bogus` 签名或登录 cookie。TS 重写签名算法**脆弱、易随抖音更新失效**。策略:用户在设置页提供抖音 cookie(加密存库、**绝不入 Git**,遵守 secrets 规则),采集器带 cookie 调;cookie 失效则该源标"需重新授权"(数据源中心可见),不假装有数据。

> 风险结论:对标的"作品+逐字稿"可稳;"账号周期监测"取决于抖音反爬,先把可稳的做实,深度监测作为带鉴权的增强,采集失败一律 honest 标注、绝不造数。

### 4.2 评论采集器

移植 cheat-on-content 三个适配器的思路(douyin-session / bilibili / xhs),TS 重写抓评论原文 → 经 LLM 归一成 `audience_signals`(demandTag / payingIntent,走已有模型网关 `modelFor`)。MVP 先做 bilibili(公开 API 无登录,最稳)+ 抖音评论(带 cookie),小红书后补。

### 4.3 通用形态

每个采集器 = `runCollect(target, { model?, ports })`:纯 TS,产 normalized 行 + `IngestionRunResult`;副作用走注入的 backend service port(`upsertBenchmarkWorks` / `recordSnapshots` / `ingestAudienceSignal` / `recordIngestionRun`)。和 topic-node 同范式,可 MockModel 确定性单测。

## 5. 调度(cron)

- ai-worker 暴露 `runScheduledCollection(ctx, ports)`:遍历用户启用监测的账号/源,逐个 `runCollect`,按天幂等(同一 `(source, target, date)` 不重复采)。
- 触发:CreatorOS 加一个 cron 入口(Node 侧 `node-cron`,或部署后用平台 cron 打 `/api/v1/cron/collect` 内部端点 + 密钥保护)。本地 dev 可手动调。
- 数据源中心的「立即采集」按钮 = 复用同一 runner 的手动触发(fire-and-forget,像 topic.generate)。

## 6. 数据源中心(可视化页 `/data-sources`)

固定高度工作台(沿用 contentFill 范式)。每个源一张卡:

- 采集器状态:已连接 / 需授权(cookie 失效)/ 未配置
- 真实计数:benchmark 账号数 · 作品数 · 评论信号数 · 热点数
- 最新样本(最近 3 条,点进详情)
- 上次同步时间 + 本次 new/updated(读 `ingestion_run`)
- 「立即采集」按钮 + 采集进度(像选题弹窗的步骤日志)

"数据链路可视化" = 让用户一眼看到每个源的真实新鲜度与来路。

## 7. 消费(选题侧)

1. **修 basis bug**:`runTopicGenerateV2` 调 `assembleCreativeContext(basis)` 真按依据装配 brief(评论→signalsBrief / 知识→knowledgeBrief),不再只喂 positioningBrief。
2. **新增第 5 依据「对标博主」**:basis=`benchmark` → 读 `benchmark_work` TOP(by diggDelta)+ 逐字稿摘要装配 brief → 出"对标账号最近爆款"风格选题。选题中心加第 5 个按钮。
3. **历史爆款/热点计数变真**:overview 的 highPerformers 读 benchmark、trend 读 `trend_item`,替掉写死 0。

## 8. 录入弹窗(问题一,独立快赢)

`CreateCandidateForm` 2 字段(标题/切入)→ 居中 Dialog(沿用审阅弹窗范式),分组录入整张候选卡:
基本(标题*/切入)· 核心(一句话/目标观众/痛点/核心冲突/Hook)· 结构(内容结构/格式/素材依据)· 立项(风险/建议)。
契约:扩 `candidates.create` body 接受可选 card(或 create 后 patch,patch 已接受 card)。一步建全卡。

## 9. 风险与约束

- **抖音反爬/鉴权**(最大风险):见 4.1。可稳的先做实,深度监测带鉴权 + honest 降级。
- **secrets**:抖音/平台 cookie 加密存库,绝不入 Git(`.env.local`/DB secret_value),遵守既有规则。
- **AI 不直接写领域实体**:采集 runner 只产候选/normalized 行,落库走 backend service 守卫。
- **限速/封号**:采集带节流(参照 cheat-data-refresh 的 30s/视频),按天幂等避免重复打。
- **门卫**:采集 SDK/抓取逻辑只准在 ai-worker / 新 datasource 模块,不进 frontend 页面(R2)。

## 10. 拆解与排期(切片)

**独立快赢(不依赖采集子系统,可立即做):**
- **S0 富录入弹窗**(问题一)—— 半天级。
- **Sfix basis 装配 bug 修复** —— 让 4 个出题按钮真的不同。小、该立即修。

**采集子系统(spec review 通过后按序):**
- **S1 数据模型 + datasource 模块骨架** —— 新表 + 迁移 + service port + ingestion_run。
- **S2 抖音对标采集器(低风险档)** —— 分享页作品+逐字稿 → benchmark_work,确定性单测。
- **S3 评论采集器(bilibili 公开 API 先)** —— → audience_signals。
- **S4 cron 调度 + 「立即采集」** —— runScheduledCollection + 手动触发。
- **S5 数据源中心页** —— 可视化各源新鲜度。
- **S6 消费接通** —— 对标博主第 5 依据 + 历史爆款/热点计数变真。
- **S7(增强)抖音账号级监测(带 cookie)** —— 深度快照,honest 降级。

每片 = contract→backend→ai-worker→frontend 的小垂直切片,三步验证 + 自截图。

## 11. 验收

- 数据源中心显示的每个数字都能追到真实采集行(无写死)。
- 配一个对标账号 → 采集 → benchmark_work 有真作品 → 「对标博主」出题真带出对标特征。
- cron 跑一轮,ingestion_run 有记录,重复跑不重复入(按天幂等)。
- 抖音鉴权失效时,数据源中心如实显示"需授权",不假装有数据。
