import type { RequestContext } from "@creatoros/contract";
import type {
  ProjectRepository,
  ProjectRow,
  StageRow,
  ContentOutputRow,
  OutputStageRow,
  TaskRow,
  ActivityRow,
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

// The project's six fixed stages, in pipeline order (data-model §3 / SPEC §22).
export const PROJECT_STAGES = [
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

export interface CreateProjectCommand {
  title: string;
  brief?: string;
  contentType?: string;
  creationMode?: string;
  targetPlatforms?: string[];
}

export interface CreateOutputCommand {
  title: string;
  contentRole?: "traffic" | "trust" | "conversion";
}

export interface ProjectsService {
  createProject(ctx: RequestContext, cmd: CreateProjectCommand): Promise<ProjectRow>;
  patchProject(
    ctx: RequestContext,
    projectId: string,
    patch: { title?: string; brief?: string; starred?: boolean },
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

  return {
    async createProject(ctx, cmd) {
      const ts = deps.now();
      const projectId = deps.nextId("project");
      // 1. insert the root project (status active, first stage research).
      const project = await repo.insertProject(ctx, {
        id: projectId,
        userId: ctx.userId,
        title: cmd.title,
        brief: cmd.brief ?? "",
        contentCategory: "",
        creationMode: cmd.creationMode ?? "guided",
        status: "active",
        currentStage: "research",
        progressPct: 0,
        starred: false,
        startedAt: ts,
        targetCompletedAt: null,
        completedAt: null,
        archivedAt: null,
        createdAt: ts,
        updatedAt: ts,
      });
      // 2. seed the six fixed stages (first in_progress/started, rest pending).
      const stageRows: StageRow[] = PROJECT_STAGES.map((stage, idx) => ({
        id: deps.nextId("stage"),
        projectId,
        stage,
        status: idx === 0 ? "in_progress" : "pending",
        progressPct: 0,
        skipped: false,
        startedAt: idx === 0 ? ts : null,
        completedAt: null,
        updatedAt: ts,
      }));
      await repo.insertStages(ctx, stageRows);
      // 3. seed the target platforms passed in the command (intent only).
      if (cmd.targetPlatforms && cmd.targetPlatforms.length > 0) {
        await repo.insertTargetPlatforms(
          ctx,
          cmd.targetPlatforms.map((platform, idx) => ({
            id: deps.nextId("platform"),
            projectId,
            platform,
            priority: idx + 1,
            planningNote: "",
            createdAt: ts,
          })),
        );
      }
      // 4. append the creation activity.
      await repo.appendActivity(
        ctx,
        activity(projectId, "project_created", "project", projectId, {
          title: cmd.title,
        }),
      );
      return project;
    },

    async patchProject(ctx, projectId, patch) {
      const current = await repo.get(ctx, projectId);
      if (current.status === "archived") {
        throw new ProjectStateError("Project is archived (read-only)");
      }
      const set: Partial<ProjectRow> = { updatedAt: deps.now() };
      if (patch.title !== undefined) set.title = patch.title;
      if (patch.brief !== undefined) set.brief = patch.brief;
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
      if (target === "completed") {
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
