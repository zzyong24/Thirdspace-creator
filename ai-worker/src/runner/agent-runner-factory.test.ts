import { describe, it, expect } from "vitest";
import { createAgentRunner } from "./agent-runner-factory";
import { createContextTools } from "../context-tools";
import { createFixtureStore } from "../fixtures/fixture-store";
import { runTask } from "../orchestrator";

// Task 11 runner factory test — with ANTHROPIC_API_KEY UNSET, createAgentRunner()
// returns the deterministic FakeAgentRunner; the orchestrator drives a queued task to
// awaiting_confirmation end-to-end on the fake (no API key required in CI). The real
// ClaudeAgentRunner path is selected only when the key is present (gated; not exercised
// here — the SDK is lazily imported so the package builds without it).

const options = {
  model: "claude-fable-5",
  effort: "high" as const,
  skills: ["script-rewrite"],
  allowedTools: [],
  permissionMode: "default" as const,
  settingSources: ["project" as const],
};

const refs = [
  {
    id: "r1",
    aiTaskId: "task-1",
    entityType: "artifact",
    entityId: "artifact-1",
    relationType: "rewrite_source",
  },
];

describe("createAgentRunner", () => {
  it("returns the FakeAgentRunner when ANTHROPIC_API_KEY is unset", async () => {
    const runner = createAgentRunner({});
    const fx = createFixtureStore();
    const tools = createContextTools({ read: fx.read, references: refs });
    // The default fake derives a deterministic artifact_version candidate from the
    // task's references (the first in-scope artifact) — no script needed.
    const outcome = await runner.run({ prompt: "rewrite", options, tools });
    expect(outcome.subtype).toBe("success");
    expect(outcome.sessionId).toBeTruthy();
    const captured = tools.getCaptured();
    expect(captured?.resultType).toBe("artifact_version");
    expect((captured?.resultData as { artifactId?: string }).artifactId).toBe(
      "artifact-1",
    );
  });

  it("returns the FakeAgentRunner when ANTHROPIC_API_KEY is empty", () => {
    const runner = createAgentRunner({ ANTHROPIC_API_KEY: "" });
    expect(runner).toBeTruthy();
  });

  it("drives the orchestrator queued → awaiting_confirmation end-to-end on the fake", async () => {
    const fx = createFixtureStore();
    const runner = createAgentRunner({});
    const claimed = await fx.tasks.claimNextQueued("2026-06-21T00:00:00.000Z");
    expect(claimed?.status).toBe("running");
    const result = await runTask(claimed!.id, {
      tasks: fx.tasks,
      read: fx.read,
      runner,
      agentConfig: {
        agentType: "script.rewrite",
        capabilities: { skills: ["script-rewrite"] },
        settings: {},
      },
      modelConfig: {
        capability: "script.rewrite",
        modelName: "claude-fable-5",
        settings: { effort: "high" },
      },
      now: () => "2026-06-21T00:00:01.000Z",
    });
    expect(result.status).toBe("awaiting_confirmation");
    expect(result.resultId).toBeTruthy();
  });
});
