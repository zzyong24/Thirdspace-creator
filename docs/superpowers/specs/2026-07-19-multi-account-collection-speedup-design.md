# SPEC:多账号抖音采集提速(绑号轻触发 + 每日错峰)—— 最小范围版

- **日期**:2026-07-19 · **任务**:T-433 · **状态**:v4(最小范围;3 轮 gate 后采纳评审收敛=移除内存优先队列;待第 4 轮门)
- **底座**:[research](../../research/2026-07-19-douyin-collection-speedup-research.md) · **评审史**:[review.md](2026-07-19-multi-account-collection-speedup-design.review.md)(3 轮全落盘)
- **范围收敛**:用户 2026-07-19 选「缩范围·折中」;其内存优先队列命中评审 blocker(等待 run 被当 `running` 显示=假进度,违 P-03/P-05)。**采纳评审收敛:移除内存优先队列,只做两件小而安全的事**——绑号轻触发 + 每日错峰。**「明细优先于封面」靠「绑号不触发重活、重活延后」实现,不引入任何新队列/新任务态。**

## §0 背景与定位

**问题**:多账号绑号 → 怕封 IP(**已双层规避,不动**,§0.1);真痛点=绑号即抢跑**逐条重活**(封面/逐字稿/重建)堆超长串行 + 每日定时 job 跨账号同刻爆发。**合定位**:采集是「品味对齐飞轮」数据地基;本 SPEC 只改**绑号触发集(重活延后)+ 每日 cron 错峰**,**不新增队列/任务态/持久化,不改采集范围/字段/数据归属/防封/gate-F5 语义/重启语义**。对照宪法 R-INGEST、BR-02(写幂等)、BR-05(用户设置时区)、P-03/P-05(不制造假任务态——本 SPEC 不新增任何任务态故天然不违反)。

### §0.1 现网事实(每条 file:line)

| 事实 | 证据 |
|---|---|
| 防封①请求级全局单例 gateway(9s/4s+退避+cooldown,并发1)②job 级 gate-F5 内存串行(concurrency1) | `persistence-client.ts:1512-1519,1544-1557`;`douyin-throttle-config.ts:8-12,40-50` |
| 绑号 fire-and-forget 拉全量:默认开 self.metrics+self.detail 按序;**self.detail runner 尾无条件排逐字稿/重建/封面重活** | `collection-bootstrap.ts:234-266`;`douyin-heavy-backfill.ts:14-32` |
| 重活已增量幂等(封面仅缺封面项/逐字稿·重建已有跳过) | `persistence-client.ts:5309-5313`;`reconstruct-enqueue.ts:20-24` |
| daily job cron **固定时刻**(9:00/9:10/…9:50)= `node-cron` 每分钟轮询(无内建时区) | `collection-bootstrap.ts:43-97`;`scheduled-collection-scheduler.ts:276-336` |
| 绑号当日重复触发 in-flight 双闸短路(幂等) | `scheduled-collection-scheduler.ts:154-168` |

### §0.2 现成方案 / OSS 调研

**错峰要「cron + 用户时区 + DST」**:

| 候选 | 时区/DST | 与现有 node-cron 关系 | 依赖体积 | 采否 |
|---|---|---|---|---|
| **A. croner**(单文件、内建 timezone/DST、`nextRun()`) | ✅ 内建 IANA tz + DST | 可替 node-cron 或仅用其 `nextRun` 算触发时刻做冲突检测 | 极小(~0 dep) | **采用**(错峰只需「按 tz 算某 cron 下次/是否冲突」;croner 原生支持,不自造 tz 数学) |
| B. luxon 自算 tz + 保留 node-cron | ✅ tz 数学 | 需自己把 cron→触发时刻 | 中 | 否(要自造 cron 解析) |
| C. 自建 tz+DST 数学 | 自造(易错) | — | 0 | 否(DST 边界自造是坑,量规反造轮子) |

**轻触发**:无新组件——只在 self.detail runner 尾按「是否绑号初始化」条件跳过重活 enqueue(复用现有 heavy-backfill 触发),无候选可比。**不建队列**(评审 3 轮推出的持久队列 = 独立后续 SPEC)。

## §1 目标 / 非目标

**目标**
- **FR-1** 绑号(含多账号连绑)**不再一次性堆逐条重活**:self.detail 从**绑号初始化**跑时**不触发**尾部封面/逐字稿/重建;重活由**次日 daily self.detail job** 或**用户按需**触发。→ 绑号当刻只有 self.metrics+self.detail 两个明细 run 进 gate-F5,重活不在其中。
- **FR-2**(「明细优先于封面」)绑号阶段封面/逐字稿**不进闸**,故明细天然先于封面落地(靠**延后触发**,非任何队列/优先级)。
- **FR-3** 每日采集 job **错峰无冲突**:任意两个 `(account, jobKind)` 最终触发**分钟槽互异**;按**用户设置时区**(BR-05)含 DST 计算(croner);容量耗尽有确定行为。UI 引导 + 每账号可调时段。

**非目标(显式 · 用户已确认 · 非静默缩水)**
- **不新增队列/任务态/持久化/排队 UI**:gate-F5 内存串行、job_run 状态机、重启语义**全部维持现状**(绑号只是**少 enqueue 重活**,不改闸的结构)。持久崩溃安全优先级队列 + 排队可见 = **独立后续 SPEC(评审 3 轮推出的生产级子系统)**。
- **不动防封**(gateway + gate-F5 并发1 不改)。
- **benchmark/darkhorse/self.detail 增量** = 独立小任务(§0.1 主要增量已覆盖)。

## §2 设计

### §2.1 绑号轻触发(FR-1/FR-2)

- `bootstrapDouyinCollectionJobs` ②(`collection-bootstrap.ts:250-263`):绑号仍入闸 self.metrics + self.detail(不变);**self.detail 的本次运行带 `bootstrapInit=true`**。
- self.detail runner(触发 heavy-backfill 处,`douyin-heavy-backfill.ts:14-32`):**`if (bootstrapInit) 跳过封面/逐字稿/重建 enqueue`**;非 bootstrap(次日 daily / 手动)照常触发。
- **重活的补齐路径(不漏)**:① 次日 daily self.detail job(`bootstrapInit=false`)到点触发封面/逐字稿/重建;② 用户按需——不新增触发口,复用「进复盘/制作页时 self.detail 若已有数据则重活由该次 daily 或用户手动 runNow 触发」(runNow 走 daily 语义,`bootstrapInit=false`)。
- **幂等**:重活底层已幂等(封面仅缺项/逐字稿已有跳,§0.1),延后重跑不重复。绑号当日重复绑号经现有双闸短路。

### §2.2 每日错峰(FR-3)—— 无冲突槽位 + 用户时区(croner)

**新增数据(字段级)**:
- 表 `platform_account`(账号级,复用现有账号表)加列:
  - `collection_base_minute INTEGER NULL`(该账号 daily job 基准分钟偏移,0–1439;null=未分配→迁移/绑号时分配);
  - `collection_timezone TEXT NULL`(IANA tz;null → 取用户 settings 时区,再缺 → 本机);
  - `collection_custom_time TEXT NULL`(用户自定义「HH:MM」;非 null 则覆盖 base 分配,不被重排)。
  - Drizzle + PGlite migration `00xx_collection_stagger.sql`:`ALTER TABLE ... ADD COLUMN ... DEFAULT NULL`;幂等(IF NOT EXISTS 语义由 drizzle-kit 版本管理);回滚 = drop 3 列(不影响采集,回落固定 cron)。
- **槽位分配 `allocateBaseSlot(accountId)`**(事务内,account 表行锁 / `SELECT ... FOR UPDATE` 等价 PGlite 串行):
  1. 读窗口内已占 base(其他账号 collection_base_minute,间隔 `ACCOUNT_STRIDE_MIN`=60,> 账号内 6 kind 最大偏移 50 → base 互异即 `(account,kind)` 全互异)。
  2. 取错峰窗口(默认 `STAGGER_WINDOW`=[0,360) 分即 00:00–06:00)内**最小空闲 base**;写入。
  3. **容量公式**:窗口容量 = `window/stride`(默认 360/60=6 账号)。**超容量确定行为**:窗口用满 → 缩小 stride 到 `max(10, window/账号数)`(仍 ≥ kind 偏移跨度 50?否则退到「按 (account,kind) 全局取下一空闲分钟」的**最终触发时刻全局冲突检测 + 顺延**),保证「≤1440/6=240 账号可行,>240 拒绝新增并提示」。>240 账号超硬容量 → `allocateBaseSlot` 抛 `CollectionStaggerCapacityError`(账号仍可绑,daily job 建但记 warning + UI 提示手动设时段)。
- **cron 生成**:每 `(account, jobKind)` 最终触发 = `base_minute + KIND_OFFSET[jobKind]`(KIND_OFFSET 固定:metrics 0/detail 10/comments 20/benchmark 30/topic 40/favorites 50),转 `HH:MM` cron,**按账号 collection_timezone 用 croner 计算 nextRun**;`collection_custom_time` 非 null 则该账号所有 job 以其为 base。
- **DST**:croner 按 tz 处理 DST——**跳时(spring-forward 不存在的本地时刻)→ 顺延到存在的下一时刻执行一次;重复时(fall-back)→ 只执行一次**(croner 默认语义,写入验收)。错峰窗口选凌晨低峰减少 DST 命中。
- **自定义冲突**:两账号设同 custom_time → PUT 时校验最终 `(account,kind)` 触发是否与他账号撞分钟,撞则 `409 + 建议空闲槽`(不静默覆盖、不静默共存)。
- **存量迁移**:上线 migration 后,首次 scheduler tick 对 `collection_base_minute IS NULL` 的账号 `allocateBaseSlot` 回填 + 重算其 daily job cron(固定 9:xx → base+offset);`collection_custom_time` 非 null 不动。
- **增删号**:归档 → base 释放(可复用);新增 → allocateBaseSlot;已分配不动(稳定)。分配事务防并发新增/归档取同槽(行锁 + 唯一性:同窗口 base 唯一由分配逻辑保证,非 DB 约束——PGlite 串行 + 事务内查空闲)。
- **UI**:多账号提示「已错峰安排 N 账号每日采集(起 HH:MM,间隔 X 分,时区 TZ)」+ 每账号可编辑采集时段(写 collection_custom_time,PUT contract 校验冲突)。

## §3 数据流变更(最小)

1. **绑号触发集**:self.detail 尾无条件排重活 → **bootstrapInit 时跳过重活**(重活延后 daily/手动)。仅改「重活何时进闸」,不改采集内容、不改 gate-F5 结构、不新增任务态。
2. **cron 生成**:固定时刻 → per-account 无冲突 base + kindOffset,croner 按用户时区+DST。新增 3 列(platform_account)+ migration + PUT contract。
**gate-F5 内存串行/job_run 状态机/重启语义/防封/采集协议 均不变。**

## §4 诚实边界

- **不新增任何任务态/队列/持久化** → 不制造假 running(P-03/P-05 天然不违反);重启语义=现状(gate-F5 内存串行,daily job 幂等重采)。
- **不动防封**;gate-F5 并发1 不改。
- **重活延后代价**:封面/逐字稿绑号当天不出,次日 daily 或手动补——明细(用户马上要看)当天出,重活不急,可接受。
- **错峰容量**:>240 账号硬上限(1440/6),超则拒绝新增自动错峰并提示手动设时段(桌面单人多号极少破 240)。

## §5 FR 追踪矩阵

| FR | 设计 | 实现入口 | 契约 | 测试 | 切片 |
|---|---|---|---|---|---|
| FR-1/2 绑号轻触发·明细先于封面 | §2.1 | `collection-bootstrap.ts` ② 传 bootstrapInit;`douyin-heavy-backfill.ts` 按 flag 跳过 | (无新契约) | 单测:bootstrapInit=true→重活不 enqueue;=false→照常;重活延后不重复(幂等) | S1 |
| FR-3 错峰无冲突 | §2.2 | `collection-bootstrap.ts:43-97` cron 生成 + `allocateBaseSlot` + migration + scheduler 用 croner | put `ingestion.douyin.setCollectionTime`(accountId, HH:MM/tz)→校验冲突 409 | 单测:N×6 kind 最终时刻全互异;容量耗尽抛/顺延;DST 跳/重执行一次;custom 冲突 409;迁移回填/自定义保留 | S2 |

## §6 验收

1. **FR-1**:连绑 3 号 → 各 self.metrics+self.detail 进闸,**无**封面/逐字稿/重建 enqueue(bootstrapInit 单测锚);次日 daily(bootstrapInit=false)正常触发重活;重活幂等不重复。
2. **FR-3**:3 号×6 kind 最终 cron 触发分钟全互异(croner nextRun 计算);容量耗尽确定行为(顺延或抛+提示);DST 跳时/重复各执行一次;custom_time 冲突返 409+建议槽;migration 后存量账号有槽、自定义不被覆盖;时区取用户设置。
3. gateway 间隔/退避不变;gate-F5/job_run/重启语义不变(不新增任务态,单测断言无 queued 引入)。

## §7 切片

- **S1** 绑号轻触发(bootstrapInit 跳重活 + 延后补齐路径,§2.1,FR-1/2)——极小。
- **S2** 每日错峰(3 列 + migration + allocateBaseSlot + croner 时区/DST + setCollectionTime contract + UI,§2.2,FR-3)。
顺序:S1 → S2。

## §8 后续(独立 SPEC,已确认移出)

- **后续-A** 持久崩溃安全采集队列 + 排队进度可见 + 跨账号严格优先级(queued 态 + DB lease/mutex + 逐 sourceKind 幂等 checkpoint + 完整 DDL)——评审 3 轮推出的生产级子系统。
- **后续-B** benchmark/darkhorse/self.detail 增量。
