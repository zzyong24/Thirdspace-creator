# 多抖音号(多人设)绑定 / 切换 / 管理设计(T-136)

> 每个抖音号 = 一套完全独立的人设(独立定位 / 作品库 / 数据 / 采集登录态),切号 = 切工作空间。只支持抖音。
> 用户拍板(2026-07-05):账号模型 = **每号完全独立人设**;节奏 = **先出本 SPEC 给用户审**。

## 0. 用户诉求(2026-07-05)

用户:「新用户拿到软件从 0 开始,没有任何 seed / 他人数据;他只绑自己的个人信息 + 扫码绑自己的抖音,而且**一个人可能有多个抖音号(多个不同人设),要支持绑定 / 切换 / 管理**。只支持抖音,不考虑其他自媒体平台。」

拆两件事:①**T-135**(独立任务,见 BACKLOG)新用户开箱即干净空账号(退役 canonical seed);②**T-136**(本 SPEC)多抖音号 = 多独立人设的绑定 / 切换 / 管理。

## 1. 背景与目标

**目标**:把现有的「user 级单一工作空间」细化出一层 **account 级工作空间**——一个本机 user 下可挂多个抖音号,每号各自独立的:定位母版 / 人设、作品库(项目 / 产物)、真实数据(发布 / 指标 / 评论)、采集登录态、选题 / 复盘 / 知识。用户在侧栏切号,全站数据随之切换。

**非目标**:①不做跨平台(只抖音;`platform` 字段保留但本期只 `douyin`);②不做多 user / 团队协作(user 仍是最外层租户边界,登录不变);③不改「编导对话 / 飞轮 / 盲预测」等核心玩法,只是把它们的归属维度从 user 下沉到 account。

## 2. 宪法对照(合定位)

对照 [产品定位](../../产品定位.md):
- 定位 = 「编导式自媒体内容生产系统 · 越用越准」,目标用户 = 「个人或小团队,持续产出」。**创作者运营多个抖音号(不同垂类 / 人设)是真实场景**;多号让**每个号各自「越用越准」**(护城河是 per-创作者-per-号的数据资产),**强化**而非偏离飞轮定位。
- 宪法 §5:「创作者真实已发布作品导入为历史项目…**替换所有 mock/seed**」——多号的每个号都装自己的真实导入作品;且 T-135 去 seed 是**宪法明确要求**,与本设计天然一致。
- 结论:**合定位**。是把既有能力按「号」维度正交展开,不新增偏离性玩法。

## 3. 现网事实(已勘查 + 主 agent 亲验,2026-07-05)

**⚡ 幸有既存地基,不是从 0 造账号层**:
- **`RequestContext` 只有 `userId`**(亲验 `contract/src/request-context.ts:15`,注释「userId is the sole multi-tenant boundary」)——无 account 维度,须新增。
- **`platform_accounts` 是活的账号一等实体**(亲验 `backend/src/schema/platform-account.ts` + contract `platform-accounts.ts` 全套 CRUD op + service `assertOwnedAccount` 跨模块守门 + 前端 `features/platform-account/account-manager-view.tsx` 管理 UI)。约束 `UNIQUE(user_id, platform, account_handle)`——**一 user 多号(矩阵号)本就是它的设计**。
- **`content_calendar` 已实装 `(user_id, account_id)` 双维度归属**(亲验 `content-calendar.repository.ts`:`createEntry(accountId,…)`、`cadence (user_id,account_id) UNIQUE`、service 先 `platformAccounts.getAccount(ctx, accountId)` 验权)——**这是可直接复用的 account-第二维度活范式模板**。
- **`publications` / `project_target_platforms` 的 `account_id` 列已预留**(亲验 `platform-account.ts:65-68` `ALTER TABLE … ADD COLUMN IF NOT EXISTS account_id`,注释 §7.1「多账号矩阵」;`account_reference` 旧软 ref 仍兼容;绑定在 service 层校验)——**已铺列,只缺激活逻辑**。

**缺口(须建)**:
- 定位母版 `creator_profiles` 是 **`UNIQUE user_id` 单例**(`positioning.ts:78`,注释「one profile per user OQ1」)——每号一套人设的**直接障碍**。
- 抖音登录 `ingestion.douyin.login/status`、采集 `refreshDouyin` **无 accountId 入参**;登录态写死单目录 `.auth/douyin`(`persistence-client.ts:1317`,`douyin-cdp.ts:312` launchPersistentContext 复用单 profile)——多号无法各自扫码 / 各自登录态 / 各自采集。
- `external_sources` / `ingestion_runs` / `audience_signals` / `metric_*` 无 `account_id`,采集结果无法归到「哪个号」。
- **无「当前账号」态**:前后端都没有 selected/current account 概念;sidebar / top-header 无账号切换 UI。
- `projects` / `artifacts` / `assets` / `knowledge_*` / `candidates` / `learnings` / `reviews` / `calibration` 等内容表**只有 user_id**,未按号隔离。

## 4. 设计

### §A account = RequestContext 第二归属维度(核心)

`account` 复用 **`platform_accounts`**(`platform='douyin'` 行),**不新建 account 表**。一个抖音号 = 一条 platform_accounts 行 = 一个独立人设工作空间。

- **`RequestContext` 加 `accountId?: string | null`**(`contract/src/request-context.ts`)。语义:「本次请求作用在哪个号」;`null` = 全局 / 未选号(见 §E 退化)。
- **需隔离的 owned-root 表加 `account_id TEXT` 列**;repo ownership 门在既有 `eq(userId)` 上叠 `accountId ? eq(account_id) : (不过滤)`——**逐字复用 content_calendar 范式**(`and(eq(userId), eq(accountId))`)。
- **service 守门**:涉及 account 的写 / 敏感读先 `platformAccounts.assertOwnedAccount(ctx, ctx.accountId)`(既有 public 边界,跨用户 / 未知号 → OwnershipError 404)。
- **注入链**:前端 client 每次请求带「当前账号」(HTTP header `x-account-id`,由 contract-client 统一注入)→ server `resolveRequestContext` 读进 `ctx.accountId`(与 userId 同源解析,校验该 account 属当前 user,不属 → 忽略降级 null)。

### §B 表归属分类(按号隔离 vs user 级共享)

**原则**:「人设 / 内容 / 该号真实表现」按号隔离;「本机系统配置 / 身份 / 派生索引」user 级共享(换号不必重配)。

- **按号隔离(加 `account_id`)**:`projects`、`artifacts`、`assets`、`knowledge_items`(+`revisions`/`relations`)、`candidates`、`audience_signals`、`topic_promotions`、`learnings`(+`applications`)、`reviews`(+`insights`)、`calibration.*`、`creator_profiles`(改约束,§C)、`positioning_statements`、`external_sources`、`ingestion_runs`、`metric_snapshots`/`metric_values`/`retention_points`/`audience_snapshots`;`publications` / `project_target_platforms` **激活已预留列**。
- **user 级共享(不加)**:`users`、`sessions`、`platform_accounts`(账号注册册本身)、`user_preferences`、`model_configurations`、`agent_configurations`、`storage_configs`(模型 / 密钥 / 偏好换号复用)、`notifications`、`search_documents`(派生可重建)、`scheduled_jobs`。
- **OQ(§9)**:`ai_conversations` / `ai_tasks` 本期是否按号(倾向暂 user 级,`scope` 字段已预留 `account:<id>` 扩展位)。

### §C 定位 per-account

- `creator_profiles`:`UNIQUE(user_id)` → **`UNIQUE(user_id, account_id)`** + 加 `account_id` 列。一号一套定位母版 / 人设。
- `positioning_statements` 加 `account_id`(承 `profile_id`;`UNIQUE(profile_id, version_number)` 不变)。
- `PositioningReader.getPositioningCenter(ctx)` → 按 `ctx.accountId` 读当前号的 profile;positioning 页 / creative-context facet / script-review-runner / positioning-runner 全消费面随 `ctx.accountId` 切(§D)。

### §D 抖音采集 & AI 上下文 per-account

- **登录态分目录**:`authDir` `.auth/douyin` → **`.auth/douyin/<accountId>`**(每号独立 persistent context / sessionid)。
- **contract 带号**:`douyin.login` / `douyin.status` / `refreshDouyin` 入参加 `accountId`;status 返回按号;采集 fan-out 把 `account_id` stamp 进 `publications`/`metric_*`/`audience_signals`;`external_sources` 加 `account_id`(区分同 user 的多号源)。
- **AI 注入按号**:`assembleCreativeContext` 与其各 reader(positioning / learnings / signals / knowledge / accounts / reviewSubject)按 `ctx.accountId` 过滤——同一 `topic.generate` 在不同号下出题约束不同(各自定位 / 受众 / 经验)。调用侧各 runner 已透传 ctx,天然带上 accountId。

### §E 当前账号态 + 切换器 UI + 退化

- **持久**:`localStorage['creatoros:current-account']` 存选中 accountId(复用 sidebar collapse 同款 try/catch 降级范式)。
- **切换器**:sidebar 用户区(UserProfileMenu 附近)加账号下拉(读 `platformAccounts.list`,显 handle + 当前号高亮 + 「+ 绑定新抖音号」入口深链到既有账号管理 + 扫码);切号 → 写 localStorage + 刷新数据(client 后续请求带新 `x-account-id`)。
- **退化(accountId=null)**:①新用户 / 未绑任何号 → 引导去绑定(接 T-131 引导页 + 账号管理);②已绑但未选 → 默认选「最近活跃 / 第一个 active」号;③明确「全局视图」(如跨号总览,后续)时 accountId=null → repo 不按号过滤(返回该 user 全部)。本期默认「必选一个号」,全局视图列 OQ。

### §F 与 T-135(去 seed)的衔接

T-135 去掉 canonical seed 后,新用户 = 空 user + 0 个 account → 引导绑第一个抖音号(建 platform_accounts 行 + 扫码 + 填该号定位)→ 该号成为默认工作空间。两个任务配套:T-135 清空、T-136 立多号骨架、T-131 引导串起来。

## 5. 现成方案 / 复用面(gate 必查:别重造)

- **账号实体 + CRUD + 管理 UI + 跨模块守门**:`platform_accounts` 全套已在 → **直接复用,不新建**。
- **account 第二维度归属范式**:`content_calendar`(userId, accountId)活范式 → repo / service / 迁移**照抄**。
- **已预留列**:`publications` / `project_target_platforms` 的 `account_id` → **激活**,非新增。
- **登录态可注入范式**:`douyin-cdp.ts` 的 `openContext(authDir, headless)` 已参数化 authDir → 只需把 accountId 拼进路径,不改 CDP 层。
- **持久化 + 降级范式**:localStorage(sidebar collapse / rail-width / onboarding dismissed)现成。

## 6. 数据与契约(additive 为主)

- 迁移(新 `backend/drizzle/00XX_*`,全 additive `ADD COLUMN IF NOT EXISTS`):按号隔离表加 `account_id TEXT`(先 nullable);`creator_profiles` 改 `UNIQUE(user_id, account_id)`(先删旧唯一索引再建复合——**这一步动约束 = 数据归属改动,gate 重点**);加相关 `(user_id, account_id)` 索引。
- 契约:`RequestContext` + `accountId`;`douyin.login/status/refresh` body 加 `accountId`;各按号 list op 加可选 `accountId` query(additive,不传 = 全量,旧调用不破)。
- **存量迁移(71 真作品)**:①为每个 user 建一条默认 `douyin` platform_accounts(handle = 用户填 / 「我的抖音」占位);②backfill 所有按号隔离表 `account_id = 默认号`;③**保留列 nullable**(不强改 NOT NULL)→ 旧数据 / 全局视图 accountId=null 兜底默认号,**零破坏**。

## 7. 切片(T-136 一次做全的 Task 拆分,非分期减法)

> 铁律:以下是把 T-136 拆成完整可交付的 Task,**不是**「先上 V0.1 阉割版以后补」。全部做完 T-136 才 ✅。切片间有依赖(基座先),可并行 subagent + worktree 隔离。

- **a 基座**:`RequestContext + accountId` + client 注入(`x-account-id`)+ `resolveRequestContext` 读入 + 校验属主降级 + 账号切换器 UI(sidebar 下拉 + localStorage + 绑定入口)+ 确认 platform_accounts 建/列/选抖音号全通(激活既有 UI)。
- **b 数据归属下推 + 迁移**:按号隔离表加 `account_id` + repo 门下推(复用 content_calendar 范式)+ service `assertOwnedAccount` 守门 + 默认账号迁移 backfill + 激活 publications/target_platforms 预留列。
- **c 采集 per-account**:authDir 分目录 + login/status/refresh 带 accountId + external_sources/ingestion_runs 加 account_id + 采集结果 stamp（publications/metric_*/audience_signals）。
- **d 定位 + AI per-account**:`creator_profiles` 改 `UNIQUE(user_id, account_id)` + positioning 全消费面 + creative-context reader 按 account + 各 runner 验证。
- **e 验收闭环**:绑 2 个号 → 各扫码各采集 → 各自定位 / 作品 / 数据互不串 → 切号全站数据随切 → 迁移后 71 存量作品归默认号可见。

## 8. 验收标准

- 绑定 ≥2 个抖音号,各自独立扫码登录(`.auth/douyin/<accountId>` 分目录,互不顶号)。
- 切号后:项目列表 / 作品数据 / 定位母版 / 选题 / 复盘 / 知识库**全部只显当前号**,跨号零串味(repo 门 + service 守门双保险)。
- 每号采集只落该号的 publications/指标/评论(account_id stamp 正确)。
- 每号一套独立定位母版(`UNIQUE(user_id, account_id)` 生效,建第二份不再撞唯一约束)。
- AI(选题 / 写稿 / 复盘)按当前号的定位 / 受众 / 经验注入(切号换约束)。
- 存量 71 作品迁默认号后可见、可继续用;未选号 / 旧数据不崩(nullable 兜底)。
- 跨包 typecheck 0 + 各切片单测(repo 门按号过滤 / service 守门跨号 404 / authDir 分目录 / 定位复合唯一 / creative-context 按号)。

## 9. 风险与开放问题(OQ,SPEC 审 + gate 定)

- **OQ1 知识库 / 素材是否 per-account**:用户选「每号完全独立人设」→ 倾向按号隔离(knowledge/assets 加 account_id)。但「同一批金句 / 素材想跨号复用」也合理。**推荐**:按号隔离(独立最纯粹),日后要共享再加「素材跨号引用」而非默认共享。待用户拍。
- **OQ2 ai_conversations/ai_tasks 是否 per-account**:倾向本期 user 级(scope 已预留 `account:<id>` 扩展位,YAGNI 先不启),会话历史不按号切。待定。
- **OQ3 全局 / 跨号总览**:是否要「全部号总览」视图(accountId=null 聚合)?本期默认「必选一个号」,总览列后续。
- **OQ4 迁移默认号 handle**:存量 71 作品归的默认号 handle 由用户填还是占位「我的抖音」?建议引导用户首启填真实号。
- **风险**:①改 `creator_profiles` 唯一约束是数据归属改动(gate 重点,须验不破存量单 profile 用户);②账号维度贯穿全站,漏改某 repo 门 = 跨号串味(用 grep/codegraph 全量核 owned-root 消费点 + 单测锁);③采集登录态分目录后磁盘占用随号数增长(可接受);④「当前账号」server 注入依赖前端带 header,遗漏 = 退化全局(降级安全,但要覆盖所有 client 调用点)。
