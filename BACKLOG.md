# CreatorOS 任务看板(BACKLOG)

> **单一执行真相。每个会话必读(SessionStart hook 自动注入)。** 规则见 `CLAUDE.md` 的「任务流程铁律」。
> 状态:📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置 · ⛔ SPEC 审核 FAIL(没过审不准开工)。
> 读取顺序:**本看板 → 任务引用的 SPEC → 代码**。
> 铁律:需求即任务(提了就建);开工从看板顶取;做完改状态+提交;**禁止 P0/P1 分级、禁止多阶段执行**,任务清楚即起 Workflow/并行 subagent 一次做完。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

| ID | 任务 | 状态 | 审核 | 文档 | 一句话 |
|---|---|---|---|---|---|
| T-598 | 重新梳理并改造定时任务，使其完整承接内容雷达能力【产品+调度契约·用户 2026-07-29】 | ✅ | CONCERNS(已处理) | [统一调度 PLAN](docs/superpowers/specs/2026-07-24-content-radar-unified-automation-design.md) · [T-598 CONTRACT](docs/superpowers/specs/2026-07-29-content-radar-single-scheduler.contract.md) · [精简自动化底座](docs/superpowers/specs/2026-07-26-creatoros-automation-kernel-minimal.md) | 以当前内容雷达的来源类型、来源级启停/频率/采集账号、手动同步和运行历史为真实输入，审计自动化页、`scheduled_job/job_run`、持久任务与现存独立 timer 的错位；统一“来源在哪里配置、账号级任务在哪里开关、运行结果在哪里查看”，删除过时采集任务与重复调度，不新增第二套执行状态机。方案 A 与单一调度边界已由 DEC-AUTO-001 确认。 |
| T-591 | 审计已隐藏作品在列表、统计与下游消费中的过滤能力【数据口径·用户 2026-07-28】 | ✅ 免审 | — | [审计报告](docs/research/2026-07-28-hidden-work-filter-audit.md) | 逐层核对作品隐藏状态的真实字段与写入入口，以及作品列表、首页/账号统计、定位、复盘、AI 上下文、发布与其他聚合查询是否在服务端过滤；区分服务端过滤、仅 UI 隐藏和完全未过滤，给出代码/测试/本机数据证据与缺口清单，本轮先审计不擅自改业务口径。 |
| T-595 | 建立“仅公开作品入库”的全局单一数据边界【数据归属·用户确认·收口 T-592/593/594】 | ✅ | PASS[REV:caefac7913c6] | [SPEC](docs/superpowers/specs/2026-07-28-visible-only-ingestion-boundary.md) · [真实验收](docs/research/2026-07-28-visible-only-ingestion-validation.md) · [T-591 审计](docs/research/2026-07-28-hidden-work-filter-audit.md) | `self.metrics/self.detail` 统一先用源侧状态确认公开、再持久化；确认隐藏即清理平台派生数据，未知不新增也不误删，恢复公开可由全量源扫描重新采入；完成存量对账后列表、统计、搜索、定位与 AI 不再各自承担 hidden 过滤。 |
| T-594 | 让搜索只消费公开作品域【并入 T-595】 | ✅ 免审 | — | [T-595 SPEC](docs/superpowers/specs/2026-07-28-visible-only-ingestion-boundary.md) | 不再新增搜索侧 hidden 口径；由 T-595 在隐藏清理时移除派生索引，重建只消费归一化后的公开作品域。 |
| T-593 | 退役“显示已隐藏”入口与查询分支【并入 T-595】 | ✅ 免审 | — | [T-595 SPEC](docs/superpowers/specs/2026-07-28-visible-only-ingestion-boundary.md) | 产品域不再保留可浏览的隐藏作品；由 T-595 在存量对账后移除“显示已隐藏”及 `hidden=1` 分支。 |
| T-592 | 让统计直接消费公开作品域【并入 T-595】 | ✅ 免审 | — | [T-595 SPEC](docs/superpowers/specs/2026-07-28-visible-only-ingestion-boundary.md) | 不再新增统计侧 hidden 过滤；由 T-595 清理隐藏作品指标与归因，使账号汇总直接聚合归一化作品域。 |
| T-590 | 撤掉内容雷达专用模型配置并复用现有文本模型【配置收敛·用户 2026-07-28】 | ✅ 免审 | — | 无 SPEC（撤回 T-589 的额外配置面，不改模型/持久化契约） | 用户确认模型配置已经足够多；删除设置页“内容雷达拆解模型”卡、专用 capability 解析和连接测试，内容雷达统一复用既有 `topic.generate` / 默认文本模型，同时保留逐字稿拆解复用、重试收紧、耗时日志和慢任务回显优化。 |
| T-589 | 优化内容雷达逐字稿转选题延迟并摸清全局模型调用性能【性能·用户 2026-07-28】 | ✅ 免审 | — | [性能摸查](docs/research/2026-07-28-model-call-latency-audit.md)；复用既有 transform 快照，不新增持久化契约 | 基于真实日志量化各模型能力的耗时、输入规模、重试与兜底放大；内容雷达不得在 8 秒后停止自动回显，已生成的拆解证据要按逐字稿 hash 安全复用，首次生成要减少无效输出与不必要重试并复用既有选题模型；补安全耗时观测、终态/刷新/重复生成回归和前后端真实链验证，不能靠截断事实或伪造快速结果换速度。 |
| T-588 | 为内容雷达来源增加“移除”及二次确认【雷达体验优化·用户 2026-07-28】 | ✅ 免审 | — | 无 SPEC（复用既有 `intelligence.sources.delete` 契约） | 在来源行提供真实可用的“移除”入口，点击后必须弹系统级 Dialog 明确说明停止后续同步但保留已采集内容和快照；取消不得调用接口，确认后以 `archive` 模式归档来源、刷新列表并回显成功或失败，禁止原生 `window.confirm` 和假按钮。 |
| T-587 | 配置安全可复用的 163 SMTP 客服发信通道【反馈闭环·用户 2026-07-28】 | ✅ 免审 | — | 无 SPEC（本机运维工具，不进入产品代码） | 使用 `smtp.163.com:465` TLS；邮箱账号写本机私有配置，客户端授权码只存 macOS 钥匙串，不进入仓库或命令日志；提供预览优先、显式发送、附件与连接自检能力，完成后以测试邮件/服务端投递结果验收。 |
| T-586 | 定位内部用户 macOS CreatorOS 本地服务启动失败【线上启动阻断·飞书反馈 2026-07-28】 | ✅ 免审 | — | [飞书反馈记录](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | 6 份日志确认 0.1.0/0.2.0 sidecar 均在启动前因旧 macOS 缺 `__libcpp_verbose_abort` 被 dyld 以 SIGABRT 终止；发布链已提高最低系统要求并增加运行时兼容性出包门卫，避免旧 macOS 安装后才暴露不可启动。 |
| T-584 | 根治内容雷达热点宝采集失败并清理本地雷达错误【线上采集·用户 2026-07-28】 | ✅ 免审 | — | [飞书反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | 读取本机真实日志与热点宝采集链，修复登录、榜单入口、48 小时时间窗或响应解析中的真实根因；失败必须回显可行动错误，不能继续误报采集成功或无结果。 |
| T-585 | 停止稿面审核在无报告时每 8 秒重复制造异常日志【本地错误清理·用户 2026-07-28】 | ✅ 免审 | — | 无 SPEC（既有审核状态轮询纠错） | 真机日志确认 `scriptReviews.getLatest` 在尚无报告时持续返回 `ReportNotFoundError`，客户端仍固定每 8 秒重试并把正常空态刷成大量错误；改为有明确审核任务或窗口唤醒时再刷新，未审核继续诚实显示空态。 |
| T-583 | 把问题反馈日志附件改为选填并将用户渠道改成输入框【反馈表单·用户 2026-07-28】 | ✅ 免审 | — | [飞书反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | 公开表单的日志附件不再必填；用户渠道由下拉选择改成普通文本输入框，历史渠道值转成等价文字并保留，解决进度与解决方案仍只用于内部跟进。 |
| T-582 | 精简 CreatorOS 官方问题反馈表单并补齐解决进度/方案字段【反馈闭环·用户 2026-07-28】 | ✅ 免审 | — | [飞书反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | 表单只把问题描述、联系方式（邮箱优先）、日志附件设为必填，其余现有信息保留选填；新增“用户渠道”选填项，默认按“普通”处理，“内部用户”进入更高排查优先级；表格把处理状态收口为解决进度并新增解决方案，为后续邮件反馈进度与结论提供真实数据，不在本任务内擅自发送邮件。 |
| T-576 | 汇总并统一跟进飞书线上用户反馈，首查安装失败加密日志【线上故障·用户 2026-07-28】 | 🔨 免审 | — | [首轮汇总](docs/research/2026-07-28-production-feedback-triage.md) · [飞书反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | 飞书已按真实进度回写：安装与账号定位为“待处理”，雷达生成、重新定位和脚本双视图为“处理中”并写明待发版验证；继续统一跟进发布、真机复验与邮件反馈，不提前写成线上已解决。 |
| T-577 | 定位安装后无法启动且 bundle 缺 sidecar.tar.gz 的异常分发链【发布阻断·用户日志 2026-07-28】 | 📋 免审 | — | [飞书反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | 228B 加密日志已完整解出，唯一错误是 `bundle 资源缺 sidecar.tar.gz(打包不完整)`；用户 2026-07-28 明确要求本轮忽略，现暂停跟进且未声称修复，后续重启时再补系统、版本与下载来源并沿对应平台最终安装物查根因。 |
| T-578 | 修复账号定位把已隐藏旧作品纳入画像并压过最新可见作品【定位准确性·用户反馈 2026-07-28】 | ✅ 免审 | — | [飞书反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | 真机日志显示 34 条作品中 28 条已隐藏、仅 6 条可见；当前定位 `worksBrief` 不过滤隐藏项目且按 project `updatedAt/createdAt` 而非真实 `publishedAt` 排序，须让定位只吃当前账号可见真作品并补隐藏/发布时间顺序回归。 |
| T-579 | 根治内容雷达“生成选题候选”失败后永久显示生成中【线上 Bug·macOS 0.2.0·用户反馈 2026-07-28】 | ✅ 免审 | — | [飞书反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | 失败 runner 只把 persistent task 置 `failed/blocked`，没有把 terminal/error 回写 transform；详情页又仅凭 `outputSnapshot=null` 判断“仍在后台生成”，因此任何模型/协议失败都会永久假运行，须接真实终态与可重试错误回显。 |
| T-580 | 用定位中心“新建定位版本”满足重新定位【产品体验·用户确认 2026-07-28】 | ✅ 免审 | — | [飞书反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | 用户确认无需新增按钮：在定位中心点击“新建定位版本”，弹窗确认后清空当前定位并重新开始，即满足“重新定位”；验证既有链路后回写解决方案。 |
| T-581 | 在口播脚本区增加“纯文本稿 / 分镜脚本”一键切换【产品能力·用户确认 2026-07-28】 | ✅ 免审 | — | [飞书反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | 在截图所示口播脚本标题与现有编辑器控制附近增加两个小按钮，一键切换同一份脚本的纯文本连续稿与分镜结构视图；不复制两套真相，不把切换误做重新生成。 |
| T-574 | 内容雷达按分类与来源真实切换内容【产品体验·用户 2026-07-27】 | ✅ 免审 | — | 无 SPEC（接通既有分类、来源与作品观察关系） | 左栏分类/来源通过既有 `collectionId` / `sourceId` 查询真实切换内容；切回“全部内容”恢复全集，并覆盖加载、空结果、竞态和失败回退。 |
| T-573 | 根治热点宝新版默认落地页导致黑马同步误报响应结构变化【发布回归·用户真机 2026-07-27】 | ✅ 免审 | — | 无 SPEC（既有热点宝低粉爆款采集路由与响应选择纠错） | 已锁定新版低粉爆款详情路由、72 小时时间窗及 `sub_type=1002` 响应，并补默认落地页、并发榜单响应和合法空榜回归。 |
| T-572 | 根治黑马关键词同步页面结构漂移，并让内容雷达来源可筛选且移除无封面占位【发布阻断·用户真机 2026-07-27】 | ✅ 免审 | — | 无 SPEC（既有黑马采集与内容雷达信息密度修复） | 修复热点宝登录态和页面结构漂移，来源栏支持快速筛选，产品无封面数据时移除占位图片区块。 |
| T-571 | 根治选题收藏夹登录页已登录却无法被 CreatorOS 确认【发布阻断·用户真机 2026-07-27】 | ✅ 免审 | — | 无 SPEC（既有抖音收藏登录成功判定纠错） | 登录判定区分服务端明确拒绝、明确接受与探针不可判定，并用当前采集账号 profile 的真实页面身份证据安全兜底。 |
| T-570 | 根治内容雷达重登窗口提前关闭、黑马关键词入页自动同步与文案审核模型回退【发布阻断·用户真机 2026-07-27】 | ✅ 免审 | — | 无 SPEC（既有登录、同步触发与模型选择行为纠错） | 修复登录窗口关闭后继续访问已销毁页面、进入黑马页自动同步，以及审核模型未配置时不能回退普通模型的问题。 |
| T-575 | T-076-CREATOR：让已发布 CreatorOS 最小接通权益领取、签名渠道配置与产品问题反馈【跨系统上线闭环·用户 2026-07-27】 | 🔨 待办 | — | [SPEC](docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md) | 用户已授权先发布可回退测试版；补齐 Tauri claim ACL、构建期 Growth origin/能力开关与唯一 beta 版本，再完成 live HTTPS 三仓 E2E 和双平台 fault matrix；正式签名与公网更新清单仍保持关闭。 |
| T-569 | 修复 Windows 问题反馈无法打开日志文件夹【桌面体验·用户真机 2026-07-27】 | ✅ 免审 | — | 无 SPEC（既有 reveal-logs Windows 启动参数纠错） | 保留 Tauri 注入的真实 `CREATOROS_APP_DATA_DIR/logs` 绝对路径与目录存在性校验；Windows 启动 Explorer 不得再携带 `windowsHide:true` 把文件管理器按隐藏窗口创建，须显式可见并补含空格的真实 AppData 路径、spawn 成功及启动选项回归。 |
| T-568 | 修复问题反馈面板误报 MacIntel 与直接展示 UTC 机器时间【体验·诊断准确性·用户截图 2026-07-27】 | ✅ 免审 | — | 无 SPEC（既有反馈诊断字段纠错） | 禁止用兼容性字段 `navigator.platform` 推断芯片；桌面端须从 Tauri 原生层读取真实 OS 与机器架构，Apple Silicon 显示为“macOS · Apple 芯片”，失败时诚实显示暂不可用；反馈时间改为带 UTC 偏移的本机可读时间，不直接暴露 ISO UTC 字符串，并补原生架构映射与时间格式回归。 |
| T-567 | 根治新 Mac 包内容雷达小窗口详情栏下坠与同账号 Chromium 并发锁【发布阻断·用户真机 2026-07-27】 | ✅ 免审 | — | 无 SPEC（既有雷达响应式布局与浏览器 profile 并发修复） | 中等桌面窗口必须继续保持“来源/内容/详情”三栏，详情不得整块掉到内容列表下方；同一采集账号的持久 Chromium profile 必须覆盖 context 全生命周期串行，不能只串行 launch 后让收藏同步撞 `DOUYIN_FAVORITES_BROWSER_LOCKED`，并补真实断点结构与并发 context 回归。 |
| T-566 | 根治混淆后 Playwright 可序列化回调被误做 V8 字节码【发布阻断·重复回归·用户真机 2026-07-27】 | 🔨 免审 | — | 无 SPEC（既有桌面打包变换链防复发） | 混淆前识别所有依赖函数源码序列化的 Playwright/Puppeteer 风格调用并生成不可丢失的决策清单，字节码步骤只消费该清单而不得从已变形源码重新猜测；补“原始 chunk → 混淆 → 字节码选择”的真实回归、最终 sidecar 中 policy 标记需保留源码的采集 chunk 不存在 `.jsc` 的产物断言及收藏链冒烟，修复后提交推送。 |
| T-565 | 重选 CreatorOS Windows Runtime 交付架构，消灭首启解压并大幅减少小文件【产品+架构·用户真机否决 2026-07-27】 | 📋 Round1 FAIL·待原生RAT | — | [重写 SPEC](docs/superpowers/specs/2026-07-27-windows-runtime-delivery-burn-transaction.md) · [新评审](docs/superpowers/specs/2026-07-27-windows-runtime-delivery-burn-transaction.review.md) · [旧失败 SPEC](docs/superpowers/specs/2026-07-27-windows-runtime-delivery-redesign.md) · [三轮旧评审](docs/superpowers/specs/2026-07-27-windows-runtime-delivery-redesign.review.md) · [RAT 证据](docs/research/2026-07-27-windows-runtime-prune-rat-evidence.md) · [Windows 冗余审计](docs/research/2026-07-27-windows-runtime-unnecessary-content-audit.md) · [业界调研](docs/research/2026-07-27-windows-runtime-delivery-industry-options.md) | cross-family Round 1 认可方向但判 FAIL；launcher、legacy NSIS→Burn、journal、allowlist、负向检索和许可证 6 项已回写，剩余 blocker 是在进入 BUILD 前用原生 Windows 证明 Burn payload/cache/代理、中断、kill recovery 与 reparse containment；本机无 Windows 环境，未越权触发外部 runner。 |
| T-564 | 修复 CreatorOS 模型测试把 DeepSeek V4 思考流和鉴权错误误报为空响应【严重配置 Bug·用户 2026-07-27】 | ✅ 免审 | — | 无 SPEC（既有模型测试探针兼容与错误分类修复） | “测试连接”必须正确消费 DeepSeek V4 的 reasoning/text 流，不能因 8 token 上限把已连通误判为空；流内 401/协议错误必须进入真实失败分支而非 empty-stream，并补思考流、正文流、空流和流内异常回归，设置页继续只显示安全的人话错误。 |
| T-563 | 诊断 CreatorOS 模型配置测试持续报错【运行故障·用户日志 2026-07-27】 | ✅ 免审 | — | 无 SPEC（既有模型设置诊断） | 用户刚配置 DeepSeek 模型后测试持续失败；读取本机加密 sidecar 日志，核对真实请求的模型、协议、端点与服务端响应，先只定位根因和正确配置，不修改用户密钥、模型配置或产品代码。 |
| T-562 | 根治 CreatorOS 0.2.0 Windows 安装后持续白屏【发布阻断·用户真机 2026-07-27】 | 🔨 免审 | — | [首启 SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · [白屏复盘](docs/research/2026-07-24-windows-first-launch-white-screen.md) | 用户真机确认最新 Windows 0.2.0 包安装后仍持续白屏；必须抓真实启动链证据，修复 sidecar/WebView 导航根因，并把 Windows 打包 Gate 从“文件存在”升级为“安装后真启动、health ready、主页面非白屏可交互”，新包经真机确认前不得宣称 Windows 可用。 |
| T-561 | 扩充并重构 CreatorOS 商务介绍 PPT【商务物料·用户 2026-07-27】 | ✅ 免审 | — | [现有商务介绍](docs/marketing/CreatorOS-商务介绍.pptx) · [使用手册](docs/CreatorOS-新用户0到1标杆路线.md) · [产品定位](docs/产品定位.md) | 针对现有 9 页商务介绍内容过少、过于简单的问题，扩充为信息充分但仍易懂的完整产品叙事，补足用户问题、产品定位、内容经营闭环、主要使用场景、真实产品截图、AI 与人的分工、数据与本地边界、适用对象与产品边界；继续只介绍产品，不出现内测、名额、截止时间、激活码或招募信息。 |
| T-560 | 制作 CreatorOS v0.2.0 一图流更新清单【分发物料·用户 2026-07-27】 | ✅ 免审 | — | [更新说明](docs/CreatorOS-2026-07-20以来更新说明.md) · [产品定位](docs/产品定位.md) | 生成一张适合飞书群与微信群直接转发的竖版更新长图，提炼已经落地、用户可感知的 v0.2.0 变化，突出双端稳定、内容雷达、AI 助手、脚本与项目、知识库、长任务和完整教程，不包含内测、名额、截止时间、激活码或招募信息。 |
| T-559 | 根治内容雷达列表卡片被截断、详情区错位并出现超大空白【严重显示 Bug·用户截图 2026-07-27】 | 📋 免审 | — | 无 SPEC（既有内容雷达页面布局回归） | 用户截图实证：55 条真实内容的双列卡片区在首屏中途被截断，列表与选中内容详情之间出现大块空白，详情被推到远下方；后续须基于真实数据复现，核对列表滚动容器、网格高度或虚拟化与详情展开布局，修复后完成多分辨率、滚动及切换选中项回归，未定位前不预设根因。 |
| T-558 | 制作 CreatorOS 商务介绍 PPT【商务物料·用户 2026-07-27】 | ✅ 免审 | — | [使用手册](docs/CreatorOS-新用户0到1标杆路线.md) · [产品定位](docs/产品定位.md) | 面向潜在用户与商务合作对象制作易懂、可转发的纯产品演示稿，聚焦内容经营痛点、CreatorOS 价值闭环、少量代表性能力、适用人群与产品边界，不展示全功能，也不出现内测、名额、截止时间、激活码或招募信息。 |
| T-557 | 修复 0.2.0 双端发布流水线漏传产品级 license projectKey【CI 发布阻断·用户 2026-07-27】 | ✅ 免审 | — | [失败流水线](https://github.com/zzyong24/Thirdspace-creator/actions/runs/30244515110) · [发布手册](docs/RELEASING.md) | macOS 已在 `release.mjs` 的 fail-fast 门卫因缺少 `CREATOROS_LICENSE_PROJECT_KEY` 失败，Windows 到同一步也会失败；双端共用打包步骤必须显式注入既定产品级 key `test`，补回归验证后提交推送并重跑。 |
| T-556 | 把 CreatorOS 桌面安装包版本统一升级为 0.2.0 并发布当前全部代码【双端打包·用户 2026-07-26】 | ✅ 免审 | — | [发布手册](docs/RELEASING.md) | 官网公告已是 0.2.0；同步 frontend package、Tauri 配置、Rust crate 与 lockfile 的应用版本，确保 `getVersion()`、macOS DMG 和 Windows setup.exe 都显示 0.2.0；提交并推送当前工作区全部改动后触发双端流水线。 |
| T-555 | 更新 CreatorOS 飞书下载与使用页为 0.2.0 最后一轮公开内测口径【飞书文档·用户 2026-07-26】 | ✅ 免审 | — | [飞书 Wiki](https://my.feishu.cn/wiki/SJyPwU8ghi5ksRkHJRRcqm3mn3g) | 只更新页面文案为 CreatorOS 0.2.0、macOS/Windows 双端完整验收、最后一轮公开内测、1000 人上限、2026-08-10 截止和共用激活码；保留现有两个 0.1.0 安装包附件，待用户跑完流水线后自行替换。 |
| T-554 | 把 CreatorOS 完整使用教程导出为带“月明水清深”水印的可分发 PDF【教程交付·用户 2026-07-26】 | ✅ 免审 | — | [完整手册](docs/CreatorOS-新用户0到1标杆路线.md) | 生成排版清晰、中文与图片完整的 PDF，每页加入低对比度“月明水清深”背景水印，不遮挡正文和产品截图；完成页数、文本、图片与逐页渲染检查后交付。 |
| T-553 | 同步 CreatorOS 第二轮（最后一轮）内测发布信息【官网+用户文档·用户 2026-07-26】 | ✅ 免审 | — | [更新说明](docs/CreatorOS-2026-07-20以来更新说明.md) · [完整手册](docs/CreatorOS-新用户0到1标杆路线.md) | 这是不改变产品方向、架构、数据归属或契约的 trivial edit：两份用户文档与官网统一公开共用激活码、1000 人上限和 2026-08-10 截止口径，并明确最终轮内测参与方式。 |
| T-552 | 收口 CreatorOS 完整使用手册剩余截图缺口，删除空占位并减少非必要配图【教程交付·用户 2026-07-26】 | ✅ 待办 | — | [完整手册](docs/CreatorOS-新用户0到1标杆路线.md) | 保留已有真实截图和信息图；把尚未补拍且依赖瞬时、异常或操作后状态的截图位改为文字说明或既有组合图引用，删除“暂无、截图内容、建议标注”等未完成痕迹，并把 83 张拍摄清单改成精简维护原则。 |
| T-551 | 编写 CreatorOS 7 月 20 日以来的用户版更新说明【变更文档·用户 2026-07-26】 | ✅ 待办 | — | [用户版更新说明](docs/CreatorOS-2026-07-20以来更新说明.md) | 基于 2026-07-20 至今的实际提交与完成任务，整理一份只讲用户可感知变化、使用价值和入口的简体中文更新说明；屏蔽代码、架构、数据库、测试与发布流水线等所有技术细节。 |
| T-550 | 代用户补齐 CreatorOS 完整使用手册中的关键实机产品截图【教程实机配图·用户 2026-07-26】 | ✅ 待办 | — | [完整手册](docs/CreatorOS-新用户0到1标杆路线.md) | 用户不再逐张补图；盘点 55 个剩余截图位，直接操作当前 CreatorOS 桌面端，以真实账号与真实产品状态补齐能稳定复现的关键界面，并用裁切后的实机局部图减少重复全屏截图；不为无法复现的状态伪造画面。 |
| T-549 | 为 CreatorOS 完整使用手册补充关键用户逻辑信息图【教程可视化·用户 2026-07-26】 | ✅ 2026-07-26 | — | [完整手册](docs/CreatorOS-新用户0到1标杆路线.md) | 完成：生成并嵌入 5 张统一风格中文信息图，覆盖内容飞轮、首次上手、账号隔离、项目三工作面和 AI 确认边界；手册 33/33 图片链接存在，reconcile 全绿（commit `72a5d285`）。 |
| T-548 | 根治视频渲染重试后成片脱离项目且制作页实时预览消失【发布阻断·用户 2026-07-26】 | 🔨 待办 | — | [既有 T-292/T-254 规格](docs/superpowers/specs/2026-07-13-video-production-overhaul-design.md) | `video.render` 卡内重试必须把新 taskId 回传制作页；采纳的真实视频资产须幂等关联当前 project/output、完成 export 并可由签名 blob URL 内联播放，素材中心使用记录同步显示项目，失败不得伪造预览；截图类 B-roll 必须按真实 MIME 渲染为图片画面，禁止只显示黑色占位框却把任务记为成功。 |
| T-547 | 根治知识库导入无反馈、正文空白、排序错误，并核清内置知识内容未落地原因【发布阻断·用户 2026-07-26】 | 🔨 待办 | — | 无 SPEC（既有知识录入/读取链 bug；内置内容仍受 T-524 权利门约束） | 导入必须逐文件回显真实成功/失败且不能把空正文冒充成功；知识列表按写入时间倒序；核清个人路径与“老师视角”内容为何未落地，禁止越过 T-524 内容分发权门。 |
| T-546 | 根治收藏夹/黑马同步、渠道链接、随包渲染与嵌套 Skill 回归，并隐藏文件工作区 UI【发布阻断·用户 2026-07-26】 | 🔨 待办 | — | [T-534 SPEC](docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md) | 修复旧收藏账号、恢复“指定收藏夹名称/远端列表选择”、过期租约/恢复监听、博主主页大响应未等待即误判 0 条、网页/RSS 读取错误与 EdgeOne 567 公开 feed 降级、B-roll MIME 及嵌套 Skill；内容雷达窄栏来源项改为紧凑两层结构，名称/状态/操作不得逐字换行，暂停、记录、同步仍须真实可用；雷达命中登录墙/OAuth 必须落 `LOGIN_REQUIRED`，原地弹窗复用该采集账号既有 `ingestion.douyin.login`/独立 authDir 扫码链，成功后自动重试来源，不另造 Cookie；博主来源保存后须可在来源行暂停/恢复每日自动同步，暂停不影响手动同步；Bug 反馈临时降级到官方飞书表，禁用自动发送并引导手动上传日志 zip；商业入口仍只读签名 runtime。 |
| T-545 | 把本地发布验收包固化为统一 CreatorOS `test` 产品包，避免 Finder 启动因 projectKey 缺失阻断【桌面打包·授权启动·用户 2026-07-26】 | ✅ 待办 | — | [T-534 SPEC](docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md) | 只固化产品级 `projectKey=test`，不按渠道打包；激活码仍由 AM 解析 `channelRef` 并下发 Growth 签名 runtime config。构建缺产品 key 必须 fail-fast，Finder 启动不得依赖终端环境变量；完成后重打、安装并真机验证。 |
| T-544 | 根治 macOS 本地安装包在 WKWebView 永久骨架闪屏与高 CPU【发布阻断·真机·用户 2026-07-26】 | ✅ 待办 | — | 无 SPEC（既有桌面打包链兼容性 bug） | 真机已复现：sidecar/verdict/哨兵/HTTP 200 全正常，RSC 已含真实首页；Chromium 可完成 hydration，但 WKWebView 的 JavaScriptCore 被 `chunks/**` 的 RC4 stringArray 混淆拖入持续高负载，页面永久停在脉冲骨架态。修复须保留安全机制，改成 WebKit 可运行的客户端产物策略，并补 WKWebView 真机回归。 |
| T-543 | 在本机生成当前 CreatorOS macOS 安装包供发版前人工验收【桌面打包·用户 2026-07-26】 | ✅ 待办 | — | [发布手册](docs/RELEASING.md) | 复用正式 `desktop:package` 链生成本机架构 `.app/.dmg`，必须通过 verdict key、sidecar、TLS 与最终包自检；只本地出包，不上传、不部署。 |
| T-542 | 纠正 Windows 已完整验收口径并继续补 CreatorOS 桌面端真实截图【事实纠偏+教程配图·用户 2026-07-26】 | ✅ 2026-07-26 | — | [完整手册](docs/CreatorOS-新用户0到1标杆路线.md) | 完成：新增 16 张当前桌面端真实数据截图，手册达到 21/21 图片链接存在；教程、产品定位、桌面 README、规格索引与 DEC 已统一为 macOS/Windows 双端完整验收（commit `142329e0`）。 |
| T-541 | 为 CreatorOS 完整使用手册补产品总览图与真实界面截图【教程配图·用户 2026-07-26】 | ✅ 2026-07-26 | — | [完整手册](docs/CreatorOS-新用户0到1标杆路线.md) | 完成：补入 1 张产品全景图与 7 张真实界面截图，覆盖上手、账号保护、模型、自动化、AI 助手和反馈；8/8 图片存在、链接无缺失、reconcile 全绿（commit `66f1eae2`）。 |
| T-540 | 把新用户 0→1 标杆路线重写为完整产品使用手册【用户教程·用户 2026-07-26】 | ✅ 2026-07-26 | — | [完整手册](docs/CreatorOS-新用户0到1标杆路线.md) · [功能盘点](docs/research/2026-07-26-user-journey-feature-inventory-research.md) | 完成：2396 行覆盖完整用户逻辑、14 个功能域、32 个实操步骤、状态/异常/边界与 83 个连续配图位；18/18 事实检查、坏链、diff-check、reconcile 全绿（commit `d17f14fe`）。 |
| T-539 | “先去审核”同屏点击无感：跳转审核卡时增加短暂高亮与焦点反馈【体验·用户 2026-07-26】 | ✅ 待办 | — | 无 SPEC（既有 T-393 审核导航交互补强） | 保留平滑滚动；无论目标是否已在同屏，都让审核卡短暂高亮并聚焦，兼容重复点击与减少动态效果设置，避免按钮看似无反应。 |
| T-538 | 接通渠道绑定的产品问题反馈：从 AM 签名授权中取得不可伪造反馈上下文，用户明确确认后把已预览文字提交到 Growth，并回显真实反馈编号【跨仓契约·上线闭环·用户 2026-07-26】 | 🔨 待办 | — | [Growth canonical 增量契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/channel-bound-product-feedback-v1.md) | 必须绑定当前激活授权的 `(projectKey,channelRef)`，不得让用户编辑渠道或优先级；不上传日志、截图、文件、激活码或用户内容；失败保留本地文字并可重试 |
| T-537 | 内容雷达登录型数据源支持显式选择采集账号，并保持 owner/collector 双身份隔离【产品+架构·用户 2026-07-26】 | ✅ 规格内部 PASS·待真实双账号 RAT | — | [PLAN](docs/superpowers/specs/2026-07-26-content-radar-collector-account.md) · [CONTRACT](docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md) · [评审](docs/superpowers/specs/2026-07-26-content-radar-collector-account.review.md) | 用户明确范围只限内容雷达的主页、收藏夹、黑马来源；当前工作区仍决定数据归属，所选已绑定账号只决定登录态与读取身份。经营数据、评论和其他自动化任务不增加采集账号选择。三轮评审已内部收口，第二个有效抖音登录态完成 `RAT-537-01` 前不得 BUILD。 |
| T-536 | 根治“我的收藏”同步错误分类与浏览器档案锁恢复【bug·多账号采集·用户 2026-07-26】 | 🔨 待真实账号只读验收 | — | 无 SPEC（既有收藏读取链故障） | 代码已提交 `85312bd2`：跨 chunk 错误按稳定 code 恢复、无活 context 才精准清锁且只重试一次、诊断脱敏、UI 给恢复动作；定向 130 tests、typecheck、build、boundary 通过，待有效登录态做真实收藏只读验收。 |
| T-535 | CreatorOS App 启动后白屏，结合现场日志根治壳→sidecar→页面启动链【bug·桌面启动·用户 2026-07-26】 | ✅ 待办 | — | 无 SPEC（既有桌面启动主链 bug） | 已定位：本地 package 在 verdict 签名私钥/验签公钥缺失时仍产包，壳无法注入 token，sidecar `Ready` 后被 instrumentation 拒绝并退出；需补双 key/match fail-fast、最终安装包启动冒烟与可见失败页，以真实 App 非白屏验收。 |
| T-528 | 产出新用户视角 0→1 全功能标杆使用路线文档【调研+文档·用户 2026-07-26】 | ✅ 2026-07-26 | — | [标杆路线](docs/CreatorOS-新用户0到1标杆路线.md) · [调研归档](docs/research/2026-07-26-user-journey-feature-inventory-research.md) | 完成：8 章代码事实盘点整合为小白可执行的 0→1 教程和 14 功能域调研归档；明确自动发布、promotion 原子性、真机验证和经验回流边界（commit `8ae447fc`）。 |
| T-529 | 整理全仓文档体系：消除双真值、补齐索引覆盖、收拢散落文件【文档治理·用户 2026-07-26】 | ✅ 2026-07-26 | — | [详情见本行] | 完成:①双份 BACKLOG-archive 合一(docs 版 253 早期行并入 repo 根单份·已删 docs 版·改 2 处入链);②specs INDEX 从 46→**104 份 design spec 全覆盖**(4 并行 subagent 盘点,含 3 个 ⛔FAIL/纠偏收窄链如实标注);③docs/INDEX 补 6 文件+8 子目录盲区;④根目录仅重复 archive 一处散件,已随①归位。活动中文档(T-528 产出)未动。 |
| T-524 | 把自媒体方法知识做成 CreatorOS 随包内置知识库【产品+内容+发布·用户纠偏 2026-07-26】 | ⏸️ 待内容权利确认 | — | [详情](docs/tasks/T484.md#t-524) | 已与 T-519 用户知识底座解耦；Windows 桌面版已完整验收，当前仅因第三方内容的商业改编/随包分发权尚未确认而禁止改写、打包与 BUILD，不再阻塞 T-519。 |
| T-519 | 重构知识库文件工作区与用户知识底座【产品+架构·用户 2026-07-25/26】 | ⏸️ 搁置 | — | [Replacement PLAN](docs/superpowers/specs/2026-07-26-knowledge-workspace-lean.md) · [CONTRACT](docs/superpowers/specs/2026-07-26-knowledge-workspace-lean.contract.md) · [评审](docs/superpowers/specs/2026-07-26-knowledge-workspace-lean.contract.review.md) · [详情](docs/tasks/T484.md#t-519) | 用户确认完整 B 范围并行推进；T-519 与 T-524 解耦，只做用户知识工作区、Assets 安全上传、逻辑文件夹和既有图/地图/检索复用，不代表授权随包分发第三方方法内容。Round 3 仍有 0 blocker/3 major/1 minor，正式 Gate 失败，BUILD 禁止。 |
| T-525 | 验证并设计知识库旧 `.doc` 与扫描 PDF OCR 可选解析能力【兼容+安全+打包·用户确认 2026-07-25】 | ⏸️ Gate 未满足 | — | [详情](docs/tasks/T484.md#t-525) | 单样本方案 RAT 已完成；macOS/Windows 双平台发布物已验收，至少 20 份 `.doc`、完整 OCR 语料与独立评审仍未满足，生产继续 `unsupported/no_text`。 |
| T-533 | 日志改分天滚动+30 天启动清理(反馈场景配套)【桌面日志·用户 2026-07-26】 | ✅ 2026-07-26 | — | [实现](frontend/src-tauri/src/logging.rs) | 已落地 UTC 分天/会话命名、旧 current/prev 无覆盖迁移、删除 >30 天与超出 64 份的最旧文件、单会话 10 MiB 完整密文帧封顶；加密信封/全降级/脱敏链路未改，Rust lib 122/122、logdec CLI 3/3。 |
| T-534 | 根治 Growth / Activation Manager / CreatorOS 三系统边界并拆分产品反馈与商业售后入口【跨仓契约·用户 2026-07-26】 | ✅ CONCERNS(已处理)·contract gates PASS | — | [SPEC](docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md) · [评审](docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.review.md) · [契约门](orchestrator/GATE-T534-CONTRACT.md) · [BUILD 证据](orchestrator/GATE-T534-BUILD.md) | Creator consumer 实现、测试、运行态与治理门完成；T-396/T-518 单 supportUrl 已失效，T-531/T-532 冲突范围继续冻结；发布 build 保留 T-535 范围外阻断。 |
| T-518 | 新增侧边栏问题反馈直达入口【产品+体验·用户 2026-07-25/26】 | ✅ 2026-07-26 | — | [纠偏 PLAN](docs/superpowers/specs/2026-07-26-bug-feedback-inbox.md) · [CONTRACT](docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md) · [详情](docs/tasks/T484.md#t-518) | 已落地：本地脱敏、预览和复制反馈，打开签名 `supportUrl` 与加密日志目录；无上传、无反馈写 API、无假“已发送”（`705c7156`）。 |
| T-517 | 收敛 CreatorOS 生产预设自动化底座【系统底座·用户 2026-07-24/26】 | ⏸️ 搁置 | — | [纠偏 PLAN](docs/superpowers/specs/2026-07-26-creatoros-automation-kernel-minimal.md) · [最终审计](docs/superpowers/specs/2026-07-26-overdesign-scope-reset.review.md) · [详情](docs/tasks/T484.md#t-517) | scheduled_job/job_run 管调度展示，PersistentTaskService 提供 durable task；补 sealed kind、typed handler 与单一 driver，不再造执行状态机。 |
| T-487 | 合并 T-454 等桌面打包欠债：借鉴 skills-manager/Tauri 官方实践，统一跨… | ✅ 2026-07-26 | — | [详情](docs/tasks/T484.md#t-487) | 完成：Windows 安装期原子物化、首启直读、exact Runtime cache 与最终只压一次 tar 已实现；用户 2026-07-26 明确确认 Windows 版本已完整验收，旧“待 setup.exe 冒烟”口径关闭，不补造历史命令或测试日志。 |

## ⏸️ 暂停池（不自动派发）

> 只保留任务索引；暂停原因与恢复条件见 `orchestrator/events.ndjson` 和详情文档。恢复必须使用 `taskctl start`。

| ID | 任务 | 状态 | 文档 |
|---|---|---|---|
| T-516 | 设置内“AI 对我的理解”与账号健康检查【产品+架构·用户 2026-07-25/26】 | ⏸️ | [纠偏 PLAN](docs/superpowers/specs/2026-07-26-copilot-context-health-minimal.md) · [最终审计](docs/superpowers/specs/2026-07-26-overdesign-scope-reset.review.md) | 自动扫描只做可证明的确定性问题；保留 AI 起草、用户确认/调整后经现有定位链保存，依赖 T-517 新 CONTRACT。 |
| T-510 | 优化 Copilot 媒体工具编排【产品设计·用户 2026-07… | ⏸️ | [Replacement PLAN](docs/superpowers/specs/2026-07-25-copilot-media-orchestration-replacement.md) · [CONTRACT](docs/superpowers/specs/2026-07-25-copilot-media-orchestration-replacement.contract.md) · [独立评审](docs/superpowers/specs/2026-07-25-copilot-media-orchestration-replacement.contract.review.md) · [跨端口 RAT](docs/research/2026-07-25-t510-cross-port-rat.md) |
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
