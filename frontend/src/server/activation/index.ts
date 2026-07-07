import { join, dirname } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import type { Db } from "@creatoros/backend";
import { resolveActivationConfig } from "./activation-config";
import { isDesktopRuntime } from "./is-desktop";
import { createLicenseClient } from "./license-client";
import { createActivationRepository } from "./activation-repository";
import {
  createActivationService,
  type ActivationService,
} from "./activation-service";
import { resolveMachineId, type MachineIdFs } from "./machine-id";

// T-147 P5 桌面激活授权 —— 模块装配(把 config + license 客户端 + machineId + repo + 状态机
// 组合成一个 ActivationService)。persistence-client 在 buildPersistence 里调用它一次,
// 结果放进 bundle,门控/激活页经 getActivationService() 取用。
//
// **不真联网**:license 客户端用全局 fetch,只有桌面态门控/激活页才真调(测试不走这条装配路径)。

export type { ActivationService } from "./activation-service";
export type { ActivationCheck, ActivationStatus } from "./activation-service";
export { isDesktopRuntime } from "./is-desktop";
export { resolveActivationConfig } from "./activation-config";

// node 侧机器指纹落盘位置:与 DB 目录同级(CREATOROS_DB_DIR 的父目录);未配则用户主目录 .creatoros。
function resolveMachineIdPath(
  env: Record<string, string | undefined>,
): string {
  const dbDir = env.CREATOROS_DB_DIR?.trim();
  if (dbDir) {
    // <dbDir 父目录>/machine-id —— 与 .auth/、db/ 同位面。
    return join(dirname(dbDir), "machine-id");
  }
  const home = env.HOME || env.USERPROFILE || process.cwd();
  return join(home, ".creatoros", "machine-id");
}

const nodeFs: MachineIdFs = {
  readFile: async (p) => {
    try {
      return await readFile(p, "utf8");
    } catch {
      return null;
    }
  },
  writeFile: async (p, c) => {
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, c, "utf8");
  },
};

export interface AssembleActivationOptions {
  db: Db;
  masterKey?: Buffer;
  env?: Record<string, string | undefined>;
  now?: () => Date;
}

// 装配一个 ActivationService。桌面/web 都装（web 不会真触发门,装了无害;fetch 桩不注入=用真 fetch,
// 但 web 门控前置分支根本不 check()）。
export async function assembleActivationService(
  options: AssembleActivationOptions,
): Promise<ActivationService> {
  const env = options.env ?? process.env;
  const config = resolveActivationConfig(env);
  const machineId = await resolveMachineId({
    injectedMachineId: config.injectedMachineId,
    persistPath: resolveMachineIdPath(env),
    fs: nodeFs,
  });
  const license = createLicenseClient({ baseUrl: config.baseUrl });
  const repo = createActivationRepository(options.db, {
    masterKey: options.masterKey,
  });
  return createActivationService({
    repo,
    license,
    machineId,
    projectKey: config.projectKey,
    graceDays: config.graceDays,
    now: options.now ?? (() => new Date()),
  });
}

// 门控便捷判据:web/dev 永远放行(门不触发);桌面态走 check()。
export async function evaluateActivationGate(
  service: ActivationService,
  env: Record<string, string | undefined> = process.env,
): Promise<{ desktop: boolean; allowed: boolean }> {
  if (!isDesktopRuntime(env)) {
    // web/dev:激活门不触发,主应用照常。
    return { desktop: false, allowed: true };
  }
  const check = await service.check();
  return { desktop: true, allowed: check.allowed };
}
