# 抖音采集管线现状调研 —— 为 T-433「多账号采集提速」SPEC 提供事实底座

- **日期**:2026-07-19
- **触发**:用户担忧「多账号疯狂绑号采集 → 一堆账号并发抓抖音 → 封 IP」;核实后**封 IP 已双层规避**,真痛点是多账号串行太慢。
- **方法**:general-purpose 子代理 codegraph + grep 反证(27 tool uses,140k tokens);目标=反证「哪些已做别重复造」。
- **拍板设计取向(用户 2026-07-19)**:见文末「用户设计决策」。

---

## 一句话结论

**防封双层已达标·不动**(请求级 `DouyinRequestGateway` 单例 + job 级 `gate-F5` 串行闸并发=1);**增量化已完成一半**——self.metrics/comments/逐字稿/重建/封面均已增量,**self.detail(明细导出)是唯一真·全量重扫**,benchmark/darkhorse 是「有界全量重扫 + 写层幂等去重」;**绑号 T-189a 立即拉全量的改造点单一清晰**(`bootstrapDouyinCollectionJobs` 的 ② 触发循环);**排队进度缺 gate-F5 跨 job 等待队列的可见性**(等在闸后的 job_run 已被标 `running`,不是真「排队中」)。

---

## ① 采集数据类型 × 触发 × 增量 矩阵

| 类型 | 触发 | 增量? | 证据 |
|---|---|---|---|
| **self.metrics**(作品works+主页指标) | 绑号初始化(默认**开**)+每天 9:00+手动 | **已增量** ✅ 作品列表倒序翻页 early-stop(已知 awemeId 全命中即停);指标 append-only 幂等 | `douyin-cdp.ts:705-709,1022-1084`;`persistence-client.ts:5314-5356` |
| **self.detail**(明细导出,16字段/完播/CTR/留存) | 绑号初始化(默认**开**)+每天 9:10+手动 | **全量重扫** ⚠️ 每 run 导出整个作品列表 xlsx 全量重匹配,无 watermark;**但导出本身是单次操作**(非逐作品导航) | `persistence-client.ts:5616,5636-5690` |
| **comments**(评论) | 绑号建 job **默认关**+每天 9:20(若开)+手动 | **已增量** ✅ T-177 watermark 倒序 early-break + T-232 断点续采 + 爆款优先 | `comment-collection-plan.ts:5-11`;`persistence-client.ts:5454-5607`;`douyin-cdp.ts:1707-1794` |
| **transcript**(逐字稿) | self.detail 尾 fire-and-forget(heavy backfill) | **已增量** ✅ 已有 transcript artifact 跳 ASR;隐藏作品跳 | `reconstruct-enqueue.ts:20-24,51-57`;`douyin-heavy-backfill.ts:14-32` |
| **reconstruct**(作品 auto-fill 重建) | 同上,self.detail 尾 | **已增量** ✅ 已重建跳 + createTask IN-FLIGHT 去重 + 隐藏跳 | `reconstruct-enqueue.ts:23-24` |
| **cover backfill**(封面回填) | self.detail 尾(T-195 从 self.metrics 挪来) | **已增量** ✅ 候选只含**缺封面**的已发布作品;只对可见作品跑 | `persistence-client.ts:5309-5313,5838-5850`;`douyin-heavy-backfill.ts:16-32` |
| **benchmark**(对标) | 绑号建 job **默认关**+每天 9:30+手动 | **有界全量重扫** ⚠️ 每源翻 ~5 页,**无 early-break**;`recordWork` 只写库层幂等(不省抓取) | `benchmark-collector.ts:5-7,41-46`;`douyin-cdp.ts:1146` |
| **darkhorse**(黑马) | 并入 benchmark job(串行) | **有界全量重扫** ⚠️ 逐关键词搜 top5,每 run 重搜 | `darkhorse-collector.ts:8-15`;`persistence-client.ts:6146-6147` |
| **topic.daily**(每日选题) | 绑号建 job **默认关**+每天 9:40+手动 | N/A(AI 出题,**不碰 douyinGateway**;≤N/天默认5) | `collection-bootstrap.ts:74-85`;`persistence-client.ts:6253-6256` |
| **favorites**(收藏夹) | 绑号建 job **默认关**+每天 9:50+手动 | 有界(≤3/run);每 run 重拉,过 gateway | `collection-bootstrap.ts:86-96`;`persistence-client.ts:6361-6500` |

**关键**:绑号初始化**只触发默认开的 2 条**(self.metrics / self.detail);其余建 job 但 `enabledByDefault=false` 不触发(`collection-bootstrap.ts:250-263`)。

---

## ② 绑号触发链(T-189a)

- **入口**:`loginDouyin`/`loginDouyinForceNew` 成功后 fire-and-forget 调 `onDouyinBound(boundCtx)`(带真号,吞错不阻塞);调用点 `ingestion.service.ts:561-567` / `1012-1018`。
- **组合根**:`persistence-client.ts:2372` → `bootstrapDouyinOnBind`(`:6596`)→ `bootstrapDouyinCollectionJobs`。
- **两步**(`collection-bootstrap.ts:234-266`):① 幂等建 6 job(`ensureCollectionJobs`,单一真源 `DAILY_COLLECTION_JOB_DEFAULTS`);② **立即初始化拉全量**——`for job of jobsInOrder` 中 `if(!enabledByDefault)continue` → `await deps.trigger` **按序**(self.metrics→self.detail),内部 dispatch 挂 gate-F5。
- **改造点(能否入队不抢跑)= ② 触发循环单一**。三选(供 SPEC):
  1. 完全去 ② → 只建 job;风险**首次绑号当天看不到作品数据**(等次日 9:00)。
  2. ② 只入队 job_run(真 `queued` 态)不 dispatch → 需 job_run queued 态 + gate-F5 从库 drain(改造较大)。
  3. **② 只触发 self.metrics**(最轻/秒返回/是 self.detail 前置),self.detail+重活按需/次日 → **风险最小,兼顾「绑完能看到作品列表」**。
- **幂等已保证**:重复绑同号 ① 复用 job、② `triggerScheduledJob` 当天 in-flight 双闸短路(`scheduled-collection-scheduler.ts:154-168`);**堆积来自多个不同号各自 self.metrics+self.detail 串行叠加在同一 gate-F5 链**。

---

## ③ Job 队列/执行模型

- **job_run 状态机**:`running`→`succeeded`/`failed`/`needs_reconnect`;**创建即 running**(`triggerScheduledJob` 先 `createRun({status:"running"})`,`scheduled-collection-scheduler.ts:186-191`),然后 dispatch fire-and-forget 入 gate-F5。
- **scheduler**:node-cron 每分钟轮询(`:276-336`),单例守卫钉 globalThis;测试/CI/build 不启。
- **gate-F5 串行闸(并发=1)**:`persistence-client.ts:1544-1557` `enqueueCollectionRun`——**module 级 promise 链 `collectionRunTail`**;防两 Chromium 各打一 channel 并存。
- **僵尸清扫**:`sweepStaleRuns`(>30min running→failed)+`sweepStaleAiTasks`(T-389)。
- **「有无待跑队列可 UI 展示」——没有**:gate-F5 是**内存链,不落表、不可枚举**;等闸的 job_run 已标 running。**这是 ⑤ 排队进度的核心缺口**。

---

## ④ 限流可观测(T-038c)

- **快照**(`ChannelStatus`,`douyin-request-gateway.ts:162-167,402-412`):`cooldownActive` / `cooldownEtaMs` / `consecutiveThrottles` / `lastRequestAt`;两 channel。
- **读端口**:`readDouyinThrottleStatus`(`persistence-client.ts:1531-1542`)读内存镜像;绑 op `ingestion.douyin.throttleStatus`。
- **已接 UI** ✅:`automations-island.tsx:1641,1710-1720` 挂载拉一次;`throttleBannerText`(`:335-340`)渲「⏳ 限流保护中…」。**口径细节**:前端 `channelForSourceKind`(`:319-325`)把所有 sourceKind 都归 `creator-center`,iesdouyin 退避没在 job 行体现;**且挂载拉一次非实时轮询**。

---

## ⑤ 三优化点现状/缺口

**增量化**
- 已增量·别动 ✅:self.metrics / comments / transcript / reconstruct / cover backfill。
- 缺口:①**self.detail 真全量重扫**(改点 `persistence-client.ts:5636`;但整表 xlsx 导出,增量收益不如 comments)②**benchmark/darkhorse 有界全量重扫**(可加已知 awemeId early-stop,同 self.metrics T-177)。

**绑号不抢跑**
- 改点单一(`collection-bootstrap.ts:250-263`)。**推荐折中(方案3)**:② 只触发 self.metrics,self.detail+重活按需/次日。**不漏首次**(job 已建默认开,到点/手动补)。

**排队进度**
- 够展示:per-job run 状态 + running 阶段进度条(2s 轮询,`automations-island.tsx:415-484`)+ 历史 + 限流横幅。
- 缺:**跨 job 的 gate-F5 等待队列不可见**。二选一:(1)给 job_run 加真 **`queued` 态**(createRun 落 queued,runner markRunning 转 running;改 `scheduler:186-191`+runner`:234`,前端 RunStatus 枚举可扩);(2)gate-F5 从库 drain(改造更大,顺带解决重启丢内存队列)。

**边界(SPEC 测试注意)**:gateway 单进程单例,**双开 app 实例=2 倍速率**(防封边界+测试陷阱)。

---

## 用户设计决策(2026-07-19 拍板,SPEC 必含)

1. **绑号仍自动采(入队,非改手动)**——但要智能。
2. **(A) 优先级双队列**:作品明细数据(作品名/标题/明细,用户马上要看)**高优** > 封面(cover 图,重且量大不急)**低优**;明细先采完能用、封面延后。→ 当前 gate-F5 是单条 FIFO,需拆优先级(明细类先于封面类,尤其多账号时「所有账号明细」优先于「任何账号封面」)。
3. **(B) 定时 job 错峰**:多账号每日采集 job **不能都压同一 cron 时刻**(现全在 9:00/9:10/…固定点 → 多账号同时爆发=灾难);系统按账号错峰分散 + 多账号时**引导用户错峰**。

## 关键文件锚

- `backend/src/modules/ai-runtime/collection-bootstrap.ts`(T-189a 绑号编排 + 6 job 单一真源)
- `backend/src/modules/ai-runtime/scheduled-collection-scheduler.ts`(triggerScheduledJob / 幂等双闸 / cron / sweep)
- `backend/src/modules/ai-runtime/scheduled-collection-runner.ts`(runScheduledCollection / job_run 终态)
- `frontend/src/server/persistence-client.ts`(gate-F5 `enqueueCollectionRun:1544` / 6 collectors:5303 / throttleStatus:1531 / dispatch:4837)
- `frontend/src/server/ingestion/douyin-request-gateway.ts`(限流网关 + getChannelStatus:402)
- `frontend/src/server/ingestion/douyin-cdp.ts`(T-177 作品/评论 early-stop:705,1707)
- `frontend/src/features/automations/automations-island.tsx`(throttleStatus UI:1641 / 进度条:415)
