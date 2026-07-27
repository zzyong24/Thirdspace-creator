import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const INSTALLER_RULES = {
  "darwin-aarch64": {
    label: "DMG",
    matches: (name) => name.toLowerCase().endsWith(".dmg"),
  },
  "windows-x86_64": {
    label: "setup.exe",
    matches: (name) => name.toLowerCase().endsWith("-setup.exe"),
  },
};

async function listFilesRecursively(root) {
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const dir = pending.pop();
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolute);
      } else if (entry.isFile()) {
        files.push(absolute);
      }
    }
  }
  return files;
}

/**
 * 从 Tauri 的完整 bundle 中只取用户真正需要双击安装的文件。
 * updater 包、签名和 latest.json 仍可在构建链内部校验，但不得混入用户 artifact。
 */
export async function collectUserInstaller({ target, bundleDir, outputDir }) {
  const rule = INSTALLER_RULES[target];
  if (!rule) {
    throw new Error(`不支持的用户安装包目标: ${target}`);
  }

  const allFiles = await listFilesRecursively(bundleDir);
  const installers = allFiles.filter((file) => rule.matches(path.basename(file)));
  if (installers.length !== 1) {
    throw new Error(
      `${target} 必须恰好 1 个 ${rule.label}，实际找到 ${installers.length} 个:\n${installers.join("\n")}`,
    );
  }

  await mkdir(outputDir, { recursive: true });
  const existing = await readdir(outputDir);
  if (existing.length > 0) {
    throw new Error(`用户 artifact 输出目录必须为空: ${outputDir}`);
  }

  const destination = path.join(outputDir, path.basename(installers[0]));
  await copyFile(installers[0], destination);
  return destination;
}

async function main() {
  const [target, bundleDir, outputDir] = process.argv.slice(2);
  if (!target || !bundleDir || !outputDir) {
    throw new Error(
      "用法: node collect-user-installers.mjs <darwin-aarch64|windows-x86_64> <bundle-dir> <output-dir>",
    );
  }
  const copied = await collectUserInstaller({
    target,
    bundleDir: path.resolve(bundleDir),
    outputDir: path.resolve(outputDir),
  });
  console.log(`[user-artifact] 只收集安装包: ${copied}`);
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href ===
    pathToFileURL(fileURLToPath(import.meta.url)).href;

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
