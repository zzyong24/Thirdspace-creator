# CreatorOS 任务看板(BACKLOG)

> **单一执行真相。每个会话必读(SessionStart hook 自动注入)。** 规则见 `CLAUDE.md` 的「任务流程铁律」。
> 状态:📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置 · ⛔ SPEC 审核 FAIL(没过审不准开工)。
> 读取顺序:**本看板 → 任务引用的 SPEC → 代码**。
> 铁律:需求即任务(提了就建);开工从看板顶取;做完改状态+提交;**禁止 P0/P1 分级、禁止多阶段执行**,任务清楚即起 Workflow/并行 subagent 一次做完。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

| ID | 任务 | 状态 | 文档 | 一句话 |
|---|---|---|---|---|
| T-528 | 产出新用户视角 0→1 全功能标杆使用路线文档【调研+文档·用户 2026-07-26】 | ✅ 2026-07-26 | [标杆路线](docs/CreatorOS-新用户0到1标杆路线.md) · [调研归档](docs/research/2026-07-26-user-journey-feature-inventory-research.md) | 完成：8 章代码事实盘点整合为小白可执行的 0→1 教程和 14 功能域调研归档；明确自动发布、promotion 原子性、真机验证和经验回流边界（commit `8ae447fc`）。 |
| T-529 | 整理全仓文档体系：消除双真值、补齐索引覆盖、收拢散落文件【文档治理·用户 2026-07-26】 | ✅ 2026-07-26 | [详情见本行] | 完成:①双份 BACKLOG-archive 合一(docs 版 253 早期行并入 repo 根单份·已删 docs 版·改 2 处入链);②specs INDEX 从 46→**104 份 design spec 全覆盖**(4 并行 subagent 盘点,含 3 个 ⛔FAIL/纠偏收窄链如实标注);③docs/INDEX 补 6 文件+8 子目录盲区;④根目录仅重复 archive 一处散件,已随①归位。活动中文档(T-528 产出)未动。 |
| T-524 | 把 CreatorOS 教程改为可信的可选下载课程包【产品+发布+体积·用户确认 2026-07-25】 | 📋 待办 | [详情](docs/tasks/T484.md#t-524) | 独立定义签名清单、下载/校验/卸载、版本兼容和内容授权；不再把 22 节课程塞入安装包，也不读取开发者个人目录。 |
| T-519 | 重构知识库为多文件导入与文件夹树/关系图/观点地图多视图【产品+架构·用户 2026-07-25】 | 🔨 进行中·CONTRACT 阶段 | [纠偏 PLAN](docs/superpowers/specs/2026-07-26-knowledge-workspace-lean.md) · [最终审计](docs/superpowers/specs/2026-07-26-overdesign-scope-reset.review.md) · [详情](docs/tasks/T484.md#t-519) | 保留默认多级文件夹/虚拟节点、文件及 URL/文本导入、local-only 和四视图；先修 Assets upload 的 account ownership、stable assetId 和 complete 幂等，未过新 CONTRACT/确认②不 BUILD。 |
| T-525 | 验证并设计知识库旧 `.doc` 与扫描 PDF OCR 可选解析能力【兼容+安全+打包·用户确认 2026-07-25】 | ✅ 待办 | [详情](docs/tasks/T484.md#t-525) | 用真实语料、安全、隐私、费用和双平台包体/path Gate 决定可选本地组件或服务 adapter；未通过前保持 `unsupported/no_text`。 |
| T-533 | 日志改分天滚动+30 天启动清理(反馈场景配套)【桌面日志·用户 2026-07-26】 | ✅ 2026-07-26 | [实现](frontend/src-tauri/src/logging.rs) | 已落地 UTC 分天/会话命名、旧 current/prev 无覆盖迁移、删除 >30 天与超出 64 份的最旧文件、单会话 10 MiB 完整密文帧封顶；加密信封/全降级/脱敏链路未改，Rust lib 122/122、logdec CLI 3/3。 |
| T-518 | 新增侧边栏问题反馈直达入口【产品+体验·用户 2026-07-25/26】 | ✅ 2026-07-26 | [纠偏 PLAN](docs/superpowers/specs/2026-07-26-bug-feedback-inbox.md) · [CONTRACT](docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md) · [详情](docs/tasks/T484.md#t-518) | 已落地：本地脱敏、预览和复制反馈，打开签名 `supportUrl` 与加密日志目录；无上传、无反馈写 API、无假“已发送”（`705c7156`）。 |
| T-517 | 收敛 CreatorOS 生产预设自动化底座【系统底座·用户 2026-07-24/26】 | ⏸️ 旧 CONTRACT FAIL·纠偏 PLAN 已 PASS·待新 CONTRACT | [纠偏 PLAN](docs/superpowers/specs/2026-07-26-creatoros-automation-kernel-minimal.md) · [最终审计](docs/superpowers/specs/2026-07-26-overdesign-scope-reset.review.md) · [详情](docs/tasks/T484.md#t-517) | scheduled_job/job_run 管调度展示，PersistentTaskService 提供 durable task；补 sealed kind、typed handler 与单一 driver，不再造执行状态机。 |
| T-487 | 合并 T-454 等桌面打包欠债：借鉴 skills-manager/Tauri 官方实践，统一跨… | ⏸️ 搁置·待付费 workflow 冒烟 | [详情](docs/tasks/T484.md#t-487) | Windows 安装期原子物化、首启直读、exact Runtime cache 与最终只压一次 tar 已实现；本地 Gate 通过，待首次付费 workflow 真跑 setup.exe 冒烟，当前不触发。 |

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
