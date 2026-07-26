# 章节 D:项目 / Brief / 稿面(脚本工作面)—— 核心域

> 日期:2026-07-26
> 任务:T-528 新用户 0→1 标杆路线 · 功能域盘点分章
> 方法:只读代码盘点(subagent),每条断言附 `file:line`;无证据处标 ⚠️未验证
> 对照:产品宪法 [docs/产品定位.md](../../产品定位.md) §7 记「项目与稿面 = 已实现主路径」;R-PROJECT(§9)
> 校订:盘点 agent 报称「docs/ 下未找到独立 PRD 文件」——**该说法有误**,`docs/产品定位.md` 的正式标题即「CreatorOS 产品 PRD(产品宪法与发布验收单一真值)」,§7/§9 即在其中。其逐条核对结论仍有效。

核心结论:**稿面是「一个项目=一张不断成熟的稿子」的单页工作台(DraftWorkbench)**——脚本面的选题卡/论点/口播稿/弹药/审核/预测/发布包全部在这一页纵向排布;旧阶段路由已退役为 301 重定向。

---

## D-1 创建项目

### D-1a 手建项目(`/projects/new` 拦截路由弹窗)

- **如何到达**:任意页点「＋新建项目」→ `/projects/new`。经 `@modal` 平行路由拦截为浮层弹窗(直达/刷新走全页 fallback,底衬 Dashboard)。
- **主文件**:
  - 全页 fallback:`frontend/src/app/(creator)/projects/new/page.tsx:20`(挂 `DashboardPage` + `NewProjectDialog`)
  - 拦截路由:`frontend/src/app/(creator)/@modal/(.)projects/new/page.tsx`
  - 弹窗壳:`frontend/src/components/overlays/new-project-dialog.tsx:38`(焦点陷阱、Esc 关闭、`router.back()`/`replace('/projects')` 关闭契约)
  - 表单本体:`frontend/src/features/projects/new-project-form.tsx:130`
- **首次进入(空态)小白看到什么**:弹窗标题「新建项目 ✦」+ 副文案「从一个想法开始,AI 将陪你完成从研究到发布的全过程」(`new-project-dialog.tsx:191`)。表单四段:
  1. **项目名称**(必填 `*`,`new-project-form.tsx:268`,空则「创建」禁用 `canCreate:163`)
  2. **一句话描述**(brief,选填,`:308`)
  3. **画幅**(竖屏 9:16 / 横屏 16:9,**必填无默认预选** T-293,`:470` + `EMPTY_DEFAULTS.orientation=""` `:125`)
  4. **创作模式**(AI 全流程「省心」guided / AI 协作「推荐」flexible / 手动「自由」freeform,默认 guided,`:97`)
  - 底部:「创建后进入工作区」勾选框(默认 true,`:127`)+ 取消 + 创建。
- **主路径**:
  1. 填名称 + 选画幅 →「创建」启用(`new-project-form.tsx:163`)。
  2. 提交 → `onCreate` 调 `client.createProject`,body 只提交 `{title, brief, briefDetail:{orientation, targetPlatforms:[]}, creationMode}`——**宪法 §8 裁掉 contentType / 项目层目标平台**,画幅是唯一形态区分(`new-project-dialog.tsx:217-229`)。
  3. `router.refresh()` 失效 App Router 缓存(`:232`)。
  4. 勾了「创建后进入工作区」→ `router.replace('/projects/${created.id}')` 直达稿面(`:235`);否则关闭弹窗。
  5. 失败:表单内联 `role="alert"` 错误、**保留用户输入不清空**(`new-project-form.tsx:185-190`)。
- **关键前置依赖**:已选中抖音号(项目按号隔离);偏好 `settings.preferences.get` 的 `defaultCreationMode` 若为非默认值会 key 重挂预选(T-247,`new-project-dialog.tsx:56-77`)。
- **产出 & 衔接**:一条 `project`(currentStage 从 `brief` 起,`domain.ts:51`)→ 稿面工作台。
- **⚠️ 未实现 / 差异**:创建阶段**不产生任何 AI 内容**,纯表单落库;`creationMode`(guided/flexible/freeform)在创建后**未见强流程分叉消费**(仅偏好预选),更接近元数据。

### D-1b 从选题立项(`/topics` → promoteCandidate)

- **如何到达**:项目列表空态「从选题立项 →」链到 `/topics`(`projects-page.tsx:270`);或选题池候选卡点「立项为 Project」。
- **主文件**:`frontend/src/features/topics/topics-interactive-region.tsx:390`(按钮)、`:273` 与 `:1102`(`client.promoteCandidate`)
- **主路径**:
  1. 候选卡点「🚀 立项为 Project」(`:401`,status=promoted 则禁用)。
  2. `client.promoteCandidate({params:{candidateId}})` → 拿到 `projectId`。
  3. `router.push('/projects/${projectId}')` 直达稿面(`:280`、`:1109`)。
- **产出 & 衔接**:候选卡的选题字段(受众/痛点/冲突/Hook/结构等,见 `chat-enrich-card.tsx`)转为项目 Brief 地基,落稿面选题卡。
- **归档小结**:两条立项入口——手建走 `/projects/new` 四段表单,选题池走 `promoteCandidate` 一键立项,**都终结于同一个稿面 `/projects/[id]`**。

---

## D-2 项目详情结构(三工作面)

### D-2a 三工作面(脚本 | 制作视频 | 复盘)

- **如何到达**:进入 `/projects/[projectId]`(无子段=脚本面);顶栏阶段条切换。
- **主文件**:
  - 段定义:`frontend/src/app/(creator)/shell-router.tsx:93-95`——`PROJECT_STAGES = [{script,脚本},{production,制作视频},{review,复盘}]`(**只有 3 个 Tab**,非 6 阶段)
  - 顶栏渲染:`frontend/src/components/shell/top-header.tsx:142`(`project-workspace` mode → `ProjectIdentityBlock`)+ `ProjectStageStepper`(`:279`)
  - 分段条:`frontend/src/components/navigation/project-stage-stepper.tsx:73`(segmented 变体,每段 `next/link` 到 `projectWorkspaceHref`)
  - 路由映射:`frontend/src/features/projects/project-href.ts:12`——`review`→`/review`,`production`→`/production`,其余(脚本)→`/projects/[id]`
- **路由文件事实**:
  - `/projects/[projectId]/page.tsx` = 稿面(DraftWorkbench)
  - `/projects/[projectId]/production/page.tsx`、`/review/page.tsx` = 独立工作面
  - `/script`、`/research`、`/planning`、`/publishing/page.tsx` = **全部 301 legacy redirect**(`script/page.tsx` 重定向到 `#script` 锚点)
- **首次进入(空态)小白看到什么**:顶栏「项目 › 标题」+ 三段分段条(脚本高亮),下方稿面主体。阶段高亮跟随「正在查看的面」而非项目成熟度(T-373,`stepper.tsx:114-118`)。
- **关键前置依赖**:`layout.tsx:51` 用 `projects.list` 把 URL 段(canonical id 或 title-slug)解析成真 `{id,title,stage,progressPct}` 灌进 `CurrentProjectProvider`;跨号/未知项目 → OwnershipError 渲染「不属于当前账号」空态(`page.tsx:48-61`)。
- **⚠️ 差异**:阶段枚举 DB 存量仍是旧 6 阶段,通过 `LEGACY_STAGE_SEGMENT`(`shell-router.tsx:98`)展示层映射到 3 段,**枚举未物理迁移**。
- **归档小结**:「七阶段总览」已废,项目详情=脚本/制作视频/复盘三面,脚本面就是项目根路由的稿面工作台。

### D-2b 稿面主体骨架(DraftWorkbench)

- **主文件**:`frontend/src/features/draft-workbench/draft-workbench-page.tsx:42`
- **数据装配**:`frontend/src/features/draft-workbench/draft-workbench-data.ts:469`(`buildDraftWorkbenchVm`,零新实体纯读侧重组,各区读失败诚实降级为空)
- **布局**(左稿面纵向排布 + 右编导对话,可拖拽分栏 `DraftResizableLayout` 持久宽度):
  1. 顶条:导入徽章 /「立即抓取逐字稿」按钮(有抖音锚且未 done)/ 主行动(`:55-81`)
  2. 选题卡 `TopicCard`(`:92`)
  3. 创作流 CTA `CreationFlowCtas`(`:101`)
  4. 弹药抽屉 `AmmoDrawer`(`:105`,T-146 上移)
  5. 缺素材清单 `MissingMaterialsNote`(`:109`)
  6. 论点骨架 `ThesisSkeletonPanel`(`:113`)
  7. 口播脚本区 + 审核门(`:118-164`)
  8. 发布包区 `PublishPackSection`(`:167`)
  9. 右栏 `DraftChatRail`(`:182`,常驻嵌入式 Copilot)

---

## D-3 脚本面主路径(核心)

### D-3a 补 Brief(选题卡 + BriefWorkbench)

- **主文件**:`frontend/src/features/draft-workbench/topic-card.tsx:19`;展开挂 `BriefWorkbench`(`frontend/src/features/project-overview/brief-workbench.tsx`,`patchProject` 落库)
- **空态**:折叠行——未定则黄「!选题待补」+「展开补全目标观众、内容目标与核心信息」(`topic-card.tsx:77,85`);已定则绿「✓选题已定」+ 摘要。
- **主路径**:
  1. 「已定」判据 = `briefDetail.targetAudience/contentGoal/coreMessage` 三项非空(`:32`)。
  2. 未定态显「让编导帮你填 →」深链:`copilotDeepLink("project","brief.fill",{project},"根据我们聊的,帮我把选题卡填了")`(`:99`)→ 模型调 `brief.fill` 产字段对照卡 → **人点「写入选题卡」才落库(确认门,不自动发送)**。
  3. 展开 → `BriefWorkbench` 可编辑 → `patchProject` 落 `brief_detail` jsonb。
- **产出 & 衔接**:结构化 Brief = 论点/脚本的地基。
- **归档小结**:治「brief 在导航栏不存在」——立项信息第一次有了稿面常驻可编辑入口。

### D-3b 备料(上传素材 / 搜素材 / 立论点 CTA)

- **主文件**:`frontend/src/features/draft-workbench/creation-flow-ctas.tsx:25`
- **主路径**(三按钮,「写之前先备料」):
  1. **＋上传素材**:本地选文件(图/视频/PDF/Word/MD/TXT)→ `uploadFileToProject`(createUpload→PUT→complete→materialLink,`:34-53`,`upload-to-project.ts`),挂入当前项目弹药库。
  2. **搜素材(联网)**:`openChat({functionKey:"material.gather", autoSend:true})`(`:108`,T-265 修死链,真工具是 `material.gather`)。
  3. **立论点**:`openChat({functionKey:"planning.thesis", autoSend:true})`(`:127`)。
- **产出 & 衔接**:素材落弹药区;论点树采纳后经 `CreativeContext.thesisBrief` 喂进写脚本 facet(`:16`)。

### D-3c 组织论点(ThesisSkeletonPanel)

- **主文件**:`frontend/src/features/draft-workbench/thesis-skeleton-panel.tsx`;读侧 `loadThesisSkeleton`(`draft-workbench-data.ts:495`)
- **空态**:`thesis===null` → 诚实空态 + 立论点 CTA(`draft-workbench-data.ts:288-292`)。
- **主路径**:核心论点 + 支撑/证据/反驳分支树,可加/删/重排/挂用料链素材,保存 → `createArtifactVersion` 追加新版本(不覆盖)。
- **归档小结**:把原本埋在 Copilot、稿面看不到的论点显性化——治「用户不知道要先立论点」。

### D-3d 口播脚本(TipTap 编辑器 + 结构视图 + 版本化)

- **主文件**:脚本区 `draft-workbench-page.tsx:118-164`;编辑器 `ScriptRichEditor`、结构双视图 `ScriptStructureToggle`(`@/features/script/`);读侧 `loadScriptEditorData` + `resolveScriptArtifactIdFromDb`(`draft-workbench-data.ts:484-488`)
- **首次进入(空态)小白看到什么**(`draft-workbench-page.tsx:129-138`):
  - `versionCount>0` → `v{n} · 写你的口播稿——保存即新版本,可回滚`
  - imported 项目未转写 → 「系统会从抖音自动拉逐字稿进来…着急的话直接点右侧让编导先起草」
  - 手动项目 → 「写你的口播稿——直接开写,或在右侧让编导起草」
- **主路径**:
  1. 编辑|结构双视图切换,有分段默认进结构编辑(`:142`)。
  2. 保存 → **append-only 新版本**(`versionCount` 递增,`ScriptRichEditor key=v${versionCount}` 强制重挂吃新版本 `:149`)。
  3. AI 起草:右栏编导 → 产整稿分镜候选卡 → 人点「写入稿面」才物化(`chat-script-draft-card.tsx`,确认门)。
- **关键前置依赖**:`scriptArtifactId`(null=还没有,首存/AI 起草时 ensure)。
- **产出 & 衔接**:`publishUnlocked = versions.length>0`(`draft-workbench-data.ts:525`)→ 解锁发布包。
- **PRD 核对**:**脚本版本化不覆盖 ✓**(createArtifactVersion append-only + restoreArtifact 回滚)。

### D-3e 关联素材(弹药区,material link)

- **主文件**:`AmmoDrawer`(`draft-workbench-page.tsx:387`)、`AmmoDumpZone`(拖放倾倒)、`AmmoCardList`(双击预览)、`AmmoNoteForm`(就地记一条);读侧 `readAmmo`(`draft-workbench-data.ts:390`)
- **空态**:「研究搜到的资料、制作倒入的素材会出现在这里」(`draft-workbench-page.tsx:403`),列表空态不渲染卡片。
- **主路径**:
  1. 拖放截图/录屏/文档进倾倒场 → 原名落盘项目文件夹 + 自动归类 + 挂本项目。
  2. 读侧:`listMaterialLinks({projectId})` → knowledge/asset fan-out(`readAmmo`),图片素材带签名预览 URL(`:426-438`)。
  3. 解绑用 `linkId`(material_link 行 id,非 entityId,T-109 `:411`)。
- **PRD 核对**:**素材经 material link ✓**。

### D-3f 稿件审核(ScriptReviewGate,软门)

- **主文件**:`frontend/src/features/draft-workbench/script-review-gate.tsx:83`;读侧 `readScriptReview`(`draft-workbench-data.ts:622`,404=未审吞成 null)
- **空态**:`report===null` →「当前稿未审核。发布前在右栏对话里跑一次合规审(L1 违禁词 + L2 语义审),命中给逐条改写建议」(`:217-222`)。
- **主路径**:
  1. 点「审核」→ `flushSave()` 先落编辑器最新内容(审最新版非旧版,`:129`)→ 自愈铸 `content_output` 挂点(6s 超时不阻断,`:138`)→ `openChat({functionKey:"review.script", autoSend:true, selection:content_output})`(`:156`)。
  2. 编导调 `review.script` 触发 L1 违禁词 lint + L2 语义审 → 结构化报告:verdict 徽章(pass 绿/risk 黄/block 红 `:62`)+ summary + modelLabel(「非专用审核模型」醒目标注 `:286-295`)+ 命中列表。
  3. **逐条改写确认门** `RewriteApplyButton`(`:466`):人点「✎应用改写」才把 quote→suggestion 单点替换,`createArtifactVersion` 物化成新版本,出「已应用·撤销」(`restoreArtifact` 回滚)。**AI 绝不自动改稿**。
  4. 软门 `ReviewSoftGateHint`(`:595`):无报告/报告版本 < 当前脚本版本 → 醒目提示 +「先去审核」,但**不禁用**盲预测/登记。
  5. 客户端自愈轮询 `useLatestScriptReview`(T-393,对话内审完 server props 不刷新时追上即停 `:104`)。
- **⚠️ 差异**:审核是**软门**(operations 不阻断);硬门(verdict=block 禁用登记/发布)在 `review-publish-gate.ts` 的 `hardBlocked`(`:608` 注释指向)。

### D-3g 发布前盲预测(BlindPredictRow,锁定)

- **主文件**:`frontend/src/features/draft-workbench/blind-predict-row.tsx:55`;读侧 `readBlindPrediction`(`draft-workbench-data.ts:356`)
- **空态**:`prediction===null` → 发布包区显「先盲预测」入口(仅 `publishUnlocked` 后常驻,`draft-workbench-page.tsx:309`)。
- **主路径**:
  1. 点「先盲预测」→ `flushSave()` → 自愈铸 content_output → `openChat({functionKey:"calibration.diagnose", autoSend:true, selection:content_output})`(`:108`)。
  2. 编导流式产逐维度诊断 → **盲预测确认卡**(`ChatDiagnosisCard` blindPredict 分支,由 `embed.blindPredict` 常驻注入)→ 点「锁定为盲预测」→ 铸 immutable locked Prediction。
  3. 已预测:显服务端派生 predictedScore(变现加权)+ 状态(草稿/已锁定);草稿态给「锁定」(`lockPrediction` 补锁兜底)。
- **PRD 核对**:**预测锁定 ✓**(锁定=immutable Prediction 行;确认门从后台任务流搬进对话卡)。

### D-3h 发布包(PublishPackSection)

- **主文件**:`draft-workbench-page.tsx:198`;读侧 `readPublishPack`(`draft-workbench-data.ts:299`)
- **空态**:未解锁 → 虚线框 opacity-70 +「🔒 脚本保存一版后解锁」(`:286`);解锁未发布 →「发布时会从脚本钩子生成标题草稿、选封面与标签」。
- **主路径**:
  1. 解锁后 `PublishPackageCta`(T-350b,`:293`)→ `openChat(functionKey=publish.package)` 单平台抖音,候选卡采纳回填标题/标签。
  2. 站外发完 → `RegisterPublishedForm`(`:318`)粘链接登记为已发布(落 publication + 触发采集)。
  3. 封面 `CoverThumb`(真封面/「封面待生成」占位 `:232`)。
- **产出 & 衔接**:发布 → 顶条主行动变「看复盘 →」(`DraftPrimaryAction`,`:76`)→ 衔接复盘面。

---

## D-4 AI 辅助(Copilot 稿面深链)

- **主文件**:`frontend/src/features/draft-workbench/draft-chat-rail.tsx:18`(内嵌 `AICopilotContent`,`embed.surface="project"`)
- **请求协调**:`DraftChatRequestProvider` + `useDraftChatRequest`(`draft-chat-request.tsx`)——lift state 方案 A(T-108),稿面 AI 按钮通过 context `openChat({functionKey,prefill,autoSend,selection})` **直接预填右栏常驻 rail,不再走 `?copilot=open` 全局弹层**(修 live bug)。
- **会话隔离**:按 `project:<id>` 独立持久化;selection=当前项目 chip 常驻可摘,后端 system 注入 + projectId 兜底。
- **稿面已接的 functionKey 深链**(证据在册):
  | functionKey | 入口 | 证据 |
  |---|---|---|
  | `brief.fill` | 选题卡填充 | `topic-card.tsx:100` |
  | `material.gather` | 搜素材 | `creation-flow-ctas.tsx:110` |
  | `planning.thesis` | 立论点 | `creation-flow-ctas.tsx:129` |
  | `review.script` | 文案审核 | `script-review-gate.tsx:157` |
  | `calibration.diagnose` | 盲预测诊断 | `blind-predict-row.tsx:109` |
  | `publish.package` | 发布物料 | `publish-package-cta.tsx` |
- **PRD 核对**:**AI 走确认门 ✓**。`autoSend:true` 只是自动**发话术**触发工具,产出一律候选卡:brief.fill→「写入选题卡」、脚本草稿→「写入稿面」、审核改写→「✎应用改写」、盲预测→「锁定为盲预测」,**均需人点采纳才物化**;AI 绝不自动改稿/自动落库。
- **归档小结**:稿面 AI 不是旁挂弹层,而是右栏常驻编导 + 6 个稿面按钮深链,每个深链的产出都过确认门。

---

## PRD 符合度总表(R-PROJECT §9 对照)

| R-PROJECT 要求 | 代码事实 | 判定 |
|---|---|---|
| 项目必有 Brief | 新建表单 brief 字段 + 稿面 TopicCard/BriefWorkbench,`briefDetail` jsonb | ✓ 已实现主路径 |
| 脚本版本化不覆盖 | `createArtifactVersion` append-only + `restoreArtifact` 回滚,versionCount 递增 | ✓ |
| 素材经 material link | 弹药区读写全走 `listMaterialLinks`/`materialLink`,解绑用 linkId | ✓ |
| 预测锁定 | 盲预测 `lockPrediction` → immutable locked Prediction | ✓ |
| AI 走确认门 | 6 个 functionKey 深链产出均候选卡 + 人工采纳门,不自动改稿 | ✓ |

**诚实标注汇总**:
- 制作视频(`/production`)、复盘(`/review`)是独立工作面,本章只覆盖到发布包→复盘的衔接点(详见章节 E / G)。
- 阶段枚举 DB 存量仍是旧多阶段,靠展示层 `LEGACY_STAGE_SEGMENT` 映射到 3 段,枚举未物理迁移。
- `creationMode`(guided/flexible/freeform)创建后无强流程分叉消费,当前接近元数据。
