# CreatorOS 产品对齐报告（T-048）

> 输入：14 组审计代理逐页扫 22 个页面（详档见 [pages/](pages/)），原始发现 394 条（147 设计问题 / 117 疑似 bug / 130 待对齐点），全部带 file:line 或 curl 证据。
> 本报告 = 聚类去重后的全局判断：「产品怪怪的」的根源诊断、七大全局主题、修复路线与需要用户拍板的裁决点。

## 〇、执行摘要：为什么「怪怪的」

一句话诊断：**这个产品的 UI 是一个时代，数据是三个时代，交互是半个时代。**

1. **数据三个时代并存，互相打脸。** 产品经历了 mock-store 时代 → douyin-real.ts 冻结种子时代（dy-proj-*，66 条，source=manual）→ T-030 真采集时代（project-8639205b/f0ea420f-*，73 条，source=imported）。前两代从未退役：同一条视频在项目列表出现两行、发布中心指标约为真实值两倍（已发布 130 / 总播放 89 万）、热门内容同一视频上榜两次、复盘页同作品两个数据不同的复盘入口。再叠加 canonical demo 种子（AI Native Browser 等 4 个演示项目）的 fixture 通过无视 projectId 的 selector **跨项目泄漏**——播客项目的研究页显示浏览器市场数据、脚本页显示别人的脚本正文。这是「怪」的第一元凶。
2. **假交互流行病。**「壳先行」的开发方式留下大量画了没接的交互：全产品至少 **7 处死 tabs**（项目列表状态 tab、发布 4 tab、复盘 7 tab、脚本 6 tab、研究资料 tab、经验页顶部 7 tab、素材分类 tab），项目列表的筛选/排序/视图三件套全是假的，可见的搜索框是死的而活的搜索框被 sr-only 藏着。点了没反应，是「怪」的第二元凶。
3. **写真读假的半截闭环。** 比死按钮更伤的一类：设置偏好、制作模式、录制开关、时间线章节、内容日历、素材收藏——**写库都成功，但 UI 永远读 fixture 或根本不读回**，刷新后用户的操作像被吃掉了。
4. **几个真·高危 bug 在核心路径上。** 最重的一个：项目列表/详情页生成链接时剥掉 `project-` 前缀，**所有真实项目从列表打开都会落到身份丢失的退化页**——恰好只有 fixture 项目能正常打开，让「真数据可用、假数据好用」的观感雪上加霜。

以下按主题展开。每条的完整证据在 pages/ 对应文档。

---

## 一、全局主题（按根因聚类）

### 主题 1：数据双代际 + demo 泄漏（severity: HIGH，影响 12+ 页）

- **1a. 两代导入并存重复入库**：dy-proj-*（66，source=manual）与 imported（73）含 22~40 组同标题重复。污染：项目列表（满屏重复+131 条历史淹没 3-4 个创作中项目）、发布中心（指标翻倍、top5 重复上榜）、复盘（同作品两个复盘页）、首页口径。dy-proj 还缺 source=imported/platformRef 字段，所有 imported 专属逻辑对它失效。
- **1b. canonical demo fixture 跨项目泄漏**：selectors（research/planning/script/production/publishing/review）大量 `void projectId`，把 ai-native-browser 的趋势卡/证据/论点树/脚本正文/版本条/金句/AI 建议/预览海报/时间线/复盘记录灌给**任意项目**。
- **1c. 前端 fixture 查表旁路 DB 真值**：素材元数据/标签走 canonicalDataset（真上传显示 0 B）、脚本页 artifactId 只从 fixture 解析（**DB 里的真脚本在脚本页不可见**）、首页问候名/项目平台列/starred 同病。
- **1d. fixture 兜底击穿诚实**：experience 读失败静默回退整套假数据（642/386/62%）、发布中心兜底 28 条假发布、settings 兜底假模型、发布工作台 client 空数组回退击穿服务端诚实置空（真项目显示「AI 浏览器」提示+假全绿清单）。
- **1e. 编造数字散点**：热度兜底 50-i*5、搜索视频假时长（id hex 算出）、断更 28 天（把未来 18 天算进去）、预期 4 次/达成率 0%（用户从未设定节奏）、「本周趋势」=历史全量按固定权重摊成周曲线（首页+复盘同病）、经验页真 value 拼 fixture delta（「总沉淀 10 ▲+18」自相矛盾）。

**修复方向**：一次性数据清算（1a 退役或迁移合并 dy-proj）+ selectors 全量按 projectId 隔离或删除 demo 注入（1b）+ 读侧全部改 DB 真值（1c）+ 全站统一「读失败 → ErrorState，无数据 → 诚实空态/规划中」（1d/1e）。

### 主题 2：假交互流行病（severity: HIGH，影响 10+ 页）

- **2a. 死 tabs ×7 处**（见摘要）。共同根因：PageTabs 无 onValueChange/TabsContent 的「视觉先行」用法。
- **2b. 假筛选/排序/视图**：项目列表三件套（tab 不筛、排序无弹层、视图切换永远列表）、素材分类 id 永不匹配、发布中心选择集跨筛选持久。
- **2c. 死按钮/断链**：/copilot 404（两处「查看全部」）、⌘K 两处假承诺（全仓无监听）、「查看全部/全部素材/分享/更多/查看更多提议(href=#)」、选题左栏来源行假可点、研究相关标签 →/search?tag= 落空。
- **2d. 搜索页交互倒置**：可见搜索框死（无 onSubmit/onChange）、活的搜索框 sr-only 不可见、?type= 分面被 route 丢弃、**用户 46 条真实作品不在索引**、artifact 挤爆 limit-50 导致有匹配也显示 0 结果。
- **2e. 写真读假环 ×6**：偏好设置（写 user_preferences 读 fixture）、制作模式（落库不回显）、录制开关、时间线章节（无 listSegments 读）、内容日历（写库永不回显+日期落在过去）、素材收藏（持久化但全 UI 无痕迹）。

**修复方向**：铁律「真实有效或删除」逐条执行——接真（多数是接一个读回/一个 handler 的小活）或撤下。死 tabs 统一处理为「有内容才渲染 tab」。

### 主题 3：核心路径高危 bug（severity: HIGH）

见「二、疑似 bug 清单」high 段。特别标三个**数据破坏型**：
- 采纳 AI 定位建议**清空全部 6 facets + 5 条下游规则**（已真实发生，库里现在是空的；17 个 AI 节点因此失去规则约束）——根因 upsertProfile「缺省=清空」语义 + 两条采纳路径都只传 5 字段。
- 发布工作台**标题提交清空简介**（TitleField 恒发 description:""，真简介丢失）。
- 经验页**快速记录一键落库空记录**已污染真库（10 条中 6 条垃圾）+「应用经验」永远灌进演示项目 project-podcast-launch。

### 主题 4：write-on-read 与竞态（severity: HIGH）

- 浏览策划页即自动创建 3 个 artifact（46 个历史项目逐个点开会批量造实体，Link prefetch 也可能触发）。
- production get-or-create 无 onConflict：首次加载两路并发 INSERT 竞态 → **录制工作台随机消失，刷新才出现**（真机复现）。
- 搜索页打字逐键写搜索历史。

**修复方向**：读路径禁止写副作用（artifact 创建延迟到 AI 节点首启；production ensure 加 onConflict；recordSearch 去抖+去重）。

### 主题 5：术语/口径分裂（severity: MEDIUM，全站）

见「三、对齐清单」。最伤的三个：阶段中文名三套且互相矛盾（列表页 research=「复盘中」!）、「已发布」三处三个数、三个写死的「现在」（06-20 / 07-20 / 真时钟）导致「近 7 天」实为近 19 天、日历页喊断更 28 天而发布中心显示昨天刚发布。

### 主题 6：违宪残留（severity: HIGH，需用户裁决）

- §8「变现中心移除」被执行成「藏侧栏入口」：/monetization 路由 200 全功能可达、后端/种子/shell-router 全在、复盘页还在装配 monetization funnel（且装配即弃：白耗 N+1 查询）、「按变现潜力排序」「产品锚」「个人版徽标」气味残留。
- §8「不分视频类型/平台只在发布层」：新建项目表单选 contentType(video/article/audio/image) + 项目层选目标平台（已写进数据层）；制作模式三卡与「不分类型」张力。
- §7「替换所有 mock/seed」大面积未达成：通知/learnings/candidates/素材 6 条/搜索索引/账号（假 handle @抖音创作者）/产品种子/bilibili 账号恒被日历页选为活跃账号。
- §5「人确认关键产物」被绕三处：topic.enrich 自动 confirm、Copilot 聊天卡直连公网 op（还把 AI 产物标成 human）、校准「开始预测」自动 confirm（有「人审后置到 lock」的辩护，需明文分级）。

### 主题 7：结构性断链/孤岛（severity: MEDIUM）

- **孤儿页**：/calendar、/accounts 无任何入口（侧栏/全仓无链接），只能手敲 URL——七步⑤这组疑似整体漏接。
- **悬空接口**（后端 op 齐、前端零消费）：audienceSignals.list/linkToCandidate（219 条评论在选题页无出口）、calibration.suggestions.adopt（轨 B 规则建议断头）、assets.restore（删了永远找不回）、scheduledJobs.update（建错只能停用重建）、settings.prompts.*（T-040 提示词可配全产品无入口）、contract update accountHandle。
- **管线产物不可见**：T-030 重建的 trend_analysis 研究页读不到（planning 能读到，同管线两页待遇不同）、真脚本制作页提词读不到（contentText 回退口径不一）、复盘记录 fixture-only（真 review 永不显示）、收益/对比 tab 数据装配好但零渲染（装配即弃）。
- **校准页两个数据世界**：KPI/预测挂 seed 主体、列表只列 imported 主体 → 「录入真实表现」按钮全页不可达，回流闭环断。

---

## 二、疑似 bug 清单（去重后 high 全列，medium/low 见各页文档）

| # | 描述 | 证据锚 | 页面 |
|---|---|---|---|
| B1 | 「打开」剥 project- 前缀 → 真实项目身份丢失落退化页；fixture 项目反而正常 | projects-page.tsx:480 | projects 列表+详情 |
| B2 | brief 阶段项目「打开」→ /brief 路由不存在 404（新建项目必踩）；新建后还硬跳被 gate 卡住的 research | projects.service.ts:625 | projects |
| B3 | 采纳 AI 定位建议清空全部 facets/规则（已发生，库已空）；Copilot 采纳同病还错标 human | ai.service.ts:848 | positioning |
| B4 | 标题提交清空简介（同文件 TagsEditor 却正确保留，双标） | publishing-interactive-region.tsx:343 | 发布工作台 |
| B5 | 上传素材整链静默失败（相对 uploadUrl 被 ^https?:// 跳过 PUT） | asset-upload-button.tsx:67 | assets |
| B6 | assets.list 分页坏：page 收了不用、total 撒谎、>200 条静默丢失 | assets.transport.ts:114 | assets |
| B7 | 候选排序 DESC NULLS FIRST：null 分排最前（首页热门选题+选题池同病；repo 层通用风险） | candidate.repository.ts:178 | 首页/topics |
| B8 | 热度尺度错 100 倍（0-100 分再 ×100 → 「热度 8800」） | persistence-client.ts:3999 | 首页 |
| B9 | /copilot 死链 404 ×2 | ai-copilot-content.tsx:1425 | 首页/全局 |
| B10 | production 首载竞态 → 录制工作台随机消失（SELECT-then-INSERT 无 onConflict） | production.repository.ts:128 | production |
| B11 | 制作模式/录制开关/时间线章节 写真读假 ×3 | production-interactive-region.tsx:205 | production |
| B12 | 策划页浏览即建 3 artifact（write-on-read） | planning-workspace-data.ts:127 | planning |
| B13 | fixture 跨项目泄漏（脚本正文/论点树/趋势卡/预览/复盘记录给任意项目） | selectors/*.ts void projectId | 5 个阶段页 |
| B14 | DB 真脚本在脚本页不可见（artifactId 走 fixture 解析）；人工保存永久丢分镜时间码 | selectors/script.ts:117 | script |
| B15 | 研究页读不到重建产物；「添加笔记」实为覆盖第一条笔记 | research-workspace-data.ts | research |
| B16 | 复盘：收益/对比装配即弃（死数据+N+1 白耗）；复盘记录 fixture-only 真记录永不显示 | review-workspace-data.ts:289 | review |
| B17 | 快速记录污染真库（6 条垃圾 learning，learningType 还写死 strategy）；应用经验恒灌演示项目 | learnings.service.ts:285 | experience |
| B18 | 摘要卡真 value 拼假 delta；应用效果图纯 fixture 以真口吻陈述 | experience-data.ts:171 | experience |
| B19 | 真实作品不可搜（索引只投影 mock 种子）+ artifact 挤爆 limit → 有匹配显示 0 结果 + ?type= 被丢弃 | persistence-client.ts:4134 | search |
| B20 | 内容日历：写死过去的周窗口、entry 永不回显、写到无关 bilibili 种子账号；断更告警与真实发布矛盾 | content-calendar-page.tsx:42 | calendar/publishing |
| B21 | 调度任务「上次/下次运行」恒 —（无代码回写），与运行详情自相矛盾 | scheduling.repository.ts:159 | automations |
| B22 | 偏好设置写真读假 + 5 项全部无消费方（承诺行为全落空） | canonical.ts:123 | settings |
| B23 | 隐形 per-capability 种子行优先于用户配置：环境一旦出现 ANTHROPIC_API_KEY，9 个 AI 节点静默切走 | resolve.ts:70 | settings/全 AI |
| B24 | 服务端诚实置空被 client 击穿：真项目显 demo「AI 浏览器」提示+假全绿清单 | publishing-workspace-data.ts:484 | 发布工作台 |
| B25 | mock 发布写成 published + 文案暗示不存在的发布队列 | MockPublisher | 发布工作台 |
| B26 | canonical demo 复盘页全 0（种子写空 rawMetrics，真值在 metric_values 没人读） | analytics-review-view-model.ts:192 | review |
| B27 | 「更多」按钮一击移入回收站且全站无恢复入口（assets.restore 零引用） | asset-detail-panel.tsx:130 | assets |
| B28 | projects.list 无视 pageSize 返回全量 139 条且 meta 撒谎（多页消费） | projects 后端 | 跨页 |
| B29 | 「基于热点出题」无热点数据源，模型闭卷编热点而 UI 说「正在看热点」 | topic-generate 模板 | topics |
| B30 | 校准「录入真实表现」按钮全页不可达（seed 主体被让位逻辑排除） | persistence-client.ts:3179 | calibration |

（medium/low 约 80 条见 pages/*.md 各页「疑似 bug」节。）

## 三、术语与口径对齐清单

| 概念 | 现状（各页各说各话） | 建议统一 |
|---|---|---|
| 阶段中文名 | 三套：shell-router（production=拍摄）/top-header（script=写稿、production=制作）/projects 列表（research=**复盘中**、publishing=已发布·等待素材）vs 详情页（选题调研/渠道发布） | 单一 STAGE_LABELS 常量全站共享；research=研究、script=脚本、production=制作、review=复盘 |
| 选题页名 | 侧栏「选题」/header「选题候选池」/页内 h1「选题中心」（双标题同屏堆叠） | 「选题中心」，header 与 h1 二留一 |
| 发布动作 | 发布中心「批量发布」vs 日历「标记已发布」（同为状态登记）；「已加入发布队列」暗示不存在的队列 | 「标记已发布」语系；接真平台前不出现「发布/队列」字样 |
| 立项动词 | 「晋升为 Project」vs「立项」 | 「立项」 |
| 已发布数 | 发布中心 130（含双代重复）/日历 0（entries）/首页与复盘另有聚合 | 去重后 publications 单一真值 |
| 「现在」 | publishing REFERENCE_DATE=06-20 / calendar=07-20 / 后端真时钟 | 生产真时钟；测试注入固定时钟 |
| 存储数字 | Sidebar 12.4/50GB（硬编码）vs 页内 0.07/50GB vs settings.storage.get 真值 0.073/460GB | 全部读 settings.storage.get |
| 账号 | 矩阵号（带 secretReference 摆设）/设置页扫码绑定/发布 accountReference 三种口径字符串/日历恒选 bilibili 种子 | 统一账号中心：登录态+handle 单一实体，其余引用它 |
| 「任务」 | 任务中心（采集作业）/AI 任务（ai_task）撞名；页标题/表头/按钮三种叫法 | 采集侧统一「采集任务」 |
| 数字格式 | 「12.3万」vs「1.2 万」 | 一个 formatter |
| 七步编号 | 「七步①②/③/⑦·§7.2」散落用户可见文案且互相矛盾（定位/选题实际在七步外） | 用户文案不出现编号与规格号 |
| predictedScore | 推荐排序/爆款潜力/monetization-weighted | 「爆款潜力」 |
| failure 桶 | 「复盘沉淀」vs「失败案例」同桶异名 | 「失败案例」 |

## 四、违宪项（对照宪法逐条）

1. **§8 变现中心移除** → /monetization 半移除（路由 200/后端/种子/复盘 funnel 装配/变现潜力排序/产品锚/个人版徽标）。
2. **§8 不分视频类型、平台在发布层** → 新建项目 contentType+项目层平台（已进数据层）、制作模式三卡。
3. **§7 替换所有 mock/seed** → dy-proj 66 条、canonical demo 4 项目及其全套 fixture、通知/learnings/candidates/素材/搜索索引/账号/产品种子。
4. **§5 人确认关键产物** → enrich 自动 confirm、Copilot 聊天卡直连+错标 human、校准自动 confirm draft（可辩护，需明文）。
5. **§9.3 提示词/工具/schema 可配** → 后端全齐（T-040），前端全产品零入口。

## 五、修复路线（按产品价值排序，拆 BACKLOG 执行）

- **Wave A 止血（数据破坏与核心路径）**：B1+B2（一个 href builder）、B3（upsert 改 partial-merge + 恢复被清空的 facets 数据）、B4、B12+B10（write-on-read/竞态）、B7+B8、B17（清垃圾+富录入+项目选择器）、B5。
- **Wave B 数据清算（治「怪」根源）**：dy-proj 双代清算（用户裁决①）、demo fixture 泄漏全量隔离/删除（裁决②）、fixture 查表旁路改读 DB（脚本 artifactId/素材元数据/starred/问候名）、fixture 兜底全站改 ErrorState、搜索索引接真数据。
- **Wave C 假交互清算**：死 tabs ×7「接真或砍」、项目列表三件套、写真读假环 ×6、死按钮清单、搜索页交互倒置、孤儿页接入口（裁决⑤）。
- **Wave D 对齐与裁决落地**：monetization 处置（裁决③）、新建项目表单（裁决④）、术语统一词表落码（STAGE_LABELS/动词/formatter/时钟）、悬空接口盘点表逐条「接 UI 或删 op」、确认门模式明文分级。

## 六、需要用户拍板的裁决点

1. **dy-proj 66 条老种子**：直接删除，还是迁移合并进 imported（保留其创作链 artifact）？（推荐：按 external_id 匹配合并，孤儿删除）
2. **canonical demo 4 项目**（AI Native Browser/播客等）：彻底删除，还是保留为显式标注的「示例项目」？（推荐：删除——真数据已足够丰富，demo 是泄漏源）
3. **monetization**：物理删除（路由+feature+后端+种子），还是宪法豁免保留后端 ingest 能力？（推荐：物理删除，宪法已定）
4. **新建项目表单**：contentType/内容模板/项目层平台三字段按宪法 §8 裁掉？（推荐：裁，唯一区分横/竖屏）
5. **/calendar、/accounts 孤儿页**：接侧栏入口，还是并入发布中心/设置页？（推荐：calendar 并入发布中心，accounts 并入设置）

## 七、页面文档索引

[home-dashboard](pages/home-dashboard.md) · [positioning](pages/positioning.md) · [topics](pages/topics.md) · [calibration](pages/calibration.md) · [projects-list-brief](pages/projects-list-brief.md) · [research-planning](pages/research-planning.md) · [script-production](pages/script-production.md) · [project-publishing-review](pages/project-publishing-review.md) · [knowledge-experience](pages/knowledge-experience.md) · [assets](pages/assets.md) · [publishing-calendar](pages/publishing-calendar.md) · [automations-accounts](pages/automations-accounts.md) · [settings](pages/settings.md) · [search-monetization-edges](pages/search-monetization-edges.md)
