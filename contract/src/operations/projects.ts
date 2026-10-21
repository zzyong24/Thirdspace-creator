import { z } from "zod";
import { defineEndpoint } from "../endpoint-definition";
import {
  id,
  paginationQuery,
  projectStageName,
  projectStatus,
  contentType,
  creationMode,
  platformId,
} from "../primitives";
import {
  projectResource,
  projectBriefDetail,
  platformRef,
  projectStageResource,
  contentOutputResource,
  contentRole,
  taskResource,
  projectActivityResource,
  projectSourceReference,
  projectPreparationStepName,
  projectPreparationResource,
  projectPreparationAcceptanceReceipt,
} from "../resources/projects";

const projectParams = z.object({ projectId: id });
const outputParams = z.object({ outputId: id });
const idempotencyKey = z.string().trim().min(1).max(256);
const projectCreationFields = {
  title: z.string().min(1),
  brief: z.string().default(""),
  briefDetail: projectBriefDetail.optional(),
  contentType: contentType.optional(),
  creationMode: creationMode.optional(),
  targetPlatforms: z.array(platformId).optional(),
};

// N-4：资源六值不扩大公开旧创建合同。imported 仍必须由后端可信 ingestion 守卫裁决。
export const publicProjectCreateSource = z.enum(["manual", "topic", "imported"]);
export const projectEnsureInput = z.discriminatedUnion("source", [
  z.object({ source: z.literal("manual"), ...projectCreationFields, idempotencyKey }).strict(),
  z.object({
    source: z.literal("quick_create"), ...projectCreationFields, sourceItemId: id.optional(), idempotencyKey,
  }).strict(),
  z.object({
    source: z.literal("topic"), candidateId: id, idempotencyKey: idempotencyKey.optional(),
  }).strict(),
  z.object({
    source: z.literal("radar"), itemId: id, positioningVersionId: id.optional(), idempotencyKey,
  }).strict(),
]);
export type ProjectEnsureInput = z.infer<typeof projectEnsureInput>;
export const projectEnsureResult = z.object({
  project: projectResource,
  preparationTaskId: id.nullable(),
  sourceReferences: z.array(projectSourceReference),
  reused: z.boolean(),
}).strict();
export type ProjectEnsureResult = z.infer<typeof projectEnsureResult>;

export const projectPreparationStartInput = z.object({
  idempotencyKey,
  requestedSteps: z.array(projectPreparationStepName).min(1).max(3).refine(
    (steps) => new Set(steps).size === steps.length,
    { message: "准备步骤不能重复" },
  ),
}).strict();
export type ProjectPreparationStartInput = z.infer<typeof projectPreparationStartInput>;

const transcriptSubmissionFields = {
  parentTaskId: id,
  referenceId: id,
  expectedSourceDigest: z.string().min(1),
  expectedStepRevision: z.number().int().nonnegative(),
  submissionKey: idempotencyKey,
};
export const projectPreparationTranscriptInput = z.discriminatedUnion("inputMode", [
  z.object({
    ...transcriptSubmissionFields, inputMode: z.literal("paste"), text: z.string().trim().min(1).max(500_000),
  }).strict(),
  // 既有受控上传完成后的真实素材/文件引用；服务端再核归属及实际格式，不接本机路径。
  z.object({
    ...transcriptSubmissionFields, inputMode: z.literal("file"),
    assetId: id, assetFileId: id, format: z.enum(["txt", "md", "srt", "vtt"]),
  }).strict(),
]);
export type ProjectPreparationTranscriptInput = z.infer<typeof projectPreparationTranscriptInput>;

export const projectPreparationCandidateAcceptInput = z.object({
  idempotencyKey,
  candidateSourceDigest: z.string().min(1),
  baseline: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("digest"), digest: z.string().min(1) }).strict(),
    z.object({
      kind: z.literal("versions"),
      projectVersion: z.number().int().nonnegative(),
      artifactVersion: z.number().int().nonnegative().nullable(),
    }).strict(),
  ]),
  editedContent: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("brief"), brief: z.string(), briefDetail: projectBriefDetail }).strict(),
    z.object({ kind: z.literal("draft"), text: z.string() }).strict(),
  ]).optional(),
}).strict();
export type ProjectPreparationCandidateAcceptInput = z.infer<typeof projectPreparationCandidateAcceptInput>;

// SPEC §13 "项目与流程" group. `GET /projects/:projectId/overview` is a page
// composition DTO and is registered under operations/pages.ts.
export const projectsOperations = {
  listProjects: defineEndpoint({
    id: "projects.list",
    method: "GET",
    path: "/projects",
    // paginationQuery + optional status filter + sort key (v0.2) + 显隐开关 (T-033)。
    // 整型 query(z.coerce.boolean 接 0/1/true/false)。NULL=用默认(过滤 platformRef.hidden=true)。
    query: paginationQuery.extend({
      status: projectStatus.optional(),
      sort: z.enum(["updatedAt", "createdAt", "title"]).optional(),
      hidden: z.coerce.boolean().optional(),
    }),
    response: projectResource,
    isList: true,
    fr: ["FR-PROJECTS-LIST"],
  }),
  createProject: defineEndpoint({
    id: "projects.create",
    method: "POST",
    path: "/projects",
    // title/brief are the required v0.1 fields; contentType/creationMode/
    // targetPlatforms are OPTIONAL v0.2 additions so the existing
    // {title, brief} create handlers still validate.
    body: z.object({
      title: z.string().min(1),
      brief: z.string().default(""),
      // 结构化 Brief 草稿(可选)—— 选题立项会带候选填的 brief 草稿;手动新建可不带。
      briefDetail: projectBriefDetail.optional(),
      contentType: contentType.optional(),
      creationMode: creationMode.optional(),
      targetPlatforms: z.array(platformId).optional(),
      // 数据底座(SPEC §1.2):可选 source/platformRef。省略 → service 默认 manual +
      // 空 platformRef(手动新建行为不变)。ingestion 导入路径经 service 传 imported。
      source: publicProjectCreateSource.optional(),
      platformRef: platformRef.optional(),
      idempotencyKey: idempotencyKey.optional(),
    }),
    response: projectResource,
    fr: ["FR-PROJECTS-CREATE", "FR-002"],
  }),
  ensureProject: defineEndpoint({
    id: "projects.ensure",
    method: "POST",
    path: "/projects/ensure",
    body: projectEnsureInput,
    response: projectEnsureResult,
    fr: ["FR-PROJECTS-ENSURE"],
  }),
  getProjectPreparation: defineEndpoint({
    id: "projects.preparation.get",
    method: "GET",
    path: "/projects/:projectId/preparation",
    params: projectParams,
    response: projectPreparationResource,
    fr: ["FR-PROJECTS-PREPARATION"],
  }),
  startProjectPreparation: defineEndpoint({
    id: "projects.preparation.start",
    method: "POST",
    path: "/projects/:projectId/preparation",
    params: projectParams,
    body: projectPreparationStartInput,
    response: projectPreparationResource,
    fr: ["FR-PROJECTS-PREPARATION"],
  }),
  provideProjectPreparationTranscript: defineEndpoint({
    id: "projects.preparation.transcript.provide",
    method: "POST",
    path: "/projects/:projectId/preparation/transcript",
    params: projectParams,
    body: projectPreparationTranscriptInput,
    response: projectPreparationResource,
    fr: ["FR-PROJECTS-PREPARATION"],
  }),
  acceptProjectPreparationCandidate: defineEndpoint({
    id: "projects.preparation.candidate.accept",
    method: "POST",
    path: "/projects/:projectId/preparation/candidates/:candidateId/accept",
    params: z.object({ projectId: id, candidateId: id }),
    body: projectPreparationCandidateAcceptInput,
    response: projectPreparationAcceptanceReceipt,
    fr: ["FR-PROJECTS-PREPARATION"],
  }),
  getProject: defineEndpoint({
    id: "projects.get",
    method: "GET",
    path: "/projects/:projectId",
    params: projectParams,
    response: projectResource,
    fr: ["FR-PROJECTS-GET"],
  }),
  patchProject: defineEndpoint({
    id: "projects.patch",
    method: "PATCH",
    path: "/projects/:projectId",
    params: projectParams,
    body: z.object({
      title: z.string().optional(),
      brief: z.string().optional(),
      // 立项工作台保存 —— 结构化 Brief 可编辑(整体替换 brief_detail jsonb)。
      briefDetail: projectBriefDetail.optional(),
      starred: z.boolean().optional(),
    }),
    response: projectResource,
    fr: ["FR-PROJECTS-UPDATE"],
  }),
  archiveProject: defineEndpoint({
    id: "projects.archive",
    method: "POST",
    path: "/projects/:projectId/archive",
    params: projectParams,
    response: projectResource,
    fr: ["FR-PROJECTS-ARCHIVE"],
  }),
  // T-102 物理删除(区别于 archive 软隐藏):DELETE /projects/:projectId。级联清除
  // 该项目全部关联行(脚本/发布/复盘/数据),不可恢复。additive —— 归档语义不变,
  // 删除是并列的第二种下线动作(用户裁决 2026-07-03「项目也要支持删除,除了归档之外」)。
  // 返回被删除项目的最后快照(与 archive 同 ProjectResource 形状,便于前端确认后展示/跳转)。
  deleteProject: defineEndpoint({
    id: "projects.delete",
    method: "DELETE",
    path: "/projects/:projectId",
    params: projectParams,
    response: projectResource,
    fr: ["FR-PROJECTS-DELETE"],
  }),
  transitionProjectStage: defineEndpoint({
    id: "projects.stage.transition",
    method: "POST",
    path: "/projects/:projectId/stages/:stage/transition",
    params: z.object({ projectId: id, stage: projectStageName }),
    body: z.object({ reason: z.string().optional() }),
    response: projectResource,
    fr: ["FR-STAGE-TRANSITION", "FR-006"],
  }),
  createOutput: defineEndpoint({
    id: "projects.outputs.create",
    method: "POST",
    path: "/projects/:projectId/outputs",
    params: projectParams,
    // contentRole is an OPTIONAL monetization-weighted intent field (§4.4);
    // existing {title} callers keep validating against the base shape.
    body: z.object({
      title: z.string().min(1),
      contentRole: contentRole.optional(),
      contentType: z.enum(["video", "article", "image"]).optional(),
      targetPlatform: platformId.optional(),
      clientRequestId: z.string().min(8).max(128).optional(),
    }),
    response: contentOutputResource,
    fr: ["FR-OUTPUT-CREATE"],
  }),
  listOutputs: defineEndpoint({
    id: "projects.outputs.list",
    method: "GET",
    path: "/projects/:projectId/outputs",
    params: projectParams,
    response: contentOutputResource,
    isList: true,
    fr: ["FR-OUTPUT-LIST"],
  }),
  listStages: defineEndpoint({
    id: "projects.stages.list",
    method: "GET",
    path: "/projects/:projectId/stages",
    params: projectParams,
    response: projectStageResource,
    isList: true,
    fr: ["FR-STAGE-LIST"],
  }),
  getOutput: defineEndpoint({
    id: "outputs.get",
    method: "GET",
    path: "/outputs/:outputId",
    params: outputParams,
    response: contentOutputResource,
    fr: ["FR-OUTPUT-GET"],
  }),
  patchOutput: defineEndpoint({
    id: "outputs.patch",
    method: "PATCH",
    path: "/outputs/:outputId",
    params: outputParams,
    body: z.object({
      title: z.string().optional(),
      primaryAssetId: id.nullable().optional(),
    }),
    response: contentOutputResource,
    fr: ["FR-OUTPUT-UPDATE"],
  }),
  transitionOutputStage: defineEndpoint({
    id: "outputs.stage.transition",
    method: "POST",
    path: "/outputs/:outputId/stages/:stage/transition",
    params: z.object({ outputId: id, stage: projectStageName }),
    body: z.object({ reason: z.string().optional() }),
    response: contentOutputResource,
    fr: ["FR-OUTPUT-STAGE-TRANSITION"],
  }),
  listTasks: defineEndpoint({
    id: "projects.tasks.list",
    method: "GET",
    path: "/projects/:projectId/tasks",
    params: projectParams,
    response: taskResource,
    isList: true,
    fr: ["FR-TASK-LIST"],
  }),
  createTask: defineEndpoint({
    id: "projects.tasks.create",
    method: "POST",
    path: "/projects/:projectId/tasks",
    params: projectParams,
    body: z.object({ title: z.string().min(1), stage: projectStageName }),
    response: taskResource,
    fr: ["FR-TASK-CREATE"],
  }),
  patchTask: defineEndpoint({
    id: "tasks.patch",
    method: "PATCH",
    path: "/tasks/:taskId",
    params: z.object({ taskId: id }),
    body: z.object({
      status: z.enum(["todo", "in_progress", "done", "blocked"]).optional(),
      title: z.string().optional(),
    }),
    response: taskResource,
    fr: ["FR-TASK-UPDATE"],
  }),
  listActivity: defineEndpoint({
    id: "projects.activity.list",
    method: "GET",
    path: "/projects/:projectId/activity",
    params: projectParams,
    response: projectActivityResource,
    isList: true,
    fr: ["FR-ACTIVITY-LIST"],
  }),
  // [T-374] 自己作品单条立抓逐字稿(项目页顶条「立即抓取逐字稿」)。composition-only op
  //   (module transport 不认它,由 persistence-client 的 projectsWithTranscribe 拦截 ——
  //   触发要 ai transport 的 transcribe.douyin 排队 + live dispatch,在 composition 层才可见,
  //   同 benchmark.works.transcribe / scheduledJobs.runNow 约定)。composition 写前检查当前
  //   output_script：已有该 aweme 真稿 → ConflictError（不 enqueue）；无锚 → ValidationError。
  //   T-513 后由动作发起方携带 attemptId：同一网络请求重发收敛，新动作显式换新 attempt。
  transcribeProjectWork: defineEndpoint({
    id: "projects.transcribe",
    method: "POST",
    path: "/projects/:projectId/transcribe",
    params: projectParams,
    // T-513：由真正的动作发起方生成。浏览器/工具层重发同一请求时复用，wrapper
    // 原样透传给 ai.tasks.create，不能在服务端收到每次 POST 后重新生成。
    body: z.object({ attemptId: z.string().min(16).max(128) }),
    response: z.object({ taskId: z.string() }),
    fr: ["FR-PROJECT-TRANSCRIBE"],
  }),
} as const;
