import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, paginationQuery, projectStageName } from "../primitives";
import {
  projectResource,
  contentOutputResource,
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
    query: paginationQuery,
    response: projectResource,
    isList: true,
    fr: ["FR-PROJECTS-LIST"],
  }),
  createProject: defineEndpoint({
    id: "projects.create",
    method: "POST",
    path: "/projects",
    body: z.object({ title: z.string().min(1), brief: z.string().default("") }),
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
    body: z.object({ title: z.string().min(1) }),
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
