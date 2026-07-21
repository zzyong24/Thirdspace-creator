import "server-only";

// [T-372 P5 → T-451] 桌面激活门判据(供 (creator)/layout gate 调用)。
//
// **[T-451 gate-F1] verdict-token 硬门·web-mode 短路已删除**
//
// 旧实现:`if (!isDesktopRuntime(env)) return true;` —— 一行 web 短路让攻击者裸启 sidecar
//   时**只要不设 `CREATOROS_DESKTOP=1`**,activation-gate 立即返回 true,连 .license 都不用读。
//   这是本次 SPEC gate 评审 F1 抓到的最严重绕道:整根信任边界被这一行绕过。
//
// **新规则(收紧后)**:
//   1. **dev 分支豁免**:`process.env.NODE_ENV !== "production" && process.env.CREATOROS_DEV_MODE === "1"`
//      → 返回 true。仅本地 `pnpm dev` 脚本注入 `CREATOROS_DEV_MODE=1`;
//      **打包版永不出现该 env**(NODE_ENV 恒 production + CREATOROS_DEV_MODE 未定义)。攻击者伪
//      装 web 需要伪装两个 env,但 NODE_ENV=production 已被 bytecode 保护的 server.js 硬写死。
//   2. **打包态**:一律读 `process.env.CREATOROS_VERDICT_MODE`——
//      · `"licensed"` → 放行 (attacker 到不了这里,verdict-token-gate 在 sidecar instrumentation
//        启动最早期已 exit(1) 拒 spawn 无 token/坏 token 的进程)
//      · `"activation-only"` / 其他 / 未定义 → 拒绝 → gate 层重定向到 /activate。
//   3. **弱验签回退分支删除**([T-451 gate-F2 关联]):旧 sidecar `service.check()` fallback 是
//      "L1s 未上线的过渡",亦是 attacker 可利用的绕道。L1s 已上线,该分支不再需要。
//
// **诚实边界(SPEC §8):**
//   · 攻击者 patch 本 gate 一行 return true 可绕——但已被 T-419 bytecode + T-450 抽样兜底。
//   · sidecar 层真正拦"随包 node 裸启"的是 instrumentation 里的 verdict-token 校验,而不是此文件。
//     本文件是**已进入 sidecar 后**的 layout gate,与 verdict-token 硬门在同一 process 内呼应。
//
// 老 isDesktopRuntime 函数**保留**(供设置页/图标/URL 拼接等非 gate 逻辑用),此文件不再依赖它。

export interface ActivationGateDeps {
  // 保留旧签名(测试注入 verdict 读端);新实现只从 env 读 CREATOROS_VERDICT_MODE,不再需要它。
  readVerdict?: unknown;
}

export async function isActivationAllowed(
  env: Record<string, string | undefined> = process.env,
  _deps: ActivationGateDeps = {},
): Promise<boolean> {
  // [gate-F1] dev 分支豁免:仅当 NODE_ENV≠production 且显式 CREATOROS_DEV_MODE=1 时放行。
  // 打包版 NODE_ENV 恒 production(next standalone server.js 硬写死)→ 这条永远为 false。
  if (env.NODE_ENV !== "production" && env.CREATOROS_DEV_MODE === "1") {
    return true;
  }
  // 打包态:唯一判据 = Rust 壳签发的 verdict-token 校验后挂的全局 flag。
  // sidecar instrumentation 校验 CREATOROS_SIDECAR_VERDICT_TOKEN 通过后写此 env。
  return env.CREATOROS_VERDICT_MODE === "licensed";
}
