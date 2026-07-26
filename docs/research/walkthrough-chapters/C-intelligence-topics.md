# 章节 C:内容雷达(intelligence) + 选题(topics)

> 日期:2026-07-26
> 任务:T-528 新用户 0→1 标杆路线 · 功能域盘点分章
> 方法:只读代码盘点(subagent),每条断言附 `file:line`;无证据处标 ⚠️未验证
> 对照:产品宪法 [docs/产品定位.md](../../产品定位.md) §7 记「选题 = 部分实现、发布阻断」;R-TOPIC(§9)要求每候选保留 source/证据/account、AI 不直接灌库、promotion 原子创建项目

核心发现:**AI 不直接灌库、候选带溯源 = 符合 R-TOPIC ✓;但 promotion 立项是背靠背三写而非单一事务,与 R-TOPIC「原子创建」有实证落差**(见 C-2 诚实标注)。

---

## C-1 内容雷达(路由 `/intelligence` · 侧栏「内容雷达」)

- **如何到达**:侧栏项 `frontend/src/components/shell/sidebar.tsx:94`(`{ id:"intelligence", label:"内容雷达", href:"/intelligence", icon:radar, match:matchPrefix("/intelligence") }`);选题页头也有「内容雷达」外链按钮 `topics-page.tsx:242-245`。
- **主文件**:
  - 路由 Server Component:`frontend/src/app/(creator)/intelligence/page.tsx:11-54`
  - 主组件:`frontend/src/features/intelligence/intelligence-workbench.tsx:525`(`IntelligenceWorkbench`)
- **首次进入(空态)小白看到什么**:
  1. 未绑定/未选抖音号 → 直接返回 `<ZeroAccountGuidance />`(`page.tsx:13`),提示按抖音号隔离、绑定后自动建采集任务(`zero-account-guidance.tsx:59`)。
  2. 已选号但无来源 → 三栏工作台,主区渲染 `RadarEmptyState`,标题「先添加一个真实来源」,文案列出可加「抖音博主主页、网页、RSS 或黑马关键词」(`intelligence-workbench.tsx:1641-1656`)。
  3. 顶部标语「只收公开作品与公开计数 · 评论正文不采集 · 逐字稿只手动排队」(`:826-829`)。
- **主路径**:
  1. **加来源**:点顶栏「添加来源」→ `AddSourceDialog`(`:2024` 触发,`:1823` 定义)。五类来源单选 `source-type-choices`:博主主页 / 我的收藏 / 网页 / RSS / 黑马关键词(`:2040-2068`)。
  2. **真实验证再保存**:先点「测试来源」/「读取我的收藏夹」,`verify()` 调 `previewProfile`/`listFavoriteFolders`/`previewWeb`(`:1864-1933`);**验证通过才允许「保存并开始首次同步」**(保存按钮 disabled 门控 `:2176-2189`,须有 preview)。黑马关键词无预览,由首轮任务验证(`:2149-2152`)。
  3. **可选整理**:「新建分类」`AddCollectionDialog`(`:1659`);「粘贴分享链接」`ImportDouyinShareDialog` 从抖音分享话术建档「分类→博主→视频」(`:1726`,`:1784-1787`)。
  4. **同步观察**:左栏来源行「同步」按钮 → `runSource` → `startRun` + `watchRun` 轮询(`:693-723`,`:666-691`);「记录」看运行历史 `SourceRunHistoryDialog`(`:1098`)。同步结果诚实分级:无变化 / 受阻(登录失效/验证码)/ 失败(**不误记 0 条**),文案见 `runResultMessage`(`:478-507`)。
  5. **选内容看证据**:点作品卡 `ItemCard`(`:1256`)→ 右栏 `ItemDetail`(`:1309`):公开四指标、来源快照、逐字稿状态。
  6. **手动转写**:逐字稿「手动转写」→ `enqueueTranscript`(`:725-745`),明确「不会自动转写」。
  7. **转成选题**(衔接选题域):逐字稿 `done` 且有定位版本 + 来源快照后,「生成选题候选」→ `previewTopic`(`:747-778`)产可编辑候选 `TopicCandidateEditor`(`:1527`);「确认写入选题池」→ `confirmTopic`(`:780-811`)。
- **关键前置依赖**:
  1. 已绑定并选中抖音号(`page.tsx:13`);
  2. 抖音登录态(主页/收藏/黑马来源验证与同步都需要,错误码见 `favoriteFoldersErrorMessage` `:401-425`);
  3. 生成选题候选需先在定位中心存一版定位(`positioningVersionId`,`page.tsx:16-20` + `:1431-1433`)且逐字稿 `done`(`:1439-1442`)。
- **产出 & 衔接**:产出=账号内真实作品库 + 公开指标 + 来源快照 + 逐字稿;转选题后写入选题候选池(source 归为对应枚举),下游进 `/topics`。组件明确「这里只创建选题;口播稿生成和改写仍在 Project 创建后进行」(`:1634-1636`)。
- **⚠️ 未实现 / 占位 + PRD 差异**:
  - **左栏来源/分类点击不做真过滤**:选中来源仅聚焦信息,作品列表仍展示账号内全集,代码显式注明「当前不伪造本地归属关系」(`:614-618`)。属已知占位。
  - 顶栏「待处理 N / 受阻 N」来自 `workspace.pendingCount/blockedCount`,为真实读侧字段(`:833-838`),非占位。
  - PRD 对照:内容雷达在 §7 无独立行(是 T-482 后新增的选题上游观察面),其「公开数据、评论正文不采集、逐字稿手动」与宪法「只读真实数据/不伪造」一致,未见冲突。
- **归档小结**:`/intelligence` 是「定位之后先观察真实信源」的工作台——五类来源须真实验证后同步,作品逐字稿手动转写,再经定位对齐生成可编辑选题候选写入选题池;左栏分类当前只做信息聚焦、不做真过滤(诚实占位)。

---

## C-2 选题(路由 `/topics` · 侧栏「选题」)

- **如何到达**:侧栏「选题」项 `sidebar.tsx:97`(`matchExact("/topics")`,七步③、SPEC §5.5,紧跟定位中心)。
- **主文件**:
  - 路由:`frontend/src/app/(creator)/topics/page.tsx:26-55`
  - 页面壳 + 服务端读:`frontend/src/features/topics/topics-page.tsx:130`(`TopicsPage`)/ `:208`(`TopicsView`)
  - 三栏交互岛:`frontend/src/features/topics/topics-interactive-region.tsx:1375`(`TopicsWorkspace`)
  - AI 选题会带:`topic-generate-island.tsx:65`;今日条带/供给条:`topics-supply-region.tsx`;受众信号:`topics-audience-signals.tsx`
- **首次进入(空态)小白看到什么**:
  1. 未选号 → `<ZeroAccountGuidance />`(`page.tsx:45-47`)。
  2. 已选号但无候选 → 页头「选题中心/从真实信号出题…全流程」(`topics-page.tsx:234-237`);今日条带空态「今天早上暂时没找到新选题…」(`topics-supply-region.tsx:115-121`);候选池空态 `candidate-empty-state`,提示「用一句话让编导起草,或开 AI 选题会」+ 新号引导「先到自动化中心跑一次采集」(`topics-interactive-region.tsx:1333-1364`)。
- **主路径(五类来源进候选 → 补全/排序/淘汰 → 立项)**:
  1. **五类来源进候选**:
     - **手动灵感(idea)**:候选池顶「一句话编导起草」`IdeaDraftForm` → 先 `createCandidate{source:"idea"}` 建裸卡入池,再开 Copilot 深链 `topic.enrich` 对话补全(`:1188-1230`);或「手动详填」`CreateCandidateForm` 富字段表单,`createCandidate` + 可选 `patchCandidate`(`:607-686`,source 固定 `idea` `:637`)。
     - **热点(trend)/评论问题/知识库 出题**:「AI 选题会」4 按钮 → Copilot 深链 `topic.generate` 预填话术,对话内逐条采纳(`topic-generate-island.tsx:33-63,89-102`)。弹窗任务流已退役,全走 Copilot(文件头注 T-060①)。
     - **评论/需求(demand)**:页头「受众信号」按钮 → `audienceSignals.list` 弹窗 → 每条「转为候选」经确认门 `linkSignalToCandidate{}`(省 candidateId,后端孵化 demand 候选)(`topics-audience-signals.tsx:65-85,159-162`)。
     - **对标(benchmark)/收藏夹(favorites)**:由采集 runner 写入(title 前缀「🔥跟拍|」「实验|」在今日条带解析,`topics-supply-region.tsx:54-71`);UI 无手动建 benchmark/favorites 入口,靠自动供给。
  2. **补全**:候选卡「补充信息/补全选题卡」`EnrichButton` → Copilot 深链 `topic.enrich`(`:519-554`);右栏空卡也给同一 CTA(`:1068-1082`)。
  3. **排序**:`CandidateSortControl` 四档 推荐/定位契合/需求热度/防茧房,经 `?sort=` URL 导航重发 `listCandidates`(`:888-918`,`topics-page.tsx:151-170`)。左栏来源行仅 trend/idea 可点做真过滤(`?source=`),其余 5 行纯展示(`:93-96,966-978`)。
  4. **淘汰**:`DropButton` → 弹窗填淘汰原因(防茧房校准信号)→ `patchCandidate{status:"dropped", dropReason?}`,可留空直接丢(`:414-509`)。
  5. **立项 promotion**:候选卡/详情「立项为 Project」→ `promoteCandidate` → 拿 `projectId` 跳 `/projects/:id`(`:270-284,1099-1113`)。后端 `promote`(`backend/src/modules/candidate/candidate.service.ts:519-579`):候选卡映射成 Brief 草稿建 project(brief 阶段)→ 翻 promoted → 写 topic_promotions 行。
- **关键前置依赖**:① 选中抖音号(session-scoped 读,`page.tsx:52`);② 候选信号来自该号采集数据(空态引导跑采集 `:1349-1362`);③ AI 出题/补全依赖 Copilot + 模型配置;④ 立项依赖 projects 模块。
- **产出 & 衔接**:产出=候选池(带 source/证据链接/评分/选题卡)+ topic_promotions;立项创建 Project 并跳转 `/projects/:id`,衔接项目/制作域。
- **⚠️ 未实现 / 占位 + PRD 差异(诚实标注)**:
  - **【实证落差】PRD §9 R-TOPIC「promotion 原子创建项目」与代码不符**:后端注释显式说明「realized 模块未包事务,无 UnitOfWork helper,靠 candidate_id 唯一索引兜底」(`candidate.service.ts:569-576`)。即 createProject → setPromoted → createPromotion 是**背靠背三写**(pglite 同进程同步),非单一事务。§9 发布验收要求「promotion 重试只产生一个 project」——当前靠 topic_promotions 的 candidate_id 唯一索引防重复 promotion 行,但 project 本身若在 setPromoted 前失败仍可能留孤儿 project。**标注为发布阻断项、原子性待事务化**(与 PRD §7「选题=部分实现、发布阻断」一致)。
  - **PRD「AI 不直接灌库」符合 ✓**:`createFromAIResult` 建的候选 `status` 恒为 `pool`,须人工采纳/立项(`candidate.service.ts:603`);受众信号、AI 选题会均经确认门。
  - **PRD「每候选保留 source/证据/account」符合 ✓**:候选卡渲染 `sourceReferences` 外链(`topics-interactive-region.tsx:178-210`),source 徽标恒显示,读侧 session-scoped 按号隔离。
  - **左栏 7 行来源中 5 行为纯展示**(comment/consultation/knowledge/highPerformer/review 映射不到 candidate.source 枚举,`:82-96`),刻意「不做假过滤」的诚实占位,非缺陷。
  - **小瑕疵(可修接线遗漏)**:`AudienceSignalsButton` 的 `onRefresh` 可选且 `topics-page.tsx:240` 未注入,转候选成功后不会触发候选池 `router.refresh()`(需手动刷新才见新 demand 候选)。
- **归档小结**:`/topics` 是三栏候选池 C 位工作台——五类来源(手动 idea / AI trend 系 / 受众 demand / 自动 benchmark·favorites)带溯源进池,经排序/补全/带原因淘汰后「立项为 Project」跳转;AI 只产候选不灌库(符合 R-TOPIC),但 promotion 当前是背靠背三写而非真事务、靠唯一索引兜底(与 PRD「原子创建」有落差,应标发布阻断)。
