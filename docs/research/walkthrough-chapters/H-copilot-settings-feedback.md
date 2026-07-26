# 章节 H:AI 助手/Copilot · 设置(模型配置) · 问题反馈

> 日期:2026-07-26
> 任务:T-528 新用户 0→1 标杆路线 · 功能域盘点分章
> 方法:只读代码盘点(subagent),每条断言附 `file:line`;无证据处标 ⚠️未验证
> 对照:产品宪法 [docs/产品定位.md](../../产品定位.md) §7 记「ChatBox/AI/Pi = 部分实现、发布阻断」「设置 = 部分实现、发布阻断」;R-COPILOT / R-SETTINGS(§9)、P-04(§5)
> 分支 `codex/t471-responses-protocol`

核心结论:**PRD §7 的「部分实现、发布阻断」在代码侧主要体现为「默认全未配、依赖用户自配 key」,而非功能缺失**;配好文本模型 key 是 Copilot 及全 AI 链的硬前置。

---

## H-1 AI 助手 / Copilot(入口:侧栏「打开 AI 助手」卡 + 稿面右栏内嵌 rail)

- **如何到达**:
  - 全局入口:左侧栏底部「AI 助手」上下文卡,`href="?copilot=open&scope=global"`(`frontend/src/components/shell/sidebar.tsx:432-437`)。query-only href = **就地开浮层不跳页**;显式 `scope=global` 让全局入口有独立会话桶。
  - 浮层壳由 `?copilot=open` query 监听挂载:`frontend/src/components/overlays/ai-copilot-dialog.tsx:2-8,42`,内部 mount `AICopilotContent`(同文件 `:36`)。
  - 页面/项目上下文:一键岛按钮带 `?surface=&fn=&selKind=&selId=`;稿面右栏走 `embed` props 常驻(非 URL)。
- **主文件**:`frontend/src/features/copilot/ai-copilot-content.tsx`(2504 行,主组件 `AICopilotContent` @640);后端 `frontend/src/app/api/chat/route.ts`。
- **首次进入(空态)小白看到什么**:干净空会话(恢复双路两路皆空 → 诚实空会话,`ai-copilot-content.tsx:1129-1135`),输入框 placeholder「我能帮你做什么?(试试「基于最近评论出 5 个选题」,或输入 @ 引用一个项目)」(`:2409`);底部快捷 chips;浮层下方提示「按 Esc 关闭 · ↑↓ 切换 · Enter 执行」(`copilot-overlay-bridge.tsx:27`)。次区(推荐指令/最近任务/继续任务三卡)已整体下架(`:716`)。
- **主路径**:
  1. 侧栏点「打开 AI 助手」→ `?copilot=open&scope=global`(`sidebar.tsx:433`)→ 浮层挂载。
  2. 输入框打字或点快捷 chip 预填(chip **只预填不自动发**,`applyQuickPrompt` `:1023-1033`;铁律 T-055b)。
  3. 回车/发送 → `submit` → `sendMessage({text})`(`:1011-1018`);`useChat` 走 `DefaultChatTransport` POST `/api/chat`,token 级流式,可 `stop()` 中止(`:59,802-868`)。
  4. 后端鉴权 → 按 `chatContext.surface` 解析 official skill(`resolveSkillForSurface`)+ account-scoped 不可变 skill 快照(`route.ts:264-269`)→ `streamText` 挂工具流式返回。
  5. 工具结果以 candidate part 回传,内联渲成确认卡(`ChatCandidateCard`/`ChatEnrichCard`/`ChatScriptDraftCard` 等 20+ 卡,`:72-123`);**AI 绝不直接写实体,用户逐条采纳过确认门**(铁律②,注释 `:26-27`)。
  6. 需运行时授权的工具(如 `local.read`)走 HITL 门:`addToolApprovalResponse` 允许/拒绝,`sendAutomaticallyWhen` 授权齐了同回合自动 resume(`:855-911`);有待授权时 `submit` 排队不并发(`:1015`)。
  7. 会话落库:route `onFinish` 写 `ai_conversations/ai_messages`,前端从响应头 `x-conversation-id` 捕获续接(`:838-847`;`route.ts:350`)。
- **上下文 scope(4 档,`resolveChatScope` @697-712 + `chat-scope.ts`)**:`global`(左下角/首页显式)、`project:<id>`(内嵌右栏 / 复盘岛 / 选题卡)、`surface:<name>`(一键岛)、裸 `?copilot=open` 回落 global。**scope 隔离锁在服务端**:续接时库中会话 scope 与声明不一致 → 4xx 拒绝(`route.ts:179-198`)。三层注入:surface(技能装配)+ selection(选中态)+ functionKey(按钮层置顶专用工具,一次性 one-shot,`:617-638,819-835`)。
- **关键前置依赖**:必须先在设置里配好文本模型(见 H-2);未配时按注释「有官方兜底」。多模态素材工具(配图/B-roll/封面)依赖用户配好生图/生视频模型,未配时工具卡自带「去设置」降级(`:516-520`)。
- **产出 & 如何贯穿**:贯穿全程——选题(topic.generate/enrich)、编导诊断(calibration.diagnose)、脚本(script.draft/rewrite)、封面(cover.generate)、复盘(review.analyze)、素材(research.gather / asset.generate / web.read / 截图 / 本机文件读)、蒸馏(distill)、论点树(planning.thesis)。稿面右栏 embed rail 承载盲预测/审核(`embed.request` autoSend,`:968-1009`)。
- **⚠️ 未实现 / 占位 + PRD 差异**:PRD §7 标「ChatBox/AI/Pi = 部分实现、发布阻断」。代码侧 Copilot 主链已相当真(流式/工具/确认门/持久化/HITL/成本角标),阻断点主要是**依赖用户自配模型 key**(未配即不可用)及多模态能力默认未配。「继续任务」诚实自陈 resume 只到 stage 粒度、缺 deep-link anchor(`:48-53`)。受控自主运行时(Pi 三角色)不在本组件。
- **归档小结**:全局浮层 + 稿面内嵌两形态,`useChat` 流式打 `/api/chat`,scope 四档服务端硬隔离,工具结果全走「人逐条采纳」确认门(AI 不直写实体)——主链真、门槛是先配模型 key。

---

## H-2 设置(路由 `/settings` · 侧栏「设置」)—— 重点:模型配置

- **如何到达**:侧栏「设置」导航项(`sidebar.tsx:112`,`match: matchExact("/settings")`)→ `/settings`。页面本身是 Server Component,只留 marker;真正 UI 是**居中大弹窗** `SettingsDialog`(Radix Portal,默认打开,关闭 → `router.back()`)(`settings-page.tsx:424-441`)。
- **主文件**:路由 `frontend/src/app/(creator)/settings/page.tsx`;壳 `frontend/src/features/settings/settings-page.tsx`;弹窗 `frontend/src/features/settings/settings-interactive-region.tsx`(`SettingsDialog` @265);模型卡 `ModelConfigurationCard` @2271。
- **首次进入(空态)小白看到什么**:左竖 6 页签「账户 / 偏好 / 外观 / 模型配置 / 技能 / 存储」(`settings-interactive-region.tsx:241-249`);模型页签空态显「未配置」表单——**诚实兜底,绝不回退 fixture 的伪造 `anthropic`/`claude-opus-4-8`**(`page.tsx:63-78,128,152`);存储空态诚实置 0(不显 fixture 的 18GB/64GB,`page.tsx:72-78,196-226`)。
- **主路径(配模型 key,新用户最关键一步)**:
  1. 侧栏「设置」→ 弹窗打开,点左侧「模型配置」页签(`settings-interactive-region.tsx:244,422`)。
  2. 页签内分「必配」(文本模型,配它就能用)+ 折叠「更多能力」(按需 7 卡)(`:424-509`)。
  3. 必配卡 `ModelConfigurationCard`:选供应商预设(`ProviderPresetRow` `:2354`)→ 填模型 id(datalist 候选,`:2360-2380`)→ 粘贴密钥(`:2381-2411`)。
  4. **密钥只写不回(R-SETTINGS §9 核实通过 ✓)**:读端只返回 `hasSecret` 布尔,不回原值(`page.tsx:270` `ModelState.hasSecret`);表单密钥框留空=保持不变,已配时显「已配置」徽章 + help「留空保持不变,填入则覆盖」(`:2286-2287,2384-2409`);`putModel` 提交时 `secret: secret.length>0 ? secret : undefined`——空则省略,不覆盖已存(`:2313-2332`)。
  5. 高级设置(中转站 baseUrl / 接口格式 anthropic|openai_chat|openai_responses)可展开(`:2412-2470+`);温度可调。
  6. 「测试连接」按能力走最小真实调用/最便宜鉴权探测,诚实三态「✓ 连通 / ⚠ 无法探测 / 失败」(`TestConnectionButton` T-377 `:2160-2255`,文本卡经 `beforeTest={saveBeforeTest}` 先存再测 `:2339-2342,2539`)。
- **多模态用户可配(项目铁律核实通过 ✓)**:生图(image.generate)、生视频(video.generate)、ASR(transcribe.audio)、视觉(asset.classify)、embedding、文案审核(script.review)、联网搜索(web.search)、备用对话(chat.fallback)全部是用户可配 `MultimodalModelCard`,读同一 `settings.models.list`,**绝不写死 MiniMax**;未配各自诚实降级(`:462-508`;`settings-page.tsx:314-356`)。配置备份导出/导入卡含密钥,卡内常驻警示(`ModelConfigTransferCard` T-363 `:512`)。
- **其它页签**:
  - 账户页签:账户信息 / 抖音扫码绑定(`AccountBindingCard`)/ 网站登录保管库(`WebSessionVaultCard` T-217a,支撑 web.read 带登录态读正文)/ 激活状态(`ActivationStatusCard` 四态,桌面专属)/ 软件更新(`CheckUpdateCard` T-459,只读官网公开 `latest.json`,web 端诚实空态)/ 诊断日志(`:393-414`)
  - 外观页签 = 主题(`SystemSettingsCard` `:419-421`)
  - 技能页签 = `SkillsSection`(读服务端 official + 账号增量联合目录,`page.tsx:256-270`)
  - 存储页签 + 重置工作区危险区卡
- **关键前置依赖**:全部读真 op(`getSettings/listModels/getStorage/getPreferences/listPrompts` + 桌面 `getActivationService().getStatus()`),读失败一律诚实兜底(`page.tsx:96-303`)。激活/更新/渠道链接为桌面态专属,web 端诚实空态。
- **产出 & 如何贯穿**:模型 key 是整个 Copilot / 全 AI runner 的地基;多模态配置解锁生图/生视频/ASR/审核/联网搜索;抖音绑定 + 网站保管库解锁采集/读正文;技能页签管账号级 skill 增量。
- **⚠️ 未实现 / 占位 + PRD 差异**:PRD §7 标「设置 = 部分实现、发布阻断」。代码侧设置模块读写均已接真;阻断点在于**默认全未配**(文本模型未配即不可用,多模态未配即降级)——需用户手动配 key。模型配置**刻意不拆独立路由**(page-specs §17「禁止改变」,`settings-page.tsx:36-37`)。
- **归档小结**:设置是弹窗式 6 页签,模型配置是新用户命脉——必配文本模型 + 8 张按需多模态卡全用户可配、绝不写死厂商,密钥只写不回(hasSecret + 留空不变),配好即解锁 Copilot 全链。

---

## H-3 问题反馈(入口:侧栏底「问题反馈」按钮 · Bug 图标)—— T-518 已落地

- **如何到达**:侧栏底部 `<IssueFeedbackDialog pathname collapsed />`(`sidebar.tsx:207`);trigger 是 Bug 图标 +「问题反馈」文案按钮(`issue-feedback-dialog.tsx:183-196`)。
- **主文件**:`frontend/src/components/shell/issue-feedback-dialog.tsx`;纯逻辑 `frontend/src/components/shell/issue-feedback.ts`(T-518)。
- **首次进入(空态)看到什么**:弹窗标题「问题反馈」+ 说明「先复制整理好的内容,再打开反馈渠道粘贴提交。CreatorOS 不会自动发送或上传日志。」(`:203-206`);问题描述框(10–4000 字)+ 实时「反馈内容预览」(标注「不含日志正文与本机路径」)+ 三按钮「打开日志文件夹 / 打开反馈渠道 / 复制反馈内容」。
- **主路径**:
  1. 侧栏点「问题反馈」→ 弹窗打开,`onOpenChange` 重置 occurredAt/各态(`:85-94`)。
  2. 挂载后本地读版本(`getAppVersion`)+ GET `/api/v1/local/support-channel` 拿签名配置里的 `supportUrl`(`localSupportChannelResponse.parse`,`:96-120`)。
  3. 填问题描述 → 实时构建预览 `buildIssueFeedbackText`(版本/系统/页面/时间/关联编号,`issue-feedback.ts:59-73`);**敏感信息本地脱敏**——路由内 uuid/长数字段替 `:id`(`sanitizeFeedbackRoute` `:26-45`)、Bearer/Cookie/api-key/`sk-*` 全遮蔽(`redactSensitiveText` `:47-57`)。
  4. 点「复制反馈内容」→ 校验 10–4000 字 → `navigator.clipboard.writeText(preview)`,成功显「反馈内容已复制,请在反馈渠道中粘贴提交」,失败诚实报「复制失败,请手动选择上方内容复制」(`:122-145,263-267`)。
  5. 点「打开反馈渠道」→ POST `/api/v1/local/open-url` 打开 `supportUrl`;仅显「已请求打开反馈渠道,请在外部页面中粘贴并提交」/失败态,**从不显假「已发送」**(`:147-165,272-279`)。
  6. 点「打开日志文件夹」→ POST `/api/v1/local/reveal-logs`(在 Finder 开加密日志目录),诚实成功/失败态(`:167-181,280-285`)。
- **关键前置依赖**:`supportUrl` 来自签名渠道配置(无则「当前没有可用的反馈渠道」诚实态,按钮 disabled,`:110,269-271,306-310`);`open-url`/`reveal-logs`/`support-channel` 是桌面本地 API(web 端降级)。
- **产出 & 如何贯穿**:输出一段本地整理好、已脱敏的可粘贴反馈文本 + 指路日志目录;不上传、不联网发送(本地整理型)。
- **⚠️ P-04 核实**:**满足 ✓**——全程无自动发送、无假「已发送」,说明文案与状态诚实(「不会自动发送或上传日志」`:205`;渠道态最多到「已请求打开」)。无服务端提单/工单闭环(设计如此:本地复制 + 外链人工提交)。
- **归档小结**:侧栏 Bug 入口 → 弹窗「本地脱敏整理 + 复制 + 开外部渠道/日志目录」,零自动发送、零假成功态,严守 P-04。

---

## 跨域小结

Copilot 与设置强耦合——设置里配好文本模型 key 是 Copilot 及全 AI 链的硬前置,多模态卡(全用户可配、绝不写死 MiniMax)解锁素材/封面/审核/联网。三域诚实度一致遵守铁律:AI 不直写实体(逐条采纳门)、密钥只写不回、读失败诚实兜底不伪造、反馈不假发送。
