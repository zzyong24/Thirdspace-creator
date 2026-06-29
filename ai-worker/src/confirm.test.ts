import { describe, it, expect } from "vitest";
import { runTask } from "./orchestrator";
import { confirmResult, rejectResult } from "./confirm";
import { createFixtureStore } from "./fixtures/fixture-store";
import { createFakeAgentRunner } from "./runner/fake-agent-runner";

const agentConfig = { agentType: "script.rewrite", capabilities: {}, settings: {} };
const modelConfig = { capability: "script.rewrite", modelName: "claude-fable-5", settings: {} };
const clock = () => "2026-06-21T00:00:09.000Z";

async function setupAwaiting() {
  const fx = createFixtureStore();
  const claimed = await fx.tasks.claimNextQueued("2026-06-21T00:00:01.000Z");
  const runner = createFakeAgentRunner({
    script: (t) => t.submitCandidate({ resultType: "artifact_version", resultData: { artifactId: "artifact-1", body: "改写稿" } }),
  });
  const r = await runTask(claimed!.id, { tasks: fx.tasks, read: fx.read, runner, agentConfig, modelConfig, now: clock });
  return { fx, taskId: claimed!.id, resultId: r.resultId! };
}

describe("confirmResult", () => {
  it("appends a new current version and marks the task succeeded", async () => {
    const { fx, taskId, resultId } = await setupAwaiting();
    const version = await confirmResult(resultId, { tasks: fx.tasks, write: fx.write, now: clock });
    expect(version.versionNumber).toBe(2);
    expect(version.isCurrent).toBe(true);
    expect((await fx.tasks.getTask(taskId))?.status).toBe("succeeded");
    // the original version's body is untouched (immutability)
    expect((await fx.read.getCurrentArtifactVersion("artifact-1"))?.body).toBe("改写稿");
  });

  it("refuses to confirm a task that is not awaiting confirmation", async () => {
    const { fx, taskId, resultId } = await setupAwaiting();
    await confirmResult(resultId, { tasks: fx.tasks, write: fx.write, now: clock });
    await expect(confirmResult(resultId, { tasks: fx.tasks, write: fx.write, now: clock })).rejects.toThrow(
      /not awaiting confirmation/,
    );
    void taskId;
  });
});

describe("rejectResult", () => {
  it("cancels the task without touching domain data", async () => {
    const { fx, taskId, resultId } = await setupAwaiting();
    await rejectResult(resultId, { tasks: fx.tasks, now: clock });
    expect((await fx.tasks.getTask(taskId))?.status).toBe("cancelled");
    expect((await fx.read.getCurrentArtifactVersion("artifact-1"))?.body).toBe("原始脚本");
  });
});
