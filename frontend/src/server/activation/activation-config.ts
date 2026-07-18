// T-147 P5 桌面激活授权 —— 集中配置(projectKey / 服务地址 / 宽限窗 / 机器指纹)。
//
// 用户硬要求:激活相关配置(projectKey、服务地址)集中可配。仓内无 config 目录(env 直读惯例),
// 故这里做唯一的集中读取点,env 可覆盖默认。**测试激活码绝不进这里**(仅本地 .env.local / 手动输入)。
//
// env 键(见 .env.example + docs/desktop-activation-guide.md):
//   CREATOROS_LICENSE_BASE_URL      授权服务地址(默认已上线的 activation-manager)
//   CREATOROS_LICENSE_PROJECT_KEY   activation-manager 项目标识(默认 test;须先在后台建过该项目)
//   CREATOROS_ACTIVATION_GRACE_DAYS 离线宽限天数(在线校不到时,本地未过期且距上次在线校 ≤ 此天数则放行)
//   CREATOROS_MACHINE_ID            本机硬件指纹(桌面由 Rust 注入;缺失则 node 侧落盘回退)

export interface ActivationConfig {
  baseUrl: string;
  projectKey: string;
  graceDays: number;
  // 由 Rust 壳注入的机器指纹(桌面最稳);web/dev 或未注入时为 undefined → 走落盘回退。
  injectedMachineId?: string;
}

// [T-372 L2·gate-F2] 强验签开关:默认 "1"(强验签,判定在 Rust 侧);置 "0" = L1s 服务端
// 签名端点未上线前的显式过渡降级(仅校 success+valid = P5 现状 + 「签名校验未启用」诚实标注)。
// sidecar 侧用它决定:.license 缺失时是否允许回退 P5 legacy check(见 activation-gate.server.ts)。
export function isStrictVerifyEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (env.CREATOROS_LICENSE_STRICT_VERIFY ?? "1").trim() !== "0";
}

export const DEFAULT_LICENSE_BASE_URL = "https://license.aitongban.cloud";
export const DEFAULT_PROJECT_KEY = "test";
export const DEFAULT_GRACE_DAYS = 7;

export function resolveActivationConfig(
  env: Record<string, string | undefined> = process.env,
): ActivationConfig {
  const baseUrl =
    env.CREATOROS_LICENSE_BASE_URL?.trim() || DEFAULT_LICENSE_BASE_URL;
  const projectKey =
    env.CREATOROS_LICENSE_PROJECT_KEY?.trim() || DEFAULT_PROJECT_KEY;
  const rawGrace = env.CREATOROS_ACTIVATION_GRACE_DAYS?.trim();
  const parsedGrace = rawGrace ? Number(rawGrace) : NaN;
  const graceDays =
    Number.isFinite(parsedGrace) && parsedGrace >= 0
      ? parsedGrace
      : DEFAULT_GRACE_DAYS;
  const injectedMachineId = env.CREATOROS_MACHINE_ID?.trim() || undefined;
  return { baseUrl, projectKey, graceDays, injectedMachineId };
}
