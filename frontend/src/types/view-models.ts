/**
 * Page-level ViewModel types.
 *
 * Pages consume ViewModels, never raw domain entities. Selectors in
 * `src/fixtures/selectors/**` are responsible for shaping canonical data into
 * these view-specific projections.
 */

import type {
  ContentOutput,
  ContentType,
  CreationMode,
  Id,
  Iso8601,
  OutputStageName,
  PlatformId,
  ProjectSource,
  ProjectStageName,
  ProjectStatus,
  PublicationStatus,
  StageStatus,
  TaskStatus,
  Visibility,
} from "./domain";

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

export interface MetricCard {
  readonly id: Id;
  readonly label: string;
  readonly value: string;
  readonly delta: string;
  readonly trend: "up" | "down" | "flat";
  readonly tone: "neutral" | "positive" | "negative" | "warning" | "info";
}

export interface StatusTab {
  readonly id: Id;
  readonly label: string;
  readonly count: number;
  readonly active: boolean;
}

export interface PlatformBadge {
  readonly id: PlatformId;
  readonly label: string;
}

export interface ViewModelError {
  readonly code: string;
  readonly message: string;
}

export interface BasePageViewModel {
  readonly scenario: "default" | "empty" | "loading" | "error" | "selected";
  readonly kind: PageKind;
  readonly loading: boolean;
  readonly error: ViewModelError | null;
}

// ---------------------------------------------------------------------------
// Page kinds
// ---------------------------------------------------------------------------

export type PageKind =
  | "dashboard"
  | "projects"
  | "new-project"
  | "project-overview"
  | "research"
  | "planning"
  | "script"
  | "production"
  | "publishing"
  | "analytics-review"
  | "knowledge"
  | "assets"
  | "publishing-center"
  | "experience"
  | "search"
  | "ai-copilot"
  | "settings";

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface ContinueCreating {
  readonly heading: string;
  readonly projectId: Id;
  readonly projectTitle: string;
  readonly stage: ProjectStageName;
  readonly progressPct: number;
  readonly updatedAt: Iso8601;
}

export interface TodoRow {
  readonly id: Id;
  readonly title: string;
  readonly projectId: Id;
  readonly projectTitle: string;
  readonly stage: ProjectStageName | OutputStageName;
  readonly dueAt: Iso8601 | null;
  readonly priority: 1 | 2 | 3 | 4 | 5;
  readonly status: TaskStatus;
}

export interface TopicRow {
  readonly id: Id;
  readonly title: string;
  readonly heat: number;
  readonly trend: "up" | "down" | "flat";
}

export interface PublicationCompactRow {
  readonly id: Id;
  readonly title: string;
  readonly platform: PlatformId;
  readonly status: PublicationStatus;
  readonly views: number;
  readonly engagement: number;
  readonly publishedAt: Iso8601;
}

export interface DataOverview {
  readonly metrics: ReadonlyArray<MetricCard>;
  readonly trend: ReadonlyArray<{ label: string; value: number }>;
}

export interface CreationSuggestion {
  readonly id: Id;
  readonly title: string;
  readonly description: string;
  readonly category: string;
}

export interface DashboardViewModel extends BasePageViewModel {
  readonly kind: "dashboard";
  readonly metrics: ReadonlyArray<MetricCard>;
  readonly continueCreating: ContinueCreating;
  readonly todos: ReadonlyArray<TodoRow>;
  readonly trendingTopics: ReadonlyArray<TopicRow>;
  readonly recentPublications: ReadonlyArray<PublicationCompactRow>;
  readonly dataOverview: DataOverview;
  readonly suggestions: ReadonlyArray<CreationSuggestion>;
  readonly assistantPrompt: string;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface ProjectListRow {
  readonly id: Id;
  readonly title: string;
  readonly brief: string;
  readonly contentCategory: string;
  readonly status: ProjectStatus;
  readonly currentStage: ProjectStageName;
  readonly progressPct: number;
  readonly platforms: ReadonlyArray<PlatformBadge>;
  readonly updatedAt: Iso8601;
  readonly primaryOutputId: Id;
  readonly outputs: ReadonlyArray<ContentOutputSummary>;
  readonly starred: boolean;
  // 数据底座:项目来源(imported = 真实导入的已发布历史作品)。读侧据此把状态显示为
  //   「已发布」而非阶段态(导入作品 currentStage='review' 不该渲染成「复盘中/进行中」)。
  readonly source: ProjectSource;
  // 真实发布时刻(导入作品 platformRef.publishedAt;非导入无 → null)。列表按它倒序。
  readonly publishedAt: Iso8601 | null;
}

export interface ContentOutputSummary {
  readonly id: Id;
  readonly title: string;
  readonly contentType: ContentType;
  readonly status: ContentOutput["status"];
}

export interface ProjectsViewModel extends BasePageViewModel {
  readonly kind: "projects";
  readonly tabs: ReadonlyArray<StatusTab>;
  readonly rows: ReadonlyArray<ProjectListRow>;
  readonly selectedId: Id | null;
}

// ---------------------------------------------------------------------------
// New Project overlay
// ---------------------------------------------------------------------------

export interface PlatformOption {
  readonly id: PlatformId;
  readonly label: string;
  readonly selected: boolean;
}

export interface ContentTypeOption {
  readonly id: ContentType;
  readonly label: string;
  readonly description: string;
}

export interface CreationModeOption {
  readonly id: CreationMode;
  readonly label: string;
  readonly description: string;
  readonly recommended: boolean;
}

export interface NewProjectViewModel extends BasePageViewModel {
  readonly kind: "new-project";
  readonly draft: {
    readonly name: string;
    readonly brief: string;
    readonly platforms: ReadonlyArray<PlatformOption>;
    readonly contentType: ContentTypeOption;
    readonly creationMode: CreationModeOption;
    readonly enterAfterCreate: boolean;
    readonly visibility: Visibility;
  };
  readonly errors: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Project Overview
// ---------------------------------------------------------------------------

export interface ProjectOverviewViewModel extends BasePageViewModel {
  readonly kind: "project-overview";
  readonly projectId: Id;
  readonly projectTitle: string;
  // 项目来源(契约 projectResource.source)。`imported` = 真实导入的已发布历史作品 →
  // 概览页突出「复盘」而非「继续创作」(L1 立项简化,SPEC §3.1)。缺省按 manual 语义。
  readonly source?: ProjectSource;
  readonly stage: ProjectStageName;
  readonly progressPct: number;
  readonly stages: ReadonlyArray<{
    readonly stage: ProjectStageName;
    readonly status: StageStatus;
    readonly progressPct: number;
  }>;
  readonly assetStats: ReadonlyArray<MetricCard>;
  readonly recentFiles: ReadonlyArray<{
    readonly id: Id;
    readonly name: string;
    readonly type: string;
    /** Coarse icon hint for the row — `document`, `script`, `shot`, `data`. */
    readonly fileKind: "document" | "script" | "shot" | "data";
    readonly updatedAt: Iso8601;
  }>;
  readonly activities: ReadonlyArray<{
    readonly id: Id;
    readonly title: string;
    readonly occurredAt: Iso8601;
    readonly tone: "info" | "positive" | "warning";
    /** Source activity event type, used to drive the actor label slot. */
    readonly eventType: string;
  }>;
  readonly projectInfo: ReadonlyArray<{ readonly label: string; readonly value: string }>;
  // 结构化 Brief(立项 Brief 地基)—— current_stage===brief 时立项工作台读它做初值。
  // 缺省时(老 VM / 非 brief 阶段)为 undefined,工作台按空 Brief 渲染。
  readonly briefDetail?: {
    readonly targetAudience?: string;
    readonly contentGoal?: string;
    readonly contentFormat?: string;
    readonly orientation?: "landscape" | "portrait";
    readonly targetPlatforms: ReadonlyArray<string>;
    readonly durationEstimate?: string;
    readonly coreMessage?: string;
    readonly successCriteria?: string;
  };
  readonly outputs: ReadonlyArray<ContentOutputSummary>;
  readonly publishing: ReadonlyArray<{
    readonly id: Id;
    readonly platform: PlatformId;
    readonly status: PublicationStatus;
    readonly publishedAt: Iso8601 | null;
  }>;
  readonly milestones: ReadonlyArray<{
    readonly id: Id;
    readonly title: string;
    readonly targetAt: Iso8601;
    readonly status: "pending" | "completed" | "missed";
  }>;
}

// ---------------------------------------------------------------------------
// Research workspace
// ---------------------------------------------------------------------------

export interface ResearchSummaryCard {
  readonly id: Id;
  readonly title: string;
  readonly metric: string;
  readonly description: string;
  readonly tone: "info" | "positive" | "warning" | "negative";
}

export interface ResearchSourceRow {
  readonly id: Id;
  readonly title: string;
  readonly source: string;
  readonly capturedAt: Iso8601;
  readonly tags: ReadonlyArray<string>;
}

export interface ResearchViewModel extends BasePageViewModel {
  readonly kind: "research";
  readonly projectId: Id;
  readonly idea: { readonly title: string; readonly summary: string };
  readonly trendCards: ReadonlyArray<ResearchSummaryCard>;
  readonly sourceTabs: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly sources: ReadonlyArray<ResearchSourceRow>;
  // `knowledgeId` (Module 06 F2a/F2b): a research note / evidence row is a
  // KnowledgeItem surfaced via the project's knowledge list. The island uses it
  // as the `knowledgeId` op param. `targetKnowledgeId` on evidence is the link
  // target for `关联证据` → knowledge.relations.create (open-question #4: the
  // join read path lands in Wave 4; the selector resolves it from canonical now).
  readonly notes: ReadonlyArray<{
    readonly id: Id;
    readonly content: string;
    readonly knowledgeId: Id;
  }>;
  readonly evidence: ReadonlyArray<{
    readonly id: Id;
    readonly title: string;
    readonly type: string;
    readonly knowledgeId: Id;
    readonly targetKnowledgeId: Id;
  }>;
  readonly relatedTags: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// Planning workspace
// ---------------------------------------------------------------------------

export interface ContractCard {
  readonly id: Id;
  readonly title: string;
  readonly description: string;
  readonly status: "drafting" | "approved";
}

export interface ThesisNodeView {
  readonly id: Id;
  readonly column: "core" | "support" | "evidence" | "counter";
  readonly title: string;
  readonly summary: string;
}

export interface PlanningViewModel extends BasePageViewModel {
  readonly kind: "planning";
  readonly projectId: Id;
  readonly tabs: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly contracts: ReadonlyArray<ContractCard>;
  readonly coreThesis: { readonly id: Id; readonly title: string; readonly body: string };
  readonly thesisTree: ReadonlyArray<ThesisNodeView>;
  readonly evidenceMap: ReadonlyArray<{ readonly id: Id; readonly title: string; readonly confidence: number }>;
  readonly keyMaterials: ReadonlyArray<{ readonly id: Id; readonly title: string; readonly type: string }>;
}

// ---------------------------------------------------------------------------
// Script workspace
// ---------------------------------------------------------------------------

export interface ScriptSectionView {
  readonly id: Id;
  readonly type: "hook" | "intro" | "body" | "transition" | "outro" | "golden_quote";
  readonly heading: string;
  readonly body: string;
  readonly emphasis: boolean;
  readonly startSeconds: number | null;
  readonly endSeconds: number | null;
}

export interface ScriptViewModel extends BasePageViewModel {
  readonly kind: "script";
  readonly projectId: Id;
  /** The 分镜脚本 (output_script) artifact id the script.draft node appends a version to. */
  readonly scriptArtifactId: Id | null;
  /** The project's 选题/立意 — feeds the script.draft agent's creative context. */
  readonly topic: string;
  readonly tabs: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly sections: ReadonlyArray<ScriptSectionView>;
  readonly outline: ReadonlyArray<{ readonly id: Id; readonly heading: string; readonly position: number }>;
  readonly aiSuggestions: ReadonlyArray<{ readonly id: Id; readonly title: string; readonly body: string }>;
  readonly goldenQuotes: ReadonlyArray<{ readonly id: Id; readonly text: string }>;
  readonly versions: ReadonlyArray<{ readonly id: Id; readonly label: string; readonly createdAt: Iso8601 }>;
  readonly toolbarState: {
    readonly wordCount: number;
    readonly savedAt: Iso8601;
    readonly status: "saved" | "saving" | "dirty";
  };
}

// ---------------------------------------------------------------------------
// Production workspace
// ---------------------------------------------------------------------------

export interface ProductionAsset {
  readonly id: Id;
  readonly name: string;
  readonly type: "image" | "video" | "audio" | "document" | "subtitle";
  readonly durationLabel: string | null;
}

export interface ProductionViewModel extends BasePageViewModel {
  readonly kind: "production";
  readonly projectId: Id;
  readonly mode: "remote_recording" | "screen_capture" | "studio";
  readonly scriptLines: ReadonlyArray<{ readonly id: Id; readonly text: string; readonly timestamp: string }>;
  readonly assetCategories: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly assets: ReadonlyArray<ProductionAsset>;
  readonly preview: { readonly posterLabel: string; readonly durationLabel: string };
  readonly settings: ReadonlyArray<{
    readonly group: "recording" | "subtitle" | "export";
    readonly items: ReadonlyArray<{ readonly id: Id; readonly label: string; readonly value: string }>;
  }>;
  readonly timeline: ReadonlyArray<{ readonly id: Id; readonly title: string; readonly startLabel: string; readonly endLabel: string }>;
}

// ---------------------------------------------------------------------------
// Publishing workspace
// ---------------------------------------------------------------------------

export interface PlatformPublishCard {
  readonly id: Id;
  readonly platform: PlatformId;
  readonly accountLabel: string;
  readonly status: PublicationStatus;
  readonly scheduledAt: Iso8601 | null;
}

export interface PublishChecklistItem {
  readonly id: Id;
  readonly label: string;
  readonly checked: boolean;
}

export interface PublishingViewModel extends BasePageViewModel {
  readonly kind: "publishing";
  readonly projectId: Id;
  readonly tabs: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly form: {
    readonly title: string;
    readonly description: string;
    readonly coverLabel: string;
    readonly tags: ReadonlyArray<string>;
    readonly category: string;
    readonly series: string;
  };
  readonly platforms: ReadonlyArray<PlatformPublishCard>;
  readonly preview: { readonly title: string; readonly description: string; readonly platform: PlatformId };
  readonly checklist: ReadonlyArray<PublishChecklistItem>;
  readonly tips: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// Analytics & Review
// ---------------------------------------------------------------------------

export interface TopPublishedCard {
  readonly id: Id;
  readonly title: string;
  readonly platform: string;
  readonly views: string;
  readonly tone: "primary" | "compact";
}

// REV-2 对比分析 tab — one row per publication of the project, derived by
// grouping the analytics snapshots by publicationId. Empty `rows` (<2 pubs)
// renders the honest "需 2 个发布才能对比" empty state.
export interface ComparisonRow {
  readonly id: Id;
  readonly title: string;
  readonly platform: string;
  readonly plays: number;
  readonly finishRate: number;
  readonly likeRate: number;
  readonly shareRate: number;
  /** "best" / "worst" highlight on the plays column; "" for the rest. */
  readonly highlight: "best" | "worst" | "";
}

export interface ComparisonTab {
  readonly rows: ReadonlyArray<ComparisonRow>;
}

// REV-1 收益分析 tab — the project's monetization funnel (曝光→线索→成交→金额)
// + the products its outputs are linked to. Empty (no leads/conversions /
// products) renders the honest empty state.
export interface RevenueFunnelStage {
  readonly label: string;
  readonly value: number;
}

export interface RevenueProductRow {
  readonly id: Id;
  readonly name: string;
  readonly tier: string;
  readonly contentRole: string;
}

export interface RevenueTab {
  readonly funnel: ReadonlyArray<RevenueFunnelStage>;
  readonly revenueAttributed: number;
  readonly unattributedRatio: number;
  readonly products: ReadonlyArray<RevenueProductRow>;
}

export interface AnalyticsViewModel extends BasePageViewModel {
  readonly kind: "analytics-review";
  readonly projectId: Id;
  readonly tabs: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly metrics: ReadonlyArray<MetricCard>;
  readonly viewsTrend: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  readonly conversionFunnel: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  readonly audienceProfile: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  readonly audienceSource: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  readonly retentionCurve: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  readonly keyMoments: ReadonlyArray<{ readonly id: Id; readonly label: string; readonly value: string }>;
  readonly topPublished: ReadonlyArray<TopPublishedCard>;
  readonly aiAnalysis: ReadonlyArray<{ readonly id: Id; readonly title: string; readonly body: string }>;
  readonly reviewHistory: ReadonlyArray<{
    readonly id: Id;
    readonly title: string;
    readonly completedAt: Iso8601;
    readonly tone: "positive" | "warning" | "neutral";
  }>;
  // REV-2 对比分析 / REV-1 收益分析 tabs. Optional + additive: pages that don't
  // render these tabs ignore them; absence means "no real data" → empty state.
  readonly comparison?: ComparisonTab;
  readonly revenue?: RevenueTab;
  // 复盘每作品评论 (T-030 §10 / D6) — the current 作品 的真实评论 (前 100 条), read from
  // `publications.comments.list`. Optional + additive: absent / empty → 复盘页评论区渲染
  // 诚实空态(去任务中心配「抓我作品评论」采集),绝不摆假评论 (宪法 §8 / T-010)。
  readonly comments?: ReadonlyArray<ReviewCommentItem>;
}

// 复盘每作品评论条目 (T-030 D6) — 一条真实评论文本 (+ 需求标签 demand_tag 若有)。
export interface ReviewCommentItem {
  readonly id: Id;
  readonly text: string;
  readonly demandTag: string | null;
  readonly createdAt: Iso8601;
}

// ---------------------------------------------------------------------------
// Knowledge & Memory
// ---------------------------------------------------------------------------

export interface KnowledgeCategory {
  readonly id: Id;
  readonly label: string;
  readonly count: number;
}

export interface KnowledgeRow {
  readonly id: Id;
  readonly title: string;
  readonly knowledgeType: "note" | "reference" | "inspiration" | "snippet" | "transcript";
  readonly tags: ReadonlyArray<string>;
  readonly updatedAt: Iso8601;
}

export interface KnowledgeInsight {
  readonly id: Id;
  readonly title: string;
  readonly body: string;
}

export interface KnowledgeViewModel extends BasePageViewModel {
  readonly kind: "knowledge";
  readonly metrics: ReadonlyArray<MetricCard>;
  readonly categories: ReadonlyArray<KnowledgeCategory>;
  readonly recent: ReadonlyArray<KnowledgeRow>;
  readonly popularTags: ReadonlyArray<{ readonly tag: string; readonly weight: number }>;
  readonly insights: ReadonlyArray<KnowledgeInsight>;
  readonly unsorted: ReadonlyArray<KnowledgeRow>;
  readonly snippets: ReadonlyArray<KnowledgeRow>;
  readonly graph: ReadonlyArray<{
    readonly id: Id;
    readonly label: string;
    readonly column: number;
    readonly row: number;
  }>;
}

// ---------------------------------------------------------------------------
// Assets Center
// ---------------------------------------------------------------------------

export interface AssetCardView {
  readonly id: Id;
  readonly name: string;
  readonly assetType: "image" | "video" | "audio" | "document" | "subtitle";
  readonly sizeLabel: string;
  readonly durationLabel: string | null;
  readonly updatedAt: Iso8601;
  readonly thumbnail: { readonly kind: "color"; readonly value: string };
}

export interface AssetDetail {
  readonly id: Id;
  readonly name: string;
  readonly assetType: AssetCardView["assetType"];
  readonly description: string;
  readonly metadata: ReadonlyArray<{ readonly label: string; readonly value: string }>;
  readonly tags: ReadonlyArray<string>;
  readonly usage: ReadonlyArray<{ readonly id: Id; readonly title: string; readonly usedAt: Iso8601 }>;
}

export interface AssetsViewModel extends BasePageViewModel {
  readonly kind: "assets";
  readonly typeSidebar: ReadonlyArray<{ readonly id: string; readonly label: string; readonly count: number }>;
  readonly assets: ReadonlyArray<AssetCardView>;
  readonly detail: AssetDetail;
  readonly storage: {
    readonly usedLabel: string;
    readonly totalLabel: string;
    readonly percent: number;
  };
}

// ---------------------------------------------------------------------------
// Publishing Center
// ---------------------------------------------------------------------------

export interface PublicationPerformanceRow {
  readonly id: Id;
  readonly title: string;
  readonly projectId: Id;
  readonly projectTitle: string;
  readonly platform: PlatformId;
  readonly publishedAt: Iso8601;
  readonly status: PublicationStatus;
  readonly views: number;
  readonly engagement: number;
}

export interface PublishingCenterViewModel extends BasePageViewModel {
  readonly kind: "publishing-center";
  readonly contentTabs: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly rows: ReadonlyArray<PublicationPerformanceRow>;
  readonly metrics: ReadonlyArray<MetricCard>;
  readonly platformComparison: ReadonlyArray<{ readonly platform: PlatformId; readonly value: number }>;
  readonly trend: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  readonly topContent: ReadonlyArray<{ readonly id: Id; readonly title: string; readonly value: string }>;
}

// ---------------------------------------------------------------------------
// Experience Center
// ---------------------------------------------------------------------------

export interface ExperienceCategory {
  readonly id: Id;
  readonly label: string;
  readonly count: number;
  readonly tone: "positive" | "warning" | "info" | "neutral";
}

export interface ExperienceViewModel extends BasePageViewModel {
  readonly kind: "experience";
  readonly tabs: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly summaryCards: ReadonlyArray<MetricCard>;
  readonly recentDiscoveries: ReadonlyArray<{
    readonly id: Id;
    readonly title: string;
    readonly effect: string;
    readonly occurredAt: Iso8601;
  }>;
  readonly categories: ReadonlyArray<ExperienceCategory>;
  readonly recentRecords: ReadonlyArray<{
    readonly id: Id;
    readonly title: string;
    readonly type: string;
    readonly status: "candidate" | "validated" | "discarded";
    readonly updatedAt: Iso8601;
  }>;
  readonly valueOverview: ReadonlyArray<MetricCard>;
  readonly applicationEffect: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  readonly popularExperiences: ReadonlyArray<{ readonly id: Id; readonly title: string; readonly appliedCount: number }>;
  readonly quickActions: ReadonlyArray<{ readonly id: Id; readonly label: string }>;
}

// ---------------------------------------------------------------------------
// Global Search
// ---------------------------------------------------------------------------

export interface SearchResultProjectCard {
  readonly id: Id;
  readonly title: string;
  readonly stage: ProjectStageName;
  readonly progressPct: number;
  readonly snippet: string;
}

export interface SearchResultAssetCard {
  readonly id: Id;
  readonly title: string;
  readonly assetType: AssetCardView["assetType"];
}

export interface SearchResultKnowledgeCard {
  readonly id: Id;
  readonly title: string;
  readonly excerpt: string;
  readonly tags: ReadonlyArray<string>;
}

export interface SearchResultVideoCard {
  readonly id: Id;
  readonly title: string;
  readonly platform: PlatformId;
  readonly durationLabel: string;
}

export interface SearchViewModel extends BasePageViewModel {
  readonly kind: "search";
  readonly query: string;
  readonly resultTabs: ReadonlyArray<{ readonly id: string; readonly label: string; readonly count: number }>;
  readonly projects: ReadonlyArray<SearchResultProjectCard>;
  readonly knowledge: ReadonlyArray<SearchResultKnowledgeCard>;
  readonly assets: ReadonlyArray<SearchResultAssetCard>;
  readonly videos: ReadonlyArray<SearchResultVideoCard>;
  readonly filters: ReadonlyArray<{ readonly id: string; readonly label: string; readonly options: ReadonlyArray<string> }>;
  readonly quickActions: ReadonlyArray<{ readonly id: Id; readonly label: string }>;
  readonly history: ReadonlyArray<{ readonly id: Id; readonly query: string; readonly searchedAt: Iso8601 }>;
  readonly tips: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// AI Copilot
// ---------------------------------------------------------------------------

export interface AIConversationView {
  readonly id: Id;
  readonly title: string;
  readonly preview: string;
  readonly updatedAt: Iso8601;
}

export interface AICopilotViewModel extends BasePageViewModel {
  readonly kind: "ai-copilot";
  readonly prompt: string;
  readonly chips: ReadonlyArray<{ readonly id: Id; readonly label: string }>;
  readonly recommendedCommands: ReadonlyArray<{ readonly id: Id; readonly label: string; readonly description: string }>;
  readonly recentTasks: ReadonlyArray<{ readonly id: Id; readonly title: string; readonly tone: "info" | "success" | "warning" }>;
  readonly continuingTasks: ReadonlyArray<AIConversationView>;
  readonly quickEntries: ReadonlyArray<{ readonly id: Id; readonly label: string }>;
  readonly smartRecommendations: ReadonlyArray<{ readonly id: Id; readonly title: string; readonly body: string }>;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface SettingsRow {
  readonly id: Id;
  readonly label: string;
  readonly description: string;
  readonly control: "toggle" | "select" | "text" | "button";
  readonly value: string;
}

export interface SettingsViewModel extends BasePageViewModel {
  readonly kind: "settings";
  readonly tabs: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly account: ReadonlyArray<SettingsRow>;
  readonly preferences: ReadonlyArray<SettingsRow>;
  readonly system: ReadonlyArray<SettingsRow>;
  readonly storage: {
    readonly usedLabel: string;
    readonly totalLabel: string;
    readonly percent: number;
    readonly breakdown: ReadonlyArray<{ readonly label: string; readonly value: string }>;
  };
  readonly models: ReadonlyArray<{ readonly id: Id; readonly capability: string; readonly modelName: string; readonly isDefault: boolean }>;
  readonly other: ReadonlyArray<SettingsRow>;
}
