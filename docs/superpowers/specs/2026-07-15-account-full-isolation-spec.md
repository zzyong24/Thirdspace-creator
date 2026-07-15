# SPEC:抖音账号全域隔离 —— 切号 = 切整个工作区(T-332)

> `status: draft(待 spec-review gate)`
>
> `date: 2026-07-15`
>
> `代码快照: main@531b962`
>
> **用户拍板 ①(2026-07-15,最高约束):全独立。** 定位、选题、项目、素材、发布中心、自动化任务——每个抖音号一套独立数据,切号后所有页面/任务只见当前号的东西。
>
> **用户拍板 ②(2026-07-15,存量策略):产品未上线,存量数据可全部清掉,用户重绑重拉即可。** 无存量兼容负担:不做认领向导、不做自动归号、不做 NULL 兼容读语义;strict 门干净落地,新数据出生即带 `account_id`。
>
> 本 SPEC 与 [docs/产品定位.md](../../产品定位.md) P-02(「账号是数据归属,不是筛选器」)、R-ACCOUNT 发布验收(「双号全域交叉泄漏为 0」)一致,是 T-326 DATA-H01/H02、GAP-01/GAP-02 的产品语义收口。调研结论与既有文档冲突处以源码为准,冲突已在 §10 标注。

---

## 0. 一句话定义

一个抖音号 = 一个完整独立的工作区(定位、选题、项目、稿件、素材、知识、发布、日历、采集、指标、复盘、经验、校准、AI 会话、自动化任务全套)。切号 = 换工作区;任何普通页面/任务不出现另一个号的数据。工具层(模型 key、存储、偏好、技能配置、激活)是「这台机器上的这个人」的,不随号切。

## 1. AS-IS 现状(源码证据)

### 1.1 三种门语义并存(本 SPEC 要消灭的混乱)

| 语义 | 模块 | 证据 |
|---|---|---|
| **strict**:有号 → `eq(account_id, 当前号)`,NULL 行不可见 | candidate(candidates/audience_signals/topic_promotions/topic_preferences) | `backend/src/modules/candidate/candidate.repository.ts:206-220` |
| | projects | `backend/src/modules/projects/projects.repository.ts:208-209` |
| | learnings / learning_applications | `backend/src/modules/learnings/learnings.repository.ts:104,129` |
| | ai(conversations/tasks) | `backend/src/modules/ai/ai.repository.ts:193,215` |
| | favorites | `backend/src/modules/favorites/favorites.repository.ts:89,244` |
| **lenient**:有号 → `(account_id = 当前号 OR account_id IS NULL)`,存量 NULL 行全号可见 | publishing(列表/聚合读) | `backend/src/modules/publishing/publishing.repository.ts:159-174`(T-326 DATA-H01 修复采用) |
| | analytics(指标聚合读) | `backend/src/modules/analytics/analytics.repository.ts:316-319,402-405` |
| | knowledge | `backend/src/modules/knowledge/knowledge.repository.ts:174` |
| **无门**:repository 完全不感知 accountId | notifications、settings、production | 三个 repository 中 `accountId` 出现次数为 0(grep 实证) |

lenient 门是「存量 NULL 行不消失」的兼容产物(publishing.repository.ts:159-163 注释自述)。**用户拍板 ② 后该前提消失,lenient 门全部退役。**

### 1.2 未选号 = 静默全量(要收掉的退化)

- `ctx.accountId` 缺失时,所有 repo 门返回 `undefined` → `and()` 忽略 → 退化为 user 级全量读(candidate.repository.ts:206-207 注释、publishing.repository.ts:162-163)。
- 前端伪造/失效的 `x-account-id`,服务端验属主失败后**静默降级 `accountId=null`**(`frontend/src/lib/request-context.server.ts:65-93`)→ 变成全账号查询。此即功能地图 GAP-02(`docs/CreatorOS-module-and-workflow-map.md` §9)。
- 当前号只存在于 `localStorage['creatoros:current-account']` + client header,RSC 首屏是 user-only context(GAP-01;`frontend/src/components/shell/account-switcher.tsx` 头注)。

### 1.3 claimOrphans 收编链(T-331 事故根源)

- 绑定抖音号成功 → `bootstrapDouyinCollectionJobs` 第 ⓪ 步 best-effort 调 `claimOrphans(ctx)`(`backend/src/modules/ai-runtime/collection-bootstrap.ts:222-235`),把该 user 名下**所有** `account_id IS NULL` 的存量行无条件收编给新绑的号(publishing 实现见 `publishing.repository.ts:199-206`;同款散布在 scheduling、projects、analytics、assets、ingestion.service)。
- 绑**第二个号**时,这把存量全部错误收编给二号 → 明细腰斩、指标匹配失败(T-331,用户真机 bug)。
- **本 SPEC 裁决:claimOrphans 机制整体退役**(见 §4.4)。清库策略下不存在「待收编的 NULL 行」;T-331 的「按证据回摆修复器」也随之不再需要,T-331 收窄为「立即止血 + 随本 SPEC 退役该链」(见 §7 衔接)。

### 1.4 已就位的基座(不重造)

- `RequestContext.accountId` + `x-account-id` 注入 + 属主硬校验(T-136 切片 a,request-context.server.ts:65-93)。
- 账号切换器 UI(sidebar 下拉 + localStorage + `router.refresh()`,account-switcher.tsx)。
- 按号登录态分目录 `.auth/douyin/<accountId>`(T-136 §D,commit ec91f48)。
- `scheduled_job.account_id`:cron 到点触发时 runtime `ctx.accountId` 由此列派生(`backend/src/schema/scheduling.ts:31-34`)——自动化任务按号执行的机制已在。
- 83 张现役表中,绝大多数按号表已有 `account_id` 列(T-136/T-201/T-326 陆续加齐,见 §3 域清单)。

**缺的不是列,是:统一 strict 语义 + NOT NULL 收口 + 唯一键补账号维 + 未选号语义 + 无门模块补门 + 切号 UX 闭环。**

---

## 2. 目标不变量(TO-BE)

| ID | 不变量 |
|---|---|
| ISO-01 | 每张 per-account 表的每一行都有非空 `account_id`,且指向该 `user_id` 名下真实 `platform_accounts` 行 |
| ISO-02 | 所有 per-account 读(列表/聚合/详情/搜索/组合页)一律 strict:`eq(user_id) AND eq(account_id, ctx.accountId)`;无任何 `OR IS NULL` 兼容分支 |
| ISO-03 | 所有 per-account 写在 service 层强制要求 `ctx.accountId` 非空,写入即 stamp;未选号 → `AccountRequiredError`,不隐式填号 |
| ISO-04 | 无效/越权/已归档的 `x-account-id` → 拒绝(ownership error),**不再静默降级为全量**(关 GAP-02) |
| ISO-05 | 账号级唯一约束全部包含 `account_id` 维度(除 §3 明确标注的平台全局锚) |
| ISO-06 | 自动化任务(scheduled_job/job_run/ingestion_run)的执行 ctx 账号由 job 行派生,采集落库 stamp 与 job 账号恒一致 |
| ISO-07 | 跨号总览不存在隐式路径;将来要做必须是显式 `scope=all` 产品能力(本期不做) |
| ISO-08 | 双号各建同名数据,全域交叉泄漏为 0(R-ACCOUNT 发布验收原文) |

---

## 3. 域清单:83 张现役表逐一裁决

裁决三档:**per-account**(全隔离,行带 `account_id NOT NULL`)/ **父锚继承**(自身不带列,经父实体 ownership 门透传,父已 per-account 即隔离)/ **user 级**(这台机器上这个人的,不随号切)/ **机器级**(单机单行,与用户无关)。

「NOT NULL」列 = 用户拍板 ② 后的 schema 终态裁决(新库直接 NOT NULL;旧库走重置,见 §5)。

### 3.1 用户点名六域(拍板项,不容再议)

| 表 | 裁决 | NOT NULL | 现状与改造点 |
|---|---|---|---|
| `creator_profiles` | per-account | ✅ | 已有列 + `UNIQUE(user_id, account_id)`(positioning.ts:91-93);读门已按号。无改造 |
| `positioning_statements` | per-account | ✅ | 已有列(positioning.ts:51);经 profile 父锚,冗余 stamp 保留 |
| `candidates` | per-account | ✅ | strict 门已在(candidate.repository.ts:208);仅 NOT NULL 收口 |
| `topic_preferences` | per-account | ✅ | 唯一键已含 account(candidate.ts:190 `ux_topic_preferences_identity_v2`);NOT NULL 后 `NULLS NOT DISTINCT` 语义自然退化,可留可简化 |
| `audience_signals` | per-account | ✅ | strict 门已在;**外部 ID 去重键必须升级含 account_id**——现状同一评论被两个号采集会去重到先入库的号(candidate.repository.ts:411 注释自认设计层问题,本 SPEC 拍板:补 account 维) |
| `topic_promotions` | per-account | ✅ | strict 门已在 |
| `topic_attributions` | per-account | ✅ | 列已在(topic-attribution.ts:26);publication 唯一键保持(publication 本身已归号) |
| `projects` | per-account | ✅ | strict 门已在(projects.repository.ts:208);NOT NULL 收口 |
| `project_activities` / `project_stages` / `output_stages` / `tasks` | 父锚继承 | — | 经 project/output 门透传,不加列(现状范式,维持) |
| `project_target_platforms` | 父锚继承 | — | **幽灵列清理**:物理库有 `account_id` 列但 Drizzle 现役对象不建模(数据地图 §6)。裁决:随本 SPEC 的重置世代**删除该幽灵列**(项目已归号,子表无需重复),同时处置 `projects.positioning_statement_id` 幽灵列(同批裁决:删除) |
| `content_outputs` | 父锚继承 | — | 经 project 门 |
| `artifacts` | per-account | ✅ | strict 门已在(artifacts.repository 有 accountGate);子表(versions/relations/script_sections/timeline_segments)父锚继承 |
| `assets` | per-account | ✅ | 门已在(assets.repository 有 accountGate);`asset_files` 父锚继承 |
| `asset_uploads` | user 级 | — | 临时上传会话(assets.ts:31 注释),短命非内容表;**确认落 assets 时 stamp 当前号**。建议维持 user 级(争议点 C-08) |
| `publications` | per-account | ✅ | **lenient → strict**(publishing.repository.ts:169-174 改造);`(platform, external_id)` canonical 锚**保持 user 级唯一、不加 account 维**——一个抖音作品在平台上只属于一个号,加 account 维会允许同作品双锚,破坏 D-OWN-04。写入/采集时断言命中行 account 与 ctx 一致,不一致=数据 bug 报错(争议点 C-09,建议维持) |
| `publication_revisions` | 父锚继承 | — | 经 publication 门 |
| `content_calendar_entries` / `publishing_cadences` | per-account | ✅(已是) | 全仓唯一从出生就 `account_id NOT NULL` 的两张表(content-calendar.ts:32,46)——**这就是 strict 终态范本** |
| `external_sources` | per-account | ✅ | 列已在(ingestion.ts:34);采集源本就按号扫码 |
| `ingestion_runs` | per-account | ✅ | 列已在(ingestion.ts:48);`ingestion_errors`/`ingestion_records` 父锚继承(ingestion.ts:47 注释,维持) |
| `scheduled_job` | per-account | ✅ | 列已在 + runtime ctx 派生机制已在(scheduling.ts:31-34);**自动化页按当前号过滤 = 用户点名验收**;绑号 bootstrap 建的 6 类采集 job 全部账号绑定,无全局 job 现实需求 |
| `job_run` | 父锚继承 | — | 经 job 门;GAP-08 的 `(job, scheduledFor)` 唯一约束随 S1 一并落(job 已含号,无需重复) |

### 3.2 你要我建议裁决的域(推荐 + 理由;争议项进 §9 给 gate)

| 域 / 表 | 建议裁决 | NOT NULL | 理由 |
|---|---|---|---|
| **知识库** `knowledge_items`(+`revisions`/`relations` 父锚) | **两案,推荐 A** | A 案 ✅ | **A 案(推荐):per-account strict。** 理由:①用户拍板「全独立」的字面语义;②T-136 OQ1 用户已裁「知识库按号独立」(2026-07-05,multi-account SPEC §9);③列已在、门已在(只是 lenient,knowledge.repository.ts:174),改 strict 成本最低;④知识是选题/写稿的 AI 注入源,跨号共享会让 A 号的素材味道渗进 B 号的稿子——正是用户要杜绝的「串味」。**B 案:user 级共享 + 后续做「跨号引用」。** 理由:同一个人运营两个号,方法论/参考资料天然复用,per-account 会逼用户重复录入。**推荐 A**:先纯粹隔离,复用需求出现时再做显式「跨号引用/复制」(列入不做清单),而非默认共享。→ 争议点 C-01 |
| **课程** | 不存在此域 | — | 全仓 schema/contract 无 course/课程表(grep 实证)。若用户指「课程类学习资料」,即知识库条目,随 knowledge 裁决;若指未来功能,超出本 SPEC。→ 已向用户澄清语义,SPEC 不留空槽 |
| **模型配置/设置** `model_configurations` / `user_preferences` / `storage_configs` / `agent_configurations` | **user 级** | — | 用户倾向一致:模型 key、存储、Agent 凭据是「工具」,换号重配是纯负担;与 T-136 §B 原判一致。`(userId, capability)` 唯一键不动 |
| **技能配置** `skill_config_overrides`(+`versions`) | user/机器级 | — | prompt 模板是全局工具配置(T-136 gate MINOR-4:「提示词是 user/全局级,注入的数据才 per-account」)。维持 |
| **benchmark 对标源** `benchmark_sources` / `benchmark_works` | **per-account** | ✅ | 「哪个号在对标谁」是定位的一部分(benchmark.ts:11 注释自述);列已在。**唯一键升级**:`ux_benchmark_sources_identity (user_id, platform, external_account_id)`(benchmark.ts:102)→ 加 `account_id` 维——两个号对标同一博主是合法场景,现约束会撞。works 的 aweme 唯一键同步升级 |
| **trend 源** `trend_sources` | **per-account** | ✅ | 列已在(trend-sources.ts:22);**唯一键升级**:`ux_trend_sources_identity (user_id, url)`(trend-sources.ts:48)→ 加 `account_id` 维——数据地图 4.3 已标注此缺口 |
| **通知** `notifications` | **per-account stamp + 设计性 nullable** | ❌(唯一例外) | 通知内容多为账号域事件(采集失败、任务完成),必须 stamp `account_id` 并按当前号过滤,否则 A 号铃铛里响 B 号的失败;但**系统级通知**(激活到期、版本更新)与号无关,`account_id=NULL` 表示「全局,所有号可见」。读语义 = `当前号 OR NULL`——这是全仓**唯一**允许的 OR-NULL,且是设计语义而非存量兼容,必须注释区分。→ 争议点 C-02 |
| **日历** `content_calendar_entries` | per-account(已是) | ✅ | 见 §3.1,无改造 |
| **复盘/经验** `reviews` / `review_insights` / `learnings` / `learning_applications` / `review_publications` | **per-account** | ✅(review_publications 父锚) | 列已在、learnings 门已 strict;经验回流是「切号换脑子」的核心——PRD JTBD-6 原文「只使用属于当前账号的经验,避免跨号串味」 |
| **校准** `rubrics` / `rubric_versions` / `predictions` / `calibration_results` / `calibration_rule_suggestions` | **per-account** | ✅ | 列已在(calibration.ts:32-96);每号一套打分口径,校准闭环 per 号(schema 注释自述) |
| **收藏** `favorites_folders` / `favorites_items` | per-account(已是) | ✅ | T-326 DATA-H02 已升级唯一键含 account(favorites.ts:75,95);仅 NOT NULL 收口 |
| **AI 会话历史** `ai_conversations` / `ai_tasks`(children 父锚) | **per-account** | ✅ | T-136 OQ2 用户已裁「切号=换对话桶」;strict 门已在(ai.repository.ts:193,215);NOT NULL 收口。0 账号时 ChatBox 的可用性见 §4.2 裁决 |
| **搜索投影** `search_documents` | **per-account** | ✅ | T-136 gate MAJOR-4 已裁(跨号搜到别号内容=串味);列已在(search.ts:25);投影可重建,重置后按号重 stamp |
| **搜索历史** `search_history` | user 级 | — | 工具性行为记录,单机单人风险低;搜索**结果**已按号隔离即可。→ 争议点 C-06(低优) |
| **标签** `tags` / `entity_tags` | **user 级词表** | — | 标签字典是轻量词表,per-account 会逼两个号重复维护同名标签;`entity_tags` 绑定的实体全部 per-account,展示天然隔离(打了标签的东西只在其归属号可见)。→ 争议点 C-04 |
| **稿面审核规则** `review_rules` | user 级 | — | 审核规则(违禁词/平台红线)是创作合规工具,跨号通用;号定制需求出现再加 per-account 覆盖层。→ 争议点 C-05 |
| **制作** `productions` / `production_segments` / `segment_assets` / `export_records` | 父锚继承 | — | 自身只有 userId(production.ts),但唯一入口是 content_output → project,project 门已 strict,链路天然隔离;不加列(避免冗余 stamp 漂移)。执行产物确认落 `assets` 时按 ctx stamp 号 |
| **身份/激活** `users` / `sessions` / `activation_state` | user 级 / 机器级 | — | 身份根,不隔离 |
| **平台账号册** `platform_accounts` | user 级 | — | 账号注册册本身(切换器的数据源),不能按号隔离自己 |
| **限流** `douyin_throttle_state` | 机器级 | — | 限流是平台对本机/IP 的约束,channel 主键全局共享正确;两号并发采集共享退避预算是**物理事实**,不随隔离改(风险见 §8) |

### 3.3 域清单摘要

- **per-account(strict + NOT NULL)**:44 张表(§3.1/3.2 标 ✅ 者)+ 其父锚子表约 24 张 = 创作数据全量。
- **user 级**:users、sessions、platform_accounts、user_preferences、model_configurations、storage_configs、agent_configurations、skill_config_overrides(+versions)、tags、entity_tags、review_rules、search_history、asset_uploads、notifications(stamp+设计性 nullable)。
- **机器级**:activation_state、douyin_throttle_state。
- **5 张变现历史表**(products/offers/leads/conversion_events/content_output_products):冻结不动,重置世代随库消失,不进隔离改造。

---

## 4. 读写路径改造原则

### 4.1 strict 门全面统一(替代 lenient)

- **裁决:全仓 per-account 读一律 strict** `eq(account_id, ctx.accountId)`,以 candidate(candidate.repository.ts:206-220)/ content-calendar 为范本。
- 退役 lenient 的三处:publishing(publishing.repository.ts:169-174)、analytics(analytics.repository.ts:316-319,402-405 及 123 行起的聚合读)、knowledge(knowledge.repository.ts:174)。删除 `or(..., isNull(...))` 分支及其「存量 NULL 行不消失」注释——前提已被拍板 ② 废除。
- 通知是唯一例外(设计性 OR-NULL,§3.2),注释必须写明「设计语义,非存量兼容」。

### 4.2 ctx.accountId 缺失(未选号)语义 —— 裁决

**裁决:未选号 = 引导态,创作域禁读写;不存在「未选号 = 全局视图」。**

- **0 个账号**(新用户/全删了):所有 per-account 页面显示绑定引导(接 T-131 引导 + `/accounts`);per-account 写 → `AccountRequiredError`(新错误码,前端翻译成绑定引导,不是红色报错)。
- **有账号但未选**:切换器已保证自动选第一个 active(T-136 §E ②③,account-switcher.tsx 的 `resolveCurrentAccount`)——正常路径下「有号必有当前号」,未选号只剩 localStorage 失效等边缘,行为同上引导态。
- **服务端**:per-account service 写路径入口统一断言 `ctx.accountId` 非空(现状 T-136 gate MAJOR-3 已定「repo.create 无当前号时报错」,本 SPEC 把它从「部分模块」扩展为「全部 per-account 模块」+ 读路径同样禁全量)。
- **全局视图**:彻底移除隐式全量读路径。跨号总览若将来要做 = contract 显式 `scope: "all"` 参数 + 独立页面(本期不做,见 §8.2)。
- **ChatBox 0 号语义(争议点 C-07)**:建议 0 账号时 ChatBox 可打开但提示「绑定抖音号后开始」,不允许创建会话(ai_conversations.account_id NOT NULL 的自然推论);gate 若认为 0 号也该能闲聊,则该表退回 nullable——推荐前者,保持 schema 干净。

### 4.3 无效 accountId:拒绝而非降级(关 GAP-02)

**裁决:`x-account-id` 验属主失败(不存在/越权/已归档)→ 拒绝请求(ownership error 404 语义),不再静默降级 `accountId=null`。**

- 现状降级(request-context.server.ts:88-93)在「null=全量」世界里是**越权放大器**(伪造 header 反而看得更多);在 strict 世界里降级=引导态,虽无泄漏但会把切号后的失效号伪装成「没数据」,不诚实。拒绝 + 前端捕获后自动回落到第一个 active 号并提示,才是诚实语义。
- 已归档(archived)账号:数据保留(PRD R-ACCOUNT「账号失效保留本地数据」),但不可作为当前号发起读写;重新激活后数据原样回来。

### 4.4 claimOrphans 全链退役

**裁决:删除「绑定时收编 NULL 行」机制全部调用点**——collection-bootstrap.ts:222-235 的第 ⓪ 步、publishing/scheduling/projects/analytics/assets 各 repo 的 `claimOrphan*` 方法、ingestion.service 的调用。清库世界没有孤儿;新数据出生即带号(ISO-03),不存在「先落 NULL 再认领」的窗口。

### 4.5 by-id 读是否上号门 —— 裁决

**裁决:上「号一致性门」——by-id 读命中行后校验 `row.account_id === ctx.accountId`,不一致 → OwnershipError 404(与跨 user 同语义)。**

- 现状 publishing 有意不加(publishing.repository.ts:164-168:怕误伤 ingestion 内部读和 UI 深链)。逐条消解:
  - **ingestion 内部读**:采集 runtime ctx 的账号由 job 行派生(ISO-06),读写恒同号,门不误伤;
  - **UI 深链**(切到 A 号后打开 B 号项目的收藏链接):404 + 空态提示「该内容不属于当前账号」是**正确的产品行为**(全独立语义下,B 号内容在 A 号工作区就该不存在)。可选增强:空态附「去 B 号查看」动作——需要一个 `resolveEntityAccount` 探测 op,建议本期不做(泄露跨号存在性 vs 便利,单机产品便利优先时再议)。→ 争议点 C-03
  - **`findByExternalKey`**(publishing.repository.ts:167-168 担心的幂等锚):保持 user 级读(canonical 锚是平台事实,见 §3.1 publications 行),但命中后断言 account 一致性,不一致按数据 bug 报错,绝不静默。
- 安全收益其次(id 不可枚举,user 级已是边界),**语义一致性是主因**:strict 列表 + user 级详情 = 「列表看不见但 URL 能打开」的裂缝,双号验收(ISO-08)堵不住。

### 4.6 写路径 stamp 原则

- 所有 per-account insert 由 service 从 `ctx.accountId` stamp,repo 不接受调用方显式传号(防绕过);
- 自动化/采集写:runtime ctx 从 `scheduled_job.account_id` / `ingestion_run.account_id` 派生(机制已在,scheduling.ts:31-34),禁止任何「无号 ctx 落库」路径;
- AI 采纳/确认门物化(candidate/artifact/asset/learning):沿用发起任务时的 `ai_tasks.account_id`,确认时二次校验与当前 ctx 一致,不一致 → 拒绝并提示切号。

---

## 5. 存量数据:无兼容负担(拍板 ② 落地)

### 5.1 原则

- **不做**认领向导、**不做**自动归首号、**不做**永留 NULL 全局可见、**不做** lenient 兼容读。T-331 原计划的「按证据回摆修复器」同步作废(残留 NULL 行随重置消失)。
- 落地方式 = **用户清库重来**:清库(或一键重置)→ 重绑账号 → 重拉数据,新数据出生即带 `account_id`(ISO-01/03)。

### 5.2 schema 终态

- §3 标 ✅ 的表:`account_id TEXT NOT NULL`。新库(重置后跑全量迁移)直接成立;**推翻 T-136 §6 gate MAJOR-3「nullable 是稳定终态」裁决**(其前提是「兜底存量 + 全局视图」,两者均已被拍板 ② 和 §4.2 废除),§10 已登记该取代。
- 通知保持 nullable(设计语义,§3.2)。
- 迁移写法:新迁移(0041+)对 per-account 表 `SET NOT NULL` + 唯一键升级(benchmark_sources、trend_sources、audience_signals、benchmark_works)+ 幽灵列清理(project_target_platforms.account_id、projects.positioning_statement_id)。

### 5.3 未重置旧库的防线(不炸启动)

装机版真实数据库若**未重置**就升级:`SET NOT NULL` 遇 NULL 行会迁移失败。裁决:

- 迁移 0041 **前置 guard**:检测 per-account 表存在 `account_id IS NULL` 行 → 迁移**明确中止**(带可读错误「本版本要求重置数据:设置 → 重置工作区」),**绝不**自动删行、绝不自动换空库(守 T-326 DATA-H09 / 数据地图 D-G08:原库目录不改名,给恢复入口)。
- 迁移幂等:重置后的新库无 NULL 行,guard 直接通过;重跑安全。

### 5.4 清库操作的产品形态 —— 建议

**推荐:设置页「重置工作区」一键入口**,而非让用户手删数据目录:

1. 设置 → 存储/危险区:「重置全部数据」按钮,二次确认(输入确认词),可选「先导出备份」(复用既有备份/导出说明,PRD NFR-PRIVACY);
2. 执行 = 关闭 DB 连接 → 数据目录整体改名归档(`data → data.bak-<ts>`,保留一份可手动恢复)→ 重启走首启流程(激活态保留,`activation_state` 机器级不清);
3. 重启后进入 0 账号引导态(§4.2)→ 绑号 → bootstrap 采集重拉。
4. 手删数据目录作为兜底逃生舱写进故障排查文档,不是主路径(桌面用户找不到 appData 目录)。

理由:产品未上线,当前「用户」即开发者本人,但重置入口本身是 R-DESKTOP「数据恢复」验收的一部分,做一次长期有用;整目录归档改名满足「失败不丢原数据」。

---

## 6. 切号 UX

### 6.1 切换器行为

- **保持现状机制**:写 localStorage + `router.refresh()`(account-switcher.tsx)——不做整页 hard reload。但验收标准升级:refresh 后**所有**账号级数据面(含 RSC 首屏、client 组件、打开着的弹窗/抽屉)必须反映新号;凡 refresh 覆盖不到的本地缓存态(如组件内 state 持有的旧号实体)必须随 `accountsChanged` 事件(既有 `useAccountsChanged`)失效重取。
- **GAP-01 收口**(衔接 T-328 W2b):当前号写入服务端可读 session/cookie,RSC 与 RPC 共用同一 context resolver——否则「首屏 user 级、水合后按号」的闪烁永远修不干净。
- 切号时正在跑的**前台**操作(表单未保存、AI 生成中):切换器弹确认「有进行中的操作,切号会离开当前页面」;**后台**任务(scheduled job、production 渲染)归属由创建时 stamp 决定,不受切号影响,继续跑、完成后归原号。

### 6.2 每页空态(新号无数据)

新绑的号全域是空的,每个 per-account 页必须给「这个号从零开始」的引导,不是干瘪的 0:

| 页面 | 空态动作 |
|---|---|
| 首页驾驶舱 | 「完成这个号的定位」+「等待首轮采集完成」(bootstrap 采集进度真实展示) |
| 定位 | 创建入口(现状已有,确认按号触发) |
| 选题 | 区分「采集作业未跑/已跑无信号」(PRD R-TOPIC 空态原文),给「跑一次采集」入口 |
| 项目 | 「新建项目 / 从选题立项」 |
| 知识库/素材 | 录入/上传入口(若 gate 裁 A 案,提示「知识库按账号独立」) |
| 发布中心/日历 | 「登记第一条作品」+ 等待日拉 |
| 自动化 | 显示绑号 bootstrap 自动建的 6 个 job(按当前号过滤),而非空列表 |
| 复盘/经验 | 「发布并采集到数据后开始复盘」 |

### 6.3 自动化页按当前号过滤(用户点名)

- job 列表 / run 历史 / 「立即运行」全部 strict 按 `ctx.accountId`;
- job 行上显示归属号 badge(即便列表已过滤,运行详情/通知里要能看出是哪个号的任务);
- 通知铃铛按 §3.2 语义过滤(当前号 + 系统级)。

### 6.4 跨号操作明示

全独立世界里唯一合法的「跨号感知」入口:

- 切换器下拉本身(列出所有号 + 各号 needs_reconnect 状态);
- 深链 404 空态的「该内容不属于当前账号」提示(§4.5);
- 通知里带号 badge 的账号级事件(点击先切号再跳转,弹确认)。
- 除此以外任何页面出现第二个号的数据 = 验收失败。

---

## 7. 任务拆分建议(给 BACKLOG;每片一次做完,禁多阶段)

依赖序:S1 → S2 → {S3, S4 可并行} → S5 → S6(S5 依赖 S1 的 guard 语义,但实现可与 S3/S4 并行)。

| 切片 | 内容(咽喉/文件簇) | 依赖 |
|---|---|---|
| **S1 schema 收口迁移** | 新迁移:per-account 表 `SET NOT NULL`(§3 ✅ 清单)+ 前置 NULL guard(§5.3)+ 唯一键升级(benchmark_sources/benchmark_works/trend_sources/audience_signals 补 account 维)+ job_run `(job, scheduledFor)` 唯一(GAP-08 顺手)+ 幽灵列清理(project_target_platforms.account_id、projects.positioning_statement_id)+ Drizzle schema 对齐。文件簇:`backend/drizzle/0041+`、`backend/src/schema/*` | — |
| **S2 backend strict 门统一 + claimOrphans 退役** | ①lenient → strict:publishing.repository、analytics.repository、knowledge.repository;②无门补门:notifications(stamp + 设计性 OR-NULL)、production 链路核验(父锚闭合);③全 per-account service 写入口 `AccountRequiredError` 断言;④by-id 号一致性门(§4.5)+ findByExternalKey 一致性断言;⑤删除 claimOrphan* 全链(publishing/scheduling/projects/analytics/assets/ingestion.service/collection-bootstrap)。文件簇:`backend/src/modules/*`(按模块可再并行拆,worktree 隔离) | S1 |
| **S3 账号上下文咽喉收紧** | ①无效/归档 `x-account-id` → 拒绝不降级(request-context.server.ts);②当前号入服务端可读 session,RSC/RPC 同 resolver(GAP-01,衔接 T-328 W2b,若 W2b 已做则此片只做对齐验证);③`AccountRequiredError` contract 错误码 + client 端翻译。文件簇:`frontend/src/lib/request-context.server.ts`、`frontend/src/lib/http-transport.ts`、contract error 定义 | S2 |
| **S4 前端切号 UX 闭环** | 切换器确认弹窗 + accountsChanged 全面失效重取 + 每页空态矩阵(§6.2)+ 自动化页按号过滤与 badge + 通知过滤 + 深链 404 空态文案 + 0 号/未选号引导态。文件簇:`frontend/src/components/shell/*`、各 feature 页 | S2(可与 S3 并行) |
| **S5 一键重置** | 设置页「重置工作区」:二次确认 + 可选导出 + 目录归档改名 + 重启首启引导(§5.4)。文件簇:settings 页 + 本地 route + Tauri 侧配合 | S1(guard 文案指向它) |
| **S6 双号端到端验收** | 双号各建同名全域数据(定位/选题/项目/知识/素材/发布/采集/复盘/经验/AI 会话/自动化)→ 逐域断言交叉泄漏 0;切号首屏一致;深链 404;伪造/归档号拒绝;未选号引导;重置后重绑重拉全链跑通。吸收 T-136R(双号真机端到端)并将其关闭 | 全部 |

**与进行中任务的衔接:**

- **T-331(claimOrphans 错误收编)**:止血部分(绑二号不再收编)被 S2 的「claimOrphans 全链退役」完全覆盖;「按证据回摆修复器」在拍板 ② 下作废——建议 T-331 直接收窄合入 S2,用户机器上已污染的数据走 S5 重置,不写修复器。另:BACKLOG 存在**两条 T-331**(claimOrphans bug 与技能配置页诚实化),编号冲突需主会话修账。
- **T-328 W2b(DATA-H01/H02)**:已落的 lenient 门(d7327c4)是 S2 的改造对象而非终态;W2b 若尚在做「服务端账号 session」,与 S3 ② 同一件事,认领去重。
- **T-136R**:被 S6 吸收关闭。

---

## 8. 风险与不做清单

### 8.1 风险

| 风险 | 缓解 |
|---|---|
| 漏一处 repo 门 = 串味(账号维贯穿 31 模块) | S2 用 codegraph/grep 全量核每张 per-account 表的读写点 + S6 双号逐域断言;lint/测试层加「per-account 表查询必须含 accountId 条件」的约定测试(能自动化的部分) |
| 未重置旧库升级 → 迁移中止 | §5.3 guard + 可读错误 + S5 重置入口;绝不自动清行/换空库 |
| strict 后内部链路误伤(采集/确认门跨 ctx) | ISO-06 派生 ctx + AI 确认二次校验(§4.6);S2 对 ingestion/ai-runtime 调用链专项回归 |
| 两号并发采集共享限流预算(douyin_throttle_state 机器级) | 物理事实,不改;automation 页诚实展示「因限流排队」,不伪装成号间故障 |
| `router.refresh()` 覆盖不到的客户端缓存态 | S4 以 accountsChanged 事件统一失效;S6 验收「切号后打开着的每个面」 |
| 每请求 assertOwnedAccount 查库开销 | 单机 PGlite 索引读,量级无虞;若组合页放大,可在 request 生命周期内 memo(实现细节,不进 SPEC 约束) |
| 通知 OR-NULL 被误当兼容语义复制 | 唯一例外点注释写明设计语义;code review 检查项 |

### 8.2 本 SPEC 明确不做

- **多平台账号泛化**:只做抖音号;contract 的 platform 枚举保留但不宣称适配(PRD §2.3)。
- **跨号总览/聚合视图**(显式 `scope=all`):移除隐式全量后,总览是将来独立产品能力。
- **知识/素材跨号引用、复制、迁移工具**:先纯隔离;复用需求真实出现再立项。
- **号间数据搬家**(把 A 号项目移给 B 号)。
- **存量数据认领/回摆/自动归号**(拍板 ② 废除)。
- **团队/多用户/云同步**(PRD §16)。
- **深链「去 B 号查看」跳转动作**(§4.5,列观察项)。

---

## 9. 需要 gate 特别裁的争议点清单

> **最终裁决(2026-07-15 用户 /goal 全力推进)**:C-01=**A 案(知识库独立)**、模型配置=**共享(user 级)** 为用户显式拍板;C-02~C-09 用户授权按本 SPEC 推荐案定案(下表「本 SPEC 推荐」列即最终裁决)。全部争议点已裁,S3/S4/S6 解除 hold,可开工。spec-review minor #4 的历史裁决覆盖关系见 §10。

| # | 争议点 | 本 SPEC 推荐 = **最终裁决** |
|---|---|---|
| C-01 | 知识库 A 案(per-account strict)vs B 案(user 级共享+跨号引用) | **A 案**(用户「全独立」字面语义 + T-136 OQ1 既有裁决 + 改造成本最低) |
| C-02 | 通知:per-account stamp + 系统级 NULL 全局(设计性 OR-NULL)vs 纯 user 级不隔离 | **前者**(A 号铃铛不响 B 号的错) |
| C-03 | by-id 读上号一致性门(跨号深链 404)vs 维持 user 级(现状) | **上门**(strict 列表 + user 级详情 = 语义裂缝) |
| C-04 | tags 词表 user 级 vs per-account | **user 级**(词表工具性;绑定实体已隔离) |
| C-05 | review_rules(稿面审核规则)user 级 vs per-account | **user 级**(合规规则跨号通用) |
| C-06 | search_history user 级 vs per-account | **user 级**(低价值,单机单人) |
| C-07 | 0 账号时 ChatBox 禁建会话(ai_conversations NOT NULL)vs 允许闲聊(退回 nullable) | **禁建 + 引导绑号**(schema 干净) |
| C-08 | asset_uploads 临时会话 user 级(确认落库时 stamp)vs 直接 per-account | **user 级**(短命非内容表) |
| C-09 | publications `(platform, external_id)` 唯一锚保持 user 级(不加 account 维) | **维持**(平台事实唯一,加号维会允许同作品双锚破坏 canonical) |

## 10. 与既有文档/裁决的冲突登记(以本 SPEC 为准处)

| 被取代项 | 原口径 | 本 SPEC 口径 | 依据 |
|---|---|---|---|
| T-136 SPEC §6 gate MAJOR-3 | 「account_id nullable 是稳定终态(兜底存量+全局视图)」 | per-account 表 NOT NULL 终态 | 拍板 ②(存量可清)+ §4.2(无隐式全局视图) |
| T-136 SPEC §E 退化 ③ | 「明确全局视图时 accountId=null → repo 不过滤」 | 未选号=引导态禁读写;全局视图必须显式 scope | 拍板 ① + PRD P-02 |
| 数据地图 D-OWN-02 | 「accountId=null 只允许表示迁移期全局/未绑定数据」 | per-account 表不允许 NULL(通知除外,设计语义) | 拍板 ② |
| T-326 DATA-H01 修复(d7327c4)的 lenient 门 | 「当前号 OR 未标记」+ claimOrphan 逐步收编 | strict 门 + claimOrphans 退役 | 拍板 ②;lenient 是兼容过渡,非终态 |
| T-331 修复计划 ② | 「幂等修复器按证据回摆错误收编行」 | 作废;走重置 | 拍板 ② |
| request-context 降级语义(T-136 gate BLOCKER-1) | 「属主不符 → 降级 accountId=null」 | 拒绝(ownership error),不降级 | strict 世界里降级不诚实且曾是越权放大器 |

---

## 11. 验收标准(总)

1. 双号各建同名全域数据,逐域(§3 全清单)交叉泄漏为 0;切号后首屏/组件/弹窗全面一致(ISO-08)。
2. per-account 表全行 `account_id NOT NULL` 且属主校验通过;唯一键含 account 维(§3 升级清单)。
3. 伪造/越权/归档 `x-account-id` → 100% 拒绝;未选号创作域读写 → 引导态,无一处静默全量。
4. 跨号深链 → 404 空态;`findByExternalKey` 号不一致 → 报错不静默。
5. claimOrphan* 在代码库中不存在;绑第二个号不改动任何既有行归属。
6. 未重置旧库升级 → 迁移中止 + 可读重置指引,原库目录未被改动;重置 → 重绑 → 重拉全链跑通。
7. 自动化页/通知按当前号过滤;后台任务切号不中断、完成归原号。
8. 跨包 typecheck 0;S2/S3 各门单测 + S6 双号 E2E 全绿。
