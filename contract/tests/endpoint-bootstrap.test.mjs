import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Each public module can be the first imported module in a browser chunk.
// A fresh process preserves real ESM initialization order instead of sharing
// a registry-first test cache. This imports schemas only, never user data.
const entries = [
  "index.ts",
  "endpoints.ts",
  "operations/account-groups.ts",
  "operations/ai.ts",
  "operations/analytics.ts",
  "operations/articles.ts",
  "operations/artifacts.ts",
  "operations/assets.ts",
  "operations/auth.ts",
  "operations/benchmark.ts",
  "operations/calibration.ts",
  "operations/candidate.ts",
  "operations/content-calendar.ts",
  "operations/creative-canvas.ts",
  "operations/creative-results.ts",
  "operations/execution.ts",
  "operations/favorites-folder.ts",
  "operations/graphic-posts.ts",
  "operations/ingestion.ts",
  "operations/intelligence.ts",
  "operations/knowledge.ts",
  "operations/learnings.ts",
  "operations/material-links.ts",
  "operations/notifications.ts",
  "operations/pages.ts",
  "operations/platform-accounts.ts",
  "operations/platform-collection.ts",
  "operations/positioning.ts",
  "operations/production.ts",
  "operations/projects.ts",
  "operations/publishing.ts",
  "operations/review-gate.ts",
  "operations/reviews.ts",
  "operations/scheduling.ts",
  "operations/search.ts",
  "operations/settings.ts",
  "operations/taxonomy.ts",
  "operations/topic-attribution.ts",
  "operations/trend-source.ts",
  "operations/visual-templates.ts",
  "operations/work-compositions.ts",
  "operations/work-sources.ts"
];
const backendDirectory = fileURLToPath(new URL("../../backend/", import.meta.url));

describe("contract module initialization from every real entry", () => {
  it.each(entries)("initializes %s before the public registry", (entry) => {
    const script = `
      await import(${JSON.stringify("../contract/src/")} + ${JSON.stringify(entry)});
      const root = await import("../contract/src/index.ts");
      const legacy = await import("../contract/src/endpoints.ts");
      if (root.defineEndpoint !== legacy.defineEndpoint) throw new Error("legacy export changed");
      if (Object.keys(root.ENDPOINTS).length !== 404) throw new Error("registry surface changed");
      if (root.ENDPOINTS.createCanvas.id !== "canvas.create") throw new Error("canvas operation missing");
      if (root.ENDPOINTS.getCanvas.id !== "canvas.get") throw new Error("canvas read missing");
      console.log("CONTRACT_ENTRY_READY");
    `;
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
      cwd: backendDirectory,
      encoding: "utf8",
      timeout: 120_000,
    });
    expect(result.error, result.stderr).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("CONTRACT_ENTRY_READY");
  }, 135_000);
});
