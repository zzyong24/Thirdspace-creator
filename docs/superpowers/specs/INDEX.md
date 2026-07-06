# SPEC 顶层索引(docs/superpowers/specs/)

> 本目录 **50 份** spec/评审记录的导航索引。每条 = 文件名 + 一句话摘要(取自各 spec 头部,非编造)+ 审核状态。
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

## AI 编排与模型配置

| 文件 | 摘要 | 状态 |
|---|---|---|
| [2026-06-21-ai-orchestration-agent-sdk-design.md](2026-06-21-ai-orchestration-agent-sdk-design.md) | 用 Claude Agent SDK 建统一可审计的 AI 执行层(候选-确认边界) | — |
| [2026-06-23-configurable-llm-design.md](2026-06-23-configurable-llm-design.md) | 纯 prompt 节点走供应商无关的可配置 LLM 薄抽象层(不写死 Agent SDK) | — |
| [2026-07-01-multimodal-model-config-and-recording-design.md](2026-07-01-multimodal-model-config-and-recording-design.md) | 多模态生图/生视频 model-config 抽象 + L5 录制阶段(T-020) | ⚠️ 已处置→可开工 |
| [2026-07-02-server-configurable-prompts-design.md](2026-07-02-server-configurable-prompts-design.md) | 提示词/skill 服务端可配可热更(接线既有 override 通道,T-040) | v1 ⛔→v2 ⚠️ 已处置→可开工 |

## 数据管线与采集

| 文件 | 摘要 | 状态 |
|---|---|---|
| [2026-06-30-data-foundation-and-director-chatbox-design.md](2026-06-30-data-foundation-and-director-chatbox-design.md) | 数据底座(已发布作品=历史项目)+ 上下文感知编导 ChatBox | ⚠️ canonical,已实现 |
| [2026-06-30-data-source-pipeline-design.md](2026-06-30-data-source-pipeline-design.md) | 通用「prompt+调度→唤醒 Agent」+ 自有数据周期采集(T-007) | ⚠️ re-review 已补清→可开工 |
| [2026-07-01-real-works-data-pipeline-v2-design.md](2026-07-01-real-works-data-pipeline-v2-design.md) | 真实作品数据管线2.0:逐字稿+创作链+评论+明细(T-030) | ⚠️ 已补清 F1–F4→可开工 |
| [2026-07-02-douyin-collection-throttle-design.md](2026-07-02-douyin-collection-throttle-design.md) | 抖音采集统一限流/退避子系统防封 IP/账号(T-038) | ⚠️ 已处置→可开工 |
| [2026-07-05-web-search-decoupling-design.md](2026-07-05-web-search-decoupling-design.md) | 联网搜索从模型内置工具解耦为自有检索层(T-126) | ⚠️ 已处置(现网已存在,范围塌缩) |

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

## 素材与审核门

| 文件 | 摘要 | 状态 |
|---|---|---|
| [2026-07-03-material-capability-upgrade.md](2026-07-03-material-capability-upgrade.md) | 素材能力升级:真联网检索+自动截图+AI 生成三通路(T-084) | ✅ PASS 可开工 |
| [2026-07-03-content-review-gate.md](2026-07-03-content-review-gate.md) | 抖音合规双层审:违禁词 lint + 豆包语义审(T-086) | ⚠️ 已处置→可开工 |
| [2026-07-05-user-material-sovereignty-design.md](2026-07-05-user-material-sovereignty-design.md) | 用户上传素材主权:文档解析+最高权重+深度结合搜索(T-146) | 📝 待过 gate |

## Onboarding 与激活

| 文件 | 摘要 | 状态 |
|---|---|---|
| [2026-07-02-activation-single-user-design.md](2026-07-02-activation-single-user-design.md) | 激活码授权 + 本机单用户去登录模式设计 | ⏸️ 用户暂缓 |
| [2026-07-05-onboarding-checklist-design.md](2026-07-05-onboarding-checklist-design.md) | 新用户弹出式 onboarding checklist 引导页(T-131) | 📝 草案(待拍板+过 gate) |
| [2026-07-05-onboarding-guide-design.md](2026-07-05-onboarding-guide-design.md) | onboarding 增量:常驻清单+卡片定位+三档 scope(T-132) | — 增量 SPEC,免 gate |

## 多账号 · 桌面化

| 文件 | 摘要 | 状态 |
|---|---|---|
| [2026-07-05-multi-account-persona-design.md](2026-07-05-multi-account-persona-design.md) | 多抖音号=多独立人设的绑定/切换/管理(T-136) | 📝 待用户审(先出 SPEC) |
| [2026-07-05-desktop-app-architecture-overview.md](2026-07-05-desktop-app-architecture-overview.md) | 桌面化(Tauri)+ 资产保护(prompt/key 防泄漏)架构总纲(T-147) | 架构总纲,拆 P1–P6 |

## 约束规格 · 流程 · 视觉修复

| 文件 | 摘要 | 状态 |
|---|---|---|
| [2026-06-30-page-binding-spec.md](2026-06-30-page-binding-spec.md) | 制作/知识库/素材页控件级约束规格(稳定 ID + 处置项) | — binding 约束规格 |
| [2026-06-30-product-workflow-and-triage.md](2026-06-30-product-workflow-and-triage.md) | 业务飞轮梳理 + 假按钮 triage + 经验沉淀闭环缺口盘点 | — 未审(清理类) |
| [2026-06-14-frontend-visual-fidelity-repair-design.md](2026-06-14-frontend-visual-fidelity-repair-design.md) | 把前端 17 条路由修到贴合 ui/*.png 参考图的视觉校正 | — |

## 台账

| 文件 | 摘要 | 状态 |
|---|---|---|
| [REVIEW_LEDGER.md](REVIEW_LEDGER.md) | SPEC 审核台账:记录每份 SPEC 的 gate 裁决(durable 状态,hook 注入) | 台账(状态权威源) |

---

> 维护提示:新增 spec 时在对应主题分组追加一行 + 到 REVIEW_LEDGER 登记审核裁决。摘要一句话,状态以 REVIEW_LEDGER 为准。
