import { describe, it, expect } from "vitest";
import { resolveRunOptions } from "./agent-config-resolver.js";

const agentConfig = {
  agentType: "script.rewrite",
  capabilities: { skills: ["script-rewrite"] },
  settings: { permissionMode: "default" },
};
const modelConfig = {
  capability: "script.rewrite",
  modelName: "claude-fable-5",
  settings: { effort: "high" },
};

describe("resolveRunOptions", () => {
  it("maps config rows onto run options + allowed tools", () => {
    const opts = resolveRunOptions({
      agentConfig,
      modelConfig,
      allowedTools: ["mcp__creatoros__get_current_artifact_version", "mcp__creatoros__submit_candidate"],
    });
    expect(opts.model).toBe("claude-fable-5");
    expect(opts.effort).toBe("high");
    expect(opts.skills).toEqual(["script-rewrite"]);
    expect(opts.permissionMode).toBe("default");
    expect(opts.settingSources).toEqual(["project"]);
    expect(opts.allowedTools).toContain("mcp__creatoros__submit_candidate");
  });

  it("defaults effort to high and skills to empty when unset", () => {
    const opts = resolveRunOptions({
      agentConfig: { agentType: "x", capabilities: {}, settings: {} },
      modelConfig: { capability: "x", modelName: "claude-opus-4-8", settings: {} },
      allowedTools: [],
    });
    expect(opts.effort).toBe("high");
    expect(opts.skills).toEqual([]);
  });
});
