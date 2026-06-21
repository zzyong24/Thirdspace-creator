import type {
  AgentRunner,
  AiTaskStore,
  DomainReadPort,
} from "./ports.js";
import type { AgentConfigRow, ModelConfigRow } from "./agent-config-resolver.js";
import { runTask, type RunTaskResult } from "./orchestrator.js";

// Task 11 dev run mode (foundation §3 / design-spec §4.1). A bounded polling loop:
// claimNextQueued → runTask(orchestrator) → repeat until the queue drains or a max-batch
// cap is hit. The AiTaskQueue interface stays swappable to a real queue; this loop is the
// dev/seed drainer. It reads/writes the SAME store the Next app serves (the host injects
// the concrete AiTaskStore / DomainReadPort over the shared pglite db) — it is NOT
// invoked from any Next route. Per-task config (agent/model) is resolved by the injected
// resolver from the claimed task's taskType (the worker's user-scoped config lookups).

export interface RunLoopDeps {
  tasks: AiTaskStore;
  read: DomainReadPort;
  runner: AgentRunner;
  // Resolve the per-node config for a claimed task (by taskType). The host backs this
  // with the user-scoped agent_configurations / model_configurations lookups.
  resolveConfig: (
    taskType: string,
  ) => Promise<{ agentConfig: AgentConfigRow; modelConfig: ModelConfigRow }>;
  now: () => string;
  maxBatch?: number; // safety cap (default 50) so a runaway queue cannot spin forever
}

export interface RunLoopOutcome {
  processed: number;
  results: RunTaskResult[];
}

export async function drainQueue(deps: RunLoopDeps): Promise<RunLoopOutcome> {
  const cap = deps.maxBatch ?? 50;
  const results: RunTaskResult[] = [];
  for (let i = 0; i < cap; i++) {
    const claimed = await deps.tasks.claimNextQueued(deps.now());
    if (!claimed) break; // queue drained
    const { agentConfig, modelConfig } = await deps.resolveConfig(claimed.taskType);
    const result = await runTask(claimed.id, {
      tasks: deps.tasks,
      read: deps.read,
      runner: deps.runner,
      agentConfig,
      modelConfig,
      now: deps.now,
    });
    results.push(result);
  }
  return { processed: results.length, results };
}
