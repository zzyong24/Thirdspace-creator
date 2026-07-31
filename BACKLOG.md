# CreatorOS 任务看板(BACKLOG)

> **单一执行真相。每个会话必读(SessionStart hook 自动注入)。** 规则见 `CLAUDE.md` 的「任务流程铁律」。
> 状态:📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置 · ⛔ SPEC 审核 FAIL(没过审不准开工)。
> 读取顺序:**本看板 → 任务引用的 SPEC → 代码**。
> 铁律:需求即任务(提了就建);开工从看板顶取;做完改状态+提交;**禁止 P0/P1 分级、禁止多阶段执行**,任务清楚即起 Workflow/并行 subagent 一次做完。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

| ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话 |
| --- | --- | --- | --- | --- | --- | --- |
| T-635 | 把 CreatorOS 正式构建绑定到 Growth 商品的统一 `projectKey`，禁止运行时覆盖产品身份或关闭严格验签 | 🔨 本地实现待验 | PASS[REV:25cabe69eae9] | 待验 | [SPEC](docs/superpowers/specs/2026-07-30-growth-product-identity-binding.md) | 可分发包 exact `creatoros`、身份/验签不可运行时覆盖、三仓本地 identity 联调已通过；claim 保持关闭，等待统一提交与生产 J-047 receipt |
| T-634 | 做实项目复盘编辑、复盘记录与经验沉淀交互【体验缺陷·用户 2026-07-30】 | ✅ 待办 | — | PASS:49effc41e481 | [复盘交互契约](frontend/specs/INTERACTION_SPEC.md#t-634-项目复盘记录交互契约) | 查清手动洞察的真实存储与知识库关系；修复复盘记录无法点击和时间展示错误；统一新增、完成、查看、刷新后的读写回显与用户下一步。 |
| T-633 | 根治内容雷达生成选题卡失败并恢复创作者中心自动扫码【线上阻断·用户 2026-07-30】 | 🔨 待办 | — | 待验 | 既有内容雷达与抖音登录契约 | 按最新日志修复 `topic_preview` 真实失败链；首次扫码直接打开创作者中心二维码页并复用同一按账号登录态，不再把普通抖音首页当默认入口。 |
| T-632 | 根治“新建定位母版”无效与逐字稿提取长时间无结果【线上阻断·用户 2026-07-30】 | 🔨 待办 | — | 待验 | [GATE](orchestrator/GATE-T632-BUILD.md) | 新建定位母版须确认后直接清空旧定位并进入空白母版；按真实日志拆解逐字稿任务排队、媒体处理与模型调用耗时，修复阻塞且呈现诚实反馈。 |
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
