// T-1063：保留真实 Worker/Next 编译，额外课程与类型验收不进入出包路径。
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export function frontendBuildSteps(root = frontend) {
  return [
    { entry: resolve(root, "../ai-worker/scripts/build.mjs"), args: [] },
    { entry: resolve(root, "node_modules/next/dist/bin/next"), args: ["build"] },
  ];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
for (const { entry, args } of frontendBuildSteps()) {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd: frontend,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
}
