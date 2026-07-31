#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { platform } from "node:process";
import { fileURLToPath } from "node:url";

import {
  findShellBinary,
  releaseCommitsFromEnv,
  writeProductReleaseAttestation,
} from "./product-identity.mjs";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const profile = process.argv[2] ?? process.env.CREATOROS_CARGO_PROFILE_DIR;
if (!["release", "release-fast"].includes(profile)) {
  throw new Error(
    "用法：node scripts/desktop/product-identity-attest.mjs <release|release-fast>",
  );
}
const targetDir = join(frontend, "src-tauri", "target", profile);
const bundleDir = join(targetDir, "bundle");
const binaryPath = findShellBinary({ targetDir, bundleDir, platform });
const creatorCommit =
  process.env.CREATOROS_CREATOR_RELEASE_COMMIT?.trim() ||
  process.env.GITHUB_SHA?.trim() ||
  spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: frontend,
    encoding: "utf8",
  }).stdout?.trim();
const result = writeProductReleaseAttestation({
  bundleDir,
  profile,
  binaryPath,
  releaseCommits: releaseCommitsFromEnv({
    ...process.env,
    CREATOROS_CREATOR_RELEASE_COMMIT: creatorCommit,
  }),
});
console.log(`[T-635] ProductManifest：${result.manifestPath}`);
console.log(`[T-635] release attestation：${result.attestationPath}`);
