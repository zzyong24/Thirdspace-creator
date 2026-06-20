import { describe, it, expect } from "vitest";
import { createFixtureStore } from "./fixture-store.js";

describe("fixture store", () => {
  it("claims the queued task and flips it to running", async () => {
    const fx = createFixtureStore();
    const claimed = await fx.tasks.claimNextQueued("2026-06-21T00:00:00.000Z");
    expect(claimed?.status).toBe("running");
    expect(claimed?.startedAt).toBe("2026-06-21T00:00:00.000Z");
    // second claim finds nothing left
    expect(await fx.tasks.claimNextQueued("2026-06-21T00:00:01.000Z")).toBeNull();
  });

  it("reads the seeded current artifact version", async () => {
    const fx = createFixtureStore();
    const ver = await fx.read.getCurrentArtifactVersion("artifact-1");
    expect(ver?.isCurrent).toBe(true);
    expect(ver?.versionNumber).toBe(1);
  });

  it("appends an immutable new version without mutating the old one", async () => {
    const fx = createFixtureStore();
    const before = await fx.read.getCurrentArtifactVersion("artifact-1");
    const next = await fx.write.appendArtifactVersion({
      artifactId: "artifact-1",
      body: "改写后的脚本",
      sourceTaskId: "task-1",
    });
    expect(next.versionNumber).toBe(2);
    expect(next.body).toBe("改写后的脚本");
    expect(before?.body).toBe("原始脚本"); // old version object untouched
  });
});
