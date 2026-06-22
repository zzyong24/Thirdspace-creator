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
