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
} from "./projects.errors";

// Projects service (foundation §5.3) — all public methods (ctx, command). The
// service OWNS the state machines (SPEC §12); the repository only executes
// approved writes. Cross-row creates run as one Unit-of-Work (SPEC §11). The
// service is the only entry other modules import (via index.ts).

export interface ServiceDeps {
  now: () => string; // ISO-8601 clock (deterministic in tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
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

// Stage status vocabulary (domain `StageStatus` = pending|in_progress|completed|
// skipped) plus the internal `blocked` state (SPEC §12 in_progress↔blocked).
// Stages are NOT a contract DTO, so `blocked` is never serialized/validated.
type StageStatus = "pending" | "in_progress" | "completed" | "blocked" | "skipped";

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
}

// Stage machine (SPEC §12, shared by Project & Output stages):
//   pending → in_progress → completed
//   in_progress ↔ blocked
//   (pending | in_progress) → skipped  (guard: reason required)
function assertStageTransition(
  from: StageStatus,
  to: StageStatus,
  reason: string | undefined,
): void {
  const legal: Record<StageStatus, StageStatus[]> = {
    pending: ["in_progress", "skipped"],
    in_progress: ["completed", "blocked", "skipped"],
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

export function createProjectsService(
  repo: ProjectRepository,
  deps: ServiceDeps,
): ProjectsService {
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
  };
}

// The next stage status under the default forward progression. A stage with a
// reason targeting a skip resolves to `skipped`; otherwise pending→in_progress,
// in_progress→completed. Blocked stages resume to in_progress.
function nextStageStatus(
  from: StageStatus,
  reason: string | undefined,
): StageStatus {
  if (reason !== undefined && reason.trim() !== "" && (from === "pending" || from === "in_progress")) {
    return "skipped";
  }
  switch (from) {
    case "pending":
      return "in_progress";
    case "in_progress":
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
