import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:process";

const BUNDLE_SUFFIXES = [".app", ".framework", ".xpc", ".appex", ".plugin", ".bundle"];

function depth(path) {
  return path.split("/").filter(Boolean).length;
}

function deepestFirst(paths) {
  return [...new Set(paths)].sort((a, b) => depth(b) - depth(a) || a.localeCompare(b));
}

export function buildMacRuntimeSigningPlan({ machOFiles, bundles }) {
  return [
    ...deepestFirst(machOFiles).map((path) => ({ kind: "macho", path })),
    ...deepestFirst(bundles).map((path) => ({ kind: "bundle", path })),
  ];
}

export function requiresJitEntitlements(target) {
  return target.includes(".app/Contents/MacOS/");
}

export function macRuntimeCodesignArgs(identity, target, entitlementsPath) {
  const args = [
    "--force",
    "--options", "runtime",
    "--timestamp",
    "--preserve-metadata=identifier,entitlements",
  ];
  if (entitlementsPath) args.push("--entitlements", entitlementsPath);
  args.push("--sign", identity, target);
  return args;
}

export function discoverMacRuntimeCodeObjects(root, run = spawnSync) {
  const machOFiles = [];
  const bundles = [];

  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        if (BUNDLE_SUFFIXES.some((suffix) => name.endsWith(suffix))) bundles.push(path);
        visit(path);
        continue;
      }
      if (!stat.isFile()) continue;
      const probe = run("file", ["-b", path], { encoding: "utf8" });
      if (probe.status === 0 && String(probe.stdout).includes("Mach-O")) machOFiles.push(path);
    }
  };

  visit(root);
  return { machOFiles, bundles };
}

export function signMacRuntimePayloadForNotarization(
  root,
  {
    identity,
    jitEntitlementsPath,
    targetPlatform = platform,
    run = spawnSync,
    logger = console,
  } = {},
) {
  if (targetPlatform !== "darwin" || !identity?.trim()) {
    return { signed: false, machOCount: 0, bundleCount: 0 };
  }
  if (!existsSync(root)) throw new Error(`[mac-runtime-signing] runtime 不存在: ${root}`);

  const discovered = discoverMacRuntimeCodeObjects(root, run);
  const plan = buildMacRuntimeSigningPlan(discovered);
  logger.log(
    `[mac-runtime-signing] Developer ID 签 sidecar payload: Mach-O ${discovered.machOFiles.length} + bundle ${discovered.bundles.length}`,
  );

  for (let index = 0; index < plan.length; index++) {
    const item = plan[index];
    const entitlementsPath = item.kind === "macho" && requiresJitEntitlements(item.path)
      ? jitEntitlementsPath
      : undefined;
    const result = run(
      "codesign",
      macRuntimeCodesignArgs(identity, item.path, entitlementsPath),
      { encoding: "utf8" },
    );
    if (result.status !== 0) {
      throw new Error(
        `[mac-runtime-signing] 签名失败 (${item.kind}) ${item.path}\n${result.stderr ?? ""}`,
      );
    }
    if ((index + 1) % 25 === 0 || index + 1 === plan.length) {
      logger.log(`[mac-runtime-signing]   已签 ${index + 1}/${plan.length}`);
    }
  }

  for (const item of plan) {
    const args = item.kind === "bundle"
      ? ["--verify", "--deep", "--strict", item.path]
      : ["--verify", "--strict", item.path];
    const result = run("codesign", args, { encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(
        `[mac-runtime-signing] 签后验证失败 (${item.kind}) ${item.path}\n${result.stderr ?? ""}`,
      );
    }
  }

  logger.log("[mac-runtime-signing] ✓ sidecar payload 全部通过 Developer ID 签名验证");
  return {
    signed: true,
    machOCount: discovered.machOFiles.length,
    bundleCount: discovered.bundles.length,
  };
}
