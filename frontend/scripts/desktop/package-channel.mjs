#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertIdentityLock, compilePackageBrandBuildInput, compilePackagePlan, readPackageBrandBuildEnv, validateManifestFiles, validatePackageManifest } from "./package-flavor.mjs";
import {
  buildLocalPackageEnv,
  installAndLaunchLocalMacApp,
  publishCanonicalLocalArtifact,
} from "./package-local.mjs";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const manifestArg = option("--manifest");
const target = option("--target");
const mode = option("--mode") ?? "local-test";
const planOnly = args.includes("--plan-only");
if (!manifestArg || !target || !["local-test", "release"].includes(mode)) {
  console.error("用法: desktop:package-channel -- --manifest <path> --target <macos-aarch64|macos-x86_64|windows-x86_64> --mode <local-test|release> [--plan-only]");
  process.exit(2);
}
const manifestPath = resolve(frontend, manifestArg);
const manifest = validatePackageManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
validateManifestFiles(manifest, manifestPath);
const lockPath = resolve(dirname(manifestPath), "identity.lock.json");
assertIdentityLock(manifest, JSON.parse(readFileSync(lockPath, "utf8")));
const plan = compilePackagePlan(manifest, { target });
const staging = resolve(frontend, "src-tauri/target/package-flavors", manifest.packageRef, target);
mkdirSync(staging, { recursive: true });
const icon = resolve(dirname(manifestPath), manifest.icons[plan.iconKey].path);
const packageBrandBuildInput = compilePackageBrandBuildInput({
  manifest,
  iconBytes: readFileSync(resolve(dirname(manifestPath), manifest.icons.windows.path)),
  iconMimeType: "image/x-icon",
});
const packageBrandInputPath = resolve(staging, "package-brand-build-input.json");
const tauriOverride = {
  productName: manifest.displayName,
  mainBinaryName: manifest.binaryName,
  identifier: manifest.appIdentifier,
  bundle: { icon: [icon] },
  plugins: { updater: { endpoints: [plan.latestUrl] } },
};
writeFileSync(resolve(staging, "package-identity.json"), `${JSON.stringify(plan.packageIdentity, null, 2)}\n`);
writeFileSync(resolve(staging, "tauri.override.json"), `${JSON.stringify(tauriOverride, null, 2)}\n`);
writeFileSync(packageBrandInputPath, `${JSON.stringify(packageBrandBuildInput, null, 2)}\n`);
const attestation = {
  schema: "creatoros-channel-package-attestation/v1",
  stable: { ...plan, mode, releaseRequested: mode === "release" },
  volatile: { generatedAt: new Date().toISOString(), staging },
};
writeFileSync(resolve(staging, "attestation.json"), `${JSON.stringify(attestation, null, 2)}\n`);
console.log(`[package-channel] ✓ preflight ${manifest.packageRef}/${target}`);
console.log(`[package-channel] staging: ${staging}`);
if (!planOnly) {
  const packageEnv = buildLocalPackageEnv({ baseEnv: process.env });
  const packageBrandEnv = readPackageBrandBuildEnv(packageBrandBuildInput);
  execFileSync(process.execPath, [resolve(frontend, "scripts/desktop/package.mjs")], {
    cwd: frontend,
    stdio: "inherit",
    env: {
      ...packageEnv,
      ...packageBrandEnv,
      CREATOROS_RELEASE: mode === "release" ? "1" : "0",
      CREATOROS_PACKAGE_IDENTITY_PATH: resolve(staging, "package-identity.json"),
      CREATOROS_PACKAGE_BRAND_INPUT_PATH: packageBrandInputPath,
      CREATOROS_TAURI_PACKAGE_CONFIG: resolve(staging, "tauri.override.json"),
      CREATOROS_CHANNEL_PACKAGE_MODE: mode,
    },
  });
  const profile = mode === "release" ? "release" : "release-fast";
  const releaseManifestPath = resolve(
    frontend,
    "src-tauri/target",
    profile,
    "bundle/creatoros-release-manifest.json",
  );
  const releaseManifest = JSON.parse(readFileSync(releaseManifestPath, "utf8"));
  attestation.observed = {
    codesign: releaseManifest.codesign ?? null,
    notarize: releaseManifest.notarize ?? null,
    publishAuthorized: false,
    published: false,
  };
  writeFileSync(resolve(staging, "attestation.json"), `${JSON.stringify(attestation, null, 2)}\n`);
  if (mode === "local-test") {
    const artifactPath = publishCanonicalLocalArtifact({
      frontendDir: frontend,
      displayName: manifest.displayName,
    });
    console.log(`[package-channel] ✓ 唯一本地验收包：${artifactPath}`);
    const installed = installAndLaunchLocalMacApp({
      frontendDir: frontend,
      displayName: manifest.displayName,
      binaryName: manifest.binaryName,
    });
    if (!installed.skipped) {
      console.log(
        `[package-channel] ✓ 已替换并启动 ${installed.appPath}（pid ${installed.processId}）。`,
      );
    }
  }
}
