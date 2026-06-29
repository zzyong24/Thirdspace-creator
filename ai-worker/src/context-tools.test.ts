import { describe, it, expect } from "vitest";
import { createContextTools } from "./context-tools";
import { createFixtureStore } from "./fixtures/fixture-store";

function refs() {
  return [
    { id: "r1", aiTaskId: "task-1", entityType: "artifact", entityId: "artifact-1", relationType: "rewrite_source" },
  ];
}

describe("createContextTools", () => {
  it("names tools with the mcp__creatoros__ prefix", () => {
    const fx = createFixtureStore();
    const tools = createContextTools({ read: fx.read, references: refs() });
    expect(tools.allowedTools).toContain("mcp__creatoros__get_current_artifact_version");
    expect(tools.allowedTools).toContain("mcp__creatoros__submit_candidate");
  });

  it("reads an in-scope artifact version", async () => {
    const fx = createFixtureStore();
    const tools = createContextTools({ read: fx.read, references: refs() });
    const spec = tools.toolSpecs.find((t) => t.name === "get_current_artifact_version")!;
    const out = await spec.handler({ artifactId: "artifact-1" });
    expect(out.isError).toBeUndefined();
    expect(out.content[0]!.text).toContain("原始脚本");
    expect(tools.getAudit()).toContainEqual({ tool: "get_current_artifact_version", ok: true });
  });

  it("denies an out-of-scope artifact (not in references)", async () => {
    const fx = createFixtureStore();
    const tools = createContextTools({ read: fx.read, references: refs() });
    const spec = tools.toolSpecs.find((t) => t.name === "get_current_artifact_version")!;
    const out = await spec.handler({ artifactId: "artifact-999" });
    expect(out.isError).toBe(true);
    expect(tools.getAudit()).toContainEqual({ tool: "get_current_artifact_version", ok: false });
  });

  it("captures a submitted candidate", async () => {
    const fx = createFixtureStore();
    const tools = createContextTools({ read: fx.read, references: refs() });
    const spec = tools.toolSpecs.find((t) => t.name === "submit_candidate")!;
    await spec.handler({ resultType: "artifact_version", resultData: { artifactId: "artifact-1", body: "新稿" } });
    expect(tools.getCaptured()).toEqual({
      resultType: "artifact_version",
      resultData: { artifactId: "artifact-1", body: "新稿" },
    });
  });
});
