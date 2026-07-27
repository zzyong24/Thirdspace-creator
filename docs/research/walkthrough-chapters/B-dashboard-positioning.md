# 章节 B:首页 Dashboard(引导枢纽) + 定位中心

> 日期:2026-07-26
> 任务:T-528 新用户 0→1 标杆路线 · 功能域盘点分章
> 方法:只读代码盘点(subagent),每条断言附 `file:line`;无证据处标 ⚠️未验证
> 对照:产品宪法 [docs/产品定位.md](../../产品定位.md) §7 记「首页驾驶舱 = 部分实现」「定位 = 已实现主路径」

核心发现:**首页顶部有产品内置的 6 步有序 `OnboardingCard` 引导流,这就是官方的 0→1 主线**;定位中心产出的 5 条 downstreamRules 是所有下游 AI 生成的硬约束注入源。

---

## B-1 首页 / Dashboard(路由 `/` · 侧栏「首页」)

- **如何到达**:侧栏首项 `{ id:"dashboard", label:"首页", href:"/" }`,`frontend/src/components/shell/sidebar.tsx:90`;根路由 `frontend/src/app/(creator)/page.tsx`。
- **主文件**:
  - route:`frontend/src/app/(creator)/page.tsx:22`(Server Component)
  - 主视图:`frontend/src/features/dashboard/dashboard-page.tsx:73`(`DashboardPage`)
  - 常驻引导卡:`frontend/src/features/onboarding/onboarding-card.tsx:114`(client 岛)
  - 0 号降级 VM:`frontend/src/features/dashboard/zero-account-dashboard.ts:34`
  - 零账号引导判定:`frontend/src/components/shell/zero-account-guidance.tsx:33`
- **首次进入(空态)小白看到什么**(全隔离下「0 号」= 未绑任何抖音号):
  1. layout 守卫放行首页:`isZeroAccountAllowedPath("/")` 恒返回 true(`zero-account-guidance.tsx:34`),首页不被整页替换成「去绑定」页,而是自己承接引导流。
  2. 首页 route 的 per-account 读 `getDashboard` 抛 `AccountRequiredError` → 被 catch → 用 `zeroAccountDashboardViewModel()` 降级(`page.tsx:42-45`)。
  3. 顶部渲染 `OnboardingCard`(有序引导流),下方 5 个指标全占位「—」(`zero-account-dashboard.ts:22-28`,诚实空、非「0 播放」假象),6 张卡各自诚实空态。
  - 空态刻意与 fixtures demo 数据分开(`zero-account-dashboard.ts:11-14`),符合宪法「严禁假数据」。
- **主路径**:
  1. 进首页 → `OnboardingCard` 在主内容最顶(`dashboard-page.tsx:99`),标题「上手引导 · 第 N/M 步」+ 进度条(`onboarding-card.tsx:202-207,250`)。
  2. **引导流 6 步有序**(`onboarding-steps.ts:111-176`),按账号全隔离语义排序:
     ① 绑定抖音号(全员第一步,前置门,CTA→`/accounts`)
     ② 配置文本模型(→`/settings?highlight=text-model`)
     ③ 确认起点(卡内二选一 fresh/existing,不跳页,`onboarding-card.tsx:376-401`)
     ④ 后台初始化数据(仅 existing,→`/automations`)
     ⑤ 创建定位(→`/positioning`)
     ⑥ 创建首个项目(→`/projects/new`)
  3. 门控:前一可见步未 done → 后续步置灰 + 锁提示(`onboarding-steps.ts:243-245`),推荐序非硬锁(仍可点)。绑号成功后经 `useAccountsChanged` 广播重拉状态自动解锁(`onboarding-card.tsx:147`)。
  4. 绑号后(有 account),首页读到真实 dashboard VM,渲染问候「早上好,{displayName}!」(`dashboard-page.tsx:87,630`)+ 5 指标一排 + 3×2 网格。
  5. 网格固定 6 卡顺序:继续创作 / 待办 / 热门选题 / 最近发布 / 数据概览 / 创作建议(`dashboard-page.tsx:159-174`)。全新号各卡仍走诚实空态:如「继续创作」空态提示「新账号建议先 完成这个号的定位」深链 `/positioning`(`dashboard-page.tsx:206-221`),「热门选题」空态引导去选题池(`:327-334`)。
  6. 新项目入口:`/projects/new` 深链(触发 intercepting modal,`dashboard-page.tsx:223-233,282-292`)。
- **关键前置依赖**:必须先绑定至少一个 active 抖音号(全隔离,0 号无 per-account 数据空间);文本模型配置是所有 AI 能力地基(`onboarding-steps.ts:128`)。
- **产出 & 衔接**:首页是飞轮枢纽/引导枢纽——各卡与引导步深链到 `/accounts`(绑号)、`/settings`(配模型)、`/positioning`(定位)、`/topics`(选题池)、`/projects/new`(建项目)、`/publishing`(发布)。引导第⑤步 → 定位中心,第⑥步 → 项目主线。
- **⚠️ 未实现 / 占位**:
  - 0 号首页 5 指标是**占位「—」**(`zero-account-dashboard.ts:22-28`),非真实数据——设计如此,非缺陷。
  - 「数据概览」趋势图需连续多日采集才有日序,单点快照下显诚实空态(`dashboard-page.tsx:434-441`)。
  - 「继续创作」缺发布平台值时显「未设置」中性标签,不伪造「多平台」(`:270-271`)。
  - ⚠️未验证:未在真机/浏览器实跑,以上为源码断言;`getDashboard` 的实际 SQL 组装(DashboardQueryService)未深入 backend。
- **归档小结**:首页 = 0 号引导枢纽(顶部 6 步有序 OnboardingCard + 5 指标一排 + 3×2 诚实空态卡),绑号后转为创作飞轮总览,所有卡片深链下游各域;「飞轮」概念以引导文案(脚本→发布→复盘,`onboarding-steps.ts:171`)体现,非独立可视化组件。

---

## B-2 定位中心(路由 `/positioning` · 侧栏「定位中心」)

- **如何到达**:侧栏第 2 项(排在「项目」前,标注为「七步①②上游约束源」),`sidebar.tsx:91-92`;route `frontend/src/app/(creator)/positioning/page.tsx`。
- **主文件**:
  - route:`positioning/page.tsx:21`(Server Component,session-scoped 读)
  - 主视图:`frontend/src/features/positioning/positioning-center.tsx:82`(`PositioningCenterPage`)+ `:135`(`PositioningCenterView`)
  - AI 访谈入口岛:`frontend/src/features/positioning/generate-positioning-island.tsx:19`
  - 编辑/创建抽屉(mutating):`frontend/src/features/positioning/positioning-interactive-region.tsx`(`PositioningDraftDrawer`,upsertProfile + createStatement)
- **首次进入(空态)小白看到什么**:
  - 未选号(含 0 号):route 自兜 `if (!session.ctx.accountId) return <ZeroAccountGuidance/>`(`positioning/page.tsx:30-32`)——不发注定失败的 per-account 读,显「先绑定一个抖音号」引导。
  - 已绑号但无定位(profile===null):`isEmpty` 分支(`positioning-center.tsx:142,155`),SectionCard「账号定位」内提示「还没有账号定位。下游的选题、评分与变现都会以它为约束源」+ 两个入口(见下)。
- **主路径**:
  1. 空态显眼主入口「AI 访谈式带你定位」(`EmptyStateAiCta`,`positioning-center.tsx:170,218-249`),CTA「开始访谈式定位」深链 `copilotDeepLink("positioning","positioning.generate")`——打开 Copilot 定位编导,私教式一问一答(5 问)聊清账号方向,合成第一版定位(`:229-236`)。
  2. 次级入口「手动创建定位」:`PositioningDraftDrawer profile={null}`(`:174-182`),打开草稿抽屉手填。
  3. 草稿抽屉字段(`positioning-interactive-region.tsx`):
     - 画像页——人设 persona(`:320`,占位「把论文变成可运行代码的工程创作者」)/领域/目标人群 audience(`:346`)/差异化/能力清单/内容范围 contentScope(`:394`)/不做什么/核心痛点等 9-facet;
     - 规则页(`initialTab="rules"`)——选题/写稿/项目/禁止/表达 5 条下游规则(`:96,244`)。
     - 提交走 upsertProfile + createStatement(`positioning-center.tsx:16-17`)。
  4. 有定位后(两栏布局,`:190`):左栏「当前定位母版」英雄区(一句话放大 + 9 facet 图标网格 + 关键词/能力/产品锚,`HeroMaster :289`)→ AI 区(`GeneratePositioningIsland :201`)→ 版本历史表(不可变版本链,最新在前,可「复制为草稿」,`HistoryTable :580`);右栏「定位规则(供下游模块使用)」5 条规则卡(`DownstreamRules :442`)。
  5. AI 采纳落库:对话内 `ChatPositioningCard` 采纳时先 upsertProfile(无则创建)再追加一条 AI 版本 statement,一次成型(`positioning-center.tsx:166-169`,`generate-positioning-island.tsx:4-11`)。定位陈述 **append-only、不可变**(`:591,616-617`)。
- **关键前置依赖**:必须已选中账号(`session.ctx.accountId`,`positioning/page.tsx:30`);AI 访谈依赖已配文本模型(引导步②)。
- **产出 & 衔接**:产出 = CreatorProfile(9-facet 画像)+ 版本化定位陈述 + 5 条 downstreamRules。**下游硬约束**:右栏明写「每次 AI 生成(选题/写稿/项目/评分/Copilot)都会把下面这些规则作为硬约束注入」(`positioning-center.tsx:494-496`),即七步③选题及后续的上游约束源。
- **⚠️ 未实现 / 占位**:
  - 空 facet / 空 rule **不渲染**(never invented,`:319,470`)——诚实,非占位假数据。
  - AI 定位入口是**深链到 Copilot 对话**(`positioning.generate` surface),定位本身不在本页内跑任务流;旧的 AdoptCandidateCard 按钮任务流已退役(`generate-positioning-island.tsx:4-11`)。
  - ⚠️未验证:`positioning.generate` 是否真吃「已导入作品画像」反推定位——源码注释声称如此(`onboarding-card.tsx:83-85`),但未追到 backend chat-tools `generatePositioning` 实现,未真机验证。
  - ⚠️未验证:`copilotDeepLink`/prefill 机制(不自动发、仅预填输入框)未跟进 copilot 侧代码。
- **归档小结**:定位中心 = 账号「定位母版」制作台,空态双入口(AI 访谈式对话 / 手动 9-facet 抽屉),产出版本化定位陈述 + 5 条下游硬约束规则,是七步①②的上游约束源,所有下游 AI 生成都注入其规则。

---

## 衔接闭环

首页引导第⑤步与首页「继续创作 / 热门选题」空态均深链 `/positioning`;定位中心产出的 downstreamRules 反向约束下游各创作域(选题/写稿/项目/评分),构成「定位→选题→创作→复盘」飞轮的上游起点。
