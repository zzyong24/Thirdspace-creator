import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "@creatoros/backend";
import type { ProjectsService } from "./projects.service";
import type {
  ProjectRepository,
  ProjectRow,
  ContentOutputRow,
  TaskRow,
  ActivityRow,
} from "./projects.repository";
import type {
  ProjectResource,
  ContentOutputResource,
  TaskResource,
  ProjectActivityResource,
} from "./projects.schema";

// Projects transport (foundation §5.4) — all 15 contract ops in the SPEC §13
// "项目与流程" group served over REAL SQL behind /api/v1/dispatch. A Transport
// whose request(endpoint,input,ctx) switches on endpoint.id, delegates to the
// per-ctx service/repo, and returns the SPEC §14 envelope. No ctx ⇒
// unauthenticated dispatch → AuthenticationError (→401). Ops not owned →
// UnsupportedOperationError so the composite never masks a real error.
//
// PROJECT_OP_IDS is the registry this module owns; persistence-client builds
// PERSISTED_OPS from it (adding the module = registering it).

export const PROJECT_OP_IDS = [
  "projects.list",
  "projects.create",
  "projects.get",
  "projects.patch",
  "projects.archive",
  "projects.stage.transition",
  "projects.outputs.create",
  "projects.outputs.list",
  "outputs.get",
  "outputs.patch",
  "outputs.stage.transition",
  "projects.tasks.list",
  "projects.tasks.create",
  "tasks.patch",
  "projects.activity.list",
] as const;

function toProject(row: ProjectRow): ProjectResource {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    brief: row.brief,
    contentCategory: row.contentCategory,
    creationMode: row.creationMode as ProjectResource["creationMode"],
    status: row.status as ProjectResource["status"],
    currentStage: row.currentStage as ProjectResource["currentStage"],
    progressPct: row.progressPct,
    starred: row.starred,
    startedAt: row.startedAt,
    targetCompletedAt: row.targetCompletedAt ?? null,
    completedAt: row.completedAt ?? null,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toOutput(row: ContentOutputRow): ContentOutputResource {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    contentType: row.contentType as ContentOutputResource["contentType"],
    format: row.format,
    aspectRatio: row.aspectRatio,
    targetDurationSeconds: row.targetDurationSeconds,
    status: row.status as ContentOutputResource["status"],
    contentRole: (row.contentRole ??
      null) as ContentOutputResource["contentRole"],
    primaryAssetId: row.primaryAssetId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toTask(row: TaskRow): TaskResource {
  return {
    id: row.id,
    projectId: row.projectId,
    contentOutputId: row.contentOutputId ?? null,
    stage: row.stage as TaskResource["stage"],
    title: row.title,
    description: row.description,
    status: row.status as TaskResource["status"],
    priority: row.priority as TaskResource["priority"],
    dueAt: row.dueAt ?? null,
    completedAt: row.completedAt ?? null,
  };
}

function toActivity(row: ActivityRow): ProjectActivityResource {
  return {
    id: row.id,
    projectId: row.projectId,
    eventType: row.eventType,
    entityType: row.entityType,
    entityId: row.entityId,
    eventData: (row.eventData ?? {}) as Record<string, unknown>,
    occurredAt: row.occurredAt,
  };
}

type Input = { params?: unknown; query?: unknown; body?: unknown };

export interface ProjectsTransportDeps {
  service: ProjectsService;
  repo: ProjectRepository;
}

export function createProjectsTransport(
  factory: (ctx: RequestContext) => ProjectsTransportDeps,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const { service, repo } = factory(ctx);

      const { params, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as {
        projectId?: string;
        outputId?: string;
        taskId?: string;
        stage?: string;
      };
      const b = (body ?? {}) as Record<string, unknown>;
      const listMeta = (total: number) => ({
        requestId: ctx.requestId,
        page: 1,
        pageSize: 50,
        total,
      });
      const singleMeta = { requestId: ctx.requestId };

      switch (endpoint.id) {
        case "projects.list": {
          const rows = await repo.list(ctx);
          return { data: rows.map(toProject), meta: listMeta(rows.length) };
        }
        case "projects.create": {
          const row = await service.createProject(ctx, {
            title: String(b.title ?? ""),
            brief: b.brief as string | undefined,
            contentType: b.contentType as string | undefined,
            creationMode: b.creationMode as string | undefined,
            targetPlatforms: b.targetPlatforms as string[] | undefined,
          });
          return { data: toProject(row), meta: singleMeta };
        }
        case "projects.get":
          return {
            data: toProject(await repo.get(ctx, p.projectId ?? "")),
            meta: singleMeta,
          };
        case "projects.patch":
          return {
            data: toProject(
              await service.patchProject(ctx, p.projectId ?? "", {
                title: b.title as string | undefined,
                brief: b.brief as string | undefined,
                starred: b.starred as boolean | undefined,
              }),
            ),
            meta: singleMeta,
          };
        case "projects.archive":
          return {
            data: toProject(await service.archiveProject(ctx, p.projectId ?? "")),
            meta: singleMeta,
          };
        case "projects.stage.transition":
          return {
            data: toProject(
              await service.transitionProjectStage(
                ctx,
                p.projectId ?? "",
                p.stage ?? "",
                { reason: b.reason as string | undefined },
              ),
            ),
            meta: singleMeta,
          };
        case "projects.outputs.create":
          return {
            data: toOutput(
              await service.createOutput(ctx, p.projectId ?? "", {
                title: String(b.title ?? ""),
                contentRole: b.contentRole as
                  | "traffic"
                  | "trust"
                  | "conversion"
                  | undefined,
              }),
            ),
            meta: singleMeta,
          };
        case "projects.outputs.list": {
          const rows = await repo.listOutputs(ctx, p.projectId ?? "");
          return { data: rows.map(toOutput), meta: listMeta(rows.length) };
        }
        case "outputs.get":
          return {
            data: toOutput(await repo.getOutput(ctx, p.outputId ?? "")),
            meta: singleMeta,
          };
        case "outputs.patch":
          return {
            data: toOutput(
              await service.patchOutput(ctx, p.outputId ?? "", {
                title: b.title as string | undefined,
                primaryAssetId:
                  "primaryAssetId" in b
                    ? (b.primaryAssetId as string | null)
                    : undefined,
              }),
            ),
            meta: singleMeta,
          };
        case "outputs.stage.transition":
          return {
            data: toOutput(
              await service.transitionOutputStage(
                ctx,
                p.outputId ?? "",
                p.stage ?? "",
                { reason: b.reason as string | undefined },
              ),
            ),
            meta: singleMeta,
          };
        case "projects.tasks.list": {
          const rows = await repo.listTasks(ctx, p.projectId ?? "");
          return { data: rows.map(toTask), meta: listMeta(rows.length) };
        }
        case "projects.tasks.create":
          return {
            data: toTask(
              await service.createTask(ctx, p.projectId ?? "", {
                title: String(b.title ?? ""),
                stage: String(b.stage ?? ""),
              }),
            ),
            meta: singleMeta,
          };
        case "tasks.patch":
          return {
            data: toTask(
              await service.patchTask(ctx, p.taskId ?? "", {
                status: b.status as
                  | "todo"
                  | "in_progress"
                  | "done"
                  | "blocked"
                  | undefined,
                title: b.title as string | undefined,
              }),
            ),
            meta: singleMeta,
          };
        case "projects.activity.list": {
          const rows = await repo.listActivity(ctx, p.projectId ?? "");
          return { data: rows.map(toActivity), meta: listMeta(rows.length) };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
