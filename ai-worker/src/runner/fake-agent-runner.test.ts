import { describe, it, expect } from "vitest";
import { createFakeAgentRunner } from "./fake-agent-runner.js";
import { createContextTools } from "../context-tools.js";
import { createFixtureStore } from "../fixtures/fixture-store.js";

const refs = [
  { id: "r1", aiTaskId: "task-1", entityType: "artifact", entityId: "artifact-1", relationType: "rewrite_source" },
];
const options = {
  model: "claude-fable-5",
  effort: "high" as const,
  skills: ["script-rewrite"],
  allowedTools: [],
  permissionMode: "default" as const,
  settingSources: ["project" as const],
};

describe("fake agent runner", () => {
  it("drives submit_candidate and returns a success outcome", async () => {
    const fx = createFixtureStore();
    const tools = createContextTools({ read: fx.read, references: refs });
    const runner = createFakeAgentRunner({
      script: (t) => t.submitCandidate({ resultType: "artifact_version", resultData: { artifactId: "artifact-1", body: "改写稿" } }),
    });
    const outcome = await runner.run({ prompt: "rewrite", options, tools });
    expect(outcome.subtype).toBe("success");
    expect(outcome.sessionId).toBe("fake-session-1");
    expect(tools.getCaptured()?.resultData.body).toBe("改写稿");
  });

  it("can simulate an error run that submits nothing", async () => {
    const fx = createFixtureStore();
    const tools = createContextTools({ read: fx.read, references: refs });
    const runner = createFakeAgentRunner({ subtype: "error_during_execution", script: () => {} });
    const outcome = await runner.run({ prompt: "x", options, tools });
    expect(outcome.subtype).toBe("error_during_execution");
    expect(tools.getCaptured()).toBeNull();
  });
});
