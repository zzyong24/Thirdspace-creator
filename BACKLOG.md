# CreatorOS 任务看板(BACKLOG)

> **单一执行真相。每个会话必读(SessionStart hook 自动注入)。** 规则见 `CLAUDE.md` 的「任务流程铁律」。
> 状态:📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置 · ⛔ SPEC 审核 FAIL(没过审不准开工)。
> 读取顺序:**本看板 → 任务引用的 SPEC → 代码**。
> 铁律:需求即任务(提了就建);开工从看板顶取;做完改状态+提交;**禁止 P0/P1 分级、禁止多阶段执行**,任务清楚即起 Workflow/并行 subagent 一次做完。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

| ID | 任务 | 状态 | 文档 | 一句话 |
|---|---|---|---|---|
| T-045 | 去登录 → 激活码授权 + 本机单用户模式 | 📋 SPEC 已写·待过 gate(改认证架构,FAIL 不准开工) | [activation-single-user](docs/superpowers/specs/2026-07-02-activation-single-user-design.md) | **用户 2026-07-02:不要登录;激活码授权→装客户本机→自设用户名/邮箱→抖音扫码。** 设计:Ed25519 离线验签激活码+app_activation 单行表+auto-session(下游零动)+/activate+/setup 向导+登录下线+dev-bypass。拆:**a** activation 后端纵切(验签/迁移0015/op/签发脚本) **b** middleware 守卫+auto-session+两页 **c** 登录下线+e2e 走查+宪法补注 |
| T-044 | 登录按钮 autofill 死灰修复 | ✅ | — | 密码管理器 autofill 不触发 React onChange→按钮死灰;改 FormData 从 DOM 读凭据+按钮仅提交中置灰+空值内联提示,8 测绿真机验可点 |
| T-043 | BACKLOG 瘦身 + 台账规范/踩坑经验回流 orchestrator | ✅ | `~/.claude/skills/product-to-code-orchestrator/rules/`(项目外·全局 skill) | 看板 58KB→13KB(-78%,31 行零丢失,done 状态列同步);台账规范落 `task-ledger-rules.md`、54 条实战教训落 `field-lessons.md`、SKILL.md Startup 挂引用 |
| T-012 | SPEC 审核 gate | 🔨 | orchestrator `prompts/spec-reviewer.md` + [REVIEW_LEDGER](docs/superpowers/specs/REVIEW_LEDGER.md) | SPEC 过审机制已实战验证(reviewer+REVIEW_LEDGER+SessionStart 注入)。剩:① reviewer 走 MiniMax spec.review 自动化 ② PreToolUse 硬 hook 自动拦未过审实现 |
| T-003 | 三方向读侧接真(底座→各模块) | 📋 数据卡 | [同上 §2](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md) | 三方向读侧接真、mock 让位。已完成:§1.4 hasImportedProjects 单一判据+首页/复盘读真让位+修 2 真 bug(指标 key views??plays 归一;标题回退实为缺 DATABASE_URL 环境态),集成测绿。剩:①选题评论 basis ②知识库过往脚本导入 ③定位 portfolio 接真(净增 feature,非 fixture 让位) |
| T-004 | ChatBox 进化(上下文感知) | 🔨 | [同上 §3](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md) | Copilot→useChat+ChatContext 三层注入。slice1+2 done:首波 5 工具+4 surface skill+functionKey 置顶+一键岛深链预调+generative UI,前端 813 测绿。剩:二/三波工具(planning 三件套/script.draft/material.match/publish.platform_adapt)+project surface 深化 |
| T-007 | 任务调度系统 + 调度页面 | 🔨 | [data-source-pipeline-design](docs/superpowers/specs/2026-06-30-data-source-pipeline-design.md) | 调度系统+页面(gate FAIL→重写→PASS)。可自主切片全 done:S0 富录入(d1f236c)/D1 数据模型/D2 评论抓取(e817297)/D3 cron+runner(885eb6e)/D4 needs_reconnect+D5 立即运行(7f21da2)/D6 任务中心(2e6bea0)/D7 消费已通。剩:D7 recipe 发现-重放(未来优化);真机 e2e 已随 T-033/T-036/T-041 落地 |
| T-032 | 抖音账号绑定/扫码入口 + 采集反馈 + 修评论静默 bug | ✅ | [data-source-pipeline](docs/superpowers/specs/2026-06-30-data-source-pipeline-design.md) + [real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md) | 设置「账户」Tab 加抖音账号绑定卡+扫码入口+状态探针(9d68409);采集反馈分档做真(✅新增N条/⚠️需重连/❌失败,747ff25);核查评论链路无静默 bug |
| T-033 | 采集真机 bug 修 + Playbook 真跑复现(用户已扫码) | ✅ | [data-source-pipeline](docs/superpowers/specs/2026-06-30-data-source-pipeline-design.md) | 真机 2 报错修:comments 无 awemeId 改遍历 imported 作品(6b02e7d)、self.detail「no collector」=旧 dev server 未重启;headless 导出修「点错 tab」根因(1b38ed8)+评论单 context 复用(bad4248)。遗留 title↔external_id 断裂拆 T-034 |
| T-034 | 明细落库最后一里:修 title↔external_id 断裂 | ✅ | [real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md) | 修 title↔external_id 断裂:catalog 加 content_output 标题回退+分层匹配(精确→首行→唯一前缀)+回填 72 条 revision;真跑 metric_snapshots +27 真 finish_rate/ctr,复盘从 0 变真 (59bab3d) |
| T-035 | 复盘做真 + 去假图 + ECharts 可视化 | ✅ | [real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md) | 复盘读侧接真(views??plays+每发布最新快照,f682489)+fixture 假图全删换「规划中」诚实占位;ECharts 漏斗/趋势真图+漏斗去假转化系数(ec5884b/6db1910) |
| T-038 | 抖音采集统一限流/退避子系统(防封 IP/账号) | ✅ | [throttle-and-backoff](docs/superpowers/specs/2026-07-02-douyin-collection-throttle-design.md) | 统一限流/退避子系统:网关核心+风控分类+持久 cooldown(f874fb3)、5 插装点集成+dispatch 串行闸(0da6ce0)、可观测 throttleStatus+任务中心限流 eta 文案(d0be597) |
| T-036 | 明细导出补全(37→全部作品·走 T-038 限流) | ✅ | [real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md) | 发布时间「全部」preset 破默认近90天限制 + 匹配层修时区/时刻/无题池/externalId 四根因;真机覆盖 30→73(imported 100%) (63a6616) |
| D8b | 单视频维度真数据(观众画像/来源/留存/关键时刻·走 T-038 限流) | 📋 依赖 T-038 | [real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md) | 复盘四块「规划中」占位做真:xlsx 导出无此数据,需抓创作者后台单视频分析页→落库喂 ECharts;逐作品抓量大最易封号,必须走 T-038 限流慢速后台 |
| T-039 | ChatBox 对话复盘/研究 per-action 上下文注入做真 + 提示词/skill 透明 + @项目引用 + 当前项目指示器修复 | ✅ | [data-foundation-and-director-chatbox](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md)(关联 T-004/T-027) | 复盘 per-action 注入做真:prompt 加文案/数据/评论三块+projectId 全链路+指示器去 fixture(645dfc6)、收窄 review skill 治模型凑数(f0e82d8)、@项目引用+shell 显真标题+修 route 漏转发 reviewSubject(9468cf4);端到端真验 learnings 扣真脚本、0 他作标题 |
| T-040 | 提示词/skill 服务端可配可更新(不写死) | ✅ | [server-configurable-prompts](docs/superpowers/specs/2026-07-02-server-configurable-prompts-design.md) | 提示词/skill 服务端可配可热更:迁移0013 存库 override+装配读表(932e70d)、11 结构化 runner 走 getTemplate(a40a191)、settings.prompts.list/get/put op+put 后热更不重启(df477ed/8bc2704,含撤销 schema 粘住 bug 修);真机端到端验过,覆盖 18 skill |
| T-041 | 全量评论采集(每作品热榜前100)+ 复盘评论区落数据 | ✅ | [real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md) | 评论采集做真:根因=抖音评论页 URL 迁到 interactive/comment(旧 URL 被重定向→XHR 0 次→succeeded 却 0 条),修常量+重采(959dd9f);+219 条真评论覆盖 73 作品,复盘评论区显真(前100/作品) |
| T-042 | 评论热榜排序做真(采集存点赞数 + 复盘评论区按点赞降序展示前100) | ✅ | [real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md) | 评论热榜做真:迁移0014 like_count 全链路落点赞+跨作品按点赞降序前100+🔥徽标仅>0 显(f39fa1f/7dd9026);headed 证实本账号评论 digg_count 真为 0(非 bug),有赞时自动排前 |
| T-037 | 全量作品完整化(真跑管线:逐字稿全量 + reconstruct 全量) | 🔨 | [real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md) | 全量作品完整化。已完成:先验 1 条逮修 ASR baseUrl 双拼 404(eeade81)后全量真跑,32/72 视频作品逐字稿+research/planning 重建完整;41/72 为图集无音频天生无逐字稿(非 bug),慢速批 0 风控。剩:可选图集用 caption 代逐字稿喂 reconstruct;2 条 reconstruct 瞬时失败(529)可重跑 |
| T-030 | 真实作品数据管线 2.0(采集指令化 + 逐字稿内置 + 作品初始化分析 + 已发布100%/自由跳 + 复盘评论 + 明细数据) | 🔨 D1–D8a 全完成·D8b 规划中 | [real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md)(切片见下「🧬 T-030」section) | 管线 2.0 六需求(指令化采集/逐字稿/auto-fill/已发布100%自由跳/复盘评论/明细)。SPEC 过 gate,D1–D8a 切片全 done(见下表),真机 e2e 已随 T-033/T-036/T-037/T-041 落地。决策:对标 deferred→T-031、ASR 云端可配、历史作品直接 auto-fill。剩:D8b 单视频维度(规划中) |
| T-031 | 对标库(存他人作品·浏览+喂选题/定位参考) | 📋 deferred·单独 SPEC | 对标专属 SPEC 待写 | 对标库:采他人主页→存对标作品(标题/指标/逐字稿/封面)→浏览+喂选题/定位。重新引入=方向变更(此前 T-007 不纳入/T-017 删竞品/宪法§7 未含),做前须写 SPEC+过 gate+宪法补注;排 T-030 后 |

## 🎬 生命周期重设计 L0–L7(SPEC PASS-ready 2026-07-01,按序做)

> SPEC:[lifecycle-redesign-creation-first](docs/superpowers/specs/2026-07-01-lifecycle-redesign-creation-first.md)(gate CONCERNS→补清→PASS-ready,`5bb29c7`)。核心:每阶段 AI 干重活+产具体创作物+无真东西不摆空+创作向非学术;本地优先存储。**全做,无优先级,按 L 序(L0 地基先)。** 横切 Copilot/导航 bug 已修(T-014)。

| ID | 任务(切片) | 状态 | 一句话 |
|---|---|---|---|
| T-016 | L1 立项简化 | 🔨 | 去刚立项必为 0 的空区折叠 + 单一主行动(去双按钮歧义)。「进入下一步」无反应已修(T-014) |
| T-020 | L5 录制(素材) | 🔨 M1-M4✅ | 已过审([SPEC](docs/superpowers/specs/2026-07-01-multimodal-model-config-and-recording-design.md))。M1 多模态解析层+M2 asset.generate runner+M3 设置页文生图/视频配置卡+M4 录制页三区 UI 全 done。剩:M5 真链路验收(需用户配 image/video key) |
| T-022 | L7 复盘 | 📋 依赖 T-007 | **依赖 T-007 整套实现**:调度抓抖音→snapshot 时序图表 + 只已发布(`hasImportedProjects`)可复盘门。排 T-007 之后 |

## 🧬 真实作品数据管线 2.0(T-030 切片,D1–D8a 全完成 ✅,剩真机 e2e 卡 DATA-1/2)

> SPEC:[real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md)。**✅ gate CONCERNS→补清 F1-F4(SPEC 修订版)→可开工**(见 [REVIEW_LEDGER](docs/superpowers/specs/REVIEW_LEDGER.md))。垂直切片、各自可验,非阶段。开工顺序:D5→D3 快赢 → D1→D2→D4→D6→D7→D8a(D8b 单视频分析页规划中)。

| ID | 切片 | 状态 | 一句话 |
|---|---|---|---|
| T-030-D1 | ASR capability(model-config) | ✅ `7d539dc` | transcribe.audio capability 镜像 image/video:resolveTranscribeSpec+openai-asr 适配器(SiliconFlow/OpenAI/Groq)+设置页 TranscribeConfigCard |
| T-030-D2 | 逐字稿管线 | ✅ `69bfde3` | parseDouyinVideoUrl+ffmpeg 取音频+transcribe-runner(F7 失败分类)+只读 hasTranscriptArtifact 探针+dispatch 装配,17 测绿 |
| T-030-D3 | 存量回填 | ✅ `d5815c6` | ensureTranscriptArtifact 幂等+backfill:transcripts 脚本;已真跑:月明水清深 30/30 条逐字稿落 imported 项目 script 阶段 |
| T-030-D4 | 作品 auto-fill 分析 | ✅ `40c464a` | 迁移0010 artifacts.origin+reconstruct-runner(逐字稿+真指标→research/planning artifacts,origin=reconstructed)+brief 加「AI历史反推未确认」标注 |
| T-030-D5 | 已发布 100% + 自由跳阶段 | ✅ `ce0138b` | imported 项目 7 阶段 progressPct=100+免 stage gate 自由跳;存量 72 项目 SQL 回填至 100% |
| T-030-D6 | 复盘评论 | ✅ `43fba59` | 迁移0011 audience_signals.publication_id+读 op publications.comments.list+复盘页 CommentsSection(前100/demand_tag,空态诚实) |
| T-030-D7 | 采集指令化 UX | ✅ `fc17cb4` | cadence 纯编译器+CadenceEditor/TimePicker(cron 从不显示)+NL prompt+意图模板卡/确定性分类,58 测绿 |
| T-030-D8a | 明细数据导出采集 | ✅ `c5f532f` | parseDouyinWorkListXlsx(中文表头模糊匹配)+完播率/CTR→rawMetrics+matchDetailsToPublications+Playwright 导出移植 TzFilm+self.detail collector 装配 |
| T-030-D8b | 单视频分析页(观众/来源/留存) | 📋 规划中 | 观众画像/来源/留存曲线/关键时刻:xlsx 导出没有、需单独抓单视频分析页(工程大);先标规划中,D8a 后单列(OQ-2 待用户) |

## ✅ 已完成

> ✅ 已完成任务全文已归档到 [BACKLOG-archive.md](docs/BACKLOG-archive.md)(减小本看板体积;单一执行真相仍是本文件)。
