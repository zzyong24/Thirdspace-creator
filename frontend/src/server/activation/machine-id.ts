import { createHash, randomUUID } from "node:crypto";

// T-147 P5 桌面激活授权 —— 机器指纹(machineId)解析 + 本机持久化。
//
// 要求(SPEC §3):同设备稳定、跨设备唯一。
//   ① 首选 = Rust 壳注入的 CREATOROS_MACHINE_ID(桌面最稳:Rust 侧组合平台机器标识
//      〔macOS IOPlatformUUID / Windows MachineGuid〕+ 落盘持久 UUID → SHA-256)。
//   ② 回退(web/dev 或 Rust 未注入)= node 侧落盘一个持久文件存随机 UUID,同机稳定跨重启。
//
// 诚实:machineId 由客户端上报,可伪造 —— 所有软件授权的固有限制(文档 §5.2 已注)。
//   多因子 + 持久化尽力稳,不宣称防伪造。
//
// fs 端口可注入(测试传内存桩,不碰真磁盘)。

export interface MachineIdFs {
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
}

export interface ResolveMachineIdOptions {
  // Rust 注入的指纹(activation-config.injectedMachineId);有则直接用(桌面路径)。
  injectedMachineId?: string;
  // 回退落盘文件路径(node 侧生成/读回持久 UUID)。
  persistPath: string;
  fs: MachineIdFs;
  // 生成器(测试可注入确定值);默认 crypto.randomUUID。
  generateId?: () => string;
}

// 把任意来源的指纹归一成稳定短哈希(避免直接暴露平台原始 UUID;长度可控)。
function fingerprint(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export async function resolveMachineId(
  options: ResolveMachineIdOptions,
): Promise<string> {
  const injected = options.injectedMachineId?.trim();
  if (injected) {
    // Rust 已给稳定指纹 —— 直接用(它已在 Rust 侧组合多因子 + 哈希)。
    return injected;
  }

  // 回退:读落盘文件;有合法内容 → 复用;无 → 生成随机 UUID 落盘。
  const existing = (await options.fs.readFile(options.persistPath))?.trim();
  if (existing) {
    return existing;
  }
  const generate = options.generateId ?? randomUUID;
  const fresh = fingerprint(generate());
  await options.fs.writeFile(options.persistPath, fresh);
  return fresh;
}
