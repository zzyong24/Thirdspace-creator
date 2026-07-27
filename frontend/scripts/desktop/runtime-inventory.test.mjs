import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildRuntimeInventory,
  classifyRuntimeOwner,
  compareRuntimeInventories,
} from "./runtime-inventory.mjs";

const roots = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "creatoros-runtime-inventory-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("runtime inventory", () => {
  it("按运行时能力归属分类，而不是把所有大文件混成 node_modules", () => {
    expect(classifyRuntimeOwner("frontend/.next/server/app.js")).toBe(
      "app-code",
    );
    expect(
      classifyRuntimeOwner(
        "frontend/node_modules/.pnpm/next@16/node_modules/next/index.js",
      ),
    ).toBe("node-runtime");
    expect(
      classifyRuntimeOwner("frontend/browsers/chromium-123/chrome.exe"),
    ).toBe("browser");
    expect(classifyRuntimeOwner("frontend/bin/ffmpeg.exe")).toBe("media");
    expect(
      classifyRuntimeOwner(
        "frontend/node_modules/@xenova/transformers/dist/transformers.js",
      ),
    ).toBe("local-ai");
  });

  it("生成稳定清单并按 hash+bytes 统计可去重字节", async () => {
    const root = fixture();
    mkdirSync(join(root, "frontend", ".next"), { recursive: true });
    mkdirSync(join(root, "frontend", "node_modules", "pkg"), {
      recursive: true,
    });
    mkdirSync(join(root, "frontend", "browsers"), { recursive: true });
    writeFileSync(join(root, "frontend", ".next", "server.js"), "same");
    writeFileSync(
      join(root, "frontend", "node_modules", "pkg", "index.js"),
      "same",
    );
    writeFileSync(join(root, "frontend", "browsers", "chrome.bin"), "unique");
    symlinkSync(
      "../.next/server.js",
      join(root, "frontend", "node_modules", "server-link"),
    );

    const inventory = await buildRuntimeInventory(root);

    expect(inventory.summary.fileCount).toBe(3);
    expect(inventory.summary.symlinkCount).toBe(1);
    expect(inventory.summary.totalBytes).toBe(14);
    expect(inventory.summary.duplicateGroupCount).toBe(1);
    expect(inventory.summary.duplicateBytes).toBe(4);
    expect(inventory.summary.byOwner["app-code"].files).toBe(1);
    expect(inventory.summary.byOwner["node-runtime"].files).toBe(1);
    expect(inventory.summary.byOwner.browser.files).toBe(1);
    expect(inventory.duplicates[0].paths).toEqual([
      "frontend/.next/server.js",
      "frontend/node_modules/pkg/index.js",
    ]);
    expect(inventory.files.map((entry) => entry.path)).toEqual([
      "frontend/.next/server.js",
      "frontend/browsers/chrome.bin",
      "frontend/node_modules/pkg/index.js",
    ]);
  });

  it("比较候选闭包相对基线的文件数和重复字节降幅", () => {
    const report = compareRuntimeInventories(
      {
        summary: {
          fileCount: 100,
          totalBytes: 1_000,
          duplicateBytes: 400,
        },
      },
      {
        summary: {
          fileCount: 65,
          totalBytes: 800,
          duplicateBytes: 40,
        },
      },
    );

    expect(report.fileCountReductionPct).toBe(35);
    expect(report.totalBytesReductionPct).toBe(20);
    expect(report.duplicateBytesReductionPct).toBe(90);
    expect(report.gates.fileCountReductionAtLeast30).toBe(true);
    expect(report.gates.duplicateBytesReductionAtLeast80).toBe(true);
  });
});
