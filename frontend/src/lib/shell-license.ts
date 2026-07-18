/**
 * `shell-license.ts` — [T-372 L3] Rust 壳授权判定的前端薄封装(client-only)。
 *
 * 数据源是 Rust 决策链(license.rs)的两个只读出口:
 *   · IPC `license_last_decision`:最近一次判定的内存缓存(**零网络零重算**)——初始态用它,
 *     因为 webview 挂载晚于 Rust 启动查,单靠事件会漏第一发;
 *   · 事件 `creatoros://license-decision`:决策链每轮(启动查/60min·30d 心跳/IPC 复校)跑完
 *     广播 —— 内测码心跳命中 revoked/到期时,前端桥凭它「立即」跳激活页,不等下次导航。
 *
 * **绝不轮询 `license_check`**:那会触发真网络请求,破坏 SPEC §7/§8 的码型 cadence
 * (内测 60min / 买断 30 天)。
 *
 * web / SSR(无 `__TAURI_INTERNALS__`)一律安全降级返回 null(诚实:web 无授权门,
 * 不假装有判定)。动态 import 收敛与 desktop-updater.ts 同款(web 下 import 即报错)。
 */

import { isDesktopRuntimeClient } from "./desktop-updater";

/** Rust 侧 `GateDecision`(license.rs,serde camelCase)。前端只消费,不持有判定逻辑。 */
export interface ShellGateDecision {
  licensed: boolean;
  status: string;
  /** "trial"(内测,有到期)| "perpetual"(买断,expiresAt=null)。 */
  mode: string;
  expiresAt: string | null;
  revoked: boolean;
  /** [L3] 买断码签名撤销的软降级:true = 停更新 + 提示,核心功能照常(SPEC §8)。 */
  updatesBlocked: boolean;
  /** [L3] 内测码离线宽限剩余秒数(仅 status="grace" 时有值,SPEC §7 倒计时)。 */
  offlineRemaining: number | null;
  signatureVerified: boolean;
  strictVerify: boolean;
  message: string;
}

/** 决策链广播事件名(Rust run_chain_and_persist 发,payload = ShellGateDecision)。 */
export const LICENSE_DECISION_EVENT = "creatoros://license-decision";

/**
 * 读最近一次判定(IPC `license_last_decision`,零网络)。
 * 非桌面态 / IPC 失败 / 启动查尚未跑完 → null(调用方按「未知」处理,可再等事件)。
 */
export async function fetchLastShellDecision(): Promise<ShellGateDecision | null> {
  if (!isDesktopRuntimeClient()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return (
      (await invoke<ShellGateDecision | null>("license_last_decision")) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * 订阅决策链广播。返回退订函数;非桌面态 / 订阅失败 → null(不 throw)。
 * 调用方须在卸载时调用退订函数(以及处理「卸载先于订阅完成」的竞态)。
 */
export async function subscribeShellDecision(
  onDecision: (decision: ShellGateDecision) => void,
): Promise<(() => void) | null> {
  if (!isDesktopRuntimeClient()) return null;
  try {
    const { listen } = await import("@tauri-apps/api/event");
    return await listen<ShellGateDecision>(LICENSE_DECISION_EVENT, (event) => {
      onDecision(event.payload);
    });
  } catch {
    return null;
  }
}
