import type {
  AiTaskRecord,
  AiTaskReferenceRecord,
  AiTaskResultRecord,
  AiTaskStore,
  ArtifactVersionView,
  DomainReadPort,
  DomainWritePort,
  KnowledgeItemView,
  ProjectView,
} from "../ports.js";

export interface FixtureStore {
  tasks: AiTaskStore;
  read: DomainReadPort;
  write: DomainWritePort;
}

export function createFixtureStore(): FixtureStore {
  const tasks = new Map<string, AiTaskRecord>();
  const refs = new Map<string, AiTaskReferenceRecord[]>();
  const results = new Map<string, AiTaskResultRecord>();
  const projects = new Map<string, ProjectView>();
  const knowledge = new Map<string, KnowledgeItemView>();
  // artifactId -> versions (append-only; each version object is frozen)
  const versions = new Map<string, ArtifactVersionView[]>();

  let resultSeq = 0;
  let versionSeq = 0;

  projects.set("project-1", { id: "project-1", title: "示例项目", stage: "script" });
  knowledge.set("knowledge-1", {
    id: "knowledge-1",
    title: "受众洞察",
    summary: "目标受众偏好快节奏开场",
  });
  versions.set("artifact-1", [
    Object.freeze({
      artifactId: "artifact-1",
      versionId: "version-1",
      versionNumber: 1,
      body: "原始脚本",
      isCurrent: true,
    }),
  ]);

  tasks.set("task-1", {
    id: "task-1",
    userId: "user-1",
    projectId: "project-1",
    contentOutputId: "output-1",
    taskType: "script.rewrite",
    status: "queued",
    inputData: { artifactId: "artifact-1", instructions: "收紧开场，提高节奏" },
    modelKey: "script.rewrite",
    idempotencyKey: "idem-1",
    requestedAt: "2026-06-21T00:00:00.000Z",
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    sessionId: null,
    costUsd: null,
  });
  refs.set("task-1", [
    {
      id: "ref-1",
      aiTaskId: "task-1",
      entityType: "artifact",
      entityId: "artifact-1",
      relationType: "rewrite_source",
    },
    {
      id: "ref-2",
      aiTaskId: "task-1",
      entityType: "knowledge_item",
      entityId: "knowledge-1",
      relationType: "context",
    },
  ]);

  const store: AiTaskStore = {
    async claimNextQueued(now) {
      for (const task of tasks.values()) {
        if (task.status === "queued") {
          const updated = { ...task, status: "running" as const, startedAt: now };
          tasks.set(task.id, updated);
          return updated;
        }
      }
      return null;
    },
    async getTask(id) {
      return tasks.get(id) ?? null;
    },
    async updateTask(id, patch) {
      const cur = tasks.get(id);
      if (!cur) throw new Error(`no task ${id}`);
      const updated = { ...cur, ...patch };
      tasks.set(id, updated);
      return updated;
    },
    async listReferences(taskId) {
      return refs.get(taskId) ?? [];
    },
    async insertResult(rec) {
      const id = `result-${++resultSeq}`;
      const stored = { ...rec, id };
      results.set(id, stored);
      return stored;
    },
    async getResult(id) {
      return results.get(id) ?? null;
    },
  };

  const read: DomainReadPort = {
    async getProject(id) {
      return projects.get(id) ?? null;
    },
    async getCurrentArtifactVersion(artifactId) {
      const list = versions.get(artifactId) ?? [];
      return list.find((v) => v.isCurrent) ?? null;
    },
    async listKnowledgeItems(ids) {
      return ids.map((id) => knowledge.get(id)).filter((k): k is KnowledgeItemView => !!k);
    },
  };

  const write: DomainWritePort = {
    async appendArtifactVersion({ artifactId, body }) {
      const list = versions.get(artifactId) ?? [];
      const demoted = list.map((v) => Object.freeze({ ...v, isCurrent: false }));
      const next = Object.freeze({
        artifactId,
        versionId: `version-new-${++versionSeq}`,
        versionNumber: demoted.length + 1,
        body,
        isCurrent: true,
      });
      versions.set(artifactId, [...demoted, next]);
      return next;
    },
  };

  return { tasks: store, read, write };
}
