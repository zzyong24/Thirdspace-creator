import { z } from "zod";
import { defineEndpoint } from "../endpoints";
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
  projectSource,
  platformRef,
  projectStageResource,
  contentOutputResource,
  contentRole,
  taskResource,
  projectActivityResource,
} from "../resources/projects";

const projectParams = z.object({ projectId: id });
const outputParams = z.object({ outputId: id });

// SPEC §13 "项目与流程" group. `GET /projects/:projectId/overview` is a page
// composition DTO and is registered under operations/pages.ts.
export const projectsOperations = {
  listProjects: defineEndpoint({
    id: "projects.list",
    method: "GET",
    path: "/projects",
    // paginationQuery + optional status filter and sort key (v0.2). Both are
    // optional so existing callers keep validating against the base shape.
    query: paginationQuery.extend({
      status: projectStatus.optional(),
      sort: z.enum(["updatedAt", "createdAt", "title"]).optional(),
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
      source: projectSource.optional(),
      platformRef: platformRef.optional(),
    }),
    response: projectResource,
    fr: ["FR-PROJECTS-CREATE", "FR-002"],
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
} as const;
