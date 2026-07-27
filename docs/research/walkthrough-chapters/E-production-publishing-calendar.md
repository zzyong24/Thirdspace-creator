# 章节 E:受控视频制作 + 发布中心 + 内容日历

> 日期:2026-07-26
> 任务:T-528 新用户 0→1 标杆路线 · 功能域盘点分章
> 方法:只读代码盘点(subagent),每条断言附 `file:line`;无证据处标 ⚠️未验证
> 对照:产品宪法 [docs/产品定位.md](../../产品定位.md) §7 记「视频制作 = 已实现但发布阻断」「发布与日历 = 部分实现、发布阻断」;R-PRODUCTION / R-PUBLISH(§9)、P-06(不做通用 NLE)

核心结论:**全域无自动真发布——平台发布只有 `MockPublisher`(假 external id、无网络),且前端零触发点**;真正的发布动作只有「稿面粘抖音链接登记」这一条 manual 路径。制作管线代码完整、非 NLE,唯一「阻断」是渲染需真实模型 + ffmpeg/Chromium 环境(需配置,非未实现)。

---

## E-1 受控视频制作(路由 `/projects/[projectId]/production` · 入口=项目阶段条「制作视频」)

- **如何到达**:
  - 阶段条 stepper 渲染三段「脚本 | 制作视频 | 复盘」,每段是 `next/link` 到 `/projects/<id>/<stage>`(`frontend/src/components/navigation/project-stage-stepper.tsx:12-14,20-23`)。段映射真源 `frontend/src/app/(creator)/shell-router.tsx:92-96`(`PROJECT_STAGES`),production 段解析回子路由 `frontend/src/features/projects/project-href.ts:21-22`。
  - **门控**:可点 = 已达阶段(completed)/ 当前 / current+1;更靠后阶段锁定(`project-stage-stepper.tsx:96-102`)。故新项目通常需先推进到「脚本」之后才能点进制作。
  - 另有 Dashboard/项目列表卡片按 `currentStage` 直达(`dashboard-page.tsx:242`、`projects-page.tsx:822`)。
- **主文件**:
  - 路由(Server Component,user-scoped 读):`frontend/src/app/(creator)/projects/[projectId]/production/page.tsx:112`(`ProductionRoute`)
  - 工作台客户端岛(2106 行):`frontend/src/features/production/production-workbench.tsx:321`(`ProductionWorkbench`)
  - 四决策确认卡:`frontend/src/features/production/video-decision-preview.tsx:60`(`VideoDecisionPreview`)
  - 确定性流程助手(状态机步进/渲染 inputs/B-roll 聚合,纯函数):`frontend/src/features/production/production-flow.ts`
  - SRT 校验纯函数:`frontend/src/features/production/srt-check.ts`
- **首次进入(空态)小白看到什么**:
  - 顶部状态条(`drafting→recording→editing→rendering→ready`,`production-workbench.tsx:1380-1418`)。
  - ①「口播稿(提词用)」区:项目还没稿 → 空态「本项目还没有口播稿 —— 先回稿面把脚本写好」(`:1462-1467`);有稿则显只读提词 textarea + 复制纯口播稿按钮 + 录制指引(`:1447-1460`)。
  - 「制作方式」二选一:默认「用 CreatorOS 制作」/ 可切「直接上传成品视频」(`:1470-1511`)。
  - ②③④ 上传区/B-roll/AI 分场决策 区在「用 CreatorOS 制作」下才显(`:1609`);④「AI 分场决策」按钮 disabled,提示「备料齐(口播稿+粗剪视频+SRT)后可发起」(`:1892-1896`)。
  - 底部常驻「导出素材包(zip)」辅助入口(`:1978-2018`)。
- **主路径**:
  1. **备料·口播稿提词**:稿面 sections 投影拼纯文本口播稿由路由读入(`production/page.tsx:143-172`),工作台经 `extractVoiceoverText` 剥离画面/字幕/时长标记得纯口播稿(`production-workbench.tsx:160-214`),可一键复制(`:341-349`)。
  2. **上传粗剪视频 + SRT**:两阶段上传链 `createUpload→PUT→completeUpload` + `createMaterialLink(stage="production")`(`:235-287`);视频时长走 `<video>` metadata 客户端读**免 ffprobe**(`:116-141`);上传即推进状态机 recording/editing(`:563,590`)。
  3. **SRT 匹配校验(挡在提交前)**:时长匹配 `checkSrtDurationMatch` + 与口播稿相似度 `checkSrtScriptMatch`(`:496-506`);不匹配显具体原因,用户可勾「我确认没传错,继续(覆盖校验)」明确覆盖(`:1734-1746`)。
  4. **③ B-roll 素材(可选)**:手动上传 role=broll(`:757-786`),外加自动聚合候选(脚本画面点名 / 论点树挂载 / 项目弹药,带来源徽标,可剔除,`:606-736,1751-1873`)。
  5. **④ AI 分场决策**:`createAITask({taskType:"video.decisions", inputData:{projectId,srtText,script,excludedAssetIds}})`(`:1031-1045`)→ live dispatch 后台跑 → 持续轮询退避到 30s 封顶、**绝不静默放弃**(`:1083-1129`)→ `awaiting_confirmation` 渲 `VideoDecisionPreview`。四决策 = 分场 scenes / 信息卡 cards / B-roll broll / 双语字幕 subtitles(`video-decision-preview.tsx:73-97`,信息卡 kind:数据/金句/清单/对比/代码/配图 `:24-31`)。
  6. **确认门(渲染唯一入口闸)**:预览卡内可删信息卡 / 换选或移除 B-roll(**场景与字幕本期只读**,`video-decision-preview.tsx:72-84`);确认 → `assembleVideoRenderProps` 组装 props → `onConfirm`(`production-workbench.tsx:1132`)。**不确认不渲染**(`video-decision-preview.tsx:99`)。
  7. **渲染 + 收口**:`createExecutionTask({taskType:"video.render", inputs:mountAs=assetId, params:{props}})`(`:1140-1157`)→ `confirmTask` 收口决策任务 + 分场 `createProductionSegment` 登记 + `createProductionExport(queued)`(`:1164-1203`)→ `ExecutionTaskCard` 跟踪渲染步骤流 → 采纳成片 → `completeExport(resultAssetId)` + 状态机到 ready + 内联 `<video>` 预览(`:1229-1273,1958-1971`)。
  8. **替代路径「直接上传成品视频」**:复用同一上传链传成品(mp4/mov 收窄 + 时长探针,坏文件诚实拒收 `:843-864`),跳过四决策/渲染,补记中间态 recording→editing→rendering→ready + `completeExport`(`:895-920`)。
- **关键前置依赖**:
  - 必须有口播稿(否则 SRT 内容校验无基准 + ④ 按钮不可用);制作方式=CreatorOS 时必须齐 {口播稿+粗剪视频+SRT}(`materialsReady`,`:508-510`)。
  - 四决策/渲染依赖后端 live dispatch + AI 模型(用户 model-config)+ ffmpeg/Chromium executor(未就绪时经 `humanizeRenderError` 给安装引导,`:1242,23`)。
  - 跨号项目撞 OwnershipError → 整页诚实引导 404(`production/page.tsx:174-193`)。
- **产出 & 衔接**:成片 asset + production 状态 ready + `ContentOutput` primary asset + productionExport(ready);成片挂 outputId,发布登记 / 盲预测 / 发布物料链锚 outputId(`production-workbench.tsx:902-904`、`:32-33`)。衔接发布中心/稿面发布包。
- **⚠️ 未实现 / 占位 + PRD 差异**:
  - PRD §7「视频制作 = 已实现但发布阻断」与代码相符:制作管线本身**代码完整落地**(上传/SRT/四决策/渲染/预览/确认成片全在位)。差异点是需真实 AI 模型 + ffmpeg/Chromium 环境才能跑通渲染——**「需配置」而非「未实现」**。
  - 决策预览卡里**场景边界与双语字幕本期只读**,只有信息卡删除与 B-roll 换选可编辑(`video-decision-preview.tsx:72`)。
  - **这不是通用 NLE(P-06 ✓)**:无时间线/无逐帧编辑,编辑面仅限四决策的删卡/换 B-roll。与宪法一致。
  - 「导出素材包」诚实门文案明说「不是可一键导入的剪映工程」(`production-workbench.tsx:1985-1987`)。
- **归档小结**:制作面是一条代码完整的受控管线(提词→粗剪+SRT+校验→AI 四决策过目确认→受控渲染/成品直传→成片预览),确认门齐全、非 NLE,唯一「阻断」是渲染需真实模型 + ffmpeg/Chromium 环境。

---

## E-2 发布中心(路由 `/publishing` · 侧栏「发布中心」)

- **如何到达**:侧栏项「发布中心」→ `/publishing`(`sidebar.tsx:105`,同时 `/calendar` 高亮本项 = 日历是其子面)。
- **主文件**:
  - 路由(Server Component,读侧做真):`frontend/src/app/(creator)/publishing/page.tsx`
  - 页面壳:`frontend/src/features/publishing-center/publishing-center-page.tsx:139`(`PublishingCenterPage`)
  - 交互岛:`frontend/src/features/publishing-center/publishing-center-interactive-region.tsx`
  - 真值装配:`frontend/src/features/publishing-center/publishing-center-data.ts`(`buildPublishingCenterViewModelReal`,走 projects→outputs→publications→revisions+analytics)
  - **真实发布/登记动作不在本页,在稿面**:`frontend/src/features/draft-workbench/register-published-form.tsx`
- **首次进入(空态)小白看到什么**:
  - 顶部「内容日历 · 发布节奏与达成率」入口卡 +「打开日历 →」(`publishing-center-page.tsx:159-176`)。
  - 零真实发布 → 诚实空态:「这个账号还没有发布内容」+「去项目登记第一条作品 →」链到 `/projects`(`:177-198`);读失败 → ErrorState **不回退 fixture 假数据**(`publishing/page.tsx` 头注 [T-231⑤])。
  - 有数据 → 7 列发布表(内容/项目/平台/发布时间/状态/表现/操作)+ 右侧分析栏(指标/平台对比/趋势/Top 内容);未选号(含 0 号)→ `ZeroAccountGuidance`(`publishing/page.tsx:48-52`)。
- **主路径**:
  1. **读侧(本页承担)**:装配用户真实 publications,一稿多平台 fan-out = N 行;分析栏聚合同一批真实快照。表格支持 tab 过滤(全部/视频/图文/音频)、搜索 `?q=`、日期 chip、分页 —— **纯客户端 over props,无网络写**(`publishing-center-interactive-region.tsx:12-30`)。
  2. **生成发布物料**:入口在**稿面**发布包区 `PublishPackageCta`(functionKey=`publish.package`,单平台抖音,候选卡采纳后回填标题/标签),解锁后未发布时显示(`draft-workbench-page.tsx:294-301`)。
  3. **人工发布**:平台真发布 = 用户自己在抖音端操作(**app 不自动发**)。
  4. **粘链接登记 publication**:**稿面**发布包区 `RegisterPublishedForm`(`draft-workbench-page.tsx:317-325`)→ 前端解析抖音 aweme_id(短链诚实拒绝,`register-published-form.tsx:88-96`)→ `registerPublishedPublication`(后端复用 `createImportedPublication`,直接落 `status=published + external_id`,幂等,`:112-124`)→ best-effort 触发一次 `self.metrics` 采集作业 `runNow`(`:37-58`)。含合规审核门:block 硬禁用登记、risk/stale 软提醒(`:82-84,130-186`)。
- **关键前置依赖**:已选抖音号(per-account 读撞 S2 号一致性门);登记需项目有 `ContentOutput`(没有则提交时先铸一个,`register-published-form.tsx:105-114`);表现数据靠该号日常采集任务回填。
- **产出 & 衔接**:真实 publication 行(published + external_id)+ 后续采集回填的表现数据;衔接内容日历(过去格复用同一装配)与复盘。
- **⚠️ 未实现 / 占位 + PRD 差异**:
  - **不自动真发布 —— 已核实 ✓**:唯一的平台发布 side-effect 走 `MockPublisher`,mint 确定性假 external id `mock:{platform}:{publicationId}`、无网络(`backend/src/modules/publishing/platform-publisher.ts:60-96`)。**前端零 UI 触发该 MockPublisher.publish 路径**:全仓仅 `registerPublishedPublication`(imported/manual 语义)有前端调用点(`register-published-form.tsx:112`),`publishOutput/transitionPublication` **无任何前端 caller**。
  - **批量发布/下架/改时间已整体删除**:因 live publisher 是 mock,批量 transition 会铸假数据/毁真数据(`publishing-center-interactive-region.tsx:22-30` [T-231①])。
  - 与 PRD §7「发布阻断、manual 优先于 imported、MockPublisher 不算交付」**完全一致**。
- **归档小结**:发布中心是只读的真实发布表现表(7 列表 + 分析栏),真正的发布动作只有「稿面粘抖音链接登记为已发布」这一条 manual 路径;平台自动发布仅存 MockPublisher、无任何前端入口。

---

## E-3 内容日历(路由 `/calendar` · 入口=发布中心顶部「打开日历 →」)

- **如何到达**:发布中心页顶部入口卡 `Link href="/calendar"`(`publishing-center-page.tsx:167-174`);`/calendar` 侧栏跟随「发布中心」高亮(`sidebar.tsx:103-105`)。shell-router 标题「内容日历(发布中心)」(`shell-router.tsx:193`)。
- **主文件**:
  - 路由(Server Component,注入真实时钟):`frontend/src/app/(creator)/calendar/page.tsx`
  - 页面 + 装配:`frontend/src/features/content-calendar/content-calendar-page.tsx`(`ContentCalendarPage` + `loadViewModel`)
  - 月历视图 + 抽屉:`frontend/src/features/content-calendar/content-calendar-view.tsx`
  - 排期写路径 islands:`frontend/src/features/content-calendar/content-calendar-schedule.tsx`
- **首次进入(空态)小白看到什么**:
  - 未选号 → 诚实空态引导「在左下角账号切换器里选一个抖音号」(`content-calendar-page.tsx:143-155`、`content-calendar-view.tsx:92`)。
  - 有号 → 月历格:过去格渲真实 publications(标题缩略 + 播放数 chips,多条折叠「+N」);未来格渲 planned entries(现 0 行 → 诚实空);过去空窗格淡色着色(**断更一眼可辨**)(`content-calendar-view.tsx:6-8,331-337`)。顶部「本月发布 N 条 · 排期 M 条」。
- **主路径**:
  1. **按账号读**:只认 ctx 当前号(切号=切工作区),当前号必须在本 user 的 active 号里,否则诚实空态、**绝不自选首号**(`content-calendar-page.tsx:126-159`;[T-332 S4])。
  2. **过去格真数据**:复用 `buildPublishingCenterViewModelReal` 装配 publications,过滤 `status==="published"` 且属本月(`:167-186`);表现字符串照 T-082 口径透传不造假。
  3. **未来格排期(写路径)**:点未来/今天格开抽屉 → `ScheduleEntryForm` → `client.createEntry({params:{accountId}, body:{plannedAt, note, contentOutputId?}})`;改期/改标题 `updateEntry`;删除二次确认 Dialog → `deleteEntry`(`content-calendar-schedule.tsx:4-13`);每次成功 `router.refresh()`。
  4. **月份切换**:`?month=YYYY-MM` 静态跳转,非法/缺省 → 真实今天所在月(`content-calendar-page.tsx:131-135`)。
- **关键前置依赖**:已选 active 抖音号;时钟真实 now 在 server 组件读一次派生 `referenceDateKey`(`:16-19`)。
- **过去日期 / 时区规则(核实 ✓)**:
  - **过去日只读,不可排期**:抽屉「+ 排期」入口只在 `selectedDay >= referenceDateKey`(未来/今天)展示(`content-calendar-view.tsx:133-135,301-304`);过去格判定 `isPast = cell.dateKey < referenceDateKey`(`:331-337`)。
  - **时区**:排期默认时刻 = 当天 09:00 **UTC**(dateKey 派生,`content-calendar-schedule.tsx:44-51`);`datetime-local` 输入按**本地**时区解析、`.toISOString()` 归一 UTC 存储(`isoToLocalInput/localInputToIso`,`:57-79`);月窗 `[本月1号, 下月1号) UTC`(`content-calendar-page.tsx:135-139`)。
- **产出 & 衔接**:`content_calendar_entries` 排期行 + 达成率 `getCadenceAttainment`;抽屉发布条可跳回稿面(`content-calendar-view.tsx:279`)。
- **⚠️ 未实现 / 占位 + PRD 差异**:
  - 日详情抽屉对已发布内容**只读复盘**(`content-calendar-view.tsx:4-8` 头注);排期**不触发任何自动发布**(与 E-2 一致,排期仅是计划登记)。
  - `content_calendar_entries` 现实际 0 行(诚实空,`content-calendar-page.tsx:11-13` 头注),排期功能已接线但数据为空。
  - `/calendar` 标注「暂不纳入视觉门禁,待 stage-12 re-baseline」(`calendar/page.tsx` 头注 C-5)。
  - 与 PRD §7「日历部分实现、发布阻断」一致:排期读写真,但无自动发布。
- **归档小结**:内容日历是发布中心子面——过去格渲真实已发布作品(复用发布中心装配)、未来格可按当前号排期(过去日只读、时刻 09:00 UTC + 本地/UTC 转换),排期纯计划登记、绝不触发自动发布。

---

## 跨域关键结论(供路线文档采信)

1. **发布是稿面动作,不在 `/publishing`**:生成物料(PublishPackageCta)、盲预测、粘链接登记(RegisterPublishedForm)全在稿面发布包区;`/publishing` 与 `/calendar` 是**只读表现/排期**面。
2. **全域无自动真发布**:平台发布只有 `MockPublisher`(假 external id、无网络),**前端零触发点**;manual 粘链接登记(imported 语义)是唯一真实写入。与 PRD 一致。
3. **制作面代码完整、非 NLE**:受控管线(粗剪+SRT+四决策确认+渲染)+ 成品直传替代路径都在位,确认门齐全;唯一「阻断」是渲染需真实模型 + ffmpeg/Chromium 环境(需配置,非未实现)。
