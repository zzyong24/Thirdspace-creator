# CreatorOS 任务看板(BACKLOG)

> **单一执行真相。每个会话必读(SessionStart hook 自动注入)。** 规则见 `CLAUDE.md` 的「任务流程铁律」。
> 状态:📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置 · ⛔ SPEC 审核 FAIL(没过审不准开工)。
> 读取顺序:**本看板 → 任务引用的 SPEC → 代码**。
> 铁律:需求即任务(提了就建);开工从看板顶取;做完改状态+提交;**禁止 P0/P1 分级、禁止多阶段执行**,任务清楚即起 Workflow/并行 subagent 一次做完。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

| ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话 |
| --- | --- | --- | --- | --- | --- | --- |
| T-735 | 修复 V1 本地包素材预览与项目封面统一失效【正式包回归·用户实测 2026-08-09】 | 🔨 待办 | — | 待验 | [V1 发布候选 SPEC](docs/superpowers/specs/2026-08-08-creatoros-v1-release-candidate.md) | V1 安全收口后，桌面单机免登录用户访问共用 `/api/v1/blob/*` 时被新增 session 必填门误拒绝，导致素材图片、视频与项目封面同时 403；恢复经启动握手保护的本机主用户上下文解析，同时保留用户、存储根、方法、过期时间与本次启动信任根绑定，并用无 session 真路径回归证明文件可读、跨用户与伪造 token 仍失败关闭。 |
| T-733 | 恢复可选“立论点”UI并增加适用场景引导，不重新变成写稿门槛【创作弹性·用户确认 2026-08-09】 | 🔨 待办 | PASS[REV:c5f51085613d] | 待验 | [SPEC](docs/superpowers/specs/2026-08-09-optional-thesis-guidance.md) · [退役影响调研](docs/research/2026-08-08-thesis-skeleton-removal-impact.md) | 本次只恢复现有“核心论点/支撑依据/证据/反驳”论点骨架的可见 UI 与真实生成、编辑、保存能力，并明确标为可选辅助；页面同时提供“先梳理观点”和“跳过，直接写稿”，未生成或未明确采用不得影响脚本。原并发会话使用 T-730，因候选中 T-730 已归属编排器测试恢复，本次收口改用 T-733。 |
| T-734 | 支持按电商等创作场景生成并自定义创作框架【场景化框架·用户后续 2026-08-09】 | 📋 待办 | — | 待验 | T-733 后续 | 在可选论点 UI 稳定后，再把固定四栏升级为场景化创作框架；不得用固定业务词表替代 AI 语义判断。 |
| T-728 | 收口历史脏工作区并形成 CreatorOS V1.0 可发布候选【正式发布前总门·用户授权 2026-08-08】 | 🔨 待办 | — | 待验 | [SPEC](docs/superpowers/specs/2026-08-08-creatoros-v1-release-candidate.md) | 冻结当前 working-tree 快照内已确认改动与发布阻断修复，逐项保全、审计、按任务整理提交；收口 v3 ticket、受管模型/ASR、Growth 用户额度入口、1.0.0 版本与 macOS Developer ID/公证/真启动流水线，运行完整 Gate 后以非破坏方式整合 origin/main、合并并推送。Windows 未签名必须保留 High 风险边界；J-142 真实经济联调需另取用户确认和一次性测试码；本任务不得创建 v1.0.0 tag、GitHub Release、分发安装包或改生产 Activity 放量配置。 |
| T-731 | 根治 V1 候选信任边界、系统凭据与外部副作用阻断【独立上线审计 NO-GO·2026-08-08】 | ✅ 待办 | PASS[REV:b6e6fa97cb64] | PASS:3965fa3c9822 | [SPEC](docs/superpowers/specs/2026-08-08-v1-security-and-side-effect-closure.md) | 关闭独立审计确认的发布阻断：loopback blob 不再使用可推导默认密钥，WebView 收紧 CSP/remote capability，SSRF 在每次联网前失败关闭，不可信网页与付费/持久化工具隔离；受管长期 Key 只存系统凭据库并迁移删除旧密文/可恢复主密钥文件；同时补齐 machineId 客户端边界、ASR 收费 lease 追踪补偿、资产采纳幂等、路径 no-follow、子进程环境白名单与可导出诊断链。正式包任一安全依赖不可用即失败关闭，不以 accepted-risk 放行。 |
| T-729 | 根治渠道专属包仍跳官方入口并拆分官网、下载、人工反馈与反馈 API【白标完整性·智溯AI真机 2026-08-08】 | ✅ 待办 | PASS[REV:1f5dff2e324b] | PASS:b8ef0cb312e7 | [T-729 SPEC](docs/superpowers/specs/2026-08-09-channel-package-public-link-authority.md) · [前端旅程](orchestrator/T729-CHANNEL-LINKS-FRONTEND-JOURNEY.md) · [渠道包工厂上游](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) · [T-718 真机构建证据](orchestrator/GATE-T718-BUILD.md) · [白标边界调研](docs/research/2026-08-04-white-label-runtime-vs-package-boundary.md) | 以智溯AI `v0.3.0` 真机为失败事实：渠道模型 bundle `v5` 与受管凭据已经 `configured`，但软件更新仍固定打开 `creatoros.aitongban.cloud`；问题反馈在 `channelRuntime` 缺值或异常时回退 CreatorOS 官方飞书；自动反馈提交又把面向人的 `bugFeedbackUrl` origin 当成 Growth API authority。一次性收口 CreatorOS 多渠道外部入口：在受签名 `PackageManifest` 中明确区分包官网、下载页、人工反馈页与更新 manifest locator，并与激活后的购买、续费、支持、问题反馈运行时投影以及固定的 Growth feedback API authority 分离；用户可见链接只读取当前包或当前渠道的受信值，渠道包不得跨跳 CreatorOS 官方或其他渠道，远端 manifest 不得形成开放重定向，未激活、离线或快照延迟时必须按字段契约诚实降级，不能偷回官方默认值。修复更新卡、检查更新、购买、续费、支持、下载、问题反馈打开及自动提交完整链路，清除官方 URL 常量和飞书 fallback 对渠道包的渗漏；如涉及 manifest schema、Activity runtime 或反馈服务契约，开工前同步修订并审核上游 SPEC/合同。补源码扫描、合同测试、单元测试和 macOS 安装包真机点击回归，至少覆盖 CreatorOS 官方包与智溯AI包、激活与未激活、在线与离线、运行时新鲜与陈旧、反馈 API 成功与拒绝，并继续保证只接受 allowlist/签名 URL、日志不泄露激活码或密钥。完成后重打本地智溯AI安装包供用户验证；本任务不授权部署、发布或改动线上 Growth。 |
| T-701 | 根治激活成功但缺渠道身份导致受管模型静默不生效【渠道联调·用户 2026-08-05】 | ✅ 待办 | — | — | [T-679 模型服务契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) | Activity 已签名授权允许使用但缺少 `channelRef` 时，CreatorOS 必须保持授权放行且把模型同步稳定映射为脱敏 `activation_scope_missing`，全链记录阶段、原因、触发源和状态而不记录授权码、机器号、渠道身份或子 Key；不得伪造默认渠道、不得出网拉 ticket/bundle/credential、不得静默回退并暗示手工本地配置是正常渠道解法。设置页明确提示“授权缺少渠道信息，无法同步受管模型”，提供真实的“重新校验激活权益并重试配置同步”，复校成功补齐签名渠道身份后立即拉取 bundle/凭据并刷新 SSR；补无 session/无 account、本地竞态和签名身份补齐回归，并把桌面打包已导入的 `client-config-release.mjs` 纳入同一任务完整性检查；本轮独立提交，不打包、不发布。 |
| T-732 | 根治前端全仓 ESLint 历史债并恢复零错误发布门【V1 候选审计 2026-08-08】 | ✅ 待办 | — | PASS:c46688b437e3 | [V1 发布评审](RELEASE_REVIEW.md) | 当前 `pnpm lint` 可真实启动但报 62 errors / 164 warnings，错误横跨既有 React hooks、纯度、未转义文本与脚本 CommonJS 规则；本轮只修复候选新增脚本的 `module` 命名误判，禁止在 V1 范围冻结后顺手重写六十余处产品代码。后续须按根因分组修复并把生产源码 ESLint 恢复为零错误门。 |
| T-730 | 补齐 orchestrator 测试夹具并恢复全量流程测试基线【V1 候选审计 2026-08-08】 | ✅ 待办 | — | PASS:12453061ee55 | [V1 发布评审](RELEASE_REVIEW.md) | `node --test orchestrator/process/*.test.mjs` 当前 92 通过、28 失败，失败集中于仓库缺失的 `orchestrator/tools/init-*.sh`、模板与 test-integrity 旧断言；候选相关 process 聚焦测试 63/63、frontend-validation 18/18、reviewctl 19/19 已通过。后续须恢复缺失夹具、更新合法断言并让全量流程测试归零，禁止以删除测试或篡改历史收据洗绿。 |
| T-727 | 根治项目编导无视“原文不改”并拿创作建议硬拦写稿【稿面忠实导入·用户实录 2026-08-08】 | ✅ 待办 | PASS[REV:6e5e96f8c2ec] | PASS:985b6e0ee246 | [SPEC](docs/superpowers/specs/2026-08-08-verbatim-script-import-and-instruction-precedence.md) | 用户明确要求把已提供口播稿原样写入时，当前指令必须覆盖选题卡、定位和归因中的创作建议；系统应直接产出逐字保真的稿面候选，不得要求先解除立项规则、不得反复劝改，也不得把原文压缩成 `extraBrief` 摘要后再交给生成模型重写。新增可审计的原文输入与保真模式，逐字稿只允许用户明确要求的追加/校正，仍保留“候选→用户采纳→落稿”数据确认门；覆盖长稿、空稿面、已有稿面、重复请求、当前项目冲突和模型不可用时原文不丢。 |
| T-724 | 排查并根治发布后补登记导致自动化导入项目残留为僵尸项目【项目生命周期·用户实测 2026-08-08】 | ✅ 待办 | PASS[REV:15546b832da7] | PASS:ee541782fc52 | [SPEC](docs/superpowers/specs/2026-08-08-project-publication-identity-convergence.md) | 自动化已按抖音新作品创建 imported 历史项目后，用户再把既有创作项目登记为同一作品时，必须收敛到唯一可解释的项目归属；publication 继续作为唯一外部作品事实，手工作品项目可接管 imported 投影，被替代投影只做可逆归档；并发、重复登记、手工冲突、孤儿锚、补偿失败和后续自动化均须确定收敛，不删除用户项目或媒体数据。 |
| T-725 | 调研移除项目稿面“论点骨架”的产品与技术影响【创作链瘦身·用户 2026-08-08】 | ✅ 待办 | — | — | [影响调研](docs/research/2026-08-08-thesis-skeleton-removal-impact.md) | 盘点论点骨架在项目稿面、Copilot `planning.thesis`、`thesis_tree` 产物、写稿上下文、审核与历史数据中的真实消费链，判断可直接去界面、降级为内部上下文或完整移除的影响与迁移边界；本任务只调研，不先删功能。 |
| T-726 | 退役项目“论点骨架”并让写稿直接消费 Brief 与素材【创作链瘦身·用户确认 2026-08-08】 | 🔨 待办 | PASS[REV:0ed24d02ca40] | 待验 | [SPEC](docs/superpowers/specs/2026-08-08-thesis-skeleton-retirement.md) | 删除稿面论点骨架面板、“立论点”入口及 Copilot `planning.thesis` 新建链，新的写稿、策划、重建与制作不再读取或生成 `thesis_tree`；既有 artifact/version 只读保留且不再暗中影响新结果，项目素材继续通过用料链进入写稿和 B-roll，旧脚本版本与历史数据不删除。 |
| T-721 | 根治素材包导出回流造成递归嵌套并恢复大素材库完整可见性【素材数据安全·用户 2026-08-08】 | 🔨 待办 | — | 待验 | [SPEC](docs/superpowers/specs/2026-08-08-material-export-isolation-and-asset-pagination.md) | 导出素材包必须作为一次性下载产物写入对象存储，不得创建普通素材记录；既有素材包 ZIP 保留但以后导出时自动隔离，防止 ZIP 自嵌套。素材中心和项目素材查询必须完整分页加载，不能因固定 200/100 条上限让旧素材消失。 |
| T-722 | 排查并根治渠道包技能注册表不可读且正常包无异常【渠道运行态·用户截图 2026-08-08】 | ✅ 待办 | — | PASS:1ffcad58b2e6 | [渠道包工厂 SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) | [详情](BACKLOG-details.md#t-722) |
| T-720 | 根治特定 Windows 设备抖音内置浏览器页面崩溃导致内容雷达主页验证失败【飞书用户日志·2026-08-08】 | 📋 待办 | — | 待验 | [飞书反馈记录](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | [详情](BACKLOG-details.md#t-720) |
| T-719 | 根治桌面端启动后二次白屏闪烁与首页排期提醒不可用【启动稳定性·用户录屏 2026-08-07】 | 🔨 待办 | — | 待验 | [Windows 生产闭环](docs/superpowers/specs/2026-08-03-windows-production-closure-default-release.md) | [详情](BACKLOG-details.md#t-719) |
| T-718 | 补齐智溯AI包内品牌并交付完整 Growth 配置后重打本地包【渠道验收失败·用户 2026-08-07】 | 🔨 待办 | — | 待验 | [渠道包工厂 SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) | [详情](BACKLOG-details.md#t-718) |
| T-716 | 完善 Copilot 局部改稿、脚本版本回退、附件上下文与素材中心稳定排序【创作编辑闭环·用户 2026-08-06】 | 🔨 待办 | — | 待验 | [实现规格](docs/superpowers/specs/2026-08-06-copilot-script-editing-and-attachments.md) | [详情](BACKLOG-details.md#t-716) |
| T-715 | 在 CreatorOS 增加 Growth AI 额度账户连接、查看与充值入口【额度闭环·用户 2026-08-06】 | 🔨 待办 | — | 待验 | [真实联调 Gate](orchestrator/GATE-T715-BUILD.md) | [详情](BACKLOG-details.md#t-715) |
| T-714 | 接入工程教训闭环并迁移旧账本，确保真实踩坑可被后续任务自动复用【工程进化·用户 2026-08-06】 | 📋 待办 | — | 待验 | [`product-to-code-orchestrator`](orchestrator/process/.skill-version) | [详情](BACKLOG-details.md#t-714) |
| T-713 | 构建包含通用智能体语义边界与当前制作修复的 macOS 0.3.0 本地测试包【本地验收·用户 2026-08-06】 | 🔨 待办 | — | 待验 | [发布流程](docs/RELEASING.md) | [详情](BACKLOG-details.md#t-713) |
| T-712 | 优先采用用户上传素材进入 B-roll 时间线、恢复成片预览并收回渠道同步常驻提示【制作体验·本机实测 2026-08-05】 | 🔨 待办 | — | 待验 | [T-687 口播联想画面 Skill](docs/superpowers/specs/2026-08-04-voiceover-associative-visual-skill.md) | [详情](BACKLOG-details.md#t-712) |
| T-709 | 将 macOS Developer ID 签名与 Apple 公证凭据接入 GitHub 正式发布流水线【发布安全·用户 2026-08-05】 | 🔨 待办 | — | 待验 | [发布流程](docs/RELEASING.md) | [详情](BACKLOG-details.md#t-709) |
| T-708 | 全局审计并软化 AI 工具中不合理的创作完整度门禁【工具灵活性·用户 2026-08-05】 | 🔨 待办 | — | 待验 | [门禁全局审计](docs/research/2026-08-05-ai-tool-hard-gate-audit.md) | [详情](BACKLOG-details.md#t-708) |
| T-707 | 将定位前采收敛为 Copilot 主导的自适应编导访谈并直接闭环定位中心【定位精准度·飞书反馈 2026-08-05】 | 🔨 待办 | PASS[REV:06867c4bf60c] | 待验 | [T-652 前采工作流](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) | [详情](BACKLOG-details.md#t-707) |
| T-705 | 根治 macOS 本地包启动后落入 Page Not Found【发布阻断·本机实测 2026-08-05】 | 🔨 待办 | — | 待验 | [发布流程](docs/RELEASING.md) | [详情](BACKLOG-details.md#t-705) |
| T-703 | 根治视频制作从分镜到预览、对话调剪、采纳与再制作的多处断裂并重打本地包【制作闭环·用户 2026-08-05】 | 🔨 待办 | PASS[REV:503aca81be96] | 待验 | [SPEC](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md) | [详情](BACKLOG-details.md#t-703) |
| T-702 | 根治审核“应用改写”后分镜稿格式坍缩为 Markdown 表格源码【稿面编辑·用户 2026-08-05】 | 📋 待办 | — | 待验 | 既有稿面审核门与脚本 artifact 版本契约 | [详情](BACKLOG-details.md#t-702) |
| T-695 | 清理应用内硬编码品牌并让白标用户表面保持中性【白标体验·用户 2026-08-04】 | 🔨 待办 | — | 待验 | [白标边界](docs/research/2026-08-04-white-label-runtime-vs-package-boundary.md) | [详情](BACKLOG-details.md#t-695) |
| T-691 | 补齐 Copilot 单项目全生命周期、跨项目历史与审核改稿工具闭环【Context 契约·用户 2026-08-04】 | ⏸️ 待办 | PASS[REV:9444ca5b32a9] | 待验 | [SPEC](docs/superpowers/specs/2026-08-04-copilot-project-lifecycle-tool-closure.md) | [详情](BACKLOG-details.md#t-691) |
| T-694 | 建立多渠道专属包工厂、项目级出包 Skill 与安全增量更新闭环【渠道规模化·用户 2026-08-04】 | 🔨 待办 | PASS[REV:f02d5dbafb5a] | 待验 | [SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) | [详情](BACKLOG-details.md#t-694) |
| T-686 | 根治定位前采联网补充直接报错并恢复国内中文公开检索【定位前采·本机实测 2026-08-04】 | 🔨 待办 | — | 待验 | [T-652 前采工作流](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) | [详情](BACKLOG-details.md#t-686) |
| T-687 | 建立口播联想画面 Skill 并打通图序号引用、项目 B-roll 与成片渲染【视觉创作主链·本机日志 2026-08-04】 | 🔨 待办 | — | 待验 | [口播联想画面 Skill SPEC](docs/superpowers/specs/2026-08-04-voiceover-associative-visual-skill.md) | [详情](BACKLOG-details.md#t-687) |
| T-685 | 排查并根治全流程写稿长度失控及审核不识别已采纳文案卡【创作主链·本机日志 2026-08-04】 | 🔨 待办 | — | 待验 | [T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) | [详情](BACKLOG-details.md#t-685) |
| T-684 | 根治 Copilot 联网搜素材失败后回退模型记忆并误导配置搜索模型【浏览器检索·用户截图 2026-08-04】 | 🔨 待办 | — | 待验 | 既有 `material.gather`、`web.search` 浏览器适配器与 T-645 隐藏模型配置契约 | [详情](BACKLOG-details.md#t-684) |
| T-683 | 修复 Copilot 在 Windows 无法读取盘符绝对路径与目录授权失效【本地文件读取·用户截图 2026-08-04】 | 🔨 待办 | — | 待验 | 既有 `local.read` 安全归一、HITL 授权和本地工作区契约 | [详情](BACKLOG-details.md#t-683) |
| T-679 | 接入 Growth 按激活权益签发的受管模型凭据、真实模型白名单与用户选择【模型服务最小闭环·用户 2026-08-04】 | 🔨 待办 | — | 待验 | [Growth 持久凭据契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-133-activation-managed-model-subkey.md) | [详情](BACKLOG-details.md#t-679) |
| T-678 | 根治内容雷达生成选题继续读取旧定位【定位消费一致性·飞书用户 2026-08-04】 | 📋 待办 | — | 待验 | [T-652 定位前采 SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) | [详情](BACKLOG-details.md#t-678) |
| T-677 | 优化首页与定位中心切换时整页骨架卡顿 1–2 秒【桌面交互性能·飞书用户 2026-08-03】 | 📋 待办 | — | 待验 | 既有 DashboardQueryService、定位中心页面读取与 App Router loading 契约 | 保留主内容稳定框架，把非首屏数据改为可分区返回/延后加载，对高频路由做可验证预热，并记录 dashboard 与定位各读源耗时；页面切换不得因共享 `(creator)/loading.tsx` 把整个主区替换成骨架，需在 macOS 用户同等数据量下验证体感和实测耗时。 |
| T-676 | 根治云端 ASR 测试假阳性并接通 StepFun，同时修复 Windows 本地 Whisper 回退【逐字稿阻断·飞书用户 2026-08-03】 | 📋 待办 | — | 待验 | 既有 `transcribe.audio` 多模态适配器与设置连接测试契约 | [详情](BACKLOG-details.md#t-676) |
| T-671 | 确定 CreatorOS 代理商业模式与官网价格边界【渠道商业化·用户 2026-08-02/03】 | 🔨 待办 | — | 待验 | [代理合作口径](docs/superpowers/specs/2026-08-02-creatoros-agent-channel-policy.md) | [详情](BACKLOG-details.md#t-671) |
| T-670 | 恢复 CreatorOS 部署前真实官网并收口公开商业信息【官网回滚纠偏·用户 2026-08-02/03】 | 🔨 待办 | — | 待验 | [T-668 历史定价口径](docs/superpowers/specs/2026-08-02-creatoros-website-pricing.md) | [详情](BACKLOG-details.md#t-670) |
| T-666 | 根治定位前采误清空既有定位并改为非破坏草稿切换【定位数据安全·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [定位非破坏草稿 SPEC](docs/superpowers/specs/2026-08-02-positioning-non-destructive-draft.md) | [详情](BACKLOG-details.md#t-666) |
| T-665 | 支持彻底删除内容雷达信源及其全部归属数据【信源生命周期·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [信源彻底删除 SPEC](docs/superpowers/specs/2026-08-02-intelligence-source-hard-delete.md) | [详情](BACKLOG-details.md#t-665) |
| T-662 | 根治成片把内部结构标签当正文并优化卡片文字重合【视频内容质量·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [视频制作 overhaul SPEC](docs/superpowers/specs/2026-07-13-video-production-overhaul-design.md) | 视频场景标题和卡片正文必须来自观众可读的真实口播主张，`hook/value/新闻钩子` 等内部编导标签只能做控制元数据，不能直接出现在画面；同时按真实画布安全区、文本长度和人物画面占位约束卡片排版，避免文字重合与空黑屏。 |
| T-661 | 根治项目素材未进入制作、采纳后仍转圈及素材包图片无扩展名【制作闭环·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [结构/脚本/分镜一致性 SPEC](docs/superpowers/specs/2026-07-17-structure-script-storyboard-consistency-design.md) | [详情](BACKLOG-details.md#t-661) |
| T-660 | 根治雷达预填逐字稿未解锁下一步及已采纳封面仍被判缺失【项目状态回显·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) | 项目阶段状态必须从真实已保存逐字稿和项目已采纳封面素材派生，不能依赖用户再敲一次键触发本地脏状态，也不能只认某一种封面生成回写字段；修复首次进入、采纳后即时回显与刷新后回显，并补真实链路回归。 |
| T-656 | 收紧桌面授权本地信任链，移除生产冒烟旁路并消除 verdict 私钥明文靶点【安全加固·用户 2026-08-02】 | ⏸️ 待办 | PASS[REV:5f6970ac76f2] | 待验 | [SPEC](docs/superpowers/specs/2026-08-02-desktop-verdict-basic-hardening.md) | [详情](BACKLOG-details.md#t-656) |
| T-655 | 接通 Seedance 文生视频适配器并修复 `seeddance` 配置报未知 provider【文生视频阻断·用户 2026-08-02】 | 🔨 待办 | — | — | 既有 `video.generate` 与异步多模态 provider 契约 | 核实当前 Seedance 配置实际使用的官方或中转协议，在现有多模态 registry 中新增真实 submit→poll→download 适配器，并兼容已经保存的 `seeddance` provider 拼写；生成失败必须给出可行动原因，禁止把已配置能力误报成不支持。 |
| T-654 | 新增 Qwen 方言 ASR 适配器并接入设置预设【逐字稿质量·用户 2026-08-02】 | 🔨 待办 | — | 待验 | 既有 `transcribe.audio` 与多模态 provider 适配器契约 | 新增 `qwen-asr` 真实适配器，调用百炼 Qwen3-ASR 的 `chat/completions + input_audio`，复用安全音频分段并在设置页提供 Qwen 预设；用户只需填写模型名和 Key，未配置时仍回退本地 Whisper，普通话及方言走同一条逐字稿落库链。 |
| T-653 | 支持本地自配与渠道子 Key 托管双模式模型供给【模型商业化·跨仓·用户 2026-08-02】 | 📋 待办 | 待审 | 待验 | [已确认方向与后置条件](docs/research/2026-08-02-activation-managed-relay-subkey-design.md) | [详情](BACKLOG-details.md#t-653) |
| T-652 | 重构定位前采为必经的编导式访谈与证据辅助工作流【定位业务流·用户 2026-08-01】 | ⏸️ 待办 | 待审 | 待验 | [SPEC 方向已修订·待复审](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) | [详情](BACKLOG-details.md#t-652) |
| T-650 | 知识倾倒输入框支持拖拽文件直接导入【知识录入体验·用户 2026-08-01】 | 🔨 待办 | — | 待验 | 既有知识蒸馏与文件导入契约 | 用户可把当前支持的 PDF、DOCX、Markdown、TXT 文件直接拖进大输入框，获得明确拖入态、上传进度、成功结果与错误提示；拖拽必须复用现有文件导入真链路，不新增第二套解析或假上传。 |
| T-651 | 内容雷达默认按作品真实发布时间倒序【排序语义·用户 2026-08-01】 | 🔨 待办 | — | 待验 | 内容雷达既有列表排序契约 | 排序项改名为「最新发布」，主排序键必须是来源作品真实 `publishedAt`、且倒序；不得以采集入库、指标快照或最后更新时间冒充发布时间。发布时间相同时再以收录时间和稳定 ID 倒序；缺失发布时间的条目置后并如实显示。 |
| T-649 | 调研并设计激活后渠道白标：品牌名、应用内 Logo 与系统级图标边界【商业渠道·跨仓·用户 2026-08-01】 | 📋 待办 | — | 待验 | [调研结论](docs/research/2026-08-01-channel-white-label-runtime-branding-audit.md) | [详情](BACKLOG-details.md#t-649) |
| T-646 | 统一优化结构化 AI 工具为结果优先、分段生成与局部修复【性能与可靠性·用户 2026-08-01】 | 🔨 待办 | — | 待验 | [审计待补](docs/research/2026-08-01-structured-ai-tool-reliability-audit.md) | [详情](BACKLOG-details.md#t-646) |
| T-645 | 收敛模型配置项并同步精简 Growth 渠道模板【设置体验·跨仓配置·用户 2026-08-01/02】 | ⏸️ 待办 | PASS[REV:5dfe24b42eb7] | 待验 | [逐能力管控 SPEC](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) | [详情](BACKLOG-details.md#t-645) |
| T-644 | 根治 CreatorOS macOS 客户端持续闪屏【运行态阻断·用户 2026-08-01】 | 🔨 待办 | — | 待验 | 既有桌面启动、sidecar 与 WebView 日志契约 | 基于当前安装包和本机实时日志区分 WebView 重载、前端异常重渲染、窗口重复创建或进程崩溃重启；锁定可复现触发源后修复，并验证页面稳定、数据不丢且不引入启动回归。 |
| T-643 | 收口 CreatorOS 为输入 Activity 激活码后直接授权，隐藏当前权益领取入口【商业激活主线·用户 2026-08-01】 | 📋 待办 | — | 待验 | [跨仓唯一链路](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-129-activation-code-single-flow.md) | [详情](BACKLOG-details.md#t-643) |
| T-642 | 打通内容雷达对标文案→改写策略→选题卡→项目写稿的编导证据链【产品链路·用户 2026-08-01/02】 | ⏸️ 待办 | CONCERNS[REV:7728c9ed44bd] | 待验 | [SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) | [详情](BACKLOG-details.md#t-642) |
| T-641 | 根治发布中心“登录多日仍只有一个采集日、发布趋势不出曲线”【线上数据回流·用户 2026-07-31】 | 🔨 待办 | — | 待验 | 既有发布中心与抖音自动采集契约 | 以真实账号日志和 `metric_snapshots` 为证据，核实定时作品指标采集是否逐日执行、按账号落库并被发布中心查询；多个采集日必须形成真实折线，单日继续诚实显示单点，禁止按登录天数伪造趋势。 |
| T-640 | 配置 Apple Developer ID 签名与公证，并在前序修复全部闭环后统一产出本地安装包【发布·用户 2026-07-31】 | 🔨 待办 | — | 待验 | [本次打包证据](orchestrator/GATE-T640-BUILD.md) | [详情](BACKLOG-details.md#t-640) |
| T-635 | 把 CreatorOS 正式构建绑定到 Growth 商品的统一 `projectKey`，禁止运行时覆盖产品身份或关闭严格验签 | ⏸️ 本地实现待验 | PASS[REV:b8add273a494] | 待验 | [SPEC](docs/superpowers/specs/2026-07-30-growth-product-identity-binding.md) | 可分发包 exact `creatoros`、身份/验签不可运行时覆盖、三仓本地 identity 联调已通过；claim 保持关闭，等待统一提交与生产 J-047 receipt |
| T-633 | 根治内容雷达生成选题卡失败并恢复创作者中心自动扫码【线上阻断·用户 2026-07-30】 | 🔨 待办 | — | 待验 | 既有内容雷达与抖音登录契约 | 按最新日志修复 `topic_preview` 真实失败链；首次扫码直接打开创作者中心二维码页并复用同一按账号登录态，不再把普通抖音首页当默认入口。 |
| T-632 | 根治“新建定位母版”无效、历史母版无法恢复与逐字稿提取长时间无结果【线上阻断·用户 2026-07-30/31】 | 🔨 待办 | — | 待验 | [GATE](orchestrator/GATE-T632-BUILD.md) | [详情](BACKLOG-details.md#t-632) |
| T-631 | 根治大视频上传被 10MB 截断并误报 ffmpeg 缺失【线上阻断·用户 2026-07-30】 | 🔨 待办 | — | 待验 | [既有视频执行 SPEC](docs/superpowers/specs/2026-07-11-execution-layer-video-pipeline-design.md) | 修复桌面本地 blob 大文件上传截断，complete 前校验声明大小与实际大小，并把 `moov atom not found` 等素材损坏错误与二进制缺失严格分流；聚焦回归后产出本地安装包。 |
| T-621 | 补齐渠道模型 authority snapshot 生产链路回归【非阻断测试增强·T-606 复核】 | 📋 待办 | — | — | [绑定契约](docs/superpowers/specs/2026-07-29-creatoros-channel-model-authority.contract.md) | 补 `createTask → persistence → authority change → cancel/no provider call` 完整链路证据，不改变已确认契约。 |
| T-576 | 统一跟进尚未关闭的飞书线上用户反馈【线上支持】 | 🔨 免审 | — | — | [反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | 只负责新反馈分诊、进度同步和邮件闭环；故障实现由各自任务承接，未真机解决不得提前结案。 |
| T-575 | 接通 CreatorOS 权益领取、渠道配置与问题反馈【跨系统上线闭环】 | 🔨 本地PASS·待生产E2E | — | 待验 | [SPEC](docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md) · [Gate](orchestrator/GATE-T575-BUILD.md) | 本地链路已通过；待真实发布材料、live HTTPS 三仓 E2E、双平台凭据后端与正式发布许可。 |
| T-562 | 根治 CreatorOS 0.2.0 Windows 安装后持续白屏【发布阻断】 | 🔨 免审 | — | 待验 | [SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · [复盘](docs/research/2026-07-24-windows-first-launch-white-screen.md) | 待真实启动链取证并修复 sidecar/WebView 导航；新包须通过安装后启动、health ready 与非白屏交互 Gate。 |
| T-548 | 根治视频渲染重试后成片脱离项目且制作页实时预览消失【发布阻断·用户 2026-07-26】 | 🔨 待安装版真机 | — | 待验 | [既有 T-292/T-254 规格](docs/superpowers/specs/2026-07-13-video-production-overhaul-design.md) | 重试 taskId 回传、项目/output/usage 幂等关联、export、内联预览恢复和图片 B-roll MIME 分流均已实现并通过聚焦测试；仅保留安装版真实渲染、成片回放与素材使用记录验收。 |
| T-538 | 接通渠道签名上下文的产品问题反馈【跨仓契约·上线闭环】 | 🔨 本地PASS·待生产E2E | — | 待验 | [契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/channel-bound-product-feedback-v1.md) · [Gate](orchestrator/GATE-T538-BUILD.md) | 本地可信提交、失败保留和幂等重试已通过；待正式接口部署、发布 origin、真实激活码三系统 E2E 与独立复核。 |
| T-536 | 根治“我的收藏”同步错误分类与浏览器档案锁恢复【bug·多账号采集·用户 2026-07-26】 | 🔨 待真实账号只读验收 | — | 待验 | 无 SPEC（既有收藏读取链故障） | 代码已提交 `85312bd2`：跨 chunk 错误按稳定 code 恢复、无活 context 才精准清锁且只重试一次、诊断脱敏、UI 给恢复动作；定向 130 tests、typecheck、build、boundary 通过，待有效登录态做真实收藏只读验收。 |
## ⏸️ 暂停池（不自动派发）

> 只保留任务索引；暂停原因与恢复条件见 `orchestrator/events.ndjson` 和详情文档。恢复必须使用 `taskctl start`。

| ID | 搁置 | 文档 |
|---|---|---|
| T-626 | ⏸️ | [详情](BACKLOG-details.md#t-626) |
| T-577 | ⏸️ | [详情](BACKLOG-details.md#t-577) |
| T-565 | ⏸️ | [详情](BACKLOG-details.md#t-565) |
| T-524 | ⏸️ | [详情](BACKLOG-details.md#t-524) |
| T-519 | ⏸️ | [详情](BACKLOG-details.md#t-519) |
| T-525 | ⏸️ | [详情](BACKLOG-details.md#t-525) |
| T-517 | ⏸️ | [详情](BACKLOG-details.md#t-517) |
| T-516 | ⏸️ | [详情](BACKLOG-details.md#t-516) |
| T-510 | ⏸️ | [详情](BACKLOG-details.md#t-510) |
| T-506 | ⏸️ | [详情](BACKLOG-details.md#t-506) |
| T-502 | ⏸️ | [详情](BACKLOG-details.md#t-502) |
| T-497 | ⏸️ | [详情](BACKLOG-details.md#t-497) |
| T-451 | ⏸️ | [详情](BACKLOG-details.md#t-451) |
| T-449 | ⏸️ | [详情](BACKLOG-details.md#t-449) |
| T-448 | ⏸️ | [详情](BACKLOG-details.md#t-448) |
| T-433 S2 | ⏸️ | [详情](BACKLOG-details.md#t-433-s2) |
| T-433 S4 | ⏸️ | [详情](BACKLOG-details.md#t-433-s4) |
| T-433 S5 | ⏸️ | [详情](BACKLOG-details.md#t-433-s5) |
| T-426 | ⏸️ | [详情](BACKLOG-details.md#t-426) |
| T-425W | ⏸️ | [详情](BACKLOG-details.md#t-425w) |
| T-413 | ⏸️ | [详情](BACKLOG-details.md#t-413) |
| T-417 | ⏸️ | [详情](BACKLOG-details.md#t-417) |
| T-418 | ⏸️ | [详情](BACKLOG-details.md#t-418) |
| T-420 | ⏸️ | [详情](BACKLOG-details.md#t-420) |
| T-399 | ⏸️ | [详情](BACKLOG-details.md#t-399) |
| T-399c | ⏸️ | [详情](BACKLOG-details.md#t-399c) |
| T-409 | ⏸️ | [详情](BACKLOG-details.md#t-409) |
| T-372 W-spike | ⏸️ | [详情](BACKLOG-details.md#t-372-w-spike) |
| T-372 W-ci | ⏸️ | [详情](BACKLOG-details.md#t-372-w-ci) |
| T-391 H-econ | ⏸️ | [详情](BACKLOG-details.md#t-391-h-econ) |
| T-393 | ⏸️ | [详情](BACKLOG-details.md#t-393) |
| T-401 | ⏸️ | [详情](BACKLOG-details.md#t-401) |
| T-406 | ⏸️ | [详情](BACKLOG-details.md#t-406) |
| T-407 | ⏸️ | [详情](BACKLOG-details.md#t-407) |
| T-396 | ⏸️ | [详情](BACKLOG-details.md#t-396) |
| T-398 | ⏸️ | [详情](BACKLOG-details.md#t-398) |
| T-366c | ⏸️ | [详情](BACKLOG-details.md#t-366c) |
| T-361 | ⏸️ | [详情](BACKLOG-details.md#t-361) |
| T-352 | ⏸️ | [详情](BACKLOG-details.md#t-352) |
| T-320c | ⏸️ | [详情](BACKLOG-details.md#t-320c) |
| T-350c | ⏸️ | [详情](BACKLOG-details.md#t-350c) |
| T-351 | ⏸️ | [详情](BACKLOG-details.md#t-351) |
| T-349d | ⏸️ | [详情](BACKLOG-details.md#t-349d) |
| T-339 | ⏸️ | [详情](BACKLOG-details.md#t-339) |
| T-328 | ⏸️ | [详情](BACKLOG-details.md#t-328) |
| T-332R | ⏸️ | [详情](BACKLOG-details.md#t-332r) |
| T-336 | ⏸️ | [详情](BACKLOG-details.md#t-336) |
| T-335 | ⏸️ | [详情](BACKLOG-details.md#t-335) |
| T-337 | ⏸️ | [详情](BACKLOG-details.md#t-337) |
| T-337a | ⏸️ | [详情](BACKLOG-details.md#t-337a) |
| T-337b | ⏸️ | [详情](BACKLOG-details.md#t-337b) |
| T-337c | ⏸️ | [详情](BACKLOG-details.md#t-337c) |
| T-337d | ⏸️ | [详情](BACKLOG-details.md#t-337d) |
| T-337e | ⏸️ | [详情](BACKLOG-details.md#t-337e) |
| T-337f | ⏸️ | [详情](BACKLOG-details.md#t-337f) |
| T-337g | ⏸️ | [详情](BACKLOG-details.md#t-337g) |
| T-334 | ⏸️ | [详情](BACKLOG-details.md#t-334) |
| T-324 | ⏸️ | [详情](BACKLOG-details.md#t-324) |
| T-340 | ⏸️ | [详情](BACKLOG-details.md#t-340) |
| T-315 | ⏸️ | [详情](BACKLOG-details.md#t-315) |
| T-316 | ⏸️ | [详情](BACKLOG-details.md#t-316) |
| T-317 | ⏸️ | [详情](BACKLOG-details.md#t-317) |
| T-318 | ⏸️ | [详情](BACKLOG-details.md#t-318) |
| T-319 | ⏸️ | [详情](BACKLOG-details.md#t-319) |
| T-312 | ⏸️ | [详情](BACKLOG-details.md#t-312) |
| T-307 | ⏸️ | [详情](BACKLOG-details.md#t-307) |
| T-306 | ⏸️ | [详情](BACKLOG-details.md#t-306) |
| T-301 | ⏸️ | [详情](BACKLOG-details.md#t-301) |
| T-302 | ⏸️ | [详情](BACKLOG-details.md#t-302) |
| T-261 | ⏸️ | [详情](BACKLOG-details.md#t-261) |
| T-249 | ⏸️ | [详情](BACKLOG-details.md#t-249) |
| T-250 | ⏸️ | [详情](BACKLOG-details.md#t-250) |
| T-255b | ⏸️ | [详情](BACKLOG-details.md#t-255b) |
| T-185R | ⏸️ | [详情](BACKLOG-details.md#t-185r) |
| T-136R | ⏸️ | [详情](BACKLOG-details.md#t-136r) |
| T-100 | ⏸️ | [详情](BACKLOG-details.md#t-100) |
| T-087 | ⏸️ | [详情](BACKLOG-details.md#t-087) |
| T-045 | ⏸️ | [详情](BACKLOG-details.md#t-045) |

## ✅ 已完成

> ✅ 已完成任务全文已归档到 [BACKLOG-archive.md](BACKLOG-archive.md)(减小本看板体积;单一执行真相仍是本文件)。
