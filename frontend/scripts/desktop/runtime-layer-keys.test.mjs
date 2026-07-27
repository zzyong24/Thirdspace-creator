import { describe, expect, it } from "vitest";

import { computeRuntimeLayerKeys } from "./runtime-layer-keys.mjs";

const baseInputs = {
  platform: "darwin",
  arch: "arm64",
  shell: {
    rust: "rust-a",
    cargoLock: "cargo-a",
    tauri: "tauri-a",
    installer: "installer-a",
  },
  appCode: {
    source: "app-a",
    nextConfig: "next-a",
    tracingRoot: "trace-root-a",
    obfuscation: "obfuscation-a",
    bytecode: "bytecode-a",
    legal: "legal-a",
  },
  nodeRuntime: {
    pnpmLock: "pnpm-a",
    nodeVersion: "24.4.1",
    nodeAbi: "137",
    normalizedClosure: "closure-a",
    dynamicRegistry: "registry-a",
    buildSidecar: "sidecar-a",
    nativeInputs: "native-a",
  },
  browser: {
    revision: "1223",
    bridge: "bridge-a",
  },
  media: {
    version: "7.1",
    fetchScript: "fetch-a",
  },
  localAi: {
    runtime: "xenova-a",
    models: "models-a",
  },
  securityManifestFormat: "CIm1",
};

function mutate(path, value) {
  const copy = structuredClone(baseInputs);
  const parts = path.split(".");
  let cursor = copy;
  for (const part of parts.slice(0, -1)) cursor = cursor[part];
  cursor[parts.at(-1)] = value;
  return copy;
}

function changedLayers(before, after) {
  return Object.keys(before).filter((key) => before[key] !== after[key]);
}

describe("RAT-PKG-04 Runtime layer cache key", () => {
  it.each([
    ["shell.rust", ["shell", "runtimeId"]],
    ["appCode.source", ["appCode", "runtimeId"]],
    ["nodeRuntime.normalizedClosure", ["nodeRuntime", "localAi", "runtimeId"]],
    ["nodeRuntime.dynamicRegistry", ["nodeRuntime", "localAi", "runtimeId"]],
    ["nodeRuntime.pnpmLock", ["nodeRuntime", "localAi", "runtimeId"]],
    ["browser.revision", ["browser", "runtimeId"]],
    ["media.version", ["media", "runtimeId"]],
    ["localAi.models", ["localAi", "runtimeId"]],
  ])("%s 只精确失效所属层", (path, expected) => {
    const before = computeRuntimeLayerKeys(baseInputs);
    const after = computeRuntimeLayerKeys(mutate(path, `${path}-changed`));

    expect(changedLayers(before, after)).toEqual(expected);
  });

  it("平台或架构变化会让全部层失效", () => {
    const before = computeRuntimeLayerKeys(baseInputs);
    const after = computeRuntimeLayerKeys(mutate("arch", "x64"));

    expect(changedLayers(before, after)).toEqual([
      "shell",
      "appCode",
      "nodeRuntime",
      "browser",
      "media",
      "localAi",
      "runtimeId",
    ]);
  });

  it("security manifest 格式变化会让全部层失效", () => {
    const before = computeRuntimeLayerKeys(baseInputs);
    const after = computeRuntimeLayerKeys(
      mutate("securityManifestFormat", "CIm2"),
    );

    expect(changedLayers(before, after)).toEqual([
      "shell",
      "appCode",
      "nodeRuntime",
      "browser",
      "media",
      "localAi",
      "runtimeId",
    ]);
  });
});
