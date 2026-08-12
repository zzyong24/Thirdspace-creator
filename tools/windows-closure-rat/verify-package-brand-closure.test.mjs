import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { compilePackageBrandBuildInput } from "../../frontend/scripts/desktop/package-flavor.mjs";
import { verifyPackageBrandClosure } from "./verify-package-brand-closure.mjs";

const manifest = {
  schema: "creatoros-desktop-package/v1",
  packageRef: "test-channel",
  productRef: "creatoros",
  projectKey: "creatoros",
  expectedChannelRef: "partner-test",
  displayName: "测试品牌",
  binaryName: "TestBrand",
  appIdentifier: "com.example.testbrand",
  keychainService: "com.example.testbrand.desktop",
  windowsUpgradeCode: "249CE044-BB7E-4AC3-9D98-4BE1BD4AD818",
  icons: {
    macos: { path: "assets/icon.icns", sha256: "a".repeat(64) },
    windows: { path: "assets/icon.ico", sha256: "b".repeat(64) },
  },
  growthExpectations: {
    brandName: "测试品牌",
    purchaseUrl: "https://example.com/buy",
    renewalUrl: "https://example.com/renew",
    downloadUrl: "https://example.com/download",
    bugFeedbackUrl: "https://example.com/feedback",
    channelSupportUrl: "https://example.com/support",
  },
  updates: {
    channel: "stable",
    packageUpdateOrigin: "https://updates.example.com",
    sharedRuntimeOrigin: "https://runtime.example.com",
  },
};

test("最终 closure 同时包含渠道名和图标才生成通过证明", async () => {
  const root = await mkdtemp(join(tmpdir(), "creatoros-brand-closure-"));
  try {
    const inputPath = join(root, "input.json");
    const closureRoot = join(root, "closure");
    const proofPath = join(root, "proof.json");
    const input = compilePackageBrandBuildInput({
      manifest,
      iconBytes: Buffer.from([0, 1, 2, 3]),
      iconMimeType: "image/x-icon",
    });
    await mkdir(closureRoot);
    await writeFile(inputPath, JSON.stringify(input));
    await writeFile(
      join(closureRoot, "webview.js"),
      `window.brand=${JSON.stringify(input.brandName)};window.icon=${JSON.stringify(
        `data:${input.iconMimeType};base64,${input.iconBase64}`,
      )};`,
    );

    const proof = verifyPackageBrandClosure({
      inputPath,
      closureRoot,
      proofPath,
    });
    assert.equal(proof.passed, true);
    assert.equal(proof.packageRef, "test-channel");
    assert.deepEqual(proof.brandMatchFiles, ["webview.js"]);
    assert.deepEqual(proof.iconMatchFiles, ["webview.js"]);
    assert.equal(JSON.parse(await readFile(proofPath, "utf8")).passed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("只有渠道名、没有渠道图标时失败关闭", async () => {
  const root = await mkdtemp(join(tmpdir(), "creatoros-brand-closure-"));
  try {
    const inputPath = join(root, "input.json");
    const closureRoot = join(root, "closure");
    const input = compilePackageBrandBuildInput({
      manifest,
      iconBytes: Buffer.from([0, 1, 2, 3]),
      iconMimeType: "image/x-icon",
    });
    await mkdir(closureRoot);
    await writeFile(inputPath, JSON.stringify(input));
    await writeFile(join(closureRoot, "webview.js"), input.brandName);

    assert.throws(
      () =>
        verifyPackageBrandClosure({
          inputPath,
          closureRoot,
          proofPath: join(root, "proof.json"),
        }),
      /brand=1,icon=0/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
