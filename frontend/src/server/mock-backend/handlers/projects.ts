import type { Handler } from "../mock-transport";
import { nextId, FIXED_NOW_ISO, type MockStore } from "../store";
import type { Project, ProjectStageName } from "@/types/domain";

// The store is a mutable clone of the canonical dataset (Task 1). The domain
// types mark fields `readonly` for callers, but handlers own the store and may
// mutate it in place; this strips that modifier at the mutation site only.
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// The project pipeline order. A stage transition is legal only between adjacent
// stages (forward or backward by one). Mirrors the STAGE_ORDER used by the
// project-overview selector and shell stepper.
const STAGE_ORDER: ReadonlyArray<ProjectStageName> = [
  "research",
  "planning",
  "script",
  "production",
  "publishing",
  "review",
];

// Projects read handlers, keyed by the real contract endpoint ids
// (contract/src/operations/projects.ts). All reads project the mutable store's
// collections (cloned from canonicalDataset) so they conform to the resource
// schemas the typed client validates against.

const listProjects: Handler = ({ store }) => store.projects;

const getProject: Handler = ({ params, store }) => {
  const { projectId } = params as { projectId: string };
  const project = store.projects.find((p) => p.id === projectId);
  if (!project) {
    throw new Error(`OwnershipError: project not found: ${projectId}`);
  }
  return project;
};

const listOutputs: Handler = ({ params, store }) => {
  const { projectId } = params as { projectId: string };
  return store.contentOutputs.filter((o) => o.projectId === projectId);
};

const listTasks: Handler = ({ params, store }) => {
  const { projectId } = params as { projectId: string };
  return store.tasks.filter((t) => t.projectId === projectId);
};

const listActivity: Handler = ({ params, store }) => {
  const { projectId } = params as { projectId: string };
  return store.projectActivities.filter((a) => a.projectId === projectId);
};

// --- Write handlers (SPEC §12 transitions; deterministic ids + fixed clock) ---

// createProject: seed a fresh active project at the first pipeline stage. Ids
// come from the seeded counter; timestamps from FIXED_NOW_ISO (no Date.now).
const createProject: Handler = ({ body, store }) => {
  const { title, brief } = body as { title: string; brief?: string };
  const project: Project = {
    id: nextId(store, "project"),
    userId: store.user.id,
    title,
    brief: brief ?? "",
    contentCategory: "",
    creationMode: "guided",
    status: "active",
    currentStage: "research",
    progressPct: 0,
    starred: false,
    startedAt: FIXED_NOW_ISO,
    targetCompletedAt: null,
    completedAt: null,
    archivedAt: null,
    createdAt: FIXED_NOW_ISO,
    updatedAt: FIXED_NOW_ISO,
  };
  store.projects.push(project);
  return project;
};

const findProjectOrThrow = (
  store: MockStore,
  projectId: string,
): Mutable<Project> => {
  const project = store.projects.find((p) => p.id === projectId);
  if (!project) {
    throw new Error(`OwnershipError: project not found: ${projectId}`);
  }
  return project as Mutable<Project>;
};

// transitionProjectStage: advance/retreat currentStage by one adjacent step and
// append a stage_transition ProjectActivity. Illegal (non-adjacent / unknown)
// moves raise a ConflictError, per SPEC §12 (service-approved updates only).
const transitionProjectStage: Handler = ({ params, store }) => {
  const { projectId, stage } = params as {
    projectId: string;
    stage: ProjectStageName;
  };
  const project = findProjectOrThrow(store, projectId);

  const fromIdx = STAGE_ORDER.indexOf(project.currentStage);
  const toIdx = STAGE_ORDER.indexOf(stage);
  if (toIdx === -1 || Math.abs(toIdx - fromIdx) !== 1) {
    throw new Error(
      `ConflictError: illegal stage transition ${project.currentStage} -> ${stage}`,
    );
  }

  const previousStage = project.currentStage;
  project.currentStage = stage;
  project.updatedAt = FIXED_NOW_ISO;

  store.projectActivities.push({
    id: nextId(store, "activity"),
    projectId,
    eventType: "stage_transition",
    entityType: "project",
    entityId: projectId,
    eventData: { fromStage: previousStage, toStage: stage },
    occurredAt: FIXED_NOW_ISO,
  });

  return project;
};

// archiveProject: status -> archived + archivedAt stamp (Project state machine).
const archiveProject: Handler = ({ params, store }) => {
  const { projectId } = params as { projectId: string };
  const project = findProjectOrThrow(store, projectId);
  project.status = "archived";
  project.archivedAt = FIXED_NOW_ISO;
  project.updatedAt = FIXED_NOW_ISO;
  return project;
};

// patchProject: shallow-merge the allowed fields (title/brief/starred only).
const patchProject: Handler = ({ params, body, store }) => {
  const { projectId } = params as { projectId: string };
  const patch = body as {
    title?: string;
    brief?: string;
    starred?: boolean;
  };
  const project = findProjectOrThrow(store, projectId);
  if (patch.title !== undefined) project.title = patch.title;
  if (patch.brief !== undefined) project.brief = patch.brief;
  if (patch.starred !== undefined) project.starred = patch.starred;
  project.updatedAt = FIXED_NOW_ISO;
  return project;
};

export const projectsHandlers: Record<string, Handler> = {
  "projects.list": listProjects,
  "projects.get": getProject,
  "projects.outputs.list": listOutputs,
  "projects.tasks.list": listTasks,
  "projects.activity.list": listActivity,
  "projects.create": createProject,
  "projects.stage.transition": transitionProjectStage,
  "projects.archive": archiveProject,
  "projects.patch": patchProject,
};
