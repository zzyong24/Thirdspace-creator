// @vitest-environment node

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  fingerprintReferences,
  resolvePlaywrightPort,
} from "../../tests/visual/visual-lifecycle";

describe("visual test lifecycle", () => {
  it("detects a reference file changed after setup", () => {
    const directory = mkdtempSync(join(tmpdir(), "creatoros-baselines-"));
    const reference = join(directory, "reference-dashboard.png");
    writeFileSync(reference, "before");

    const before = fingerprintReferences(directory);
    writeFileSync(reference, "after");
    const after = fingerprintReferences(directory);

    expect(after.count).toBe(1);
    expect(after.entries).toEqual(["reference-dashboard.png"]);
    expect(after.hash).not.toBe(before.hash);
  });

  it("uses an isolated configured Playwright port", () => {
    expect(resolvePlaywrightPort("3291")).toBe(3291);
    expect(resolvePlaywrightPort(undefined)).toBe(3201);
    expect(() => resolvePlaywrightPort("not-a-port")).toThrow(/valid TCP port/);
    expect(() => resolvePlaywrightPort("70000")).toThrow(/valid TCP port/);
  });
});
