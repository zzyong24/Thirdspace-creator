import type { Handler } from "../mock-transport";

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

// Write handlers are filled in Task 6.
export const projectsHandlers: Record<string, Handler> = {
  "projects.list": listProjects,
  "projects.get": getProject,
  "projects.outputs.list": listOutputs,
  "projects.tasks.list": listTasks,
  "projects.activity.list": listActivity,
};
