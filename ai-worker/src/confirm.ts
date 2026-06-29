import type { AiTaskStore, ArtifactVersionView, DomainWritePort } from "./ports";
import { canTransition } from "./state-machine";

export interface ConfirmDeps {
  tasks: AiTaskStore;
  write: DomainWritePort;
  now: () => string;
}

export async function confirmResult(resultId: string, deps: ConfirmDeps): Promise<ArtifactVersionView> {
  const result = await deps.tasks.getResult(resultId);
  if (!result) throw new Error(`no result ${resultId}`);
  const task = await deps.tasks.getTask(result.aiTaskId);
  if (!task) throw new Error(`no task ${result.aiTaskId}`);
  if (task.status !== "awaiting_confirmation" || !canTransition(task.status, "succeeded")) {
    throw new Error(`task ${task.id} is not awaiting confirmation (status: ${task.status})`);
  }
  if (result.resultType !== "artifact_version") {
    throw new Error(`confirm not implemented for resultType ${result.resultType}`);
  }

  const artifactId = result.artifactId;
  const body = result.resultData.body;
  if (!artifactId || typeof body !== "string") {
    throw new Error("candidate is missing artifactId or body");
  }

  const version = await deps.write.appendArtifactVersion({ artifactId, body, sourceTaskId: task.id });
  await deps.tasks.updateTask(task.id, { status: "succeeded", completedAt: deps.now() });
  return version;
}

export interface RejectDeps {
  tasks: AiTaskStore;
  now: () => string;
}

export async function rejectResult(resultId: string, deps: RejectDeps): Promise<void> {
  const result = await deps.tasks.getResult(resultId);
  if (!result) throw new Error(`no result ${resultId}`);
  const task = await deps.tasks.getTask(result.aiTaskId);
  if (!task) throw new Error(`no task ${result.aiTaskId}`);
  if (!canTransition(task.status, "cancelled")) {
    throw new Error(`task ${task.id} cannot be cancelled from ${task.status}`);
  }
  await deps.tasks.updateTask(task.id, { status: "cancelled", completedAt: deps.now() });
}
