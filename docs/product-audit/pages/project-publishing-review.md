# 产品审计 · 项目内发布 + 复盘阶段页

> 审计日期 2026-07-02 · dev server localhost:3000 · 分支 refactor/agent-and-structure
> 方法:宪法(docs/产品定位.md)→ 代码链路(page.tsx → island → op → service)→ 真机只读验证(curl dispatch + SSR HTML + psql 只读)。
> 结论分级:✅works(验证过) / ⚠️部分 / ❌dead(死交互) / 🔍unverified(未验证)。
> 数据四桶:real(真库)/ fixture(canonical/douyin-real 种子)/ hardcoded(组件写死)/ planned(诚实「规划中」)。

验证用样本:
- 真实导入项目:`dy-proj-61`(有 1 条真快照 plays=356)、`project-8639205b-689`(8 条快照 + 3 条真评论)
- canonical demo 项目:`project-ainativebrowser`(DB 无 publication)、`project-podcast-launch`(DB 有 2 条 rawMetrics 为 `{}` 的快照)

---

## 一、/projects/[id]/publishing(发布工作台)

### 1. 功能定位

七步流水线第 6 步「发布(多平台适配)」的项目内工作台:一稿多平台 AI 适配 → 每平台一个 publication 节点 → 编辑标题/标签(revision 追加)→ 确认发布 → 右栏回看各平台指标。定位本身合宪(§4 发布阶段、§8「平台只在发布层选」)。**但页面约 60% 的可见区块是 fixture/hardcoded 装饰**,与「AI 出苦力、人只审改删」的编导体验相距甚远——用户感觉「怪」的重灾区。

代码链路:
`app/(creator)/projects/[projectId]/publishing/page.tsx`(server 读:projects.list → projects.outputs.list → outputs.publications.list → publications.revisions.list → analytics.publications.get / accounts.list)
→ `features/project-publishing/publishing-workspace-data.ts`(VM 装配 + fixture 降级)
→ `publishing-workspace-page.tsx`(server shell)
→ `publishing-interactive-region.tsx`(client 岛,55KB,所有交互)
→ `platform-adapt-island.tsx`(一稿多平台 AI 节点)。

⚠️ **page.tsx 全程用 deprecated 的 canonical-ctx 单例 client**(`publishing/page.tsx:26` import `client`;`lib/contract-client.server.ts:34-51` 明确标注 @deprecated「production 页必须 createServerClient(session.ctx)」)。复盘页已迁 session 作用域,发布页没迁 —— 单用户下无感,多租户即数据泄漏,且是两姊妹页的内部不一致。

### 2. 区块与交互清单

| 区块 | 元素 | 点了发生什么 | 接线 | 状态 |
|---|---|---|---|---|
| 页面 tabs | 发布设置/发布记录/平台管理/批量发布 | 仅本地高亮切换,**页面内容完全不变** | 无(`publishing-interactive-region.tsx:278-307`,activeTab 无任何消费者) | ❌dead(假导航) |
| 基础信息 | 标题输入框 | 可输入;blur/Enter → `publications.revisions.create` 追加新版本 → refresh | op 真接(`:331-350`);demo 项目无 publication 时静默 no-op | ⚠️works 但**提交体 `description:""` 会把真简介从当前版本抹掉**(见 bug P-1) |
| 基础信息 | 简介「输入框」 | 无反应 —— 是个只读 div,带「简介 *」必填星号和 0/2000 字数 | 无(`:386-410`) | ❌dead(伪装成表单) |
| 基础信息 | 封面预览 | 无反应;显示写死的「EP01 / 深度解析 · 13min / AI Native Browser」 | 无(`:466-478` 硬编码,任何项目都显示这套文案) | ❌dead + hardcoded |
| 基础信息 | 标签 chip ×/加标签 | 本地增删 + `publications.revisions.create`(带 platformTags,保留 title/description)→ refresh | op 真接(`:509-626`) | ✅works(真机见 dy-proj-61 显「暂无标签」真值);标题为空时提交 `" "` 占位污染版本流(`:545`) |
| 基础信息 | 分类 / 系列 | 无反应(只读 div) | 显示值:真项目恒为「未分类/无系列」硬编码,**revision 里的真实 category="AI工作流" 不读**(`publishing-workspace-data.ts:450-459`,realForm 只覆 title/description/tags) | ❌dead + 真数据被硬编码遮蔽 |
| 基础信息 | 发布选项 3 个开关(允许评论/保存草稿/通知粉丝) | 本地翻转「开启/关闭」 | 无持久化(`:659-705`,选项集写死 `:132-136`) | ⚠️假开关(刷新即丢) |
| 基础信息 | 更多设置 3 个勾(允许评论/允许弹幕/允许转发) | 无反应(纯展示 span) | 无(`:707-742`,写死 `:138-146`) | ❌dead;且「允许评论」与上面发布选项重复 |
| 一稿多平台 | 「帮我改多平台」 | 起 `publish.platform_adapt` AI 任务 → 轮询 → 采纳全部建发布草稿 | AdoptCandidateCard 候选-确认总线(`platform-adapt-island.tsx`) | 🔍unverified(不触发 AI;链路与其他已验节点同构,采纳→每平台建 publication 合宪「AI 只产候选」) |
| 发布平台 | 平台卡 checkbox | 本地选中/取消(决定确认发布的目标集) | 本地 state(`:767-788`) | ✅works(本地) |
| 发布平台 | 手动加平台 chip(+B站…) | `outputs.publications.create` 建真 publication → refresh | op 真接(`:888-947`) | ✅works;但 accountReference 写的是显示文案「B站 (Bilibili)」而非真实账号 handle(`:914` + `:1021-1041`),与导入数据的「@抖音创作者」口径打架 |
| 发布平台 | 批量设置时间 / 清空时间 / 默认排期 19:30 / 立即发布开关 | **全部无反应** | 无 handler,19:30 写死(`:1043-1077`);连「规划中」标注都没有 | ❌dead(整块装饰) |
| 发布平台 | 确认发布(主 CTA) | ①本地把选中卡状态翻成 published/scheduled + 按钮下方显「已加入发布队列」;②每个选中平台:无 publication 则 create,再 `publications.transition {status:"published"}` → refresh | op 真接(`:795-829`);**后端 publisher 是 MockPublisher**,铸假外部 id `mock:{platform}:{pubId}`,无任何真实平台动作(`backend/src/modules/publishing/platform-publisher.ts:1-16`;`persistence-client.ts:1189`) | ⚠️「真写库的假发布」——DB 状态变 published,平台上啥都没发生;再点一次文案变「已安排发布」(`:805` 状态机 draft→ready→scheduled 与实际无关);无 loading/失败反馈,失败了 UI 也已翻绿 |
| 内容日历 | 7 天格子 | 仅 status="empty" 的格子(写死的周四)可点 → `accounts.calendar.entries.create {plannedAt}` → refresh | 写 op 真接(`:1125-1214`);**但格子内容是写死的 CALENDAR_DAYS(`:174-186`),从不读 `accounts.calendar.list`,建完的条目永远不显示** | ⚠️写真读假:写进 DB 的数据不可见(真机验证 content_calendar_entries 现为空表) |
| 发布前检查 | 3 条 ✓(标题优化合适/封面清晰美观/标签已设置) | 无反应 | 写死永远全绿(`:148-157`, `:1216-1254`),不做任何真实校验 | ❌dead(假检查) |
| 右栏 | 平台预览卡 4 个平台小 tab(B站/抖音/视频号/小红书) | **无 onClick,点了无反应** | 无(`:1279-1293`,data-pressed 仅由服务端首平台决定) | ❌dead |
| 右栏 | 预览卡标题/简介/数字 | 展示 | 数字 real(analytics 最新快照,真机 356 播放/12 赞/1 评);**标题/简介永远取 fixture 占位**——真项目显「预览卡片/暂无内容」,不镜像左侧真标题(`publishing-workspace-data.ts:437-445`) | ⚠️半真半假 |
| 右栏 | 平台指标卡 / 平台对比表 | 展示 | real:`analytics.publications.get` 每发布最新快照聚合(`:208-269`);无数据→诚实「暂无指标」 | ✅works(两态真机各验证过) |
| 右栏 | 发布清单 4 条 ✓ | 无反应 | demo=fixture;真项目 server 端置空(`:484`)**但 client 空则回退写死全绿清单(`:1367`)** | ❌dead + 假(真机 dy-proj-61 显示 4 条全绿) |
| 右栏 | 发布提示 3 条 | 无反应 | 同上回退(`:1550`):真项目也显示「首图包含关键词 "AI 浏览器"」这条 demo 专属提示(真机验证命中) | ❌hardcoded 串台 |
| 右栏 | 查看更多提议 → | 跳 `href="#"` | 死链(`:1578-1584`) | ❌dead |
| 右栏 | 评论区 | 展示「规划中」徽标 | planned(`:1525-1547`) | ✅诚实;但注释理由「contract 无 comments op」已过时——`publications.comments.list` 现已存在且复盘页在用 |

### 3. 数据来源

| 数据 | 来源链 | 桶 |
|---|---|---|
| 平台卡(真项目) | projects.outputs.list → outputs.publications.list → publications 表(user-scoped pglite/PG) | real(dy-pub-61 验证) |
| 平台卡(demo 项目) | DB 无 publication → fixture DEFAULT_PLATFORM_CARDS,排期 **2024-05-18**(两年前)+ 假 hint「AI 优化/AI 生成」(`fixtures/selectors/project-publishing.ts:54-92`) | fixture |
| 表单标题/简介/标签 | 第一个 publication 的 current revision(publications.revisions.list) | real(「未命名作品/抖音作品」验证) |
| 表单分类/系列 | 真项目写死「未分类/无系列」;demo 走 fixture | hardcoded(真值在库里但不读) |
| 封面预览文案 | 组件写死 EP01/AI Native Browser | hardcoded |
| 右栏指标/对比/预览数字 | analytics.publications.get → metric_snapshots.raw_metrics 最新帧 | real(356/12/1 验证) |
| 内容日历格子 | 组件写死 CALENDAR_DAYS | hardcoded |
| 日历写目标 | accounts.list 第一个 active 账号 = **acct-canonical-bilibili(种子账号)**(`publishing-workspace-data.ts:154-171`) | fixture 账号承接真写 |
| 发布选项/更多设置/发布前检查/发布清单/发布提示/tabs | 组件常量 | hardcoded |
| 评论区 | 无 | planned |

### 4. 数据流向(写路径)

- 标题 blur/Enter → `publications.revisions.create {title, description:""}` → 后端 `createRevision` + `setCurrentRevision`(publishing.service.ts:214-231)→ **新版本成为 current,简介被清空**。
- 标签增删 → 同 op(带 platformTags,title/description 原样)→ 正确保留。
- 确认发布 → (无则)`outputs.publications.create` → `publications.transition published` → MockPublisher 铸 `mock:douyin:xxx` 外部 id → publications 表状态变 published。
- 手动加平台 → `outputs.publications.create`。
- 日历空格 → `accounts.calendar.entries.create {plannedAt}` → content_calendar_entries 表(UI 永不回显;plannedAt 恒落在 2026-06-22 那一周 = 过去,因 `page.tsx:30` 固定 weekStart)。
- demo 项目也持有 wiring(outputId 存在)→ **在展示 fixture 卡的页面上点确认发布会往真库写 5 条 publication**(fixture 展示 + 真写库混流)。

### 5. 设计不合理

1. **假导航**:4 个页面 tab 不切内容(发布记录/平台管理/批量发布全是空头支票),且「批量发布」tab 与中列「批量设置时间」装饰块功能重复——两处都是假的。
2. **表单欺骗性**:简介带必填星+字数但只读;封面必填却无上传入口只有装饰渐变;发布选项开关不落库。看得见摸不着,是「表单填写机」的反面教材还骗人。
3. **假安全感**:发布前检查+发布清单两块内容重复且永远全绿——用户以为系统校验过标题/封面/标签,实际什么都没查。违反宪法「诚实标规划中」的产品纪律(评论区标了,这几块没标)。
4. **确认发布语义失真**:mock 发布写成 published、文案「已加入发布队列/已安排发布」暗示存在队列与排期系统,均不存在;二次点击文案还会升级。
5. **右栏预览与左侧表单脱节**:改标题不联动预览;真项目预览永远「预览卡片/暂无内容」。
6. **信息硬编码串台**:demo 专属的封面文案/AI 浏览器提示出现在所有真实项目页;demo 平台卡排期显示 2024 年。
7. **日历三重错位**:展示假(写死七天)/写真不可见/「未来 7 天」实为固定过去一周。

### 6. 疑似 bug(带证据)

| # | 描述 | 证据 | 严重度 |
|---|---|---|---|
| P-1 | 标题提交清空简介:commit body 恒 `description:""`,服务端把新 revision 设为 current → 真简介从当前版本丢失(标签编辑器就正确带上了 description,同文件双标) | `publishing-interactive-region.tsx:343-347` vs `:541-549`;`publishing.service.ts:228-230` setCurrentRevision | high |
| P-2 | 真项目显示假清单/假提示:server 置空(`publishing-workspace-data.ts:484-485`)被 client 空数组回退击穿 | `publishing-interactive-region.tsx:1367,1550`;真机 dy-proj-61 页含「AI 浏览器」提示+4 条全绿清单 | high |
| P-3 | 内容日历写不可见 + 日期落在过去:格子写死、不读 entries;weekStart 固定 2026-06-22(今天 07-02) | `:174-186`,`:1125-1214`;`page.tsx:30`;库表 content_calendar_entries 空 | high |
| P-4 | 确认发布假成功链:MockPublisher 无真发布;本地状态先翻绿无回滚;published→published 之外的非法迁移(如 removed)会 409 但 UI 无提示 | `platform-publisher.ts:1-16`,`persistence-client.ts:1189`,`:795-829` 无 try/catch | high |
| P-5 | 真 category/series 不显示(revision.category="AI工作流" → 页面「未分类」) | `publishing-workspace-data.ts:450-471`;curl publications.revisions.list dy-pub-61 | medium |
| P-6 | 预览卡不镜像真标题(显「预览卡片/暂无内容」) | `publishing-workspace-data.ts:437-445`;真机 pub-real.html | medium |
| P-7 | 手动加平台把 UI 文案写进 accountReference(「B站 (Bilibili)」),与真实账号 handle(accounts 表 @AI工程实录)脱钩 | `:914` + accounts.list curl | medium |
| P-8 | 发布页用 deprecated canonical-ctx client,session 作用域失效(复盘页已迁) | `publishing/page.tsx:26`;`contract-client.server.ts:34-51` | medium |
| P-9 | 标签提交在空标题时写入 title=`" "` 的版本,污染 append-only 版本流 | `:545` | low |
| P-10 | demo 页确认发布会按 fixture 卡建 5 条真 publication(fixture 展示驱动真库写) | `:812-826` + demo 页 wiring(outputId 存在、publications 空) | medium |

---

## 二、/projects/[id]/review(数据复盘页)

### 1. 功能定位

七步流水线第 7 步「复盘(校准+经验沉淀)」:看真实表现(指标/趋势/漏斗/评论)→「帮我复盘」进 ChatBox 提炼经验(合宪 §6 编导对话化)→ 洞察沉淀为 learnings 回流飞轮(合宪 §3/§5.4)。**读侧做真程度显著好于发布页**(指标/评论/趋势全真,缺数据的区域诚实标规划中),但存在三个结构性问题:7 个 tab 假分区、收益/对比数据装配后无人渲染、复盘编辑写完不可见。

代码链路:
`app/(creator)/projects/[projectId]/review/page.tsx`(session → createServerClient(ctx),✅正确作用域)
→ `features/review/review-workspace-data.ts`(analytics.projects.get + learnings.list + monetization.funnel.get + outputs/products N+1 + publications.comments.list)
→ `analytics-review-view-model.ts`(纯函数:快照→7 卡/漏斗/日级趋势/对比)
→ `analytics-review-page.tsx`(shell + 空态门)
→ `analytics-review-interactive-region.tsx`(client 岛)+ `review-analyze-island.tsx`(帮我复盘深链)。

### 2. 区块与交互清单

| 区块 | 元素 | 点了发生什么 | 接线 | 状态 |
|---|---|---|---|---|
| 顶部 | 「帮我复盘」 | query-only 深链 `?copilot=open&surface=review&fn=review.analyze&selKind=project&selId=…` 就地开 ChatBox 预调 review.analyze | `review-analyze-island.tsx` + `copilot-deeplink.ts`(带选中态注入,修过瞎答) | ✅接线正确(真机 HTML 验证 href;AI 会话本身不在本次验证范围) |
| 顶部 | 7 个 tab(整体表现/平台表现/观众分析/内容分析/收益分析/对比分析/经验沉淀) | 高亮切换;**真实项目:内容零变化**;fixture 项目:仅改时间窗(平台表现→30d、观众分析→7d) | `TAB_WINDOW`(`analytics-review-interactive-region.tsx:99-107`)+ canRederive 门(`:160-168`,真项目禁 re-derive 防真值被 fixture 清零) | ❌实质 dead:tab 名承诺的分区内容(平台/观众/收益/对比/经验)不存在;时间窗语义与 tab 名也不匹配 |
| 主列 | 7 张核心指标卡 | 展示 | real:analytics.projects.get → 每发布最新快照求和;完播率/封面点击率无采集帧时显「暂无」不编 0%(`analytics-review-view-model.ts:263-280`) | ✅works(dy-proj-61=356 播放验证) |
| 主列 | 趋势/漏斗 chart tab | 切换两张主图强调 | 本地(`:295-340`) | ✅works(本地) |
| 主列 | 播放趋势图 | 展示 | real:按采集日分组真日级序列;单快照→单点+「需多次采集」提示(`:73-106`) | ✅works |
| 主列 | 转化漏斗 | 展示 | real:播放/互动/转化(=收藏代理);曝光段仅在有 ctr 时推导(`:287-294`) | ✅works;「转化=收藏」口径系推断,建议标注 |
| 主列 | 观众画像/观众来源/留存曲线 | 展示 | planned:「规划中——需单视频分析页采集」(`:445-563` PlannedRegion) | ✅诚实占位 |
| 主列 | 关键时刻表现 | 行可选中(仅高亮) | fixture 项目来自 canonical reviewInsights;真项目 planned | ⚠️选中无任何后续;fixture 行把 description 长文本塞进右侧 mono 数字样式 |
| 主列 | 热门作品发布列表 | 展示;「查看全部」禁用+规划中 | fixture 项目 canonical outputs;真项目 op 路径回填 | ✅诚实标注(`:701-715`) |
| 主列 | 热门评论 | 展示前 100 条(按点赞降序) | real:publications.comments.list(按快照里的 publicationId 圈作品)→ audience_signals 表;空态引导「去任务中心配抓评论」(`review-workspace-data.ts:394-434`) | ✅works(project-8639205b-689 显 3 条真评论验证);⚠️库内 219 条评论 like_count 全为 0 → 「热榜」实际按时间排;🔥 徽标>0 才显示(诚实) |
| 右栏 | AI 洞察卡 | 展示 | real:learnings.list——**账号全局,无项目过滤**(contract `learnings.ts:14-22` 仅分页参数) | ⚠️真数据错语境:每个项目的复盘页显示同一批全局经验(真机 5 条 learning 验证) |
| 右栏 | 复盘编辑·开始复盘 | `reviews.create {reviewType:"project"}` → 记住 activeReviewId → refresh | op 真接(`:1028-1039`) | ⚠️写成功但页面无任何可见变化(见 R-3) |
| 右栏 | 复盘编辑·类型选择+洞察标题/说明+添加洞察 | `reviews.insights.create` → 清空输入 → refresh | op 真接(`:1041-1061`) | ⚠️未先「开始复盘」时静默 no-op,无禁用态无提示 |
| 右栏 | 复盘编辑·完成复盘 | `reviews.complete` → refresh | op 真接(`:1063-1073`) | ⚠️同上静默 no-op |
| 右栏 | 添加发布 / 生成复盘报告 | 禁用 | planned(`:1143-1174`) | ✅诚实标注 |
| 右栏 | 复盘记录列表 | 行点击 → `reviews.get` 拉详情显示状态/周期 | 读 op 真接(`:134-148`);**但列表本体只来自 canonical fixture**(`fixtures/selectors/review.ts:431-449`),真项目永远空列表 | ❌真项目下功能不可达:没有条目可点,新建的复盘也进不来(无 reviews list 读侧;reviews 表现为空,psql 验证) |
| 空态门 | 整页空态 | 无快照的真项目 → 整页替换为「该作品暂无明细数据…去任务中心跑拉明细」 | `analytics-review-page.tsx:84-105` | ✅诚实;副作用:复盘编辑/AI洞察/评论区一并不可用(手动复盘被数据门挡死) |

### 3. 数据来源

| 数据 | 来源链 | 桶 |
|---|---|---|
| 核心指标/趋势/漏斗 | analytics.projects.get → metric_snapshots.raw_metrics(每发布最新帧聚合) | real |
| 热门评论 | publications.comments.list → audience_signals(采集管线落库,前 100) | real |
| AI 洞察 | learnings.list → learnings 表 | real(但全局非本项目) |
| 收益分析(revenue) | monetization.funnel.get + projects.outputs.list → outputs.products.list → products.get(每请求 N+1) | real 装配,**UI 零消费**(全 frontend 无 `vm.revenue` 渲染点,grep 验证) |
| 对比分析(comparison) | 同一批快照按 publicationId 分组(`analytics-review-view-model.ts:121-172`) | real 装配,**UI 零消费** |
| 复盘记录 | canonical fixture pickReviewHistory | fixture(真项目恒空) |
| 观众画像/来源/留存/关键时刻(真项目) | 无源 | planned |
| fixture 项目核心指标兜底 | canonical metric_values 聚合 + **推导公式:新增粉丝=播放×1.75%、封面点击率=赞/播放、分享=评论+赞/20**(`fixtures/selectors/review.ts:104-110`) | fixture(编造派生,仅 demo 项目 & 仅当 DB 快照为 0 时才可达) |
| tabs / TAB_WINDOW | 常量 | hardcoded |

### 4. 数据流向(写路径)

- 开始复盘 → `reviews.create` → reviews 表(user-scoped)。
- 添加洞察 → `reviews.insights.create` → review_insights 表。
- 完成复盘 → `reviews.complete`(状态机)。
- **以上三写全部「写后不可见」**:页面无 reviews 真实读侧(列表来自 fixture),refresh 后 UI 无变化。
- 帮我复盘 → 不直接写;ChatBox 内 review.analyze 走候选-采纳门 → learnings(合宪)。

### 5. 设计不合理

1. **7 个 tab 假分区(最高)**:tab 名承诺平台/观众/内容/收益/对比/经验七种分析,实际所有 tab 同一版面;真项目连时间窗都不变。用户点「收益分析」什么都不发生 = 「怪」的直接来源。
2. **收益/对比装配即弃**:REV-1/REV-2 每次 SSR 做 monetization funnel + outputs→products N+1 查询、快照分组,结果无组件渲染——白耗查询 + 死代码,且「收益分析」与宪法 §8「变现中心:移除」的边界待裁决(features/monetization 目录也仍在)。
3. **复盘编辑闭环断裂**:创建/洞察/完成三个真写全不可见,复盘记录列表真项目恒空、也无空态文案(空 ul),用户完全无法确认自己的复盘存在。飞轮「复盘必须反向沉淀」(§5.4)在 UI 层断链——洞察没有去处(不进 learnings、不进列表)。
4. **AI 洞察语境错位**:全局 learnings 冒充「本项目洞察」,项目 A 的经验出现在项目 B 复盘页。
5. **空态门一刀切**:无明细快照 → 整页空态,把与指标无关的复盘编辑/评论/洞察一并挡死。
6. **术语混乱**:空态文案称「该作品」,页面是项目级路由;评论区叫「热门评论·热榜前 N 条」但排序依据(点赞)当前全 0;「关键时刻表现」行右侧样式按数字设计却渲染长句。
7. **两套万位格式化**:发布页 `12.3万`(无空格,`publishing-workspace-data.ts:136-140`)vs 复盘页 `1.2 万`(带空格,`analytics-review-view-model.ts:44-47`)。

### 6. 疑似 bug(带证据)

| # | 描述 | 证据 | 严重度 |
|---|---|---|---|
| R-1 | 收益分析/对比分析 tab 有数据装配无渲染:`vm.revenue`/`vm.comparison` 全前端零消费 | `review-workspace-data.ts:289-355`、`analytics-review-view-model.ts:308` 产出;grep 全 features/review 仅 TAB_WINDOW 命中 revenue/comparison | high |
| R-2 | 真实项目 7 tab 点击内容零变化(canRederive=false → scoped 恒等于原 VM) | `analytics-review-interactive-region.tsx:160-168` | high |
| R-3 | 复盘编辑写后不可见:复盘记录列表只读 fixture,无 reviews list op 消费;真项目列表恒空 | `fixtures/selectors/review.ts:431-449`;interactive-region:958(items 来自 viewModel.reviewHistory);reviews 表空(psql) | high |
| R-4 | canonical demo 项目复盘页全 0:DB 种子给 metric_snapshots 写了空 rawMetrics `{}`(真值在 metric_values 表),op 路径只读 rawMetrics 且 snapshots>0 不回退 fixture → 总播放量 0/点赞 0… | curl analytics.projects.get project-podcast-launch(2 条 `{}`);真机 SSR「总播放量 0/完播率 暂无」;`analytics-review-view-model.ts:192-207` 回退条件 | medium-high |
| R-5 | AI 洞察全局不分项目 | contract `learnings.ts:14-22` 无过滤参数;`review-workspace-data.ts:259-263` params:undefined | medium |
| R-6 | 添加洞察/完成复盘静默 no-op(无 activeReviewId 时直接 return,无禁用态) | `:1042,1064` guard + 按钮无 disabled | medium |
| R-7 | 评论作用域挂在快照上:publicationIds 取自 metric_snapshots,发布无快照则评论永不显示(且整页可能先被空态门拦截) | `review-workspace-data.ts:377-385,398-399` | low-medium |
| R-8 | 热榜名不副实:库内 219 条评论 like_count 全 0(psql 验证),排序退化为时间序,标题仍称「热榜」 | audience_signals 聚合查询;`:415-425` 排序代码本身正确 | low(数据侧) |

---

## 三、跨页待对齐点(全局)

1. **发布页「评论区=规划中,无评论数据源」vs 复盘页真评论**:`publications.comments.list` 已存在并在复盘页服务,发布页注释与徽标理由过时(`publishing-interactive-region.tsx:1522-1524`)。要么接同源,要么改文案。
2. **收益分析 tab / monetization 装配 vs 宪法 §8「变现中心:移除」**:复盘页仍读 monetization contract 且 features/monetization 仍存在;需裁决保留口径(复盘内轻量收益?)还是彻底移除。
3. **client 作用域双标**:review 用 `createServerClient(session.ctx)`,publishing 用 deprecated canonical 单例——按 contract-client.server.ts 的迁移要求统一。
4. **accountReference 语义分裂**:导入数据 `@抖音创作者`(handle)vs 手动加平台「B站 (Bilibili)」(显示文案)vs accounts 表真 handle `@AI工程实录`——同字段三种口径。
5. **两批导入项目并存疑似重复**:`dy-proj-*`(source=manual,无评论)与 `project-8639205b-*`/`project-f0ea420f-*`(source=imported,有评论)存在同标题重复(如「从对话框到 Agent…」= dy-proj-13 & project-8639205b-689);同一作品两个复盘页、数据不同,用户必懵。另 dy-proj-* 的 source=manual 与「导入历史项目应 source:imported」(宪法 §7)不符。
6. **「平台对比」双实现**:发布页右栏(触达=plays,转化列隐藏)vs 复盘 comparison(plays/完播/点赞率/分享率,未渲染)——口径与去处都待统一。
7. **万位格式化两套**(`12.3万` vs `1.2 万`)与「作品/项目/发布」称谓混用。
8. **确认发布的「队列/排期」文案 vs 系统无队列**:T-007 调度子系统在任务中心,发布页文案暗示的发布队列并不存在。
9. **fixture 展示 + 真库写混流**(demo 页确认发布建真 publication;日历写到 canonical 种子账号)——「替换所有 mock/seed」(宪法 §7)未完成期间,建议 fixture 页禁写。

## 四、总评

- 复盘页读侧(指标/趋势/漏斗/评论)是这两页里做真质量最高的部分,空态与「规划中」纪律执行也好;但**导航层(7 tabs)与经验沉淀闭环(复盘编辑→可见)是空壳**。
- 发布页是「怪」感重灾区:真实数据(平台卡/表单/右栏指标)嵌在大量假装饰(假 tabs、假检查、假日历、假开关、假预览 tab、mock 发布)里,真假边界完全不可辨。
- 修复优先级建议:P-1(数据丢失)> R-1/R-2/R-3(复盘页三大空壳)> P-2/P-3/P-4(发布页假象)> 其余对齐项。
