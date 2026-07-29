import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyRuntimePrunePlan,
  classifyRuntimePruneCandidate,
  planRuntimePrune,
} from "./runtime-prune-rat.mjs";

const roots = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "creatoros-runtime-prune-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("runtime prune RAT", () => {
  it("只标记高置信生产冗余，并永久保留许可证与运行时代码", () => {
    expect(classifyRuntimePruneCandidate("pkg/dist/index.js.map")).toBe(
      "source-map",
    );
    expect(classifyRuntimePruneCandidate("pkg/index.d.ts")).toBe(
      "type-declaration",
    );
    expect(classifyRuntimePruneCandidate("pkg/README.md")).toBe(
      "documentation",
    );
    expect(classifyRuntimePruneCandidate("pkg/test/fixture.json")).toBe(
      "test-fixture",
    );
    expect(classifyRuntimePruneCandidate("pkg/LICENSE.md")).toBeNull();
    expect(classifyRuntimePruneCandidate("pkg/NOTICE")).toBeNull();
    expect(classifyRuntimePruneCandidate("pkg/dist/index.js")).toBeNull();
  });

  it("从 inventory 生成按原因计数且可复现的删除计划", () => {
    const plan = planRuntimePrune({
      files: [
        { path: "pkg/index.js", bytes: 100 },
        { path: "pkg/index.js.map", bytes: 200 },
        { path: "pkg/index.d.ts", bytes: 30 },
        { path: "pkg/README.md", bytes: 20 },
        { path: "pkg/LICENSE", bytes: 10 },
      ],
      symlinks: [],
    });

    expect(plan.summary).toEqual({
      candidateFileCount: 3,
      candidateBytes: 250,
      byReason: {
        documentation: { files: 1, bytes: 20 },
        "source-map": { files: 1, bytes: 200 },
        "type-declaration": { files: 1, bytes: 30 },
      },
    });
    expect(plan.candidates.map((entry) => entry.path)).toEqual([
      "pkg/README.md",
      "pkg/index.d.ts",
      "pkg/index.js.map",
    ]);
  });

  it("只删除 root 内计划文件，不碰保留文件", () => {
    const root = fixture();
    mkdirSync(join(root, "pkg", "dist"), { recursive: true });
    writeFileSync(join(root, "pkg", "dist", "index.js"), "runtime");
    writeFileSync(join(root, "pkg", "dist", "index.js.map"), "map");
    writeFileSync(join(root, "pkg", "LICENSE"), "license");

    const result = applyRuntimePrunePlan(root, {
      candidates: [
        {
          path: "pkg/dist/index.js.map",
          bytes: 3,
          reason: "source-map",
        },
      ],
    });

    expect(result).toEqual({ removed: 1, missing: 0 });
    expect(existsSync(join(root, "pkg", "dist", "index.js.map"))).toBe(false);
    expect(existsSync(join(root, "pkg", "dist", "index.js"))).toBe(true);
    expect(existsSync(join(root, "pkg", "LICENSE"))).toBe(true);
  });

  it("拒绝越过 runtime root 的路径", () => {
    const root = fixture();
    expect(() =>
      applyRuntimePrunePlan(root, {
        candidates: [
          { path: "../outside.map", bytes: 1, reason: "source-map" },
        ],
      }),
    ).toThrow(/越过 runtime root/);
  });
});
