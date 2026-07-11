# SPEC:选题自动驾驶 —— 每天自动出题 + 多渠道证据入口 + 正向归因回流(借鉴 dy-- AI 内容罗盘)

> 日期 2026-07-11 · 状态:⚠️ **CONCERNS→已处置→可开工 T-235a~e**(MiniMax gate:方向合宪/复用合理/无缩水;1 major=归因×learnings 边界 + 4 minor,已逐条内联,见 .review.md) · 对照宪法 [docs/产品定位.md](../../产品定位.md)
> 单一执行总账在 [BACKLOG.md](../../../BACKLOG.md)(T-235)。来源:用户诉求「对标+选题不够自动化,入口渠道不够多,期望每天自动结合定位+我的内容找选题」+ 参考项目 `/Users/zyongzhu/Workbase/dy--`(AI 内容罗盘)蒸馏报告(T-235 调研)。

## 0. 一句话

把选题从「用户对话触发的静态池」升级为**「每天自动供给的驾驶舱」**:每日定时自动出题(多依据合并+防茧房护栏)+ 热点入口从单条 web 搜索升级为多源真数据(RSS 热榜+平台内证据)+ 收藏蒸馏新入口 + **已发布作品按选题维度归因回流**(爆款公式/选题验证→下一轮实验选题自动进池),UI 让用户睁眼看到「系统昨晚替我干了什么」。

## 1. 问题(现状不够,均已核实)

- **出题 100% 手动**:全仓无 `scheduled.topic`;topic.generate 只有用户在 Copilot 对话触发(`topic-generate-island.tsx:29`,4 依据按钮只是预填话术)。唯一自动供给是 benchmark→选题转化(T-212c),只覆盖对标一源。
- **热点入口薄**:trend 出题 = 定位简报前 60 字拼 "最新热点 趋势" 做一次 web 搜索取 8 条 title+snippet(`topic-task-adapter.ts:57-76,108-123`)——无平台内数据、无互动量证据、无热榜/RSS 定向源。dy-- 的热点是「按定位关键词拉平台内真实视频+点赞数据」,证据密度完全不同。
- **无收藏蒸馏入口**:knowledge-distill 只收用户手动倒的原文(`knowledge-distill-runner.ts:1-16`);用户在抖音收藏的对标内容无法进管线。
- **只有负向回流没有正向回流**:T-212d 有「淘汰原因→偏好」,但**已发布作品的实绩**没有按「选题类型/Hook/结构」维度归因,爆款经验不会变成下一批候选。learnings 是脚本级,不是选题级。

## 2. 设计(5 切片,全部装在现成骨架上,非重造)

> **复用核实(file:line,gate 处置用)**:调度骨架 `scheduled-collection-scheduler.ts`(node-cron+triggerScheduledJob+按天幂等 idempotencyKey=jobId:自然日);每日 job 模板 `collection-bootstrap.ts:36-64`(现 4 条:9:00/9:10/9:20/9:30);出题装配 `topic-task-adapter.ts:84-159`(定位/评论/知识/trend 四依据);RSS 免 key 适配器**已存在** `ai-worker/src/runtime/search-rss.ts:109`(注册于 persistence-client:5898-5906);防茧房护栏 `topic-preference-guardrail.ts`(rankWithExploration 探索位);拆解→自动进池范式 `benchmark-teardown-runner.ts`(fit=high、≤3/run);候选 source enum `candidate.service.ts:139`;逐字稿 `transcribe-runner.ts`(T-225 已打通);知识蒸馏确认门 `knowledge-distill-runner.ts`;选题中心 UI `topics-page.tsx`/`topic-generate-island.tsx`。dy-- 参照锚:归因字段 `dy--/backend/main.py:2561-2578`+`database.py:222-247`;公式回流 prompt `main.py:2663-2688`;热点流水线 `main.py:1179-1450`;交叉验证聚类 `main.py:1774-1809`。

### 2.1 S-A 每天自动出题(scheduled.topic)
- 新 sourceKind `topic.daily`,job 建在 collection-bootstrap 默认模板(错峰 **9:40**,排在 benchmark 9:30 后,当天新拆解可入引用),复用 triggerScheduledJob 按天幂等。
- runner 复用 topic-task-adapter 装配:**多依据合并出一批**(定位+评论信号+知识库+热点 brief),candidates.create 落 pool(source 透传真实渠道);防灌库 ≤N/天(配置化,默认 5);**评分排序必过 T-212d 护栏**(每天自动出题最怕越出越窄,探索位保底)。
- 未配文本模型 → 诚实跳过(job 结果注明「未配模型」,不空转不编)。

### 2.2 S-B 热点多源证据(RSS 热榜 + 平台内证据)
- **信源架构(用户拍板:浏览器自动化为主,RSS 为辅)**——「稳定 RSS 信源太难找,浏览器自动化想去哪找就去哪找」:
  - **通用网页信源(主路)**:用户登记任意站点/页面为信源(热榜页/垂类社区/搜索结果页,需登录的走 **Web Session Vault(T-217a 已建)** 登录态);定时用浏览器自动化访问(复用 **readUrl/web-reader(T-217b 已建)**:launchPersistentContext+登录态+Readability 抽正文,或站内 API 页内 fetch 范式)→ **AI 结构化抽取**信号(runStructuredNode:标题/热度指标/链接/时间,无热度字段则只取标题+链接,不编)→ 喂选题 brief。信源实体=「{url, 名称, 是否需登录(域名→vault 状态), 抽取备注}」,与对标源/黑马关键词并列管理。
  - **RSS(辅路)**:有稳定 feed 就配(复用 search-rss:109 适配器),没有不强求。
  - trend basis 时**并行拉「已登记信源+RSS+web 搜索」**拼 brief(改造 topic-task-adapter:108-123 trend 分支);单信源失败跳过不拖垮(同采集容错纪律)。
- **平台内证据 = 低粉黑马雷达**(用户实战验证方法论,参照 `xianwa-feishu/yuyu/darkhorse.py`;**[gate-F5] 可选强化的边界**:S-B 验收以 RSS 热榜+web 并行为准,黑马雷达不做不影响验收;做的条件=sidecar 登录态可用+限流额度允许,失败诚实降级为纯 RSS+web):
  - **原理**:低粉+新发(≤48h)+高赞 = 算法在推**内容本身**而非账号权重 → 选题/形式已被验证且**跟拍窗口未关**。核心信号=**赞粉比**(digg/fans)。
  - **实现**:按定位关键词搜抖音(publish_time=1 一天内 + sort_type=1 最多赞,页内 fetch 借登录态——与 fetchDouyinUserPosts 同款范式 douyin-cdp:1072,走 douyinGateway 限流+验证码跳过);**黑马三档纯函数**(可单测,阈值配置化):strong=digg≥1000 且(fans≤10w 或 赞粉比≥1)/ niche=digg≥200 且赞粉比≥0.5 / mid=digg≥500 且 fans≤3w;赞粉比优先排序,每关键词 top5。
  - **落库+转化**:落 benchmark_works(发现方式=黑马雷达,爆款倍数字段存赞粉比)→ 复用 teardown 拆解(prompt 注明时效敏感)→ 进池候选标「🔥跟拍·时效」徽标(S-E 今日新选题里优先展示)。关键词来源=定位 keywords+用户可配。参照锚:darkhorse.py:60-105(搜索+三档过滤)/:108-127(落库字段)/:130+(时效拆解 prompt)。
  - 对标快照「≥2 账号发过」交叉验证聚类(参照 dy-- main.py:1774-1809)仍为可选补充信号。
- 出的选题带**数据支撑**(来源链接/互动量),不再是新闻摘要式空转。

### 2.3 S-C 收藏蒸馏入口
- 「我的收藏」采集:launchPersistentContext+登录态(**不抄 dy-- 的 connectOverCDP**,记忆铁律),新 sourceKind `favorites` 或手动触发。**[gate-F2] 前置依赖:T-225 逐字稿管线——已完成 ✅ 2026-07-11(三层修复真机跑通),非阻塞。**
- 蒸馏链复用:transcribe-runner(T-225)→ 分类蒸馏(仿 dy-- `_distill_content_to_asset` 先判库再落):进知识库走 knowledge-distill **确认门**(铁律②);判为选题 → candidates.create(source enum 加 `favorites`,动 `backend/src/schema/candidate.ts` + service:497 标签表,additive)。

### 2.4 S-D 正向归因回流(选题验证库,复盘→出题闭环)
- 新归因 runner(仿 benchmark-teardown 编排+端口工厂):读已发布作品(publication + self.detail 明细 + 逐字稿)→ runStructuredNode 绑 Zod **枚举化字段**(topic_type/hook_type/structure_formula/why_it_worked/why_it_failed/reusable_formula/next_experiment,参照 dy-- 字段模板)→ 聚合沉淀「爆款公式/避坑/Hook/选题验证」资产 → **next_experiments 自动 candidates.create 进池**(标记 source=回流实验,≤3/run 防灌库)。
- 表现分层用**相对本账号基线**(平均赞/完播的倍数),不用绝对阈值(dy-- 的赞≥100 不抄)。
- **[gate-F1] 归因 × learnings 边界(major 处置)**:两体系**维度不同、消费方不同、不去重**——①归因产物=**选题维度**资产(新 kind,枚举字段可聚合),消费方=选题池排序/选题验证库/next_experiments;②learnings=**脚本级**经验(绑 project/script 的 edit_delta/洞察),消费方=脚本生成/复盘。同一作品两者并存(各答各的问题);关联锚=都带 projectId 溯源,归因进池的实验候选附归因引用(点开可看依据)。**不共写同一表、不互相触发**(归因由发布实绩触发,learnings 由复盘/编辑触发)。
- **[gate-F3] 归因枚举值(SPEC 内列全,dy-- 模板为底可调)**:topic_type ∈ {教程,观点,案例拆解,工具测评,热点跟进,故事}; hook_type ∈ {反差,具体数字,痛点直击,悬念,利益承诺,身份共鸣}; structure_formula ∈ {痛点-方案-证明-CTA,三步教程,对比实验,叙事-转折-干货,清单式}; 其余(why_it_worked/why_it_failed/reusable_formula/next_experiment)为受限自由文本(带逐字稿引用,无稿不产——T-224 诚实门同源)。
- 数据侧 CreatorOS 已领先(self.detail 自动采完播/封面点击,dy-- 要手动传 xlsx)。

### 2.5 S-E UI:被服务感知(选题中心改版)
- **「今日新选题」条带**:当天自动进池候选(createdAt=今天 过滤,无需新表),带来源徽标(热点/对标/收藏/回流实验)+ 一句依据摘要;空态诚实「今晨采集无新信号」。
- **供给链健康条**(仿 dy-- 顶部流水线,语义=自动供给):对标采集 ✓N 爆款 → 拆解 M → 今日出题 K → 待审 X(数据源=scheduling lastRun + ai_task,与 /automations 联动)。
- 4 依据按钮保留降级为「手动加餐」;**热点源配置入口**与 BenchmarkSourcesButton 对称并列(心智=「我的选题信号源」)。
- 候选卡「实验」徽标(来自 S-D)可点开归因依据——「系统在学我」的最强感知点。
- 保留现有裁决:审阅采纳走 Copilot 对话、立项走人确认门。**[gate-F4] 预览确认节点**:T-235e 开工前先产 UI 预览稿(布局描述/示意)交用户拍板,拍板后才写前端代码(a~d 后端切片不受此门约束可先行)。

## 3. 边界(不抄什么,防走样)

- **不抄** Python 线程内存任务/60s daemon(有 ai_task+node-cron+按天幂等)、文件夹全文当 context(走 creative-context 结构化装配)、connectOverCDP(launchPersistentContext 铁律)、自由文本扒 JSON(runStructuredNode 铁律)、静态 HTML 报告落盘、写死单模型(per-capability 用户可配铁律)、绝对爆款阈值(用相对基线)。
- **自动≠无门**:每日自动出题落 pool 是「候选供给」(source 可区分),但立项/入知识库仍走人确认门(铁律②)。
- **防茧房是硬前置**:S-A 的排序必挂 T-212d 护栏,不是可选项。

## 4. 切片(拆 Task)

- **T-235a** S-A 每天自动出题 job(sourceKind topic.daily + bootstrap 模板 + 多依据合并 runner + 护栏排序 + 防灌库)
- **T-235b** S-B 热点多源(RSS 热榜源配置+管理 + trend brief 并行多源 + 平台内证据可选强化)
- **T-235c** S-C 收藏蒸馏入口(favorites 采集 + 分类蒸馏 + source enum additive)
- **T-235d** S-D 正向归因回流(归因 runner 枚举化字段 + 四库沉淀 + next_experiments 进池)
- **T-235e** S-E 选题中心 UI 改版(今日新选题 + 供给链健康条 + 信号源并列 + 实验徽标;**先预览后动手**)

## 5. 验收

- 早上打开选题页:「今日新选题」有当天自动供给的候选(来源徽标+依据),供给链健康条显示昨夜各环节实绩;连续多天不重复不收窄(护栏探索位可查)。
- 配置一个 RSS 热榜源 → 次日出题 brief 含热榜证据(带链接);收藏一条抖音视频 → 采集蒸馏后进对应库(知识过确认门/选题进池)。
- 发布作品出实绩后 → 归因产枚举化结论 + 选题验证资产 + ≤3 条「实验」候选进池,可点开看依据。
- 三端 typecheck + 单测绿;调度/采集归 sidecar 真机验;未配模型/无源/无数据各态诚实降级。
