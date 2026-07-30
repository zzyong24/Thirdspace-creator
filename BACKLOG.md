# CreatorOS 任务看板(BACKLOG)

> **单一执行真相。每个会话必读(SessionStart hook 自动注入)。** 规则见 `CLAUDE.md` 的「任务流程铁律」。
> 状态:📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置 · ⛔ SPEC 审核 FAIL(没过审不准开工)。
> 读取顺序:**本看板 → 任务引用的 SPEC → 代码**。
> 铁律:需求即任务(提了就建);开工从看板顶取;做完改状态+提交;**禁止 P0/P1 分级、禁止多阶段执行**,任务清楚即起 Workflow/并行 subagent 一次做完。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

| ID | 任务 | 状态 | 审核 | 文档 | 一句话 |
|---|---|---|---|---|---|
| T-628 | 提供本机 CreatorOS 首次启动全量数据清理脚本【开发验收工具·用户 2026-07-29】 | ✅ 免审 | — | [使用说明](docs/testing/creatoros-local-first-run-reset.md) | 新增可重复使用的 macOS 清理脚本，覆盖 CreatorOS 用户库、配置、缓存、运行时、采集登录态、WebView 状态和本机激活凭据，以便测试渠道与从 0 到 1 首次使用流程；默认只预览、显式确认后才清理，严格限定 CreatorOS 白名单路径，不删除安装包或仓库，应用仍运行时拒绝执行，并以临时 HOME/假 Keychain 完成无真实数据破坏的回归。 |
| T-627 | 定位最新飞书反馈“内容雷达生成选题卡卡住”【线上故障诊断·用户 2026-07-29】 | ✅ 免审 | — | [诊断结论](docs/research/2026-07-29-latest-radar-topic-generation-stuck.md) · [飞书反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | 读取最新反馈 `rec27T6wlsnDaI` 的加密日志，对齐 `/intelligence` 选题卡生成触发、模型调用与终态，判断它与 T-617“完成但慢”的同异；本轮只诊断，不修改代码或回写飞书结论。 |
| T-625 | 根治安装版“新建定位母版”点击无反馈【真机交互 Bug·用户 2026-07-29】 | ✅ 免审 | — | [T-623 交互与契约增量](docs/superpowers/specs/2026-07-29-positioning-master-and-review-copilot-design.md) | 复盘真机按钮点击未出现确认、也未发起重置的链路，移除对桌面 WebView 原生 `window.confirm` 的依赖，改为产品内可见且可测试的确认对话框；确认后仍只走既有 `positioning.master.reset`，成功再进入右侧定位 Copilot，取消或失败不得清空。 |
| T-624 | 生成当前 main 的 CreatorOS macOS 本地验收包【本地交付·用户 2026-07-29】 | ✅ 免审 | — | [T-623 交互与契约增量](docs/superpowers/specs/2026-07-29-positioning-master-and-review-copilot-design.md) | 使用既有桌面打包链基于当前 main 生成本机 arm64 `.app` 与 `.dmg`，保留 sidecar、TLS、验签材料和运行时冒烟硬闸并核对最终产物；仅供本地验收，不推送、不创建远端发布，未配置正式证书时如实标记未签名/未公证。 |
| T-622 | 完善内容雷达筛选排序与逐字稿录入、纠错和选题后锁定体验【产品体验·用户 2026-07-29】 | ✅ 待办 | — | [交互设计](docs/superpowers/specs/2026-07-29-content-radar-filter-sort-design.md) | 增加收藏/点赞排序及逐字稿、选题状态组合筛选；逐字稿支持粘贴或文件导入，未生成选题前允许替换或重新转写，一旦成功生成选题候选即永久锁定；所有状态基于真实查询并完成主从布局真机验收。 |
| T-623 | 收敛定位母版重建、规则编辑防误退出与发布复盘 Copilot 预填体验【产品体验·用户 2026-07-29】 | ✅ 待办 | — | [交互与契约增量](docs/superpowers/specs/2026-07-29-positioning-master-and-review-copilot-design.md) | 右上角统一为“新建定位母版”，确认后清空旧定位规则并进入现有 AI 对话创建新母版；规则编辑点击外部不再直接丢失；“帮我复盘”只把发布复盘消息预填到既有右侧 Copilot，用户发送后复用同一发布复盘链路，不再弹第二个 Copilot。 |
| T-621 | 补齐渠道模型异步 authority snapshot 的完整生产链路回归：createTask → persistence → authority change → cancel/no provider call【非阻断测试增强·T-606 独立复核 2026-07-29】 | 📋 待办 | — | [T-606 CreatorOS 绑定 SPEC](docs/superpowers/specs/2026-07-29-creatoros-channel-model-authority.contract.md) | 当前 digest、AsyncLocalStorage、service marker 与执行前取消已分别有单元/集成测试并获独立复核 PASS；本任务只补完整链路证据，不改变已确认契约或本轮完成结论。 |
| T-576 | 汇总并统一跟进飞书线上用户反馈，首查安装失败加密日志【线上故障·用户 2026-07-28】 | 🔨 免审 | — | [首轮汇总](docs/research/2026-07-28-production-feedback-triage.md) · [飞书反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | 飞书已按真实进度回写：安装与账号定位为“待处理”，雷达生成、重新定位和脚本双视图为“处理中”并写明待发版验证；继续统一跟进发布、真机复验与邮件反馈，不提前写成线上已解决。 |
| T-577 | 定位安装后无法启动且 bundle 缺 sidecar.tar.gz 的异常分发链【发布阻断·用户日志 2026-07-28】 | 📋 免审 | — | [飞书反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | 228B 加密日志已完整解出，唯一错误是 `bundle 资源缺 sidecar.tar.gz(打包不完整)`；用户 2026-07-28 明确要求本轮忽略，现暂停跟进且未声称修复，后续重启时再补系统、版本与下载来源并沿对应平台最终安装物查根因。 |
| T-575 | T-076-CREATOR：让已发布 CreatorOS 最小接通权益领取、签名渠道配置与产品问题反馈【跨系统上线闭环·用户 2026-07-27】 | 🔨 待办 | — | [SPEC](docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md) | 用户已授权先发布可回退测试版；补齐 Tauri claim ACL、构建期 Growth origin/能力开关与唯一 beta 版本，再完成 live HTTPS 三仓 E2E 和双平台 fault matrix；正式签名与公网更新清单仍保持关闭。 |
| T-566 | 根治混淆后 Playwright 可序列化回调被误做 V8 字节码【发布阻断·重复回归·用户真机 2026-07-27】 | 🔨 免审 | — | 无 SPEC（既有桌面打包变换链防复发） | 混淆前识别所有依赖函数源码序列化的 Playwright/Puppeteer 风格调用并生成不可丢失的决策清单，字节码步骤只消费该清单而不得从已变形源码重新猜测；补“原始 chunk → 混淆 → 字节码选择”的真实回归、最终 sidecar 中 policy 标记需保留源码的采集 chunk 不存在 `.jsc` 的产物断言及收藏链冒烟，修复后提交推送。 |
| T-565 | 重选 CreatorOS Windows Runtime 交付架构，消灭首启解压并大幅减少小文件【产品+架构·用户真机否决 2026-07-27】 | 📋 Round1 FAIL·待原生RAT | — | [重写 SPEC](docs/superpowers/specs/2026-07-27-windows-runtime-delivery-burn-transaction.md) · [评审](docs/superpowers/specs/2026-07-27-windows-runtime-delivery-burn-transaction.review.md) · [RAT](docs/research/2026-07-27-windows-runtime-prune-rat-evidence.md) | 方向已认可但 Gate 未过；BUILD 前须在原生 Windows 验证 Burn payload/cache/代理、中断恢复与 reparse containment，本机未越权触发外部 runner。 |
| T-562 | 根治 CreatorOS 0.2.0 Windows 安装后持续白屏【发布阻断·用户真机 2026-07-27】 | 🔨 免审 | — | [首启 SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · [白屏复盘](docs/research/2026-07-24-windows-first-launch-white-screen.md) | 用户真机确认最新 Windows 0.2.0 包安装后仍持续白屏；必须抓真实启动链证据，修复 sidecar/WebView 导航根因，并把 Windows 打包 Gate 从“文件存在”升级为“安装后真启动、health ready、主页面非白屏可交互”，新包经真机确认前不得宣称 Windows 可用。 |
| T-559 | 根治内容雷达列表卡片被截断、详情区错位并出现超大空白【严重显示 Bug·用户截图 2026-07-27】 | 📋 免审 | — | 无 SPEC（既有内容雷达页面布局回归） | 用户截图实证：55 条真实内容的双列卡片区在首屏中途被截断，列表与选中内容详情之间出现大块空白，详情被推到远下方；后续须基于真实数据复现，核对列表滚动容器、网格高度或虚拟化与详情展开布局，修复后完成多分辨率、滚动及切换选中项回归，未定位前不预设根因。 |
| T-548 | 根治视频渲染重试后成片脱离项目且制作页实时预览消失【发布阻断·用户 2026-07-26】 | 🔨 待办 | — | [既有 T-292/T-254 规格](docs/superpowers/specs/2026-07-13-video-production-overhaul-design.md) | `video.render` 卡内重试必须把新 taskId 回传制作页；采纳的真实视频资产须幂等关联当前 project/output、完成 export 并可由签名 blob URL 内联播放，素材中心使用记录同步显示项目，失败不得伪造预览；截图类 B-roll 必须按真实 MIME 渲染为图片画面，禁止只显示黑色占位框却把任务记为成功。 |
| T-547 | 根治知识库导入无反馈、正文空白、排序错误，并核清内置知识内容未落地原因【发布阻断·用户 2026-07-26】 | 🔨 待办 | — | 无 SPEC（既有知识录入/读取链 bug；内置内容仍受 T-524 权利门约束） | 导入必须逐文件回显真实成功/失败且不能把空正文冒充成功；知识列表按写入时间倒序；核清个人路径与“老师视角”内容为何未落地，禁止越过 T-524 内容分发权门。 |
| T-546 | 根治收藏夹/黑马同步、渠道链接、随包渲染与嵌套 Skill 回归，并隐藏文件工作区 UI【发布阻断·用户 2026-07-26】 | 🔨 待办 | — | [T-534 SPEC](docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md) | 修复旧收藏账号、恢复“指定收藏夹名称/远端列表选择”、过期租约/恢复监听、博主主页大响应未等待即误判 0 条、网页/RSS 读取错误与 EdgeOne 567 公开 feed 降级、B-roll MIME 及嵌套 Skill；内容雷达窄栏来源项改为紧凑两层结构，名称/状态/操作不得逐字换行，暂停、记录、同步仍须真实可用；雷达命中登录墙/OAuth 必须落 `LOGIN_REQUIRED`，原地弹窗复用该采集账号既有 `ingestion.douyin.login`/独立 authDir 扫码链，成功后自动重试来源，不另造 Cookie；博主来源保存后须可在来源行暂停/恢复每日自动同步，暂停不影响手动同步；Bug 反馈临时降级到官方飞书表，禁用自动发送并引导手动上传日志 zip；商业入口仍只读签名 runtime。 |
| T-538 | 接通渠道绑定的产品问题反馈：从 AM 签名授权中取得不可伪造反馈上下文，用户明确确认后把已预览文字提交到 Growth，并回显真实反馈编号【跨仓契约·上线闭环·用户 2026-07-26】 | 🔨 待办 | — | [Growth canonical 增量契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/channel-bound-product-feedback-v1.md) | 必须绑定当前激活授权的 `(projectKey,channelRef)`，不得让用户编辑渠道或优先级；不上传日志、截图、文件、激活码或用户内容；失败保留本地文字并可重试 |
| T-536 | 根治“我的收藏”同步错误分类与浏览器档案锁恢复【bug·多账号采集·用户 2026-07-26】 | 🔨 待真实账号只读验收 | — | 无 SPEC（既有收藏读取链故障） | 代码已提交 `85312bd2`：跨 chunk 错误按稳定 code 恢复、无活 context 才精准清锁且只重试一次、诊断脱敏、UI 给恢复动作；定向 130 tests、typecheck、build、boundary 通过，待有效登录态做真实收藏只读验收。 |
| T-524 | 把自媒体方法知识做成 CreatorOS 随包内置知识库【产品+内容+发布·用户纠偏 2026-07-26】 | ⏸️ 待内容权利确认 | — | [详情](docs/tasks/T484.md#t-524) | 已与 T-519 用户知识底座解耦；Windows 桌面版已完整验收，当前仅因第三方内容的商业改编/随包分发权尚未确认而禁止改写、打包与 BUILD，不再阻塞 T-519。 |
| T-519 | 重构知识库文件工作区与用户知识底座【产品+架构·用户 2026-07-25/26】 | ⏸️ 搁置 | — | [Replacement PLAN](docs/superpowers/specs/2026-07-26-knowledge-workspace-lean.md) · [CONTRACT](docs/superpowers/specs/2026-07-26-knowledge-workspace-lean.contract.md) · [评审](docs/superpowers/specs/2026-07-26-knowledge-workspace-lean.contract.review.md) · [详情](docs/tasks/T484.md#t-519) | 用户确认完整 B 范围并行推进；T-519 与 T-524 解耦，只做用户知识工作区、Assets 安全上传、逻辑文件夹和既有图/地图/检索复用，不代表授权随包分发第三方方法内容。Round 3 仍有 0 blocker/3 major/1 minor，正式 Gate 失败，BUILD 禁止。 |
| T-525 | 验证并设计知识库旧 `.doc` 与扫描 PDF OCR 可选解析能力【兼容+安全+打包·用户确认 2026-07-25】 | ⏸️ Gate 未满足 | — | [详情](docs/tasks/T484.md#t-525) | 单样本方案 RAT 已完成；macOS/Windows 双平台发布物已验收，至少 20 份 `.doc`、完整 OCR 语料与独立评审仍未满足，生产继续 `unsupported/no_text`。 |
| T-517 | 收敛 CreatorOS 生产预设自动化底座【系统底座·用户 2026-07-24/26】 | ⏸️ 搁置 | — | [纠偏 PLAN](docs/superpowers/specs/2026-07-26-creatoros-automation-kernel-minimal.md) · [最终审计](docs/superpowers/specs/2026-07-26-overdesign-scope-reset.review.md) · [详情](docs/tasks/T484.md#t-517) | scheduled_job/job_run 管调度展示，PersistentTaskService 提供 durable task；补 sealed kind、typed handler 与单一 driver，不再造执行状态机。 |

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
