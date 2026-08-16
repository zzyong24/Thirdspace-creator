import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  assertCreatorOsCliRuntime,
  stageCreatorOsCliRuntime,
} from "../../frontend/scripts/desktop/creatoros-cli-runtime.mjs";

test("Windows production closure stages the CLI bundle beside the exact packaged Node", () => {
  const root = mkdtempSync(join(tmpdir(), "creatoros-cli-closure-"));
  try {
    const runtimeRoot = join(root, "runtime");
    const runtimeNode = join(root, "creatoros-server.exe");
    writeFileSync(runtimeNode, "windows-node");

    stageCreatorOsCliRuntime({
      repoRoot: root,
      runtimeRoot,
      nodeExecutablePath: runtimeNode,
      targetPlatform: "win32",
      bundleRuntime: ({ outputPath }) => {
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, "creatoros-cli-bundle");
      },
    });

    assert.equal(
      readFileSync(join(runtimeRoot, "frontend", "cli", "creatoros.cjs"), "utf8"),
      "creatoros-cli-bundle",
    );
    assert.equal(
      readFileSync(join(runtimeRoot, "cli", "node.exe"), "utf8"),
      "windows-node",
    );
    assert.doesNotThrow(() => assertCreatorOsCliRuntime(runtimeRoot, "win32"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI staging fails closed when the contract bundle was not produced", () => {
  const root = mkdtempSync(join(tmpdir(), "creatoros-cli-missing-"));
  try {
    const runtimeNode = join(root, "creatoros-server.exe");
    writeFileSync(runtimeNode, "windows-node");
    assert.throws(
      () => stageCreatorOsCliRuntime({
        repoRoot: root,
        runtimeRoot: join(root, "runtime"),
        nodeExecutablePath: runtimeNode,
        targetPlatform: "win32",
        bundleRuntime: () => {},
      }),
      /CLI runtime 未产出/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
