# CreatorOS 任务看板(BACKLOG)

> **单一执行真相。每个会话必读(SessionStart hook 自动注入)。** 规则见 `CLAUDE.md` 的「任务流程铁律」。
> 状态:📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置 · ⛔ SPEC 审核 FAIL(没过审不准开工)。
> 读取顺序:**本看板 → 任务引用的 SPEC → 代码**。
> 铁律:需求即任务(提了就建);开工从看板顶取;做完改状态+提交;**禁止 P0/P1 分级、禁止多阶段执行**,任务清楚即起 Workflow/并行 subagent 一次做完。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

| ID | 任务 | 状态 | 文档 | 一句话 |
|---|---|---|---|---|
| T-013 | Harness 宪法 + 卡位 | ✅ | [产品定位.md](docs/产品定位.md) | 宪法立(docs/产品定位.md)+ 看板 + SessionStart hook + 执行策略入 CLAUDE.md + 固化进 orchestrator skill。done |
| T-012 | SPEC 审核 gate | 🔨 | orchestrator `prompts/spec-reviewer.md` | **机制已实战验证**:本会话跑了 2 轮独立评审 —— 第一轮逮 3 个真 bug(迁移撞号/video_type 矛盾/悬空引用,已裁决修复),第二轮把 T-007 的 data-source-pipeline SPEC 评为 FAIL(2 blocker,挡住大错)。reviewer 角色+findings schema 已定且有效。**剩(infra)**:接 MiniMax(spec.review capability,Agent 工具当前够不到 MiniMax,用 Claude 独立上下文代,已有效)+ "没过审不准开工" enforcement hook(目前靠人/Agent 手动查 SPEC 审核注,已挡住 T-007) |
| T-001 | 数据底座:已发布作品导入历史项目 | ✅ | [data-foundation-and-director-chatbox §1](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md) | `9010166` projects.source+platformRef+迁移0008+ensureImportedProject+refresh改;契约88+后端87+前端31绿。done |
| T-002 | B2 编导自动评分 | ✅ | [同上 §5](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md) | 真实指标 → 维度分 → 预填录入,人审核 |
| T-003 | 三方向读侧接真(底座→各模块) | 📋 数据卡 | [同上 §2](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md) | 校准/选题评论/定位/知识库/首页 读真,mock 让位。**部分卡在数据未采集**:真 imported 项目需用户真跑一次抖音 refresh(.auth/ 扫码登录);评论采集(选题 basis)未建;过往脚本知识库需 script 导入。**可做且不卡**:§1.4「优先读 source:imported 真值,fixture 兜底」接线机制(种 1 个 imported 测试项目即可验证)+ 首页/定位/复盘读真(只需作品+指标,T-001 已导)。评论/脚本两向待采集落地。**§1.4 优先读真接线 + 首页/复盘两向 done(commit)**:判据 `projectsService.hasImportedProjects`(source='imported' 非空,单一判据,放读层)→ composition root 三向读侧据此让位(`resolveImportedPublicationIds` 把作品级读收窄到真实导入作品的 publication 集);**首页驾驶舱**(最近发布按 imported 集过滤 + 播放/指标 `getDashboardRollup({publicationIds})` 收窄 + content_output 标题回退治"未命名发布")、**复盘**(`listSubjects` 待校准内容只列 imported 项目/作品)已让位;**定位诚实未接**——现状 `getPositioningCenter` 只读 profile/statement/keywords、根本不读作品 portfolio(账号级自我认知),接真 = 新建 portfolio 段(净增 feature,非 fixture 让位),与评论basis/知识库脚本同列待办。后端 §1.4 集成测 2 绿(真 refreshDouyin 链路种 imported,断言判据翻真+作品读让位+rollup 收窄+空集 all-zero)+ 前端集成测 2 绿(compositeTransport 打 pages.dashboard.get,兜底出 fixture 真标题 / 优先读真 fixture 让位)。**剩待采集才能做**:选题评论 basis(评论采集未建)、知识库过往脚本(script 未导入)。 |
| T-004 | ChatBox 进化(上下文感知) | 🔨 | [同上 §3](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md) | Copilot→useChat + ChatContext 三层注入 + 首波 5 工具 + 指挥/画布。**slice1+2 done**(commit):首波 5 工具全挂(topic.generate/topic.enrich + slice2 补 calibration.diagnose/review.analyze/positioning.generate,注册为 Vercel SDK tool,execute 复用各 runner 核心产**候选**非实体——诊断走通用维度盲评,经验/定位走直采门 createLearning/upsertProfile+createStatement)+ 4 surface skill(chatbox.topic/calibration/positioning/review 三位一体,registry 注册,project 暂复用选题编导)+ functionKey 叠加(按钮层把命中专用工具置顶到白名单首,越权工具不挂)+ 一键岛预调闭环(`?copilot=open&surface=&fn=` 深链:面板读 URL 装配 ChatContext + 空对话时自动发预调话术;接通 topics「在对话里出题」/calibration「对话诊断」/positioning/review 四处)+ generative UI(对话内按 kind 分发:选题候选卡/维度评分卡只读/经验卡逐条沉淀/定位卡整条采纳)。ai-worker tsc 净+73 测绿;前端 tsc 净 + server/ai+app+copilot 158 测绿 + 全量 813 测绿(流式 UI 真跑需 dev server+key,本环境未跑,用装配/渲染单测覆盖)。**剩**:二/三波工具(planning 三件套/script.draft/material.match/publish.platform_adapt)、project surface 深化。 |
| T-005 | Skill 三位一体 + 每轮 schema 约束 | ✅ | [同上 §4](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md) | `PromptTemplate` 加 `tools`+`outputSchema`;registry 升一等入口(`registerAllTemplates`/`getTools`/`resolveOutputSchema` 收口);`runStructuredNode` 从 registry 取 schema(不再手传);配置口子 `schema-bridge`(导出=zod v4 原生 `z.toJSONSchema`,回灌=ajv `Ajv2020`;`zod-to-json-schema` 在 v4 下吐空 schema 故弃)+`overrideTemplatesFromConfig`(JSON Schema 形式覆盖 system/template/tools/outputSchema,运行时套用不改代码);新增 `chatbox.topic` skill(两段 `{reply,candidates[],nextActions[]}` 脊梁)。ai-worker tsc 净+72 测绿(+12),前端 tsc 净+ai 60 测绿。done |
| T-006 | research.gather_material 迁 Vercel | ✅ | [同上 §6](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md) | 去最后一个 Claude Agent SDK 依赖 + 门卫断言 |
| T-007 | 任务调度系统 + 调度页面 | ⛔ FAIL | [data-source-pipeline-design](docs/superpowers/specs/2026-06-30-data-source-pipeline-design.md) | **SPEC 审核 gate 裁决 FAIL(2 blocker),没过审不准开工(铁律)。** ① 采集底座押 connectOverCDP 已被 `53efbb7` 弃用(应 launchPersistentContext)② 新建 self_work/self_metric_snapshot 撞已 ✅ 的 T-001 数据归属(应复用 projects:imported)。+3 major(Sfix 修不存在的 bug、迁移号缺(下一个 0009)、未对账 ai_tasks 队列另起 job_run)。**需用户拍板:对标博主采集是否纳入本期(positioning 风险)。** 重写 SPEC→再过审→才开工。详见 SPEC 顶部裁决注 |
| T-008 | 横竖屏:平台退回发布层 | ✅ | [project-lifecycle-0to1-spec](docs/superpowers/specs/2026-06-30-project-lifecycle-0to1-spec.md) | `6db68d8` SKL-08 立项不强制平台 + SKL-09 关系表为唯一真值(patch 同步,jsonb 降级镜像)+ §8 发布层手动加平台/标签真增删。契约88+后端85+前端461绿。done |
| T-009 | SEAM-01/02/04 策划→脚本上下文 + 章节溯源 | ✅ | [project-lifecycle-0to1-spec](docs/superpowers/specs/2026-06-30-project-lifecycle-0to1-spec.md) | 阶段交接缝(原 #186)。SEAM-01 策划产物(论点树+合同+结构方案)经 OutlineReader/Thesis/Contract 端口注入 script.draft 上下文(模板 v2);SEAM-02 脚本"大纲"区 loadPlanningOutline 读 content_outline;SEAM-04 production_segments.script_section_id 真填(契约+服务+仓库透传,前端按位置对应脚本段)。后端766+契约88+前端528绿。SEAM-03/05 未动。done |
| T-010 | 误导文案 / 桩字段清扫 | ✅ | [product-workflow-and-triage](docs/superpowers/specs/2026-06-30-product-workflow-and-triage.md) | 复核现状后:导出按钮真禁用+标"规划中"(去掉"看着导出成功实没生成视频"的 mock 流程);AI 数字人卡加"规划中·敬请期待"徽标;项目概览假副标题"全面解析 AI Native Browser…"+假元信息(Kevin.Z/2024-05-10/14:30)改读真 projects.brief + 真 stage/updatedAt 派生;复盘页 3 个 decorative 按钮(查看全部/添加发布/生成复盘报告)加"规划中"标注+tooltip。**时间线章节保持(T-009 已真持久化,未误伤)**。前端 756 绿。done |
| T-011 | CollabField 候选逐字内联编辑(COLLAB-01) | ✅ | [同 ChatBox §human-in-loop](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md) | 采纳前可就地改字段(不只逐条删)。`AdoptCandidateCard` 加 `edits: Map<number, Partial<T>>` + `ItemEditor<T>` 句柄(renderItem 第三参,canEdit 才给);采纳时 `kept = rawItems.map(merge edits).filter(!removed)` 走**同一条** `patchTaskResultItems` 落库再 confirm —— 删与改统一 patch 路径,不互斥。门同 COLLAB-02(rawItems↔items 1:1 才开放,否则只读降级)。gather-material(title/why_relevant)+ 选题会 CandidateRow(title/angle)渲成受控 Input/Textarea。前端 tsc 净 + ai/topics 22 绿。done |

## ✅ 已完成(粗粒度,倒序)

| 任务 | 文档 |
|---|---|
| 抖音采集重写(launchPersistentContext + 扫码登录,去 connectOverCDP)+ http-transport 错误透传 | [douyin-collection-approach(memory)] |
| 飞轮 FLY-02(后端建真 run 保 §C-4 + computeDeviation 修 + 前端录入表单) | data-foundation §5 |
| 编导起草(一句话→AI 补全选题卡,填表→审稿) | data-foundation §3 |
| 横竖屏(画幅 enum + 立项工作台 + 喂写文案 AI) | project-lifecycle-0to1-spec |
| CollabField COLLAB-02(候选逐条可删,采纳前 patch) | project-lifecycle-0to1-spec |
| 脊柱-1 提示词模板系统 + 8 AI 节点迁 Vercel SDK + 步骤日志 | project-lifecycle-0to1-spec |
| brief 立项阶段 + 工作台 | project-lifecycle-0to1-spec |
| 选题中心三栏 + 4 出题 + 富候选卡 + enrich | (选题中心大改) |
| 校准中心三栏 + 维度评分 + 盲预测 | (校准中心大改) |
| 定位中心(9 facet + 规则卡 + 居中弹窗) | (定位中心大改) |
| 数据持久化 PG + 对象存储 MinIO + 模型配置(可切模型) | p1-persistence-foundation-design |
| 真实抖音 fixture(46 作品 + 创作链 + 账号画像) | (导出真实抖音数据) |
| Dashboard 飞轮驾驶舱 + 脚本编辑器 + Copilot 全局助手 + 各页读侧做真 | (Wave 1-4) |
| 学习系统 / 内容合成 / 平台账号 / 内容日历 / 用料链 / 素材库 / 阶段状态机 | (各模块垂直切片) |
| 变现中心移除 | (产品定调) |

> 注:历史里的 180+ 条微任务已归档到上面粗粒度条目;细节见 git log 与各 SPEC。
