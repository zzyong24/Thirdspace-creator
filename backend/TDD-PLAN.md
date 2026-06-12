# CreatorOS Backend TDD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在一个 Next.js / Node.js 模块化单体中，以测试先行方式实现 CreatorOS 后端领域模块、API、数据库和外部写入契约。

**Architecture:** 所有模块运行在一个 Next.js 应用和一个 PostgreSQL 中。每个模块拥有自己的 service、repository、schema、types 和 tests；模块之间仅通过公开 service 协作，并通过自动化架构测试禁止跨模块 repository 访问。

**Tech Stack:** Next.js App Router、TypeScript strict、PostgreSQL 16、Drizzle ORM、Zod、Vitest、Testcontainers、S3-compatible storage、pgvector。

---

## 0. 路径约定

本计划中的所有相对路径均相对于：

```text
/Users/zyongzhu/Workbase/Thirdspace-creator/backend
```

例如 `src/server/modules/projects/projects.service.ts` 的绝对位置是：

```text
/Users/zyongzhu/Workbase/Thirdspace-creator/backend/src/server/modules/projects/projects.service.ts
```

## 1. TDD 强制规则

每个行为必须按以下顺序实现：

1. 写一个描述业务行为的失败测试。
2. 运行测试，确认因缺少行为而失败。
3. 写最小实现。
4. 运行目标测试，确认通过。
5. 运行模块测试，确认无回归。
6. 只在全绿后重构。
7. 提交一个可独立理解的 commit。

禁止：

- 先写实现再补测试。
- 测试第一次运行就通过。
- 只 mock repository 而从不做数据库集成测试。
- 在一个测试中验证多个不相关行为。
- 为让测试通过而修改正确的业务要求。

## 2. 测试分层

| 层 | 目标 | 数据库 | 外部依赖 |
|---|---|---|---|
| Architecture | 模块依赖规则 | 否 | 否 |
| Service unit | 业务规则和 service 协作 | Fake repository | Fake service |
| Repository integration | SQL、约束、事务、映射 | Testcontainers PostgreSQL | 否 |
| Contract | Zod、DTO、错误码 | 可选 | 否 |
| Route integration | Auth、HTTP、service 调用 | Test DB | Fake external adapters |
| Workflow integration | 跨模块用例 | Test DB | Fake object storage / AI |
| End-to-end | 核心创作闭环 | Test DB | Local adapters |

目标不是追求覆盖率数字，而是确保：

- 所有状态转换有测试。
- 所有所有权边界有测试。
- 所有幂等写入有测试。
- 所有不可变版本规则有测试。
- 所有跨模块调用有架构测试。

最低覆盖门槛：

- service statements 90%
- repository statements 85%
- branch coverage 80%
- 状态机和安全规则 100% 行为覆盖

## 3. 测试目录

```text
src/server/modules/{module}/
├── {module}.service.test.ts
├── {module}.repository.integration.test.ts
└── {module}.contract.test.ts

src/test/
├── architecture/
│   ├── module-boundaries.test.ts
│   ├── route-boundaries.test.ts
│   ├── repository-boundaries.test.ts
│   └── dependency-cycles.test.ts
├── integration/
│   ├── project-lifecycle.test.ts
│   ├── content-production.test.ts
│   ├── publishing-metrics.test.ts
│   ├── review-learning.test.ts
│   └── ai-confirmation.test.ts
├── fixtures/
└── helpers/
```

## 4. 测试运行命令

计划中的标准命令：

```bash
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:architecture
pnpm test:contracts
pnpm test:e2e
pnpm lint
pnpm typecheck
```

每个实现任务必须至少运行：

```bash
pnpm vitest run <target-test-file>
pnpm vitest run src/server/modules/<module>
```

阶段完成必须运行全量：

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## 5. Phase 0：工程骨架与架构守卫

### Task 0.1：初始化 Next.js 后端工程

**计划文件**

- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `drizzle.config.ts`
- `.env.example`
- `src/server/composition-root.ts`

**RED**

- 测试无法加载服务端模块。
- 测试数据库 helper 不存在。

**GREEN**

- TypeScript strict。
- Vitest 可运行。
- Testcontainers 可启动 PostgreSQL。
- composition root 可被测试加载。

### Task 0.2：建立模块模板

**计划文件**

- `src/server/modules/_template/module.service.ts`
- `src/server/modules/_template/module.repository.ts`
- `src/server/modules/_template/module.schema.ts`
- `src/server/modules/_template/module.db-schema.ts`
- `src/server/modules/_template/module.types.ts`
- `src/server/modules/_template/module.service.test.ts`
- `src/server/modules/_template/module.repository.integration.test.ts`
- `src/server/modules/_template/index.ts`

**测试行为**

- 一个模块可通过 `index.ts` 暴露 service interface。
- repository 不从 `index.ts` 导出。

### Task 0.3：架构测试

**计划文件**

- `src/test/architecture/module-boundaries.test.ts`
- `src/test/architecture/route-boundaries.test.ts`
- `src/test/architecture/repository-boundaries.test.ts`
- `src/test/architecture/dependency-cycles.test.ts`
- `.dependency-cruiser.cjs`
- `eslint.config.mjs`

**测试行为**

1. Module A 导入 Module B repository 时失败。
2. Route 导入 repository 时失败。
3. Repository 导入其他模块时失败。
4. 模块绕过 `index.ts` 深层导入时失败。
5. 模块依赖图出现循环时失败。
6. shared 出现 ProjectStage 等领域类型时失败。

## 6. Phase 1：Identity、Settings 与基础设施

### Identity

**计划文件**

- `src/server/modules/identity/identity.service.ts`
- `src/server/modules/identity/identity.repository.ts`
- `src/server/modules/identity/identity.schema.ts`
- `src/server/modules/identity/identity.db-schema.ts`
- `src/server/modules/identity/identity.types.ts`
- `src/server/modules/identity/identity.service.test.ts`
- `src/server/modules/identity/identity.repository.integration.test.ts`

**Service RED 用例**

- 当前请求无用户时返回 AuthenticationError。
- User A 不能读取 User B。
- 不存在资源和不属于当前 User 均表现为 NotFound。

**Repository RED 用例**

- email 唯一。
- userId 查询始终返回单一用户。

### Settings

**Service RED 用例**

- 新用户获得默认偏好。
- 修改偏好只影响当前用户。
- 同一 capability 只能有一个默认模型。
- secret 只能保存 reference。
- Agent 配置停用后不能被 AI 任务选择。

### Infrastructure

**测试行为**

- UnitOfWork 在异常时回滚所有数据库写入。
- Clock 和 IdGenerator 可在测试中替换。
- signed URL 有过期时间且不包含 secret。
- 日志脱敏 signed URL 和 token。

## 7. Phase 2：Projects

**计划文件**

- `src/server/modules/projects/projects.service.ts`
- `src/server/modules/projects/projects.repository.ts`
- `src/server/modules/projects/projects.schema.ts`
- `src/server/modules/projects/projects.db-schema.ts`
- `src/server/modules/projects/projects.types.ts`
- `src/server/modules/projects/projects.errors.ts`
- `src/server/modules/projects/projects.service.test.ts`
- `src/server/modules/projects/projects.repository.integration.test.ts`
- `src/server/modules/projects/projects.contract.test.ts`

### Service RED 用例

1. 创建 Project 自动创建六个固定 ProjectStage。
2. 平台意向不自动创建 Publication。
3. ProjectRelation 不能关联自身。
4. ProjectRelation 两端必须属于同一 User。
5. 阶段可完成、阻塞、跳过和恢复。
6. 不允许未知阶段。
7. 创建 ContentOutput 自动创建后四个 OutputStage。
8. Project 没有 Output 时不能进入 Script。
9. 一个 Output 的阶段变化不影响其他 Output。
10. Project 后四阶段进度是所有有效 Output 的聚合。
11. 跳过阶段计入总进度但保留 skipped 状态。
12. 至少一个 Publication 已发布时 Output 可进入 published。
13. cancelled Output 不参与 Project 进度。
14. archived Project 只读。
15. Project 更新、阶段变化和任务完成创建 ProjectActivity。

### Repository RED 用例

- 同一 Project 同一阶段唯一。
- 同一 Output 同一阶段唯一。
- 同一 Project 同一目标平台唯一。
- 归档项目默认不出现在 active list。
- 所有查询包含 userId 条件。
- 分页、状态筛选和更新时间排序稳定。

### Route RED 用例

- 非法 body 返回 400。
- 其他用户 Project 返回 404。
- 合法创建返回 201 和六阶段摘要。
- 状态冲突返回 409。

## 8. Phase 3：Artifacts

### Service RED 用例

1. 创建 Artifact 时创建初始不可变版本。
2. 更新内容创建新版本，不修改旧版本。
3. current_version_id 始终指向同一 Artifact。
4. 恢复旧版本会复制为新版本。
5. Output Artifact 必须属于同一 Project。
6. output_script 可 derived_from master_script。
7. relation 两端必须属于当前 User。
8. ThesisNode 父节点必须属于同一版本。
9. ScriptSection position 在版本内唯一。
10. EvidenceLink 必须至少引用 Knowledge 或 Asset。
11. Evidence 引用必须通过对应 service 验证所有权。
12. AI candidate 未确认前不能成为 current version。
13. archived Artifact 不允许创建新版本。

### Repository RED 用例

- `(artifact_id, version_number)` 唯一。
- 旧 ArtifactVersion 更新失败。
- 结构化子项随版本读取。
- 恢复版本不覆盖历史记录。

### Workflow 集成

- Project master script 创建。
- Output script 从 master script 派生。
- 更新 Output script 不修改 master script。

## 9. Phase 4：Knowledge、Taxonomy 与 Search

### Knowledge Service RED 用例

- Knowledge 可脱离 Project 创建。
- Knowledge 可关联多个 Project。
- Knowledge revision 不可变。
- KnowledgeRelation 不能指向自身。
- Artifact 引用 Knowledge 时保留 citation note。
- 归档 Project 不删除 Knowledge。

### Taxonomy Service RED 用例

- 同一 User 标签名称唯一。
- 调用方未验证 entity 时拒绝 assignment command。
- 删除 Tag 只删除 assignment，不删除业务实体。
- User A 标签不能赋给 User B 实体。

### Search Service RED 用例

- upsert 使用 `(userId, entityType, entityId)` 唯一键。
- 同一实体更新替换旧索引内容。
- 关键词、模糊和向量结果按统一 DTO 返回。
- User A 搜索不到 User B 文档。
- 删除 SearchDocument 不影响业务数据。
- 索引失败进入 SearchRetry。
- rebuildUserIndex 可幂等执行。

### Repository RED 用例

- Knowledge revision 唯一。
- SearchDocument 唯一。
- pgvector 和 FTS 查询均限制 userId。

## 10. Phase 5：Assets 与对象存储

### Service RED 用例

1. createUpload 只创建 pending upload，不创建完成文件。
2. completeUpload 校验 checksum、size 和 MIME。
3. 不合格上传不能创建 AssetFile。
4. 新文件版本不覆盖旧文件。
5. 同一 Asset 只能有一个 current_file_id。
6. Asset 可独立存在并被多个 Project 使用。
7. 被引用 Asset 进入回收站但不立即物理删除。
8. 恢复 Asset 恢复原关联。
9. Production、Publishing、AI、Ingestion 只能通过 AssetsService 注册文件。
10. Storage Usage 等于当前 User 文件大小聚合。

### Object Storage Adapter RED 用例

- signed upload URL 使用临时 key。
- complete 前对象必须存在。
- checksum 不匹配时暂存对象进入清理列表。
- 删除失败记录重试，不伪装成功。

### Route RED 用例

- 上传初始化返回 signed URL 和 uploadId。
- complete 重复调用保持幂等。
- 其他用户 uploadId 返回 404。

## 11. Phase 6：Production

### Service RED 用例

- 一个 Output 最多一个当前 Production。
- Production 的 Output 必须归属当前 User。
- ScriptSection 通过 ArtifactsService 校验。
- SegmentAsset 通过 AssetsService 校验。
- Timeline 方案复制为实际 ProductionSegment，不修改 ArtifactVersion。
- 导出请求创建 pending ExportRecord。
- 导出完成通过 AssetsService 创建成品 Asset。
- 导出完成可设置 Output primary asset。
- 导出失败不修改已有 primary asset。
- 多次导出保留全部记录。

### Repository RED 用例

- 一个 Output 当前 Production 唯一。
- segment position 稳定。
- export 状态转换具有并发保护。

### 集成用例

- ScriptSection → ProductionSegment → ExportRecord → Asset → Output primary asset。

## 12. Phase 7：Publishing 与 Ingestion

### Publishing Service RED 用例

- 一个 Output 可创建多个 Publication。
- 同平台可有多个发布实例，但 external_id 唯一。
- PublicationRevision 不可变。
- cover asset 必须通过 AssetsService 校验。
- scheduled 需要 scheduled_at。
- published 需要 published_at 或外部发布事实。
- removed 保留历史 Revision 和指标引用。
- Publishing Center 按时间、平台和状态筛选。

### Ingestion Service RED 用例

1. ExternalSource secret 验证失败返回 AuthenticationError。
2. 同一 source 与 idempotency key 只创建一个 Run。
3. 同一 run 与 record key 只处理一次。
4. 重复请求返回第一次结果。
5. 指标导入先通过 PublishingService 解析 Publication。
6. Ingestion 不直接写 AnalyticsRepository。
7. 批次允许部分成功。
8. 失败记录保存错误码和 payload。
9. completeRun 汇总 received、written、rejected。
10. 已完成 Run 不再接受新记录。

### Route RED 用例

- 缺少 source token 返回 401。
- payload 超限返回 400 或 413。
- 部分成功返回批次摘要。
- 重复提交返回相同 runId。

## 13. Phase 8：Analytics

### Service RED 用例

- MetricSnapshot 只能追加。
- 同 publication、source、captured_at 幂等。
- 未知 metric key 被拒绝或进入 raw-only 状态。
- raw_metrics 原样保存。
- normalized metrics 使用统一单位。
- RetentionPoint position 不能为负。
- AudienceSnapshot 百分比范围为 0 到 100。
- Project 聚合只包含指定时间范围 Publication。
- removed Publication 历史指标仍可查询。
- User A 无法查询 User B 指标。

### Repository RED 用例

- 月分区路由正确。
- metric 唯一约束生效。
- 时间范围和平台聚合结果准确。
- 空时间窗口返回零值而非 null。

### Contract RED 用例

- Dashboard metrics DTO 与前端指标卡字段一致。
- Analytics 页面七项核心指标全部存在。
- 图表序列按时间升序。

## 14. Phase 9：Reviews 与 Learnings

### Reviews Service RED 用例

- Review 必须属于 Project 或 Output。
- Output Review 的 Output 必须属于 Project。
- Review 时间范围合法。
- ReviewPublication 必须属于 Review Project。
- completeReview 前至少有一个 summary Insight。
- completed Review 只读。
- report Artifact 通过 ArtifactsService 创建。

### Learnings Service RED 用例

- Learning 可手动创建。
- ReviewInsight 可提升为 Learning。
- 同一 Insight 不能重复提升。
- Learning 可应用于多个 Project。
- Application Project 必须属于当前 User。
- evaluated outcome 更新验证状态。
- archived Project 不删除 Learning。
- 热门排序基于应用次数、成功率和近期性。

### 集成用例

- MetricSnapshot → Review → ReviewInsight → Learning → LearningApplication。

## 15. Phase 10：AI 与 Notifications

### AI Service RED 用例

1. AITask 创建时记录 User、Project、Output 和引用。
2. 未配置 capability model 时拒绝任务。
3. queued 任务可进入 running。
4. running 任务可提交 candidate result。
5. candidate result 不修改正式 Artifact。
6. confirmResult 只调用目标模块公开 service。
7. confirmResult 成功后任务 completed。
8. 目标模块失败时任务保持 awaiting_confirmation 并记录错误。
9. cancelled 任务不能提交结果。
10. failed 任务可显式重试为新任务，不修改旧任务。

### Notifications Service RED 用例

- 通知只属于一个 User。
- markRead 幂等。
- unread count 准确。
- 其他模块只能调用 NotificationsService。

### AI 集成用例

- AI 生成 output script candidate。
- 用户确认。
- ArtifactsService 创建新 ArtifactVersion。
- AITask 完成并创建通知。

## 16. Phase 11：Application Queries 与页面 Contract

### DashboardQueryService

**RED 用例**

- 返回五张顶部指标卡。
- 返回进行中项目、待办、热门选题、最近发布和建议。
- 只通过 module service 获取数据。
- 一个下游 service 失败时返回明确错误，不静默伪造数据。

### ProjectOverviewQueryService

**RED 用例**

- 返回六阶段、资产统计、最近文件、动态、输出规划、发布状态和里程碑。
- 不直接访问 repository。

### PublishingCenterQueryService

**RED 用例**

- 返回发布列表、概览、平台对比、趋势和 Top 内容。
- 时间筛选在各统计区域一致。

### SettingsQueryService

**RED 用例**

- 返回账户、偏好、存储、模型和 Agent 配置。
- secret reference 不出现在响应。

### 页面 Contract

为 17 个页面建立响应 schema contract：

| 页面 | Contract |
|---|---|
| Dashboard | dashboard.contract.test.ts |
| Projects | projects-list.contract.test.ts |
| New Project | create-project.contract.test.ts |
| Project Overview | project-overview.contract.test.ts |
| Research | research-workspace.contract.test.ts |
| Planning | planning-workspace.contract.test.ts |
| Script | script-workspace.contract.test.ts |
| Production | production-workspace.contract.test.ts |
| Publishing Workspace | publishing-workspace.contract.test.ts |
| Analytics & Review | analytics-review.contract.test.ts |
| Knowledge & Memory | knowledge-center.contract.test.ts |
| Assets Center | assets-center.contract.test.ts |
| Publishing Center | publishing-center.contract.test.ts |
| Experience Center | experience-center.contract.test.ts |
| Global Search | search.contract.test.ts |
| AI Copilot | ai-copilot.contract.test.ts |
| Settings | settings.contract.test.ts |

## 17. 核心端到端场景

### E2E 1：完整创作闭环

```text
创建 Project
→ 自动生成六阶段
→ 完成 Research 和 Planning
→ 创建视频与图文 Output
→ 创建主脚本和两个适配脚本
→ 创建视频 Production
→ 完成导出并设置主成品
→ 创建多个 Publication
→ 外置 Skill 导入指标
→ 创建并完成 Review
→ 提升 Insight 为 Learning
→ 在新 Project 应用 Learning
```

断言：

- 所有数据属于同一 User。
- 两个 Output 独立推进。
- 所有版本历史保留。
- 发布和指标无重复。
- Learning 脱离原 Project 继续存在。

### E2E 2：用户隔离

为 User A 创建完整数据后，以 User B 请求所有相关 ID。

断言：

- 所有请求返回 404。
- 搜索无结果。
- signed URL 不生成。
- Ingestion source 无法写入。

### E2E 3：事务回滚

模拟 Production 导出完成时 Asset 注册失败。

断言：

- ExportRecord 不进入 completed。
- Output primary asset 不变化。
- 暂存对象进入补偿清理记录。

### E2E 4：幂等导入

同一 Ingestion payload 连续提交三次。

断言：

- 一个 IngestionRun。
- 一个 MetricSnapshot。
- 响应 runId 和记录结果一致。

### E2E 5：AI 确认

提交 AI script candidate，但不确认。

断言：

- 当前 ArtifactVersion 不变化。

确认后：

- 创建一个新 ArtifactVersion。
- AITask completed。
- 产生一条通知。

## 18. Commit 顺序

每个模块遵循：

```text
test(module): define failing domain behavior
feat(module): implement minimal service behavior
test(module): add repository integration coverage
feat(module): persist module state
test(api): define route contract
feat(api): expose module route
refactor(module): simplify after green
```

禁止一个 commit 同时实现多个无关模块。

## 19. Definition of Done

一个模块完成必须满足：

- service、repository、schema、types、errors 和 tests 均存在。
- 测试先于实现提交。
- service unit tests 通过。
- repository integration tests 通过。
- contract tests 通过。
- architecture tests 通过。
- lint 和 typecheck 通过。
- 未导出 repository。
- 没有跨模块 repository import。
- 所有查询有 user scope。
- 状态转换和幂等规则有行为测试。
- 文档与公开 service interface 一致。

## 20. 执行拆分

这是后端主 TDD 计划。开始编码前，应按以下顺序生成并执行独立的文件级计划：

1. Foundation and Architecture Guards
2. Identity and Settings
3. Projects
4. Artifacts
5. Knowledge, Taxonomy and Search
6. Assets
7. Production
8. Publishing and Ingestion
9. Analytics
10. Reviews and Learnings
11. AI and Notifications
12. Application Queries and E2E

每个子计划必须继续遵守 RED → GREEN → REFACTOR，不能直接从本主计划跳到批量编码。
