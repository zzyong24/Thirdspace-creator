import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

export function creatorOsCliRuntimePaths(runtimeRoot, targetPlatform = process.platform) {
  return {
    bundle: join(runtimeRoot, "frontend", "cli", "creatoros.cjs"),
    node:
      targetPlatform === "darwin"
        ? join(runtimeRoot, "server.app", "Contents", "MacOS", "creatoros-server")
        : join(runtimeRoot, "cli", targetPlatform === "win32" ? "node.exe" : "node"),
  };
}

export function assertCreatorOsCliRuntime(
  runtimeRoot,
  targetPlatform = process.platform,
) {
  const paths = creatorOsCliRuntimePaths(runtimeRoot, targetPlatform);
  const missing = Object.values(paths).filter((file) => !existsSync(file));
  if (missing.length > 0) {
    throw new Error(
      `[build-sidecar] CreatorOS CLI 随包 runtime 不完整:${missing
        .map((file) => relative(runtimeRoot, file))
        .join("、")}`,
    );
  }
  return paths;
}

function runBundleRuntime({ repoRoot, outputPath }) {
  const script = join(repoRoot, "mcp-server", "scripts", "build-runtime.mjs");
  const result = spawnSync(process.execPath, [script, outputPath], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    const detail =
      result.status === null
        ? `信号=${result.signal ?? "?"}${
            result.error ? ` error=${result.error.code ?? result.error.message}` : ""
          }`
        : `exit ${result.status}`;
    throw new Error(`[build-sidecar] CreatorOS CLI bundle 构建失败(${detail})`);
  }
}

export function stageCreatorOsCliRuntime({
  repoRoot,
  runtimeRoot,
  nodeExecutablePath = process.execPath,
  targetPlatform = process.platform,
  bundleRuntime = runBundleRuntime,
}) {
  const paths = creatorOsCliRuntimePaths(runtimeRoot, targetPlatform);
  mkdirSync(dirname(paths.bundle), { recursive: true });
  bundleRuntime({ repoRoot, outputPath: paths.bundle });
  if (!existsSync(paths.bundle)) {
    throw new Error("[build-sidecar] CreatorOS CLI runtime 未产出");
  }

  if (targetPlatform !== "darwin") {
    if (!existsSync(nodeExecutablePath)) {
      throw new Error(
        `[build-sidecar] CreatorOS CLI Node runtime 不存在:${nodeExecutablePath}`,
      );
    }
    mkdirSync(dirname(paths.node), { recursive: true });
    copyFileSync(nodeExecutablePath, paths.node);
    if (targetPlatform !== "win32") chmodSync(paths.node, 0o755);
  }

  assertCreatorOsCliRuntime(runtimeRoot, targetPlatform);
  return paths;
}
