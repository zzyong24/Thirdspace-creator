import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, dirname } from "node:path";
import { platform } from "node:process";

export const REQUIRED_NODE_MAJOR = 25;

export function parseNodeMajor(version) {
  const match = String(version ?? "").trim().match(/^v?(\d+)(?:\.|$)/);
  return match ? Number(match[1]) : null;
}

export function defaultNodeCandidates({ env = process.env, plat = platform } = {}) {
  const candidates = [];
  if (env.CREATOROS_NODE25_BIN?.trim()) {
    candidates.push(env.CREATOROS_NODE25_BIN.trim());
  }
  if (plat === "darwin") {
    candidates.push(
      "/opt/homebrew/opt/node/bin/node",
      "/usr/local/opt/node/bin/node",
    );
  }
  return [...new Set(candidates)];
}

export function probeNodeMajor(executable) {
  if (!existsSync(executable)) return null;
  const result = spawnSync(executable, ["-p", "process.versions.node"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  return parseNodeMajor(result.stdout);
}

export function planNodeRuntime({
  currentVersion,
  requiredMajor = REQUIRED_NODE_MAJOR,
  candidates = defaultNodeCandidates(),
  probe = probeNodeMajor,
  alreadyReexecuted = false,
}) {
  const currentMajor = parseNodeMajor(currentVersion);
  if (currentMajor === requiredMajor) {
    return { action: "continue", currentMajor };
  }
  if (alreadyReexecuted) {
    return { action: "error", currentMajor, reason: "reexec-version-mismatch" };
  }
  const executable = candidates.find(
    (candidate) => probe(candidate) === requiredMajor,
  );
  if (!executable) {
    return { action: "error", currentMajor, reason: "runtime-not-found" };
  }
  return { action: "reexec", currentMajor, executable };
}

/**
 * 桌面打包必须由 Node 25 驱动：字节码与随包 Node/V8 强绑定，不能把 engines 警告当成可忽略提示。
 * 本机 Homebrew 的 node@22 可能抢占 PATH，因此在任何构建副作用前自动重启到已验证的 Node 25。
 */
export function enforceDesktopBuildNode25({
  env = process.env,
  argv = process.argv,
  execPath = process.execPath,
  currentVersion = process.versions.node,
  candidates = defaultNodeCandidates({ env }),
  probe = probeNodeMajor,
  spawn = spawnSync,
  exit = process.exit,
} = {}) {
  const plan = planNodeRuntime({
    currentVersion,
    candidates,
    probe,
    alreadyReexecuted: env.CREATOROS_NODE25_REEXEC === "1",
  });
  if (plan.action === "continue") return plan;
  if (plan.action === "error") {
    const current = plan.currentMajor == null ? currentVersion : `Node ${plan.currentMajor}`;
    throw new Error(
      `[desktop:package] 构建必须使用 Node ${REQUIRED_NODE_MAJOR}，当前是 ${current}，且未找到可用的 Node ${REQUIRED_NODE_MAJOR}。` +
        "请安装 Homebrew node 25，或设置 CREATOROS_NODE25_BIN 指向 Node 25 可执行文件。",
    );
  }

  console.log(
    `[desktop:package] 当前 Node ${plan.currentMajor ?? currentVersion} 不符合构建基线，自动切换到 ${plan.executable}。`,
  );
  const result = spawn(plan.executable, argv.slice(1), {
    stdio: "inherit",
    env: {
      ...env,
      PATH: `${dirname(plan.executable)}${delimiter}${env.PATH ?? ""}`,
      CREATOROS_NODE25_REEXEC: "1",
    },
  });
  if (result.error) throw result.error;
  exit(result.status ?? 1);
  return { action: "reexec", executable: plan.executable, previousExecPath: execPath };
}
