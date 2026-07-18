import "server-only";
import { getActivationService } from "@/server/persistence-client";
import { isDesktopRuntime } from "@/server/activation";
import { isStrictVerifyEnabled } from "@/server/activation/activation-config";
import {
  readLicenseVerdict,
  type LicenseVerdict,
} from "@/server/activation/license-file.server";

// T-147 P5 → [T-372 L2] 桌面激活门判据(供 (creator)/layout gate 调用)。
//
// 返回 true = 应放行;false = 未激活/到期,门控应 redirect("/activate")。env 可注入(测试传桩)。
//
// **web/dev 硬短路**(P5 不变式,单测锚死):isDesktopRuntime 判 false 时**立即返回 true**,
// 连 .license / getActivationService() 都不触碰 —— web 绝不被这道门卡住。
//
// **桌面态放行权威 = Rust 侧 `.license`**(SPEC §9):校验决策链(验签/防重放/防回拨)已迁
// Rust 壳层,门只读 Rust 落盘的放行快照 `allowed` 布尔,不再调 sidecar 状态机、不读
// activation_state 表(那只是展示副本)。
//
// `.license` 缺失时:
//   · 强验签(默认,CREATOROS_LICENSE_STRICT_VERIFY≠"0")→ 视为未激活 → /activate
//     (Rust 启动必查会在激活后落文件;无文件 = 无放行判定)。
//   · [gate-F2] 弱验签("0",L1s 未上线的显式过渡)→ 回退 P5 legacy check()
//     (sidecar 状态机,仅校 success+valid)——存量 P5 激活用户升级后不被硬拦,
//     属有显式开关的诚实降级,非静默范围缩水。

export interface ActivationGateDeps {
  // 注入 .license 读取(测试传桩;运行时读真文件)。
  readVerdict?: (
    env: Record<string, string | undefined>,
  ) => Promise<LicenseVerdict | null>;
}

export async function isActivationAllowed(
  env: Record<string, string | undefined> = process.env,
  deps: ActivationGateDeps = {},
): Promise<boolean> {
  if (!isDesktopRuntime(env)) {
    return true; // web/dev:门不触发,主应用照常。
  }
  const read = deps.readVerdict ?? ((e) => readLicenseVerdict({ env: e }));
  const verdict = await read(env);
  if (verdict) {
    return verdict.allowed === true;
  }
  if (!isStrictVerifyEnabled(env)) {
    // gate-F2 弱验签过渡:无 Rust 判定时回退 P5 现状(sidecar 状态机)。
    const service = await getActivationService();
    const check = await service.check();
    return check.allowed;
  }
  return false;
}
