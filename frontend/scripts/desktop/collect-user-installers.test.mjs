// @vitest-environment node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { collectUserInstaller } from "./collect-user-installers.mjs";

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "creatoros-user-installer-"));
  try {
    const bundleDir = path.join(root, "bundle");
    const outputDir = path.join(root, "dist-upload");
    await mkdir(path.join(bundleDir, "nsis"), { recursive: true });
    await mkdir(path.join(bundleDir, "dmg"), { recursive: true });
    await run({ bundleDir, outputDir });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("Windows 用户 artifact 只收集 setup.exe", async () => {
  await withFixture(async ({ bundleDir, outputDir }) => {
    await writeFile(path.join(bundleDir, "nsis", "CreatorOS_0.1.0_x64-setup.exe"), "setup");
    await writeFile(path.join(bundleDir, "nsis", "CreatorOS_0.1.0_x64-setup.exe.sig"), "sig");
    await writeFile(path.join(bundleDir, "nsis", "CreatorOS_0.1.0_x64.nsis.zip"), "updater");
    await writeFile(path.join(bundleDir, "latest.json"), "{}");

    const copied = await collectUserInstaller({
      target: "windows-x86_64",
      bundleDir,
      outputDir,
    });

    assert.equal(path.basename(copied), "CreatorOS_0.1.0_x64-setup.exe");
    assert.deepEqual(await readdir(outputDir), ["CreatorOS_0.1.0_x64-setup.exe"]);
    assert.equal(await readFile(copied, "utf8"), "setup");
  });
});

test("macOS 用户 artifact 只收集 dmg", async () => {
  await withFixture(async ({ bundleDir, outputDir }) => {
    await writeFile(path.join(bundleDir, "dmg", "CreatorOS_0.1.0_aarch64.dmg"), "dmg");
    await writeFile(path.join(bundleDir, "CreatorOS.app.tar.gz"), "updater");
    await writeFile(path.join(bundleDir, "CreatorOS.app.tar.gz.sig"), "sig");
    await writeFile(path.join(bundleDir, "latest.json"), "{}");

    await collectUserInstaller({
      target: "darwin-aarch64",
      bundleDir,
      outputDir,
    });

    assert.deepEqual(await readdir(outputDir), ["CreatorOS_0.1.0_aarch64.dmg"]);
  });
});

test("缺少或出现多个同平台安装包时硬失败", async () => {
  await withFixture(async ({ bundleDir, outputDir }) => {
    await assert.rejects(
      collectUserInstaller({
        target: "windows-x86_64",
        bundleDir,
        outputDir,
      }),
      /恰好 1 个.*setup\.exe/u,
    );

    await writeFile(path.join(bundleDir, "nsis", "CreatorOS_A-setup.exe"), "a");
    await writeFile(path.join(bundleDir, "nsis", "CreatorOS_B-setup.exe"), "b");
    await assert.rejects(
      collectUserInstaller({
        target: "windows-x86_64",
        bundleDir,
        outputDir,
      }),
      /恰好 1 个.*实际找到 2 个/u,
    );
  });
});

test("拒绝未知桌面目标", async () => {
  await withFixture(async ({ bundleDir, outputDir }) => {
    await assert.rejects(
      collectUserInstaller({
        target: "linux-x86_64",
        bundleDir,
        outputDir,
      }),
      /不支持的用户安装包目标/u,
    );
  });
});
