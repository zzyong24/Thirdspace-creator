# CreatorOS Vision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 分阶段实现 CreatorOS 的完整个人创作闭环，同时保持 Project、ContentOutput、Artifact、Publication 和 Learning 等核心模型稳定。

**Architecture:** PostgreSQL 作为业务真相源，S3 兼容对象存储承载媒体文件，PostgreSQL 全文检索和 pgvector 提供搜索。系统按领域垂直切片交付，每个阶段都包含数据库、领域服务、API、页面和验收，不先构建孤立的“基础平台”。

**Tech Stack:** Next.js App Router、Node.js 24 LTS、TypeScript strict、Tailwind CSS、shadcn/ui、PostgreSQL 16、S3-compatible object storage、pgvector、外置 Skill/脚本 Ingestion API。前端文件级执行以 `frontend/TDD-PLAN.md` 为准，后端文件级执行以 `backend/TDD-PLAN.md` 为准；本计划只维护跨领域阶段和产品验收边界。

---

## 1. 建议代码边界

以下是框架无关的建议目录。落地时可映射到所选框架，但不要改变领域边界。

```text
src/
├── identity/
├── projects/
├── workflow/
├── artifacts/
├── knowledge/
├── assets/
├── production/
├── publishing/
├── analytics/
├── reviews/
├── learnings/
├── ai/
├── ingestion/
├── search/
└── notifications/

database/
├── migrations/
├── seeds/
├── views/
└── policies/

tests/
├── domain/
├── api/
├── ingestion/
└── integration/
```

每个领域目录负责自己的实体、规则、服务和 API。Dashboard、发布中心和搜索只读取领域数据，不拥有重复实体。

## 2. 计划拆分

完整愿景包含多个独立子系统，不适合写成一个巨型文件级计划。实施时应依次生成以下子计划：

1. Project 与固定工作流
2. Artifact 与不可变版本
3. 知识、素材与搜索
4. Script 与结构化内容
5. Production 与对象存储
6. Publication 与外部写入
7. Analytics、Review 与 Learning
8. AI Copilot 与系统设置

## Phase 0：工程与数据基础

**交付结果：** 可运行的数据库、对象存储和身份隔离基础。

- [ ] 按前后端 SPEC 锁定依赖版本、建立 Git 仓库和实现 worktree。
- [ ] 建立 PostgreSQL、迁移工具和测试数据库。
- [ ] 启用 UUID、JSONB、全文检索、pg_trgm 和 pgvector。
- [ ] 建立对象存储开发环境和签名 URL 服务。
- [ ] 实现 User、UserPreference 和用户级数据隔离。
- [ ] 定义通用时间字段、归档字段、幂等键和审计约定。
- [ ] 建立数据库备份、对象存储版本控制和本地恢复演练。

**验收：**

- 两个测试用户无法读取彼此数据。
- 数据库迁移可从空库完整执行并回滚。
- 文件上传后数据库只保存元数据，对象存储保存二进制。
- 备份可以恢复到新的测试环境。

## Phase 1：Project 与工作流

**覆盖页面：** Dashboard、Projects、New Project、Project Overview。

**核心实体：**

- Project
- ProjectRelation
- ProjectStage
- ContentOutput
- OutputStage
- Task
- Milestone
- ProjectActivity

**交付步骤：**

- [ ] 实现 Project 创建、编辑、暂停、完成和归档。
- [ ] 实现 Project 的系列、延续、派生和相关关系。
- [ ] 创建 Project 时自动生成六个固定阶段。
- [ ] 实现 ProjectTargetPlatform 平台意向。
- [ ] 实现阶段开始、完成、跳过、阻塞和恢复。
- [ ] 实现 ContentOutput 的视频、图文和音频类型。
- [ ] 创建 Output 时自动生成后四阶段。
- [ ] 实现 Project 总进度和当前阶段聚合。
- [ ] 实现 Task、Milestone 和 ProjectActivity。
- [ ] 实现项目列表筛选、排序和最近项目查询。
- [ ] 实现 Dashboard 的进行中项目和待办聚合。

**验收：**

- 用户可以完成“新建项目 → 研究 → 策划 → 创建两个 Output”的流程。
- 两个 Output 的后四阶段可以独立推进。
- 项目进度与阶段状态一致，跳过状态不会显示成普通完成。
- 归档项目不会出现在进行中列表，但可被搜索和恢复。

## Phase 2：Artifact 与版本

**覆盖页面：** Project Overview、Research、Planning、Script 的文档基础。

**核心实体：**

- Artifact
- ArtifactVersion
- ArtifactRelation
- ThesisNode
- ScriptSection
- EvidenceLink
- TimelineSegment

**交付步骤：**

- [ ] 实现 Artifact 创建、归档和状态流转。
- [ ] 实现不可变 ArtifactVersion 与 current_version 指针。
- [ ] 实现自动保存草稿和显式创建版本。
- [ ] 实现版本列表、版本比较和恢复旧版本。
- [ ] 实现 Project 共享产物与 Output 专属产物。
- [ ] 实现 derived_from、references、supports 和 summarizes 关系。
- [ ] 实现 ThesisNode 和 ScriptSection 的顺序及树结构。
- [ ] 保证恢复旧版本时结构化子表一并恢复。

**验收：**

- 更新产物不会修改历史版本。
- Output 脚本可以派生自主脚本并保持可追溯关系。
- 删除当前内容不影响旧版本读取。
- 论点树和脚本章节在版本切换后完整一致。

## Phase 3：知识、素材与搜索

**覆盖页面：** Knowledge & Memory、Assets Center、Search。

**核心实体：**

- KnowledgeItem / KnowledgeRevision / KnowledgeRelation
- Asset / AssetFile
- ProjectKnowledge / ProjectAsset
- ArtifactKnowledge / ArtifactAsset
- Tag / EntityTag
- SearchHistory

**交付步骤：**

- [ ] 实现知识独立创建、从项目沉淀和跨项目引用。
- [ ] 实现知识版本和知识关系。
- [ ] 实现素材上传、文件版本、缩略图和媒体元数据。
- [ ] 实现素材收藏、回收站和引用检查。
- [ ] 实现 Project、Artifact 和 Output 的资源关联。
- [ ] 实现标签管理和标签筛选。
- [ ] 建立全文、模糊和语义搜索索引。
- [ ] 实现可从业务数据重建的 SearchDocument。
- [ ] 实现统一搜索结果和搜索历史。
- [ ] 实现存储空间统计。

**验收：**

- 同一个知识或素材可以被多个 Project 使用且不复制。
- 替换素材文件不会破坏旧项目引用。
- 搜索可按类型、项目、来源、标签和时间过滤。
- 删除被引用素材时系统会阻止物理删除或进入保留期。

## Phase 4：Research、Planning 与 Script

**覆盖页面：** Research Workspace、Planning Workspace、Script Workspace。

**交付步骤：**

- [ ] 配置研究和策划阶段的 Artifact 类型。
- [ ] 实现研究资料收集、研究笔记和证据引用。
- [ ] 实现竞品、趋势、市场和受众分析产物。
- [ ] 实现内容合同和核心张力。
- [ ] 实现论点树、证据地图和内容大纲。
- [ ] 实现主脚本与 Output 适配脚本。
- [ ] 实现 ScriptSection 时间码、层级和排序。
- [ ] 实现金句、版本记录和 AI 建议的候选采纳流程。
- [ ] 实现“进入下一步”对阶段状态和任务的影响。

**验收：**

- 一条证据可以追溯到知识或素材来源。
- 一个 Project 可以生成一份主脚本和多个适配脚本。
- AI 建议不会在用户确认前覆盖当前版本。
- Research 与 Planning 共享，Output 脚本独立。

## Phase 5：Production

**覆盖页面：** Production Workspace、Assets Center。

**核心实体：**

- Production
- ProductionSegment
- SegmentAsset
- ExportRecord
- OutputAsset

**交付步骤：**

- [ ] 实现真人口播、知识演示和 AI 数字人制作模式。
- [ ] 实现脚本章节到制作片段的映射。
- [ ] 实现 B-roll、图片、视频、音频和贴纸素材使用。
- [ ] 实现录制、字幕和导出配置。
- [ ] 实现导出记录和导出状态。
- [ ] 将成功导出的文件登记为 Asset 和 OutputAsset。
- [ ] 实现 ContentOutput 主成品切换。
- [ ] 实现预览所需的代理文件和缩略图。

**验收：**

- 制作时间线可以追溯到脚本章节和素材。
- 多次导出均保留记录，当前成品可切换。
- 导出失败不会破坏 Production 或已有成品。
- 原始文件、代理文件和导出文件具有清晰关系。

## Phase 6：Publishing 与外部写入

**覆盖页面：** Publishing Workspace、Publishing Center。

**核心实体：**

- Publication
- PublicationRevision
- ExternalSource
- IngestionRun
- IngestionError

**交付步骤：**

- [ ] 实现一个 Output 对应多个 Publication。
- [ ] 实现平台标题、简介、封面、标签和设置版本。
- [ ] 实现手动登记发布链接和发布时间。
- [ ] 定义 Publication 外部写入 API。
- [ ] 实现 ExternalSource 注册和令牌隔离。
- [ ] 实现幂等写入、批次统计和逐条错误。
- [ ] 实现发布中心的跨项目查询。
- [ ] 实现发布状态变化的 ProjectActivity 和 Notification。

**验收：**

- 同一成品可以登记在多个平台发布。
- 相同幂等键重复提交不会产生重复 Publication。
- 批量写入部分失败时，成功记录保留，失败记录可重试。
- 发布中心数据完全来自 Publication 聚合。

## Phase 7：Analytics、Review 与 Learning

**覆盖页面：** Analytics & Review、Experience Center、Dashboard 数据卡片。

**核心实体：**

- MetricSnapshot
- MetricValue
- RetentionPoint
- AudienceSnapshot
- Review / ReviewPublication / ReviewInsight
- Learning / LearningApplication

**交付步骤：**

- [ ] 定义跨平台标准指标字典。
- [ ] 实现原始指标和标准指标同时入库。
- [ ] 实现指标表按时间分区和保留策略。
- [ ] 实现平台、内容和时间窗口聚合。
- [ ] 实现留存曲线和受众维度查询。
- [ ] 实现 Project 与 Output 两种 Review。
- [ ] 实现成功、问题和行动洞察。
- [ ] 实现洞察提升为 Learning。
- [ ] 实现 Learning 在新项目中的应用和效果记录。
- [ ] 实现经验中心的类型、验证状态和热门排序。

**验收：**

- 同一平台快照重复写入不会重复计数。
- 整体、平台、观众、内容和对比分析使用一致数据。
- Review 明确记录所覆盖的 Publication 和时间范围。
- Learning 可以跨项目复用并记录验证结果。

## Phase 8：AI Copilot 与系统设置

**覆盖页面：** AI Chat、Settings、Notifications。

**核心实体：**

- AIConversation / AIMessage
- AITask / AITaskReference / AITaskResult
- ModelConfiguration
- AgentConfiguration
- Notification

**交付步骤：**

- [ ] 实现对话、消息和项目上下文。
- [ ] 实现 AI 任务状态和失败恢复。
- [ ] 实现 AI 读取 Project、Artifact、Knowledge 和 Asset 引用。
- [ ] 实现 AI 候选结果到正式业务实体的确认流程。
- [ ] 实现模型能力配置和 secret reference。
- [ ] 实现 Agent 能力配置，执行仍通过外置 Skill 或服务。
- [ ] 实现通知读取、未读计数和实体跳转。
- [ ] 实现用户偏好、自动保存和文件命名规则。
- [ ] 实现账户数据导出和删除流程。

**验收：**

- 每个 AI 生成结果都能追溯到任务、输入引用和模型。
- AI 失败不会覆盖或损坏正式产物。
- 用户确认前，AI 输出只作为候选结果存在。
- 账户删除能够清理数据库、搜索索引和对象存储。

## 3. 跨阶段测试策略

每个子计划都必须包含：

- 领域规则单元测试。
- 数据库约束和迁移测试。
- API 身份隔离测试。
- 外部写入幂等和部分失败测试。
- 对象存储上传、替换、删除和恢复测试。
- Artifact 不可变版本测试。
- 从 Project 创建到 Learning 沉淀的端到端测试。

最终端到端验收场景：

```text
创建 Project
→ 完成研究与策划
→ 创建视频和图文两个 Output
→ 生成主脚本及两个适配脚本
→ 为视频导出成品
→ 创建三个 Publication
→ 外置 Skill 写入指标
→ 创建 Review
→ 将洞察提升为 Learning
→ 在新 Project 中复用该 Learning
```

## 4. 实施原则

1. 先实现稳定领域身份，再实现页面聚合视图。
2. 不为 Dashboard、发布中心和搜索复制业务数据。
3. 所有正式内容通过版本或审计记录保留历史。
4. 平台差异进入 JSONB，但跨平台核心指标必须标准化。
5. 外部脚本只能通过幂等写入契约修改数据。
6. 每个 Phase 都必须独立可运行、可测试、可演示。
7. 不直接执行本主计划；前端使用 `frontend/TDD-PLAN.md`，后端使用 `backend/TDD-PLAN.md`，后续领域阶段再生成独立的文件级 TDD 计划。
