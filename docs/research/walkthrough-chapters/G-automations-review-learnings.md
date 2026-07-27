# 章节 G:自动化/采集 + 复盘/指标/经验(数据回流尾段)

> 日期:2026-07-26
> 任务:T-528 新用户 0→1 标杆路线 · 功能域盘点分章
> 方法:只读代码盘点(subagent,含两个后端取证子代理独立交叉核对),每条断言附 `file:line`;无证据处标 ⚠️未验证
> 对照:产品宪法 [docs/产品定位.md](../../产品定位.md) §7 记「采集与自动化 = 已实现主路径、可靠性不足」「指标/复盘/经验 = 部分实现」;R-INGEST / R-REVIEW(§9)

核心结论:**这两段是飞轮里「真实现程度最高」的尾段**——采集是端到端真 Playwright 闭环,复盘→经验→回流是双人工闸的严格闭环。

**⚠️ 重大 doc/code 差异(必须在标杆文档说准)**:宪法 §4 飞轮图画了 `LEARN → POS`(经验回流定位),但 `positioning-runner.ts` 全文无 `learningsBrief`(grep 零命中)——**定位不消费 validated learnings**。真实口径是 **LEARN→TOPIC/SCRIPT 真闭合,LEARN→POS 走另一条轨(校准建议,而非定位声明)**。

---

## G-1 账号扫码登录(采集的地基 · 路由 `/accounts`)

- **如何到达**:onboarding 引导流第 1 步「绑定你的抖音号」深链 `/accounts`(`frontend/src/features/onboarding/onboarding-steps.ts:111-122`,全员第一步、一切前提);账号页也可从设置进。
- **主文件**:`frontend/src/app/(creator)/accounts/page.tsx`(Server Component,读 `accounts.list` session-scoped);交互层 `frontend/src/features/platform-account/account-manager-interactive-region.tsx`。
- **空态**:一个「扫码绑定新抖音号」主按钮(删掉了全部多平台矩阵/API key 老设计,见文件头注释 `:6-18`)。
- **主路径**:
  1. 点「扫码绑定新抖音号」→ `client.loginDouyin({ forceNew: true })`(`account-manager-interactive-region.tsx:107-115`)。`forceNew` 走 staging 隔离空 profile,保证全新扫码必出二维码、不误命中旧登录态(`:107-110`)。
  2. **后端真弹本机 Chromium(headed)**:`frontend/src/server/ingestion/douyin-cdp.ts:1045` `loginDouyin` → `openContext(authDir, false)` → 导航创作者中心 → 轮询 `sessionid` cookie(`isLoggedIn`,`:1017-1022`),检测到即成功,落 `.auth/` 持久 profile(默认等 240s)。
  3. 成功后按 `secUid` upsert + 占位号合并(`:12-15`);组合根 `onDouyinBound` → `bootstrapDouyinCollectionJobs` **幂等建 6 个每天定时采集 job**(`backend/src/modules/ai-runtime/collection-bootstrap.ts:46-100,285`)。
- **关键前置依赖**:本机 Chromium(首启自动 `playwright install chromium`,`douyin-cdp.ts:889-911`);account status=active。
- **⚠️ 诚实标注**:headed 扫码端到端「卡真机」——前端只发起 + 据结果推进,**绝不假装登录过**(`account-manager-interactive-region.tsx:18-21`);源码明标「真扫码端到端(DATA-2)真机待验」。
- **归档小结**:扫码登录是真 Playwright 持久上下文实现(非 stub),绑号即自动 bootstrap 该号的 6 个日常采集作业。

---

## G-2 自动化(路由 `/automations` · 侧栏「自动化」)

- **如何到达**:侧栏「自动化」(`sidebar.tsx:108`);或 onboarding existing 分支第 4 步「后台初始化你的数据」深链 `/automations`(`onboarding-steps.ts:146-154`)。
- **主文件**:route `frontend/src/app/(creator)/automations/page.tsx`(Server Component 读 `scheduledJobs.list`)→ 装配层 `frontend/src/features/automations/automations-page.tsx` → 交互岛 `frontend/src/features/automations/automations-island.tsx`(2038 行,承载全部读/管交互);模板/意图 `intent.ts`,频率编译 `cadence.ts`。
- **首次进入(空态)小白看到什么**:
  - 顶部「从模板入手」6 张模板卡(`automations-island.tsx:1510` `TemplateCards` + `intent.ts:143` `COLLECTION_TEMPLATES`)。
  - 列表区诚实空态「还没有采集任务」+ 引导(`:1945-1973`)。空态文案按是否选号分叉:未选号 →「任务按抖音号隔离,先绑/选号」;已选号 →「绑号时系统会自动建好该号日常采集任务」(`:1953-1962`)。
  - 当前号 badge「仅当前号 @handle」明示按号隔离(`:1915-1931`)。
- **主路径**:
  1. **创建采集计划**:点模板卡预填 `{name, prompt, sourceKind, cadence}` 打开弹窗(`:1812-1820`),或「新建任务」空白建(`:1836`)。弹窗用大白话 prompt + 友好频率编辑器(周期/按间隔/单次,**绝不暴露 cron**,`CadenceEditor:632`),提交 `compileCadenceToCron` 编成 cron → `client.createScheduledJob`(`:1760-1774`)。sourceKind 6 值:self.metrics / comments / self.detail / benchmark / topic.daily / favorites(`intent.ts:34`)。意图分类是**确定性关键词分类器,刻意不上 LLM**(避 T-007 死链 + 弱模型 flaky,`intent.ts:5-9,78`)。
  2. **启用/停用**:行内 Switch → `client.setScheduledJobEnabled` → `router.refresh`(`:1735-1750`)。禁用态旁写「启用前置」提示(`ENABLEMENT_HINTS`,`:66-71`,如 comments 需先有导入作品)。
  3. **立即运行**(不等 cron):`client.runScheduledJobNow`(fire-and-forget)→ 自动开运行详情抽屉轮询(`:1848-1865`)。
  4. **看真实进度与终态**:挂载批量拉每 job 最近一次 run(`jobRuns.listByJob` limit 1,`:1648-1666`);running 态行内 2s 轮询实时进度条(阶段 + 累计条数,`RunProgressBar:247`,读 `job_run.progress` jsonb);运行详情抽屉列历史 run + 选中 run 读 `ai_task_steps`(`RunDetailDialog:1247`,`:1315` `listTaskSteps`)。
  5. **终态处理(诚实分级)**:
     - `needs_reconnect` 行红标「需重连抖音 → 去扫码登录」+ 换「登录抖音」按钮 → `client.loginDouyin` 成功后 `runScheduledJobNow` 触发恢复(`:1870-1898`)
     - 限流退避实时横幅「限流保护中,下次约 N 分钟后重试」(读 `ingestion.douyin.throttleStatus` 网关内存镜像,`:1706-1733`)
     - succeeded-0 显「已完成·无新数据」**不误当失败**(`runResultText:278`)
  6. **编辑**(T-248):行内「编辑」复用弹窗 edit 模式,cron 反解成友好频率;反解失败诚实降级锁(禁保存,`:958,1185-1194`);sourceKind 只读(契约不可改源)。
- **关键前置依赖**:已选当前号(未选 → backend 抛 `AccountRequiredError`,page 捕获转空列表 + 引导,`automations-page.tsx:59-69`);采集器需登录态有效(否则 needs_reconnect);topic.daily 需配文本模型、benchmark/favorites 需在「内容雷达」登记源。
- **产出 & 飞轮回流**:采集数据落库供 Dashboard 与选题消费(`:118`);评论落库供复盘「热门评论」区消费;明细(self.detail 16 字段)喂复盘核心指标与漏斗。
- **后端真实性核证(两处独立取证一致)**:真采集核心 `frontend/src/server/ingestion/douyin-cdp.ts`(3718 行)—— `chromium.launchPersistentContext` + `connectOverCDP` 拦截 `creator.douyin.com` XHR JSON 程序化抽值,**不调 LLM**;runner `backend/src/modules/ai-runtime/scheduled-collection-runner.ts:178` 编排 markRunning→采集落库→写 ai_task_steps→回填 job_run;终态 needs_reconnect(`:264-274`)、限流网关退避、启动扫僵尸 run(`scheduled-collection-scheduler.ts:414` `sweepStaleRuns`)、增量 early-stop(`knownAwemeIds`)全有真代码;幂等双闸(job×自然日只产一条 task+run)。node-cron 每分钟轮询真启(`persistence-client.ts:7802`)。表:`scheduled_job`/`job_run`(`drizzle/0009`)+ progress(`0026`)+ account_id(`0030`)+ 同源唯一(`0046`)。
- **⚠️ 未实现 / 占位 + PRD 差异**:
  - PRD §7「采集与自动化=已实现主路径、可靠性不足」与代码相符:主路径端到端真通,但可靠性依赖 headed Chromium 真机 + 抖音风控,**真扫码/真采集恢复「真机待验」**(源码多处自标)。
  - **一个「命名 vs 实现分离」的取证陷阱(非缺陷)**:`scheduledJobs.runNow` 在 scheduling 模块 transport 里落 default 分支会抛 `UnsupportedOperationError`,真实现被组合根 `persistence-client.ts:7683` `schedulingWithRunNow` 包装拦截。**只看模块代码会误判为占位**。
- **归档小结**:自动化采集主路径端到端可跑真闭环(扫码→bootstrap→cron/立即运行→Playwright 采集→落库+进度+终态),是本域实现最扎实的一段;可靠性瓶颈在真机 + 风控,非代码缺失。

---

## G-3 数据复盘工作面(路由 `/projects/[projectId]/review` · 项目阶段条「复盘」段)

- **如何到达**:项目工作台阶段条点「复盘」段 → `projectWorkspaceHref(id, "review")` 返回 `/projects/${id}/review`(`frontend/src/features/projects/project-href.ts:18-19`);已发布项目 currentStage 即 review。**无独立侧栏项**(裁决已并入本页,`sidebar.tsx:111`)。
- **主文件**:route `frontend/src/app/(creator)/projects/[projectId]/review/page.tsx`(跨号整页门 + 装配 viewModel);装配 `frontend/src/features/review/review-workspace-data.ts`(736 行,真/mock 分割契约);页面 `analytics-review-page.tsx`;交互岛 `analytics-review-interactive-region.tsx`(1002 行)。
- **首次进入(空态)小白看到什么**:指标/图表区空态「该作品暂无明细数据 → 去自动化同步一次明细」(`analytics-review-interactive-region.tsx:171-177`),**空态收窄到指标区**,复盘编辑/记录/评论/经验区照常渲染(T-329 拆掉了「指标空吞整页」的门,`:99-101`);「本期经验」空态 +「帮我复盘」CTA;评论空态「去自动化配抓评论」。
- **主路径**:
  1. **把锁定预测 vs 真实指标 vs 评论放一起**(单一滚动视图,T-116a 去掉了假维度 tab):顶部 12 张紧凑指标卡 `CoreMetricsRow` + 播放趋势折线/转化漏斗并排 `PrimaryCharts`(`:180-188,256`);「预测 vs 实际」对照区 `PredictionComparisonSection`(`analytics-review-page.tsx:119-121`);「热门评论」区读真评论 `publications.comments.list`,空态诚实(`analytics-review-interactive-region.tsx:360`)。
     - 数据装配全在 `review-workspace-data.ts`,**真/mock 诚实分割**:REAL=aiAnalysis(本项目 review.analyze 结果)/comments/reviewHistory/candidateLearnings/prediction 对照;EMPTY=指标/图表/留存/观众(无 owned read op,`:20-43` 明写不 fake)。
  2. **记录洞察(手动复盘)**:右栏「复盘编辑」面板常显,选类型(成功亮点/待优化/行动项/假设)+ 标题 →「添加洞察」隐式先 `reviews.create` 再 `reviews.insights.create`(`ReviewAuthoringPanel:797-856`),「完成复盘」`reviews.complete`(`:871-892`)。无登录会话 → 按钮禁用 + 明示原因(**绝不静默 no-op**,`:792-795`)。复盘记录读 `reviews.list`(`review-workspace-data.ts:287`)。
  3. **AI 生成经验候选**:「帮我复盘」按钮深链 Copilot `review.analyze`(`review-analyze-island.tsx:26`)→ 后端 `runReviewAnalyze` 真跑用户配置模型的结构化节点(`backend/src/modules/ai-runtime/review-runner.ts:109,132-136`)→ `recordCandidate(resultType:"learning_list")`,task 置 `awaiting_confirmation`(**仅候选**,守宪法②)。
  4. **人工确认/验证经验**:「本期经验·可采纳沉淀」区读本作品 candidate learnings(`learnings.list` projectId+validationStatus=candidate,`review-workspace-data.ts:128-155`),复用 `AdjudicationQueue` 采纳/驳回 → `learnings.evaluate`。状态机 `candidate→validated→discarded`,非法转移抛 `ConflictError`(`backend/src/modules/learnings/learnings.service.ts:280-284,458-476`)。真实发布数据背书(evidenceStrength='grounded')的经验 create 时直接 validated 自动进生成(`:363`),否则恒 candidate 走人工闸。
- **关键前置依赖**:项目属当前号(跨号 → 整页诚实引导 `CrossAccountEmptyState`,`review/page.tsx:82-96`);指标区需先跑过 self.detail 采集;经验候选需先「帮我复盘」;service 入口 `requireAccountId`(未选号禁读写)。
- **产出 & 飞轮闭环如何回流(最关键,真接线)**:
  - validated 经验 → `learningsBrief` → 下游 runner prompt。读源**只读 validated**(`creative-context.ts:443-454`,注释「candidate 不进 prompt SPEC §3」;底层 `learnings.service.ts:497` 过滤 validationStatus='validated')。
  - **实际消费者**:选题 TOPIC(`topic-enrich-runner.ts:150`、`topic-daily-collector.ts:217`)、稿件 SCRIPT(`script-runner.ts:134`)、策划/校准/对话(planning/calibration-diagnose/chat/copilot runner)。
  - 经验按账号隔离(`repoFor`+`requireAccountId`,`learnings.service.ts:293-301`;repo userId 门最外层 + accountId AND 收窄)。
  - 表:learnings/learning_applications/reviews/review_insights(`drizzle/0000_init`)+ account_id(`0025`)+ project_id(`0021`)+ evidence_strength(`0045`);learnings.validation_status DEFAULT 'candidate'(独立核证 `0000_init.sql:660`)。
- **⚠️ 未实现 / 占位 + PRD 差异**:
  - **【重大差异】飞轮回流到「定位 POS」未接线**:`positioning-runner.ts` 全文无 `learningsBrief`(grep 零命中)——定位生成吃账号画像/定位 facets,**不消费 validated learnings**。宪法 §4 飞轮图的 `LEARN→POS` 这一段**不成立**;定位方向的回流改走轨 B(`learnings.suggestCalibrationRule` → 评分维度建议 → 校准中心 rubric,复盘页 `CalibrationSuggestionsCard` 采纳/驳回,`analytics-review-page.tsx:123`),而非回流进定位声明。
    - **准确口径**:LEARN→TOPIC/SCRIPT 真闭合;LEARN→POS 走另一条轨(校准而非定位)。
  - 指标/图表 REAL 覆盖有限:核心指标/趋势/漏斗基于 `analytics.projects.get` 快照真渲,但观众画像/观众来源/留存曲线/关键时刻区已整体移除(无数据源 op,需单视频采集 T-100,`analytics-review-interactive-region.tsx:191-192`)。对应 PRD §7「指标/复盘/经验=部分实现」。
- **归档小结**:复盘工作面把锁定预测/真实指标/评论/AI 经验候选放在单一滚动视图,手动复盘 + AI 蒸馏经验双通道齐备,回流是双人工闸严格闭环(AI 只产候选、人工验证、仅 validated 且属当前号的经验进下游),真闭合到 TOPIC/SCRIPT;定位回流是缺口。

---

## G-4 预测 vs 实际对照 + 录入实绩(复盘页内区块)

- **主文件**:`frontend/src/features/review/prediction-comparison-section.tsx`(展示)+ `result-entry-gate.tsx`(录入实绩确认门)+ 装配 `review-workspace-data.ts:583` `buildPredictionComparison`。
- **主路径**:
  1. 无盲预测 → 诚实空态「本项目未做盲预测,去稿面发布包区先盲预测」(`prediction-comparison-section.tsx:68-75`)。
  2. 已锁定未回流 → 显预测分 +「已锁定」badge +「等待发布数据回流」;带维度评分则展开「录入实绩」门(`ResultEntryGate`,`:126-135`)。
  3. 录入实绩:尝试从 `calibration.score` AI 候选预填各维度分(`result-entry-gate.tsx:44-80`,找不到则手动录入,诚实降级),人确认 → `calibration.results.create`(`:154-158`)→ `router.refresh` 翻「已回流」逐维度表。
- **预测锁定不可改是真 DB guard(独立核证 + 子代理一致 ✓)**:draft→locked 终态、无 edit/unlock op(`backend/src/modules/calibration/calibration.service.ts:37-42,666-677`);lock SQL `.where(eq(status,'draft'))` 重锁匹配 0 行(`calibration.repository.ts:354-364`);`recordResult` 要求 status='locked' 否则 ConflictError(`calibration.service.ts:694-698`)。**非 UI 假象**。
- **⚠️ 差异**:AI 只产 `calibration_score` 候选、真正落 `calibration_result` 必须人工确认(铁律②),与代码相符。
- **归档小结**:校准飞轮「盲预测(锁定不可改)→ 发布后录入真实绩 → 逐维度偏差对照」并入复盘页,预测锁定是 DB 层强制写保护,实绩录入是人工确认门。

---

## 标杆教程终点可用的诚实口径

- **采集自动化**:可作为「数据回流起点」完整演示——扫码绑号即自动建 6 个日常采集任务,用户可看模板卡/新建/启用/立即运行/实时进度/needs_reconnect 恢复/限流横幅。**演示需真机 + 已登录抖音**(headed 扫码卡真机,dev 可跑,真恢复真机待验)。
- **复盘经验**:可作为「飞轮闭环终点」演示——复盘页把预测/指标/评论/AI 经验候选放一起,「帮我复盘」产候选 → 人工采纳成 validated → 下一轮选题/写稿的 prompt 里出现「过往复盘爆款要素」。
  - **闭环话术必须准**:LEARN→TOPIC/SCRIPT 是真接线;**LEARN→POS(定位)未接,别宣称定位会自动吸收复盘经验**(定位回流走校准建议轨 B)。
