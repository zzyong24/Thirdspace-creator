import { createHash } from "node:crypto";
import type { RequestContext } from "@creatoros/contract";
import type {
  ProjectRepository,
  ProjectRow,
  StageRow,
  ContentOutputRow,
  OutputStageRow,
  TaskRow,
  ActivityRow,
  TargetPlatformRow,
} from "./projects.repository";
import {
  StageTransitionError,
  OutputStateError,
  TaskStateError,
  ProjectStateError,
  StageGateError,
  OwnershipError,
  requireAccountId,
} from "./projects.errors";

// Projects service (foundation §5.3) — all public methods (ctx, command). The
// service OWNS the state machines (SPEC §12); the repository only executes
// approved writes. Cross-row creates run as one Unit-of-Work (SPEC §11). The
// service is the only entry other modules import (via index.ts).

export interface ServiceDeps {
  now: () => string; // ISO-8601 clock (deterministic in tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
}

// §15/§16 内容门禁的只读数据源端口。每个阶段离开(完成)前,gate 经这些注入的
// reader 查对应模块的真实交付物(artifacts / production / publishing / reviews);
// 模块的所有权 / user-scope 由各自的公共 service 内部保证。注入是惰性的:
// projectsService 先于这些 peer service 在 composition root 创建,所以 reader 通过
// 一个可变 holder 后置绑定(见 createProjectsService 的 gateReadersRef 参数)。
// reader 缺失(holder 未绑定 / 某 reader 为 undefined)=== 该阶段「无可用数据源」,
// gate 诚实跳过该项,不编造缺失。
export interface StageGateReaders {
  // research → 该 project 下是否存在研究类 artifact(research_note / trend_analysis
  // 等)或内容合同前置。判定接 artifacts.listProjectArtifacts(按 artifactType)。
  listProjectArtifactTypes?: (
    ctx: RequestContext,
    projectId: string,
  ) => Promise<string[]>;
  // production → 该 project 的 ContentOutput 是否有 production 进到 ready
  // (ProductionItem「关键项 done」的真实承载是 productions.status='ready')。
  hasReadyProduction?: (
    ctx: RequestContext,
    projectId: string,
  ) => Promise<boolean>;
  // publishing → 该 project 是否存在 publication(PublishPackage/Publication)。
  hasPublication?: (
    ctx: RequestContext,
    projectId: string,
  ) => Promise<boolean>;
  // review → 该 project 是否存在已完成的 review(ReviewReport)。
  hasCompletedReview?: (
    ctx: RequestContext,
    projectId: string,
  ) => Promise<boolean>;
}

// 后置绑定 holder:composition root 先用一个空 holder 构造 projectsService,等所有
// peer service 建好后再 holder.current = {...}。闭包持有 holder 引用,所以
// transition 时读到的是已填充的 readers。
export interface StageGateReadersRef {
  current: StageGateReaders | null;
}

// validateStageGate 的返回:ok=false 时 missing 是「人类可读中文缺失项」列表;
// skipped 是「因无数据源被诚实跳过」的项(仅用于调试/透明,不影响 ok)。
export interface StageGateResult {
  ok: boolean;
  missing: string[];
  skipped: string[];
}

// The project's fixed stages, in pipeline order (data-model §3 / SPEC §22).
// 立项 Brief 地基(项目工作流补真 ②):brief 是第一个阶段 —— 新建/选题立项的项目
// 从 brief 起,填齐结构化 Brief 经 gate 后才进 research。存量项目 current_stage 不变。
export const PROJECT_STAGES = [
  "brief",
  "research",
  "planning",
  "script",
  "production",
  "publishing",
  "review",
] as const;
export type ProjectStageName = (typeof PROJECT_STAGES)[number];

// A ContentOutput's four independent stages (data-model rule 5).
export const OUTPUT_STAGES = ["script", "production", "publishing", "review"] as const;
export type OutputStageName = (typeof OUTPUT_STAGES)[number];

// Stage status vocabulary (domain `StageStatus` = pending|in_progress|
// needs_review|completed|skipped) plus the internal `blocked` state (SPEC §12
// in_progress↔blocked). `needs_review` (§16) is the gate-rejected state: a stage
// that tried to complete but failed the §15 content gate parks here instead of
// advancing. `blocked` is NOT a contract DTO so it is never serialized; the rest
// mirror the contract `stageStatus` enum.
type StageStatus =
  | "pending"
  | "in_progress"
  | "needs_review"
  | "completed"
  | "blocked"
  | "skipped";

const TASK_STATUSES = ["todo", "in_progress", "done", "blocked"] as const;
type TaskStatus = (typeof TASK_STATUSES)[number];

// ContentOutput DTO status enum (OQ1: the DTO is the contract truth; the service
// uses the DTO vocabulary directly — `drafting` is the seed/created state).
type OutputStatus =
  | "drafting"
  | "recording"
  | "editing"
  | "ready"
  | "published";

// 结构化 Brief(立项 Brief 地基 / PRD §5.2)—— 服务内部的规范形状。装在
// projects.brief_detail jsonb,沿用 facets/card 的 jsonb 扩展模式。所有字段可选,
// 一个空 `{}` 是合法的「刚立项」Brief;brief 阶段 gate 才校验核心必填齐。
export interface BriefDetail {
  targetAudience?: string;
  contentGoal?: string;
  contentFormat?: string;
  orientation?: "landscape" | "portrait";
  targetPlatforms?: string[];
  durationEstimate?: string;
  coreMessage?: string;
  successCriteria?: string;
  // [T-284a] 复刻补链 G1 —— 若这条 project 是「复刻某爆款」(从 benchmark 转化候选立项),携带原
  //   爆款的 5 段拆解要素(他号作品 AI 拆解),供 creative-context 装配成「对标参照·复刻用」段回流写稿。
  //   仅复刻项目有此字段(candidate.card.teardown 存在时立项复制进来);普通创作不携带(不污染)。
  //   诚实门在装配段头保证(仅结构参照·禁照搬原文案)。零新表(复用 brief_detail jsonb)。
  benchmarkRef?: {
    钩子拆解?: string;
    结构拆解?: string;
    为什么爆?: string;
    可借鉴点?: string[];
    适配本账号建议?: string;
  };
  contentRadarEvidence?: {
    sourceReferences: Array<{
      kind: "original_video" | "source_page";
      platform: string;
      label: string;
      url: string;
      intelligenceItemId?: string;
    }>;
    decomposition: {
      hook: string;
      structureSteps: string[];
      coreClaims: string[];
      reusablePattern: string;
      factRisks: string[];
    };
    strategy: {
      keep: string[];
      replace: string[];
      add: string[];
      avoid: string[];
    };
    adaptedDraftSeed: {
      contentText: string;
      generatedFromTranscriptHash: string;
      strategyHash: string;
      templateVersion: string;
    };
  };
}

// 数据底座(宪法 §7 / SPEC §1.2)—— 导入项目的平台引用。装在 projects.platform_ref
// jsonb。`shareUrl` 是逐字稿冷启动口子(本期不实现该流程,字段留好不删)。
export interface PlatformRef {
  platform: string;
  externalId: string;
  shareUrl?: string;
  publishedAt?: string;
  // [T-073] 平台侧可见性:抖音端「仅自己可见/已隐藏」→ true(采集明细「审核状态」列同步)。
  // 作品列表默认过滤 hidden 项目;未同步/非导入项目不带该键(不瞎标)。
  hidden?: boolean;
}

export type ProjectSource = "manual" | "topic" | "imported";

export interface CreateProjectCommand {
  title: string;
  brief?: string;
  // 结构化 Brief 草稿(选题立项会带候选填的草稿;手动新建可不带 → 空 Brief)。
  briefDetail?: BriefDetail;
  contentType?: string;
  creationMode?: string;
  targetPlatforms?: string[];
  // 数据底座(SPEC §1.2):来源 + 平台引用。省略 → 默认 manual + 空 platform_ref
  // (手动新建行为不变)。ingestion 导入路径经此透传 imported + 真实 platformRef。
  source?: ProjectSource;
  platformRef?: PlatformRef;
}

export interface CreateOutputCommand {
  clientRequestId?: string;
  title: string;
  contentRole?: "traffic" | "trust" | "conversion";
  contentType?: "video" | "article" | "image";
  targetPlatform?: string;
}

// 数据底座(SPEC §1.3):导入一条真实已发布作品为历史项目的结果 —— 新建(或既有)
// 的 project + 其唯一 content_output 的 id。ingestion 经端口拿到 outputId 后建
// publication(external_id=aweme_id),metrics 即可命中 resolvePublication。
export interface EnsureImportedProjectResult {
  projectId: string;
  outputId: string;
  created: boolean;
}

export interface ProjectsService {
  /** 组合读取仅取归属校验后的单行，不加载阶段、动态或全部产出。 */
  getProject(ctx: RequestContext, projectId: string, forUpdate?: boolean): Promise<ProjectRow>;
  getOutput(ctx: RequestContext, outputId: string): Promise<ContentOutputRow>;
  getOutputByCreationRequest(ctx:RequestContext,clientRequestId:string):Promise<ContentOutputRow|null>;
  // [T-332 S2] 所有经 ctx 的入口(读+写)统一断言 requireAccountId(SPEC §4.2:未选号 =
  //   引导态,创作域禁读写);claimOrphanImportedProjects 已随 claimOrphans 全链退役(§4.4)。
  createProject(ctx: RequestContext, cmd: CreateProjectCommand): Promise<ProjectRow>;
  // 数据底座(SPEC §1.3):为一条真实已发布作品就地建历史项目 + 其 content_output。
  //   幂等键 (userId, platform, externalId):命中既有 imported 项目则直接返回其
  //   (projectId, outputId, created:false),否则新建(created:true)。ingestion 经
  //   注入端口调本方法(不跨模块直连 repo,守 SPEC §22)。
  ensureImportedProject(
    ctx: RequestContext,
    input: {
      title: string;
      // [T-089] 文案全文(抖音 desc;title 已收敛为短标题)→ 新建项目落 brief 存证。
      brief?: string;
      platform: string;
      externalId: string;
      shareUrl?: string;
      publishedAt?: string;
    },
  ): Promise<EnsureImportedProjectResult>;
  // [T-321] 反查一个 content_output 的属主项目 id(经 repo.getOutput 的所有权门 join)。
  //   ingestion 日拉去重用它:resolvePublication 命中的 publication → contentOutputId →
  //   属主项目,判定「该作品已绑定到某项目」。找不到(越权/不存在)→ null；基础设施
  //   故障必须上抛，不能误走 create 路径制造重复项目。
  getProjectIdByOutput(
    ctx: RequestContext,
    outputId: string,
  ): Promise<string | null>;
  // [T-323] 反查一个 content_output 的属主项目 id + 其 source(重锚判据)。register
  //   (登记已发布)命中「已被别的 output 占用的作品」时,靠 source 判断该 output 属主是
  //   imported 空壳(日拉自动建的)还是用户手动项目,据此决定是否重锚让位。越权/不存在 →
  //   null；基础设施故障 fail closed，禁止冒充孤儿。另带 status/title 供归档门与安全冲突提示。
  getOutputOwnerSummary(
    ctx: RequestContext,
    outputId: string,
  ): Promise<{
    projectId: string;
    source: string;
    status: string;
    title: string;
  } | null>;
  /**
   * T-724：把同一外部作品的非 canonical imported 投影幂等归档。
   * 不删除项目及其素材/稿件/任务；状态边与 activity 由 Projects 事务持有。
   */
  reconcileImportedProjections(
    ctx: RequestContext,
    input: {
      platform: string;
      externalId: string;
      canonicalProjectId: string;
    },
  ): Promise<{
    archivedProjectIds: string[];
    alreadyArchivedProjectIds: string[];
  }>;
  // [T-321] 幂等把项目跃迁到「已发布/复盘」态(currentStage=review、前置阶段 completed、
  //   全阶段进度 100 → recomputeProgress=100),复用 createProject 的 imported 阶段布局
  //   (:701-726)。**不改 source**(manual 项目登记发布后仍 manual,绝不因此被 reconstruct
  //   auto-fill 吃到覆盖用户手写内容;见 mergePublishedWork 决策注释)。归档项目只读 → no-op。
  markPublished(ctx: RequestContext, projectId: string): Promise<ProjectRow>;
  // [T-321] 日拉命中「已绑定链接的已发布项目」→ 合并更新(不新建重复项目)。把日拉拿到的
  //   真实发布数据补进属主项目:title/brief 仅在有变化时更新、platform_ref 落 aweme 引用
  //   (供以后去重 + 复盘态)、并 markPublished 跃迁 stage。**保持原 source 不翻 imported**
  //   (核心:manual 属主项目若翻 imported 会被 reconstruct-runner 断言吃到 → AI 重建逐字稿/
  //   研究策划覆盖用户手写内容;而去重已由 publications.externalId 主键承担,manual 也能再命中,
  //   故不需要翻 source)。幂等:同一 awemeId 多次日拉稳定更新同一项目。归档 → no-op 返回原行。
  mergePublishedWork(
    ctx: RequestContext,
    projectId: string,
    input: {
      title?: string;
      brief?: string;
      platform: string;
      externalId: string;
      shareUrl?: string;
      publishedAt?: string;
    },
  ): Promise<ProjectRow>;
  // [T-073] 平台侧可见性同步:按 (platform, externalId) 找 imported 项目,把抖音端
  // 「仅自己可见/已隐藏」写进 platform_ref.hidden(jsonb,merge 不丢既有键)。幂等;
  // 找不到(该作品未导入)诚实返 null。采集 self.detail 落库路径经此同步。
  setImportedProjectHidden(
    ctx: RequestContext,
    input: { platform: string; externalId: string; hidden: boolean },
  ): Promise<ProjectRow | null>;
  reconcilePlatformWork(
    ctx: RequestContext,
    input: {
      platform: string;
      externalId: string;
      visibility: "visible" | "hidden";
    },
  ): Promise<
    | { kind: "project" | "publication" | "visible"; id: string }
    | { kind: "missing"; id: null }
  >;
  patchProject(
    ctx: RequestContext,
    projectId: string,
    patch: {
      title?: string;
      brief?: string;
      // 立项工作台保存 —— 结构化 Brief 整体替换 brief_detail jsonb。
      briefDetail?: BriefDetail;
      starred?: boolean;
    },
  ): Promise<ProjectRow>;
  archiveProject(ctx: RequestContext, projectId: string): Promise<ProjectRow>;
  // T-102 物理删除(区别于 archive 软隐藏):级联清除该项目全部关联行 + 项目本身。
  // ownership 门:cross-user/missing → OwnershipError(404)。archived 与否都可删
  // (删除是终极下线,不受 archive 只读态限制)。返回删除前的项目快照。
  deleteProject(ctx: RequestContext, projectId: string): Promise<ProjectRow>;
  transitionProjectStage(
    ctx: RequestContext,
    projectId: string,
    stage: string,
    cmd: { reason?: string },
  ): Promise<ProjectRow>;

  // §15/§16 内容门禁的只读预检:某阶段「核心交付物是否齐备」。transition 在真正
  // 把 in_progress→completed 前会内部调它;也公开出来,让前端 stepper 可在点「完成」
  // 之前预检并提示缺什么(不改任何状态)。无对应数据源的项诚实跳过(计入 skipped,
  // 不计入 missing)。
  validateStageGate(
    ctx: RequestContext,
    projectId: string,
    fromStage: string,
  ): Promise<StageGateResult>;

  createOutput(
    ctx: RequestContext,
    projectId: string,
    cmd: CreateOutputCommand,
  ): Promise<ContentOutputRow>;
  patchOutput(
    ctx: RequestContext,
    outputId: string,
    patch: { title?: string; primaryAssetId?: string | null },
  ): Promise<ContentOutputRow>;
  transitionOutputStage(
    ctx: RequestContext,
    outputId: string,
    stage: string,
    cmd: { reason?: string },
  ): Promise<ContentOutputRow>;

  createTask(
    ctx: RequestContext,
    projectId: string,
    cmd: { title: string; stage: string },
  ): Promise<TaskRow>;
  patchTask(
    ctx: RequestContext,
    taskId: string,
    patch: { status?: TaskStatus; title?: string },
  ): Promise<TaskRow>;

  // Cross-module resolver (SPEC §22) — the user-scoped ContentOutput ids for a
  // project, gated by the project's ownership check (a cross-user / unknown
  // project throws OwnershipError). Consumed by Publishing's
  // listPublicationIdsByProject (→ Analytics project read) so neither module
  // cross-module-joins content_outputs.
  listOutputIdsByProject(
    ctx: RequestContext,
    projectId: string,
  ): Promise<string[]>;
  /**
   * Project Overview composition port. Projects remains the single owner of the
   * root row, stages, outputs and activities; page composers never reach into
   * this module's repository directly.
   */
  getProjectOverviewCore(
    ctx: RequestContext,
    projectId: string,
  ): Promise<{
    project: ProjectRow;
    stages: StageRow[];
    outputs: ContentOutputRow[];
    activities: ActivityRow[];
  }>;
  /**
   * 组合层批量读取一页项目的 output 引用；所有行由 Projects 模块按联合归属收窄。
   */
  listOutputRefsByOutputIds(ctx: RequestContext, outputIds: ReadonlyArray<string>): Promise<Array<{projectId: string; outputId: string; title: string; contentType: string; status: string}>>;
  listOutputRefsByProjects(
    ctx: RequestContext,
    projectIds: ReadonlyArray<string>,
  ): Promise<
    Array<{
      projectId: string;
      outputId: string;
      title: string;
      contentType: string;
      status: string;
    }>
  >;
  /**
   * T-599 project scheduling read port. The project ownership gate and output
   * readiness facts stay inside Projects; calendar/dashboard never import this
   * module's repository.
   */
  getScheduleProject(
    ctx: RequestContext,
    projectId: string,
  ): Promise<{
    id: string;
    title: string;
    status: string;
    source: "manual" | "topic" | "imported";
    currentStage: string;
    updatedAt: string;
    outputs: Array<{ id: string; status: string }>;
  }>;
  /** 组合层账号级项目窄读；与批量 output refs 配合，避免逐项目扇出。 */
  listProjectsForComposition(ctx: RequestContext): Promise<ProjectRow[]>;

  // 数据底座(SPEC §1.4)「优先读真」判据(单一、明确):该用户是否存在
  //   source='imported' 的真实采集项目。true → 读侧让演示 fixture 让位、只读真;
  //   false → 过渡期回退 fixture 演示态(不破)。判据放读层(非 render),由
  //   composition root 的三向读侧(首页/复盘 listSubjects)据此分流。
  hasImportedProjects(ctx: RequestContext): Promise<boolean>;
  // 配套:imported 项目的 id 集(user-scoped)。dashboard 的「最近发布/播放」让位时,
  //   用它把 publishing/analytics 读收窄到真实导入作品(经 listOutputIdsByProject →
  //   publishing 解析,不跨模块直连 repo)。
  listImportedProjectIds(ctx: RequestContext): Promise<string[]>;

  // [T-151 / T-037 缺口 A] imported 项目 + 其平台锚(platform, externalId=aweme_id):导入后
  //   触发逐字稿(transcribe.douyin 按 awemeId)+ 重建(reconstruct.project 按 projectId)都要
  //   这两维。platformRef 无 externalId 的(异常 imported 行)不返回(诚实,无锚无法触发)。
  listImportedWorks(ctx: RequestContext): Promise<
    { projectId: string; platform: string; externalId: string }[]
  >;

  // GAP-DASH-1 — dashboard read: the user's "continue creating" project (the
  // most-recently-updated non-archived project) plus its top open tasks. Pure
  // read; returns empty/null on no data (never throws on absence).
  getDashboardSummary(ctx: RequestContext): Promise<{
    continueCreating: {
      projectId: string;
      projectTitle: string;
      stage: string;
      progressPct: number;
      updatedAt: string;
    } | null;
    todos: ReadonlyArray<{
      id: string;
      title: string;
      projectId: string;
      projectTitle: string;
      stage: string;
      dueAt: string | null;
      priority: number;
      status: string;
    }>;
  }>;
}

// Stage machine (SPEC §12 + §16, shared by Project & Output stages):
//   pending → in_progress → completed
//   in_progress ↔ blocked
//   in_progress → needs_review          (gate-rejected completion, §16)
//   needs_review → in_progress | completed | skipped
//   (pending | in_progress | needs_review) → skipped  (guard: reason required)
function assertStageTransition(
  from: StageStatus,
  to: StageStatus,
  reason: string | undefined,
): void {
  const legal: Record<StageStatus, StageStatus[]> = {
    pending: ["in_progress", "skipped"],
    in_progress: ["needs_review", "completed", "blocked", "skipped"],
    needs_review: ["in_progress", "completed", "skipped"],
    blocked: ["in_progress"],
    completed: [],
    skipped: [],
  };
  if (!legal[from]?.includes(to)) {
    throw new StageTransitionError(
      `Illegal stage transition: ${from} -> ${to}`,
    );
  }
  if (to === "skipped" && (reason === undefined || reason.trim() === "")) {
    throw new StageTransitionError("Skip requires a reason");
  }
}

// progress_pct is a QUERY CACHE recomputed from the stage rows, not a stored
// fact trusted elsewhere. Average of the stages' progress; a skipped stage
// counts as 100 for the math (roadmap §5 tricky-logic 2).
function recomputeProgress(rows: { progressPct: number; skipped: boolean }[]): number {
  if (rows.length === 0) return 0;
  const sum = rows.reduce(
    (acc, r) => acc + (r.skipped ? 100 : r.progressPct),
    0,
  );
  return Math.round(sum / rows.length);
}

function statusToProgress(status: StageStatus, current: number): number {
  if (status === "completed") return 100;
  if (status === "in_progress" && current === 0) return Math.max(current, 1);
  return current;
}

// 各阶段 gate 的「核心交付物」配置。每条声明:该阶段被 gate 的语义、用哪个 reader、
// 缺失时的中文文案。production 阶段映射到 contract 的 `production`(SPEC 内部叫
// publishing 阶段之前那个),与 PROJECT_STAGES 的命名一致。`script` 阶段的核心交付物
// 是脚本类 artifact;gap 报告提到的「至少 N 个 ScriptSegment」其真实承载在 production
// 模块(production_segments,属下游制作阶段),故 script 阶段只校验脚本 artifact 存在,
// segment 数不在此阶段诚实地不作要求(避免编造跨阶段的假条件)。
const RESEARCH_ARTIFACT_TYPES = new Set([
  "research_note",
  "trend_analysis",
  "market_analysis",
  "competitor_analysis",
  "audience_research",
  "evidence_map",
]);
const PLANNING_ARTIFACT_TYPES = new Set([
  "content_contract",
  "thesis_tree",
  "content_outline",
  "differentiation",
]);
const SCRIPT_ARTIFACT_TYPES = new Set(["master_script", "output_script"]);

// brief 阶段 gate 的核心必填项(立项 Brief 地基 / PRD §5.2 + §7)。每条:从规范化
// briefDetail 取值的 getter + 缺失时的中文文案。项目名(title)单列(在 project row 上)。
//
// SPEC §1.2 SKL-08(平台退回发布层):**目标平台从必填降级为可选** —— 平台只在发布层选,
// 立项不强制(宪法 §8:平台只在发布层、不在项目层)。横/竖屏 orientation 同样非必填(建议)。
// 核心必填只留:目标受众 / 内容目标 / 内容形式 / 核心信息。
const BRIEF_REQUIRED_FIELDS: Array<{
  label: string;
  get: (b: BriefDetail) => unknown;
}> = [
  { label: "目标受众", get: (b) => b.targetAudience },
  { label: "内容目标", get: (b) => b.contentGoal },
  { label: "内容形式", get: (b) => b.contentFormat },
  { label: "核心信息", get: (b) => b.coreMessage },
];

// jsonb(unknown / 旧空值)→ 规范化的 BriefDetail。丢未知键、字符串裁空白、平台数组
// 只留非空字符串。纯函数(无 Date.now/随机),所以服务的确定性不被破坏。
export function normalizeBriefDetail(raw: unknown): BriefDetail {
  const c = (raw ?? {}) as Record<string, unknown>;
  const s = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
  const platforms = Array.isArray(c.targetPlatforms)
    ? c.targetPlatforms.filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      )
    : [];
  const out: BriefDetail = { targetPlatforms: platforms };
  const ta = s(c.targetAudience);
  if (ta) out.targetAudience = ta;
  const cg = s(c.contentGoal);
  if (cg) out.contentGoal = cg;
  const cf = s(c.contentFormat);
  if (cf) out.contentFormat = cf;
  if (c.orientation === "landscape" || c.orientation === "portrait") {
    out.orientation = c.orientation;
  }
  const de = s(c.durationEstimate);
  if (de) out.durationEstimate = de;
  const cm = s(c.coreMessage);
  if (cm) out.coreMessage = cm;
  const sc = s(c.successCriteria);
  if (sc) out.successCriteria = sc;
  // [T-284a] 复刻补链 G1 —— 保留复刻参照(benchmarkRef)。normalizeBriefDetail 逐字段重建(丢未知键),
  //   若不显式保留,立项复制进来的 benchmarkRef 会在 createProject 落库时被抹掉 → facet 恒空、复刻回流断。
  //   只留有效段(空段丢),整体无有效段 → 不写(不留空壳)。
  const br = parseBenchmarkRef(c.benchmarkRef);
  if (br) out.benchmarkRef = br;
  const radar = parseContentRadarEvidence(c.contentRadarEvidence);
  if (radar) out.contentRadarEvidence = radar;
  return out;
}

export function parseContentRadarEvidence(
  raw: unknown,
): BriefDetail["contentRadarEvidence"] | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const decomposition = value.decomposition as Record<string, unknown> | undefined;
  const strategy = value.strategy as Record<string, unknown> | undefined;
  const strings = (input: unknown, max: number) =>
    Array.isArray(input)
      ? input
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter(Boolean)
          .slice(0, max)
      : [];
  const hook = typeof decomposition?.hook === "string" ? decomposition.hook.trim() : "";
  const reusablePattern =
    typeof decomposition?.reusablePattern === "string"
      ? decomposition.reusablePattern.trim()
      : "";
  const structureSteps = strings(decomposition?.structureSteps, 8);
  const coreClaims = strings(decomposition?.coreClaims, 8);
  if (!hook || !reusablePattern || structureSteps.length < 2 || coreClaims.length < 1) {
    return undefined;
  }
  const sourceReferences = Array.isArray(value.sourceReferences)
    ? value.sourceReferences.flatMap((rawReference) => {
        if (rawReference == null || typeof rawReference !== "object") return [];
        const reference = rawReference as Record<string, unknown>;
        if (
          (reference.kind !== "original_video" && reference.kind !== "source_page") ||
          typeof reference.platform !== "string" ||
          typeof reference.label !== "string" ||
          typeof reference.url !== "string"
        ) return [];
        try {
          const url = new URL(reference.url);
          if (url.protocol !== "http:" && url.protocol !== "https:") return [];
        } catch {
          return [];
        }
        const kind: "original_video" | "source_page" = reference.kind;
        return [{
          kind,
          platform: reference.platform.trim(),
          label: reference.label.trim(),
          url: reference.url,
          ...(typeof reference.intelligenceItemId === "string"
            ? { intelligenceItemId: reference.intelligenceItemId }
            : {}),
        }];
      }).slice(0, 10)
    : [];
  const draft = value.adaptedDraftSeed as Record<string, unknown> | undefined;
  const contentText = typeof draft?.contentText === "string" ? draft.contentText.trim() : "";
  const generatedFromTranscriptHash =
    typeof draft?.generatedFromTranscriptHash === "string"
      ? draft.generatedFromTranscriptHash.trim()
      : "";
  const strategyHash = typeof draft?.strategyHash === "string" ? draft.strategyHash.trim() : "";
  const templateVersion =
    typeof draft?.templateVersion === "string" ? draft.templateVersion.trim() : "";
  if (
    sourceReferences.length === 0 ||
    strategy == null ||
    !contentText ||
    !generatedFromTranscriptHash ||
    !strategyHash ||
    !templateVersion
  ) return undefined;
  return {
    sourceReferences,
    decomposition: {
      hook,
      structureSteps,
      coreClaims,
      reusablePattern,
      factRisks: strings(decomposition?.factRisks, 12),
    },
    strategy: {
      keep: strings(strategy.keep, 8),
      replace: strings(strategy.replace, 8),
      add: strings(strategy.add, 8),
      avoid: strings(strategy.avoid, 8),
    },
    adaptedDraftSeed: {
      contentText: contentText.slice(0, 50_000),
      generatedFromTranscriptHash,
      strategyHash,
      templateVersion,
    },
  };
}

// [T-284a] 复刻补链 G1 —— 解析 briefDetail.benchmarkRef(原爆款 5 段拆解要素)。逐字段裁空,
//   整体无任一有效段 → undefined(不留空壳)。纯函数,导出供单测。
export function parseBenchmarkRef(
  raw: unknown,
): BriefDetail["benchmarkRef"] | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const t = raw as Record<string, unknown>;
  const s = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
  const out: NonNullable<BriefDetail["benchmarkRef"]> = {};
  const hook = s(t.钩子拆解);
  if (hook) out.钩子拆解 = hook;
  const structure = s(t.结构拆解);
  if (structure) out.结构拆解 = structure;
  const why = s(t.为什么爆);
  if (why) out.为什么爆 = why;
  const points = Array.isArray(t.可借鉴点)
    ? t.可借鉴点
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter((x) => x.length > 0)
    : [];
  if (points.length > 0) out.可借鉴点 = points;
  const adapt = s(t.适配本账号建议);
  if (adapt) out.适配本账号建议 = adapt;
  return Object.keys(out).length > 0 ? out : undefined;
}

// SPEC §1.2 SKL-09 数据源收敛:从「立项时已知的目标平台集」算出关系表行
// (project_target_platforms 是唯一写真值)。去重 + 裁空白 + 保序;priority 按出现序
// 1..n。空集 → 空数组(无平台行,合法 —— 平台已退回发布层,立项不强制)。纯函数。
function buildTargetPlatformRows(
  platforms: readonly string[] | undefined,
  projectId: string,
  mkId: () => string,
  ts: string,
): TargetPlatformRow[] {
  const seen = new Set<string>();
  const rows: TargetPlatformRow[] = [];
  for (const raw of platforms ?? []) {
    const p = typeof raw === "string" ? raw.trim() : "";
    if (p === "" || seen.has(p)) continue;
    seen.add(p);
    rows.push({
      id: mkId(),
      projectId,
      platform: p,
      priority: rows.length + 1,
      planningNote: "",
      createdAt: ts,
    });
  }
  return rows;
}

// 数据底座(SPEC §1.2):jsonb(unknown / 旧空值)→ 规范化 PlatformRef。丢未知键、
// 字符串裁空白、缺 platform/externalId 兜空串。纯函数(无 Date.now/随机),不破坏
// 服务确定性。空形状 { platform:"", externalId:"" } 即「非导入项目」。
export function normalizePlatformRef(raw: unknown): PlatformRef {
  const c = (raw ?? {}) as Record<string, unknown>;
  const s = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
  const out: PlatformRef = {
    platform: s(c.platform) ?? "",
    externalId: s(c.externalId) ?? "",
  };
  const su = s(c.shareUrl);
  if (su) out.shareUrl = su;
  const pa = s(c.publishedAt);
  if (pa) out.publishedAt = pa;
  return out;
}

export function createProjectsService(
  repo: ProjectRepository,
  deps: ServiceDeps,
  // §15/§16 gate 的只读数据源。可选:不传(或传 { current: null })时所有 gate 项
  // 「无数据源」→ 诚实跳过 → gate 恒过(保持旧行为,不破坏既有调用方/测试)。
  gateReadersRef: StageGateReadersRef = { current: null },
): ProjectsService {
  // 把某阶段交付存在与否解析成 gate 结果的一项。reader 缺失(无注入)→ 跳过(skipped),
  // reader 存在但返回 false → 缺失(missing)。
  async function checkArtifactDeliverable(
    ctx: RequestContext,
    projectId: string,
    accept: Set<string>,
    missingLabel: string,
  ): Promise<"ok" | "missing" | "skipped"> {
    const reader = gateReadersRef.current?.listProjectArtifactTypes;
    if (!reader) return "skipped";
    const types = await reader(ctx, projectId);
    return types.some((t) => accept.has(t)) ? "ok" : "missing";
  }

  async function checkBoolDeliverable(
    ctx: RequestContext,
    projectId: string,
    reader:
      | ((ctx: RequestContext, projectId: string) => Promise<boolean>)
      | undefined,
  ): Promise<"ok" | "missing" | "skipped"> {
    if (!reader) return "skipped";
    return (await reader(ctx, projectId)) ? "ok" : "missing";
  }

  async function validateStageGate(
    ctx: RequestContext,
    projectId: string,
    fromStage: string,
  ): Promise<StageGateResult> {
    const missing: string[] = [];
    const skipped: string[] = [];
    const readers = gateReadersRef.current;

    // 每阶段:(label, 解析出的 "ok"|"missing"|"skipped")。
    const checks: Array<{ label: string; outcome: "ok" | "missing" | "skipped" }> =
      [];

    switch (fromStage) {
      case "brief": {
        // brief 阶段 gate(立项 Brief 地基 / PRD §7):核心必填齐才能离开 brief 进
        // research。数据源是 PROJECT 自身(title + brief_detail jsonb),不是 peer
        // reader,所以这里直接读 project row —— 永远可校验,绝不「无数据源诚实跳过」
        // (缺就是 missing)。复用第①步的 missing/needs_review 机制。
        const project = await repo.get(ctx, projectId);
        const brief = normalizeBriefDetail(
          (project as { briefDetail?: unknown }).briefDetail,
        );
        // 项目名(title 在 project row 上,单列校验)。
        checks.push({
          label: "项目名称",
          outcome:
            typeof project.title === "string" && project.title.trim() !== ""
              ? "ok"
              : "missing",
        });
        for (const field of BRIEF_REQUIRED_FIELDS) {
          const v = field.get(brief);
          checks.push({
            label: field.label,
            outcome:
              typeof v === "string" && v.trim() !== "" ? "ok" : "missing",
          });
        }
        break;
      }
      case "research":
        checks.push({
          label: "可用的研究结论或证据(research_note / 市场或竞品分析等 artifact)",
          outcome: await checkArtifactDeliverable(
            ctx,
            projectId,
            RESEARCH_ARTIFACT_TYPES,
            "research",
          ),
        });
        break;
      case "planning":
        checks.push({
          label: "内容合同 / 论点树 / 结构方案(content_contract 等 artifact)",
          outcome: await checkArtifactDeliverable(
            ctx,
            projectId,
            PLANNING_ARTIFACT_TYPES,
            "planning",
          ),
        });
        break;
      case "script":
        checks.push({
          label: "脚本(master_script / output_script artifact)",
          outcome: await checkArtifactDeliverable(
            ctx,
            projectId,
            SCRIPT_ARTIFACT_TYPES,
            "script",
          ),
        });
        break;
      case "production":
        checks.push({
          label: "已完成的制作产物(至少一个 ContentOutput 的 production 进到 ready)",
          outcome: await checkBoolDeliverable(
            ctx,
            projectId,
            readers?.hasReadyProduction,
          ),
        });
        break;
      case "publishing":
        checks.push({
          label: "发布包 / 发布记录(至少一条 publication)",
          outcome: await checkBoolDeliverable(
            ctx,
            projectId,
            readers?.hasPublication,
          ),
        });
        break;
      case "review":
        checks.push({
          label: "已完成的复盘报告(completed review)",
          outcome: await checkBoolDeliverable(
            ctx,
            projectId,
            readers?.hasCompletedReview,
          ),
        });
        break;
      default:
        // 未知阶段名:无可校验项(不应发生,stage 已被 contract 枚举约束)。
        break;
    }

    for (const c of checks) {
      if (c.outcome === "missing") missing.push(c.label);
      else if (c.outcome === "skipped") skipped.push(c.label);
    }
    return { ok: missing.length === 0, missing, skipped };
  }

  function activity(
    projectId: string,
    eventType: string,
    entityType: string,
    entityId: string,
    eventData: Record<string, unknown>,
  ): ActivityRow {
    return {
      id: deps.nextId("activity"),
      projectId,
      eventType,
      entityType,
      entityId,
      eventData,
      occurredAt: deps.now(),
    };
  }

  // 命名 const(非裸 return 对象字面量),让方法间可互调(ensureImportedProject 复用
  // createProject/createOutput,同 ingestion.service 的 `service.createRun` 自引用套路)。
  const service: ProjectsService = {
    getProject: (ctx, projectId, forUpdate = false) => repo.get(ctx, projectId, forUpdate),
    getOutput: (ctx, outputId) => repo.getOutput(ctx, outputId),
    getOutputByCreationRequest:async(ctx,key)=>{requireAccountId(ctx.accountId,"projects.getOutputByCreationRequest");if(!repo.findOutputByCreationRequest)throw new OutputStateError("作品创建回执读取服务不可用");return repo.findOutputByCreationRequest(ctx,key);},
    async createProject(ctx, cmd) {
      requireAccountId(ctx.accountId, "projects.createProject");
      const ts = deps.now();
      const projectId = deps.nextId("project");
      // 数据底座(SPEC §1.2/§1.3):source 默认 manual;imported 是真实采集导入的历史
      //   项目(已发布态)。导入项目 current_stage 落「已发布/复盘」态 —— 复用现有
      //   `review` 枚举(SPEC §9 默认假设:不新增 published 枚举);手动/选题新建仍从
      //   `brief` 起(立项 Brief 地基)。platformRef 规范化后落库(非导入为空形状)。
      const source: ProjectSource = cmd.source ?? "manual";
      const isImported = source === "imported";
      const startStage = isImported ? "review" : "brief";
      // SPEC §1.2 SKL-09 数据源收敛:目标平台的唯一写真值 = project_target_platforms
      //   关系表。立项时已知的平台集 = 显式 cmd.targetPlatforms(ingestion/旧路径)优先,
      //   否则取结构化 Brief 草稿里的 targetPlatforms(brief/选题立项走的就是这个)。
      //   该集既播种关系表(canonical),又镜像进 brief_detail jsonb 保持向后兼容只读。
      const normalizedBrief = normalizeBriefDetail(cmd.briefDetail);
      const effectivePlatforms =
        cmd.targetPlatforms && cmd.targetPlatforms.length > 0
          ? cmd.targetPlatforms
          : (normalizedBrief.targetPlatforms ?? []);
      const platformRows = buildTargetPlatformRows(
        effectivePlatforms,
        projectId,
        () => deps.nextId("platform"),
        ts,
      );
      // jsonb 镜像取关系表归一化后的平台序(去重/裁空白),确保两源永远一致。
      const briefDetailMirror: BriefDetail = {
        ...normalizedBrief,
        targetPlatforms: platformRows.map((r) => r.platform),
      };
      const project = await repo.insertProject(ctx, {
        id: projectId,
        userId: ctx.userId,
        // [T-332 S2] 写 stamp 一律来自断言后的 ctx.accountId(ISO-03,不再有 null 兜底);
        //   repo.insertProject 会再次以 ctx 为准覆盖(SPEC §4.6 防绕过)。
        accountId: requireAccountId(ctx.accountId, "projects.createProject"),
        title: cmd.title,
        brief: cmd.brief ?? "",
        briefDetail: briefDetailMirror,
        contentCategory: "",
        source,
        platformRef: normalizePlatformRef(cmd.platformRef),
        creationMode: cmd.creationMode ?? "guided",
        status: "active",
        currentStage: startStage,
        progressPct: 0,
        starred: false,
        startedAt: ts,
        targetCompletedAt: null,
        completedAt: null,
        archivedAt: null,
        createdAt: ts,
        updatedAt: ts,
      });
      // 2. seed the fixed stages. 手动/选题:首阶段 brief in_progress;导入项目已发布,
      //    前置阶段全 completed、复盘(review)阶段 in_progress(已发布作品就地等复盘)。
      const stageRows: StageRow[] = PROJECT_STAGES.map((stage) => {
        const isCurrent = stage === startStage;
        const beforeCurrent =
          isImported &&
          PROJECT_STAGES.indexOf(stage) < PROJECT_STAGES.indexOf(startStage);
        const status: StageStatus = isCurrent
          ? "in_progress"
          : beforeCurrent
            ? "completed"
            : "pending";
        // imported 项目已发布 → 全 7 阶段(含 currentStage=review)progressPct 均置 100,
        //   使 recomputeProgress(均值)= 100(SPEC §9/F4:修正 review=0 致 ~86% 的回归)。
        //   review 阶段状态仍保持 in_progress、currentStage 仍是 review(用户就地落在复盘),
        //   只把进度提满。手动/选题项目照旧:仅 completed 阶段 100、其余 0。
        return {
          id: deps.nextId("stage"),
          projectId,
          stage,
          status,
          progressPct: isImported ? 100 : status === "completed" ? 100 : 0,
          skipped: false,
          startedAt: isCurrent || beforeCurrent ? ts : null,
          completedAt: beforeCurrent ? ts : null,
          updatedAt: ts,
        };
      });
      await repo.insertStages(ctx, stageRows);
      // 3. seed the target platforms (SPEC §1.2 SKL-09:关系表 = 唯一写真值)。平台集已
      //    在上面归一化(显式 cmd 优先,否则取 Brief 草稿),jsonb 镜像同源,两处一致。
      if (platformRows.length > 0) {
        await repo.insertTargetPlatforms(ctx, platformRows);
      }
      // 4. append the creation activity.
      await repo.appendActivity(
        ctx,
        activity(projectId, "project_created", "project", projectId, {
          title: cmd.title,
          source,
        }),
      );
      return project;
    },

    async ensureImportedProject(ctx, input) {
      requireAccountId(ctx.accountId, "projects.ensureImportedProject"); // [T-332 S2] 未选号=引导态禁读写
      // 数据底座(SPEC §1.3):幂等于 (userId, platform, externalId)。先查既有 imported
      //   项目 + 其 content_output;命中则直接返回(不重复建)。
      const existing = await repo.findImportedByRef(ctx, {
        platform: input.platform,
        externalId: input.externalId,
      });
      if (existing) {
        const outputs = await repo.listOutputs(ctx, existing.id);
        // 既有 imported 项目正常带 1 个 output;若历史数据缺(防御),补建一个。
        const outputId = outputs[0]?.id ?? null;
        if (outputId) {
          return { projectId: existing.id, outputId, created: false };
        }
        const repaired = await service.createOutput(ctx, existing.id, {
          title: input.title || existing.title,
        });
        return { projectId: existing.id, outputId: repaired.id, created: false };
      }
      // 无 → 建 project(source:imported, 真实 platformRef, 复盘态)+ 其 content_output。
      const project = await service.createProject(ctx, {
        title: input.title,
        // [T-089] 文案全文落 brief(title 只留短标题;创作资产不丢)。
        brief: input.brief,
        source: "imported",
        platformRef: {
          platform: input.platform,
          externalId: input.externalId,
          shareUrl: input.shareUrl,
          publishedAt: input.publishedAt,
        },
      });
      const output = await service.createOutput(ctx, project.id, {
        title: input.title,
      });
      // SPEC §9/F4:createProject 播种 project row 时 progressPct=0(缓存字段不在建项目
      //   路径重算)。imported 全 7 阶段 stageRows 已置 100,这里返回前显式刷新一次进度缓存,
      //   使 project.progressPct = recomputeProgress(stages) = 100(否则列表仍显示 0/86)。
      const stages = await repo.listStages(ctx, project.id);
      await repo.updateProjectRow(ctx, project.id, {
        progressPct: recomputeProgress(stages),
        updatedAt: deps.now(),
      });
      return { projectId: project.id, outputId: output.id, created: true };
    },

    async getProjectIdByOutput(ctx, outputId) {
      requireAccountId(ctx.accountId, "projects.getProjectIdByOutput"); // [T-332 S2] 未选号=引导态禁读写
      // T-724：只有真实不存在/不可见才能回退 null；数据库故障时 fail closed，
      // 避免自动化把一次读失败扩大成永久重复项目。
      try {
        const output = await repo.getOutput(ctx, outputId);
        return output.projectId ?? null;
      } catch (error) {
        if (error instanceof OwnershipError) return null;
        throw error;
      }
    },

    async getOutputOwnerSummary(ctx, outputId) {
      requireAccountId(ctx.accountId, "projects.getOutputOwnerSummary"); // [T-332 S2] 未选号=引导态禁读写
      // T-724: null 只代表 output/project 确实不存在或不可见；数据库/驱动故障必须
      // 原样上抛。否则暂时性读故障会被误判成“孤儿锚”，进而错误换绑 publication。
      try {
        const output = await repo.getOutput(ctx, outputId);
        const projectId = output.projectId;
        const project = await repo.get(ctx, projectId);
        return {
          projectId,
          source: project.source,
          status: project.status,
          title: project.title,
        };
      } catch (error) {
        if (error instanceof OwnershipError) return null;
        throw error;
      }
    },

    async reconcileImportedProjections(ctx, input) {
      requireAccountId(ctx.accountId, "projects.reconcileImportedProjections");
      // canonical 必须是当前 user/account 可访问的真实项目；跨租户仍统一 404。
      await repo.get(ctx, input.canonicalProjectId);
      const matches = await repo.listImportedByRef(ctx, {
        platform: input.platform,
        externalId: input.externalId,
      });
      const targets = matches.filter(
        (project) => project.id !== input.canonicalProjectId,
      );
      const ts = deps.now();
      const candidates = targets.filter(
        (project) => project.status !== "archived",
      );
      const archivedProjectIds = await repo.archiveImportedProjections(ctx, {
        projectIds: candidates.map((project) => project.id),
        archivedAt: ts,
        activities: candidates.map((project) =>
          activity(
            project.id,
            "project_superseded",
            "project",
            project.id,
            {
              canonicalProjectId: input.canonicalProjectId,
              fromStatus: project.status,
            },
          ),
        ),
      });
      const archivedSet = new Set(archivedProjectIds);
      return {
        archivedProjectIds,
        // 包含调用前已归档以及并发中由另一事务先归档的投影，稳定排序。
        alreadyArchivedProjectIds: targets
          .filter((project) => !archivedSet.has(project.id))
          .map((project) => project.id)
          .sort(),
      };
    },

    async markPublished(ctx, projectId) {
      requireAccountId(ctx.accountId, "projects.markPublished"); // [T-332 S2] 未选号=引导态禁读写
      // [T-321] 幂等跃迁到「已发布/复盘」态,复用 createProject 的 imported 阶段布局
      //   (前置阶段 completed、review in_progress、全阶段进度 100 → recomputeProgress=100)。
      //   不改 source:manual 项目登记发布后仍 manual(不被 reconstruct/transcribe auto-fill 吃到)。
      const project = await repo.get(ctx, projectId);
      if (project.status === "archived") return project; // 归档只读:不复活
      const ts = deps.now();
      const stages = await repo.listStages(ctx, projectId);
      const reviewIdx = PROJECT_STAGES.indexOf("review");
      for (const row of stages) {
        const idx = PROJECT_STAGES.indexOf(row.stage as ProjectStageName);
        const desiredStatus: StageStatus =
          row.stage === "review"
            ? "in_progress"
            : idx < reviewIdx
              ? "completed"
              : "pending";
        // 已是目标态 + 满进度 → 跳过写(幂等,少写)。
        if (row.status === desiredStatus && row.progressPct === 100) continue;
        await repo.updateStage(ctx, row.id, {
          status: desiredStatus,
          progressPct: 100,
          startedAt:
            row.startedAt ??
            (desiredStatus === "pending" ? null : ts),
          completedAt:
            desiredStatus === "completed" ? (row.completedAt ?? ts) : row.completedAt,
          updatedAt: ts,
        });
      }
      const refreshed = await repo.listStages(ctx, projectId);
      return repo.updateProjectRow(ctx, projectId, {
        currentStage: "review",
        progressPct: recomputeProgress(refreshed),
        updatedAt: ts,
      });
    },

    async mergePublishedWork(ctx, projectId, input) {
      requireAccountId(ctx.accountId, "projects.mergePublishedWork"); // [T-332 S2] 未选号=引导态禁读写
      // [T-321] 合并日拉真实发布数据进属主项目(不新建重复)。决策:**保持原 source**
      //   —— 若把 manual 属主翻 imported,reconstruct-runner(断言仅 imported)会把该项目当
      //   历史作品 AI 重建逐字稿/研究/策划,覆盖用户手写内容(见 reconstruct-runner.ts:57 +
      //   调研 §④);而去重已由 ingestion 端 publications.externalId 主键承担(manual 也能被
      //   resolvePublication 再命中),不需要翻 source。故这里只**补充**真实数据 + 显已发布。
      const current = await repo.get(ctx, projectId);
      if (current.status === "archived") return current; // 归档只读:不动
      const ts = deps.now();
      const set: Partial<ProjectRow> = {};
      // 标题/简介仅在有变化时更新(绝不用空值抹掉用户手写内容)。
      if (
        input.title !== undefined &&
        input.title.length > 0 &&
        input.title !== current.title
      ) {
        set.title = input.title;
      }
      if (
        input.brief !== undefined &&
        input.brief.length > 0 &&
        input.brief !== current.brief
      ) {
        set.brief = input.brief;
      }
      // platform_ref 落 aweme 引用(供以后去重 + 复盘态);merge 保留既有键(如 hidden)。
      const existingRef = normalizePlatformRef(current.platformRef);
      const nextRef = normalizePlatformRef({
        platform: input.platform,
        externalId: input.externalId,
        shareUrl: input.shareUrl ?? existingRef.shareUrl,
        publishedAt: input.publishedAt ?? existingRef.publishedAt,
      });
      if (existingRef.hidden === true) nextRef.hidden = true; // 不丢可见性标
      if (JSON.stringify(existingRef) !== JSON.stringify(nextRef)) {
        set.platformRef = nextRef;
      }
      if (Object.keys(set).length > 0) {
        set.updatedAt = ts;
        await repo.updateProjectRow(ctx, projectId, set);
      }
      // stage 跃迁到已发布(幂等)。**不改 source**。
      return service.markPublished(ctx, projectId);
    },

    async setImportedProjectHidden(ctx, input) {
      requireAccountId(ctx.accountId, "projects.setImportedProjectHidden"); // [T-332 S2] 未选号=引导态禁读写
      // [T-073] 幂等可见性同步:merge platform_ref jsonb(保留 externalId/publishedAt
      //   等既有键),只翻 hidden。未导入 → null(诚实跳过,不硬造)。
      const existing = await repo.findImportedByRef(ctx, {
        platform: input.platform,
        externalId: input.externalId,
      });
      if (!existing) return null;
      const ref = ((existing as { platformRef?: unknown }).platformRef ??
        {}) as Record<string, unknown>;
      const currentlyHidden = ref.hidden === true;
      if (currentlyHidden === input.hidden) return existing; // 已是目标态,不再写
      await repo.updateProjectRow(ctx, existing.id, {
        platformRef: { ...ref, hidden: input.hidden },
        updatedAt: deps.now(),
      } as Partial<ProjectRow>);
      return repo.get(ctx, existing.id);
    },

    async reconcilePlatformWork(ctx, input) {
      requireAccountId(ctx.accountId, "projects.reconcilePlatformWork");
      if (input.visibility === "visible") {
        const normalized = await repo.normalizeVisiblePlatformWork(ctx, {
          platform: input.platform,
          externalId: input.externalId,
          updatedAt: deps.now(),
        });
        return normalized
          ? { kind: "visible", id: normalized.publicationId }
          : { kind: "missing", id: null };
      }
      const imported = await repo.findImportedByRef(ctx, input);
      if (imported) {
        await repo.deleteProjectCascade(ctx, imported.id, {
          deletePlatformSignals: true,
        });
        return { kind: "project", id: imported.id };
      }
      const deleted = await repo.deletePlatformPublicationCascade(ctx, input);
      return deleted
        ? { kind: "publication", id: deleted.publicationId }
        : { kind: "missing", id: null };
    },

    async patchProject(ctx, projectId, patch) {
      requireAccountId(ctx.accountId, "projects.patchProject"); // [T-332 S2] 未选号=引导态禁读写
      const current = await repo.get(ctx, projectId);
      if (current.status === "archived") {
        throw new ProjectStateError("Project is archived (read-only)");
      }
      const set: Partial<ProjectRow> = { updatedAt: deps.now() };
      if (patch.title !== undefined) set.title = patch.title;
      if (patch.brief !== undefined) set.brief = patch.brief;
      // 立项工作台保存 —— 结构化 Brief 整体替换 brief_detail(规范化后落库)。
      //
      // SPEC §1.2 SKL-09 数据源收敛(关键修):briefDetail.targetPlatforms 不再是独立真值,
      //   只是 project_target_platforms 关系表的镜像。这里把保存路径收成单一写:平台集
      //   先整体替换关系表(canonical),再用归一化后的同一序写回 jsonb 镜像 —— 消除旧的
      //   「patch 只写 jsonb、关系表只在 create 播种」的双写漂移(过去保存平台后关系表恒不变)。
      if (patch.briefDetail !== undefined) {
        const normalized = normalizeBriefDetail(patch.briefDetail);
        const ts = set.updatedAt as string;
        const platformRows = buildTargetPlatformRows(
          normalized.targetPlatforms,
          projectId,
          () => deps.nextId("platform"),
          ts,
        );
        // 唯一写真值:整体替换关系表(先删后插)。
        await repo.replaceTargetPlatforms(ctx, projectId, platformRows);
        // jsonb 镜像同源(归一化后的平台序),保证 DTO 两处显示一致。
        set.briefDetail = {
          ...normalized,
          targetPlatforms: platformRows.map((r) => r.platform),
        };
      }
      if (patch.starred !== undefined) set.starred = patch.starred;
      return repo.updateProjectRow(ctx, projectId, set);
    },

    async archiveProject(ctx, projectId) {
      requireAccountId(ctx.accountId, "projects.archiveProject"); // [T-332 S2] 未选号=引导态禁读写
      const current = await repo.get(ctx, projectId);
      if (current.status === "archived") {
        throw new ProjectStateError("Project already archived");
      }
      // OQ2: SPEC §12 lists completed→archived, but roadmap §4 「更多」 + the
      // shipped FE archive from `active` as a convenience. Allow archive from
      // any non-archived status; archived ⇒ read-only thereafter.
      const ts = deps.now();
      const archived = await repo.updateProjectRow(ctx, projectId, {
        status: "archived",
        archivedAt: ts,
        updatedAt: ts,
      });
      await repo.appendActivity(
        ctx,
        activity(projectId, "project_archived", "project", projectId, {
          fromStatus: current.status,
        }),
      );
      return archived;
    },

    async deleteProject(ctx, projectId) {
      requireAccountId(ctx.accountId, "projects.deleteProject"); // [T-332 S2] 未选号=引导态禁读写
      // ownership 校验在 repo.deleteProjectCascade 内(删前 get());这里不再另守 archived
      // 态 —— 物理删除是终极下线,归档项目照样可删(与 archive 的 already-archived 409
      // 守卫正交)。级联清理 + 删根一个事务包裹(见 repository.deleteProjectCascade)。
      // 不 appendActivity:项目行连同 project_activities 一并物理删除,写活动无处存也无意义。
      return repo.deleteProjectCascade(ctx, projectId);
    },

    async transitionProjectStage(ctx, projectId, stage, cmd) {
      requireAccountId(ctx.accountId, "projects.transitionProjectStage"); // [T-332 S2] 未选号=引导态禁读写
      const project = await repo.get(ctx, projectId);
      if (project.status === "archived") {
        throw new ProjectStateError("Project is archived (read-only)");
      }
      const row = await repo.getStage(ctx, projectId, stage);
      const target = nextStageStatus(row.status as StageStatus, cmd.reason);
      assertStageTransition(row.status as StageStatus, target, cmd.reason);
      const ts = deps.now();
      // §15/§16 内容门禁:只在「真正完成离开本阶段」(→completed)时跑;skipped 带理由
      // 跳过(显式放弃,不要求交付物),其余 in_progress/blocked 等内部流转不受 gate。
      // gate 不过 → 把本阶段从 in_progress 落到 needs_review(持久化卡点,让 stepper
      // 看得到「卡在待补」),写一条 gate_blocked activity,再抛 StageGateError(带
      // missing 列表)。补齐交付物后再次 transition(needs_review→completed)会重跑 gate
      // 并放行。
      // SPEC §9/F4:imported(已发布采集导入)项目免 gate —— 允许在各阶段间自由跳转
      //   (编辑/重建历史产物,不要求补齐交付物)。gate 仅拦新建/manual 项目。安全前提:
      //   validateStageGate 及其 reader 全为纯查询,无副作用初始化,跳过不漏任何持久化。
      const isImported = project.source === "imported";
      if (!isImported && target === "completed") {
        const gate = await validateStageGate(ctx, projectId, stage);
        if (!gate.ok) {
          if (row.status !== "needs_review") {
            await repo.updateStage(ctx, row.id, {
              status: "needs_review",
              progressPct: row.progressPct,
              updatedAt: ts,
            });
            const blockedStages = await repo.listStages(ctx, projectId);
            await repo.updateProjectRow(ctx, projectId, {
              currentStage:
                computeCurrentStage(blockedStages) ?? project.currentStage,
              updatedAt: ts,
            });
          }
          await repo.appendActivity(
            ctx,
            activity(projectId, "stage_gate_blocked", "project", projectId, {
              stage,
              missing: gate.missing,
              skipped: gate.skipped,
            }),
          );
          throw new StageGateError(stage, gate.missing);
        }
      }
      await repo.updateStage(ctx, row.id, {
        status: target,
        skipped: target === "skipped" ? true : row.skipped,
        progressPct: statusToProgress(target, row.progressPct),
        startedAt:
          target === "in_progress" && row.startedAt === null ? ts : row.startedAt,
        completedAt: target === "completed" ? ts : row.completedAt,
        updatedAt: ts,
      });
      // Recompute the project's progress cache + current stage from the rows.
      const stages = await repo.listStages(ctx, projectId);
      const progress = recomputeProgress(stages);
      const currentStage = computeCurrentStage(stages) ?? project.currentStage;
      const updated = await repo.updateProjectRow(ctx, projectId, {
        progressPct: progress,
        currentStage,
        updatedAt: ts,
      });
      await repo.appendActivity(
        ctx,
        activity(projectId, "stage_transition", "project", projectId, {
          stage,
          fromStatus: row.status,
          toStatus: target,
          reason: cmd.reason ?? null,
        }),
      );
      return updated;
    },

    async validateStageGate(ctx, projectId, fromStage) {
      requireAccountId(ctx.accountId, "projects.validateStageGate"); // [T-332 S2] 未选号=引导态禁读写
      await repo.get(ctx, projectId); // ownership before reading peer deliverables
      return validateStageGate(ctx, projectId, fromStage);
    },

    async createOutput(ctx, projectId, cmd) {
      requireAccountId(ctx.accountId, "projects.createOutput"); // [T-332 S2] 未选号=引导态禁读写
      await repo.get(ctx, projectId); // ownership before the UoW
      const ts = deps.now();
      const outputId = deps.nextId("output");
      const outputRow: ContentOutputRow = {
        id: outputId,
        projectId,
        title: cmd.title,
        contentType: cmd.contentType ?? "video",
        targetPlatform: cmd.targetPlatform ?? null,
        format: "",
        aspectRatio: "",
        targetDurationSeconds: 0,
        status: "drafting" satisfies OutputStatus,
        contentRole: cmd.contentRole ?? null,
        primaryAssetId: null,
        createdAt: ts,
        updatedAt: ts,
      };
      // Seed the four output stages (first in_progress/started, rest pending).
      const stageRows: OutputStageRow[] = OUTPUT_STAGES.map((stage, idx) => ({
        id: deps.nextId("ostage"),
        contentOutputId: outputId,
        stage,
        status: idx === 0 ? "in_progress" : "pending",
        progressPct: 0,
        skipped: false,
        startedAt: idx === 0 ? ts : null,
        completedAt: null,
        updatedAt: ts,
      }));
      const createdActivity = activity(projectId, "output_created", "content_output", outputId, {
        title: cmd.title, contentRole: cmd.contentRole ?? null,
      });
      if (cmd.clientRequestId) {
        if (!repo.createOutputWithRequest) throw new OutputStateError("作品创建回执服务不可用，请保留输入后重试");
        // SEMANTIC_BOUNDARY_ALLOW: exact request hashing only detects duplicate
        // commands; it does not classify or choose creative content.
        const requestDigest = createHash("sha256").update(JSON.stringify({
          projectId, title: cmd.title, contentType: cmd.contentType ?? "video",
          targetPlatform: cmd.targetPlatform ?? null, contentRole: cmd.contentRole ?? null,
        })).digest("hex");
        return repo.createOutputWithRequest(ctx, {clientRequestId: cmd.clientRequestId, requestDigest,
          output: outputRow, stages: stageRows, activity: createdActivity});
      }
      if(repo.createOutputAtomic)return repo.createOutputAtomic(ctx,{output:outputRow,stages:stageRows,activity:createdActivity});
      const output = await repo.insertOutput(ctx, outputRow);
      await repo.insertOutputStages(ctx, stageRows);
      await repo.appendActivity(ctx, createdActivity);
      return output;
    },

    async patchOutput(ctx, outputId, patch) {
      requireAccountId(ctx.accountId, "projects.patchOutput"); // [T-332 S2] 未选号=引导态禁读写
      const current = await repo.getOutput(ctx, outputId);
      const set: Partial<ContentOutputRow> = { updatedAt: deps.now() };
      if (patch.title !== undefined) set.title = patch.title;
      // primary_asset_id cross-module guard (data-model rule 8: must reference an
      // OutputAsset of THIS output) is deferred to Assets (Wave-2 parallel);
      // here we accept the id and append an activity.
      if (patch.primaryAssetId !== undefined) set.primaryAssetId = patch.primaryAssetId;
      const updated = await repo.updateOutputRow(ctx, outputId, set);
      if (patch.primaryAssetId !== undefined) {
        await repo.appendActivity(
          ctx,
          activity(
            current.projectId,
            "output_primary_asset_set",
            "content_output",
            outputId,
            { primaryAssetId: patch.primaryAssetId },
          ),
        );
      }
      return updated;
    },

    async transitionOutputStage(ctx, outputId, stage, cmd) {
      requireAccountId(ctx.accountId, "projects.transitionOutputStage"); // [T-332 S2] 未选号=引导态禁读写
      const output = await repo.getOutput(ctx, outputId);
      const row = await repo.getOutputStage(ctx, outputId, stage);
      const target = nextStageStatus(row.status as StageStatus, cmd.reason);
      assertStageTransition(row.status as StageStatus, target, cmd.reason);
      const ts = deps.now();
      await repo.updateOutputStage(ctx, row.id, {
        status: target,
        skipped: target === "skipped" ? true : row.skipped,
        progressPct: statusToProgress(target, row.progressPct),
        startedAt:
          target === "in_progress" && row.startedAt === null ? ts : row.startedAt,
        completedAt: target === "completed" ? ts : row.completedAt,
        updatedAt: ts,
      });
      // Map the output's stage progression onto the DTO status enum (OQ1):
      // all four stages completed → published; otherwise drafting.
      const allStages = await listOutputStages(repo, ctx, outputId);
      const dtoStatus: OutputStatus = allStages.every(
        (s) => s.status === "completed" || s.skipped,
      )
        ? "published"
        : (output.status as OutputStatus) === "published"
          ? "published"
          : "drafting";
      const updated = await repo.updateOutputRow(ctx, outputId, {
        status: dtoStatus,
        updatedAt: ts,
      });
      await repo.appendActivity(
        ctx,
        activity(
          output.projectId,
          "output_stage_transition",
          "content_output",
          outputId,
          { stage, fromStatus: row.status, toStatus: target, reason: cmd.reason ?? null },
        ),
      );
      return updated;
    },

    async createTask(ctx, projectId, cmd) {
      requireAccountId(ctx.accountId, "projects.createTask"); // [T-332 S2] 未选号=引导态禁读写
      await repo.get(ctx, projectId); // ownership
      const task = await repo.insertTask(ctx, {
        id: deps.nextId("task"),
        projectId,
        contentOutputId: null,
        stage: cmd.stage,
        title: cmd.title,
        description: "",
        status: "todo",
        priority: 3,
        dueAt: null,
        completedAt: null,
      });
      await repo.appendActivity(
        ctx,
        activity(projectId, "task_created", "task", task.id, { title: cmd.title }),
      );
      return task;
    },

    async patchTask(ctx, taskId, patch) {
      requireAccountId(ctx.accountId, "projects.patchTask"); // [T-332 S2] 未选号=引导态禁读写
      const current = await repo.getTask(ctx, taskId);
      const set: Partial<TaskRow> = {};
      if (patch.title !== undefined) set.title = patch.title;
      if (patch.status !== undefined) {
        if (!TASK_STATUSES.includes(patch.status)) {
          throw new TaskStateError(`Invalid task status: ${patch.status}`);
        }
        set.status = patch.status;
        // →done stamps completed_at; reopening clears it.
        if (patch.status === "done") {
          set.completedAt = deps.now();
        } else if (current.status === "done") {
          set.completedAt = null;
        }
      }
      return repo.updateTaskRow(ctx, taskId, set);
    },

    async listOutputIdsByProject(ctx, projectId) {
      requireAccountId(ctx.accountId, "projects.listOutputIdsByProject"); // [T-332 S2] 未选号=引导态禁读写
      // repo.listOutputs gates the parent project's ownership (cross-user /
      // unknown → OwnershipError) then returns the user-scoped outputs; we expose
      // only the ids so downstream resolvers never see the full row.
      const outputs = await repo.listOutputs(ctx, projectId);
      return outputs.map((o) => o.id);
    },

    async getProjectOverviewCore(ctx, projectId) {
      requireAccountId(ctx.accountId, "projects.getProjectOverviewCore");
      // Read the root first so unknown/cross-account ids fail closed before any
      // child query. Child repository reads repeat the same parent ownership gate.
      const project = await repo.get(ctx, projectId);
      const [stages, outputs, activities] = await Promise.all([
        repo.listStages(ctx, projectId),
        repo.listOutputs(ctx, projectId),
        repo.listActivity(ctx, projectId),
      ]);
      return { project, stages, outputs, activities };
    },

    async listOutputRefsByOutputIds(ctx, outputIds) {
      requireAccountId(ctx.accountId, "projects.listOutputRefsByOutputIds");
      return repo.listOutputRefsByOutputIds(ctx, outputIds);
    },
    async listOutputRefsByProjects(ctx, projectIds) {
      requireAccountId(ctx.accountId, "projects.listOutputRefsByProjects");
      return repo.listOutputRefsByProjects(ctx, projectIds);
    },

    async getScheduleProject(ctx, projectId) {
      requireAccountId(ctx.accountId, "projects.getScheduleProject");
      const project = await repo.get(ctx, projectId);
      const outputs = await repo.listOutputs(ctx, projectId);
      return {
        id: project.id,
        title: project.title,
        status: project.status,
        source: project.source as "manual" | "topic" | "imported",
        currentStage: project.currentStage,
        updatedAt: project.updatedAt,
        outputs: outputs.map((output) => ({
          id: output.id,
          status: output.status,
        })),
      };
    },

    async listProjectsForComposition(ctx) {
      requireAccountId(ctx.accountId, "projects.listProjectsForComposition");
      return repo.list(ctx);
    },

    async hasImportedProjects(ctx) {
      requireAccountId(ctx.accountId, "projects.hasImportedProjects"); // [T-332 S2] 未选号=引导态禁读写
      // 数据底座(SPEC §1.4)单一判据:存在 ≥1 个 source='imported' 项目。repo.listImported
      //   已 user-scoped + source 过滤,故 length>0 即"该用户拉过真账号"。
      const imported = await repo.listImported(ctx);
      return imported.length > 0;
    },

    async listImportedProjectIds(ctx) {
      requireAccountId(ctx.accountId, "projects.listImportedProjectIds"); // [T-332 S2] 未选号=引导态禁读写
      const imported = await repo.listImported(ctx);
      return imported.map((p) => p.id);
    },

    async listImportedWorks(ctx) {
      requireAccountId(ctx.accountId, "projects.listImportedWorks"); // [T-332 S2] 未选号=引导态禁读写
      // [T-151 / T-037 缺口 A] imported 项目 → { projectId, platform, externalId }。externalId 从
      //   platformRef(JSON {platform, externalId})取;无锚(异常行)诚实过滤掉(无法触发逐字稿/重建)。
      const imported = await repo.listImported(ctx);
      const out: { projectId: string; platform: string; externalId: string }[] =
        [];
      for (const p of imported) {
        const ref = (p.platformRef ?? {}) as {
          platform?: unknown;
          externalId?: unknown;
        };
        const platform = typeof ref.platform === "string" ? ref.platform : "";
        const externalId =
          typeof ref.externalId === "string" ? ref.externalId : "";
        if (!externalId) continue; // 无 aweme 锚 → 无法按 awemeId 转写 / 无法可靠触发,诚实跳过
        out.push({ projectId: p.id, platform, externalId });
      }
      return out;
    },

    async getDashboardSummary(ctx) {
      requireAccountId(ctx.accountId, "projects.getDashboardSummary"); // [T-332 S2] 未选号=引导态禁读写
      // continueCreating = most-recently-updated non-archived project (in-module
      // read only; repo.list is already user-scoped).
      const projectRows = await repo.list(ctx);
      const active = projectRows.filter(
        (p) => p.status !== "archived" && p.source !== "imported",
      );
      const latest = active.reduce<ProjectRow | null>(
        (best, p) =>
          best === null || p.updatedAt > best.updatedAt ? p : best,
        null,
      );
      if (latest === null) {
        return { continueCreating: null, todos: [] };
      }
      const continueCreating = {
        projectId: latest.id,
        projectTitle: latest.title,
        stage: latest.currentStage,
        progressPct: latest.progressPct,
        updatedAt: latest.updatedAt,
      };
      // todos = that project's open tasks, priority desc then dueAt asc, top 5.
      const CLOSED = new Set(["done", "completed", "archived"]);
      const taskRows = await repo.listTasks(ctx, latest.id);
      const todos = taskRows
        .filter((t) => !CLOSED.has(t.status))
        .sort((a, b) => {
          if (b.priority !== a.priority) return b.priority - a.priority;
          // dueAt asc; nulls sort last (no due date = least urgent for the tie).
          if (a.dueAt === b.dueAt) return 0;
          if (a.dueAt === null) return 1;
          if (b.dueAt === null) return -1;
          return a.dueAt < b.dueAt ? -1 : 1;
        })
        .slice(0, 5)
        .map((t) => ({
          id: t.id,
          title: t.title,
          projectId: t.projectId,
          projectTitle: continueCreating.projectTitle,
          stage: t.stage,
          dueAt: t.dueAt,
          priority: t.priority,
          status: t.status,
        }));
      return { continueCreating, todos };
    },
  };
  return service;
}

// The next stage status under the default forward progression. A stage with a
// reason targeting a skip resolves to `skipped`; otherwise pending→in_progress,
// in_progress→completed, needs_review→completed (gate retry). Blocked stages
// resume to in_progress.
function nextStageStatus(
  from: StageStatus,
  reason: string | undefined,
): StageStatus {
  if (
    reason !== undefined &&
    reason.trim() !== "" &&
    (from === "pending" || from === "in_progress" || from === "needs_review")
  ) {
    return "skipped";
  }
  switch (from) {
    case "pending":
      return "in_progress";
    case "in_progress":
      return "completed";
    // 阶段卡在 needs_review(gate 曾拦截)→ 再次 transition 表示「我补齐了,放行」,
    // 默认前进到 completed(transition 会重跑 gate;仍缺则再次落回 needs_review)。
    case "needs_review":
      return "completed";
    case "blocked":
      return "in_progress";
    default:
      return from;
  }
}

// The current stage is the first non-completed/non-skipped stage in pipeline
// order; if all are done, the terminal stage.
function computeCurrentStage(
  stages: { stage: string; status: string; skipped: boolean }[],
): string | null {
  const byOrder = PROJECT_STAGES.map((name) =>
    stages.find((s) => s.stage === name),
  ).filter((s): s is NonNullable<typeof s> => s !== undefined);
  const active = byOrder.find(
    (s) => s.status !== "completed" && !s.skipped,
  );
  if (active) return active.stage;
  const last = byOrder[byOrder.length - 1];
  return last ? last.stage : null;
}

async function listOutputStages(
  repo: ProjectRepository,
  ctx: RequestContext,
  outputId: string,
): Promise<OutputStageRow[]> {
  // The repository exposes per-stage getters; gather the four output stages.
  const rows: OutputStageRow[] = [];
  for (const stage of OUTPUT_STAGES) {
    try {
      rows.push(await repo.getOutputStage(ctx, outputId, stage));
    } catch {
      // stage row absent — ignore for the progress roll-up.
    }
  }
  return rows;
}
