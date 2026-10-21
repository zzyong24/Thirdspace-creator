/**
 * CreatorOS canonical domain types.
 *
 * Shapes match the data model in `docs/CreatorOS-data-model.md` and are
 * consumed by fixture selectors. IDs are typed as opaque strings but treated
 * as stable identifiers across the canonical dataset.
 */

export type Id = string;

export type Iso8601 = string;

export interface BaseEntity {
  readonly id: Id;
}

export interface Timestamped {
  readonly createdAt: Iso8601;
  readonly updatedAt: Iso8601;
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export interface User extends BaseEntity, Timestamped {
  readonly email: string;
  readonly displayName: string;
  readonly timezone: string;
  readonly locale: string;
}

export interface UserPreference extends BaseEntity {
  readonly userId: Id;
  readonly defaultHome: string;
  readonly defaultCreationMode: CreationMode;
  readonly defaultVisibility: Visibility;
  readonly autosaveEnabled: boolean;
  readonly fileNamingRule: string;
  readonly analyticsEnabled: boolean;
}

export type CreationMode = "guided" | "flexible" | "freeform";
export type Visibility = "private" | "unlisted" | "public";

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export type ProjectStageName =
  // 立项 Brief 地基:brief 是项目第一个阶段(新建/选题立项从 brief 起)。
  | "brief"
  | "research"
  | "planning"
  | "script"
  | "production"
  | "publishing"
  | "review";

// 结构化 Brief(立项 Brief 地基 / PRD §5.2)—— 装在 projects.brief_detail jsonb。
export interface ProjectBriefDetail {
  readonly targetAudience?: string;
  readonly contentGoal?: string;
  readonly contentFormat?: string;
  readonly targetPlatforms: ReadonlyArray<string>;
  readonly durationEstimate?: string;
  readonly coreMessage?: string;
  readonly successCriteria?: string;
  readonly contentRadarEvidence?:
    | {
        readonly generationMode: "rewrite_only";
        readonly sourceReferences: ReadonlyArray<{
          readonly kind: "original_video" | "source_page";
          readonly platform: string;
          readonly label: string;
          readonly url: string;
          readonly intelligenceItemId?: string;
        }>;
        readonly sourceSnapshotId: string;
        readonly generatedFromTranscriptHash: string;
        readonly adaptedDraftSeed: {
          readonly generationMode: "rewrite_only";
          readonly contentText: string;
          readonly sourceSnapshotId: string;
          readonly generatedFromTranscriptHash: string;
          readonly aiTaskId?: string;
          readonly positioningVersionId?: string;
          readonly personalizationStatus: "applied" | "not_applied";
          readonly templateVersion: string;
        };
        readonly positioningVersionId?: string;
        readonly personalizationStatus?: "applied" | "not_applied";
        readonly aiTaskId?: string;
      }
    | {
        readonly sourceReferences: ReadonlyArray<{
          readonly kind: "original_video" | "source_page";
          readonly platform: string;
          readonly label: string;
          readonly url: string;
          readonly intelligenceItemId?: string;
        }>;
        readonly decomposition: {
          readonly hook: string;
          readonly structureSteps: ReadonlyArray<string>;
          readonly coreClaims: ReadonlyArray<string>;
          readonly reusablePattern: string;
          readonly factRisks: ReadonlyArray<string>;
        };
        readonly strategy: {
          readonly keep: ReadonlyArray<string>;
          readonly replace: ReadonlyArray<string>;
          readonly add: ReadonlyArray<string>;
          readonly avoid: ReadonlyArray<string>;
        };
        readonly adaptedDraftSeed: {
          readonly contentText: string;
          readonly generatedFromTranscriptHash: string;
          readonly strategyHash: string;
          readonly templateVersion: string;
        };
      };
}

// 数据底座(宪法 §7 / 契约 projectResource.source):项目来源。`imported` = 真实采集
//   导入的已发布历史作品(读侧据此把状态显示为「已发布」),manual/topic = 站内新建。
export type ProjectSource = import("@creatoros/contract").ProjectSource;

// 导入项目的平台引用(契约 projectResource.platformRef)。`publishedAt` 为真实发布
//   时刻(可空),作品列表/最近发布按它倒序;非导入项目为默认空形状。
export interface PlatformRef {
  readonly platform: string;
  readonly externalId: string;
  readonly shareUrl?: string;
  readonly publishedAt?: Iso8601;
  // [T-073] 平台侧可见性:抖音端「仅自己可见/已隐藏」→ true(采集明细「审核状态」列
  //   同步)。作品列表默认过滤 hidden 项目;未同步/非导入项目不带该键。
  readonly hidden?: boolean;
}

export type ProjectStatus = "active" | "paused" | "archived" | "completed";
// §16 needs_review:阶段「声称完成」但内容 gate 未过(核心交付物缺失)时的停泊态。
export type StageStatus =
  | "pending"
  | "in_progress"
  | "needs_review"
  | "completed"
  | "skipped";

export interface ProjectRelation extends BaseEntity {
  readonly sourceProjectId: Id;
  readonly targetProjectId: Id;
  readonly relationType: string;
  readonly note: string;
  readonly createdAt: Iso8601;
}

export interface Project extends BaseEntity, Timestamped {
  readonly userId: Id;
  readonly title: string;
  readonly brief: string;
  // 结构化 Brief —— optional 于 domain Project(存量/demo 项目不带,读侧默认 {})。
  // 真实 wire 形状由契约 projectResource.briefDetail 保证全字段。
  readonly briefDetail?: ProjectBriefDetail;
  // 数据底座(契约 projectResource):来源 + 平台引用。optional 于 domain(存量/demo
  //   项目不带,读侧默认 manual / 空形状);导入历史作品带 imported + 真实 platformRef
  //   (含 publishedAt),供读侧做「已发布」状态映射与发布时间倒序。
  readonly source?: ProjectSource;
  readonly platformRef?: PlatformRef;
  readonly contentCategory: string;
  readonly creationMode: CreationMode;
  readonly status: ProjectStatus;
  readonly currentStage: ProjectStageName;
  readonly progressPct: number;
  readonly starred: boolean;
  readonly startedAt: Iso8601;
  readonly targetCompletedAt: Iso8601 | null;
  readonly completedAt: Iso8601 | null;
  readonly archivedAt: Iso8601 | null;
}

export interface ProjectStage extends BaseEntity {
  readonly projectId: Id;
  readonly stage: ProjectStageName;
  readonly status: StageStatus;
  readonly progressPct: number;
  readonly skipped: boolean;
  readonly startedAt: Iso8601 | null;
  readonly completedAt: Iso8601 | null;
  readonly updatedAt: Iso8601;
}

export interface ProjectTargetPlatform extends BaseEntity {
  readonly projectId: Id;
  readonly platform: PlatformId;
  readonly priority: number;
  readonly planningNote: string;
  readonly createdAt: Iso8601;
}

export type PlatformId =
  | "youtube"
  | "bilibili"
  | "douyin"
  | "xiaohongshu"
  | "kuaishou"
  | "wechatVideo"
  | "wechatOfficial"
  | "kuaishou"
  | "wechatOfficialAccount"
  | "x";

export type ContentType = "video" | "image" | "audio" | "article";

export interface ContentOutput extends BaseEntity, Timestamped {
  readonly projectId: Id;
  readonly title: string;
  readonly contentType: ContentType;
  readonly format: string;
  readonly aspectRatio: string;
  readonly targetDurationSeconds: number;
  readonly status: OutputStatus;
  readonly primaryAssetId: Id | null;
}

export type OutputStatus =
  | "drafting"
  | "recording"
  | "editing"
  | "ready"
  | "published";

export type OutputStageName = "script" | "production" | "publishing" | "review";

export interface OutputStage extends BaseEntity {
  readonly contentOutputId: Id;
  readonly stage: OutputStageName;
  readonly status: StageStatus;
  readonly progressPct: number;
  readonly skipped: boolean;
  readonly startedAt: Iso8601 | null;
  readonly completedAt: Iso8601 | null;
  readonly updatedAt: Iso8601;
}

export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";
export type TaskPriority = 1 | 2 | 3 | 4 | 5;

export interface Task extends BaseEntity {
  readonly projectId: Id;
  readonly contentOutputId: Id | null;
  readonly stage: ProjectStageName | OutputStageName;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly dueAt: Iso8601 | null;
  readonly completedAt: Iso8601 | null;
}

export type MilestoneType = "plan" | "deliverable" | "checkpoint";
export type MilestoneStatus = "pending" | "completed" | "missed";

export interface Milestone extends BaseEntity {
  readonly projectId: Id;
  readonly title: string;
  readonly milestoneType: MilestoneType;
  readonly status: MilestoneStatus;
  readonly targetAt: Iso8601;
  readonly completedAt: Iso8601 | null;
}

export interface ProjectActivity extends BaseEntity {
  readonly projectId: Id;
  readonly eventType: string;
  readonly entityType: string;
  readonly entityId: Id;
  readonly eventData: Readonly<Record<string, unknown>>;
  readonly occurredAt: Iso8601;
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

export type ArtifactStage = ProjectStageName;
export type ArtifactType =
  | "project_idea"
  | "trend_analysis"
  | "market_analysis"
  | "competitor_analysis"
  | "audience_research"
  | "research_note"
  | "content_contract"
  | "thesis_tree"
  | "evidence_map"
  | "audience_profile"
  | "differentiation"
  | "content_outline"
  | "master_script"
  | "output_script"
  | "golden_quotes"
  | "script_review"
  | "production_plan"
  | "shot_list"
  | "timeline"
  | "subtitle_plan"
  | "export_config"
  | "publish_package"
  | "platform_copy"
  | "cover_copy"
  | "cover_brief"
  | "review_report"
  | "comparison_report"
  | "optimization_plan";

export type ArtifactStatus = "drafting" | "in_review" | "approved" | "archived";

export interface Artifact extends BaseEntity, Timestamped {
  readonly projectId: Id;
  readonly contentOutputId: Id | null;
  readonly currentVersionId: Id;
  readonly stage: ArtifactStage;
  readonly artifactType: ArtifactType;
  readonly title: string;
  readonly status: ArtifactStatus;
  readonly archivedAt: Iso8601 | null;
  // T-030-D4 (F1): provenance of current content. null ≡ user-authored/legacy;
  // "reconstructed" = AI history-back-inference (auto-fill), NOT user-confirmed.
  readonly origin: "user" | "reconstructed" | null;
}

export interface ArtifactVersion extends BaseEntity {
  readonly artifactId: Id;
  readonly versionNumber: number;
  readonly contentText: string;
  readonly contentData: Readonly<Record<string, unknown>>;
  readonly changeSummary: string;
  readonly createdByType: "user" | "ai" | "import";
  readonly aiTaskId: Id | null;
  readonly createdAt: Iso8601;
}

export type ArtifactRelationType =
  | "derived_from"
  | "references"
  | "replaces"
  | "supports"
  | "summarizes";

export interface ArtifactRelation extends BaseEntity {
  readonly sourceArtifactId: Id;
  readonly targetArtifactId: Id;
  readonly relationType: ArtifactRelationType;
  readonly createdAt: Iso8601;
}

export type ThesisNodeType =
  | "root"
  | "core_thesis"
  | "supporting"
  | "evidence"
  | "counterpoint";

export interface ThesisNode extends BaseEntity {
  readonly artifactVersionId: Id;
  readonly parentNodeId: Id | null;
  readonly nodeType: ThesisNodeType;
  readonly title: string;
  readonly content: string;
  readonly position: number;
}

export type ScriptSectionType =
  | "hook"
  | "intro"
  | "body"
  | "transition"
  | "outro"
  | "golden_quote";

export interface ScriptSection extends BaseEntity {
  readonly artifactVersionId: Id;
  readonly parentSectionId: Id | null;
  readonly sectionType: ScriptSectionType;
  readonly title: string;
  readonly content: string;
  readonly position: number;
  readonly startSeconds: number | null;
  readonly endSeconds: number | null;
}

export interface EvidenceLink extends BaseEntity {
  readonly artifactVersionId: Id;
  readonly thesisNodeId: Id | null;
  readonly knowledgeItemId: Id | null;
  readonly assetId: Id | null;
  readonly excerpt: string;
  /** Free-form per spec (EVIDENCE_LINK.relation_type is `string`). */
  readonly relationType: string;
  readonly confidence: number;
  readonly position: number;
}

export interface TimelineSegment extends BaseEntity {
  readonly artifactVersionId: Id;
  readonly scriptSectionId: Id | null;
  readonly title: string;
  readonly position: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly productionData: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Knowledge, assets, tags, learnings
// ---------------------------------------------------------------------------

export type KnowledgeType =
  | "note"
  | "reference"
  | "inspiration"
  | "snippet"
  | "transcript";

export type SourceType = "manual" | "web" | "import" | "ai";

export interface KnowledgeItem extends BaseEntity, Timestamped {
  readonly userId: Id;
  readonly currentRevisionId: Id;
  readonly knowledgeType: KnowledgeType;
  readonly title: string;
  readonly sourceType: SourceType;
  readonly sourceUrl: string | null;
  readonly sourceMetadata: Readonly<Record<string, unknown>>;
  readonly status: "active" | "archived";
  readonly archivedAt: Iso8601 | null;
}

export interface KnowledgeRevision extends BaseEntity {
  readonly knowledgeItemId: Id;
  readonly revisionNumber: number;
  readonly content: string;
  readonly structuredData: Readonly<Record<string, unknown>>;
  readonly createdAt: Iso8601;
}

export interface KnowledgeRelation extends BaseEntity {
  readonly sourceKnowledgeId: Id;
  readonly targetKnowledgeId: Id;
  /** Free-form per spec (KNOWLEDGE_RELATION.relation_type is `string`). */
  readonly relationType: string;
  readonly strength: number;
  readonly createdByType: "user" | "ai";
}

export type AssetType = "image" | "video" | "audio" | "document" | "subtitle";

export interface Asset extends BaseEntity, Timestamped {
  readonly userId: Id;
  readonly currentFileId: Id;
  readonly assetType: AssetType;
  readonly name: string;
  readonly description: string;
  readonly status: "active" | "archived" | "deleted";
  readonly deletedAt: Iso8601 | null;
}

export interface AssetFile extends BaseEntity {
  readonly assetId: Id;
  readonly versionNumber: number;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly checksum: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
  readonly mediaMetadata: Readonly<Record<string, unknown>>;
  readonly createdAt: Iso8601;
}

export type LearningType = "strategy" | "hook" | "structure" | "failure" | "process";
export type ValidationStatus = "candidate" | "validated" | "discarded";

export interface Learning extends BaseEntity, Timestamped {
  readonly userId: Id;
  readonly reviewId: Id | null;
  readonly learningType: LearningType;
  readonly title: string;
  readonly insight: string;
  readonly recommendation: string;
  readonly validationStatus: ValidationStatus;
  /**
   * Integer confidence per spec (LEARNING.confidence_score is `int`).
   * Expressed on a 0-100 scale.
   */
  readonly confidenceScore: number;
}

export interface LearningApplication extends BaseEntity {
  readonly learningId: Id;
  readonly projectId: Id;
  readonly contentOutputId: Id | null;
  readonly applicationNote: string;
  readonly outcome: Readonly<Record<string, unknown>>;
  readonly appliedAt: Iso8601;
  readonly evaluatedAt: Iso8601 | null;
}

export interface Tag extends BaseEntity {
  readonly userId: Id;
  readonly name: string;
  readonly color: string;
  readonly createdAt: Iso8601;
}

export type TagEntityType =
  | "project"
  | "artifact"
  | "knowledge"
  | "asset"
  | "learning"
  | "publication";

export interface EntityTag extends BaseEntity {
  readonly tagId: Id;
  readonly entityType: TagEntityType;
  readonly entityId: Id;
}

// ---------------------------------------------------------------------------
// Resource association tables
// ---------------------------------------------------------------------------

export interface ProjectKnowledge extends BaseEntity {
  readonly projectId: Id;
  readonly knowledgeItemId: Id;
  readonly relationType: string;
}

export interface ProjectAsset extends BaseEntity {
  readonly projectId: Id;
  readonly assetId: Id;
  readonly usageType: string;
}

export interface ArtifactKnowledge extends BaseEntity {
  readonly artifactId: Id;
  readonly knowledgeItemId: Id;
  readonly citationNote: string;
}

export interface ArtifactAsset extends BaseEntity {
  readonly artifactId: Id;
  readonly assetId: Id;
  readonly usageType: string;
  readonly position: number;
}

export interface OutputAsset extends BaseEntity {
  readonly contentOutputId: Id;
  readonly assetId: Id;
  readonly role: string;
}

// ---------------------------------------------------------------------------
// Production, Publishing, Analytics
// ---------------------------------------------------------------------------

export type ProductionMode = "remote_recording" | "screen_capture" | "studio";
export type ProductionStatus =
  | "drafting"
  | "recording"
  | "editing"
  | "rendering"
  | "ready";

export interface Production extends BaseEntity {
  readonly contentOutputId: Id;
  readonly productionMode: ProductionMode;
  readonly status: ProductionStatus;
  readonly recordingConfig: Readonly<Record<string, unknown>>;
  readonly subtitleConfig: Readonly<Record<string, unknown>>;
  readonly startedAt: Iso8601 | null;
  readonly completedAt: Iso8601 | null;
  readonly updatedAt: Iso8601;
}

export interface ProductionSegment extends BaseEntity {
  readonly productionId: Id;
  readonly scriptSectionId: Id | null;
  readonly title: string;
  readonly position: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly segmentConfig: Readonly<Record<string, unknown>>;
}

export interface SegmentAsset extends BaseEntity {
  readonly productionSegmentId: Id;
  readonly assetId: Id;
  readonly usageType: "video" | "broll" | "overlay" | "audio" | "caption";
  readonly position: number;
}

export interface ExportRecord extends BaseEntity {
  readonly productionId: Id;
  readonly resultAssetId: Id;
  readonly format: string;
  readonly resolution: string;
  readonly aspectRatio: string;
  readonly bitrate: number;
  readonly status: "queued" | "rendering" | "ready" | "failed";
  readonly exportConfig: Readonly<Record<string, unknown>>;
  readonly createdAt: Iso8601;
  readonly completedAt: Iso8601 | null;
}

export type PublicationStatus =
  | "draft"
  | "scheduled"
  | "published"
  | "removed"
  | "failed";

export interface Publication extends BaseEntity, Timestamped {
  readonly contentOutputId: Id;
  readonly platform: PlatformId;
  readonly accountReference: string;
  readonly status: PublicationStatus;
  readonly currentRevisionId: Id;
  readonly externalId: string | null;
  readonly externalUrl: string | null;
  readonly scheduledAt: Iso8601 | null;
  readonly publishedAt: Iso8601 | null;
  readonly removedAt: Iso8601 | null;
}

export interface PublicationRevision extends BaseEntity {
  readonly publicationId: Id;
  readonly revisionNumber: number;
  readonly title: string;
  readonly description: string;
  readonly coverAssetId: Id | null;
  readonly category: string;
  readonly series: string;
  readonly platformTags: ReadonlyArray<string>;
  readonly platformSettings: Readonly<Record<string, unknown>>;
  readonly createdAt: Iso8601;
}

export interface MetricSnapshot extends BaseEntity {
  readonly publicationId: Id;
  readonly ingestionRunId: Id | null;
  readonly capturedAt: Iso8601;
  readonly source: string;
  readonly rawMetrics: Readonly<Record<string, unknown>>;
  readonly createdAt: Iso8601;
}

export interface MetricValue extends BaseEntity {
  readonly metricSnapshotId: Id;
  readonly metricKey: string;
  readonly numericValue: number;
  readonly unit: string;
  readonly dimensions: Readonly<Record<string, string>>;
}

export interface RetentionPoint extends BaseEntity {
  readonly publicationId: Id;
  readonly capturedAt: Iso8601;
  readonly positionMs: number;
  readonly retentionRate: number;
  readonly viewerCount: number;
}

export type DimensionType =
  | "age"
  | "gender"
  | "region"
  | "source"
  | "device";

export interface AudienceSnapshot extends BaseEntity {
  readonly publicationId: Id;
  readonly capturedAt: Iso8601;
  readonly dimensionType: DimensionType;
  readonly dimensionValue: string;
  readonly percentage: number;
  readonly audienceCount: number;
}

export type ReviewType = "project" | "output";
export type ReviewStatus = "in_progress" | "completed" | "abandoned";

export interface Review extends BaseEntity {
  readonly projectId: Id;
  readonly contentOutputId: Id | null;
  readonly reportArtifactId: Id | null;
  readonly reviewType: ReviewType;
  readonly status: ReviewStatus;
  readonly periodStart: Iso8601;
  readonly periodEnd: Iso8601;
  readonly createdAt: Iso8601;
  readonly completedAt: Iso8601 | null;
}

export interface ReviewPublication extends BaseEntity {
  readonly reviewId: Id;
  readonly publicationId: Id;
}

export type InsightType = "success" | "issue" | "action" | "hypothesis";

export interface ReviewInsight extends BaseEntity {
  readonly reviewId: Id;
  readonly insightType: InsightType;
  readonly title: string;
  readonly description: string;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly priority: number;
}

// ---------------------------------------------------------------------------
// AI & System
// ---------------------------------------------------------------------------

export interface AIConversation extends BaseEntity {
  readonly userId: Id;
  readonly projectId: Id | null;
  readonly title: string;
  readonly createdAt: Iso8601;
  readonly updatedAt: Iso8601;
}

export type AIMessageRole = "user" | "assistant" | "system";

export interface AIMessage extends BaseEntity {
  readonly conversationId: Id;
  readonly role: AIMessageRole;
  readonly content: string;
  readonly attachments: ReadonlyArray<Id>;
  readonly modelMetadata: Readonly<Record<string, unknown>>;
  readonly createdAt: Iso8601;
}

export type AITaskStatus =
  | "queued"
  | "running"
  | "awaiting_confirmation"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface AITask extends BaseEntity {
  readonly userId: Id;
  readonly projectId: Id | null;
  readonly contentOutputId: Id | null;
  readonly taskType: string;
  readonly status: AITaskStatus;
  readonly inputData: Readonly<Record<string, unknown>>;
  readonly modelKey: string;
  readonly idempotencyKey: string;
  readonly requestedAt: Iso8601;
  readonly startedAt: Iso8601 | null;
  readonly completedAt: Iso8601 | null;
  readonly errorMessage: string | null;
}

export interface ModelConfiguration extends BaseEntity {
  readonly userId: Id;
  readonly capability: string;
  readonly provider: string;
  readonly modelName: string;
  readonly secretReference: string;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly isDefault: boolean;
}

export type NotificationType =
  | "task"
  | "publish"
  | "import"
  | "system"
  | "ai";

export interface Notification extends BaseEntity {
  readonly userId: Id;
  readonly notificationType: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly entityType: string;
  readonly entityId: Id;
  readonly readAt: Iso8601 | null;
  readonly createdAt: Iso8601;
}

export interface SearchHistory extends BaseEntity {
  readonly userId: Id;
  readonly query: string;
  readonly filters: Readonly<Record<string, unknown>>;
  readonly resultCount: number;
  readonly searchedAt: Iso8601;
}

export interface AITaskReference extends BaseEntity {
  readonly aiTaskId: Id;
  readonly entityType: string;
  readonly entityId: Id;
  readonly relationType: string;
}

export interface AITaskResult extends BaseEntity {
  readonly aiTaskId: Id;
  readonly resultType: string;
  readonly artifactId: Id | null;
  readonly knowledgeItemId: Id | null;
  readonly assetId: Id | null;
  readonly resultData: Readonly<Record<string, unknown>>;
}

export interface AgentConfiguration extends BaseEntity {
  readonly userId: Id;
  readonly name: string;
  readonly agentType: string;
  readonly status: string;
  readonly capabilities: Readonly<Record<string, unknown>>;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly secretReference: string;
  readonly createdAt: Iso8601;
  readonly updatedAt: Iso8601;
}

export interface ExternalSource extends BaseEntity {
  readonly userId: Id;
  readonly sourceType: string;
  readonly name: string;
  readonly sourceIdentifier: string;
  readonly secretReference: string;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly createdAt: Iso8601;
}

export interface IngestionRun extends BaseEntity {
  readonly externalSourceId: Id;
  readonly runType: string;
  readonly idempotencyKey: string;
  readonly status: string;
  readonly recordsReceived: number;
  readonly recordsWritten: number;
  readonly recordsRejected: number;
  readonly startedAt: Iso8601 | null;
  readonly completedAt: Iso8601 | null;
}

export interface IngestionError extends BaseEntity {
  readonly ingestionRunId: Id;
  readonly recordKey: string;
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly rejectedPayload: Readonly<Record<string, unknown>>;
}

export interface SearchDocument extends BaseEntity {
  readonly userId: Id;
  readonly entityType: string;
  readonly entityId: Id;
  readonly title: string;
  readonly body: string;
  readonly searchText: string;
  readonly embedding: ReadonlyArray<number>;
  readonly indexedAt: Iso8601;
}
