# 产品审计:发布中心(/publishing)+ 内容日历(/calendar)

> 审计日期 2026-07-02 · dev server localhost:3000 实测(只读)· 证据均标 file:line 或 curl 结果。
> 宪法对照:[docs/产品定位.md](../../产品定位.md) §4 七步流水线、§7 数据底座、§8 边界。

---

## 一、/publishing 发布中心

### 1.1 功能定位

全局资源中心:聚合**所有项目**的发布记录(一稿多平台 fan-out 每平台一行),展示发布状态、排期与真实表现(播放/互动),并提供批量状态操作。对应七步流水线的 **⑥发布(状态登记侧)+ ⑦复盘(表现回看侧)**。与 per-project 的 `/projects/[id]/publishing`(发布工作台,做多平台适配)是两个页面,spec 明确不合并(publishing-center-page.tsx:24-26)。

**合宪法判断**:方向合(§7 数据底座读侧做真,真实作品表现回流)。但见 1.6 的「批量发布」语义问题与 1.7 的数据重复问题。

### 1.2 代码链路

```
app/(creator)/publishing/page.tsx        (Server Component, session-scoped client, page.tsx:36-40)
 └─ buildPublishingCenterViewModelReal   (features/publishing-center/publishing-center-data.ts:586)
     ├─ projects.list → projects.outputs.list → outputs.publications.list   (N+1 走查, data.ts:316-437)
     ├─ publications.revisions.list       (真标题, data.ts:186-204)
     ├─ analytics.publications.get        (最新快照→表现格+右栏聚合, data.ts:237-264)
     └─ 读失败→fixtures/selectors/publishing-center.ts 整体兜底;读成功零行→诚实空态 (data.ts:590-605)
 └─ PublishingCenterInteractiveRegion    (client island, 筛选/分页/批量, interactive-region.tsx)
     └─ 写路径: client.transitionPublication → op publications.transition
        → backend publishing.service.ts:33-36 状态机 (draft→scheduled/published; scheduled→published/failed; published→removed)
```

### 1.3 区块与交互清单

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| ContentTypeTabs(全部/视频/图文/音频) | 客户端过滤表格 + 重置页码 | 纯客户端,count 来自真数据(data.ts:612-619) | works(实测 130/130/0/0) |
| 搜索框 | 按标题/项目/平台子串过滤,镜像 `?q=` | 纯客户端 replaceState(interactive-region.tsx:100-114) | works |
| 筛选 chips 全部/近7天/近30天/待优化 | 按日期/互动 tone 过滤 | 纯客户端;**基准日硬编码 REFERENCE_DATE="2026-06-20"**(interactive-region.tsx:68) | works 但语义错(见 1.6-B1) |
| 全选 checkbox | 全选当前页可见行 | 纯客户端 | works |
| 批量发布 | 选中行 status≠published 逐条 transition→published,然后 router.refresh() | publications.transition(interactive-region.tsx:248-261) | wired,未实测(写操作);**选中 removed 行会 409 静默中断**(见 1.6-B2) |
| 批量下架 | 选中 published 行逐条→removed | publications.transition(interactive-region.tsx:265-278) | wired,未实测(写操作) |
| 修改时间 | 选中 draft 行逐条→scheduled,**scheduledAt=服务器当前时间,无时间选择器** | publications.transition(interactive-region.tsx:284-297;backend publishing.service.ts:270-273) | wired 但名不副实(见 1.6-B3) |
| 行 checkbox | 加入选择集 | 纯客户端 | works |
| 行「查看」 | 跳 `/projects/{projectId}`(缺 projectId 则 /projects) | Link(interactive-region.tsx:738-746) | works(curl /projects/dy-proj-61 → 200) |
| 分页 ‹ 1..N › | 客户端切片 | 纯客户端;**全部页码平铺渲染,现 22 个按钮**(interactive-region.tsx:817-855) | works 但不可扩展 |
| 右栏 4 指标卡/平台对比/发布趋势/热门内容 | 只读展示 | 服务端聚合真快照(data.ts:474-574) | works(见 1.6 三处标签/文案 bug) |

### 1.4 数据来源(四桶)

| 数据 | 来源链 | 桶 |
|---|---|---|
| 发布行(标题/平台/时间/状态) | projects.list→outputs.list→publications.list→revisions.list → PG 表 projects/content_outputs/publications/publication_revisions | **real**(curl 实测 dy-pub-61 等真抖音数据) |
| 表现格(N 播放/互动率) | analytics.publications.get → metric_snapshots.rawMetrics(plays/likes/comments/shares/favorites) | **real**(dy-ms-61: 356 plays, source manual_entry) |
| 右栏 总播放/总互动/平均互动率/已发布 | 同上快照横向聚合(data.ts:474-522) | **real**(实测 89万/4.7万/5.2%/130 — 但被重复导入翻倍,见 1.7) |
| 平台对比/发布趋势/热门内容 | 同上快照聚合 | **real**(实测 抖音100%;趋势仅 2 个点:06-21、07-02 = 两次采集日) |
| tab 标签与顺序 | fixture 锁定(labels),count 用真数据(data.ts:612) | 标签 hardcoded(无害),count real |
| 内容缩略图 | token hash 生成色块「16:9」 | **hardcoded 占位**(interactive-region.tsx:752-776,无真封面) |
| 整页兜底 VM(仅 projects.list 抛错时) | fixtures/selectors/publishing-center.ts:26-80(28 条假发布、12.5万播放、假平台占比) | **fixture**(失败路径;渲染无任何「这是演示数据」标识) |
| 指标卡 delta/趋势箭头 | 真路径恒空 delta+flat(data.ts:489-522) | 诚实置空(合规) |

### 1.5 数据流向(写路径)

- 唯一写:三个批量按钮 → `publications.transition` → persistence-client(:4778 附近装配)→ publishing.service.transition → PG `publications` 行 status/scheduledAt/removedAt。
- 无平台侧副作用:**不会真的发布/下架抖音上的任何东西**,只翻本库状态。
- 搜索/筛选/选择均为客户端瞬时状态(仅 `?q=` 进 URL)。

### 1.6 设计不合理 + 疑似 bug

**B1(bug·中)「近 7 天/近 30 天」基准日硬编码为 2026-06-20**
interactive-region.tsx:66-68 `REFERENCE_DATE = "2026-06-20"`,matchesDateChip 用它算天数(:127-142)。今天是 07-02:「近 7 天」实际含义是「2026-06-13 之后发布的」≈ 近 19 天;且 daysBetween 为负(未来于基准日)也算命中。fixture 时代的确定性设计残留到了真数据页面,筛选结果对用户是错的。

**B2(bug·中)批量操作无错误处理,一条 409 静默吞掉后续**
handleBatchPublish 过滤条件是 `status !== "published"`(:249),会把 removed 行也包进去;而状态机 `removed: []`(publishing.service.ts:37)→ ConflictError。startTransition 内 for-await 无 try/catch(:251-260),第一条失败即中断,无 toast、无提示、不 refresh。日历页 useMutation 同病(见 2.6-B8)。isPending 也被丢弃(`const [, startTransition]`,:154),按钮不防重复点击。

**B3(设计·中)「修改时间」没有时间选择器**
点击后仅把 draft 行 transition→scheduled,scheduledAt 由服务器写为「现在」(publishing.service.ts:270-273)。用户以为能改排期时间,实际改不了任何时间。代码注释自己承认「the transition body carries only the status this wave」(:286)。要么补时间选择,要么改名「转入排期」。

**B4(bug·低)sr-only 平台对比读屏文本输出「抖音 89205700%」**
interactive-region.tsx:984-990 `(row.share * 100).toFixed(0)%`——share 在真路径已改为原始播放数(data.ts:532-540 注释明说 raw Σplays),乘 100 后读屏用户听到 8920 万%。实测 HTML 确认:`平台对比： 抖音 89205700% 。`可见的百分比(pct)是对的,只坏了无障碍文本。

**B5(设计·中)「发布趋势」图三处说谎**
① description 写「近 6 月发布量」(:1021),实际数据是**按快照采集日聚合的播放量**(data.ts:542-550),现仅两个点(06-21/07-02 两次导入采集日);② summary 模板恒定以「整体上升。」结尾(:1013-1017),与数据方向无关;③ 名为「发布趋势」实为「采集日播放总量」,语义完全不符。

**B6(设计·低)「批量发布」按钮语义越界**
产品无平台发布 API(发布=创作者手动发抖音后登记)。按钮叫「批量发布」暗示会发到平台,实际只翻本库状态。对导入的已发布作品毫无意义。建议改「标记已发布」对齐日历页的同语义按钮(那边就叫「标记已发布」——同一动作两个名字,见 3 待对齐)。

**B7(设计·低)分页平铺 22 个页码按钮**
PAGE_SIZE=6(:51)+130 行 → 22 个按钮一字排开(:817),数据再涨没法看。加省略号或改 PAGE_SIZE。

**B8(设计·低)失败兜底渲染整套假数据且无标识**
projects.list 抛错时整页回退 fixture(28 条假发布/12.5万播放,data.ts:590-605)。用户遇到读故障时看到的不是错误态而是一套无标记的假数据——比报错更「怪」。

**B9(设计·低)选择集跨筛选/翻页持久且作用于不可见行**
selectedRows 从全量 publications 取(:241-244),换 tab/筛选后选中行不可见但批量操作仍作用于它们;批量成功后选择集也不清空。

**B10(维护·低)死代码 publishing-center-view-model.ts**
为 composed `publishingCenterPage` op 写的适配器,但该 op 不存在(persistence-client.ts:357「publishingCenterPage has no op」),生产代码零引用,仅测试引用。

**性能注**:assembleRealRows 是 projects×outputs×publications×(revisions+analytics) 的 N+1(data.ts:184 自认),139 项目实测整页 0.64s(in-process transport 撑着),数据量翻倍后会明显劣化。

### 1.7 疑似 bug(数据层·高):作品被两代导入管线重复入库,指标翻倍

curl projects.list 实测:139 个项目,`source:manual` 66 个(dy-proj-*,旧 douyin-real 种子代)+ `source:imported` 73 个(project-8639205b-*/f0ea420f-*,T-030 新导入代),**22 个标题完全重复**(另有标题带 hashtag 后缀微差的同视频未计入,如「大神Karpathy 的知识操作系统和我的竟然这么像」vs「…#知识库 #AI #Obsidian」)。后果在本页直接可见:

- 「已发布 130」(真实约一半);「总播放 89万」≈ 两代各 ~43-46万 叠加;
- 热门内容 top5 里「Hermes似乎真是个半成品!」出现两次(11万/10万)、「大神Karpathy…」出现两次(8.5万×2)——同一条抖音视频两条记录;
- 「发布趋势」两个点恰是两代导入的采集日(06-21 / 07-02),把重复数据的两次快照画成了「上升趋势」。

这不是本页代码的错,是数据底座(T-030 管线与旧种子并存、无去重/origin 收敛)的错,但**用户「怪怪的」的第一现场就在这页**。修复归属:数据管线去重(按 douyin externalId/aweme_id 幂等),或读侧按 origin 收敛。

---

## 二、/calendar 内容日历

### 2.1 功能定位

账号维度的发布节奏管理:回答「我这周该发什么?哪个账号断更了?」(spec §9 验收 #4)。排期(planned/published/missed 状态机)+ 发布节奏(频率)+ 达成率/断更告警。对应七步 **⑦ 的运营侧延伸**。方向合宪法;但当前实现三处硬伤(入口缺失、时间冻结、与真实发布脱钩)使任务实际完不成。

### 2.2 代码链路

```
app/(creator)/calendar/page.tsx          (Server Component, session-scoped client, page.tsx:24-30)
 └─ ContentCalendarPage.loadViewModel    (features/content-calendar/content-calendar-page.tsx:74-122)
     ├─ accounts.list                    → 取第一个 active 账号 (page.tsx:84)
     ├─ accounts.calendar.list           (窗口硬编码 2026-06-22 → 2026-07-20, page.tsx:42-44)
     ├─ accounts.cadence.get / accounts.cadence.attainment
     └─ backend content-calendar.service.ts (状态机+attainment+reconcile, 全真 SQL)
 └─ ContentCalendarView (client)         → 三个 SectionCard:发布节奏 / 新增计划 / 内容日历
     └─ islands: AddSlotForm/EntryRow/CadenceEditor → createEntry/updateEntry/transitionEntry/deleteEntry/upsertCadence → router.refresh()
```

### 2.3 区块与交互清单

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| (页面入口) | — | **侧边栏 PRIMARY_NAV 无 /calendar 条目;全仓无任何 href 指向 /calendar** | **dead(孤儿页,仅手输 URL 可达;sidebar.tsx:66-85 + grep 全仓证实)** |
| 发布频率下拉(每日/每周/双周/每月/自定义) | 选频率 | 本地 state | works |
| 「保存节奏」 | upsertCadence(frequency, preferredSlots 原样透传) | accounts.cadence.upsert(interactive-region.tsx:256-267) | wired,未实测(写);**preferredSlots 无 UI,「自定义」选了等于没选**(:263) |
| 节奏达成率徽标 + 断更横幅 | 只读 | accounts.cadence.attainment | works(实测渲染「0% · 0/预期4 · 已断更28天」——数字有诚实问题,见 2.6-B5/B6) |
| 「新增计划」表单 | createEntry(plannedAt, note) | accounts.calendar.entries.create(interactive-region.tsx:92-101) | wired,未实测(写);**要求手打 ISO 时间串**(placeholder「2026-07-21T09:00:00.000Z」,:115) |
| 条目「标记已发布」 | transitionEntry→published | calendar.entries.transition(:159-167) | wired,未实测(写) |
| 条目「删除」 | deleteEntry,**无确认** | calendar.entries.delete(:169-177) | wired,未实测(写) |
| 条目改期/备注+「保存」 | updateEntry(plannedAt/note) | calendar.entries.update(:143-157) | wired,未实测(写);同样手打 ISO |
| 无账号切换器 | — | viewModel.accounts 已加载但 view 未用(view.tsx:29 只解构 accountId) | **dead(功能缺失)** |

### 2.4 数据来源(四桶)

| 数据 | 来源链 | 桶 |
|---|---|---|
| 活跃账号 | accounts.list → platform_accounts 表 | **real**(实测 2 账号:bilibili 种子 + douyin 真号) |
| 日历条目 | accounts.calendar.list → content_calendar_entries 表 | **real 空**(两账号窗口内均 `total:0`,curl 实测) |
| 节奏 | accounts.cadence.get → publishing_cadences 表 | **real 空**(`data:null`) |
| 达成率/断更 | accounts.cadence.attainment(service 内 reconcile+计算) | **real 计算,但输入被两处硬编码污染**:cadence null 时预期按 weekly 编造(service.ts:328-329);窗口终点是未来固定日(见 B5/B6) |
| 「这周」窗口 | **前端硬编码常量** WINDOW_FROM/TO/REFERENCE_INSTANT(page.tsx:42-44) | **hardcoded** |
| 当前账号是谁 | 第一个 active(page.tsx:84) | 逻辑硬编码:恒为 bilibili 种子号(id 序),**真抖音号永远轮不到** |

### 2.5 数据流向(写路径)

五个写 op(createEntry/updateEntry/transitionEntry/deleteEntry/upsertCadence)全部装配在 persistence-client(:5458 附近),写 PG content_calendar_entries / publishing_cadences,成功后 router.refresh() 重读。后端有 ownership gate + 状态机 + 幂等(service.ts:359-431),质量没问题。reconcile(service.ts:265-300)可把绑定了 contentOutputId 的 planned 条目自动翻 published——**但 FE 表单不暴露绑定字段**(契约支持 contentOutputId/candidateId,content-calendar.ts:41-44;表单只有时间+备注),自动对账在 UI 链路上形同虚设。

### 2.6 设计不合理 + 疑似 bug

**B1(高)孤儿页面:没有任何入口**
侧边栏无条目(sidebar.tsx:66-85),全仓 grep 无一处 `href="/calendar"`。「哪个账号断更了」的验收场景用户根本走不到。要么加导航,要么并入发布中心(header 描述本来就写着「已发布内容、表现与**排期**」)。

**B2(高)时间窗口前端写死,页面永久冻结在 2026-06-22→07-20**
page.tsx:42-44 三个常量。今天 07-02 尚在窗口内;07-20 之后页面将永远展示过期窗口,「这周该发什么」永远回答不了。C-5 确定性是视觉基线诉求,不该泄漏为生产语义(后端 persistent 模式下 clock 已是真实时钟,persistence-client.ts:947)。

**B3(高)日历与真实发布完全脱钩,断更告警与本产品自己的数据矛盾**
attainment 只数日历条目(service.ts:317-326),不看 publications。实测:发布中心显示最新真发布 2026-07-01(pub-468dd31b-42,昨天),日历页同时喊「已断更 28 天」。两页对「创作者是否在更新」给出相反答案——「产品怪怪的」的典型现场。修法:attainment 回落到该账号真实 publications,或 UI 引导把排期绑定 contentOutputId 让 reconcile 生效。

**B4(高)账号选择不可控:恒为第一个 active(bilibili 种子号)**
page.tsx:84 `accounts.find(a => a.status === "active") ?? accounts[0]`,实测命中 acct-canonical-bilibili(fixture 种子),真抖音号 acct-canonical-douyin 永远不被选;view 又不渲染账号名(用户不知道在看哪个号的日历),accounts 数组加载了却零使用(view.tsx:29)。

**B5(中)「预期 4 次」是编造的:用户从未设定节奏**
cadence 为 null 时 attainment 按 `?? "weekly"` 默认算预期(service.ts:328-329),对一个从未打开过此页的用户直接判「达成率 0%」。诚实做法:无 cadence → 显示「未设定节奏」,不给达成率。

**B6(中)「已断更 28 天」把未来天数也算进去**
gapDays = 窗口终点(2026-07-20,未来)− 最后发布(无则窗口起点)(service.ts:336-340)。今天 07-02,28 天里有 18 天还没发生。配合 B2/B3,这个告警三重失真。

**B7(中)新增/改期要求手打 ISO 8601 字符串**
placeholder「计划时间(ISO,如 2026-07-21T09:00:00.000Z)」(interactive-region.tsx:115),条目也以原始 ISO 串展示(:194)。对「编导」定位的产品这是开发者 UI,不是用户 UI。无日期选择器、无本地化格式。

**B8(中)写失败静默:useMutation 无 catch,无任何错误提示**
interactive-region.tsx:62-81 try/finally 只复位 pending,异常变成 unhandled rejection,用户点了没反应也不知道为什么。删除还无确认(:169-177)。

**B9(低)header 描述泄漏内部规格编号**
shell-router.tsx:181 pageDescription 含「(七步⑦ · §7.2)」,渲染进用户可见页头(HTML 实测含「七步⑦ · §7.2)」)。内部 spec 引号不该出现在产品 UI。

**B10(低)「自定义」频率是半残选项**
选 custom 后 preferredSlots 无处可配(editor 只有频率下拉,:252-267),expectedCount 对 0 slots 仍按周×1 兜底(service.ts:98-99)——选了自定义等于没选。

**B11(低)空态文案与现实矛盾**
「还没有账号。先到『账号管理』新增一个矩阵号」(view.tsx:43)——但侧边栏也没有「账号管理」入口(PRIMARY_NAV 无 accounts 条目),指路指向另一个孤儿。未验证 /accounts 路由是否存在,标记待查。

---

## 三、跨页待对齐点(供全局对齐分析)

1. **「已发布」口径三分裂**:发布中心=publications.status(130,含重复);日历=calendar entries(0);复盘/Dashboard 各自聚合。同一创作者三个数字。需要统一到去重后的 publications 单一真值。
2. **同一动作两个名字**:发布中心「批量发布」vs 日历「标记已发布」——都是状态登记,建议统一为「标记已发布」语系,避免暗示平台级发布能力。
3. **demo 项目过滤名单双份复制**:publishing-center-data.ts:120 与 projects-page.tsx:66 各持一份 DEMO_PROJECT_IDS,靠人肉同步;而 API 层不过滤(projects.list 实测仍返回 project-podcast-launch),其他消费方(日历?Dashboard?)不过滤会露出 demo 数据。
4. **「确定性时间」策略不统一**:发布中心 REFERENCE_DATE=06-20、日历 REFERENCE_INSTANT=07-20、后端 persistent 模式=真实时钟——三个「现在」。需要一个全局约定:测试注入固定时钟,生产一律真实时钟。
5. **平台账号数据源**:日历用 platform_accounts(bilibili 种子仍在且排第一);宪法 §7 要求「替换所有 mock/seed」——bilibili 种子号是否该清退,需全局裁决。
6. **数据重复(1.7)影响所有聚合页**:发布中心、复盘、Dashboard、选题(爆款经验)全部会被两代导入翻倍污染,不只是本页。
7. **share 字段语义漂移**:fixture 里是 0-1 占比(publishing-center.ts:77-80),真路径是原始播放数(data.ts:539)——同一 VM 字段两种量纲,已经咬出 B4(sr-only 89205700%),后续维护者还会踩。
