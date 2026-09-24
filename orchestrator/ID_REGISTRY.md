# ID Registry — CreatorOS

Stable IDs so downstream artifacts trace to upstream intent and changes invalidate affected work precisely.

> Populated 2026-06-20 during the **ratification pass** (option A) by extracting IDs from the existing
> CreatorOS design docs and frontend specs. Counts: 68 FR, 24 NFR, 22 FLOW, 58 ENT, 9 IA, 18 PAGE, 42 COMP.
> `to-confirm` = extracted from existing docs, awaiting user sign-off to become `confirmed` (see manifest
> stages in `needs-user-confirmation`). API/TEST(backend) IDs are intentionally empty — stages 15/16 not started.

## ID Prefixes

| Prefix | Meaning | Example |
| --- | --- | --- |
| `ASM` | Assumption | `ASM-001` |
| `DEC` | Decision | `DEC-001` |
| `FR` | Functional requirement | `FR-001` |
| `NFR` | Non-functional requirement | `NFR-001` |
| `FLOW` | Business or user flow | `FLOW-001` |
| `ENT` | Domain entity | `ENT-001` |
| `IA` | Information architecture surface | `IA-001` |
| `PAGE` | Page or screen contract | `PAGE-001` |
| `COMP` | Frontend component | `COMP-001` |
| `MOCK` | Mock data scenario | `MOCK-001` |
| `API` | Service contract operation | `API-001` |
| `TEST` | Test or validation scenario | `TEST-001` |
| `RISK` | Accepted or open risk | `RISK-001` |

## Decisions

| ID | Name | Defined In | Status |
| --- | --- | --- | --- |
| `DEC-001` | Mid-project takeover initialization | DECISION_LOG.md | active |
| `DEC-002` | Pre-existing artifacts default to draft | DECISION_LOG.md | active |
| `DEC-003` | Frontend green on static checks only | DECISION_LOG.md | active |
| `DEC-004` | Ratification pass (assign IDs, run gates) | DECISION_LOG.md | active |
| `DEC-005` | Consistency gate fails on missing backend chains | DECISION_LOG.md | active |
| `DEC-ODR-001` | 四个过度设计任务统一退回最小现有能力路线 | DECISION_LOG.md | resolved |
| `DEC-SCHED-001` | 项目唯一排期入口与发布中心日历主视图 | DECISION_LOG.md | confirmed |
| `DEC-SCHED-002` | 排期复用共享契约与真实数据库 | DECISION_LOG.md | confirmed-scope |
| `DEC-MODEL-606` | 渠道 JSON 拉到即用、拉不到才用本地 | DECISION_LOG.md | active |
| `DEC-MODEL-619` | Activity 只证明授权事实，Growth 签入权威客户端身份 | DECISION_LOG.md | active |
| `DEC-BOUNDARY-002` | Activity 最小运行快照不等于业务权威 | DECISION_LOG.md | resolved |

## FR — Functional Requirements (source: docs/CreatorOS-implementation-plan.md) — status: to-confirm

| ID | Name | ID | Name |
| --- | --- | --- | --- |
| FR-001 | User & data isolation | FR-035 | ScriptSection timecodes |
| FR-002 | Project lifecycle CRUD | FR-036 | AI suggestion adoption |
| FR-003 | Project relations | FR-037 | Production modes |
| FR-004 | Auto-generate six stages | FR-038 | Section-to-segment mapping |
| FR-005 | Target platform intent | FR-039 | Segment asset usage |
| FR-006 | Stage transitions | FR-040 | Recording/subtitle/export config |
| FR-007 | ContentOutput types | FR-041 | Export records & status |
| FR-008 | Auto-generate output stages | FR-042 | Register export as asset |
| FR-009 | Project progress aggregation | FR-043 | Primary asset switching |
| FR-010 | Task/Milestone/Activity | FR-044 | Multi-platform publications |
| FR-011 | Project list filter/sort | FR-045 | Publication revisions |
| FR-012 | Dashboard aggregation | FR-046 | Manual publish registration |
| FR-013 | Artifact lifecycle | FR-047 | External write API |
| FR-014 | Immutable artifact versions | FR-048 | ExternalSource & token isolation |
| FR-015 | Autosave & explicit versions | FR-049 | Idempotent ingestion |
| FR-016 | Version compare/restore | FR-050 | Publishing center query |
| FR-017 | Shared vs output artifacts | FR-051 | Standard metrics dictionary |
| FR-018 | Artifact relations | FR-052 | Raw + normalized metrics |
| FR-019 | Structured content trees | FR-053 | Metrics aggregation |
| FR-020 | Knowledge creation & reuse | FR-054 | Retention & audience queries |
| FR-021 | Knowledge versions & relations | FR-055 | Project & output reviews |
| FR-022 | Asset upload & file versions | FR-056 | Review insights |
| FR-023 | Asset favorite/trash/refcheck | FR-057 | Promote insight to Learning |
| FR-024 | Resource associations | FR-058 | Learning application |
| FR-025 | Tag management & filter | FR-059 | Experience center ranking |
| FR-026 | Search indexing | FR-060 | AI conversations & context |
| FR-027 | Rebuildable SearchDocument | FR-061 | AI task state & recovery |
| FR-028 | Unified search & history | FR-062 | AI reference reads |
| FR-029 | Storage usage stats | FR-063 | AI candidate confirmation |
| FR-030 | Research collection & evidence | FR-064 | Model configuration |
| FR-031 | Analysis artifacts | FR-065 | Agent configuration |
| FR-032 | Content contract & tension | FR-066 | Notifications & jumps |
| FR-033 | Thesis tree & outline | FR-067 | User preferences |
| FR-034 | Master & adapted scripts | FR-068 | Account export/delete |

## NFR — Non-Functional Requirements (source: implementation-plan + storage-and-business-logic) — status: to-confirm

| ID | Name | ID | Name |
| --- | --- | --- | --- |
| NFR-001 | PostgreSQL source of truth | NFR-013 | Backup & WAL archiving |
| NFR-002 | S3 object storage for media | NFR-014 | Object versioning & lifecycle |
| NFR-003 | UUID public keys | NFR-015 | Encryption at rest |
| NFR-004 | JSONB extensibility | NFR-016 | Signed URL access |
| NFR-005 | Full-text + pgvector search | NFR-017 | Secret reference only |
| NFR-006 | User-level data isolation | NFR-018 | Ingestion/AI token & rate limit |
| NFR-007 | Migration reversibility | NFR-019 | Derived data as views |
| NFR-008 | Immutable version integrity | NFR-020 | TypeScript strict & tech stack |
| NFR-009 | Idempotent external writes | NFR-021 | Vertical slice delivery |
| NFR-010 | Partial-failure tolerance | NFR-022 | Audit-data immutability |
| NFR-011 | Metric partitioning/retention | NFR-023 | Archive-by-default deletion |
| NFR-012 | No message queue dependency | NFR-024 | Cross-stage test strategy |

## FLOW — Business / User Flows (source: docs/CreatorOS-storage-and-business-logic.md) — status: to-confirm

| ID | Name | ID | Name |
| --- | --- | --- | --- |
| FLOW-001 | Core creation closed-loop | FLOW-012 | Product switch flow |
| FLOW-002 | Project lifecycle states | FLOW-013 | Publishing flow |
| FLOW-003 | Stage state machine | FLOW-014 | Publication state machine |
| FLOW-004 | Project progress rollup | FLOW-015 | Review flow |
| FLOW-005 | ContentOutput state machine | FLOW-016 | Learning lifecycle |
| FLOW-006 | Research flow | FLOW-017 | Global search flow |
| FLOW-007 | Planning flow | FLOW-018 | AI task flow |
| FLOW-008 | Script flow | FLOW-019 | External ingestion contract |
| FLOW-009 | AI rewrite candidate flow | FLOW-020 | Metric ingestion flow |
| FLOW-010 | Version restore flow | FLOW-021 | Delete/archive/restore flow |
| FLOW-011 | Production flow | FLOW-022 | End-to-end acceptance scenario |

## ENT — Domain Entities (source: docs/CreatorOS-data-model.md) — status: to-confirm

| ID | Name | ID | Name | ID | Name |
| --- | --- | --- | --- | --- | --- |
| ENT-001 | User | ENT-021 | KnowledgeRelation | ENT-041 | RetentionPoint |
| ENT-002 | UserPreference | ENT-022 | Asset | ENT-042 | AudienceSnapshot |
| ENT-003 | Project | ENT-023 | AssetFile | ENT-043 | Review |
| ENT-004 | ProjectRelation | ENT-024 | Learning | ENT-044 | ReviewPublication |
| ENT-005 | ProjectStage | ENT-025 | LearningApplication | ENT-045 | ReviewInsight |
| ENT-006 | ProjectTargetPlatform | ENT-026 | Tag | ENT-046 | AIConversation |
| ENT-007 | ContentOutput | ENT-027 | EntityTag | ENT-047 | AIMessage |
| ENT-008 | OutputStage | ENT-028 | ProjectKnowledge | ENT-048 | AITask |
| ENT-009 | Task | ENT-029 | ProjectAsset | ENT-049 | AITaskReference |
| ENT-010 | Milestone | ENT-030 | ArtifactKnowledge | ENT-050 | AITaskResult |
| ENT-011 | ProjectActivity | ENT-031 | ArtifactAsset | ENT-051 | ModelConfiguration |
| ENT-012 | Artifact | ENT-032 | OutputAsset | ENT-052 | AgentConfiguration |
| ENT-013 | ArtifactVersion | ENT-033 | Production | ENT-053 | ExternalSource |
| ENT-014 | ArtifactRelation | ENT-034 | ProductionSegment | ENT-054 | IngestionRun |
| ENT-015 | ThesisNode | ENT-035 | SegmentAsset | ENT-055 | IngestionError |
| ENT-016 | ScriptSection | ENT-036 | ExportRecord | ENT-056 | Notification |
| ENT-017 | EvidenceLink | ENT-037 | Publication | ENT-057 | SearchHistory |
| ENT-018 | TimelineSegment | ENT-038 | PublicationRevision | ENT-058 | SearchDocument |
| ENT-019 | KnowledgeItem | ENT-039 | MetricSnapshot | | |
| ENT-020 | KnowledgeRevision | ENT-040 | MetricValue | | |

## IA — Information Architecture (source: frontend/specs/shared-components.md + data-model) — status: to-confirm

| ID | Name |
| --- | --- |
| IA-001 | AppShell layout (Sidebar + MainFrame + OverlayLayer) |
| IA-002 | Primary navigation (Home/Projects/Knowledge/Assets/Publishing/Experience/Settings) |
| IA-003 | Context navigation (per page-type) |
| IA-004 | TopHeader global mode |
| IA-005 | TopHeader project-overview mode |
| IA-006 | TopHeader project-workspace mode |
| IA-007 | OverlayLayer (NewProject/AICopilot/Notification) |
| IA-008 | Six fixed stages (Research→Planning→Script→Production→Publishing→Review) |
| IA-009 | Nine domain divisions |

## PAGE — Pages / Screens (source: frontend/specs/page-specs.md; routes confirmed) — status: to-confirm

| ID | Name | Route |
| --- | --- | --- |
| PAGE-001 | Dashboard | (creator)/page.tsx |
| PAGE-002 | Projects | (creator)/projects/page.tsx |
| PAGE-003 | New Project | projects/new + @modal/(.)projects/new |
| PAGE-004 | Project Overview | projects/[projectId]/page.tsx |
| PAGE-005 | Research Workspace | projects/[projectId]/research/page.tsx |
| PAGE-006 | Planning Workspace | projects/[projectId]/planning/page.tsx |
| PAGE-007 | Script Workspace | projects/[projectId]/script/page.tsx |
| PAGE-008 | Production Workspace | projects/[projectId]/production/page.tsx |
| PAGE-009 | Publishing Workspace | projects/[projectId]/publishing/page.tsx |
| PAGE-010 | Analytics & Review | projects/[projectId]/review/page.tsx |
| PAGE-011 | Knowledge & Memory | (creator)/knowledge/page.tsx |
| PAGE-012 | Assets Center | (creator)/assets/page.tsx |
| PAGE-013 | Publishing Center | (creator)/publishing/page.tsx |
| PAGE-014 | Experience Center | (creator)/experience/page.tsx |
| PAGE-015 | Global Search | (creator)/search/page.tsx |
| PAGE-016 | AI Copilot | overlay (AICopilotDialog), no route |
| PAGE-017 | Settings | (creator)/settings/page.tsx |
| PAGE-018 | New Project intercepted modal | @modal/(.)projects/new/page.tsx (variant of PAGE-003) |

## COMP — Shared Components (source: frontend/specs/shared-components.md) — status: to-confirm

| ID | Name | ID | Name | ID | Name |
| --- | --- | --- | --- | --- | --- |
| COMP-001 | AppShell | COMP-015 | StatusBadge | COMP-029 | ArtifactListItem |
| COMP-002 | Sidebar | COMP-016 | ProgressBar | COMP-030 | KnowledgeListItem |
| COMP-003 | TopHeader | COMP-017 | ProjectThumbnail | COMP-031 | AssetCard |
| COMP-004 | NewProjectDialog | COMP-018 | PlatformIcon | COMP-032 | AssetDetailPanel |
| COMP-005 | AICopilotDialog | COMP-019 | TagChip | COMP-033 | EvidenceCard |
| COMP-006 | NotificationPopover | COMP-020 | SectionCard | COMP-034 | FileThumbnail |
| COMP-007 | ProjectStageStepper | COMP-021 | ListSectionHeader | COMP-035 | MediaPreview |
| COMP-008 | PageTabs | COMP-022 | ProjectListItem | COMP-036 | VersionCard |
| COMP-009 | FilterBar | COMP-023 | ProjectSummaryCard | COMP-037 | ChartFrame |
| COMP-010 | SearchField | COMP-024 | ProjectStageOverview | COMP-038 | MetricTrendCard |
| COMP-011 | ViewModeToggle | COMP-025 | OutputPlanList | COMP-039 | InsightCard |
| COMP-012 | SortSelect | COMP-026 | MilestoneList | COMP-040 | RetentionChart |
| COMP-013 | Pagination | COMP-027 | ProjectActivityList | COMP-041 | AudienceBreakdown |
| COMP-014 | MetricCard | COMP-028 | TaskList | COMP-042 | PublicationPerformanceRow |

## API — Service Contract Operations

_None. Stage 15 (service-contract) not started — see GAP-002._

## TEST — Test / Validation Scenarios

Frontend: vitest unit suite (22 files) + per-page playwright visual & a11y specs (`frontend/tests/visual/pages/*`).
Stable TEST-* IDs to be assigned when the service contract defines testable operations. Backend tests: none (stage 16 not started).

## Completion Standard

- Every requirement, flow, entity, page, API, and test referenced downstream has an ID here.
- IDs are stable after user confirmation; do not renumber because ordering changes.
- Deprecated IDs remain with status `deprecated` and a replacement when applicable.

## T-471 增量登记（2026-07-23）

| ID | 名称 | 定义位置 |
|---|---|---|
| DEC-019 | Responses 协议与历史证据诚实补正 | `DECISION_LOG.md` |
| DEC-020 | Codex/Claude 统一执行 product-to-code-orchestrator | `DECISION_LOG.md` |
| FR-069 | 模型配置显式支持 OpenAI Responses | `docs/superpowers/specs/2026-07-23-openai-responses-protocol-design.md` |
| FLOW-023 | 设置保存→连接测试→Agent 执行同协议 | 同上 |
| API-008 | `settings.models.put` 保存 `openai_responses` | `contract/src/operations/settings.ts` |
| API-009 | `settings.models.test` 探测 `/responses` | `contract/src/operations/settings.ts` |
| TEST-001..008 | contract/持久化/SDK/Pi/连接/UI/sidecar/New API 验证 | T-471 SPEC §8 |
| RISK-011 | 历史红测不可追溯、付费真端到端待授权 | `orchestrator/GATE-T471-RETROSPECTIVE.md` |

## Canonical block(机器可读真值 —— orphan-scan 只读此块;上方人读表仅作导航)

> 2026-07-15 引擎升级(v3.6.3 --update)时迁入 canonical 格式。Source IDs 目前只挂了 PAGE→FLOW
> (取自追溯矩阵);FR/NFR/FLOW/DEC 本身是上游,其余 NONE。API-*/TEST-* 尚未登记 —— 契约(76 操作)
> 与后端测试已存在但未回登记,见 BACKLOG 补账任务。

```id-registry
| ID | Type | Defined In | Source IDs |
| --- | --- | --- | --- |
| DEC-001 | decision | DECISION_LOG.md | NONE |
| DEC-002 | decision | DECISION_LOG.md | NONE |
| DEC-003 | decision | DECISION_LOG.md | NONE |
| DEC-004 | decision | DECISION_LOG.md | NONE |
| DEC-005 | decision | DECISION_LOG.md | NONE |
| FR-001 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-002 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-003 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-004 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-005 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-006 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-007 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-008 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-009 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-010 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-011 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-012 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-013 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-014 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-015 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-016 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-017 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-018 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-019 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-020 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-021 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-022 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-023 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-024 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-025 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-026 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-027 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-028 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-029 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-030 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-031 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-032 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-033 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-034 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-035 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-036 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-037 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-038 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-039 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-040 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-041 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-042 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-043 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-044 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-045 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-046 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-047 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-048 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-049 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-050 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-051 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-052 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-053 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-054 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-055 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-056 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-057 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-058 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-059 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-060 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-061 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-062 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-063 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-064 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-065 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-066 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-067 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| FR-068 | requirement | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-001 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-002 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-003 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-004 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-005 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-006 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-007 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-008 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-009 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-010 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-011 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-012 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-013 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-014 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-015 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-016 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-017 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-018 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-019 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-020 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-021 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-022 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-023 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| NFR-024 | nfr | docs/CreatorOS-implementation-plan.md | NONE |
| FLOW-001 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-002 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-003 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-004 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-005 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-006 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-007 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-008 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-009 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-010 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-011 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-012 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-013 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-014 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-015 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-016 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-017 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-018 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-019 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-020 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-021 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| FLOW-022 | flow | docs/CreatorOS-storage-and-business-logic.md | NONE |
| ENT-001 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-002 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-003 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-004 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-005 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-006 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-007 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-008 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-009 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-010 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-011 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-012 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-013 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-014 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-015 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-016 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-017 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-018 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-019 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-020 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-021 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-022 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-023 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-024 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-025 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-026 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-027 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-028 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-029 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-030 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-031 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-032 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-033 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-034 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-035 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-036 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-037 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-038 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-039 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-040 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-041 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-042 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-043 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-044 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-045 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-046 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-047 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-048 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-049 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-050 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-051 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-052 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-053 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-054 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-055 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-056 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-057 | entity | docs/CreatorOS-data-model.md | NONE |
| ENT-058 | entity | docs/CreatorOS-data-model.md | NONE |
| IA-001 | ia | frontend/specs/shared-components.md | NONE |
| IA-002 | ia | frontend/specs/shared-components.md | NONE |
| IA-003 | ia | frontend/specs/shared-components.md | NONE |
| IA-004 | ia | frontend/specs/shared-components.md | NONE |
| IA-005 | ia | frontend/specs/shared-components.md | NONE |
| IA-006 | ia | frontend/specs/shared-components.md | NONE |
| IA-007 | ia | frontend/specs/shared-components.md | NONE |
| IA-008 | ia | frontend/specs/shared-components.md | NONE |
| IA-009 | ia | frontend/specs/shared-components.md | NONE |
| PAGE-001 | page | frontend/specs/page-specs.md | FLOW-001 |
| PAGE-002 | page | frontend/specs/page-specs.md | FLOW-002, FLOW-003, FLOW-004 |
| PAGE-003 | page | frontend/specs/page-specs.md | FLOW-005 |
| PAGE-004 | page | frontend/specs/page-specs.md | FLOW-002, FLOW-005 |
| PAGE-005 | page | frontend/specs/page-specs.md | FLOW-006 |
| PAGE-006 | page | frontend/specs/page-specs.md | FLOW-007 |
| PAGE-007 | page | frontend/specs/page-specs.md | FLOW-008, FLOW-009, FLOW-010 |
| PAGE-008 | page | frontend/specs/page-specs.md | FLOW-011, FLOW-012 |
| PAGE-009 | page | frontend/specs/page-specs.md | FLOW-013, FLOW-014 |
| PAGE-010 | page | frontend/specs/page-specs.md | FLOW-015, FLOW-016 |
| PAGE-011 | page | frontend/specs/page-specs.md | FLOW-006 |
| PAGE-012 | page | frontend/specs/page-specs.md | FLOW-021 |
| PAGE-013 | page | frontend/specs/page-specs.md | FLOW-013, FLOW-020 |
| PAGE-014 | page | frontend/specs/page-specs.md | FLOW-015, FLOW-016 |
| PAGE-015 | page | frontend/specs/page-specs.md | FLOW-017 |
| PAGE-016 | page | frontend/specs/page-specs.md | FLOW-018 |
| PAGE-017 | page | frontend/specs/page-specs.md | FLOW-021 |
| PAGE-018 | page | frontend/specs/page-specs.md | FLOW-005 |
| COMP-001 | component | frontend/specs/shared-components.md | NONE |
| COMP-002 | component | frontend/specs/shared-components.md | NONE |
| COMP-003 | component | frontend/specs/shared-components.md | NONE |
| COMP-004 | component | frontend/specs/shared-components.md | NONE |
| COMP-005 | component | frontend/specs/shared-components.md | NONE |
| COMP-006 | component | frontend/specs/shared-components.md | NONE |
| COMP-007 | component | frontend/specs/shared-components.md | NONE |
| COMP-008 | component | frontend/specs/shared-components.md | NONE |
| COMP-009 | component | frontend/specs/shared-components.md | NONE |
| COMP-010 | component | frontend/specs/shared-components.md | NONE |
| COMP-011 | component | frontend/specs/shared-components.md | NONE |
| COMP-012 | component | frontend/specs/shared-components.md | NONE |
| COMP-013 | component | frontend/specs/shared-components.md | NONE |
| COMP-014 | component | frontend/specs/shared-components.md | NONE |
| COMP-015 | component | frontend/specs/shared-components.md | NONE |
| COMP-016 | component | frontend/specs/shared-components.md | NONE |
| COMP-017 | component | frontend/specs/shared-components.md | NONE |
| COMP-018 | component | frontend/specs/shared-components.md | NONE |
| COMP-019 | component | frontend/specs/shared-components.md | NONE |
| COMP-020 | component | frontend/specs/shared-components.md | NONE |
| COMP-021 | component | frontend/specs/shared-components.md | NONE |
| COMP-022 | component | frontend/specs/shared-components.md | NONE |
| COMP-023 | component | frontend/specs/shared-components.md | NONE |
| COMP-024 | component | frontend/specs/shared-components.md | NONE |
| COMP-025 | component | frontend/specs/shared-components.md | NONE |
| COMP-026 | component | frontend/specs/shared-components.md | NONE |
| COMP-027 | component | frontend/specs/shared-components.md | NONE |
| COMP-028 | component | frontend/specs/shared-components.md | NONE |
| COMP-029 | component | frontend/specs/shared-components.md | NONE |
| COMP-030 | component | frontend/specs/shared-components.md | NONE |
| COMP-031 | component | frontend/specs/shared-components.md | NONE |
| COMP-032 | component | frontend/specs/shared-components.md | NONE |
| COMP-033 | component | frontend/specs/shared-components.md | NONE |
| COMP-034 | component | frontend/specs/shared-components.md | NONE |
| COMP-035 | component | frontend/specs/shared-components.md | NONE |
| COMP-036 | component | frontend/specs/shared-components.md | NONE |
| COMP-037 | component | frontend/specs/shared-components.md | NONE |
| COMP-038 | component | frontend/specs/shared-components.md | NONE |
| COMP-039 | component | frontend/specs/shared-components.md | NONE |
| COMP-040 | component | frontend/specs/shared-components.md | NONE |
| COMP-041 | component | frontend/specs/shared-components.md | NONE |
| COMP-042 | component | frontend/specs/shared-components.md | NONE |
| DEC-019 | decision | orchestrator/DECISION_LOG.md | NONE |
| DEC-020 | decision | orchestrator/DECISION_LOG.md | NONE |
| FR-069 | requirement | docs/superpowers/specs/2026-07-23-openai-responses-protocol-design.md | DEC-019 |
| FLOW-023 | flow | docs/superpowers/specs/2026-07-23-openai-responses-protocol-design.md | FR-069 |
| API-008 | api | contract/src/operations/settings.ts | FR-069 |
| API-009 | api | contract/src/operations/settings.ts | FR-069 |
| TEST-001 | test | contract/tests/modules/settings.test.ts | FR-069, API-008 |
| TEST-002 | test | backend/src/modules/settings/model-config-transfer.test.ts | FR-069, API-008 |
| TEST-003 | test | ai-worker/src/runtime/provider-factory.test.ts | FR-069 |
| TEST-004 | test | backend/src/modules/execution/agentic/pi-engine.test.ts | FR-069 |
| TEST-005 | test | frontend/src/server/settings-model-test-wrap.test.ts | FR-069, API-009 |
| TEST-006 | test | frontend/src/features/settings/settings-interactive-region.test.tsx | FR-069 |
| TEST-007 | test | frontend/scripts/desktop/build-sidecar.test.mjs | FR-069 |
| TEST-008 | test | orchestrator/GATE-T471-RETROSPECTIVE.md | FR-069 |
| RISK-011 | risk | orchestrator/GATE-T471-RETROSPECTIVE.md | DEC-019 |
| DEC-POS-623 | decision | orchestrator/DECISION_LOG.md | NONE |
| FR-POS-623-001 | requirement | docs/superpowers/specs/2026-07-29-positioning-master-and-review-copilot-design.md | DEC-POS-623 |
| FR-POS-623-002 | requirement | docs/superpowers/specs/2026-07-29-positioning-master-and-review-copilot-design.md | DEC-POS-623 |
| FR-POS-623-003 | requirement | docs/superpowers/specs/2026-07-29-positioning-master-and-review-copilot-design.md | DEC-POS-623 |
| FLOW-POS-623-001 | flow | docs/superpowers/specs/2026-07-29-positioning-master-and-review-copilot-design.md | FR-POS-623-001, FR-POS-623-003 |
| ENT-POS-623-001 | entity | backend/src/schema/positioning.ts | FR-POS-623-001 |
| UI-POS-623-001 | component | frontend/src/features/positioning/positioning-interactive-region.tsx | FR-POS-623-001, FR-POS-623-002 |
| UI-POS-623-002 | component | frontend/src/features/review/review-analyze-island.tsx | FR-POS-623-003 |
| API-POS-623-001 | api | contract/src/operations/positioning.ts | FR-POS-623-001 |
| TEST-POS-623-001 | test | backend/src/modules/positioning/positioning.service.test.ts | FR-POS-623-001, API-POS-623-001 |
| TEST-POS-623-002 | test | frontend/src/features/positioning/positioning-interactive-region.test.tsx | FR-POS-623-001, FR-POS-623-002 |
| TEST-POS-623-003 | test | frontend/src/features/review/review-analyze-island.test.tsx | FR-POS-623-003, FLOW-POS-623-001 |
| TEST-POS-623-004 | test | frontend/src/features/copilot/ai-copilot-interactions.test.tsx | FR-POS-623-003 |
| DEC-POS-632 | decision | orchestrator/DECISION_LOG.md | NONE |
| FR-POS-632-001 | requirement | docs/superpowers/specs/2026-07-29-positioning-master-and-review-copilot-design.md | DEC-POS-632 |
| FLOW-POS-632-001 | flow | docs/superpowers/specs/2026-07-29-positioning-master-and-review-copilot-design.md | FR-POS-632-001 |
| ENT-POS-632-001 | entity | backend/src/schema/positioning.ts | FR-POS-632-001 |
| UI-POS-632-001 | component | frontend/src/features/positioning/positioning-center.tsx | FR-POS-632-001 |
| API-POS-632-001 | api | contract/src/operations/positioning.ts | FR-POS-632-001 |
| TEST-POS-632-001 | test | backend/src/modules/positioning/positioning.service.test.ts | FR-POS-632-001, API-POS-632-001 |
| TEST-POS-632-002 | test | backend/src/modules/positioning/positioning.contract.test.ts | FR-POS-632-001, API-POS-632-001 |
| TEST-POS-632-003 | test | frontend/src/features/positioning/positioning-center.test.tsx | FR-POS-632-001, UI-POS-632-001 |
| DEC-CR-001 | decision | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | NONE |
| DEC-CR-002 | decision | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | NONE |
| DEC-CR-003 | decision | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | NONE |
| DEC-CR-004 | decision | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | NONE |
| DEC-CR-005 | decision | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | NONE |
| DEC-CR-006 | decision | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | NONE |
| DEC-CR-007 | decision | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | NONE |
| DEC-CR-008 | decision | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | NONE |
| DEC-CR-009 | decision | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | NONE |
| DEC-CR-010 | decision | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | NONE |
| DEC-CR-011 | decision | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | PAT-004 |
| DEC-CR-012 | decision | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | PAT-002, MOD-006 |
| DEC-CR-013 | decision | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | DEC-CR-010 |
| DEC-CR-014 | decision | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-002, DEC-CR-006, DEC-CR-007 |
| DEC-CR-015 | decision | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-003, DEC-CR-007 |
| FR-CR-001 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-001 |
| FR-CR-002 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-003 |
| FR-CR-003 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-003 |
| FR-CR-004 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-004, DEC-CR-005 |
| FR-CR-005 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-004, DEC-CR-005, DEC-CR-008 |
| FR-CR-006 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-004 |
| FR-CR-007 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-003, DEC-CR-007 |
| FR-CR-008 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-003 |
| FR-CR-009 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-003, DEC-CR-004, DEC-CR-009 |
| FR-CR-010 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-003, DEC-CR-004, DEC-CR-010 |
| FR-CR-011 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-003 |
| FR-CR-012 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-002, DEC-CR-014 |
| FR-CR-013 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-002, DEC-CR-006, DEC-CR-014 |
| FR-CR-014 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-004 |
| FR-CR-015 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-004 |
| FR-CR-016 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-003 |
| FR-CR-017 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-003 |
| FR-CR-018 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-003 |
| FR-CR-019 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-003, DEC-CR-004 |
| FR-CR-020 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-004 |
| FR-CR-021 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-003, DEC-CR-007, DEC-CR-015 |
| FR-CR-022 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-007, DEC-CR-014, DEC-CR-017, DEC-CR-018 |
| FR-CR-023 | requirement | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-018 |
| NFR-CR-001 | nfr | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-004 |
| NFR-CR-002 | nfr | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-004 |
| NFR-CR-003 | nfr | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | NONE |
| NFR-CR-004 | nfr | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-005 |
| NFR-CR-005 | nfr | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-004 |
| NFR-CR-006 | nfr | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-004 |
| NFR-CR-007 | nfr | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-003 |
| NFR-CR-008 | nfr | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-002, DEC-CR-014 |
| NFR-CR-009 | nfr | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-003 |
| NFR-CR-010 | nfr | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | NONE |
| NFR-CR-011 | nfr | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | NONE |
| NFR-CR-012 | nfr | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-004 |
| NFR-CR-013 | nfr | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | DEC-CR-006 |
| FLOW-CR-001 | flow | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-003, FR-CR-004 |
| FLOW-CR-002 | flow | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-009 |
| FLOW-CR-003 | flow | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-010 |
| FLOW-CR-004 | flow | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-008 |
| FLOW-CR-005 | flow | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-012 |
| FLOW-CR-006 | flow | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-013 |
| FLOW-CR-007 | flow | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-014, FR-CR-020 |
| FLOW-CR-008 | flow | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-016 |
| FLOW-CR-009 | flow | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-021 |
| FLOW-CR-010 | flow | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-022 |
| ENT-CR-001 | entity | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-002 |
| ENT-CR-002 | entity | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-003, FR-CR-008, FR-CR-009, FR-CR-010 |
| ENT-CR-003 | entity | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-004, FR-CR-005, FR-CR-019 |
| ENT-CR-004 | entity | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-006 |
| ENT-CR-005 | entity | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-007 |
| ENT-CR-006 | entity | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-014, FR-CR-020 |
| ENT-CR-007 | entity | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-014 |
| ENT-CR-008 | entity | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-012, FR-CR-013 |
| ENT-CR-009 | entity | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-019 |
| ENT-CR-010 | entity | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-009, FR-CR-019 |
| ENT-CR-011 | entity | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-013 |
| ENT-CR-012 | entity | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-002, FR-CR-021 |
| IA-CR-001 | ia | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-001 |
| IA-CR-002 | ia | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-002, FR-CR-011 |
| IA-CR-003 | ia | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-003, FR-CR-008, FR-CR-009, FR-CR-010 |
| IA-CR-004 | ia | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-014, FR-CR-015, FR-CR-017 |
| IA-CR-005 | ia | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-005, FR-CR-006, FR-CR-007, FR-CR-011 |
| IA-CR-006 | ia | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-012, FR-CR-013 |
| IA-CR-007 | ia | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-014, FR-CR-015 |
| IA-CR-008 | ia | docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | FR-CR-001, FR-CR-012 |
| API-CR-001 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-001, FR-CR-002, FR-CR-014 |
| API-CR-002 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-002 |
| API-CR-003 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-002 |
| API-CR-004 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-002, FR-CR-017 |
| API-CR-005 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-003 |
| API-CR-006 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-009 |
| API-CR-007 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-008 |
| API-CR-008 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-003, FR-CR-008, FR-CR-009, FR-CR-010, FR-CR-015 |
| API-CR-009 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-002, FR-CR-014 |
| API-CR-010 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-002, FR-CR-015, FR-CR-017 |
| API-CR-011 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-017 |
| API-CR-012 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-004, FR-CR-014, FR-CR-020 |
| API-CR-013 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-014 |
| API-CR-014 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-014 |
| API-CR-015 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-005, FR-CR-011, FR-CR-019 |
| API-CR-016 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-005, FR-CR-006, FR-CR-011, FR-CR-019 |
| API-CR-017 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-007, FR-CR-020 |
| API-CR-018 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-020 |
| API-CR-019 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-020 |
| API-CR-020 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-012 |
| API-CR-021 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-012 |
| API-CR-022 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-013 |
| API-CR-023 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-013, FR-CR-020 |
| API-CR-024 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-013 |
| API-CR-025 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-016 |
| API-CR-026 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-016 |
| API-CR-027 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-016 |
| API-CR-028 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-016 |
| API-CR-029 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-003, FR-CR-009, FR-CR-010 |
| API-CR-030 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-017 |
| API-CR-031 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-021 |
| API-CR-032 | api | docs/superpowers/specs/2026-07-23-content-radar-service-contract.md | FR-CR-022 |
| TEST-CR-001 | test | backend/src/modules/intelligence/intelligence.service.test.ts | FR-CR-022, API-CR-032 |
| TEST-CR-002 | test | frontend/src/features/intelligence/intelligence-workbench.test.tsx | FR-CR-022, FLOW-CR-010, AC-CR-025 |
| TEST-CR-003 | test | backend/src/modules/intelligence/intelligence.service.test.ts | FR-CR-023, API-CR-015, AC-CR-026 |
| TEST-CR-004 | test | frontend/src/features/intelligence/intelligence-workbench.test.tsx | FR-CR-023, API-CR-015, AC-CR-026 |
| RAT-CR-001 | test | docs/research/2026-07-23-content-radar-rat.md | FR-CR-003 |
| RAT-CR-002 | test | docs/research/2026-07-23-content-radar-rat.md | FR-CR-004 |
| RAT-CR-003 | test | docs/research/2026-07-23-content-radar-rat.md | FR-CR-010 |
| RAT-CR-004 | test | docs/research/2026-07-23-content-radar-rat.md | FR-CR-008 |
| RAT-CR-005 | test | docs/research/2026-07-23-content-radar-rat.md | FR-CR-008 |
| RAT-CR-006 | test | docs/research/2026-07-23-content-radar-rat.md | FR-CR-009 |
| RAT-CR-007 | test | docs/research/2026-07-23-content-radar-rat.md | FR-CR-009 |
| DEC-PKG-01 | decision | orchestrator/DECISION_LOG.md | NONE |
| DEC-PKG-02 | decision | orchestrator/DECISION_LOG.md | NONE |
| DEC-PKG-03 | decision | orchestrator/DECISION_LOG.md | NONE |
| DEC-PKG-04 | decision | orchestrator/DECISION_LOG.md | NONE |
| DEC-PKG-05 | decision | orchestrator/DECISION_LOG.md | NONE |
| FR-FDBR-01 | requirement | docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md | UI-FDBR-001, TEST-FDBR-005 |
| FR-FDBR-02 | requirement | docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md | PURE-FDBR-001, TEST-FDBR-002, TEST-FDBR-003 |
| FR-FDBR-03 | requirement | docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md | API-FDBR-001, API-FDBR-002, TEST-FDBR-001, TEST-FDBR-004 |
| FR-FDBR-04 | requirement | docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md | API-FDBR-003, TEST-FDBR-004 |
| FR-FDBR-05 | requirement | docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md | TEST-FDBR-003, TEST-FDBR-006 |
| FR-FDBR-06 | requirement | docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md | PURE-FDBR-001, TEST-FDBR-002, TEST-FDBR-006 |
| API-FDBR-001 | api | docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md | FR-FDBR-03, TEST-FDBR-001 |
| API-FDBR-002 | api | docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md | FR-FDBR-03, TEST-FDBR-004 |
| API-FDBR-003 | api | docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md | FR-FDBR-04, TEST-FDBR-004 |
| UI-FDBR-001 | component | docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md | FR-FDBR-01, TEST-FDBR-005 |
| PURE-FDBR-001 | operation | docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md | FR-FDBR-02, FR-FDBR-06, TEST-FDBR-002 |
| TEST-FDBR-001 | test | docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md | API-FDBR-001 |
| TEST-FDBR-002 | test | docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md | PURE-FDBR-001 |
| TEST-FDBR-003 | test | docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md | FR-FDBR-02, FR-FDBR-05 |
| TEST-FDBR-004 | test | docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md | API-FDBR-002, API-FDBR-003 |
| TEST-FDBR-005 | test | docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md | UI-FDBR-001 |
| TEST-FDBR-006 | test | docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md | FR-FDBR-05, FR-FDBR-06 |
| TEST-FDBR-007 | test | docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md | FR-FDBR-03, FR-FDBR-05 |
| DEC-TSB-001 | decision | orchestrator/DECISION_LOG.md | FR-TSB-001..003, NFR-TSB-001 |
| FR-TSB-001 | requirement | docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md | FLOW-TSB-001, ENT-TSB-001, API-TSB-001 |
| FR-TSB-002 | requirement | docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md | FLOW-TSB-001, ENT-TSB-001 |
| FR-TSB-003 | requirement | docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md | FLOW-TSB-001, UI-TSB-002 |
| NFR-TSB-001 | requirement | docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md | ENT-TSB-001, TEST-TSB-009 |
| FLOW-TSB-001 | flow | docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md | FR-TSB-001..003 |
| ENT-TSB-001 | entity | docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md | FLOW-TSB-001, API-TSB-001 |
| API-TSB-001 | api | docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md | FR-TSB-001, UI-TSB-001, UI-TSB-002 |
| UI-TSB-001 | component | docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md | FR-TSB-002, API-TSB-001 |
| UI-TSB-002 | component | docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md | FR-TSB-003, API-TSB-001 |
| TEST-TSB-001 | test | docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md | FR-TSB-001 |
| TEST-TSB-002 | test | docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md | FR-TSB-001 |
| TEST-TSB-003 | test | docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md | FR-TSB-001 |
| TEST-TSB-004 | test | docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md | FR-TSB-001 |
| TEST-TSB-005 | test | docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md | FR-TSB-001 |
| TEST-TSB-006 | test | docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md | FR-TSB-001 |
| TEST-TSB-007 | test | docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md | FR-TSB-002 |
| TEST-TSB-008 | test | docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md | FR-TSB-003 |
| TEST-TSB-009 | test | docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md | NFR-TSB-001 |
| TEST-TSB-010 | test | docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md | API-TSB-001, UI-TSB-001, UI-TSB-002 |
| DEC-COL-001 | decision | orchestrator/DECISION_LOG.md | FR-537-01..09, NFR-537-01..05 |
| FR-537-01 | requirement | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | API-537-01, API-537-04, TEST-537-01, TEST-537-04 |
| FR-537-02 | requirement | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | IA-537-01, TEST-537-04 |
| FR-537-03 | requirement | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | API-537-02..04, TEST-537-01..03 |
| FR-537-04 | requirement | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | FLOW-537-01, FLOW-537-02, TEST-537-07 |
| FR-537-05 | requirement | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | API-537-04, TEST-537-05, TEST-537-06 |
| FR-537-06 | requirement | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | API-537-05, FLOW-537-02, TEST-537-07, TEST-537-08 |
| FR-537-07 | requirement | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | API-537-02, API-537-03, API-537-05, TEST-537-09, RAT-537-01 |
| FR-537-08 | requirement | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | IA-537-02, TEST-537-13 |
| FR-537-09 | requirement | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | TEST-537-10, TEST-537-11 |
| NFR-537-01 | nfr | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | TEST-537-02, TEST-537-03 |
| NFR-537-02 | nfr | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | TEST-537-12 |
| NFR-537-03 | nfr | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | TEST-537-07 |
| NFR-537-04 | nfr | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | TEST-537-07, TEST-537-13 |
| NFR-537-05 | nfr | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | TEST-537-09, TEST-537-12 |
| FLOW-537-01 | flow | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | FR-537-01..05 |
| FLOW-537-02 | flow | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | FR-537-04, FR-537-06, FR-537-07 |
| ENT-537-01 | entity | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | FR-537-03..06, FR-537-09 |
| ENT-537-02 | entity | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | FR-537-01, FR-537-03, FR-537-04 |
| ENT-537-03 | entity | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | FR-537-04, FR-537-06, FR-537-07 |
| IA-537-01 | ia | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | FR-537-01..03 |
| IA-537-02 | ia | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | FR-537-07, FR-537-08 |
| API-537-01 | api | docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md | FR-537-01, NFR-537-01 |
| API-537-02 | api | docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md | FR-537-02, FR-537-03, FR-537-07 |
| API-537-03 | api | docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md | FR-537-02, FR-537-03, FR-537-07 |
| API-537-04 | api | docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md | FR-537-01, FR-537-03..05 |
| API-537-05 | api | docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md | FR-537-06, FR-537-07 |
| TEST-537-01 | test | docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md | FR-537-03 |
| TEST-537-02 | test | docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md | NFR-537-01 |
| TEST-537-03 | test | docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md | FR-537-03, NFR-537-01 |
| TEST-537-04 | test | docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md | FR-537-01, FR-537-02 |
| TEST-537-05 | test | docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md | FR-537-05 |
| TEST-537-06 | test | docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md | FR-537-05 |
| TEST-537-07 | test | docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md | FR-537-04, FR-537-06 |
| TEST-537-08 | test | docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md | FR-537-06 |
| TEST-537-09 | test | docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md | FR-537-07 |
| TEST-537-10 | test | docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md | FR-537-09 |
| TEST-537-11 | test | docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md | FR-537-09 |
| TEST-537-12 | test | docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md | NFR-537-02, NFR-537-05 |
| TEST-537-13 | test | docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md | FR-537-08, NFR-537-04 |
| RAT-537-01 | test | docs/superpowers/specs/2026-07-26-content-radar-collector-account.md | FR-537-01, FR-537-04, FR-537-06, FR-537-07 |
| DEC-TSL-001 | decision | orchestrator/DECISION_LOG.md | FR-575-01..07 |
| FR-575-01 | requirement | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FLOW-575-01, TEST-575-01 |
| FR-575-02 | requirement | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FLOW-575-01, API-TSB-001, TEST-575-04 |
| FR-575-03 | requirement | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | PORT-575-001, UI-575-001, TEST-575-02 |
| FR-575-04 | requirement | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | HARD-575-001, HARD-575-002, PORT-575-001, UI-575-001, TEST-575-02, TEST-575-05 |
| FR-575-05 | requirement | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FLOW-575-02, API-575-001, TEST-575-03 |
| FR-575-06 | requirement | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | API-575-001, UI-575-002, HARD-575-003, TEST-575-03 |
| FR-575-07 | requirement | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | UI-575-002, TEST-575-03 |
| FLOW-575-01 | flow | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FR-575-01..04 |
| FLOW-575-02 | flow | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FR-575-05..07 |
| PORT-575-001 | operation | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FR-575-03, FR-575-04 |
| API-575-001 | api | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FR-575-05, FR-575-06 |
| UI-575-001 | component | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FR-575-03, FR-575-04 |
| UI-575-002 | component | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FR-575-05..07 |
| TEST-575-01 | test | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FR-575-01 |
| TEST-575-02 | test | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FR-575-03, FR-575-04 |
| TEST-575-03 | test | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FR-575-05..07 |
| TEST-575-04 | test | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FR-575-02 |
| TEST-575-05 | test | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FR-575-04, FR-575-06 |
| HARD-575-001 | risk | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FR-575-04 |
| HARD-575-002 | risk | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FR-575-04, TEST-575-02 |
| HARD-575-003 | risk | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FR-575-06, TEST-575-03 |
| DEC-TSL-003 | decision | orchestrator/DECISION_LOG.md | FR-575-08 |
| FR-575-08 | requirement | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FLOW-575-03, API-575-002, TEST-575-06 |
| FLOW-575-03 | flow | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FR-575-08 |
| API-575-002 | api | docs/contracts/creator-client-config-consumer-v1.md | FR-575-08, TEST-575-06 |
| TEST-575-06 | test | docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md | FR-575-08, API-575-002 |
| DEC-MAUTH-001 | decision | orchestrator/DECISION_LOG.md | FR-MAUTH-001..006, NFR-MAUTH-001..002 |
| FR-MAUTH-001 | requirement | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | FLOW-MAUTH-001, TEST-MAUTH-001 |
| FR-MAUTH-002 | requirement | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | FLOW-MAUTH-001, TEST-MAUTH-001, TEST-MAUTH-006 |
| FR-MAUTH-003 | requirement | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | FLOW-MAUTH-001, TEST-MAUTH-002, TEST-MAUTH-003 |
| FR-MAUTH-004 | requirement | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | FLOW-MAUTH-002, TEST-MAUTH-004, TEST-MAUTH-005 |
| FR-MAUTH-005 | requirement | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | HARD-MAUTH-001, TEST-MAUTH-006 |
| FR-MAUTH-006 | requirement | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | TEST-MAUTH-007, TEST-MAUTH-008 |
| NFR-MAUTH-001 | requirement | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | TEST-MAUTH-003, TEST-MAUTH-005 |
| NFR-MAUTH-002 | requirement | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | TEST-MAUTH-006 |
| FLOW-MAUTH-001 | flow | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | FR-MAUTH-001..003 |
| FLOW-MAUTH-002 | flow | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | FR-MAUTH-004..006 |
| PORT-MAUTH-001 | operation | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | FR-MAUTH-004 |
| PORT-MAUTH-002 | operation | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | FR-MAUTH-005, HARD-MAUTH-001 |
| HARD-MAUTH-001 | risk | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | FR-MAUTH-005 |
| TEST-MAUTH-001 | test | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | FR-MAUTH-001, FR-MAUTH-002 |
| TEST-MAUTH-002 | test | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | FR-MAUTH-003 |
| TEST-MAUTH-003 | test | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | FR-MAUTH-003, NFR-MAUTH-001 |
| TEST-MAUTH-004 | test | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | FR-MAUTH-004 |
| TEST-MAUTH-005 | test | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | FR-MAUTH-004, NFR-MAUTH-001 |
| TEST-MAUTH-006 | test | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | FR-MAUTH-002, FR-MAUTH-005, NFR-MAUTH-002 |
| TEST-MAUTH-007 | test | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | FR-MAUTH-006 |
| TEST-MAUTH-008 | test | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | FR-MAUTH-006 |
| TEST-MAUTH-009 | test | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | FR-MAUTH-001, NFR-MAUTH-001 |
| TEST-MAUTH-010 | test | docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md | FR-MAUTH-005, NFR-MAUTH-002 |
| DEC-SCHED-001 | decision | orchestrator/DECISION_LOG.md | FR-SCHED-001..07, FLOW-SCHED-001..04 |
| DEC-SCHED-002 | decision | orchestrator/DECISION_LOG.md | FR-SCHED-003, NFR-SCHED-001..03 |
| FR-SCHED-001 | requirement | docs/superpowers/specs/2026-07-29-project-publishing-schedule-design.md | FLOW-SCHED-001, FLOW-SCHED-002, API-SCHED-002..04, TEST-SCHED-UI-001, TEST-SCHED-UI-002 |
| FR-SCHED-002 | requirement | docs/superpowers/specs/2026-07-29-project-publishing-schedule-design.md | API-SCHED-002, API-SCHED-003, TEST-SCHED-SVC-001 |
| FR-SCHED-003 | requirement | docs/superpowers/specs/2026-07-29-project-publishing-schedule-design.md | API-SCHED-001..03, TEST-SCHED-DB-001 |
| FR-SCHED-004 | requirement | docs/superpowers/specs/2026-07-29-project-publishing-schedule-design.md | API-SCHED-001..05, TEST-SCHED-SVC-002 |
| FR-SCHED-005 | requirement | docs/superpowers/specs/2026-07-29-project-publishing-schedule-design.md | FLOW-SCHED-003, FLOW-SCHED-004, API-SCHED-001, TEST-SCHED-UI-003 |
| FR-SCHED-006 | requirement | docs/superpowers/specs/2026-07-29-project-publishing-schedule-design.md | FLOW-SCHED-003, API-SCHED-005, TEST-SCHED-SVC-002 |
| FR-SCHED-007 | requirement | docs/superpowers/specs/2026-07-29-project-publishing-schedule-design.md | API-SCHED-006, TEST-SCHED-DASH-001, TEST-SCHED-UI-004 |
| NFR-SCHED-001 | nfr | docs/superpowers/specs/2026-07-29-project-publishing-schedule-design.md | TEST-SCHED-DB-001, TEST-SCHED-SVC-001 |
| NFR-SCHED-002 | nfr | docs/superpowers/specs/2026-07-29-project-publishing-schedule-design.md | TEST-SCHED-SVC-001, TEST-SCHED-DASH-001 |
| NFR-SCHED-003 | nfr | docs/superpowers/specs/2026-07-29-project-publishing-schedule-design.md | TEST-SCHED-SVC-002, TEST-SCHED-DASH-001 |
| NFR-SCHED-004 | nfr | docs/superpowers/specs/2026-07-29-project-publishing-schedule-design.md | TEST-SCHED-UI-001..04 |
| FLOW-SCHED-001 | flow | docs/superpowers/specs/2026-07-29-project-publishing-schedule-design.md | FR-SCHED-001..03 |
| FLOW-SCHED-002 | flow | docs/superpowers/specs/2026-07-29-project-publishing-schedule-design.md | FR-SCHED-001, FR-SCHED-002, FR-SCHED-007 |
| FLOW-SCHED-003 | flow | docs/superpowers/specs/2026-07-29-project-publishing-schedule-design.md | FR-SCHED-005..07 |
| FLOW-SCHED-004 | flow | docs/superpowers/specs/2026-07-29-project-publishing-schedule-design.md | FR-SCHED-005, FR-SCHED-006 |
| API-SCHED-001 | api | docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md | FR-SCHED-003..05 |
| API-SCHED-002 | api | docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md | FR-SCHED-001..03 |
| API-SCHED-003 | api | docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md | FR-SCHED-001..04 |
| API-SCHED-004 | api | docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md | FR-SCHED-001, FR-SCHED-004 |
| API-SCHED-005 | api | docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md | FR-SCHED-004, FR-SCHED-006 |
| API-SCHED-006 | api | docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md | FR-SCHED-007 |
| TEST-SCHED-CONTRACT-001 | test | docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md | FR-SCHED-001..07, API-SCHED-001..06 |
| TEST-SCHED-DB-001 | test | docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md | FR-SCHED-003, FR-SCHED-004, NFR-SCHED-001 |
| TEST-SCHED-SVC-001 | test | docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md | FR-SCHED-001..03, NFR-SCHED-001, NFR-SCHED-002 |
| TEST-SCHED-SVC-002 | test | docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md | FR-SCHED-004, FR-SCHED-006, NFR-SCHED-003 |
| TEST-SCHED-DASH-001 | test | docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md | FR-SCHED-007, NFR-SCHED-002, NFR-SCHED-003 |
| TEST-SCHED-UI-001 | test | docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md | FR-SCHED-001, NFR-SCHED-004 |
| TEST-SCHED-UI-002 | test | docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md | FR-SCHED-001, FR-SCHED-002, NFR-SCHED-004 |
| TEST-SCHED-UI-003 | test | docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md | FR-SCHED-005, FR-SCHED-006, NFR-SCHED-004 |
| TEST-SCHED-UI-004 | test | docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md | FR-SCHED-007, NFR-SCHED-004 |
| DEC-CLI-001 | decision | orchestrator/DECISION_LOG.md | FR-CLI-01..08, FLOW-CLI-001..004 |
| FR-CLI-01 | requirement | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FLOW-CLI-001..004, API-CLI-002, TEST-CLI-002, TEST-CLI-006, TEST-CLI-008 |
| FR-CLI-02 | requirement | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FLOW-CLI-001, API-CLI-001, TEST-CLI-001, TEST-CLI-004 |
| FR-CLI-03 | requirement | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FLOW-CLI-001, FLOW-CLI-004, API-CLI-002, API-CLI-005, TEST-CLI-003, TEST-CLI-008 |
| FR-CLI-04 | requirement | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FLOW-CLI-003, ENT-CLI-001, API-CLI-001..003, UI-CLI-001, TEST-CLI-001..003, TEST-CLI-006 |
| FR-CLI-05 | requirement | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FLOW-CLI-002, FLOW-CLI-004, API-CLI-004, TEST-CLI-005, TEST-CLI-008 |
| FR-CLI-06 | requirement | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FLOW-CLI-001..004, API-CLI-005, TEST-CLI-004, TEST-CLI-007, TEST-CLI-008 |
| FR-CLI-07 | requirement | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FLOW-CLI-001, API-CLI-001, TEST-CLI-001 |
| FR-CLI-08 | requirement | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FLOW-CLI-004, API-CLI-006, TEST-CLI-008 |
| FLOW-CLI-001 | flow | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-01..04, FR-CLI-06, FR-CLI-07 |
| FLOW-CLI-002 | flow | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-01, FR-CLI-02, FR-CLI-05 |
| FLOW-CLI-003 | flow | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-01, FR-CLI-04, FR-CLI-06 |
| FLOW-CLI-004 | flow | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-03, FR-CLI-05, FR-CLI-06, FR-CLI-08 |
| ENT-CLI-001 | entity | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-04, API-CLI-002, API-CLI-003 |
| API-CLI-001 | api | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-02, FR-CLI-04, FR-CLI-07 |
| API-CLI-002 | api | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-01, FR-CLI-03, FR-CLI-04 |
| API-CLI-003 | api | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-04, UI-CLI-001 |
| API-CLI-004 | api | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-05 |
| API-CLI-005 | api | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-03, FR-CLI-06 |
| API-CLI-006 | api | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-08 |
| UI-CLI-001 | component | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-04, API-CLI-003 |
| TEST-CLI-001 | test | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-02, FR-CLI-04, FR-CLI-07 |
| TEST-CLI-002 | test | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-01, FR-CLI-03, FR-CLI-04 |
| TEST-CLI-003 | test | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-03, FR-CLI-04 |
| TEST-CLI-004 | test | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-02, FR-CLI-06 |
| TEST-CLI-005 | test | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-05 |
| TEST-CLI-006 | test | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-01, FR-CLI-04 |
| TEST-CLI-007 | test | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-06 |
| TEST-CLI-008 | test | docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md | FR-CLI-03, FR-CLI-05, FR-CLI-06, FR-CLI-08 |
| DEC-VIDEO-055 | decision | orchestrator/DECISION_LOG.md | API-VIDEO-901, TEST-VIDEO-901 |
| API-VIDEO-901 | api | backend/src/modules/execution/video-render/executor.ts | DEC-VIDEO-055, TEST-VIDEO-901 |
| TEST-VIDEO-901 | test | backend/src/modules/execution/video-render/executor.test.ts | DEC-VIDEO-055, API-VIDEO-901 |
| DEC-VIDEO-056 | decision | orchestrator/DECISION_LOG.md | API-VIDEO-902, TEST-VIDEO-902 |
| API-VIDEO-902 | api | backend/src/modules/execution/video-render/template.ts | DEC-VIDEO-056, TEST-VIDEO-902 |
| TEST-VIDEO-902 | test | backend/src/modules/execution/video-render/template.test.ts | DEC-VIDEO-056, API-VIDEO-902 |
| DEC-MODEL-057 | decision | orchestrator/DECISION_LOG.md | API-MODEL-904, TEST-MODEL-904 |
| API-MODEL-904 | api | backend/src/modules/ai-runtime/multimodal/retry-submit.ts | DEC-MODEL-057, TEST-MODEL-904 |
| TEST-MODEL-904 | test | backend/src/modules/ai-runtime/cover-runner.test.ts | DEC-MODEL-057, API-MODEL-904 |
```

## T-1003 多步 Agent（PLANNED）

FR-AW-01 至 FR-AW-08、AC-AW-01 至 AC-AW-09 的唯一正文见 [SPEC](../docs/features/t1003-agent-workbench.md)。用户已确认目标与迁移方向；实现和验收尚未发生。
