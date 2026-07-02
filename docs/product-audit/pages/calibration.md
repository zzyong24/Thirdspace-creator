# 产品审计 · 校准中心(/calibration)

> 审计日期 2026-07-02 · dev server :3000 真机只读验证 · 证据均带 file:line 或 curl 结果。
> 宪法对照:[docs/产品定位.md](../../产品定位.md) §3 飞轮 / §5 原则 / §7 数据底座 / §8 边界。

---

## 1. 功能定位

**页面替用户完成的任务**:发布前对一条内容做「变现加权」盲预测(AI 诊断 → 铸 draft → 人锁定),发布后录入/采集真实表现,与盲预测逐维度对照出偏差,沉淀经验回流。

**与七步流水线关系**:横跨「发布(⑥)前」与「复盘(⑦)」两端(page.tsx:2 注释自标「七步⑤⑥」)。这是宪法 §3 飞轮(盲预测→发布→采集→对照→沉淀→回流)的**核心工作台**,定位高度合宪,不触碰 §8 边界(无编辑器/无视频类型/无变现中心)。

**结构**:KPI 带 + 工具条(目标 tabs / rubric 徽章 / 拉抖音 / 新建预测)+ 预测切换带 + 三栏(左:待校准内容;中:发布前预测评分表;右:AI 编导诊断)+ 底部(发布后回流对照表 + 经验沉淀)。

代码链路:
- 入口:`frontend/src/app/(creator)/calibration/page.tsx`(Server Component,session-scoped client)
- 读聚合:`frontend/src/features/calibration/calibration-data.ts`(overview / listPredictions / getRubric / getOutput 四读,各自 try/catch 降级空态)
- 交互岛:`frontend/src/features/calibration/calibration-interactive-region.tsx`(1605 行,单 island 持选中态)
- 契约:`contract/src/operations/calibration.ts`(11 op)、`contract/src/resources/calibration.ts`
- 后端:`backend/src/modules/calibration/calibration.service.ts`(getOverview 447-599 全派生)
- 装配:`frontend/src/server/persistence-client.ts`(overview port 3165-3238;seed 4522-4739;AI 触发 2106-2280)

---

## 2. 区块与交互清单

| # | 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|---|
| 1 | KPI 带 4 卡(已锁定预测/已完成回流/平均偏差/最近发现) | 只读展示 | `calibration.overview` → getOverview 派生(service.ts:467-488) | **works**(curl 返回 3/2/low/"social: 实际低于预测 1") |
| 2 | 目标 tabs(全部/传播型/涨粉型/信任型/转化型) | 前端过滤左栏列表 | 纯 client state,过滤逻辑 = `s.title.includes(goal)`(interactive-region.tsx:1508-1511) | **works 但伪**:真机验证 传播/涨粉/信任 = 0 条,转化 = 1 条(标题恰含「转化」二字) |
| 3 | rubric 徽章(变现加权评分标准 v1) | 只读展示 | `calibration.rubrics.get` rubricId 硬编码 `rubric-canonical`(calibration-data.ts:36) | **works**(curl 返回 6 维:hook/emotion/product_path/social/cta/quotable,权重和 1.0) |
| 4 | 「拉取抖音真实表现」按钮 | 调采集,成功后 refresh | `ingestion.douyin.refresh` body `externalSourceId:"src-douyin-canonical"` **硬编码**(interactive-region.tsx:1298,TODO 自认) → ingestionService.refreshDouyin(Playwright launchPersistentContext) | **wired,未触发验证**(写操作;`ingestion.douyin.status` 只读 curl 返回 `loggedIn:true`,登录态真实存在) |
| 5 | 「登录抖音」按钮(need_login 态才出现) | 弹 Chromium 扫码 | `ingestion.douyin.login`(interactive-region.tsx:1350) | **wired,未触发验证** |
| 6 | 「新建预测」按钮 | `setGoal("all")` + scrollIntoView 到左栏 | 无任何 op(interactive-region.tsx:1515-1519,注释自认 "navigation, not a fake write") | **works 但名不副实**:不新建任何东西;列表已在视野时点击近乎无感 |
| 7 | 预测切换带(「已锁定预测」chips ×3) | 切换中/右栏选中预测 | client state `setPickedId`(interactive-region.tsx:1553-1580) | **works**;但 `predictions.map` 未按 status 过滤,**draft 也会进「已锁定预测」带**(仅图标区分) |
| 8 | 左栏行「开始预测」按钮(×126) | createAITask(calibration.diagnose) → 4s 轮询 ≤75 次 → awaiting_confirmation 时**自动 confirmTask** → 铸 draft Prediction → refresh | `ai.tasks.create` → persistence-client.ts:2106-2181 → `runCalibrationDiagnose`(runStructuredNode/Vercel SDK) → confirm 分支 `createDraftPrediction`(persistence-client.ts:1644-1646) | **wired,未触发验证**(会起 AI 任务;真实成功依赖用户模型配置)。注意:**无人审即自动 confirm**,见 §6-7 |
| 9 | 左栏行「对话诊断」链接(×126) | 打开全局 ChatBox 预调 calibration.diagnose,带选中内容 | `copilotDeepLink` → query-only href `?copilot=open&surface=calibration&fn=calibration.diagnose&selKind…`(copilot-deeplink.ts:33-48) | **works**(纯 query 深链,OverlayController 就地开浮层) |
| 10 | 左栏 locked 行「录入真实表现」按钮 | 弹窗读盲预测维度 → 逐维度填真实分 → 提交 | 读 `calibration.predictions.get`;提交 `calibration.results.create`(不带 ingestionRunId → 服务端自建 manual run,§C-4)(interactive-region.tsx:404-524) | **当前不可达**:SSR 验证 `record-result-trigger` 出现 0 次(126 行全是 unpredicted,详见 §6-3) |
| 11 | 弹窗内「让编导据真实指标评分」按钮 | createAITask(calibration.score) → 轮询 → 读 listTaskResults **预填**录入框(不自动 confirm,人改后走录入) | persistence-client.ts:2182-2280+,metrics 从 analytics metric_snapshots 经 publishing 解析(2280-2310) | **wired,未触发验证**;同样因 #10 当前不可达 |
| 12 | 中栏「锁定预测版本」按钮 | draft → locked,不可逆 | `calibration.predictions.lock`(interactive-region.tsx:816-824) | **wired,当前不可见**(3 条 seed 预测全 locked,SSR `lock-prediction-button` 0 次、`prediction-locked-badge` 1 次)——逻辑上对新 draft 可见,未验证 |
| 13 | 中栏评分表 / 右栏诊断(评分条/理由/建议/表现 chips/综合判断/问题/优先修改) | 只读渲染 prediction jsonb | `predictedConversion.dimensions` + `predictedMetrics.{performance,diagnosis}`(readDimensions/readPerformance/readDiagnosis,interactive-region.tsx:118-158) | **works**(数据本身是 seed,见 §3) |
| 14 | 底部回流对照表(2 行,逐维度 预测/真实/偏差) | 只读 | overview.reflowRows(service.ts:544-591 join prediction+result) | **works**(数据是 seed result) |
| 15 | 底部经验沉淀(10 卡) | 只读 | overview.learnings → learningsService.listLearnings(persistence-client.ts:3227-3237) | **works**(真数据) |

---

## 3. 数据来源(四桶)

| 数据 | 来源链 | 桶 |
|---|---|---|
| 待校准内容 126 条(标题/平台/badge) | overview port listSubjects → projectsRepo(imported 项目 outputs)+ publishingService.getRecentPublicationsWithTitle → pglite/PG(T-030 真实采集导入) | **real**(用户真实抖音作品;但同一内容 content_output+publication 双列,53 组重复,见 §6-1) |
| KPI:已锁定预测 3 / 已完成回流 2 / 平均偏差 低 / 最近发现 | getOverview 对 predictions+results 行**真派生**(service.ts:467-488),但底下的行全是 seed | **fixture**(派生逻辑真,基底假) |
| 3 条盲预测的维度评分/理由/建议/表现 chips/AI 诊断 | persistence-client.ts:4635-4713 手写 seed(pred-canonical-1/2/3,主体 dy-out-00/01/03) | **fixture** |
| 回流对照 2 行(真实分/偏差/偏差原因) | persistence-client.ts:4718-4737 手写 seed(calibres-canonical-1/3;ingestionRunId="seed-run-calibration-1" 为合成引用,**绕过 §C-4 guard**,注释 4602-4604 自认) | **fixture** |
| 变现加权 rubric v1(6 维+锚点描述) | seed canonical(persistence-client.ts:4529-4594),FE 硬编码 id `rubric-canonical` | **fixture/config**(借鉴 cheat-on-content 校准 rubric,内容合理但非用户产物) |
| 经验沉淀 10 条 | learningsService.listLearnings(ctx, 20) 全量最新 20 | **real**(用户真实创建的 learning 行:「记录失败案例」「从项目导入」等) |
| 预测主体标题(切换带/回流表) | pendingSubjects 预解析 + `outputs.get` 补查(calibration-data.ts:111-139);curl `outputs.get dy-out-00` 返回真标题 | **real**(解析自库) |
| 抖音登录态 | `ingestion.douyin.status` → `{"loggedIn":true}`(curl 实测) | **real** |
| 目标 tabs 的「传播/涨粉/信任/转化」分类 | 数据模型**不存在**该标签,纯标题子串匹配 | **hardcoded**(伪分类) |
| predictedScore(资源字段) | deriveScore 对 `{dimensions:[...]}` 结构算不出加权和,3 条 seed 全为 "0"(curl 实测 score 0) | 死字段(UI 未展示,无害) |

---

## 4. 数据流向(写路径)

1. **开始预测** → `ai.tasks.create {taskType:"calibration.diagnose"}` → runCalibrationDiagnose(subject 读:publication 取最新 revision 标题+正文;**content_output 只取标题,scriptText 硬编码 ""**,persistence-client.ts:2154-2157)→ 产 `calibration_diagnosis` 候选 → FE 轮询到 awaiting_confirmation **自动 confirmTask** → `createDraftPrediction` 落 predictions 表(status=draft)。
2. **锁定预测版本** → `calibration.predictions.lock` → status=locked + lockedAt(不可逆,盲预测不可改)。
3. **录入真实表现** → `calibration.results.create`(无 ingestionRunId → ingestionService.ensureManualRun 造一次 source='manual' 真 run,§C-4 合规)→ 落 calibration_results + 服务端算 deviation → 主体转入回流对照。
4. **编导自动评分** → `ai.tasks.create {taskType:"calibration.score"}` → 读 locked 预测维度 + analytics metric_snapshots 真实指标 → 产**不可 formalize** 的 `calibration_score` 候选 → FE 只读候选预填录入框,人改后仍走 3(采纳门完整)。
5. **拉取抖音真实表现** → `ingestion.douyin.refresh` → Playwright 复用扫码登录态抓创作者中心指标 → metric_snapshots 落库(供 4 的真实指标)。
6. **轨B(页外写入)**:复盘 Learning 回流经 learningsService → `calibrationService.createRuleSuggestion` 落 rule suggestion(persistence-client.ts:1551-1552)——**校准页无读取/采纳入口**,见 §6-10。

---

## 5. 与宪法对照

- ✅ 定位:飞轮核心工作台,合 §3。
- ✅ §8 边界:无编辑器/无视频类型/无变现残留。
- ✅ 铁律②「AI 只产候选,confirm 门物化」:calibration.score 严格遵守(runner 绝不直写 result);诊断链路结构上也走 candidate→confirm。
- ⚠️ 原则 3「人确认关键产物」:「开始预测」在前端**自动**调 confirmTask(interactive-region.tsx:711-716),候选未经人看一眼就物化为 draft prediction。辩护是"draft 还要人锁定",即人审门后置到 lock;但「confirm 门」本身被自动化,与其他页(选题 enrich 等)的采纳交互口径需对齐。
- ⚠️ §7 数据底座「替换所有 mock/seed」:本页 KPI/预测/回流演示仍由 seed 驱动(T-030 进行中),且 seed 主体已与 imported 真数据脱节(§6-3)。
- ⚠️ §C-4 溯源:seed results 的 ingestionRunId 是不存在的合成 run(仅 seed 路径,线上路径合规)。

---

## 6. 设计不合理

| # | 问题 | 严重度 | 建议 |
|---|---|---|---|
| 1 | **待校准列表同一内容双列**:53 组标题重复(每条已发布作品同时以 content_output「未发布」+ publication「抖音」出现,curl 实测 126 条 ≈ 73 内容)。用户看到满屏两两重复的长文标题,是「怪」的第一来源 | high | listSubjects 按内容聚合去重(publication 优先,或 content_output 有对应 publication 时让位);标题截断 |
| 2 | **目标 tabs 是伪分类**:「传播型/涨粉型/信任型/转化型」实为 `title.includes("传播")` 子串匹配(interactive-region.tsx:1510),3 个 tab 恒 0 条、1 个 tab 靠标题偶然含「转化」命中 1 条。呈现为产品能力,实为字符串巧合 | high | 数据模型无 role 标签就撤掉 tabs,或标「规划中」;要做就在选题/定位层落真标签再过滤 |
| 3 | **两个数据世界脱节**:KPI(3 locked/2 reflows)、预测切换带、回流对照全部挂在 seed 主体 dy-out-*(dy-proj-00 source='manual',curl 实测);而待校准列表因 hasImported 让位逻辑(persistence-client.ts:3179-3186)只列 imported 项目(output-8639205b-*)。结果:左栏 126 条全「未预测」,却有 3 条「已锁定预测」凭空存在、永远无法录入回流(SSR 实测 record-result-trigger=0)。KPI 对用户不可解释 | high | seed 预测/回流要么迁到 imported 主体,要么随 hasImported 一起让位隐藏;KPI 与列表必须同一口径 |
| 4 | 「新建预测」按钮只滚动到左栏(interactive-region.tsx:1515-1519),不新建任何实体;列表在视野内时点击近乎无反馈 | med | 改名「去选内容」或直接聚焦第一条未预测行并高亮;或干脆移除(左栏本身就是入口) |
| 5 | 「最近发现」KPI 卡大数字显示「1」(latestFinding 有值时 value="1",interactive-region.tsx:260),真正的发现文本挤在 hint 一行截断。数字 1 无信息量 | med | 该卡改为文本主体布局,或展示最近发现的维度名+偏差值 |
| 6 | 切换带标题「已锁定预测」,实际列出全部 predictions 含 draft(interactive-region.tsx:1550-1553 无 status 过滤,仅图标区分) | med | 改名「我的预测」或分组 draft/locked |
| 7 | 主体已有 **draft** 预测时,左栏行 badge 仍是「未预测」+「开始预测」(service badge 只认 locked,service.ts:510-511)——用户可对同一主体反复起诊断、铸出多条 draft,且界面无提示 | med | badge 增加「草稿待锁定」态,或 StartPrediction 检测已有 draft 时改为「查看草稿」 |
| 8 | AI 编导诊断对 content_output **只喂标题**(scriptText 硬编码 "",persistence-client.ts:2156-2157 注释自认 Slice 1)。对已导入真实作品(有逐字稿)诊断质量注定浅,但 UI 呈现为完整「AI 编导诊断」 | med | 接上 transcript/文稿供给;接不上前在诊断卡标注「仅基于标题」 |
| 9 | badge 枚举 `reflowed` 前端有标签和渲染分支(interactive-region.tsx:161-165),服务端永不产出(已回流主体直接 continue 出列表,service.ts:508-509)——死码+语义漂移 | low | 移除前端 reflowed 分支或让服务端真出该态 |
| 10 | **轨B 断链**:`calibration.suggestions.list/adopt` 契约+后端+真数据齐备(curl 实测 1 条 pending「利他性」维度建议,来自复盘 Learning 回流),校准页零入口——用户永远看不到、采纳不了,rubric bump 飞轮断头 | med | 在 rubric 徽章旁或经验沉淀区挂「待采纳规则建议」列表 + 采纳按钮 |
| 11 | 左栏 126 行 × 每行两个动作按钮(开始预测/对话诊断),巨长列表无搜索/分页/排序 | low | 加搜索框与「最近发布优先」排序;重复治理(#1)后量减半 |

---

## 7. 疑似 bug

| # | 描述 | 证据 | 严重度 |
|---|---|---|---|
| 1 | **回流录入入口不可达**(当前数据状态):唯一的「录入真实表现」UI 只挂在左栏 locked 行,而 3 条 locked 预测的主体被 imported 让位排除出列表 → SSR 全页 `record-result-trigger` 出现 0 次。页面宣称的「发布后回流真实数据校准」对现存预测无法执行 | curl /calibration SSR 计数;persistence-client.ts:3179-3186 让位逻辑;seed 主体 dy-out-*(4640/4666/4692)vs 列表主体 output-8639205b-* | high |
| 2 | **录入真实分无范围校验**:Input 的 min=1/max=5 只是 HTML 属性,submit 时 `Number(raw)` 任意有限数直接进 actualMetrics(interactive-region.tsx:504-510);contract body `z.record(z.unknown())`(operations/calibration.ts:116)不拦 → 可录入 99 或 -5,偏差表/KPI 档位随之失真 | interactive-region.tsx:507-509;contract 无 min/max | med |
| 3 | subjectTitles 只解析 `content_output` 类型预测(calibration-data.ts:121 filter),publication 类型的 locked/已回流预测在切换带与回流表显示裸 id(如 `pub-xxx`) | calibration-data.ts:120-123;interactive-region.tsx:1575-1577 回退 `p.subjectId` | low |
| 4 | `predictedScore` 恒为 0:deriveScore 按 conversion map 顶层 key 加权,而实际结构是 `{dimensions:[...]}`(curl 实测 3 条 score 全 0;seed 注释 4604-4606 自认)。当前 UI 未展示故无用户影响,但任何未来消费该字段的排序/看板都会拿到假 0 | curl calibration.predictions.list;persistence-client.ts:4656 | low |
| 5 | 目标 tab「转化型」显示 1 条,纯因该标题含「转化」二字——伪过滤在真数据下随机命中,用户会误信分类真实存在 | curl 模拟 `title.includes` 计数:传播 0/涨粉 0/信任 0/转化 1 | low(#6-2 的实证) |

---

## 8. 待对齐点(跨页/全局)

1. **确认门口径**:本页「开始预测」自动 confirmTask(无人审预览),其他 AI 采纳面(选题 enrich、素材、脚本)是否也自动?宪法原则 3 的「人确认」到底落在 candidate confirm 还是 lock/采纳,需全局统一。
2. **seed 让位策略**:hasImported 后 manual/demo fixture 主体从列表让位,但依附其上的 seed 预测/回流/KPI 不让位 → 半让位状态。全产品需统一「有真数据时 fixture 整链隐藏」。
3. **「已锁定预测」命名 vs draft 混入**:与其他页「候选/草稿/已确认」术语体系对齐。
4. **DOUYIN_SOURCE_ID 硬编码 `src-douyin-canonical`**(interactive-region.tsx:1298 + automations 调度 collectors 同样 fallback,persistence-client.ts:3293)——与「多账号/用户绑定来源」方向冲突,TODO 已自认,应进 BACKLOG。
5. **经验沉淀口径**:contract 注释称 "calibration-related Learnings"(resources/calibration.ts:169),实际 wiring 列**全量**最新 20 条(persistence-client.ts:3227-3237,无 calibration 过滤)——「论文对比矩阵」等无关经验也出现在校准页。与复盘页的经验沉淀是同一服务同一数据,需明确本页是否只列校准相关。
6. **诊断双入口**(开始预测直铸 vs 对话诊断 ChatBox)并存是 SPEC §3.4 设计,但两按钮并排对新用户语义模糊,可在全局 ChatBox 收敛评审时一并定。
7. **rubric 单例假设**:FE/后端多处硬编码 `rubric-canonical`(calibration-data.ts:36、persistence-client.ts:2166-2169、2227-2229),契约却支持 createRubric/bumpVersion 多 rubric——要么产品明确「每用户一套标准」,要么去硬编码。
