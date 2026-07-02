# 页面审计:选题(/topics)

> 审计日期:2026-07-02 · 审计方式:宪法对照 + 代码链路追踪 + localhost:3000 只读 curl 验证(未做任何写操作)
> 入口:`frontend/src/app/(creator)/topics/page.tsx` → `features/topics/topics-page.tsx`(server)+ `topics-interactive-region.tsx` / `topic-generate-island.tsx`(client islands)

---

## 1. 功能定位

**页面任务**:七步流水线的上游供给层——把真实信号(受众评论 / 知识库 / 复盘经验 / 手动灵感)汇成选题候选,AI 出题 + 补全「选题卡」(受众/痛点/Hook/结构等 10 字段 + 3 评分),人审阅择优「立项为 Project」,带着结构化 Brief 草稿进入七步①立项。

**与宪法关系**:整体高度合定位——AI 只产候选、confirm 门物化(§5.3/§9.2)、真实信号出题(§7)、Vercel AI SDK + 模板 + schema 约束(§9.1/9.3/9.4)全部落实;promote → Project 自动带 briefDraft 符合「产物自动流入下一阶段」(§5.2)。两处张力见 §6/§7:
- 「基于热点出题」名不符实(无热点数据源,模型编热点)——违「数据要真」精神;
- enrich 流程前端自动 confirm,确认门被自动化,与同页选题会的「审阅后采纳」是两种确认语义。

**验证**:页面可达 `curl -o /dev/null -w "%{http_code}" http://localhost:3000/topics` → 200;SSR HTML 含全部区块(AI 选题会/三栏/漏斗)。

---

## 2. 区块与交互清单

### 2.1 AI 选题会带(TopicGenerateBand,紫色 accent)

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| 基于定位出题 | 起 AI 任务→弹窗轮询(4s×75≈5min)→审阅 | `ai.tasks.create{topic.generate, basis:positioning}` → `runTopicGenerateV2`(persistence-client.ts:2054,live dispatch,用户可配 model;没 key → cancelTask 不假成功) | works(链路+测试证实;本次未触发写,未真机跑) |
| 基于评论问题 | 同上 basis:comments | signalsBrief 注入最近 30 条真实评论(persistence-client.ts:1868-1879) | works(同上) |
| 基于知识库出题 | 同上 basis:knowledge | knowledgeBrief 注入 40 条知识条目(persistence-client.ts:1884-1888) | works(同上) |
| 基于热点出题 | 同上 basis:trend | **无热点数据源**:trend 的 basisBrief=""(topic-task-adapter.ts:68-73),模板 `tools:[]` 无 WebSearch(ai-worker/src/prompt/templates/topic-generate.ts),仅一句提示词「蹭当下热点」 | works-but-misleading(能出题,但"热点"是模型编的,见 §6-4) |
| 在对话里出题 | 打开全局 ChatBox 并预调 topic.generate | `copilotDeepLink("topics","topic.generate")` → query-only href `?copilot=open&surface=topics&fn=topic.generate` | unverified(真机未点;构链逻辑有 bug#3 修复注释,应留在当前页开浮层) |
| 上次生成 N 条待审阅·查看 | 重读已存候选,绝不重新生成 | `ai.tasks.pending_topic_review`(SSR)→ 点击 `ai.tasks.results.list` | works(curl 证实当前真有 pending:taskId=ai-task-51fc2a8b-61, basis=comments, count=8) |
| 当前依据面板 | 只读展示 4 行 | `topics.overview.basis`(定位/评论信号/知识卡/高表现) | works;但「高表现」恒 0(硬编码,见 §4) |
| 审阅弹窗·候选行内联编辑 | 改 title/angle、逐条 × 删(CollabField) | 本地 state;采纳时合并 | works(测试覆盖) |
| 审阅弹窗·采纳(N)入候选池 | (有删/改先 patch)→ confirm 物化 | `ai.tasks.results.patch` → `ai.tasks.confirm` → `createFromAIResult` 逐条建 Candidate(persistence-client.ts:1586) | works(链路+测试证实) |
| 审阅弹窗·丢弃 | 取消任务,待审阅入口消失 | `ai.tasks.cancel` | works |
| 审阅弹窗·步骤日志 | 运行中展示步骤 | `ai.tasks.steps.list` 每 4s 拉 | works(结构化路径只产 1 步「已生成 N 条选题」,诚实) |

### 2.2 三栏工作区(TopicsWorkspace)

**左栏 选题来源(7 行)**

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| 评论问题/客户咨询/知识库资料/历史爆款/行业热点/项目复盘/手动灵感 各行 | **纯展示**;有 hover 高亮 + ChevronRight 箭头 | `topics.overview.sources`;**无 onClick**(topics-interactive-region.tsx:789-808) | **dead affordance**:样式暗示可点/可下钻,点了没反应;不能过滤中栏、不能查看来源明细 |

**中栏 选题候选池(PoolColumn)**

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| 手动详填 | 弹窗富表单(标题必填 + 12 可选字段 + 3 评分) | `candidates.create{source:'idea'}` → 富字段非空再 `candidates.patch{card}` | works(测试覆盖;评分越界不收,不塞脏值——诚实) |
| 编导起草(一句话输入) | 建裸卡 → AI 补全 → **自动 confirm** → 整卡进池;失败裸卡也进池 | `candidates.create` → `ai.tasks.create{topic.enrich}` → poll → `ai.tasks.confirm`(topics-interactive-region.tsx:1001-1043) | works;确认门被自动化,见 §6-5 |
| 搜索选题 | 客户端过滤 title/oneLiner | 本地 state | works |
| 排序下拉(推荐/定位契合/需求热度) | `/topics?sort=<key>` → 服务端重排 | `candidates.list{sort}` → 真 SQL `orderBy desc`(candidate.repository.ts:178) | works-with-bugs:null 分排最前(§6-1);demandCount 全 0 排序空转(§6-3) |
| 候选卡点击 | 选中 → 驱动右栏详情 | 本地 SelectionCtx | works |
| 查看选题卡 | 同上(select) | 本地 | works |
| 补全选题卡 / 补充信息 | AI 补卡,poll→**自动 confirm**→refresh | `ai.tasks.create{topic.enrich, candidateId}` → `runTopicEnrich`(persistence-client.ts:2080)→ confirm → `enrichCard` | works(链路+测试证实;自动 confirm 见 §6-5) |
| 立项为 Project | 建项目(brief 阶段+briefDraft 映射)→跳 `/projects/:id`;已立项 disabled | `candidates.promote` → `projects.createProject`(candidate.service.ts:320-371) | works(链路+测试证实,含 already-promoted disabled 测试) |
| 丢弃 | 候选离池;已丢弃 disabled | `candidates.patch{status:'dropped'}` | works;但丢弃后**无处可看/恢复**(§6-7) |
| 空态 | 文案引导「编导起草/AI 选题会」 | — | works(文案指路,但「用上面一句话」非链接) |

**右栏 选题卡详情(CandidateDetailPanel)**

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| 无选中空态 | 提示从中栏选一条 | — | works(默认自动选第一张有卡候选,fallback 逻辑 topics-interactive-region.tsx:1174-1178) |
| 空卡 CTA | 标题+提示+补全按钮 | EnrichButton 复用 | works |
| 满卡渲染 | 一句话/观众/痛点/冲突/Hook/结构/形式/素材/风险/立项建议,空字段不显示不编 | props 渲染 | works(诚实空态) |
| 底部 补充信息 / 立项为 Project | 同中栏 | 同上 | works;**详情栏无丢弃按钮**(与中栏动作集不对称,轻微) |

### 2.3 选题流转漏斗(FunnelStrip,底部钉住)

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| 6 态卡(待收集/待评估/待补充/已立项/已丢弃/已发布回流) | **纯展示**,不可点 | `topics.overview.funnel`,全部真 SQL 派生(candidate.service.ts:489-496) | works(数字真);「待收集 219」无行动出口(§6-4') |
| 「全部流转」 | 纯文本 span(topics-page.tsx:197) | 无 | 看似链接实不可点(弱 affordance,轻微) |

---

## 3. 数据来源(四桶)

| 数据 | 来源链 | 桶 |
|---|---|---|
| 候选列表(4 条) | `candidates.list` → candidateService → `candidates` 表(user-scoped,Postgres) | **real**(但其中 3 条是 seed,见下) |
| cand-canonical-1/2/3(「用 RAG 把内部文档变成问答助手」等) | 启动 seed(persistence-client.ts:4414-4462+,onConflictDoNothing) | **fixture**(种子;与用户真建候选混排**无任何标识**;canonical-1 已被用户 promote、canonical-3 已被 drop——种子在参与真实业务流) |
| cand-2f9238da-375(FlashAttention-3) | 用户 2026-07-01 真实创建 | real |
| basis.评论信号 219 | `topics.overview` → audience_signals 总数;抽查 `audienceSignals.list`:rawText「大佬求带」「[赞][赞][赞]」带真实 ingestionRunId/publicationId(T-007 D2 抖音评论采集) | **real** |
| basis.知识卡 26 | knowledgeService.listKnowledge 计数 | real |
| basis.定位「AI 工程化 / 论文代码化」 | positioningService.getPositioningCenter | real |
| basis.高表现 0 / 来源「历史爆款」0 | `highPerformerCount: async () => 0`(persistence-client.ts:3114,注释:Analytics 无诚实的 per-work 高表现读口,宁 0 不编) | **hardcoded(诚实置 0)** |
| 来源「行业热点」0 | candidate.service.ts:477 写死 0(无热点存储) | **hardcoded(诚实置 0)** |
| 来源「客户咨询」0 | bySrc.consultation——查询是真的,但**不存在任何 consultation 采集源**,恒 0 | real-query/dead-channel |
| 来源「项目复盘」10 / 漏斗「已发布回流」10 | learningsService.listLearnings total(同一数字两处两名) | real |
| 来源「手动灵感」2 | candidates where source='idea' | real |
| 漏斗 6 态计数 | topicsOverviewCounts 真 SQL 派生(unlinked signals / pool±card / promotions / dropped / learnings) | real |
| 待审阅指针(count=8) | `ai.tasks.pending_topic_review` → 最新 candidate_list items 真实长度(ai.repository.ts:457-464) | real |
| AI 出题/补全产物 | 真 LLM(runStructuredNode + generateObject schema 约束;用户可配模型) | real(非确定性,经 confirm 门落库) |

**curl 证据**:`topics.overview` 与 `candidates.list` 返回见上;`audienceSignals.list` total=219。

---

## 4. 数据流向(写路径)

| 交互 | 写到哪 |
|---|---|
| 手动详填 / 编导起草 | `candidates` 表(source='idea'),card 经 `candidates.patch` 合并 |
| AI 选题会·采纳 | `ai.tasks.confirm` → createFromAIResult → `candidates` 表逐条(provenance: aiTaskId;幂等防重);删/改先 `ai.tasks.results.patch` 覆写 ai_task_results.items |
| 补全选题卡(enrich) | confirm → enrichCard → `candidates.card`(整卡替换) |
| 立项 | `projects` 表新建(current_stage=brief,briefDetail=选题卡映射)+ candidates.status='promoted' + `topic_promotions` 行 |
| 丢弃 | candidates.status='dropped' |
| AI 任务过程 | `ai_tasks` / `ai_task_steps` / `ai_task_results` |
| **本页不产生**信号写 | audience_signals 只由采集管线(Ingestion C-4)写入;本页只读 |

---

## 5. 与七步流水线的关系

选题 → 立项(①)的供给口:promote 自动建 brief 阶段项目并带 briefDraft(targetAudience/contentGoal/contentFormat/coreMessage 从选题卡映射,candidate.service.ts:328-360),接缝(SEAM)做真。复盘经验(learnings)与评论信号回流进出题依据,飞轮回路在读侧成立;唯「信号→需求→选题」的 linkToCandidate 环节断在 UI(见 §6-3)。

---

## 6. 疑似 bug(带证据)

1. **排序 NULLS FIRST:未评分候选排在最高分之上**(severity: high)
   - 证据:candidate.repository.ts:178 `.orderBy(desc(sortColumn(sort)))` 无 nullsLast;Postgres `DESC` 默认 NULLS FIRST。curl `candidates.list?sort=predictedScore` 实测:cand-2f9238da-375(predictedScore: null)排第 1,在 88/74/61 分之前。「推荐排序」把没打分的新卡顶到最上面,与「推荐」语义相反;`positioningFit` 为 null 时「定位契合优先」同病。
2. **弹窗生成中关闭后可并发起第二个任务,审阅态可能串台**(severity: medium)
   - 证据:topic-generate-island.tsx:326 `if (phase === "running" && open) return;`——运行中把弹窗关掉(open=false,轮询继续)后 4 个出题按钮重新可点(`generating = phase==="running" && open`,行 440);再点另一 basis → 两个 pollUntilDone 并发,`taskId` 被第二个覆盖,而两个循环都会 setItems/setPhase("review")(行 300-304 无 taskId 一致性校验)→ 展示的 items 可能来自任务 A、采纳(patch+confirm)打到任务 B。
3. **「需求热度优先」排序空转 + 信号挂钩链路断头**(severity: medium)
   - 证据:全部候选 demandCount=0(curl 实测);219 条信号全部 linkedCandidateId=null(漏斗待收集=219);`audienceSignals.linkToCandidate` 与 `audienceSignals.list` **无任何前端消费**(全仓 grep 仅 persistence-client 注释);采集写入不带 linkedCandidateRef → demandCount 永远 0。排序选项存在但无区分度;漏斗「待收集 219」在本页无任何行动出口。
4. **「基于热点出题」无热点数据源,运行文案撒谎**(severity: high,诚实性)
   - 证据:TOPIC_GENERATE_TEMPLATE `tools: []`(ai-worker/src/prompt/templates/topic-generate.ts);trend 的 basisBrief=""(topic-task-adapter.ts:68-73)——basis=trend 与 basis=positioning 喂的材料完全相同,只差一句提示词「蹭当下热点」;模型闭卷编「热点」。而 UI 运行文案 RUNNING_LABEL=「选题 agent 正在看热点/对标并按定位打分」(topic-generate-island.tsx:115-116)、MAX_POLLS 注释「multi-angle agent work (WebSearch)」、candidate.service.ts:475-476 注释「topic.generate(trend) reads it live via WebSearch」均为过时/不实描述。
5. **enrich 双入口自动 confirm,确认门被前端自动化**(severity: medium,宪法张力)
   - 证据:EnrichButton poll 到 awaiting_confirmation 立即 `client.confirmTask`(topics-interactive-region.tsx:375-381);IdeaDraftForm 同(行 1021-1026)。AI 填的整卡未经人看一眼即物化到 Candidate.card(整卡替换)。机制上仍走 confirm op(C-3 形式保住),但「人确认关键产物」(宪法 §5.3)只剩一次事前点击授权 + 事后可改(CollabField);与同页选题会「弹窗审阅→采纳」是**同页两种确认语义**。设计注释自认「一气做完…进池等人审/改」,属有意取舍,建议对齐口径。
6. 轻微:enrich/idea poll 循环不处理 `succeeded` 状态(他处已 confirm 时会空轮询 5 分钟后报错);候选 >100 条无分页 UI(pageSize=100 截断);排序无第二键,tie 顺序不稳定。

---

## 7. 设计不合理

| # | 问题 | severity | 建议 |
|---|---|---|---|
| 1 | **一页三名**:侧边栏「选题」(sidebar.tsx:72)、TopHeader「选题候选池」(shell-router.tsx:196)、页内 h1「选题中心」,且中栏再叫「选题候选池」——SSR 实测「选题候选池」×2、「选题中心」×2 同屏;TopHeader 标题与 h1 上下堆叠重复 | medium | 统一为「选题中心」,TopHeader 与 h1 二留一 |
| 2 | **TopHeader 描述过时**:「按变现潜力排序 · 一键晋升为 Project(七步③)」——实际排序无「变现潜力」维度;「晋升」vs 页内「立项」两套动词;「七步③」与宪法七步(③=策划,选题在①立项上游)编号冲突 | medium | 改写为与实际一致的描述 |
| 3 | **左栏来源行假可点**:hover 高亮+ChevronRight 暗示下钻,实际 onClick 缺失;评论 219 条在本页无处查看明细 | high | 要么去掉箭头/hover,要么做真:点击=中栏按来源过滤 or 打开信号明细 |
| 4 | **漏斗「待收集 219」无行动出口**:linkToCandidate 后端在、UI 无;漏斗纯展示不可点 | medium | 待收集态接「信号收件箱」入口(挂 T-007 D7) |
| 5 | **漏斗 2/3 态命名拧巴**:「待评估」=空卡(其实等的是补全)、「待补充」=已满卡(后端注释自己写「已补全待决策」)——字面语义与状态互换更顺 | low | 改「待补全 / 待决策」 |
| 6 | 已立项候选仍留在候选池列表(只滤 dropped);已丢弃则完全不可见、无恢复入口——两个离池终态一显一隐,不对称 | low | 池子加状态过滤 tab(候选/已立项/已丢弃) |
| 7 | 来源列表混合口径:评论 219/知识 26 是「原料量」,手动灵感 2 是「候选量」,读作「该来源产生的选题数」会错;高表现/热点/咨询三行长期恒 0 | low-medium | 分组或注明口径;恒 0 渠道标「未接入」 |
| 8 | 同屏 AI 入口 5 处(4 出题按钮/在对话里出题/编导起草/卡上补全/详情栏补全);宪法 §6 方向是统一 ChatBox,本页「直接任务弹窗流」与「ChatBox 流」并存(代码自认两条并存) | low | 保留但明确主次;长期向 ChatBox 收敛 |
| 9 | 术语:同一 predictedScore 在排序叫「推荐排序」、审阅弹窗叫「爆款潜力」、种子注释叫「monetization-weighted」 | low | 统一叫法 |
| 10 | 种子候选(canonical-1/2/3)与用户真实候选混排无标识,且参与真实业务流(已被 promote/drop)——宪法 §7「替换所有 mock/seed」在本页未完成 | medium | 种子加 provenance 标识或按宪法清除 |

---

## 8. 待对齐点(供全局分析)

1. 页面命名(选题/选题候选池/选题中心)与 TopHeader/h1 双标题模式——其他中心页(校准/定位)是否同病。
2. 「七步③」编号体系残留(page.tsx 头注/SPEC §5.5/shell-router 描述)vs 宪法七步(选题在①上游),全站阶段编号需统一。
3. 确认门语义分裂:「审阅后采纳」(topic.generate)vs「自动 confirm+事后改」(topic.enrich)——全站 AI 节点应统一其一或明文分级。
4. 诚实置 0 三兄弟(高表现/行业热点/客户咨询):置 0 合「不编」纪律,但三行恒 0 长期挂在 UI 上,需要「未接入」态视觉语言(全站空态规范)。
5. audienceSignals.list/linkToCandidate 是「后端有 op、前端无消费」的悬空接口——全站盘点同类悬空 op。
6. 排序 NULL 处理(nullsLast)应做成仓内 repo 通用约定(其他模块 orderBy desc 同风险)。
7. fixture(canonical seed)与真实数据混排问题在其他页(项目/知识库/复盘)是否同样存在。
