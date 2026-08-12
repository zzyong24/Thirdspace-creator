import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("local reveal route platform wiring", () => {
  it("asset 与 project 都消费跨平台 plan + launcher，不再直接执行 macOS open", () => {
    const source = readFileSync(
      path.resolve("src/app/api/v1/local/reveal/route.ts"),
      "utf8",
    );

    expect(source).toContain(
      'launchRevealPlan(planRevealTarget(real, "asset", process.platform))',
    );
    expect(source).toContain(
      'launchRevealPlan(planRevealTarget(real, "project", process.platform))',
    );
    expect(source).not.toMatch(/execFile(?:Async)?\s*\(\s*["']open["']/);
  });
});
