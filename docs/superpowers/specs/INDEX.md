# SPEC 顶层索引(docs/superpowers/specs/)

> 本目录 **全部 104 份 design spec + 关键评审记录**的导航索引(2026-07-26 T-529 补齐至全量覆盖)。每条 = 文件名 + 一句话摘要(取自各 spec 头部,非编造)+ 审核状态。
> `.review.md` / `.contract.md` / `.page-spec.md` 等评审/契约/页面附件与其 design 母 spec 同名同目录,随母条查阅,不再逐一单列。
> **状态权威源 = [REVIEW_LEDGER.md](REVIEW_LEDGER.md)**(gate durable 台账);本索引状态列是它的摘要视图,冲突时以 LEDGER 为准。
> **定位是否合宪的唯一对照 = [../../产品定位.md](../../产品定位.md)**;文档总导航见 [../../INDEX.md](../../INDEX.md)。

图例:✅ PASS · ⚠️ CONCERNS(已处置) · ⛔ FAIL(重写待审) · 📋/📝 待过 gate · ⏸️ 用户暂缓 · —(约束规格/清理类,按铁律免强制过审)

---

## 契约与执行底座

| 文件 | 摘要 | 状态 |
|---|---|---|
| [2026-06-21-service-contract-design.md](2026-06-21-service-contract-design.md) | Zod-first 服务契约 + 可换 transport(stage 15a,闭 GAP-002) | — |
| [2026-06-21-15b-mock-backend-design.md](2026-06-21-15b-mock-backend-design.md) | 前端经 contract 接 server-side MockBackend(Projects 垂类)让按钮变真 | — |
| [2026-06-24-p1-persistence-foundation-design.md](2026-06-24-p1-persistence-foundation-design.md) | 内存 PGlite 换真 Postgres + drizzle-kit 版本化迁移(P1 持久化底座) | — |
| [2026-06-29-creatoros-refactor-design.md](2026-06-29-creatoros-refactor-design.md) | 前后端分离 + AI 变可调工具、可换模型的编导 Agent 大重构 | — |
| [2026-06-24-self-evolving-orchestrator-design.md](2026-06-24-self-evolving-orchestrator-design.md) | orchestrator 闭环:坑/决策捕获→账本→调阅→GuardCheck 挡复发 | 设计已定,先做 Phase 0 |
| [2026-06-24-autonomy-eval-harness-design.md](2026-06-24-autonomy-eval-harness-design.md) | 启用自治 harness + eval 门,减少逐步人审 | — |
| [2026-07-06-storage-dir-migration-design.md](2026-07-06-storage-dir-migration-design.md) | 改媒体存储目录时把旧目录文件自动迁移到新目录,老 blob 不再 404(T-162) | 📋 待过 gate |
| [2026-07-11-execution-layer-video-pipeline-design.md](2026-07-11-execution-layer-video-pipeline-design.md) | 给编导装可插拔执行层(脑手分离)+首个 executor:video.render HyperFrames 模板化(T-254/255) | ✅ PASS 可开工 T-255a→T-254a/b/c |
| [2026-07-14-pi-runtime-full-integration-design.md](2026-07-14-pi-runtime-full-integration-design.md) | 把 Pi SDK 接成编导受控执行自愈主管+记忆层+对话式 skill 进化(T-314) | 📋 待过 gate |
| [2026-07-15-logging-observability-layer-design.md](2026-07-15-logging-observability-layer-design.md) | 装黑匣子+病历本:AI 调用可复现、失败 traceId 串链、一键导诊断(T-337) | 📋 待过 gate |
| [2026-07-24-creatoros-automation-kernel.md](2026-07-24-creatoros-automation-kernel.md) | T-517 自动化内置底座:唯一 ticker + automation_job/run 收口 | ✅ PLAN passed(确认①)→进 CONTRACT |
| [2026-07-24-content-radar-unified-automation-design.md](2026-07-24-content-radar-unified-automation-design.md) | T-517 内容雷达自动同步收口统一调度,不再起独立 timer | ⚠️ CONCERNS(待用户裁决 R2-01) |
| [2026-07-26-creatoros-automation-kernel-minimal.md](2026-07-26-creatoros-automation-kernel-minimal.md) | 替代稿:不建第三套执行平台,复用 scheduled_job/job_run+PersistentTaskService+单一 driver(收窄 T-517) | 📋 待过 gate |

## AI 编排与模型配置

| 文件 | 摘要 | 状态 |
|---|---|---|
| [2026-06-21-ai-orchestration-agent-sdk-design.md](2026-06-21-ai-orchestration-agent-sdk-design.md) | 用 Claude Agent SDK 建统一可审计的 AI 执行层(候选-确认边界) | — |
| [2026-06-23-configurable-llm-design.md](2026-06-23-configurable-llm-design.md) | 纯 prompt 节点走供应商无关的可配置 LLM 薄抽象层(不写死 Agent SDK) | — |
| [2026-07-01-multimodal-model-config-and-recording-design.md](2026-07-01-multimodal-model-config-and-recording-design.md) | 多模态生图/生视频 model-config 抽象 + L5 录制阶段(T-020) | ⚠️ 已处置→可开工 |
| [2026-07-02-server-configurable-prompts-design.md](2026-07-02-server-configurable-prompts-design.md) | 提示词/skill 服务端可配可热更(接线既有 override 通道,T-040) | v1 ⛔→v2 ⚠️ 已处置→可开工 |
| [2026-07-10-skill-driven-creative-agent-design.md](2026-07-10-skill-driven-creative-agent-design.md) | Skill 驱动编导智能体·品味对齐飞轮为主轴 + 服务端接管更新/Skill 下发 + 采集增量/退避/激活占码地基(T-176~T-186) | 📋 待过 gate |
| [2026-07-06-frontend-ai-sdk-decoupling-design.md](2026-07-06-frontend-ai-sdk-decoupling-design.md) | 把 AI SDK+26 runner 从前端搬进 backend,prompt/key/AI 逻辑永不过客户端边界(T-163) | 📋 待过 gate |
| [2026-07-07-p3-remote-prompt-update-design.md](2026-07-07-p3-remote-prompt-update-design.md) | prompt override 来源扩成本地定制+签名远程包,不发新版即迭代 prompt(T-147 P3) | 📋 待过 gate |
| [2026-07-11-director-agent-hardening-design.md](2026-07-11-director-agent-hardening-design.md) | 蒸馏 Claude Code 工程实践给编导加固:错误恢复/历史窗口化/中断一致/工具门/用量(T-239) | ⚠️ CONCERNS(已处置)可开工 T-239a~g |
| [2026-07-12-controlled-agentic-runtime-design.md](2026-07-12-controlled-agentic-runtime-design.md) | 三种循环各归各位,自主任务循环交专门引擎但副作用执行仍走确定性端口(T-256) | ⚠️ CONCERNS(已处置)可开工(待用户审)T-256a~d |
| [2026-07-23-openai-responses-protocol-design.md](2026-07-23-openai-responses-protocol-design.md) | T-471 显式支持 OpenAI Responses 协议,贯穿保存/测试/执行 | —(追溯重建·不触发跨模型 review) |
| [2026-07-24-model-configuration-experience-redesign.md](2026-07-24-model-configuration-experience-redesign.md) | 模型配置从"六字段自由组合"改为选用途+选 Key 来源+粘 Key 向导+动态目录+真实能力测试(T-501) | passed(三轮通过·确认①) |
| [2026-07-25-model-configuration-experience-redesign.page-spec.md](2026-07-25-model-configuration-experience-redesign.page-spec.md) | T-501 PAGE SPEC:沿用现有 Settings 外壳做增量,用"证据轨"呈现分项测试结果 | —(page-spec·内部 PASS) |
| [2026-07-26-model-configuration-lightweight-optimization.md](2026-07-26-model-configuration-lightweight-optimization.md) | 替代范围:只做收字段进高级+"保存并测试"复用正式 streamText 通路+更新教程(收窄 T-501) | 用户已确认·可进 BUILD |

## 数据管线与采集

| 文件 | 摘要 | 状态 |
|---|---|---|
| [2026-06-30-data-foundation-and-director-chatbox-design.md](2026-06-30-data-foundation-and-director-chatbox-design.md) | 数据底座(已发布作品=历史项目)+ 上下文感知编导 ChatBox | ⚠️ canonical,已实现 |
| [2026-06-30-data-source-pipeline-design.md](2026-06-30-data-source-pipeline-design.md) | 通用「prompt+调度→唤醒 Agent」+ 自有数据周期采集(T-007) | ⚠️ re-review 已补清→可开工 |
| [2026-07-01-real-works-data-pipeline-v2-design.md](2026-07-01-real-works-data-pipeline-v2-design.md) | 真实作品数据管线2.0:逐字稿+创作链+评论+明细(T-030) | ⚠️ 已补清 F1–F4→可开工 |
| [2026-07-02-douyin-collection-throttle-design.md](2026-07-02-douyin-collection-throttle-design.md) | 抖音采集统一限流/退避子系统防封 IP/账号(T-038) | ⚠️ 已处置→可开工 |
| [2026-07-05-web-search-decoupling-design.md](2026-07-05-web-search-decoupling-design.md) | 联网搜索从模型内置工具解耦为自有检索层(T-126) | ⚠️ 已处置(现网已存在,范围塌缩) |
| [2026-07-06-asr-local-whisper-design.md](2026-07-06-asr-local-whisper-design.md) | ASR 从必配 key 变选配,未配则下载本地 Whisper 自跑、零 key(T-160) | ✅ 已实现(真机端到端待验) |
| [2026-07-11-benchmark-topic-flywheel-design.md](2026-07-11-benchmark-topic-flywheel-design.md) | 对标从手动拆 pattern 升级为精选源采集→爆款判定→AI 拆解→自动转选题供给飞轮(T-212) | ⚠️ CONCERNS(已处置)可开工 T-212a~d |
| [2026-07-11-daily-topic-autopilot-design.md](2026-07-11-daily-topic-autopilot-design.md) | 选题从静态池升级为每天自动出题+多源证据入口+已发布作品按选题归因回流(T-235) | ⚠️ CONCERNS(已处置)可开工 T-235a~e |
| [2026-07-15-transcript-fetch-two-surfaces-design.md](2026-07-15-transcript-fetch-two-surfaces-design.md) | 对标视频+已发布作品各加单条「抓逐字稿」按钮,失败收敛到单条(T-349) | — |
| [2026-07-17-browser-session-pool-design.md](2026-07-17-browser-session-pool-design.md) | Web 登录态迁加密 DB+Profile 池(≤5)按需注入,抖音不进池(T-370) | 📋 待过 gate |
| [2026-07-19-multi-account-collection-speedup-design.md](2026-07-19-multi-account-collection-speedup-design.md) | 多账号采集提速最小版:绑号轻触发(重活延后)+每日 cron 错峰(T-433) | 📋 待过 gate |
| [2026-07-23-content-radar-restructure-design.md](2026-07-23-content-radar-restructure-design.md) | T-482 内容雷达:定位与选题间加对标监控/信源,AI 只产选题候选 | ✅ passed(独立评审)可开工 T-482 |
| [2026-07-23-content-radar-service-contract.md](2026-07-23-content-radar-service-contract.md) | T-482 内容雷达服务契约:intelligence.*/execution schema 单一真值 | —(契约·Contract Gate PASS) |
| [2026-07-24-favorites-collector-account-selector-design.md](2026-07-24-favorites-collector-account-selector-design.md) | 大号工作区加"我的收藏"来源时可选本人小号做采集登录态,采到内容仍归大号(T-496) | ⛔ 独立评审 FAIL·退回 PLAN |

## 生命周期与稿面

| 文件 | 摘要 | 状态 |
|---|---|---|
| [2026-06-30-project-lifecycle-0to1-spec.md](2026-06-30-project-lifecycle-0to1-spec.md) | 项目制作全生命周期 0→1 字段级规格(6 条横切脊柱) | — binding 约束规格 |
| [2026-07-01-lifecycle-redesign-creation-first.md](2026-07-01-lifecycle-redesign-creation-first.md) | 生命周期从通用空壳改为创作向短视频生产线 + 本地优先 PGlite | ⚠️ 已处置→可开工 |
| [2026-07-03-two-stage-project-design.md](2026-07-03-two-stage-project-design.md) | 项目从六阶段收敛为脚本(稿面)→复盘两阶段(T-076) | ✅ PASS 可开工 |
| [2026-07-03-two-stage-project-design.review.md](2026-07-03-two-stage-project-design.review.md) | two-stage-project-design(T-076)spec 的评审记录 | verdict PASS |
| [2026-07-02-draft-workbench-redesign.md](2026-07-02-draft-workbench-redesign.md) | 稿面工作台重做:左稿面右对话、阶段降为成熟度标记(T-055) | ✅ PASS 可开工 |
| [2026-07-02-draft-workbench-redesign.review.md](2026-07-02-draft-workbench-redesign.review.md) | draft-workbench-redesign(T-055)spec 的评审记录 | verdict PASS |
| [2026-07-05-creation-flow-thesis-scaffold-design.md](2026-07-05-creation-flow-thesis-scaffold-design.md) | 创作流补回论点骨架:选题→素材→论点结构→脚本(T-127) | ⚠️ 已处置(待过 gate) |
| [2026-07-03-content-calendar-redesign.md](2026-07-03-content-calendar-redesign.md) | 内容日历重做:过去渲真发布数据、未来渲排期(T-083) | ✅ PASS 可开工 |
| [2026-07-13-video-production-overhaul-design.md](2026-07-13-video-production-overhaul-design.md) | 视频产出补全:竖版+富动画+成片预览+朝向必填+素材真用上(T-290~295) | — |
| [2026-07-17-structure-script-storyboard-consistency-design.md](2026-07-17-structure-script-storyboard-consistency-design.md) | 四决策从再创作降为对齐器,分层单一真源;素材 AI 预挂+自动进 B-roll(T-387) | 📋 待过 gate |
| [2026-07-17-video-stage-three-paths-and-material-export-design.md](2026-07-17-video-stage-three-paths-and-material-export-design.md) | 制作阶段成片放开三路(受控成片/上传成品/导出素材包 zip)(T-366) | 📋 待过 gate |

## 知识库与经验沉淀

| 文件 | 摘要 | 状态 |
|---|---|---|
| [2026-07-03-knowledge-learnings-redesign.md](2026-07-03-knowledge-learnings-redesign.md) | 知识库+经验沉淀重设计:裁决台+回流+倾倒场(T-062) | ✅ PASS 可开工 |
| [2026-07-03-knowledge-learnings-redesign.review.md](2026-07-03-knowledge-learnings-redesign.review.md) | knowledge-learnings-redesign(T-062)spec 的评审记录 | verdict PASS |
| [2026-07-03-knowledge-asset-redesign.md](2026-07-03-knowledge-asset-redesign.md) | 知识库第一性重做:claim/evidence/quote/qa 四原子资产库(T-079) | ⚠️ 已处置→可开工 |
| [2026-07-03-knowledge-asset-redesign.review.md](2026-07-03-knowledge-asset-redesign.review.md) | knowledge-asset-redesign(T-079)spec 的评审记录 | verdict CONCERNS(已处置) |
| [2026-07-03-knowledge-graph-and-search.md](2026-07-03-knowledge-graph-and-search.md) | 知识库二期:真知识图谱 + 评论回流 + AI 搜索(T-091/092/093) | ✅ PASS 可开工 |
| [2026-07-03-skill-evolution-loop.md](2026-07-03-skill-evolution-loop.md) | Skill 经验回流进化通路 + 防污染四闸门(T-087) | ✅ PASS 可开工 |
| [2026-07-04-experience-relocation-design.md](2026-07-04-experience-relocation-design.md) | 经验归位:裁决进复盘、已验证库进知识库、经验模块退役(T-118) | ⚠️ 已处置→可开工(待复审) |
| [2026-07-12-knowledge-graph-ai-relations-design.md](2026-07-12-knowledge-graph-ai-relations-design.md) | 复原 T-199 误删的力导向知识关系图,关系边全 AI 建、人只确认,详情弹窗精简(T-260) | ⚠️ CONCERNS(已处置)可开工(待用户审)T-260a~c |
| [2026-07-13-replication-loop-linkage-design.md](2026-07-13-replication-loop-linkage-design.md) | 补拆解要素/归因公式/复盘经验回流生成,接通拆解→复刻飞轮闭环(T-284) | 📋 待过 gate |
| [2026-07-24-controlled-knowledge-retrieval-design.md](2026-07-24-controlled-knowledge-retrieval-design.md) | T-497 知识库受控检索、注入与引用证据,防大语料支配输出 | ⛔ FAIL(第三轮 blocker·退回 PLAN) |
| [2026-07-25-knowledge-workspace-folder-multiview.md](2026-07-25-knowledge-workspace-folder-multiview.md) | /knowledge 重构为知识文件工作区:默认文件夹树+PDF/DOCX/MD 导入+四视图+AI 提炼采纳门(T-519) | accepted-risk·进 CONTRACT |
| [2026-07-26-knowledge-workspace-lean.md](2026-07-26-knowledge-workspace-lean.md) | 替代稿:先修 Assets 上传归属/幂等再补逻辑文件夹,复用 Knowledge/Search/图(收窄 T-519) | 📋 待过 gate |

## Copilot 与 IA 收敛

| 文件 | 摘要 | 状态 |
|---|---|---|
| [2026-07-03-first-principles-redesign.md](2026-07-03-first-principles-redesign.md) | 第一性原理重构:对话主干 + 11→4 面 IA(T-063) | ✅ PASS 可开工 |
| [2026-07-03-first-principles-redesign.review.md](2026-07-03-first-principles-redesign.review.md) | first-principles-redesign(T-063)spec 的评审记录 | verdict PASS |
| [2026-07-03-copilot-skill-native-design.md](2026-07-03-copilot-skill-native-design.md) | Copilot Skill 化:技能管理面 + brief.fill + Skill 自感知(T-077) | ✅ PASS 可开工 |
| [2026-07-03-copilot-skill-native-design.review.md](2026-07-03-copilot-skill-native-design.review.md) | copilot-skill-native(T-077)spec 的评审记录 | verdict PASS |
| [2026-07-03-chat-session-scope-contract.md](2026-07-03-chat-session-scope-contract.md) | AI 助手会话作用域契约:入口级隔离与延续(T-096) | ✅ PASS 可开工 |
| [2026-07-03-context-layer-redesign.md](2026-07-03-context-layer-redesign.md) | Context 层统一重设计:全数据可达 + 人机同源双消费(T-099) | ✅ PASS 可开工 |
| [2026-07-04-ai-into-copilot-convergence.md](2026-07-04-ai-into-copilot-convergence.md) | 全站 AI 功能收敛进 Copilot:即时反馈+确认门进对话卡(T-103) | 📋 待过审 |
| [2026-07-04-ia-convergence-design.md](2026-07-04-ia-convergence-design.md) | IA 收敛:校准集成+知识库经验合并+任务中心改名(T-112/113/114) | ✅ PASS 可开工 |
| [2026-07-24-copilot-context-health-and-freshness.md](2026-07-24-copilot-context-health-and-freshness.md) | T-516「AI 对我的理解」:长期理解/动态事实/AI 推断分离 | ⚠️ CONCERNS(已处置)→进 CONTRACT |
| [2026-07-24-copilot-media-orchestration-optimization.md](2026-07-24-copilot-media-orchestration-optimization.md) | T-510 Copilot 媒体工具编排:高置信意图由系统路由 | ⛔ FAIL(三轮 blocker·退回 PLAN) |
| [2026-07-25-copilot-context-health-and-freshness-replacement.md](2026-07-25-copilot-context-health-and-freshness-replacement.md) | 替代稿:每轮事实校验+设置内低侵入治理+AI 只产候选+可审计撤销(替代 07-24 原稿,T-516) | ⛔ 独立评审 FAIL·待新评审 |
| [2026-07-25-copilot-media-orchestration-replacement.md](2026-07-25-copilot-media-orchestration-replacement.md) | 替代稿:抖音链接先只读 resolve 后建档,canonical 单 winner+取消与 ASR 副作用线性化(替代原媒体编排稿,T-510) | 独立评审 PENDING |
| [2026-07-26-copilot-context-health-minimal.md](2026-07-26-copilot-context-health-minimal.md) | 替代稿:收窄为设置页一张卡+账号级最新健康报告与四类确定性问题(收窄 T-516) | 📋 待过 gate |

## 素材与审核门

| 文件 | 摘要 | 状态 |
|---|---|---|
| [2026-07-03-material-capability-upgrade.md](2026-07-03-material-capability-upgrade.md) | 素材能力升级:真联网检索+自动截图+AI 生成三通路(T-084) | ✅ PASS 可开工 |
| [2026-07-03-content-review-gate.md](2026-07-03-content-review-gate.md) | 抖音合规双层审:违禁词 lint + 豆包语义审(T-086) | ⚠️ 已处置→可开工 |
| [2026-07-05-user-material-sovereignty-design.md](2026-07-05-user-material-sovereignty-design.md) | 用户上传素材主权:文档解析+最高权重+深度结合搜索(T-146) | 📝 待过 gate |
| [2026-07-11-web-session-vault-reader-design.md](2026-07-11-web-session-vault-reader-design.md) | 把读网页从 headless 截公开页图升级为带登录态抽正文全文,喂选题(T-217) | ✅ PASS 可开工 T-217a→b→c |
| [2026-07-15-publish-package-in-script-tab-design.md](2026-07-15-publish-package-in-script-tab-design.md) | 脚本 tab 接线 platform.adapt,一键生成单平台抖音发布物料并过审核(T-350) | — |

## Onboarding 与激活

| 文件 | 摘要 | 状态 |
|---|---|---|
| [2026-07-02-activation-single-user-design.md](2026-07-02-activation-single-user-design.md) | 激活码授权 + 本机单用户去登录模式设计 | ⏸️ 用户暂缓 |
| [2026-07-05-onboarding-checklist-design.md](2026-07-05-onboarding-checklist-design.md) | 新用户弹出式 onboarding checklist 引导页(T-131) | 📝 草案(待拍板+过 gate) |
| [2026-07-05-onboarding-guide-design.md](2026-07-05-onboarding-guide-design.md) | onboarding 增量:常驻清单+卡片定位+三档 scope(T-132) | — 增量 SPEC,免 gate |
| [2026-07-06-onboarding-guided-flow-design.md](2026-07-06-onboarding-guided-flow-design.md) | 新手引导从扁平清单改有序引导流,按新用户旅程带、含前置门与从零/存量分支(T-161) | 📋 待过 gate |
| [2026-07-06-p5-activation-gate-design.md](2026-07-06-p5-activation-gate-design.md) | 接已上线 activation-manager,给桌面壳做一机一码激活门,web/dev 不受影响(T-147 P5) | —(实现层,免 gate) |
| [2026-07-24-activity-license-security-assessment.md](2026-07-24-activity-license-security-assessment.md) | Thirdspace-activity 卡密系统安全核查:未达正式年卡 gate | —(安全核查·未达 release gate) |
| [2026-07-24-annual-renewal-growth-integration.md](2026-07-24-annual-renewal-growth-integration.md) | T-506 年卡与次年低价续费接入评估(growth×activity×CreatorOS) | ⚠️ CONCERNS(已处置)→进 CONTRACT |

## 多账号 · 桌面化

| 文件 | 摘要 | 状态 |
|---|---|---|
| [2026-07-15-account-full-isolation-spec.md](2026-07-15-account-full-isolation-spec.md) | 账号全域隔离:切号=切整个工作区,strict 门统一 + NOT NULL 收口 + 清库重来(T-332) | 📝 待 spec-review gate |
| [2026-07-05-multi-account-persona-design.md](2026-07-05-multi-account-persona-design.md) | 多抖音号=多独立人设的绑定/切换/管理(T-136) | 📝 待用户审(先出 SPEC) |
| [2026-07-05-desktop-app-architecture-overview.md](2026-07-05-desktop-app-architecture-overview.md) | 桌面化(Tauri)+ 资产保护(prompt/key 防泄漏)架构总纲(T-147) | 架构总纲,拆 P1–P6 |
| [2026-07-06-desktop-hardening-p6-design.md](2026-07-06-desktop-hardening-p6-design.md) | 把防篡改重打包+抬逆向门槛的加固沉淀成 desktop:package 流水线自动步骤(T-147 P6) | 📋 待过 gate |
| [2026-07-10-immutable-account-anchor-design.md](2026-07-10-immutable-account-anchor-design.md) | 每个抖音账户有系统生成、永不可变的 account id 作租户隔离唯一锚,昵称降为显示名(T-201) | ✅ PASS 可开工 T-201a~d |
| [2026-07-17-license-hardening-and-dual-platform-design.md](2026-07-17-license-hardening-and-dual-platform-design.md) | 激活码防破解加固+买断软校验+Mac/Windows 双端正式分发(T-372) | 📋 待过 gate |
| [2026-07-17-native-hardening-and-encrypted-logging-design.md](2026-07-17-native-hardening-and-encrypted-logging-design.md) | 发布前第二层:native 反调试/去单点化/自校验+日志信封加密只有我能解 | 📋 待过 gate |
| [2026-07-18-anti-ai-deception-maze-design.md](2026-07-18-anti-ai-deception-maze-design.md) | 反 AI 破解:纯被动静态诱饵欺骗迷宫+上下文污染,零功能影响(T-399) | ⚠️ CONCERNS(已处置)可开工 T-399a→b→c |
| [2026-07-18-channel-links-and-update-distribution-design.md](2026-07-18-channel-links-and-update-distribution-design.md) | 对外商业跳转按激活码渠道运行时下发+更新改版本检查跳渠道下载(T-396) | 📋 待过 gate |
| [2026-07-21-license-verdict-native-verdict-design.md](2026-07-21-license-verdict-native-verdict-design.md) | 授权判定消费点迁 Rust,verdict-bound token 签发,sidecar 无 token 起不来(T-451) | ⚠️ CONCERNS(已处置)可开工 T-451 |
| [2026-07-23-desktop-packaging-first-launch-design.md](2026-07-23-desktop-packaging-first-launch-design.md) | T-487 跨平台打包、运行时去重与零白屏首启候选架构 | 📋 待过 gate(正式构建须 Gate) |
| [2026-07-24-account-scoped-skill-isolation-design.md](2026-07-24-account-scoped-skill-isolation-design.md) | T-513 账号级 Skill 隔离、并发安全解析与存量迁移 | ⛔ FAIL(三轮·回 PLAN 重做) |
| [2026-07-24-account-skill-overlay-contract.md](2026-07-24-account-skill-overlay-contract.md) | T-513 账号增量 Skill 覆盖服务契约 | —(契约·Contract Gate PASS) |
| [2026-07-24-account-skill-overlay-replacement.md](2026-07-24-account-skill-overlay-replacement.md) | T-513 账号相对基座的增量 Skill 覆盖与执行快照隔离 | ⚠️ CONCERNS(已处置)→进 CONTRACT |
| [2026-07-25-one-click-issue-feedback.md](2026-07-25-one-click-issue-feedback.md) | 侧栏一键反馈:描述+多截图+加密日志上传 Thirdspace-growth support 得反馈编号,或本地导出(T-518) | accepted-risk·进 CONTRACT |
| [2026-07-26-bug-feedback-inbox.md](2026-07-26-bug-feedback-inbox.md) | 替代稿:不自建上传/工单/收件箱,只整理描述+诊断摘要并打开已配置 supportUrl(收窄 T-518) | 📋 待过 gate |

## 约束规格 · 流程 · 视觉修复

| 文件 | 摘要 | 状态 |
|---|---|---|
| [2026-07-06-product-to-code-orchestrator-v3-3-optimization.md](2026-07-06-product-to-code-orchestrator-v3-3-optimization.md) | product-to-code-orchestrator v3.3: 补业界调研借鉴,强化 Stitch/UI 可落地性、组件映射、物理架构、hook、docs/backlog 健康门卫 | 📝 草案(待审) |
| [2026-06-30-page-binding-spec.md](2026-06-30-page-binding-spec.md) | 制作/知识库/素材页控件级约束规格(稳定 ID + 处置项) | — binding 约束规格 |
| [2026-06-30-product-workflow-and-triage.md](2026-06-30-product-workflow-and-triage.md) | 业务飞轮梳理 + 假按钮 triage + 经验沉淀闭环缺口盘点 | — 未审(清理类) |
| [2026-06-14-frontend-visual-fidelity-repair-design.md](2026-06-14-frontend-visual-fidelity-repair-design.md) | 把前端 17 条路由修到贴合 ui/*.png 参考图的视觉校正 | — |
| [2026-07-23-t471-orchestrator-remediation.md](2026-07-23-t471-orchestrator-remediation.md) | T-483 恢复 orchestrator 门禁,补正 T-471 流程与追踪矩阵 | —(流程补正·用户已确认可实施) |
| [2026-07-26-overdesign-scope-reset.md](2026-07-26-overdesign-scope-reset.md) | 统一纠偏 T-516/517/518/519 四任务过度设计,删平台化能力+优先复用仓内地基(T-527) | — |

## 台账

| 文件 | 摘要 | 状态 |
|---|---|---|
| [REVIEW_LEDGER.md](REVIEW_LEDGER.md) | SPEC 审核台账:记录每份 SPEC 的 gate 裁决(durable 状态,hook 注入) | 台账(状态权威源) |

---

> 维护提示:新增 spec 时在对应主题分组追加一行 + 到 REVIEW_LEDGER 登记审核裁决。摘要一句话,状态以 REVIEW_LEDGER 为准。
