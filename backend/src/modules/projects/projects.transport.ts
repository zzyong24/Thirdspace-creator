import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "@creatoros/backend";
import type { ProjectsService, BriefDetail } from "./projects.service";
import type {
  ProjectRepository,
  ProjectRow,
  StageRow,
  ContentOutputRow,
  TaskRow,
  ActivityRow,
} from "./projects.repository";
import {
  projectResource,
  type ProjectResource,
  type ProjectStageResource,
  type ContentOutputResource,
  type TaskResource,
  type ProjectActivityResource,
} from "./projects.schema";

// Projects transport (foundation §5.4) — all contract ops in the SPEC §13
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
  "projects.delete",
  "projects.stage.transition",
  "projects.outputs.create",
  "projects.outputs.list",
  "projects.stages.list",
  "outputs.get",
  "outputs.patch",
  "outputs.stage.transition",
  "projects.tasks.list",
  "projects.tasks.create",
  "tasks.patch",
  "projects.activity.list",
  // [T-374] composition-only op:module transport 不认它(default → UnsupportedOperationError),
  //   persistence-client 的 projectsWithTranscribe wrapper 在到达 module transport 前拦截
  //   (触发要 ai transport transcribe.douyin 排队,在 composition 层才可见)。列入 OP_IDS 让
  //   PERSISTED_OPS/dispatch 把它路由到 projects transport(同 benchmark.works.transcribe 先例)。
  "projects.transcribe",
] as const;

// jsonb(unknown)→ 契约 projectBriefDetail 的规范形状(立项 Brief 地基)。丢未知键、
// 平台数组只留非空字符串、字符串字段原样透传(empty `{}` → 全默认)。DTO 由显式
// mapper 构造(SPEC §9),绝不直接把 Drizzle row 当 wire。
function toBriefDetail(raw: unknown): ProjectResource["briefDetail"] {
  // 必须由契约 schema 做唯一白名单。此前这里手写 7 个字段，新增的 orientation 与
  // contentRadarEvidence 虽已完整落在 projects.brief_detail，却会在 projects.get
  // row→DTO 时被静默丢掉，导致项目页拿不到对标原稿、拆解策略和改写稿。
  const briefSchema = projectResource.shape.briefDetail;
  const parsed = briefSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;

  // 存量库里若只有某一段雷达证据不完整，不能因此把受众、目标、画幅等整个 Brief
  // 一并清空。先只移除不合法的嵌套证据，再保留其余合法字段；最坏才退回空 Brief。
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  delete source.contentRadarEvidence;
  const withoutInvalidEvidence = briefSchema.safeParse(source);
  return withoutInvalidEvidence.success
    ? withoutInvalidEvidence.data
    : briefSchema.parse({});
}

// jsonb(unknown)→ 契约 platformRef 规范形状(数据底座 / SPEC §1.2)。丢未知键、
// platform/externalId 兜空串、shareUrl/publishedAt 仅在非空字符串时带上。DTO 由显式
// mapper 构造(SPEC §9),绝不直接把 Drizzle row 当 wire。
function toPlatformRef(raw: unknown): ProjectResource["platformRef"] {
  const c = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined;
  const out: ProjectResource["platformRef"] = {
    platform: typeof c.platform === "string" ? c.platform : "",
    externalId: typeof c.externalId === "string" ? c.externalId : "",
  };
  const su = str(c.shareUrl);
  if (su) out.shareUrl = su;
  const pa = str(c.publishedAt);
  if (pa) out.publishedAt = pa;
  // [T-073] 平台侧可见性:仅在明确为 true 时带上(未同步/可见不带键,不瞎标)。
  if (c.hidden === true) out.hidden = true;
  return out;
}

function toProject(row: ProjectRow): ProjectResource {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    brief: row.brief,
    briefDetail: toBriefDetail((row as { briefDetail?: unknown }).briefDetail),
    contentCategory: row.contentCategory,
    source: ((row as { source?: unknown }).source ??
      "manual") as ProjectResource["source"],
    platformRef: toPlatformRef((row as { platformRef?: unknown }).platformRef),
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

function toStage(row: StageRow): ProjectStageResource {
  return {
    stage: row.stage as ProjectStageResource["stage"],
    status: row.status as ProjectStageResource["status"],
    progressPct: row.progressPct,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
  };
}

function toOutput(row: ContentOutputRow): ContentOutputResource {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    contentType: row.contentType as ContentOutputResource["contentType"],
    targetPlatform: (row.targetPlatform ?? null) as ContentOutputResource["targetPlatform"],
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
  createArticleOutput?: (ctx: RequestContext, projectId: string, input: {
    title: string;
    contentRole?: "traffic" | "trust" | "conversion";
    clientRequestId?: string;
    targetPlatform?: string;
  }) => Promise<ContentOutputRow>;
  createGraphicPostOutput?: (ctx: RequestContext, projectId: string, input: {
    title: string;
    targetPlatform?: string;
    clientRequestId: string;
  }) => Promise<ContentOutputRow>;
}

export function createProjectsTransport(
  factory: (ctx: RequestContext) => ProjectsTransportDeps,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const { service, repo, createArticleOutput, createGraphicPostOutput } = factory(ctx);

      const { params, query, body } = (input ?? {}) as Input;
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
          // T-595：源边界已归一，下游列表不再解释 hidden 查询参数。
          const rows = await repo.list(ctx);
          return { data: rows.map(toProject), meta: listMeta(rows.length) };
        }
        case "projects.create": {
          const row = await service.createProject(ctx, {
            title: String(b.title ?? ""),
            brief: b.brief as string | undefined,
            briefDetail: b.briefDetail as BriefDetail | undefined,
            contentType: b.contentType as string | undefined,
            creationMode: b.creationMode as string | undefined,
            targetPlatforms: b.targetPlatforms as string[] | undefined,
            // 数据底座(SPEC §1.2):透传可选 source/platformRef(service 兜默认 manual)。
            source: b.source as
              | "manual"
              | "topic"
              | "imported"
              | undefined,
            platformRef: b.platformRef as
              | {
                  platform: string;
                  externalId: string;
                  shareUrl?: string;
                  publishedAt?: string;
                }
              | undefined,
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
                briefDetail:
                  "briefDetail" in b
                    ? (b.briefDetail as Record<string, unknown> | undefined)
                    : undefined,
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
        case "projects.delete":
          // T-102 物理删除:级联清理 + 删根(service.deleteProject),返回删除前快照。
          return {
            data: toProject(await service.deleteProject(ctx, p.projectId ?? "")),
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
              b.contentType === "image"
                ? await (() => {
                    if (!createGraphicPostOutput) throw new UnsupportedOperationError("Graphic post output service unavailable");
                    if (typeof b.clientRequestId !== "string") throw new UnsupportedOperationError("Graphic post create requires clientRequestId");
                    return createGraphicPostOutput(ctx, p.projectId ?? "", {
                      title: String(b.title ?? ""),
                      targetPlatform: b.targetPlatform as string | undefined,
                      clientRequestId: b.clientRequestId,
                    });
                  })()
                : b.contentType === "article"
                ? await (() => {
                    if (!createArticleOutput) throw new UnsupportedOperationError("Article output service unavailable");
                    return createArticleOutput(ctx, p.projectId ?? "", {
                      title: String(b.title ?? ""),
                      contentRole: b.contentRole as "traffic" | "trust" | "conversion" | undefined,
                      clientRequestId: b.clientRequestId as string | undefined,
                      targetPlatform: b.targetPlatform as string | undefined,
                    });
                  })()
                : await service.createOutput(ctx, p.projectId ?? "", {
                title: String(b.title ?? ""),
                clientRequestId: b.clientRequestId as string | undefined,
                contentType: b.contentType as "video" | undefined,
                targetPlatform: b.targetPlatform as string | undefined,
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
        case "projects.stages.list": {
          const rows = await repo.listStages(ctx, p.projectId ?? "");
          return { data: rows.map(toStage), meta: listMeta(rows.length) };
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
