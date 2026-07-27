"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { builtinModules, registerHooks } = require("node:module");
const { pathToFileURL } = require("node:url");

const runtimeRoot =
  process.env.CREATOROS_RUNTIME_ROOT || path.resolve(__dirname, "..");
const vendorRoots = [
  path.resolve(runtimeRoot, "frontend", ".next", "vendor"),
  path.resolve(runtimeRoot, "layers", "core", "render", "vendor"),
  path.resolve(runtimeRoot, "layers", "browser", "vendor"),
  path.resolve(runtimeRoot, "layers", "local-ai", "vendor"),
].filter((candidate) => fs.existsSync(candidate));
const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

function splitPackageSpecifier(specifier) {
  const segments = specifier.split("/");
  if (specifier.startsWith("@")) {
    return {
      packageName: `${segments[0]}/${segments[1]}`,
      subpath: segments.slice(2).join("/"),
    };
  }
  return {
    packageName: segments[0],
    subpath: segments.slice(1).join("/"),
  };
}

function chooseConditionalExport(value, conditions) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const selected = chooseConditionalExport(candidate, conditions);
      if (selected) return selected;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const condition of conditions) {
    if (!(condition in value)) continue;
    const selected = chooseConditionalExport(value[condition], conditions);
    if (selected) return selected;
  }
  if ("default" in value) {
    return chooseConditionalExport(value.default, conditions);
  }
  return null;
}

function exportedTarget(manifest, subpath, conditions) {
  const exportsField = manifest.exports;
  if (!exportsField) return null;
  const exportKey = subpath ? `./${subpath}` : ".";
  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    return subpath ? null : chooseConditionalExport(exportsField, conditions);
  }
  if (typeof exportsField !== "object") return null;
  if (!Object.keys(exportsField).some((key) => key.startsWith("."))) {
    return subpath ? null : chooseConditionalExport(exportsField, conditions);
  }
  if (exportKey in exportsField) {
    return chooseConditionalExport(exportsField[exportKey], conditions);
  }
  for (const [pattern, value] of Object.entries(exportsField)) {
    const star = pattern.indexOf("*");
    if (star < 0) continue;
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (!exportKey.startsWith(prefix) || !exportKey.endsWith(suffix)) continue;
    const matched = exportKey.slice(prefix.length, exportKey.length - suffix.length);
    const selected = chooseConditionalExport(value, conditions);
    if (selected) return selected.replaceAll("*", matched);
  }
  return null;
}

function existingModuleFile(candidate) {
  try {
    if (fs.statSync(candidate).isDirectory()) {
      const nestedManifest = path.resolve(candidate, "package.json");
      if (fs.existsSync(nestedManifest)) {
        const manifest = JSON.parse(fs.readFileSync(nestedManifest, "utf8"));
        const nestedTarget = manifest.main || manifest.module;
        if (nestedTarget) {
          const nestedFile = existingModuleFile(path.resolve(candidate, nestedTarget));
          if (nestedFile) return nestedFile;
        }
      }
    }
  } catch {
    // Continue through explicit file candidates below.
  }
  for (const value of [
    candidate,
    `${candidate}.js`,
    `${candidate}.cjs`,
    `${candidate}.mjs`,
    path.resolve(candidate, "index.js"),
    path.resolve(candidate, "index.cjs"),
    path.resolve(candidate, "index.mjs"),
  ]) {
    try {
      if (fs.statSync(value).isFile()) return value;
    } catch {
      // Continue to the next deterministic candidate.
    }
  }
  return null;
}

function resolveFromVendors(specifier, conditions) {
  const { packageName, subpath } = splitPackageSpecifier(specifier);
  for (const vendorRoot of vendorRoots) {
    const packageRoot = path.resolve(vendorRoot, packageName);
    const manifestPath = path.resolve(packageRoot, "package.json");
    if (!fs.existsSync(packageRoot)) continue;
    let manifest = {};
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    }
    const target =
      exportedTarget(manifest, subpath, conditions) ||
      (subpath ? `./${subpath}` : manifest.main || manifest.module || "./index.js");
    const candidate = existingModuleFile(path.resolve(packageRoot, target));
    if (candidate) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      builtins.has(specifier) ||
      specifier.startsWith(".") ||
      specifier.startsWith("/") ||
      specifier.startsWith("file:")
    ) {
      return nextResolve(specifier, context);
    }
    const resolved = resolveFromVendors(
      specifier,
      new Set(context.conditions || ["node", "require", "default"]),
    );
    if (!resolved) return nextResolve(specifier, context);
    return {
      shortCircuit: true,
      url: pathToFileURL(resolved).href,
    };
  },
});
