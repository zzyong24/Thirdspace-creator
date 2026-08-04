# CreatorOS 任务看板(BACKLOG)

> **单一执行真相。每个会话必读(SessionStart hook 自动注入)。** 规则见 `CLAUDE.md` 的「任务流程铁律」。
> 状态:📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置 · ⛔ SPEC 审核 FAIL(没过审不准开工)。
> 读取顺序:**本看板 → 任务引用的 SPEC → 代码**。
> 铁律:需求即任务(提了就建);开工从看板顶取;做完改状态+提交;**禁止 P0/P1 分级、禁止多阶段执行**,任务清楚即起 Workflow/并行 subagent 一次做完。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

| ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话 |
| --- | --- | --- | --- | --- | --- | --- |
| T-688 | 核实 Pi Agent 是否真实接入 CreatorOS 生产链及当前 Agent Loop 归属【架构考古·用户 2026-08-04】 | ✅ 待办 | — | — | [核查报告](docs/research/2026-08-04-pi-agent-production-chain-audit.md) | 只读核对 Pi/pi-mono/pi-mcp-adapter 的依赖、适配器、启动入口、生产调用者、工具循环与持久化链，并与当前 Copilot 真实执行器对照；区分“遗留代码、可选实验、构建产物、生产启用”，给出是否接完、是否用上以及当初停在哪里的证据结论，本轮不修改运行实现。 |
| T-675 | 将 7 月 26 日 production closure 恢复为默认 Windows 正式打包逻辑并重新出包【发布性能·用户 2026-08-03】 | ✅ 待办 | PASS[REV:9025cafddb3d] | — | [SPEC](docs/superpowers/specs/2026-08-03-windows-production-closure-default-release.md) · [性能诊断](docs/research/2026-08-03-windows-v020-current-performance-regression.md) · [既有 RAT](docs/research/2026-07-27-windows-native-burn-transaction-rat-evidence.md) | Windows 默认正式流水线必须复用 7 月 26 日已真机验证的少文件 production closure，不再把开发依赖树和完整 `node_modules` 打进安装包；保留正式身份、授权、安全、更新器和功能闭包，增加体积/文件数/安装/首启硬门槛，构建并下载新的 Windows 安装包供用户验收。 |
| T-690 | 调研 CreatorOS 桌面端增量下载与安全更新方案【发布体验·用户 2026-08-03】 | ✅ 待办 | — | — | [调研报告](docs/research/2026-08-03-desktop-incremental-updater-research.md) | 核对当前 Tauri 版本检查、整包分发、签名产物与双平台安装链，比较官方 updater、文件级分块复用和二进制差分方案在 macOS/Windows 上的下载量、构建复杂度、签名、公证、回滚与 CDN 成本；给出适合 CreatorOS 的单一路线、数据流图、迁移前提和可验证风险，本轮只调研不直接改更新实现。 |
| T-674 | 对比 7 月 26 日 v0.2.0 与当前 Windows 包的性能退化【线上诊断·用户 2026-08-03】 | ✅ 待办 | — | — | [T-667 旧版诊断](docs/research/2026-08-02-windows-user-lag-log-diagnosis.md) · [T-669 止损](docs/superpowers/specs/2026-08-02-windows-background-load-shedding.md) | 核对两版安装包体积、runtime 内容、启动项、数据库迁移、自动化/转写/封面任务与真实用户日志，区分安装/首启/常驻运行三类慢，给出有证据的主因、已覆盖项和仍未覆盖项；本轮只诊断，不把推测当结论。 |
| T-673 | 根治 Copilot 读取本地文件后卡住并形成工具调用重试风暴【AI 对话阻断·用户 2026-08-03】 | ✅ 待办 | — | — | 既有 `local.read` HITL、AI SDK UI message stream 与对话历史窗口契约 | `local.read` 成功读取本地文件（含分段读取的大文件）后必须把结果与原工具调用稳定配对并继续回答；若历史消息或 provider 流缺失 invocation 起点，客户端必须以可恢复终态结束该轮，禁止 `sendAutomaticallyWhen` 对同一 call ID 自动无限续跑。补真实故障形态回归：同一坏调用只失败一次、不会持续转圈、不会产生重复请求与日志风暴。 |
| T-672 | 官网撤下全部公开价格与个人联系方式【代理利润保护·用户 2026-08-03】 | ✅ 待办 | PASS[REV:178b9884695a] | PASS:32e96935e716 | [公开信息收口 SPEC](docs/superpowers/specs/2026-08-03-creatoros-public-price-contact-withdrawal.md) | 官网只介绍 CreatorOS 产品能力、支持平台和本机数据特点；公开页、智能客服、页面源码与可直接访问的静态资源不得再出现零售价、代理进货价、续费价、利润/价差、个人微信、备用微信、个人邮箱或个人二维码。获取方式统一为“联系向你推荐 CreatorOS 的授权合作伙伴”，避免终端客户绕开代理。 |
| T-671 | 确定 CreatorOS 代理商业模式与官网价格边界【渠道商业化·用户 2026-08-02/03】 | 🔨 待办 | — | 待验 | [代理合作口径](docs/superpowers/specs/2026-08-02-creatoros-agent-channel-policy.md) · [公开信息收口](docs/superpowers/specs/2026-08-03-creatoros-public-price-contact-withdrawal.md) · [渠道白标调研](docs/research/2026-08-01-channel-white-label-runtime-branding-audit.md) | 代理价盘与资格仍是内部经营规则，不再作为官网公开内容；官网不展示任何价格、利润、个人联系方式或直营购买入口，只引导访问者联系向其推荐 CreatorOS 的授权合作伙伴，保护代理线索和成交空间。 |
| T-670 | 恢复 CreatorOS 部署前真实官网并收口公开商业信息【官网回滚纠偏·用户 2026-08-02/03】 | 🔨 待办 | — | 待验 | [T-668 历史定价口径](docs/superpowers/specs/2026-08-02-creatoros-website-pricing.md) · [T-672 当前公开边界](docs/superpowers/specs/2026-08-03-creatoros-public-price-contact-withdrawal.md) | 在恢复部署前真实官网视觉和产品结构的基础上，按 T-672 删除全部公开价格、利润、个人联系方式、个人二维码与直营购买入口；保留产品能力、飞轮、设备支持和更新日志。2026-08-02 已补齐真实产品图片并修正静态资源 404 语义。 |
| T-669 | 根治 Windows 后台封面回填风暴与旧信源脏链接崩溃，并产出双平台安装包【线上性能修复·用户 2026-08-02】 | ✅ 待办 | — | — | [SPEC](docs/superpowers/specs/2026-08-02-windows-background-load-shedding.md) · [T-667 诊断](docs/research/2026-08-02-windows-user-lag-log-diagnosis.md) | 旧版遗留的抖音分享文案型 URL 不得再让内容雷达工作区整体崩溃；封面回填每轮收敛为小批量，遇到抖音共享网关长冷却须立即结束本轮并把剩余项延后，禁止继续制造失败、日志和 CPU/网络负载。完成聚焦 TDD 与边界检查后提交 main，触发 macOS + Windows 正式流水线并交付安装包。 |
| T-668 | 更新 CreatorOS 官网内测共创价与正式订阅价【官网商业化·用户 2026-08-02】 | ✅ 待办 | — | PASS:81c1b465944a | [官网定价 SPEC](docs/superpowers/specs/2026-08-02-creatoros-website-pricing.md) | 官网公开价格统一为：内测群用户在 2026 年 8 月 10 日前可按 599 元一次买断参与共创；正式版在内测结束后为 899 元/年、次年续费 199 元/年且不再提供永久买断。购买与设备通用信息置于价格前：一机一码，每个激活码仅绑定 1 台设备；当前支持 Apple 芯片 Mac 与 Windows，Intel Mac 仅标“适配推进中”。删除旧 1499 元、永久免费更新、Mac/Windows 无差别支持及限量手动发码等过时承诺，购买入口引导有意向用户私聊并进入单独共创群。 |
| T-667 | 排查 Windows 用户运行 CreatorOS 持续卡顿【线上性能诊断·飞书最新反馈·用户 2026-08-02】 | ✅ 待办 | — | — | [诊断报告](docs/research/2026-08-02-windows-user-lag-log-diagnosis.md) | 读取飞书最新 Windows 用户反馈及日志，按时间线核对进程重启、自动化任务、抖音采集 Chrome、模型调用、数据库与前端渲染，量化 CPU/内存/磁盘与重复请求迹象，先给出可复核根因和现有版本覆盖情况；未经确认不把猜测写成结论。 |
| T-666 | 根治定位前采误清空既有定位并改为非破坏草稿切换【定位数据安全·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [定位非破坏草稿 SPEC](docs/superpowers/specs/2026-08-02-positioning-non-destructive-draft.md) · [真实浏览器旅程](orchestrator/T666-FRONTEND-JOURNEY.md) · [T-652 前采主流程](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) | 只要账号存在正式定位，进入“完全从零开始”、中途退出、刷新或访谈未完成都不得清空、替换或隐藏当前母版与历史版本；前采只写可恢复草稿，只有新定位完整生成且用户明确采纳后才新增正式版本并切换，旧版本始终可见可恢复。 |
| T-665 | 支持彻底删除内容雷达信源及其全部归属数据【信源生命周期·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [信源彻底删除 SPEC](docs/superpowers/specs/2026-08-02-intelligence-source-hard-delete.md) · [真实浏览器旅程](orchestrator/T665-FRONTEND-JOURNEY.md) · [内容雷达服务契约](docs/superpowers/specs/2026-07-23-content-radar-service-contract.md) | 信源卡提供明确的“删除信源与内容”动作，二次确认后由 intelligence backend service 在所有权校验和事务内删除该信源、仅归属于它的内容/逐字稿/快照/运行与任务状态；被其他信源或正式项目引用的数据按契约保留或解除关联，UI 不再继续显示已删除信源。 |
| T-664 | 将内置 IP 课程逐章产品化改写并融合本机方法论知识库【课程内容·用户 2026-08-02】 | ✅ 待办 | — | PASS:77abb2a81ba4 | [课程编辑 SPEC](docs/superpowers/specs/2026-08-02-built-in-ip-course-editorial-rewrite.md) · [真实浏览器旅程](orchestrator/T664-FRONTEND-JOURNEY.md) · [T-663 课程架构](docs/superpowers/specs/2026-08-02-built-in-ip-course-reader.md) | 在不改变 T-663 已确认课程架构与用户知识隔离边界的前提下，逐章重写 6 模块 22 讲：移除“薛老师”“老师原话”等课堂转述口吻，以 CreatorOS 自有教学语言统一章节目标、核心方法、步骤、案例、常见误区、实践任务与验收标准，并结合本机方法论知识库补全课程体系；保留来源与授权元数据但不在正文反复露出讲师称谓，完成全量内容校验、真实阅读旅程回归后再构建 Windows/macOS 安装包。 |
| T-663 | 内置“薛辉·怎么做 IP”课程并重做知识库课程阅读体验，完成双平台安装包【知识课程·发布·用户 2026-08-02】 | ✅ 待办 | PASS[REV:44fafb228b46] | PASS:043e7fadb7b4 | [T-524 历史范围](docs/tasks/T484.md#t-524) · [课程交付 SPEC](docs/superpowers/specs/2026-08-02-built-in-ip-course-reader.md) | 承接并替代暂停的 T-524：以用户明确指定的本机 `win-video-tutor` Skill 为唯一课程来源，把其中 6 个模块、22 节课、119 个知识点整理成版本化、可校验、可升级的随包课程；知识库不再用“上方文件夹+下方思维导图”承载课程，而提供课程首页、模块学习路径、知识点连续阅读、苏格拉底提问、实践任务和真实本机进度，同时严格隔离用户知识与课程投影。完成真数据投影、刷新回显和窄屏验收后，按现有 Node 25 构建链产出 macOS 安装包并运行 Windows/macOS 发布流水线。 |
| T-662 | 根治成片把内部结构标签当正文并优化卡片文字重合【视频内容质量·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [视频制作 overhaul SPEC](docs/superpowers/specs/2026-07-13-video-production-overhaul-design.md) | 视频场景标题和卡片正文必须来自观众可读的真实口播主张，`hook/value/新闻钩子` 等内部编导标签只能做控制元数据，不能直接出现在画面；同时按真实画布安全区、文本长度和人物画面占位约束卡片排版，避免文字重合与空黑屏。 |
| T-661 | 根治项目素材未进入制作、采纳后仍转圈及素材包图片无扩展名【制作闭环·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [结构/脚本/分镜一致性 SPEC](docs/superpowers/specs/2026-07-17-structure-script-storyboard-consistency-design.md) · [素材包 SPEC](docs/superpowers/specs/2026-07-17-video-stage-three-paths-and-material-export-design.md) | 项目中已采纳或上传的截图、录屏和生成图必须从统一用料链自动进入制作候选；任务卡刷新后按持久终态停止转圈；素材包必须按真实 MIME/素材类型补安全扩展名，禁止把图片导成 Finder 识别为文稿的无后缀文件。 |
| T-660 | 根治雷达预填逐字稿未解锁下一步及已采纳封面仍被判缺失【项目状态回显·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) | 项目阶段状态必须从真实已保存逐字稿和项目已采纳封面素材派生，不能依赖用户再敲一次键触发本地脏状态，也不能只认某一种封面生成回写字段；修复首次进入、采纳后即时回显与刷新后回显，并补真实链路回归。 |
| T-659 | 生成当前工作树的 macOS 本地验收包【本地打包·用户 2026-08-02】 | ✅ 待办 | — | — | [桌面打包脚本](frontend/scripts/desktop/package.mjs) | 保留当前工作树全部改动，以 Node 25 和 `release-fast` 运行统一桌面打包链，生成仅供本机验收的 `.app` 与 `.dmg`，完成最终产物、TLS、verdict、产品身份和真实启动自检；按用户既定偏好跳过公证与公开发布。 |
| T-658 | 排查黑马关键词移除后仍显示及热点宝同步连续失败【内容雷达·用户 2026-08-02】 | ✅ 待办 | — | — | [内容雷达服务契约](docs/superpowers/specs/2026-07-23-content-radar-service-contract.md) · [内容雷达产品规格](docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md) | 以最新 Sidecar 日志、来源真实状态和任务/run 证据为准，区分“移除仅停用并保留历史卡片”的既有语义与 UI 残留 bug，并锁定热点宝最近失败发生在登录、验证码、签名、响应结构、本地黑马过滤或任务终态中的哪一层；本轮先形成可复核诊断，不擅自改实现。 |
| T-657 | 根治定位前采二次联网搜索串用旧结果，并默认国内中文来源优先【搜索体验·用户 2026-08-02】 | ✅ 待办 | — | PASS:7fc49f4d3dae | [真实浏览器旅程](orchestrator/T657-FRONTEND-JOURNEY.md) · [T-652 定位前采 SPEC §6](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md#6-联网调研怎么进入前采) | 每次联网补充必须以本次可见关键词发起独立查询并替换未采纳的上一批候选，已采纳证据继续保留；默认按中国大陆市场、简体中文内容和国内用户语境检索，过滤明显无关/英文境外结果，同时允许用户显式调整地区与语言。 |
| T-656 | 收紧桌面授权本地信任链，移除生产冒烟旁路并消除 verdict 私钥明文靶点【安全加固·用户 2026-08-02】 | 🔨 待办 | PASS[REV:5f6970ac76f2] | 待验 | [SPEC](docs/superpowers/specs/2026-08-02-desktop-verdict-basic-hardening.md) · [本地 BUILD 证据](orchestrator/GATE-T656-BUILD.md) | 正式 Sidecar 只能接受真实 Ed25519 verdict token，打包冒烟改用同一验签链生成短时测试 token；Rust 不再通过 `option_env!` 把 base64 私钥与定位 sentinel 原样编入二进制，改由构建期解码、随机掩码封装并增加最终产物泄漏扫描。明确本地攻击者仍可逆向提取运行时密钥，本任务只消除低成本通用旁路和静态靶点，不冒充服务端终判。 |
| T-655 | 接通 Seedance 文生视频适配器并修复 `seeddance` 配置报未知 provider【文生视频阻断·用户 2026-08-02】 | 🔨 待办 | — | — | 既有 `video.generate` 与异步多模态 provider 契约 | 核实当前 Seedance 配置实际使用的官方或中转协议，在现有多模态 registry 中新增真实 submit→poll→download 适配器，并兼容已经保存的 `seeddance` provider 拼写；生成失败必须给出可行动原因，禁止把已配置能力误报成不支持。 |
| T-654 | 新增 Qwen 方言 ASR 适配器并接入设置预设【逐字稿质量·用户 2026-08-02】 | 🔨 待办 | — | 待验 | 既有 `transcribe.audio` 与多模态 provider 适配器契约 | 新增 `qwen-asr` 真实适配器，调用百炼 Qwen3-ASR 的 `chat/completions + input_audio`，复用安全音频分段并在设置页提供 Qwen 预设；用户只需填写模型名和 Key，未配置时仍回退本地 Whisper，普通话及方言走同一条逐字稿落库链。 |
| T-653 | 支持本地自配与渠道子 Key 托管双模式模型供给【模型商业化·跨仓·用户 2026-08-02】 | 📋 待办 | 待中转站协议确定后补跨仓 SPEC 评审 | 待验 | [已确认方向与后置条件](docs/research/2026-08-02-activation-managed-relay-subkey-design.md) | 当前版本不实现托管子 Key：先支持“渠道下发公开模型/连接配置，用户在 CreatorOS 本机按服务填写 Key”；等中转站的建子 Key、充值、额度、用量、停用与对账协议确定后，再恢复 entitlement→受限子 Key→Growth 充值履约方案，母 Key始终不得进入客户端。 |
| T-652 | 重构定位前采为必经的编导式访谈与证据辅助工作流【定位业务流·用户 2026-08-01】 | 🔨 待办 | PASS[REV:b990448fbe2d] | 待验 | [SPEC 已确认·评审 PASS](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) | 不论账号是否已有作品，都先通过低负担调查问卷、可选联网调研和作品证据完成定位前采；既支持从历史作品中提炼，也允许用户明确从零开始，最终形成有依据、可追溯、可继续访谈修正的定位母版，而不是把历史作品误当成唯一答案。 |
| T-650 | 知识倾倒输入框支持拖拽文件直接导入【知识录入体验·用户 2026-08-01】 | 🔨 待办 | — | 待验 | 既有知识蒸馏与文件导入契约 | 用户可把当前支持的 PDF、DOCX、Markdown、TXT 文件直接拖进大输入框，获得明确拖入态、上传进度、成功结果与错误提示；拖拽必须复用现有文件导入真链路，不新增第二套解析或假上传。 |
| T-651 | 内容雷达默认按作品真实发布时间倒序【排序语义·用户 2026-08-01】 | 🔨 待办 | — | 待验 | 内容雷达既有列表排序契约 | 排序项改名为「最新发布」，主排序键必须是来源作品真实 `publishedAt`、且倒序；不得以采集入库、指标快照或最后更新时间冒充发布时间。发布时间相同时再以收录时间和稳定 ID 倒序；缺失发布时间的条目置后并如实显示。 |
| T-649 | 调研并设计激活后渠道白标：品牌名、应用内 Logo 与系统级图标边界【商业渠道·跨仓·用户 2026-08-01】 | 📋 待办 | — | 待验 | [调研结论](docs/research/2026-08-01-channel-white-label-runtime-branding-audit.md) | 核对 Growth 已发布渠道配置与 CreatorOS 激活消费链，区分可在激活后运行时替换的应用内品牌、窗口标题与帮助入口，以及受 macOS/Windows 包签名、安装元数据、Dock/任务栏缓存约束而必须构建期固定的系统级应用名/图标；给出单一安装包可实现范围、需要独立渠道包的范围及最小可信扩展契约。 |
| T-648 | 根治本机已安装 Node 25 但 CreatorOS 打包反复误用 Node 22【构建可靠性·用户 2026-08-01】 | ✅ 待办 | — | — | 既有桌面打包契约 | 打包入口必须在任何构建副作用前校验 Node 25；macOS 已安装 Homebrew Node 25 但被 `node@22` 抢占 PATH 时自动切到可验证的 Node 25 并贯穿所有子进程，找不到兼容运行时则硬失败，禁止仅告警后继续产出版本错配安装包。 |
| T-647 | 排查用户安装版 Creator Copilot 模型不返回内容而本机同模型正常【线上故障诊断·用户 2026-08-01】 | ✅ 待办 | — | — | [诊断报告](docs/research/2026-08-01-user-copilot-empty-response-log-diagnosis.md) | 以用户提供的两份 sidecar 日志为真相，对齐模型配置、请求 endpoint、状态码、流式事件与客户端空内容兜底，区分用户环境、模型服务、配置差异或客户端解析缺陷；本轮只读诊断，不擅自改实现。 |
| T-646 | 统一优化结构化 AI 工具为结果优先、分段生成与局部修复【性能与可靠性·用户 2026-08-01】 | 🔨 待办 | — | 待验 | [审计待补](docs/research/2026-08-01-structured-ai-tool-reliability-audit.md) | 逐个审计结构化 AI 工具的 schema 复杂度、单次模型职责、重试放大与失败语义；创作内容应先产出可用结果，再补全、校验和优化，非关键字段或增强步骤失败不得清空已有结果或触发整轮疯狂重试。 |
| T-645 | 收敛模型配置项并同步精简 Growth 渠道模板【设置体验·跨仓配置·用户 2026-08-01/02】 | 🔨 待办 | PASS[REV:5dfe24b42eb7] | 待验 | [逐能力管控 SPEC](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · [配置收敛审计](docs/research/2026-08-01-model-configuration-simplification-audit.md) | 普通设置与 Growth 默认模板统一只暴露文本、ASR、生图、生视频；模型 authority 必须按 capability 独立裁决：渠道只锁定完整且当前客户端支持的能力，缺失/残缺/不支持的能力继续允许用户本地配置；同时补齐 `connectionId → connection → service → 本地加密 Key` 真实消费链与服务级 Key复用。 |
| T-644 | 根治 CreatorOS macOS 客户端持续闪屏【运行态阻断·用户 2026-08-01】 | 🔨 待办 | — | 待验 | 既有桌面启动、sidecar 与 WebView 日志契约 | 基于当前安装包和本机实时日志区分 WebView 重载、前端异常重渲染、窗口重复创建或进程崩溃重启；锁定可复现触发源后修复，并验证页面稳定、数据不丢且不引入启动回归。 |
| T-643 | 收口 CreatorOS 为输入 Activity 激活码后直接授权，隐藏当前权益领取入口【商业激活主线·用户 2026-08-01】 | 📋 待办 | — | 待验 | [跨仓唯一链路](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-129-activation-code-single-flow.md) | 当前只保留“输入激活码→Activity 校验/绑定/签名授权→本机保存→按 channelRef 拉配置”；不得要求用户登录 Growth、兑换商品或手动领取权益，既有 entitlement claim 代码暂不删除但退出导航、页面和当前发布验收。 |
| T-642 | 打通内容雷达对标文案→改写策略→选题卡→项目写稿的编导证据链【产品链路·用户 2026-08-01/02】 | 🔨 待办 | CONCERNS[REV:7728c9ed44bd] | 待验 | [SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) · [链路审计](docs/research/2026-08-01-content-radar-topic-project-script-chain-audit.md) | 对标原文、拆解和策略继续按不可变证据绑定项目并供 AI 消费，但项目 UI 不再展示左侧对标原稿；内容雷达改写稿作为同一份项目口播稿透传，脚本页、制作视频与项目编导工具统一读取，正式 `output_script` 保存后接管唯一正文真相，普通项目保持原链路。 |
| T-641 | 根治发布中心“登录多日仍只有一个采集日、发布趋势不出曲线”【线上数据回流·用户 2026-07-31】 | 🔨 待办 | — | 待验 | 既有发布中心与抖音自动采集契约 | 以真实账号日志和 `metric_snapshots` 为证据，核实定时作品指标采集是否逐日执行、按账号落库并被发布中心查询；多个采集日必须形成真实折线，单日继续诚实显示单点，禁止按登录天数伪造趋势。 |
| T-640 | 配置 Apple Developer ID 签名与公证，并在前序修复全部闭环后统一产出本地安装包【发布·用户 2026-07-31】 | 🔨 待办 | — | 待验 | [本次打包证据](orchestrator/GATE-T640-BUILD.md) · [T-575 测试发行与回滚](docs/handoffs/T-575-CreatorOS测试发行与回滚.md) | Developer ID Application 私钥只存本机登录钥匙串，公证凭据只存 notarytool 钥匙串 profile；先完成 T-637/T-638/T-639 与既有安装包 Gate，再产出签名、公证、staple 且可通过 Gatekeeper 验证的 DMG，不把证书私钥、密码或 API Key 写进仓库和日志。 |
| T-635 | 把 CreatorOS 正式构建绑定到 Growth 商品的统一 `projectKey`，禁止运行时覆盖产品身份或关闭严格验签 | 🔨 本地实现待验 | PASS[REV:b8add273a494] | 待验 | [SPEC](docs/superpowers/specs/2026-07-30-growth-product-identity-binding.md) | 可分发包 exact `creatoros`、身份/验签不可运行时覆盖、三仓本地 identity 联调已通过；claim 保持关闭，等待统一提交与生产 J-047 receipt |
| T-633 | 根治内容雷达生成选题卡失败并恢复创作者中心自动扫码【线上阻断·用户 2026-07-30】 | 🔨 待办 | — | 待验 | 既有内容雷达与抖音登录契约 | 按最新日志修复 `topic_preview` 真实失败链；首次扫码直接打开创作者中心二维码页并复用同一按账号登录态，不再把普通抖音首页当默认入口。 |
| T-632 | 根治“新建定位母版”无效、历史母版无法恢复与逐字稿提取长时间无结果【线上阻断·用户 2026-07-30/31】 | 🔨 待办 | — | 待验 | [GATE](orchestrator/GATE-T632-BUILD.md) | 新建定位母版须确认后直接清空当前定位并进入空白母版；重置前完整母版（画像、facets、五类规则、定位陈述）须形成不可变快照，历史恢复以追加新版本方式真实回写并刷新可读，绝不修改旧历史；旧版只留陈述、确实缺少画像快照的记录须诚实降级为“复制定位陈述”，不得假装完整恢复。按真实日志拆解逐字稿任务排队、媒体处理与模型调用耗时，修复阻塞且呈现诚实反馈。 |
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

| ID | 任务 | 搁置 | 文档 | 恢复条件 |
|---|---|---|---|---|
| T-626 | CreatorOS 多模型数组与 9 类能力选择【用户明确延期】 | ⏸️ | [绑定契约](docs/superpowers/specs/2026-07-29-creatoros-channel-model-authority.contract.md) | 用户明确重启后再进入客户端消费与真调用 E2E。 |
| T-577 | 安装包缺 `sidecar.tar.gz`【用户明确忽略】 | ⏸️ | [反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | 取得系统、版本与下载来源后重启。 |
| T-565 | Windows Runtime 原生 Burn/事务交付 | ⏸️ | [SPEC](docs/superpowers/specs/2026-07-27-windows-runtime-delivery-burn-transaction.md) · [RAT](docs/research/2026-07-27-windows-native-burn-transaction-rat-evidence.md) | 原生 RAT 已通过；待 Round 2 复审、BUILD 与安装版 E2E。 |
| T-524 | 自媒体方法随包内置知识库 | ⏸️ | [详情](docs/tasks/T484.md#t-524) | 确认第三方内容商业改编和分发权。 |
| T-519 | 知识库文件工作区与用户知识底座 | ⏸️ | [PLAN](docs/superpowers/specs/2026-07-26-knowledge-workspace-lean.md) | Round 3 major 清零并通过正式 Gate。 |
| T-525 | 旧 `.doc` 与扫描 PDF OCR | ⏸️ | [详情](docs/tasks/T484.md#t-525) | 补足 20 份 `.doc`、OCR 语料和独立评审。 |
| T-517 | CreatorOS 生产预设自动化底座 | ⏸️ | [PLAN](docs/superpowers/specs/2026-07-26-creatoros-automation-kernel-minimal.md) | 用户恢复范围并通过契约 Gate。 |
| T-516 | 设置内“AI 对我的理解”与账号健康检查【产品+架构·用户 2026-07-25/26】 | ⏸️ | [纠偏 PLAN](docs/superpowers/specs/2026-07-26-copilot-context-health-minimal.md) · [最终审计](docs/superpowers/specs/2026-07-26-overdesign-scope-reset.review.md) | 自动扫描只做可证明的确定性问题；保留 AI 起草、用户确认/调整后经现有定位链保存，依赖 T-517 新 CONTRACT。 |
| T-510 | 优化 Copilot 媒体工具编排 | ⏸️ | [PLAN](docs/superpowers/specs/2026-07-25-copilot-media-orchestration-replacement.md) | 通过现有契约评审并恢复 BUILD。 |
| T-506 | 接入 growth 年卡购买与次年续费【商业化·用户 2026-0… | ⏸️ | [SPEC](docs/superpowers/specs/2026-07-24-annual-renewal-growth-integration.md) · [契约](docs/superpowers/specs/2026-07-24-annual-renewal-growth-integration.contract.md) |
| T-502 | T-496 退回 PLAN 重做：收藏来源自由选择任一已绑定账号 … | ⏸️ | [D](docs/tasks/T484.md#t-502) |
| T-497 | 用户知识库受控检索与脚本引用设计：大语料、质量差异、权威资料支配风… | ⏸️ | [D](docs/tasks/T484.md#t-497) |
| T-451 | 【防逆向优化 D-④·战略层·合并 T-447】把 license… | ⏸️ | [D](docs/tasks/T484.md#t-451) |
| T-449 | ~~【防逆向优化 D-②】Windows 直装 sidecar 目… | ⏸️ | [D](docs/tasks/T484.md#t-449) |
| T-448 | 【防逆向优化 D-①-b】sidecar 内父进程/magic 自检 | ⏸️ | [D](docs/tasks/T484.md#t-448) |
| T-433 S2 | gate-F5 升两级优先串行闸(并发仍=1):明细类(self.… | ⏸️ | [D](docs/tasks/T484.md#t-433-s2) |
| T-433 S4 | 排队进度可见:job_run 加真 `queued` 态(crea… | ⏸️ | [D](docs/tasks/T484.md#t-433-s4) |
| T-433 S5 | (可选)benchmark/darkhorse 加已知 aweme… | ⏸️ | [D](docs/tasks/T484.md#t-433-s5) |
| T-426 | Windows 真机装完打开白屏「127.0.0.1 拒绝连接 /… | ⏸️ | [D](docs/tasks/T484.md#t-426) |
| T-425W | Windows 安装器 WebView2 离线化:`tauri.w… | ⏸️ | [D](docs/tasks/T484.md#t-425w) |
| T-413 | 上线前防逆向/防盗版落地(两新方案文档落地 + 现有 T-391/… | ⏸️ | [D](docs/tasks/T484.md#t-413) |
| T-417 | L1 字符串加密补齐:chunks/ 的 prompt/端点 rc… | ⏸️ | [D](docs/tasks/T484.md#t-417) |
| T-418 | L2 sidecar 加密落盘:tar AES-256-GCM(b… | ⏸️ | [D](docs/tasks/T484.md#t-418) |
| T-420 | L4 皇冠函数 napi-rs 原生化(2-3 个;**授权终判已… | ⏸️ | [D](docs/tasks/T484.md#t-420) |
| T-399 | 反 AI 破解欺骗层调研+方案【调研·防逆向下一层·用户 2026… | ⏸️ | [D](docs/tasks/T484.md#t-399) |
| T-399c | 反破解欺骗片3:D3 严格不可达迷宫 + D4 量化污染(诱饵占比… | ⏸️ | [D](docs/tasks/T484.md#t-399c) |
| T-409 | 创作包只读导出端点(供 ArticleOS 拉取)【跨仓需求·Ar… | ⏸️ | [D](docs/tasks/T484.md#t-409) |
| T-372 W-spike | 双端地基 spike(先行):Win 系统 tar.exe(bsd… | ⏸️ | [D](docs/tasks/T484.md#t-372-w-spike) |
| T-372 W-ci | GitHub Actions matrix(macos-lates… | ⏸️ | [D](docs/tasks/T484.md#t-372-w-ci) |
| T-391 H-econ | 破解经济学(短板兜底·**后续波次·依赖 L1s 服务端·非本仓·… | ⏸️ | [D](docs/tasks/T484.md#t-391-h-econ) |
| T-393 | 稿面审核状态不刷新:脚本改后重新审核完成,横幅仍说「脚本已改动,当… | ⏸️ | [D](docs/tasks/T484.md#t-393) |
| T-401 | 配置备份导出/导入报 `forbidden: request mu… | ⏸️ | [D](docs/tasks/T484.md#t-401) |
| T-406 | 腾讯云 CDN 藏源站 IP + 挡 DDoS + WAF/限流(… | ⏸️ | [D](docs/tasks/T484.md#t-406) |
| T-407 | 盲预测深结合历史战绩:建「历史战绩画像」(完播/CTR/播放中位数… | ⏸️ | [D](docs/tasks/T484.md#t-407) |
| T-396 | 渠道化(代理白标)链接 + 更新分发改造【需求·商业模型·用户 2… | ⏸️ | [D](docs/tasks/T484.md#t-396) |
| T-398 | scheduler 启动清僵尸 ai_task 报 Account… | ⏸️ | [D](docs/tasks/T484.md#t-398) |
| T-366c | G3 · 真机验收:上传成品→发布走通;导出 zip 解开含全素材… | ⏸️ | [D](docs/tasks/T484.md#t-366c) |
| T-361 | 素材视觉模型自动打标签:接 model-config 视觉 cap… | ⏸️ | [D](docs/tasks/T484.md#t-361) |
| T-352 | Windows 双端打包(独立工程)【发布·用户 2026-07-… | ⏸️ | [D](docs/tasks/T484.md#t-352) |
| T-320c | 剪辑质量:视频信息卡避让底部字幕带(place() 纵向溢出策略)… | ⏸️ | [D](docs/tasks/T484.md#t-320c) |
| T-350c | S3 · 真机验收:重打包/dev 真跑 AC-1~5(MiniM… | ⏸️ | [D](docs/tasks/T484.md#t-350c) |
| T-351 | 审核能力单一真值化:审核 SOP 从各生成模板抽出→收进**产品级… | ⏸️ | [D](docs/tasks/T484.md#t-351) |
| T-349d | S4 · 真机验收:AC-1~5(对标抓稿+幂等复用/图集 ski… | ⏸️ | [D](docs/tasks/T484.md#t-349d) |
| T-339 | frontend lint 债务清零:全仓 eslint 2461… | ⏸️ | [D](docs/tasks/T484.md#t-339) |
| T-328 | 修 T-326 上线审计 bug(4 Blocker/26 Hig… | ⏸️ | [D](docs/tasks/T484.md#t-328) |
| T-332R | 追溯登记补账:API-*/TEST-* 回登 ID_REGISTR… | ⏸️ | [D](docs/tasks/T484.md#t-332r) |
| T-336 | 技能配置页诚实化 + 「我的叮嘱」可视化:①下架/弃用僵尸 ski… | ⏸️ | [D](docs/tasks/T484.md#t-336) |
| T-335 | 用户自定义 skill 体系(L2):三层 skill(L0 出厂… | ⏸️ | [D](docs/tasks/T484.md#t-335) |
| T-337 | 日志与 AI 可观测性层:①轻量 logger 封装(级别/命名空… | ⏸️ | [D](docs/tasks/T484.md#t-337) |
| T-337a | contract 零依赖 logger(级别/ns/traceId… | ⏸️ | [D](docs/tasks/T484.md#t-337a) |
| T-337b | traceId 贯穿:requestId 真 uuid(chat … | ⏸️ | [D](docs/tasks/T484.md#t-337b) |
| T-337c | AI 黑匣子 `ai_call_log` 表(trace/task… | ⏸️ | [D](docs/tasks/T484.md#t-337c) |
| T-337d | webview 错误落盘:root `global-error.t… | ⏸️ | [D](docs/tasks/T484.md#t-337d) |
| T-337e | logging.rs 轮转改大小制(10MB×5 份+现役,启动不… | ⏸️ | [D](docs/tasks/T484.md#t-337e) |
| T-337f | 成本可观测:provider 预设附 pricing(自定义可填,… | ⏸️ | [D](docs/tasks/T484.md#t-337f) |
| T-337g | Pi 会话转录落盘:SessionManager.inMemory… | ⏸️ | [D](docs/tasks/T484.md#t-337g) |
| T-334 | ai_tasks 任务可靠性层:错误分类(配置错误→引导去设置不重… | ⏸️ | [D](docs/tasks/T484.md#t-334) |
| T-324 | Pi 全面接管:抓取网页/截图/自动化任务/剪辑切到 Pi 引擎;… | ⏸️ | [D](docs/tasks/T484.md#t-324) |
| T-340 | agentic.research 三端口真接线(gate-M2 硬… | ⏸️ | [D](docs/tasks/T484.md#t-340) |
| T-315 | Pi 记忆层·memory-tool(读):现有 14 表经 Co… | ⏸️ | [D](docs/tasks/T484.md#t-315) |
| T-316 | Pi 会话续(受控):pi-coding-agent JSONL … | ⏸️ | [D](docs/tasks/T484.md#t-316) |
| T-317 | 跨会话偏好捕捉:对话里偏好/纠正经采纳门 → creator_pr… | ⏸️ | [D](docs/tasks/T484.md#t-317) |
| T-318 | 对话式 skill/记忆进化(飞轮,复活 T-087 skill.… | ⏸️ | [D](docs/tasks/T484.md#t-318) |
| T-319 | Pi 接 MCP client(装 pi-mcp-adapter,… | ⏸️ | [D](docs/tasks/T484.md#t-319) |
| T-312 | 编导式/对话式剪辑 + ChatCut(SPEC track·母任… | ⏸️ | [D](docs/tasks/T484.md#t-312) |
| T-307 | playwright 启动点统一浏览器选择(截图崩 chrome-… | ⏸️ | [D](docs/tasks/T484.md#t-307) |
| T-306 | 首页「页面加载失败,请稍后重试」【bug·待复现·疑似瞬时】 | ⏸️ | [D](docs/tasks/T484.md#t-306) |
| T-301 | 首页 4 个空 widget 规划:待办事项/热门选题热度/数据概… | ⏸️ | [D](docs/tasks/T484.md#t-301) |
| T-302 | 首页待办事项接生产者——派生 actionable 待办(待确认渲… | ⏸️ | [D](docs/tasks/T484.md#t-302) |
| T-261 | AI 关联飞轮(自动建网) | ⏸️ | [D](docs/tasks/T484.md#t-261) |
| T-249 | 统一真机验证清单(考古跨任务残留承接) | ⏸️ | [D](docs/tasks/T484.md#t-249) |
| T-250 | 工程健康批(T-145 残留收编,低优) | ⏸️ | [D](docs/tasks/T484.md#t-250) |
| T-255b | ~~agent 引擎 executor 集成~~ **已并入 T-… | ⏸️ | [D](docs/tasks/T484.md#t-255b) |
| T-185R | 访谈后替用户起草 custom skill(考古收敛自 T-185… | ⏸️ | [D](docs/tasks/T484.md#t-185r) |
| T-136R | 多账号残留两点(考古收敛自 T-136):①多号并存时定时 job… | ⏸️ | [D](docs/tasks/T484.md#t-136r) |
| T-100 | 单视频分析页(观众/来源/留存维度) | ⏸️ | [D](docs/tasks/T484.md#t-100) |
| T-087 | Skill 迭代循环机制(经验回流进化,防污染设计) | ⏸️ | [D](docs/tasks/T484.md#t-087) |
| T-045 | 激活码授权 + 本机单用户模式(完整方案) | ⏸️ | [D](docs/tasks/T484.md#t-045) |

## ✅ 已完成

> ✅ 已完成任务全文已归档到 [BACKLOG-archive.md](BACKLOG-archive.md)(减小本看板体积;单一执行真相仍是本文件)。
