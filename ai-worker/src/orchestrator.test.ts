import { describe, it, expect } from "vitest";
import { runTask } from "./orchestrator.js";
import { createFixtureStore } from "./fixtures/fixture-store.js";
import { createFakeAgentRunner } from "./runner/fake-agent-runner.js";

const agentConfig = { agentType: "script.rewrite", capabilities: { skills: ["script-rewrite"] }, settings: {} };
const modelConfig = { capability: "script.rewrite", modelName: "claude-fable-5", settings: { effort: "high" } };
const clock = () => "2026-06-21T00:00:05.000Z";

describe("runTask", () => {
  it("lands a formalizing candidate at awaiting_confirmation", async () => {
    const fx = createFixtureStore();
    const claimed = await fx.tasks.claimNextQueued("2026-06-21T00:00:01.000Z");
    const runner = createFakeAgentRunner({
      script: (t) => t.submitCandidate({ resultType: "artifact_version", resultData: { artifactId: "artifact-1", body: "改写稿" } }),
      totalCostUsd: 0.42,
    });
    const result = await runTask(claimed!.id, { tasks: fx.tasks, read: fx.read, runner, agentConfig, modelConfig, now: clock });
    const task = await fx.tasks.getTask(claimed!.id);
    expect(task?.status).toBe("awaiting_confirmation");
    expect(task?.costUsd).toBe(0.42);
    expect(task?.sessionId).toBe("fake-session-1");
    expect(result.resultId).toBeTruthy();
    const stored = await fx.tasks.getResult(result.resultId!);
    expect(stored?.resultType).toBe("artifact_version");
    expect(stored?.resultData.body).toBe("改写稿");
  });

  it("lands an advisory candidate straight at succeeded (no confirmation gate)", async () => {
    const fx = createFixtureStore();
    const claimed = await fx.tasks.claimNextQueued("2026-06-21T00:00:01.000Z");
    const runner = createFakeAgentRunner({
      script: (t) => t.submitCandidate({ resultType: "advisory", resultData: { message: "建议补充数据" } }),
    });
    await runTask(claimed!.id, { tasks: fx.tasks, read: fx.read, runner, agentConfig, modelConfig, now: clock });
    expect((await fx.tasks.getTask(claimed!.id))?.status).toBe("succeeded");
  });

  it("fails the task when the run errors with no candidate", async () => {
    const fx = createFixtureStore();
    const claimed = await fx.tasks.claimNextQueued("2026-06-21T00:00:01.000Z");
    const runner = createFakeAgentRunner({ subtype: "error_during_execution", script: () => {} });
    await runTask(claimed!.id, { tasks: fx.tasks, read: fx.read, runner, agentConfig, modelConfig, now: clock });
    const task = await fx.tasks.getTask(claimed!.id);
    expect(task?.status).toBe("failed");
    expect(task?.errorMessage).toContain("error_during_execution");
  });

  it("fails the task when an invalid candidate is submitted", async () => {
    const fx = createFixtureStore();
    const claimed = await fx.tasks.claimNextQueued("2026-06-21T00:00:01.000Z");
    const runner = createFakeAgentRunner({
      script: (t) => t.submitCandidate({ resultType: "artifact_version", resultData: { artifactId: "artifact-1" } }),
    });
    await runTask(claimed!.id, { tasks: fx.tasks, read: fx.read, runner, agentConfig, modelConfig, now: clock });
    expect((await fx.tasks.getTask(claimed!.id))?.status).toBe("failed");
  });
});
