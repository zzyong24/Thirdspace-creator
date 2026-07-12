import { describe, it, expect } from "vitest";
import {
  executionTaskSpec,
  executionManifest,
  executionTaskResource,
} from "../../src/resources/execution";
import { executionOperations } from "../../src/operations/execution";

// [T-255a] 执行层契约 schema 测试:任务契约缺省值/枚举收口 + manifest 形状 + op 注册。

describe("executionTaskSpec", () => {
  it("fills defaults for inputs/params/constraints", () => {
    const parsed = executionTaskSpec.parse({
      taskType: "echo.manifest",
      goal: "框架自检",
    });
    expect(parsed.inputs).toEqual([]);
    expect(parsed.params).toEqual({});
    expect(parsed.constraints).toEqual({
      timeoutSec: 600,
      network: "deny",
      maxOutputMB: 512,
    });
  });

  it("rejects an unknown taskType (executor 枚举收口)", () => {
    const res = executionTaskSpec.safeParse({
      taskType: "rm.rf",
      goal: "nope",
    });
    expect(res.success).toBe(false);
  });

  it("[T-256b] accepts agentic.* taskTypes(自主任务:research/collect/material)", () => {
    for (const t of ["agentic.research", "agentic.collect", "agentic.material"]) {
      const res = executionTaskSpec.safeParse({ taskType: t, goal: "调研 A" });
      expect(res.success).toBe(true);
    }
  });

  it("rejects an empty goal and empty mountAs", () => {
    expect(
      executionTaskSpec.safeParse({ taskType: "echo.manifest", goal: "" })
        .success,
    ).toBe(false);
    expect(
      executionTaskSpec.safeParse({
        taskType: "echo.manifest",
        goal: "g",
        inputs: [{ assetId: "a1", mountAs: "" }],
      }).success,
    ).toBe(false);
  });

  it("caps constraints (timeout ≤ 3600s, maxOutputMB ≤ 2048)", () => {
    expect(
      executionTaskSpec.safeParse({
        taskType: "echo.manifest",
        goal: "g",
        constraints: { timeoutSec: 7200, network: "deny", maxOutputMB: 10 },
      }).success,
    ).toBe(false);
    expect(
      executionTaskSpec.safeParse({
        taskType: "echo.manifest",
        goal: "g",
        constraints: { timeoutSec: 60, network: "deny", maxOutputMB: 4096 },
      }).success,
    ).toBe(false);
  });
});

describe("executionManifest / executionTaskResource", () => {
  it("parses a harvested manifest and defaults summary/meta", () => {
    const m = executionManifest.parse({
      taskType: "echo.manifest",
      artifacts: [
        { path: "manifest.json", fileName: "manifest.json", size: 12 },
      ],
    });
    expect(m.summary).toBe("");
    expect(m.artifacts[0]!.mimeType).toBeNull();
  });

  it("round-trips a full task resource", () => {
    const dto = executionTaskResource.parse({
      id: "t1",
      userId: "u1",
      projectId: null,
      taskType: "exec.echo.manifest",
      execType: "echo.manifest",
      status: "awaiting_confirmation",
      spec: { taskType: "echo.manifest", goal: "g" },
      manifest: { taskType: "echo.manifest", artifacts: [] },
      requestedAt: "2026-07-11T00:00:00.000Z",
      startedAt: null,
      completedAt: null,
      errorMessage: null,
    });
    expect(dto.adoptedAssetIds).toEqual([]);
    expect(dto.spec.constraints.network).toBe("deny");
  });
});

describe("executionOperations", () => {
  it("registers the 5 execution.tasks ops", () => {
    expect(Object.values(executionOperations).map((e) => e.id)).toEqual([
      "execution.tasks.create",
      "execution.tasks.list",
      "execution.tasks.get",
      "execution.tasks.confirm",
      "execution.tasks.discard",
    ]);
  });
});
