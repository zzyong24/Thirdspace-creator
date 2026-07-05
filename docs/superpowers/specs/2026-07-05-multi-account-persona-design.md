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
- **注入链 + 属主硬校验 [gate BLOCKER-1]**:前端 client 每次请求带「当前账号」(HTTP header `x-account-id`,contract-client 统一注入)→ server `resolveRequestContext` 读到后**必须查 `platform_accounts` 确认 `account.user_id === ctx.userId`**,属主不符 / 号不存在 → 降级 `accountId = null` + 记安全日志(**绝不信任前端传的 accountId**;否则伪造 `x-account-id` 指他人号 → repo 门 `eq(account_id)` 直接返他人数据 = 水平越权穿透隔离)。单机部署(T-046 本机主用户,库里通常仅一个 user)下被攻击面小,但此校验是**防御性必做**(也防 accountId 指向越界 / 已删号读到错数据),并为将来多用户 / 云部署守边界。验收 §8 含越权测试。

### §B 表归属分类(按号隔离 vs user 级共享)

**原则**:「人设 / 内容 / 该号真实表现」按号隔离;「本机系统配置 / 身份 / 派生索引」user 级共享(换号不必重配)。

- **按号隔离(加 `account_id`)**:`projects`、`artifacts`、`assets`、`knowledge_items`(+`revisions`/`relations`)、`candidates`、`audience_signals`、`topic_promotions`、`learnings`(+`applications`)、`reviews`(+`insights`)、`calibration.*`、`creator_profiles`(改约束,§C)、`positioning_statements`、`external_sources`、`ingestion_runs`、`metric_snapshots`/`metric_values`/`retention_points`/`audience_snapshots`;`publications` / `project_target_platforms` **激活已预留列**。
- **user 级共享(不加)**:`users`、`sessions`、`platform_accounts`(账号注册册本身)、`user_preferences`、`model_configurations`、`agent_configurations`、`storage_configs`(模型 / 密钥 / 偏好换号复用)、`notifications`、`scheduled_jobs`。
- **[gate MAJOR-4] `search_documents` 改按号隔离**(从共享移出):虽派生可重建,但按 user 共享会让搜索**跨号串味**(在科技号里搜到美食号内容),与「切号只显当前号」验收(§8)矛盾。故 `search_documents` 加 `account_id`,搜索按 `ctx.accountId` 过滤;启动重建投影时按号 stamp。
- **[gate MAJOR-2] UNIQUE 约束边界**:**仅 `creator_profiles` 需 `UNIQUE(user_id, account_id)`**(每号最多一套定位母版);其余内容表(projects/artifacts/learnings/candidates…)只加 `account_id` 列、**不加 account 维 UNIQUE**(同号下允许多条同类,如一个号多个项目)。
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
- **存量迁移(71 真作品)—— 自洽有序 [gate BLOCKER-2 / MAJOR-1/3/5]**:迁移脚本**自包含,不依赖 T-135 或外部执行顺序**——
  1. **脚本内先**为每个「有内容但无默认号」的 user 建一条默认 `douyin` platform_accounts(handle 占位 `待完善`,T-131 引导用户改真实号,见 §F / OQ4);
  2. **在旧 `UNIQUE(user_id)` 仍生效时**先 `ADD COLUMN account_id`(nullable)+ backfill 各按号隔离表 `account_id = 该 user 默认号`(旧唯一约束保证 `creator_profiles` 每 user 单条 → backfill 单条→单号,**不会撞复合 UNIQUE**;这是消解 MAJOR-1「多 profile 撞唯一」的关键顺序:先 backfill 再换约束);
  3. **backfill 完成后**再 `DROP` 旧 `UNIQUE(user_id)` → 建 `UNIQUE(user_id, account_id)`;
  4. **预检 + 校后**:迁移前 `SELECT user_id, COUNT(*) FROM creator_profiles GROUP BY user_id HAVING COUNT(*)>1` 应为空(现约束保证;非空→报错人工处置);迁移后 `SELECT COUNT(*) FROM creator_profiles WHERE account_id IS NULL` 应为 0。
- **列的最终态 [gate MAJOR-3]**:按号隔离列**保持 nullable**(不强改 NOT NULL —— 兜底存量 / 全局视图 accountId=null);但**代码层 `repo.create` 无当前号时报错**(不隐式填默认号,避免隐式归属 bug)。即「旧行可空、新行必带号」由 **service 层强制**,非 DB 约束;不设「日后统一改 NOT NULL」的隐性计划(nullable 是稳定终态,承载全局视图)。
- **publications / project_target_platforms 措辞澄清 [gate MAJOR-5]**:这两表的 `account_id` 列**已在 `PLATFORM_ACCOUNT_DDL` 预留**(亲验 `platform-account.ts:65-68` 的 `ALTER … ADD COLUMN IF NOT EXISTS account_id`),故对它们**只需激活 service/repo 归属逻辑 + backfill,不再新增列**(迁移里对它们的 `ADD COLUMN IF NOT EXISTS` 是幂等防御,非新增);**其余按号隔离表才是真·新增列**。

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
- **[gate BLOCKER-1 / MINOR-2] 安全 + 退化测试**:①**越权**——请求带 `x-account-id` 指向非本 user 的号 → `resolveRequestContext` 降级 `accountId=null`,不返他人数据(集成测断言);②**退化**——0 个号访问首页 → 引导(T-131);1 个号但 localStorage 无 current-account → 自动选中该号;③一个号采集失败不影响另一号(隔离性);④迁移后 `creator_profiles.account_id IS NULL` = 0、71 作品归默认号可见可续用。

## 9. 风险与开放问题(OQ,SPEC 审 + gate 定)

- **OQ1 知识库 / 素材是否 per-account**:用户选「每号完全独立人设」→ 倾向按号隔离(knowledge/assets 加 account_id)。但「同一批金句 / 素材想跨号复用」也合理。**推荐**:按号隔离(独立最纯粹),日后要共享再加「素材跨号引用」而非默认共享。待用户拍。
- **OQ2 ai_conversations/ai_tasks 是否 per-account**:倾向本期 user 级(scope 已预留 `account:<id>` 扩展位,YAGNI 先不启),会话历史不按号切。待定。
- **OQ3 全局 / 跨号总览**:是否要「全部号总览」视图(accountId=null 聚合)?本期默认「必选一个号」,总览列后续。
- **OQ4 迁移默认号 handle**:存量 71 作品归的默认号 handle 由用户填还是占位「我的抖音」?建议引导用户首启填真实号。
- **风险**:①改 `creator_profiles` 唯一约束是数据归属改动(gate 重点,须验不破存量单 profile 用户);②账号维度贯穿全站,漏改某 repo 门 = 跨号串味(用 grep/codegraph 全量核 owned-root 消费点 + 单测锁);③采集登录态分目录后磁盘占用随号数增长(可接受);④「当前账号」server 注入依赖前端带 header,遗漏 = 退化全局(降级安全,但要覆盖所有 client 调用点)。
- **[gate MINOR-1/OQ4] 默认号 handle**:迁移建的默认号 handle = 占位 `待完善`;T-131 引导**强制**用户填真实抖音 handle(填前 AI 上下文用占位 handle 会降质,引导流程应把「填号名」列为该号可用前提)。
- **[gate MINOR-3] `external_sources` 去重**:同一 `account_id` 下若 `external_source.handle` 出现多条(历史 bug / 重试)→ 保留最新、其余标 deprecated;不同 `account_id` 下相同 handle(同名多号极少见)视为独立源各保留。切片 c 落。
- **[gate MINOR-4] AI skill 层**:§D 的 per-account 只需 `assembleCreativeContext(ctx)` 按 `ctx.accountId` 拉数据(ctx 已透传各 runner),**skill 模板 / 工具白名单 / outputSchema 三位一体不按 account 分**(提示词是 user/全局级,注入的数据才 per-account),故不改 skill 层——合宪法 §9 架构铁律。

## 10. gate 评审处置(MiniMax 独立评审,2026-07-05)

**首轮 verdict = FAIL**(2 blocker + 5 major + 4 minor)。逐条辩证处置(receiving-code-review:采纳真问题,不盲从):

| # | 级别 | 处置 |
|---|---|---|
| BLOCKER-1 | 越权:伪造 `x-account-id` 读他人号 | **采纳** → §A 补 `resolveRequestContext` 属主硬校验(查 platform_accounts 确认 user_id 一致,不属降级 null)+ §8 越权测试。单机下攻击面小但防御必做 |
| BLOCKER-2 | 迁移依赖 T-135 执行顺序会卡死 | **采纳** → §6 迁移改**自包含**(脚本内先建默认号,不依赖 T-135)+ 明确 4 步有序 |
| MAJOR-1 | 存量多 profile backfill 撞复合 UNIQUE | **采纳(澄清顺序化解)** → §6:旧 UNIQUE(user_id) 保证单条,先 backfill 再换约束;加预检 |
| MAJOR-2 | 哪些表要 (user_id,account_id) UNIQUE 不清 | **采纳** → §B 明确:仅 creator_profiles 需,其余不加 |
| MAJOR-3 | nullable→NOT NULL 退出路径不明 | **采纳** → §6:nullable 是稳定终态,新行由 service 层强制带号(非 DB 约束) |
| MAJOR-4 | search_documents 跨号串味 | **采纳** → §B:search_documents 改按号隔离 + 搜索按 account 过滤 |
| MAJOR-5 | publications「已预留」vs「新增」措辞矛盾 | **采纳** → §6:两表列已预留只激活,其余表才新增列 |
| MINOR-1~4 | handle 占位 / 安全+退化测试 / external_sources 去重 / AI skill 层 | **全采纳** → §8 + §9 内联 |

**re-gate = ✅ PASS**(2026-07-05,MiniMax 复审):2 blocker 全消解、5 major 全处置到位、4 minor 全处置、无新引入 blocker/major,方向维持认可。**可进入工程实现。**

**re-gate 附实现期注意项(非阻塞,开工顺手做)**:①迁移建默认账号用 `INSERT … ON CONFLICT DO NOTHING`(防并发启动双建);②sidebar 切换器:localStorage 存的 accountId 已不存在(号被删)时自动清除 + 回落自动选号;③迁移「建号→backfill→换约束」窗口内新写入由 service 强制带号兜住。**实现 gate 三查**:属主校验须在 repo 过滤前执行(原子)、迁移幂等可重跑、全站 owned-root repo 门 account 下推用 grep/codegraph 全量核防漏改。
