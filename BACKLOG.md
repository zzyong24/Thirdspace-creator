# CreatorOS 任务看板(BACKLOG)

> **单一执行真相。每个会话必读(SessionStart hook 自动注入)。** 规则见 `CLAUDE.md` 的「任务流程铁律」。
> 状态:📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置 · ⛔ SPEC 审核 FAIL(没过审不准开工)。
> 读取顺序:**本看板 → 任务引用的 SPEC → 代码**。
> 铁律:需求即任务(提了就建);开工从看板顶取;做完改状态+提交;**禁止 P0/P1 分级、禁止多阶段执行**,任务清楚即起 Workflow/并行 subagent 一次做完。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

| ID | 任务 | 状态 | 文档 | 一句话 |
|---|---|---|---|---|
| T-571 | 根治选题收藏夹登录页已登录却无法被 CreatorOS 确认【发布阻断·用户真机 2026-07-27】 | 🔨 免审 | 无 SPEC（既有抖音收藏登录成功判定纠错） | 普通抖音页面已经显示账号登录后，CreatorOS 不得因收藏接口探针遇到未知/风控响应而一直等待并误报“未检测到登录成功”；登录判定须区分服务端明确拒绝、明确接受与探针不可判定，以同一采集账号 profile 的真实页面身份证据安全兜底，并补已登录页面、过期 Cookie、未知探针和收藏读取回归。 |
| T-570 | 根治内容雷达重登窗口提前关闭、黑马关键词入页自动同步与文案审核模型回退【发布阻断·用户真机 2026-07-27】 | ✅ 免审 | 无 SPEC（既有登录、同步触发与模型选择行为纠错） | 收藏/雷达登录必须进入普通抖音登录页而非创作者中心，登录窗口关闭后不得继续对已销毁 page 执行等待；黑马关键词页只有用户显式操作或既定调度才能同步，进入页面不得自动进入“同步中”；文案审核优先使用审核模型，未配置时必须回退普通模型，并为三条真实路径补回归。 |
| T-562 | 根治 CreatorOS 0.2.0 Windows 安装后持续白屏【发布阻断·用户真机 2026-07-27】 | 🔨 免审 | [首启 SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · [白屏复盘](docs/research/2026-07-24-windows-first-launch-white-screen.md) | 用户真机确认最新 Windows 0.2.0 包安装后仍持续白屏；必须抓真实启动链证据，修复 sidecar/WebView 导航根因，并把 Windows 打包 Gate 从“文件存在”升级为“安装后真启动、health ready、主页面非白屏可交互”，新包经真机确认前不得宣称 Windows 可用。 |
| T-558 | 制作 CreatorOS 0.2.0 商务介绍 PPT【商务物料·用户 2026-07-27】 | 🔨 免审 | [使用手册](docs/CreatorOS-新用户0到1标杆路线.md) · [更新说明](docs/CreatorOS-2026-07-20以来更新说明.md) | 面向潜在内测用户与商务合作对象制作易懂、可转发的简洁演示稿，聚焦内容经营痛点、CreatorOS 价值闭环、少量代表性能力、适用人群及最后一轮公开内测行动信息，不做全功能说明书。 |
| T-557 | 修复 0.2.0 双端发布流水线漏传产品级 license projectKey【CI 发布阻断·用户 2026-07-27】 | ✅ 免审 | [失败流水线](https://github.com/zzyong24/Thirdspace-creator/actions/runs/30244515110) · [发布手册](docs/RELEASING.md) | macOS 已在 `release.mjs` 的 fail-fast 门卫因缺少 `CREATOROS_LICENSE_PROJECT_KEY` 失败，Windows 到同一步也会失败；双端共用打包步骤必须显式注入既定产品级 key `test`，补回归验证后提交推送并重跑。 |
| T-556 | 把 CreatorOS 桌面安装包版本统一升级为 0.2.0 并发布当前全部代码【双端打包·用户 2026-07-26】 | ✅ 免审 | [发布手册](docs/RELEASING.md) | 官网公告已是 0.2.0；同步 frontend package、Tauri 配置、Rust crate 与 lockfile 的应用版本，确保 `getVersion()`、macOS DMG 和 Windows setup.exe 都显示 0.2.0；提交并推送当前工作区全部改动后触发双端流水线。 |
| T-555 | 更新 CreatorOS 飞书下载与使用页为 0.2.0 最后一轮公开内测口径【飞书文档·用户 2026-07-26】 | ✅ 免审 | [飞书 Wiki](https://my.feishu.cn/wiki/SJyPwU8ghi5ksRkHJRRcqm3mn3g) | 只更新页面文案为 CreatorOS 0.2.0、macOS/Windows 双端完整验收、最后一轮公开内测、1000 人上限、2026-08-10 截止和共用激活码；保留现有两个 0.1.0 安装包附件，待用户跑完流水线后自行替换。 |
| T-554 | 把 CreatorOS 完整使用教程导出为带“月明水清深”水印的可分发 PDF【教程交付·用户 2026-07-26】 | ✅ 免审 | [完整手册](docs/CreatorOS-新用户0到1标杆路线.md) | 生成排版清晰、中文与图片完整的 PDF，每页加入低对比度“月明水清深”背景水印，不遮挡正文和产品截图；完成页数、文本、图片与逐页渲染检查后交付。 |
| T-553 | 同步 CreatorOS 第二轮（最后一轮）内测发布信息【官网+用户文档·用户 2026-07-26】 | ✅ 免审 | [更新说明](docs/CreatorOS-2026-07-20以来更新说明.md) · [完整手册](docs/CreatorOS-新用户0到1标杆路线.md) | 这是不改变产品方向、架构、数据归属或契约的 trivial edit：两份用户文档与官网统一公开共用激活码、1000 人上限和 2026-08-10 截止口径，并明确最终轮内测参与方式。 |
| T-552 | 收口 CreatorOS 完整使用手册剩余截图缺口，删除空占位并减少非必要配图【教程交付·用户 2026-07-26】 | ✅ 待办 | [完整手册](docs/CreatorOS-新用户0到1标杆路线.md) | 保留已有真实截图和信息图；把尚未补拍且依赖瞬时、异常或操作后状态的截图位改为文字说明或既有组合图引用，删除“暂无、截图内容、建议标注”等未完成痕迹，并把 83 张拍摄清单改成精简维护原则。 |
| T-551 | 编写 CreatorOS 7 月 20 日以来的用户版更新说明【变更文档·用户 2026-07-26】 | ✅ 待办 | [用户版更新说明](docs/CreatorOS-2026-07-20以来更新说明.md) | 基于 2026-07-20 至今的实际提交与完成任务，整理一份只讲用户可感知变化、使用价值和入口的简体中文更新说明；屏蔽代码、架构、数据库、测试与发布流水线等所有技术细节。 |
| T-550 | 代用户补齐 CreatorOS 完整使用手册中的关键实机产品截图【教程实机配图·用户 2026-07-26】 | ✅ 待办 | [完整手册](docs/CreatorOS-新用户0到1标杆路线.md) | 用户不再逐张补图；盘点 55 个剩余截图位，直接操作当前 CreatorOS 桌面端，以真实账号与真实产品状态补齐能稳定复现的关键界面，并用裁切后的实机局部图减少重复全屏截图；不为无法复现的状态伪造画面。 |
| T-549 | 为 CreatorOS 完整使用手册补充关键用户逻辑信息图【教程可视化·用户 2026-07-26】 | ✅ 2026-07-26 | [完整手册](docs/CreatorOS-新用户0到1标杆路线.md) | 完成：生成并嵌入 5 张统一风格中文信息图，覆盖内容飞轮、首次上手、账号隔离、项目三工作面和 AI 确认边界；手册 33/33 图片链接存在，reconcile 全绿（commit `72a5d285`）。 |
| T-548 | 根治视频渲染重试后成片脱离项目且制作页实时预览消失【发布阻断·用户 2026-07-26】 | 🔨 待办 | [既有 T-292/T-254 规格](docs/superpowers/specs/2026-07-13-video-production-overhaul-design.md) | `video.render` 卡内重试必须把新 taskId 回传制作页；采纳的真实视频资产须幂等关联当前 project/output、完成 export 并可由签名 blob URL 内联播放，素材中心使用记录同步显示项目，失败不得伪造预览；截图类 B-roll 必须按真实 MIME 渲染为图片画面，禁止只显示黑色占位框却把任务记为成功。 |
| T-547 | 根治知识库导入无反馈、正文空白、排序错误，并核清内置知识内容未落地原因【发布阻断·用户 2026-07-26】 | 🔨 待办 | 无 SPEC（既有知识录入/读取链 bug；内置内容仍受 T-524 权利门约束） | 导入必须逐文件回显真实成功/失败且不能把空正文冒充成功；知识列表按写入时间倒序；核清个人路径与“老师视角”内容为何未落地，禁止越过 T-524 内容分发权门。 |
| T-546 | 根治收藏夹/黑马同步、渠道链接、随包渲染与嵌套 Skill 回归，并隐藏文件工作区 UI【发布阻断·用户 2026-07-26】 | 🔨 待办 | [T-534 SPEC](docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md) | 修复旧收藏账号、恢复“指定收藏夹名称/远端列表选择”、过期租约/恢复监听、博主主页大响应未等待即误判 0 条、网页/RSS 读取错误与 EdgeOne 567 公开 feed 降级、B-roll MIME 及嵌套 Skill；内容雷达窄栏来源项改为紧凑两层结构，名称/状态/操作不得逐字换行，暂停、记录、同步仍须真实可用；雷达命中登录墙/OAuth 必须落 `LOGIN_REQUIRED`，原地弹窗复用该采集账号既有 `ingestion.douyin.login`/独立 authDir 扫码链，成功后自动重试来源，不另造 Cookie；博主来源保存后须可在来源行暂停/恢复每日自动同步，暂停不影响手动同步；Bug 反馈临时降级到官方飞书表，禁用自动发送并引导手动上传日志 zip；商业入口仍只读签名 runtime。 |
| T-545 | 把本地发布验收包固化为统一 CreatorOS `test` 产品包，避免 Finder 启动因 projectKey 缺失阻断【桌面打包·授权启动·用户 2026-07-26】 | ✅ 待办 | [T-534 SPEC](docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md) | 只固化产品级 `projectKey=test`，不按渠道打包；激活码仍由 AM 解析 `channelRef` 并下发 Growth 签名 runtime config。构建缺产品 key 必须 fail-fast，Finder 启动不得依赖终端环境变量；完成后重打、安装并真机验证。 |
| T-544 | 根治 macOS 本地安装包在 WKWebView 永久骨架闪屏与高 CPU【发布阻断·真机·用户 2026-07-26】 | ✅ 待办 | 无 SPEC（既有桌面打包链兼容性 bug） | 真机已复现：sidecar/verdict/哨兵/HTTP 200 全正常，RSC 已含真实首页；Chromium 可完成 hydration，但 WKWebView 的 JavaScriptCore 被 `chunks/**` 的 RC4 stringArray 混淆拖入持续高负载，页面永久停在脉冲骨架态。修复须保留安全机制，改成 WebKit 可运行的客户端产物策略，并补 WKWebView 真机回归。 |
| T-543 | 在本机生成当前 CreatorOS macOS 安装包供发版前人工验收【桌面打包·用户 2026-07-26】 | ✅ 待办 | [发布手册](docs/RELEASING.md) | 复用正式 `desktop:package` 链生成本机架构 `.app/.dmg`，必须通过 verdict key、sidecar、TLS 与最终包自检；只本地出包，不上传、不部署。 |
| T-542 | 纠正 Windows 已完整验收口径并继续补 CreatorOS 桌面端真实截图【事实纠偏+教程配图·用户 2026-07-26】 | ✅ 2026-07-26 | [完整手册](docs/CreatorOS-新用户0到1标杆路线.md) | 完成：新增 16 张当前桌面端真实数据截图，手册达到 21/21 图片链接存在；教程、产品定位、桌面 README、规格索引与 DEC 已统一为 macOS/Windows 双端完整验收（commit `142329e0`）。 |
| T-541 | 为 CreatorOS 完整使用手册补产品总览图与真实界面截图【教程配图·用户 2026-07-26】 | ✅ 2026-07-26 | [完整手册](docs/CreatorOS-新用户0到1标杆路线.md) | 完成：补入 1 张产品全景图与 7 张真实界面截图，覆盖上手、账号保护、模型、自动化、AI 助手和反馈；8/8 图片存在、链接无缺失、reconcile 全绿（commit `66f1eae2`）。 |
| T-540 | 把新用户 0→1 标杆路线重写为完整产品使用手册【用户教程·用户 2026-07-26】 | ✅ 2026-07-26 | [完整手册](docs/CreatorOS-新用户0到1标杆路线.md) · [功能盘点](docs/research/2026-07-26-user-journey-feature-inventory-research.md) | 完成：2396 行覆盖完整用户逻辑、14 个功能域、32 个实操步骤、状态/异常/边界与 83 个连续配图位；18/18 事实检查、坏链、diff-check、reconcile 全绿（commit `d17f14fe`）。 |
| T-539 | “先去审核”同屏点击无感：跳转审核卡时增加短暂高亮与焦点反馈【体验·用户 2026-07-26】 | ✅ 待办 | 无 SPEC（既有 T-393 审核导航交互补强） | 保留平滑滚动；无论目标是否已在同屏，都让审核卡短暂高亮并聚焦，兼容重复点击与减少动态效果设置，避免按钮看似无反应。 |
| T-538 | 接通渠道绑定的产品问题反馈：从 AM 签名授权中取得不可伪造反馈上下文，用户明确确认后把已预览文字提交到 Growth，并回显真实反馈编号【跨仓契约·上线闭环·用户 2026-07-26】 | 🔨 待办 | [Growth canonical 增量契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/channel-bound-product-feedback-v1.md) | 必须绑定当前激活授权的 `(projectKey,channelRef)`，不得让用户编辑渠道或优先级；不上传日志、截图、文件、激活码或用户内容；失败保留本地文字并可重试 |
| T-537 | 内容雷达登录型数据源支持显式选择采集账号，并保持 owner/collector 双身份隔离【产品+架构·用户 2026-07-26】 | ✅ 规格内部 PASS·待真实双账号 RAT | [PLAN](docs/superpowers/specs/2026-07-26-content-radar-collector-account.md) · [CONTRACT](docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md) · [评审](docs/superpowers/specs/2026-07-26-content-radar-collector-account.review.md) | 用户明确范围只限内容雷达的主页、收藏夹、黑马来源；当前工作区仍决定数据归属，所选已绑定账号只决定登录态与读取身份。经营数据、评论和其他自动化任务不增加采集账号选择。三轮评审已内部收口，第二个有效抖音登录态完成 `RAT-537-01` 前不得 BUILD。 |
| T-536 | 根治“我的收藏”同步错误分类与浏览器档案锁恢复【bug·多账号采集·用户 2026-07-26】 | 🔨 待真实账号只读验收 | 无 SPEC（既有收藏读取链故障） | 代码已提交 `85312bd2`：跨 chunk 错误按稳定 code 恢复、无活 context 才精准清锁且只重试一次、诊断脱敏、UI 给恢复动作；定向 130 tests、typecheck、build、boundary 通过，待有效登录态做真实收藏只读验收。 |
| T-535 | CreatorOS App 启动后白屏，结合现场日志根治壳→sidecar→页面启动链【bug·桌面启动·用户 2026-07-26】 | ✅ 待办 | 无 SPEC（既有桌面启动主链 bug） | 已定位：本地 package 在 verdict 签名私钥/验签公钥缺失时仍产包，壳无法注入 token，sidecar `Ready` 后被 instrumentation 拒绝并退出；需补双 key/match fail-fast、最终安装包启动冒烟与可见失败页，以真实 App 非白屏验收。 |
| T-528 | 产出新用户视角 0→1 全功能标杆使用路线文档【调研+文档·用户 2026-07-26】 | ✅ 2026-07-26 | [标杆路线](docs/CreatorOS-新用户0到1标杆路线.md) · [调研归档](docs/research/2026-07-26-user-journey-feature-inventory-research.md) | 完成：8 章代码事实盘点整合为小白可执行的 0→1 教程和 14 功能域调研归档；明确自动发布、promotion 原子性、真机验证和经验回流边界（commit `8ae447fc`）。 |
| T-529 | 整理全仓文档体系：消除双真值、补齐索引覆盖、收拢散落文件【文档治理·用户 2026-07-26】 | ✅ 2026-07-26 | [详情见本行] | 完成:①双份 BACKLOG-archive 合一(docs 版 253 早期行并入 repo 根单份·已删 docs 版·改 2 处入链);②specs INDEX 从 46→**104 份 design spec 全覆盖**(4 并行 subagent 盘点,含 3 个 ⛔FAIL/纠偏收窄链如实标注);③docs/INDEX 补 6 文件+8 子目录盲区;④根目录仅重复 archive 一处散件,已随①归位。活动中文档(T-528 产出)未动。 |
| T-524 | 把自媒体方法知识做成 CreatorOS 随包内置知识库【产品+内容+发布·用户纠偏 2026-07-26】 | ⏸️ 待内容权利确认 | [详情](docs/tasks/T484.md#t-524) | 已与 T-519 用户知识底座解耦；Windows 桌面版已完整验收，当前仅因第三方内容的商业改编/随包分发权尚未确认而禁止改写、打包与 BUILD，不再阻塞 T-519。 |
| T-519 | 重构知识库文件工作区与用户知识底座【产品+架构·用户 2026-07-25/26】 | ✅ Replacement PLAN PASS·CONTRACT Round 3 CONCERNS | [Replacement PLAN](docs/superpowers/specs/2026-07-26-knowledge-workspace-lean.md) · [CONTRACT](docs/superpowers/specs/2026-07-26-knowledge-workspace-lean.contract.md) · [评审](docs/superpowers/specs/2026-07-26-knowledge-workspace-lean.contract.review.md) · [详情](docs/tasks/T484.md#t-519) | 用户确认完整 B 范围并行推进；T-519 与 T-524 解耦，只做用户知识工作区、Assets 安全上传、逻辑文件夹和既有图/地图/检索复用，不代表授权随包分发第三方方法内容。Round 3 仍有 0 blocker/3 major/1 minor，正式 Gate 失败，BUILD 禁止。 |
| T-525 | 验证并设计知识库旧 `.doc` 与扫描 PDF OCR 可选解析能力【兼容+安全+打包·用户确认 2026-07-25】 | ⏸️ Gate 未满足 | [详情](docs/tasks/T484.md#t-525) | 单样本方案 RAT 已完成；macOS/Windows 双平台发布物已验收，至少 20 份 `.doc`、完整 OCR 语料与独立评审仍未满足，生产继续 `unsupported/no_text`。 |
| T-533 | 日志改分天滚动+30 天启动清理(反馈场景配套)【桌面日志·用户 2026-07-26】 | ✅ 2026-07-26 | [实现](frontend/src-tauri/src/logging.rs) | 已落地 UTC 分天/会话命名、旧 current/prev 无覆盖迁移、删除 >30 天与超出 64 份的最旧文件、单会话 10 MiB 完整密文帧封顶；加密信封/全降级/脱敏链路未改，Rust lib 122/122、logdec CLI 3/3。 |
| T-534 | 根治 Growth / Activation Manager / CreatorOS 三系统边界并拆分产品反馈与商业售后入口【跨仓契约·用户 2026-07-26】 | ✅ CONCERNS(已处理)·contract gates PASS | [SPEC](docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md) · [评审](docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.review.md) · [契约门](orchestrator/GATE-T534-CONTRACT.md) · [BUILD 证据](orchestrator/GATE-T534-BUILD.md) | Creator consumer 实现、测试、运行态与治理门完成；T-396/T-518 单 supportUrl 已失效，T-531/T-532 冲突范围继续冻结；发布 build 保留 T-535 范围外阻断。 |
| T-518 | 新增侧边栏问题反馈直达入口【产品+体验·用户 2026-07-25/26】 | ✅ 2026-07-26 | [纠偏 PLAN](docs/superpowers/specs/2026-07-26-bug-feedback-inbox.md) · [CONTRACT](docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md) · [详情](docs/tasks/T484.md#t-518) | 已落地：本地脱敏、预览和复制反馈，打开签名 `supportUrl` 与加密日志目录；无上传、无反馈写 API、无假“已发送”（`705c7156`）。 |
| T-517 | 收敛 CreatorOS 生产预设自动化底座【系统底座·用户 2026-07-24/26】 | ✅ 旧 CONTRACT FAIL·纠偏 PLAN 已 PASS·待新 CONTRACT | [纠偏 PLAN](docs/superpowers/specs/2026-07-26-creatoros-automation-kernel-minimal.md) · [最终审计](docs/superpowers/specs/2026-07-26-overdesign-scope-reset.review.md) · [详情](docs/tasks/T484.md#t-517) | scheduled_job/job_run 管调度展示，PersistentTaskService 提供 durable task；补 sealed kind、typed handler 与单一 driver，不再造执行状态机。 |
| T-487 | 合并 T-454 等桌面打包欠债：借鉴 skills-manager/Tauri 官方实践，统一跨… | ✅ 2026-07-26 | [详情](docs/tasks/T484.md#t-487) | 完成：Windows 安装期原子物化、首启直读、exact Runtime cache 与最终只压一次 tar 已实现；用户 2026-07-26 明确确认 Windows 版本已完整验收，旧“待 setup.exe 冒烟”口径关闭，不补造历史命令或测试日志。 |

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
