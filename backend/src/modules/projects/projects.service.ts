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
  targetPlatforms?: string[];
  durationEstimate?: string;
  coreMessage?: string;
  successCriteria?: string;
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
  title: string;
  contentRole?: "traffic" | "trust" | "conversion";
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
  // [T-073] 平台侧可见性同步:按 (platform, externalId) 找 imported 项目,把抖音端
  // 「仅自己可见/已隐藏」写进 platform_ref.hidden(jsonb,merge 不丢既有键)。幂等;
  // 找不到(该作品未导入)诚实返 null。采集 self.detail 落库路径经此同步。
  setImportedProjectHidden(
    ctx: RequestContext,
    input: { platform: string; externalId: string; hidden: boolean },
  ): Promise<ProjectRow | null>;
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

  // 数据底座(SPEC §1.4)「优先读真」判据(单一、明确):该用户是否存在
  //   source='imported' 的真实采集项目。true → 读侧让演示 fixture 让位、只读真;
  //   false → 过渡期回退 fixture 演示态(不破)。判据放读层(非 render),由
  //   composition root 的三向读侧(首页/复盘 listSubjects)据此分流。
  hasImportedProjects(ctx: RequestContext): Promise<boolean>;
  // 配套:imported 项目的 id 集(user-scoped)。dashboard 的「最近发布/播放」让位时,
  //   用它把 publishing/analytics 读收窄到真实导入作品(经 listOutputIdsByProject →
  //   publishing 解析,不跨模块直连 repo)。
  listImportedProjectIds(ctx: RequestContext): Promise<string[]>;

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
  const de = s(c.durationEstimate);
  if (de) out.durationEstimate = de;
  const cm = s(c.coreMessage);
  if (cm) out.coreMessage = cm;
  const sc = s(c.successCriteria);
  if (sc) out.successCriteria = sc;
  return out;
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
    async createProject(ctx, cmd) {
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

    async setImportedProjectHidden(ctx, input) {
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

    async patchProject(ctx, projectId, patch) {
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

    async transitionProjectStage(ctx, projectId, stage, cmd) {
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
      await repo.get(ctx, projectId); // ownership before reading peer deliverables
      return validateStageGate(ctx, projectId, fromStage);
    },

    async createOutput(ctx, projectId, cmd) {
      await repo.get(ctx, projectId); // ownership before the UoW
      const ts = deps.now();
      const outputId = deps.nextId("output");
      const output = await repo.insertOutput(ctx, {
        id: outputId,
        projectId,
        title: cmd.title,
        contentType: "video",
        format: "",
        aspectRatio: "",
        targetDurationSeconds: 0,
        status: "drafting" satisfies OutputStatus,
        contentRole: cmd.contentRole ?? null,
        primaryAssetId: null,
        createdAt: ts,
        updatedAt: ts,
      });
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
      await repo.insertOutputStages(ctx, stageRows);
      await repo.appendActivity(
        ctx,
        activity(projectId, "output_created", "content_output", outputId, {
          title: cmd.title,
          contentRole: cmd.contentRole ?? null,
        }),
      );
      return output;
    },

    async patchOutput(ctx, outputId, patch) {
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
      // repo.listOutputs gates the parent project's ownership (cross-user /
      // unknown → OwnershipError) then returns the user-scoped outputs; we expose
      // only the ids so downstream resolvers never see the full row.
      const outputs = await repo.listOutputs(ctx, projectId);
      return outputs.map((o) => o.id);
    },

    async hasImportedProjects(ctx) {
      // 数据底座(SPEC §1.4)单一判据:存在 ≥1 个 source='imported' 项目。repo.listImported
      //   已 user-scoped + source 过滤,故 length>0 即"该用户拉过真账号"。
      const imported = await repo.listImported(ctx);
      return imported.length > 0;
    },

    async listImportedProjectIds(ctx) {
      const imported = await repo.listImported(ctx);
      return imported.map((p) => p.id);
    },

    async getDashboardSummary(ctx) {
      // continueCreating = most-recently-updated non-archived project (in-module
      // read only; repo.list is already user-scoped).
      const projectRows = await repo.list(ctx);
      const active = projectRows.filter((p) => p.status !== "archived");
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
