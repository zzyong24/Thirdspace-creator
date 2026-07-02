# 产品审计 · 任务中心(/automations)+ 账号管理(/accounts)

> 审计时间 2026-07-02;dev server :3000 真机只读验证(curl 页面 + /api/v1/dispatch 只读 op);代码证据均给 file:line。诚实纪律:未验证的标「未验证」。

---

## 一、/automations 任务中心

### 1. 功能定位

调度采集作业(scheduled_job)的读/管界面(T-007 切片 D6):用户建「周期抓自己作品指标 / 评论 / 作品明细」的定时任务,node-cron 到点自动跑,数据落库喂 Dashboard、选题、复盘。

**与七步流水线的关系**:不在「立项→…→复盘」主干上,是宪法 §7「数据底座(真实创作历史)」的采集入口 —— 复盘/校准/选题消费的真实表现数据由这里的作业持续回灌。**合定位**(飞轮的「采集真实表现」环节,产品定位.md §3/§7)。

**入口**:sidebar「任务中心」(sidebar.tsx:81)。页面可达:`curl -w "%{http_code}" /automations` → 200。

### 2. 区块与交互清单

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| 模板卡 ×3(每天抓指标/评论/明细) | 点击 → 预填打开新建弹窗 | 纯前端预填(automations-island.tsx:1405-1413;模板常量 intent.ts:128-155) | works(真机渲染 3 张,`data-slot="automation-template-card"` ×3) |
| 「新建任务」按钮(顶部 + 空态) | 打开 CreateJobDialog(空白) | 纯前端 | works |
| 新建弹窗:任务名/大白话描述/抓取内容下拉/频率编辑器/目标(选填) | 提交 → `scheduledJobs.create` → router.refresh | island.tsx:1385-1398 → persistence-client SCHEDULING_OPS(:5454)→ scheduling transport → scheduled_job 表 | works(真机:list 返回 3 条用户 7-01 建的作业,非 seed) |
| 频率编辑器(周期/按间隔/单次) | Cadence → cron 编译,预览中文,不露 cron | cadence.ts compileCadenceToCron(纯函数,有单测) | works |
| 意图提示(描述与下拉不符时) | 点击切换 sourceKind | intent.ts classifyIntent 确定性关键词,无 LLM | works(纯前端) |
| 作业名(行内按钮) | 打开运行详情弹窗 | island.tsx:301-308 | works |
| 调度列 chip | cron 反解中文;`title` 属性露原 cron | island.tsx:346-353 | works(与 SPEC §8.1「cron 绝不显示」字面冲突,hover 即露) |
| 上次运行 / 下次运行 列 | 显示 job.lastRunAt / nextRunAt | 字段来自 scheduled_job 表 | **异常:恒显「—」**(见疑似 bug 1) |
| 启用 Switch | → `scheduledJobs.setEnabled` → refresh | island.tsx:1360-1375 → transport(真接线) | works(写路径未真机点验;单测覆盖 automations-island.test.tsx) |
| 「立即运行」按钮 | → `scheduledJobs.runNow` → 打开详情弹窗轮询 | composition wrap persistence-client.ts:3578-3604 → runJobNow → triggerScheduledJob(产 ai_task + job_run,fire-and-forget) | works(真机佐证:job_run 表有同日多条手动触发记录) |
| 「登录抖音」按钮(仅最近 run=needs_reconnect 时替换「立即运行」) | → `ingestion.douyin.login`(headed Chromium 扫码,.auth/douyin)→ 成功后自动 runNow 恢复 | persistence-client.ts:1323-1328 → douyin-cdp loginDouyin | works(真链路;卡真人扫码,代码注释诚实标注,island.tsx:29-30) |
| 限流保护横幅(行内) | 显示网关 cooldown 剩余分钟 | 挂载时读 `ingestion.douyin.throttleStatus`(island.tsx:1331-1358)→ 网关内存镜像 | works(curl 返回真实 channel 态,creator-center lastRequestAt 有值) |
| 运行详情弹窗:历史 run 列表 | `jobRuns.listByJob`(50/页);有 running run 时 2s 轮询 | island.tsx:973-1010 | works(curl 返回真实 run:total 4/7/11) |
| 运行详情:选中 run → 步骤日志 | run.aiTaskId → `listTaskSteps`(ai_task_steps);running 时 2s 轮询 | island.tsx:1013-1053 | works(链路真;步骤内容未逐条验证) |
| 运行详情:错误文案 | run.error 渲染(needs_reconnect 琥珀/failed 红) | island.tsx:1136-1150 | works |

**死按钮/断链:无。** 该页所有可交互元素都接到真 op。

### 3. 数据来源(四桶)

| 数据 | 来源链 | 桶 |
|---|---|---|
| 作业列表(3 条) | scheduledJobs.list → scheduling.transport → scheduled_job 表(用户 7-01 亲建) | real |
| 每行最近 run 状态(needs_reconnect 判定) | 挂载批量 jobRuns.listByJob limit 1(island.tsx:1303-1325) | real |
| 历史 run(状态/新增条数/起止时刻/错误) | jobRuns.listByJob → job_run 表;真机:comments 任务 7 条(最新 itemsNew 219)、明细任务 11 条(itemsNew 73/56/28)、指标任务 4 条(itemsNew 72-73),含 cron 到点自动跑(01:00Z=北京 09:00,与 `0 9 * * *` 吻合) | real |
| 步骤日志 | ai_task_steps 表(runner recordStep) | real(链路;内容未逐条验证) |
| 限流退避快照 | throttleStatus → DouyinRequestGateway 内存镜像(persistence-client.ts:968 组装,:1338 绑定) | real(实时态,不落表) |
| 上次运行/下次运行 列 | scheduled_job.lastRunAt / nextRunAt | real 字段但**永远 null**(无写方,见 bug 1)→ 用户观感等同 fake |
| 模板卡 ×3 | COLLECTION_TEMPLATES 常量(intent.ts:128-155) | hardcoded(UI 配置性质,非数据造假;三张均已翻真可点) |
| 「共 N 个任务」计数 | jobs.length | real |

### 4. 数据流向(写路径)

- 新建 → scheduled_job insert(userId=登录用户)。
- 启用开关 → scheduled_job.enabled update。
- 立即运行 → ai_task insert(taskType=`scheduled.<sourceKind>`)+ job_run insert(running)→ 后台 runScheduledCollection(采集串行闸 [gate-F5],persistence-client.ts:3507-3526)→ 指标/评论/明细落库 + job_run 终态回写 + ai_task_steps。
- 登录抖音 → .auth/douyin storageState(本机文件,不入库)→ 成功后自动触发一次 runNow。
- cron 自动跑:node-cron 每分钟轮询(scheduled-collection-scheduler.ts:235),**调度身份钉 canonical user**(persistence-client.ts:3531-3535);最近 run=needs_reconnect 的作业停跑(:3644)。
- 进程重启扫超时:running 超 30min 标 failed(scheduler.ts:325-342,persistence-client.ts:3609-3622)。

### 5. 疑似 bug

| # | 严重度 | 描述 | 证据 |
|---|---|---|---|
| 1 | high | **「上次运行/下次运行」恒显「—」,与运行详情自相矛盾** —— 建 job 时 nextRunAt 写 null(scheduling.repository.ts:159),此后调度器/runner/任何代码都不回写 lastRunAt/nextRunAt(triggerScheduledJob 只写 job_run,scheduler.ts:94-153;全仓 grep 无 updateJob({lastRunAt/nextRunAt}) 调用,updateJob 仅 scheduledJobs.update transport case 一处且前端未挂)。真机:三作业 job_run 各 4/7/11 条(最新 2026-07-02),列表仍全「—」(curl HTML 实测三行均 `>—</span>`)。讽刺的是 island 已经拉到了每行 latestRun(island.tsx:1303-1325)却只用于 needs_reconnect 判定,不拿 startedAt 兜底显示 | curl scheduledJobs.list(lastRunAt:null×3)+ jobRuns.listByJob(total 4/7/11)+ curl HTML |
| 2 | medium | 「单次」频率语义不真:cron 无单次语义,编译为「每年该月日时分」(cadence.ts:116-123),任务明年会再次自动跑,跑完也不自动 disable。UI 有小字「近似为每年一次」(island.tsx:639-641,诚实)但普通用户大概率忽略 | cadence.ts:121-122 |
| 3 | low | 幂等口径与行为不符:注释称「idempotencyKey=jobId:自然日 天然按天幂等」(scheduler.ts:7),实际双闸只挡 in-flight(闸① 只匹配 status=running,scheduler.ts:107-109;闸② createTask 只命中 in-flight task)——同日前次 succeeded 后再点「立即运行」照样新产 task+run。真机:明细作业今日 5 条 run。行为对用户合理(手动可重跑),但注释/预期口径需改 | scheduler.ts:102-116 + jobRuns 真机数据 |
| 4 | low | 调度器多用户缺口:cron 自动跑以 canonical user 身份 listRunnableJobs,非 canonical 用户建的作业永远只能手动「立即运行」,不会到点自动跑。注释自认「本机单用户起步」 | persistence-client.ts:3528-3535 |

### 6. 设计不合理

| 严重度 | 问题 | 建议 |
|---|---|---|
| high | **无编辑/删除作业**:契约有 scheduledJobs.update(contract scheduling.ts:53-69,可改 name/prompt/schedule/target)但 UI 完全没挂;删除 op 契约层都不存在。建错频率/名字只能「停用+重建」,列表随时间积垃圾任务 | 行内加「编辑」(复用 CreateJobDialog + compileCronToCadence 反解,反解函数已写好但只用于列表显示)+ 契约补 delete 或 archive |
| medium | 首登引导断裂:「登录抖音」按钮只在最近 run=needs_reconnect 后出现 —— 新用户必须先跑失败一次才能发现要扫码;页面级无「未登录」前置提示,也无到设置页绑定卡的链接 | 页顶用 ingestion.douyin.status 探针(已有 op)显登录态徽标 + 一键扫码 |
| medium | 措辞混乱:页标题「任务中心」、表头「作业」、按钮「新建任务」、空态「采集任务」,同一实体三种叫法;且「任务」与系统内 ai_task(AI 任务)撞名,运行详情里又同时出现「job_run/ai_task_steps」双概念 | 统一叫「采集任务」,详情里技术名词降权 |
| low | TopHeader 无标题:resolveRoute 无 /automations 分支走默认(shell-router.tsx:346-349,pageTitle undefined),页面自渲 h1(automations-page.tsx:54-59)—— 与其他中心页(TopHeader 出标题+描述)模式相反 | shell-router 补 /automations 条目,页内 h1 去重 |
| low | schedule chip 的 title 属性 hover 露原 cron(island.tsx:350),与 SPEC §8.1「cron 绝不显示给用户」字面冲突(注释自辩「供 hover 调试」) | 换成人话完整描述或移除 |
| low | TemplateCards 仍保留 disabled/「规划中 · D8a 后开放」渲染分支(island.tsx:1248-1252)但三张模板都已翻真 —— 死分支 | 清理 |

### 7. 待对齐点(与宪法/其他页面)

- 「上次运行 —」与运行详情有记录的矛盾是用户「怪怪的」直接来源之一(诚实原则被字段级 bug 打破)。
- 调度产物(指标/评论/明细)的消费面(Dashboard/选题/复盘)在别的页面组,需对齐「采集了 219 条评论后用户在哪里看到」这条链是否点得穿。
- automations 页内 h1 vs accounts 用 TopHeader 标题,壳层模式二选一。

---

## 二、/accounts 账号管理

### 1. 功能定位

多账号矩阵 registry(七步⑤·§7.1):把发布记录里的 account_reference 自由字符串升级为一等、user-scoped 的账号实体,让每条 Publication/指标可归到真实账号(回答「哪个账号断更了」,与 /calendar 配套)。

**与七步的关系**:发布(⑥)阶段的账号维度支撑。**合定位**:宪法 §8「平台只在发布层选,不在项目层」—— 本页正是发布层的账号台账,不违边界;变现/编辑器无涉。

**页面可达**:200。**但零入口,见设计不合理 1。**

### 2. 区块与交互清单

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| 新增矩阵号表单(平台下拉 6 项/handle/密钥引用/涨粉基线) | 提交 → `accounts.create` → refresh | interactive-region.tsx:85-108 → PLATFORM_ACCOUNT_OPS(persistence-client.ts:5446)→ platform-account.transport(case accounts.create :57)→ platform_account 表 | works(接线真;写路径未真机点验——审计只读纪律) |
| 平台筛选 tabs(全部+6 平台) | client-local 过滤已水合行,无网络 | account-manager-view.tsx:33-38 | works |
| 账号行:平台徽标/handle/密钥徽标(已配置密钥引用/未配置密钥) | 纯显示;密钥只显示「配没配」,绝不显示值 | interactive-region.tsx:210-216(§7.1 卫生合规) | works |
| 「归档」按钮 | → `accounts.archive` → refresh;archived 后本行按钮全 disabled | interactive-region.tsx:182-190/227 | works(接线真;**无确认、无恢复入口**,见 bug 1) |
| 涨粉基线输入 + 「保存基线」 | 合法整数且有变化 → `accounts.update({followerBaseline})` | interactive-region.tsx:169-180 | works(非法输入静默 return 无提示,见 bug 2) |
| 空态文案 | 「还没有账号。新增一个矩阵号…」 | view.tsx:83-89 | works(诚实空态) |

**死按钮/断链:无**(所有交互接真 op)。但注意:契约 update 还支持改 accountHandle/secretReference/status(platform-accounts.ts:51-56),UI 只暴露 followerBaseline —— 建完账号 handle 写错了改不了,只能归档重建(而归档又不可逆)。

### 3. 数据来源(四桶)

| 数据 | 来源链 | 桶 |
|---|---|---|
| 账号列表(当前 2 条) | accounts.list → platform-account.transport(case :42)→ platform_account 表 | 链路 real;**当前内容 = canonical seed**(persistence-client.ts:4750-4775) |
| seed ① `acct-canonical-douyin` @抖音创作者 / 2217 粉 / env:DOUYIN_TOKEN_REF | followerBaseline=DOUYIN_FAN_TOTAL,注释标真实来源(~/.hermes/douyin_stats.db 2026-06-21 快照,persistence-client.ts:4757);handle「@抖音创作者」是**假名占位**;secretReference 是 seed 写死的引用示例 | fixture(内含真实粉丝数、假 handle) |
| seed ② `acct-canonical-bilibili` @AI工程实录 / 8400 粉 | followerBaseline 8400 直接写死,无来源注释(persistence-client.ts:4769) | fixture/hardcoded |
| 密钥引用字段(用户可填) | 存库;**除本页徽标外全仓无消费者**——采集登录走 .auth/douyin storageState(persistence-client.ts:1314-1335),模型密钥走 settings 模块;grep 全仓无解析 platform_account.secretReference 的代码 | 收集即闲置(事实上的 planned 字段,但 UI 未标) |
| 涨粉基线(用户可改) | 有真实消费者:creative-context.ts:135/336 把「平台/handle/粉丝基线」注入 AI 账号画像 brief | real(消费链存在) |

### 4. 数据流向(写路径)

- 新增/保存基线/归档 → platform_account 表(user-scoped,assertOwnedAccount 卫)。
- 下游引用:content-calendar 建条目时经 getAccount ownership gate 校验账号归属(persistence-client.ts:3673-3676);creative-context 读全量账号进 AI brief。
- 本页不触发任何采集/AI。

### 5. 疑似 bug

| # | 严重度 | 描述 | 证据 |
|---|---|---|---|
| 1 | medium | **归档 UI 不可逆且无确认**:点「归档」立即执行(无二次确认);archived 后该行「归档」「保存基线」全 disabled(interactive-region.tsx:227/244),而契约 update 明明支持 status 改回 active(platform-accounts.ts:55)—— 恢复能力后端有、前端没给。误点一下账号就“永久”躺列表里 | interactive-region.tsx:182-190/217-231 |
| 2 | low | 基线/新增表单非法数字静默失败:saveBaseline 对非整数/负数直接 return(interactive-region.tsx:170-172),CreateAccountForm 对非法 followerBaseline 静默丢弃为 undefined(:99-104),均无任何用户提示 | 同左 |

### 6. 设计不合理

| 严重度 | 问题 | 建议 |
|---|---|---|
| high | **零入口孤岛页**:sidebar 导航无「账号管理」(sidebar.tsx:67-84 共 11 项,无 /accounts);全仓无任何 `href="/accounts"` 链接(唯一引用是 shell-router.tsx:169 的 Header 配置)。用户只能手敲 URL —— 页面做了等于没做 | sidebar 增条目,或并入设置页 |
| high | **「账号」概念三处分裂,叙事互相矛盾**:① 本页矩阵号带「密钥引用」(暗示 token 接平台);② 设置页 AccountBindingCard 是抖音扫码真登录态(ingestion.douyin.status,T-032a);③ 发布数据里 accountReference 仍是字符串「@抖音创作者」(douyin-real.ts)。用户无法回答「我的抖音号到底在哪接的、密钥引用和扫码是什么关系」 | 统一账号中心:本页展示扫码登录态徽标,secretReference 要么接真消费要么删 |
| medium | secretReference 收而不用(见数据来源表):表单郑重收集、徽标郑重展示,但没有任何链路消费它 —— 制造「已接通」错觉 | 接真或去掉/标「规划中」 |
| medium | seed 账号 handle 假名:「@抖音创作者」不是用户真实 handle(宪法 §7 要求「替换所有 mock/seed」;粉丝数真、名字假,半真半假最迷惑) | 用真实 handle 重 seed 或首登引导用户改 |
| low | 「涨粉基线」无任何解释(这数字谁消费、怎么算涨粉)—— 实际进 AI 画像 brief,页面只字未提 | 加 helper 文案 |
| low | 契约支持改 handle/secretReference,UI 不给编辑入口;归档账号与活跃账号混排无过滤 | 行内编辑 + 「仅看活跃」开关 |
| low | 平台枚举含 YouTube/X/视频号等 6 平台,但当前只有抖音有真实下游(采集/发布链);其他平台账号建完无任何功能消费 | 未接平台标注「仅登记」 |

### 7. 待对齐点(与宪法/其他页面)

- 宪法 §7「替换所有 mock/seed」:本页 seed 账号(假 handle + bilibili 8400 无源数字)是残留,与「数据底座=真实创作历史」的口径冲突。
- 与设置页 AccountBindingCard、发布中心 accountReference、/calendar(账号维度的排期)四方的「账号」语义需要一次全局统一。
- /calendar 同为 sidebar 未收录路由(shell-router.tsx:177 有配置)—— 「七步⑤」这组页面(accounts+calendar)疑似整体没接进导航,需与导航信息架构对齐。
- 本页 TopHeader 出标题、/automations 页内自渲 h1,壳层标题模式相反(全局对齐项)。

---

## 三、两页横向小结

- **接线成熟度**:两页无死按钮、无假交互,所有控件接真 contract op,链路(FE island → dispatch → composite transport → module transport → pglite/PG)完整 —— 在全产品里属于「做真」程度高的一组。
- **「怪」的根源不在假数据,在断线的细节**:/automations 明明在跑却显示从未运行(bug 1);/accounts 做完了却没有门(零入口),两个字段(密钥引用/涨粉基线)收了没讲清用途。
- **共同模式问题**:后端契约能力(update/恢复/编辑)显著超前于 UI 暴露面;概念命名(任务/作业、账号/绑定/引用)缺全局字典。
