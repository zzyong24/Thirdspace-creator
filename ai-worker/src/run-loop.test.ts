import { describe, it, expect } from "vitest";
import { drainQueue } from "./run-loop.js";
import { createAgentRunner } from "./runner/agent-runner-factory.js";
import { createFixtureStore } from "./fixtures/fixture-store.js";

// run-loop test — the dev drainer claims the queued task, runs it through the orchestrator
// on the deterministic fake runner, and stops when the queue is empty. The claimed task
// ends in awaiting_confirmation (a formalizing artifact_version candidate).

const agentConfig = {
  agentType: "script.rewrite",
  capabilities: { skills: ["script-rewrite"] },
  settings: {},
};
const modelConfig = {
  capability: "script.rewrite",
  modelName: "claude-fable-5",
  settings: { effort: "high" },
};

describe("drainQueue", () => {
  it("drains the queued task to awaiting_confirmation, then stops", async () => {
    const fx = createFixtureStore();
    const out = await drainQueue({
      tasks: fx.tasks,
      read: fx.read,
      runner: createAgentRunner({}),
      resolveConfig: async () => ({ agentConfig, modelConfig }),
      now: () => "2026-06-21T00:00:00.000Z",
    });
    expect(out.processed).toBe(1);
    expect(out.results[0]!.status).toBe("awaiting_confirmation");
    const task = await fx.tasks.getTask("task-1");
    expect(task?.status).toBe("awaiting_confirmation");
  });

  it("returns processed:0 when the queue is empty", async () => {
    const fx = createFixtureStore();
    await fx.tasks.claimNextQueued("2026-06-21T00:00:00.000Z"); // drain the only task
    await fx.tasks.updateTask("task-1", { status: "cancelled" });
    const out = await drainQueue({
      tasks: fx.tasks,
      read: fx.read,
      runner: createAgentRunner({}),
      resolveConfig: async () => ({ agentConfig, modelConfig }),
      now: () => "2026-06-21T00:00:00.000Z",
    });
    expect(out.processed).toBe(0);
  });
});
