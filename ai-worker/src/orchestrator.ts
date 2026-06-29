import type { AgentRunner, AiTaskStore, DomainReadPort } from "./ports";
import type { AgentConfigRow, ModelConfigRow } from "./agent-config-resolver";
import { resolveRunOptions } from "./agent-config-resolver";
import { createContextTools } from "./context-tools";
import { parseCandidate, formalizes } from "./candidate-schemas";

export interface RunTaskDeps {
  tasks: AiTaskStore;
  read: DomainReadPort;
  runner: AgentRunner;
  agentConfig: AgentConfigRow;
  modelConfig: ModelConfigRow;
  now: () => string;
}

export interface RunTaskResult {
  status: string;
  resultId: string | null;
}

export async function runTask(taskId: string, deps: RunTaskDeps): Promise<RunTaskResult> {
  const task = await deps.tasks.getTask(taskId);
  if (!task) throw new Error(`no task ${taskId}`);

  const references = await deps.tasks.listReferences(taskId);
  const tools = createContextTools({ read: deps.read, references });
  const options = resolveRunOptions({
    agentConfig: deps.agentConfig,
    modelConfig: deps.modelConfig,
    allowedTools: tools.allowedTools,
    resume: task.sessionId ?? undefined,
  });

  const prompt = buildPrompt(task.taskType, task.inputData);

  const fail = async (message: string) => {
    await deps.tasks.updateTask(taskId, {
      status: "failed",
      errorMessage: message,
      completedAt: deps.now(),
    });
    return { status: "failed", resultId: null };
  };

  let outcome;
  try {
    outcome = await deps.runner.run({ prompt, options, tools });
  } catch (err) {
    return fail(`runner threw: ${err instanceof Error ? err.message : String(err)}`);
  }

  // record cost/session regardless of outcome
  await deps.tasks.updateTask(taskId, {
    sessionId: outcome.sessionId,
    costUsd: outcome.totalCostUsd,
  });

  if (outcome.subtype !== "success") {
    return fail(`agent run ended with ${outcome.subtype}`);
  }

  const captured = tools.getCaptured();
  if (!captured) {
    return fail("agent run finished without submitting a candidate");
  }

  const parsed = parseCandidate(captured);
  if (!parsed.ok) {
    return fail(`invalid candidate: ${parsed.error}`);
  }

  const result = await deps.tasks.insertResult({
    id: "",
    aiTaskId: taskId,
    resultType: parsed.resultType,
    artifactId: typeof parsed.resultData.artifactId === "string" ? parsed.resultData.artifactId : null,
    knowledgeItemId: null,
    assetId: null,
    resultData: parsed.resultData,
  });

  const nextStatus = formalizes(parsed.resultType) ? "awaiting_confirmation" : "succeeded";
  await deps.tasks.updateTask(taskId, {
    status: nextStatus,
    completedAt: nextStatus === "succeeded" ? deps.now() : null,
  });

  return { status: nextStatus, resultId: result.id };
}

function buildPrompt(taskType: string, inputData: Record<string, unknown>): string {
  // The Skill (selected via taskType) carries the procedure; the prompt carries the task framing.
  return [
    `Task: ${taskType}.`,
    `Inputs: ${JSON.stringify(inputData)}.`,
    "Use the creatoros tools to read the context you need, then call submit_candidate exactly once.",
    "Do not attempt to finalize or apply changes yourself.",
  ].join("\n");
}
