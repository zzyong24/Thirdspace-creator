# 首页驾驶舱(/)产品审计

> 审计日期:2026-07-02 · 方法:宪法对照 + 代码链路(codegraph/grep)+ 真机只读验证(dev :3000,curl dispatch)
> 范围:`(creator)/page.tsx` + `(creator)/layout.tsx` + `shell-router.tsx` 及其从首页可见/可开的 Shell 与 Copilot 浮层。
> 纪律:每个结论带 file:line 或 curl 证据;未验证的明确标注。

---

## 1. 功能定位

**页面任务**:登录(单机免登录直通,`session.server.ts:29` T-046)后的落点,聚合「创作现状 + 下一步行动」:账号级指标、继续创作、待办、选题热度、最近发布表现、数据趋势、经验建议,并作为全局 AI 助手(Copilot)的最高频入口。

**与七步流水线的关系**:不属于任何单一阶段,是全链「分发台」——继续创作→当前阶段工作台;待办→项目阶段;热门选题→七步③选题池;最近发布→七步⑤发布中心;创作建议→learnings(七步⑦复盘沉淀的回流消费端);数据概览→数据底座。与宪法 §7「数据底座喂首页驾驶舱」定位一致,且指标/发布/继续创作确实已接真实导入作品(见 §3),**大方向合宪法**。

**服务端链路**:`page.tsx:27` → `createServerClient(session.ctx).getDashboard`(op `pages.dashboard.get`)→ `persistence-client.ts:3747` 装配 `createDashboardQueryService`(backend `query-services.service.ts:85`)→ 组合 projects / publishing / analytics / learnings / notifications / candidate 六个上游服务 → 页面 DTO。无 session 时退回 deprecated 的 canonical-ctx `client`(`contract-client.server.ts:51`,仅 SSR 兜底)。

---

## 2. 区块与交互清单

### 2.1 Shell(layout 层,首页可见)

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| 侧栏主导航 11 项(首页/定位中心/选题/校准/项目/知识库/素材中心/发布中心/任务中心/经验沉淀/设置) | 跳转 | `sidebar.tsx:66-85` Link → 各路由 | works(抽查 /topics /publishing /automations 皆 200) |
| 侧栏品牌「CreatorOS」 | 无 | `sidebar.tsx:156-172` aria-hidden 装饰,不可点 | intentional inert |
| 侧栏 AI 助手卡「打开 AI 助手」 | 就地开 Copilot 浮层 | `sidebar.tsx:309` href="?copilot=open" → `overlay-controller.tsx:128` 读 `?copilot=open` | works |
| 侧栏 AI 助手卡问候「{名字},今天想先做点什么?」 | 展示 | user prop ← layout session 真身份 | works(真名) |
| 侧栏用户卡(名字/邮箱/「个人版」徽标) | 纯展示,无菜单无退出 | `sidebar.tsx:323-353`;planLabel 硬编码 `layout.tsx:101` | inert(组件名叫 UserProfileMenu 但无 Menu;全仓无 logout,单机免登录下可接受) |
| 顶栏搜索框(「搜索项目、内容、素材...」) | 跳 /search | `top-header.tsx:459-471` Link | works(200) |
| 顶栏 ⌘K kbd 徽标 | **无任何行为** | `top-header.tsx:466-470` 注释自称 decorative;全仓 grep `metaKey\|ctrlKey` 0 命中 | dead(假快捷键承诺) |
| 顶栏通知铃 + 未读徽标 | 开 Popover | `notification-popover.tsx:96-116`;数据 ← layout `listNotifications`(`layout.tsx:48-75`,op notifications.list) | works(curl notifications.list 返回 2 条) |
| 通知面板「全部标记为已读」 | N 次逐条标读 + refresh | `notification-popover.tsx:70-93` → `client.markNotificationRead` ×N → router.refresh | 接线真实;**写路径未点验(只读纪律)** |
| 通知列表项 | 无 | `notification-popover.tsx:150-155` 注释:G3 intentionally INERT,无 deep-link | intentional inert |
| 顶栏「＋ 新建项目」 | 开拦截路由弹窗 | `top-header.tsx:476-481` → /projects/new → `@modal/(.)projects` → `new-project-dialog.tsx:174` client.createProject | works(路由 200;写未触发) |
| 页面标题「首页/个人创作工作台总览」 | 视觉隐藏 | global 模式 `top-header.tsx:156` sr-only | intentional |

### 2.2 Dashboard 主体(dashboard-page.tsx)

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| 问候「早上好, Zyong!」 | 展示 | `dashboard-page.tsx:646-653` 恒「早上好」;名字 `:83` ← `canonicalDataset.user.displayName`(fixture,非 session) | works 但双重硬编码(见 bug#4/设计#10) |
| 副题「今天有 3 条创作建议等待处理。」 | 展示 | `:99-101` ← vm.suggestions.length(learnings seed) | works(措辞与数据来源不符,见设计#11) |
| 5 张指标卡(总播放/总点赞/新增粉丝/平均完播率/总分享) | 纯展示 | op → `analytics.repository.ts:244` getDashboardRollup(imported 作品最新快照求和) | works,数据真(46.0万/1.1万/2,019/8.8%/2,009,curl 验证) |
| 指标卡 delta/趋势角标 | 展示「—」+ 空串 | `persistence-client.ts:3879-3884` delta:"" trend:"flat" 硬编码 | 装饰性(设计#8) |
| 继续创作 · 项目行 | 跳当前阶段工作台 | `dashboard-page.tsx:209` → /projects/project-18f58d87-143/review | works(curl 200) |
| 继续创作 · StatusBadge | 恒显「active」 | `:226` status="active" 硬编码 | 装饰性 |
| 继续创作 · 平台 chips | 展示 | `:624-629` ← fixtures `getProjectPlatforms`(`canonical.ts:2468`);真项目查不到 → 「多平台」兜底 | works 但 fixture 源(页面 HTML 确认渲染「多平台」) |
| 继续创作 · 阶段 chip + 进度条 | 展示 | vm 真值(stage=review,100%) | works |
| 「＋ 新项目」 | 开新建弹窗 | `:242` → /projects/new 拦截弹窗 | works |
| 待办事项(标题「0 项待处理任务」) | 每行跳项目/阶段 | `:543-547` todoHref;数据 ← `projects.service.ts:1062` getDashboardSummary | works;**0 项时卡内全空白,无空态**(页面 HTML 无「暂无」) |
| 热门选题 · 「去选题池 →」 | 跳 /topics | `:318-325` | works(200) |
| 热门选题 · 行 | 不可点,纯展示 | `:333-357` | inert(选题不能从首页点进详情) |
| 热门选题 · 热度 chip | 展示 | `persistence-client.ts:3993-4003` predictedScore*100 / 兜底 50-i*5 | **数据错乱**(「热度 8800」vs「热度 50」同屏,bug#1/#2/#5) |
| 最近发布 · 行 | 跳 /publishing(非具体作品) | `:386-388` 注释:行不带 projectId,统一去发布中心 | works(粒度粗,设计#12) |
| 最近发布 · 平台图标/播放数/状态徽标 | 展示 | PlatformIcon 支持 douyin(`platform-icons.ts:34`);views ← analytics 快照 | works,数据真 |
| 数据概览 · 4 格 compact 指标 | 展示 | `:427-437` ← vm.dataOverview.metrics = **与顶部同一数组**(`query-services.service.ts:129`) | works 但同屏重复(设计#3) |
| 数据概览 · 「本周播放趋势」折线 + 摘要 | 展示 | `chart-frame.tsx` 静态 SVG;数据 `persistence-client.ts:3894-3900` 固定权重分摊 | works 但**数据是伪装的周报**(设计#1) |
| 创作建议 · 行 + 分类 chip | 展示 | learnings seed;category=strategy/hook/failure 无中文映射(`:611-618`)→ 显英文 | works(文案瑕疵) |
| 创作建议 · CTA(「去选题池/立即创作」) | 按 category 路由 | `:554-568` research/topic/planning→/topics;六阶段→项目阶段;**其余兜底 /projects/new** | works(兜底语义弱) |
| 底部 AI 助手条「开始对话」 | 开 Copilot | `:128-138` href="?copilot=open" | works |

### 2.3 Copilot 浮层(从首页开,shell-router 挂载)

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| 遮罩点击 / Esc / 关闭按钮 | 关浮层(仅删 copilot 参数) | `overlay-controller.tsx:130-137,165-169,199-207` | works |
| 「⌘ K 全局唤醒」徽标 | **无监听** | `ai-copilot-dialog.tsx:60-62`;全仓无 metaKey 处理 | dead(假承诺) |
| 底部提示「按 Esc 关闭 · ↑↓ 切换 · Enter 执行」 | 部分真 | Esc 真;↑↓ 仅 @提及下拉内(`ai-copilot-content.tsx:956-978`);Enter=表单提交 | 半真半装饰 |
| 新对话 / 历史记录 | 清会话 / 拉会话列表可切换 | `:803-810` / `:772-800` client.listConversations + listMessages | works(真 op) |
| 消息流 + 流式回复 + 停止 | 真 AI 对话 | `:645-674` useChat → POST /api/chat(route.ts 存在,Vercel AI SDK)+ x-conversation-id 续接 | 接线真实;**未实测发消息(不触发 AI 写)** |
| 工具结果卡(选题候选/诊断/复盘经验/定位提案) | 渲染 + 采纳走 confirm 门 | `:1136-1192` topic.generate/calibration.diagnose/review.analyze/positioning.generate | 接线真实(未触发) |
| 输入框 @项目引用 | 下拉真项目列表,选中注入上下文 | `:850-978` client.listProjects | works |
| 6 个建议 chips / 5 条推荐指令 / 2 条快速开始 | 点击填输入框 | `:1293-1307,1387-1406,1632-1643` ← `selectors/copilot.ts` fixture 文案 | works(fixture 文案,真交互) |
| 「查看所有指令」 | 无 | `:1407-1413` 挂「规划中」徽标 | 诚实占位 |
| 最近任务 / 继续任务卡 | 真任务流 | `:815-848` client.listAITasks(curl 验证返回真任务) | works;taskType 无映射时显机器枚举(如 scheduled.self.detail) |
| 「查看全部」×2 | 跳 /copilot | `:1425`、`:1490` | **dead:/copilot 404(curl 验证)** |
| 「继续」按钮 | 跳 /projects/<id>/<stage>;无 projectId 则禁用 | `:447-454,1543-1561` | works(诚实降级) |
| 快捷入口 6 个 | 跳真路由 | `:191-198` QUICK_ENTRY_HREF | works |

---

## 3. 数据来源(四桶归类)

| 数据 | 来源链 | 桶 |
|---|---|---|
| 5 指标卡数值(46.0万播放等) | pages.dashboard.get → analyticsService.getDashboardRollup → metric_snapshots(imported 作品最新快照求和,`analytics.repository.ts:244-334`;imported 收窄 `persistence-client.ts:3860-3868`) | **real** |
| 指标卡 delta/trend/tone | `persistence-client.ts:3879-3884` 写死 ""/flat/positive | hardcoded |
| 继续创作(项目/阶段/进度) | projectsService.getDashboardSummary → projects 表(最近更新非归档,`projects.service.ts:1062`) | **real** |
| 继续创作平台 chips | `fixtures/canonical.ts:2468` projectTargetPlatforms;真项目 miss → 「多平台」(`dashboard-page.tsx:624-629`) | fixture + hardcoded 兜底 |
| 待办 | 同上 summary → 项目未完成 task | **real**(当前空) |
| 热门选题标题 | candidateService.listCandidates → candidates 表;当前 = 1 条真实候选 + 3 条 canonical seed(`persistence-client.ts:4426/4464/4502`) | real 掺 fixture |
| 热门选题「热度」数字 | predictedScore*100(尺度错)/ 无分时 50-i*5 编造(`persistence-client.ts:3996-4003`);trend 恒 "up" | **suspect/hardcoded**(见 bug#1/#5) |
| 最近发布(标题/播放/互动) | publishingService.getRecentPublicationsWithTitle + analytics 最新快照(views‖plays 归一)+ imported 过滤(`persistence-client.ts:3782-3852`) | **real**(curl:561/521/6545/2748/0 播放) |
| 数据概览 4 格指标 | 与 5 指标卡同一数组(`query-services.service.ts:129`) | real(重复) |
| 「本周播放趋势」7 点 | 全量累计播放 × 固定 WEIGHTS 分摊到周一~周日(`persistence-client.ts:3894-3900`) | **fake shape**(总和=真,逐日=假) |
| 创作建议 3 条 | learningsService.getSuggestions → learnings 表;当前全为 seed(`canonical.ts:1650,1663,1676`) | fixture(种进真表) |
| assistantPrompt(AI 助手条文案) | 后端常量 `query-services.service.ts:26-27` | hardcoded |
| 问候名「Zyong」 | `dashboard-page.tsx:83` canonicalDataset.user.displayName | fixture(恰与 seed 登录同名) |
| 通知 2 条 | notifications 表 seed(notif-1/notif-2,引用 demo 实体 AI Native Browser/播客) | fixture(种进真表;curl 验证) |
| Shell 用户卡名字/邮箱 | layout → identity.getCurrentUser(session) | **real** |
| 「个人版」徽标 | `layout.tsx:101` 固定串(注释自认无计费实体) | hardcoded |
| 侧栏素材库存储卡「12.4 / 50 GB」(assets 页 variant,首页不显示) | `sidebar.tsx:272-286` 写死 | hardcoded |
| Copilot chips/推荐指令/快速开始文案 | `fixtures/selectors/copilot.ts` | fixture(交互真) |
| Copilot 最近/继续任务 | ai.tasks.list → ai_tasks 表(curl 验证真任务) | **real** |
| Copilot 历史会话/消息 | ai.conversations.list / messages.list | **real** |

## 4. 数据流向(写路径)

首页自身**零直接写**——全部展示 + 跳转。从首页可达的写:

1. 通知「全部标记为已读」→ `notifications.read` ×N → notifications.readAt(`notification-popover.tsx:78-92`)。
2. 「＋ 新建项目」弹窗提交 → `projects.create`(`new-project-dialog.tsx:174`)。
3. Copilot 发消息 → POST /api/chat → streamText + onFinish 落 ai_conversations/ai_messages;工具产出候选 → 人点采纳 → confirm 门(candidates.create 等)——符合宪法铁律②「AI 只产候选」。
4. 隐患:`DashboardPage` 无 viewModel 时走 deprecated canonical-ctx `client`(`contract-client.server.ts:34-51` 自带警告),多用户下会串租户;当前单机免登录不触发。

## 5. 设计不合理

1. **[high] 「本周」口径造假**:数据概览卡描述「本周累计播放与转化趋势」、图题「本周播放趋势」、摘要「本周累计播放 460,422 次」——实际是**历史全量**播放按固定权重(`WEIGHTS=[0.097..0.219]`)摊成周一~周日曲线。后端注释自称「诚实标注为形状分摊」(persistence-client.ts:3893),但 UI 层零标注。与宪法「诚实」/项目「诚实置0不编」纪律直接冲突。建议:无逐日快照就显示「累计播放(暂无逐日数据)」或标「按形状估算」。
2. **[high] 热门选题卡整体失真**:①热度尺度混乱(8800 vs 50 同屏);②卡片描述「来自知识库的灵感与热点」而数据源是选题池 candidates;③trend 恒 "up";④行不可点(想看选题只能走「去选题池」)。
3. **[medium] 同屏重复指标**:顶部 5 卡与「数据概览」内 4 格是同一数组两次渲染(query-services.service.ts:124,129),且 MetricCard 会把相同 id(d-views 等)写成 HTML id → 同页重复 DOM id(metric-card.tsx:57)。「数据概览」卡自身没有增量信息。
4. **[medium] AI 助手入口一屏三处**:侧栏卡「打开 AI 助手」、页面底部条「开始对话」、顶栏无(还好);页面底部条 data-slot 名为 `sidebar-assistant-card` 却渲染在 main 流(dashboard-page.tsx:107,116)——命名与位置背离,信息架构冗余。
5. **[medium] 「继续创作」语义失效**:算法=最近更新的非归档项目,在导入数据主导(73 imported)下选中的是 stage=review、progress=100% 的已完结导入作品——「继续创作」推荐一个已经做完的东西;且导入项目标题是整条抖音文案(几百字),卡片可读性差。建议:偏好 source≠imported 或 progress<100 的项目,imported 全完结时改推「从复盘里挑下一个选题」。
6. **[medium] 两处假 ⌘K 承诺**:顶栏 kbd(自称 decorative)+ Copilot 头部「⌘ K 全局唤醒」徽标;grep 全仓无 keydown 监听。要么实现,要么删。
7. **[low] 待办 0 项无空态**:TodoCard 只渲染「0 项待处理任务」副题,卡体全空(dashboard-page.tsx:262-305 无 empty 分支);同页其他卡都有诚实空态,不一致。
8. **[low] MetricCard 空 delta 噪音**:5+4 张卡每张值旁挂孤立「—」(trend flat + delta ""),且 tone=positive 让「—」呈绿色——像坏数据。delta 无值就不渲染角标更干净。
9. **[low] 创作建议分类显英文**:strategy/hook/failure 不在 CATEGORY_LABELS(dashboard-page.tsx:611-618),chip 直接显英文;CTA 兜底「立即创作→/projects/new」与建议内容(如「15 秒开场需包含可量化结果」)无关联。
10. **[low] 问候恒「早上好」**:buildGreeting 不看时间(dashboard-page.tsx:646-653),晚上打开也「早上好」。
11. **[low] 副题措辞**:「今天有 3 条创作建议等待处理」——3 条是 seed learnings,非「今天」产生;learnings 也不是「待处理」语义(无处理动作)。
12. **[low] 最近发布行粒度粗**:全部跳 /publishing 列表而非该作品详情/复盘(注释自认 DTO 不带 projectId,dashboard-page.tsx:383-385)。飞轮语义下,点最近发布最想去的是这条的复盘页。
13. **[low] Copilot 底部快捷键提示半假**:「↑↓ 切换」仅 @提及下拉内生效,作为浮层全局提示误导。

## 6. 疑似 bug(带证据)

1. **[high] 热度尺度错 100 倍**:`persistence-client.ts:3999` `Math.round(c.predictedScore * 100)` 假设 0–1 分,但 seed 与 rubric 全链用 0–100(`persistence-client.ts:4434/4477/4516`:74/61/88)。证据:curl pages.dashboard.get → `"heat": 8800/7400/6100`;首页 HTML 渲染「热度 8800」。
2. **[high] 候选排序 NULLS FIRST**:`candidate.repository.ts:178` `orderBy(desc(sortColumn(sort)))` 未加 nullsLast → Postgres DESC 默认 NULLS FIRST,predictedScore 为 null 的候选排最前。证据:live payload 中 cand-2f9238da-375(无分,heat 兜底 50)排在 88 分 seed 之前。影响首页热门选题与 /topics 同一 op 的所有排序。
3. **[high] /copilot 死链**:`ai-copilot-content.tsx:1425`、`:1490`「查看全部」→ href="/copilot";`app/(creator)/` 无 copilot 目录;curl /copilot → 404。
4. **[medium] 问候读 fixture 用户**:`dashboard-page.tsx:83` `greetingName ?? canonicalDataset.user.displayName`——page.tsx 不传 greetingName,问候永远显示 fixture 用户名而非 session 用户(layout 用户卡走 session 真身份,两处口径分叉)。当前 seed 登录恰好同名而被掩盖。
5. **[medium] 热度兜底编数**:`persistence-client.ts:4000-4001` 无分候选给 `50 - i * 5` 的假热度并显示为「热度 50」,违反「诚实置0不编」;应显示「未评分」。
6. **[low] 同页重复 HTML id**:`dashboard-page.tsx:156-163` 与 `:427-437` 用同一 metrics 数组渲染 MetricCard,`metric-card.tsx:57` 把 id 写进 DOM → d-views 等 id 每页出现两次(HTML 规范违例,锚点/测试选择器不稳)。
7. **[low] 类型强转撒谎**:`persistence-client.ts:3846` `platform: r.platform as "youtube"`(实际 douyin)、`status as "published"`——运行正常(PlatformIcon 支持 douyin)但类型层面掩盖了契约 enum 与真实值的漂移。

## 7. 待对齐点(跨页/宪法)

1. **变现中心残留**:宪法 §8「变现中心:移除」;侧栏已无入口(sidebar.tsx:82 注释 MONE-01),但 `/monetization` 路由可达(curl 200)且 `shell-router.tsx:161-167` 保留标题描述。「移除」的执行口径(藏入口 vs 删路由)需全局定调。
2. **同一实体三种叫法**:候选池在侧栏叫「选题」、shell-router 页题「选题候选池」、首页卡「热门选题」(且描述说「来自知识库」)。命名与来源描述需统一。
3. **阶段中文名不一致**:`shell-router.tsx:86-93` production=「拍摄」/script=「脚本」;`top-header.tsx:84-91` DEFAULT_STAGES script=「写稿」/production=「制作」;`dashboard-page.tsx:570-581` production=「拍摄」。同一阶段三处两套词。
4. **「周趋势=形状分摊」是全产品口径问题**:persistence-client.ts:3892 注释自认「与复盘趋势同法」——复盘页同样伪周报。要么全产品接真逐日快照,要么全产品统一标注「估算」。
5. **指标时间窗口混乱**:「新增粉丝 2,019」「总播放」为全量累计,却被放进「本周…趋势」卡;无任何窗口标注。
6. **fixture 双代际并存**:projects.list 共 139 条 = 73 imported(T-030 真管线)+ 66 manual(含 douyin-real dy-proj-* fixture 代与 demo 项目 project-podcast-launch / project-ainativebrowser,curl 验证仍在库)。首页指标只算 imported,但项目列表/其他页若不同口径,数字会互相对不上;demo 项目「去除」只做了列表层,库里还在。
7. **通知引用幽灵实体**:seed 通知指向 demo 项目(AI Native Browser)——项目页已藏 demo,通知铃还在提它。数据底座「替换所有 mock/seed」(宪法 §7)在 notifications/learnings/candidates 三处未完成。
8. **Copilot 引导口径**:空态示例「基于最近评论出 5 个选题」,而 FUNCTION_KEY_PREFILL 是「基于我的定位和真实信号」;评论 basis 的消费(T-007 D7)未完成——引导文案先于能力。
9. **「个人版」徽标**:无计费实体(layout.tsx:97 注释自认),单机免登录产品是否保留付费暗示,需产品层定调。
10. **greeting 双源**:Shell 用户卡走 session 真身份,dashboard 问候走 fixture——同屏两个「我是谁」的来源,应统一为 session。
