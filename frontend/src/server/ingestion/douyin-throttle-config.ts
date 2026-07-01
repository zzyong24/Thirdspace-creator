// 抖音采集限流/退避配置(T-038a / SPEC §4.6)。集中每 channel 的 pacing + backoff 常量,
// 默认值偏保守(「不封」为最高优先),可被 env 覆盖(用户觉得太慢可提速、想更稳可调大)。
//
// **不进 model-config**:这是基础设施不是模型能力(SPEC §2 非目标 + §4.6)——参数走
// 默认常量 + 可选 env 覆盖,不接 model-config 那套用户可配模型能力的通路。
//
// channel 两条风险面(SPEC §1):
//   - creator-center:带 sessionid cookie,封的是「账号」(catastrophic)。minInterval 4s。
//   - iesdouyin:无 cookie 公开分享页,封的是「IP」(影响面广)。minInterval 9s(更保守;
//     T-037 实测 8s + CAP=1 可绕过风控,9s + jitter 更稳)。

export type DouyinChannel = "creator-center" | "iesdouyin";

export interface GatewayPacing {
  // 同 channel 两次请求最小间隔(ms)。并发恒为 1(每 channel 串行);不暴露并发参数防误配。
  minIntervalMs: number;
  // ±比例随机抖动(如 0.3 → ±30%),打散规律性(SPEC §4.1 GatewayPacing)。
  jitterRatio: number;
}

export interface GatewayBackoff {
  baseCooldownMs: number; // 首次风控 cooldown(默认 2min)
  factor: number; // 指数因子(默认 2)
  maxCooldownMs: number; // cooldown 上限(默认 60min)
  // consecutive 风控次数 n → cooldown = min(base * factor^(n-1), max)
  // 偶发网络 ERR_TIMED_OUT 单次不升级为长退避,需连续 timeoutThrottleThreshold 次
  // ([gate-F6]:家宽抖动误伤,单次仅记数不 cooldown)。
  timeoutThrottleThreshold: number;
}

export interface DouyinChannelConfig {
  pacing: GatewayPacing;
  backoff: GatewayBackoff;
}

export type DouyinThrottleConfig = Record<DouyinChannel, DouyinChannelConfig>;

// ── §4.6 默认值 ────────────────────────────────────────────────────────────────
const DEFAULTS: DouyinThrottleConfig = {
  "creator-center": {
    pacing: { minIntervalMs: 4000, jitterRatio: 0.3 },
    backoff: {
      baseCooldownMs: 120000, // 2min
      factor: 2,
      maxCooldownMs: 3600000, // 60min
      timeoutThrottleThreshold: 2,
    },
  },
  iesdouyin: {
    pacing: { minIntervalMs: 9000, jitterRatio: 0.3 },
    backoff: {
      baseCooldownMs: 120000,
      factor: 2,
      maxCooldownMs: 3600000,
      timeoutThrottleThreshold: 2,
    },
  },
};

// env 覆盖键前缀(SPEC 示例 DOUYIN_THROTTLE_IESDOUYIN_MIN_INTERVAL_MS)。channel 段:
// CREATOR_CENTER / IESDOUYIN(横杠转下划线大写)。
const CHANNEL_ENV_SEGMENT: Record<DouyinChannel, string> = {
  "creator-center": "CREATOR_CENTER",
  iesdouyin: "IESDOUYIN",
};

// env 读取用宽松的 map 类型(不绑 Next 的 ProcessEnv 契约,便于测试注桩 + 纯函数)。
type EnvLike = Record<string, string | undefined>;

function envNumber(env: EnvLike, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  // 非法(NaN / 负数)一律回退默认——env 配错不该把限流关成 0(0 间隔 = 无节流 = 撞封)。
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

// 据 env 解析某 channel 的最终配置(纯函数,注入 env 便于单测,不依赖全局 process.env)。
// 覆盖键(<PREFIX>_<CHANNEL>_<PARAM>):
//   DOUYIN_THROTTLE_<CHANNEL>_MIN_INTERVAL_MS
//   DOUYIN_THROTTLE_<CHANNEL>_JITTER_RATIO
//   DOUYIN_THROTTLE_<CHANNEL>_BASE_COOLDOWN_MS
//   DOUYIN_THROTTLE_<CHANNEL>_FACTOR
//   DOUYIN_THROTTLE_<CHANNEL>_MAX_COOLDOWN_MS
//   DOUYIN_THROTTLE_<CHANNEL>_TIMEOUT_THROTTLE_THRESHOLD
export function resolveChannelConfig(
  channel: DouyinChannel,
  env: EnvLike = process.env,
): DouyinChannelConfig {
  const seg = CHANNEL_ENV_SEGMENT[channel];
  const base = DEFAULTS[channel];
  const p = `DOUYIN_THROTTLE_${seg}`;
  return {
    pacing: {
      minIntervalMs: envNumber(
        env,
        `${p}_MIN_INTERVAL_MS`,
        base.pacing.minIntervalMs,
      ),
      jitterRatio: envNumber(env, `${p}_JITTER_RATIO`, base.pacing.jitterRatio),
    },
    backoff: {
      baseCooldownMs: envNumber(
        env,
        `${p}_BASE_COOLDOWN_MS`,
        base.backoff.baseCooldownMs,
      ),
      factor: envNumber(env, `${p}_FACTOR`, base.backoff.factor),
      maxCooldownMs: envNumber(
        env,
        `${p}_MAX_COOLDOWN_MS`,
        base.backoff.maxCooldownMs,
      ),
      timeoutThrottleThreshold: envNumber(
        env,
        `${p}_TIMEOUT_THROTTLE_THRESHOLD`,
        base.backoff.timeoutThrottleThreshold,
      ),
    },
  };
}

// 解析全部 channel 的配置表(runtime 装配 gateway 时用;注入 env 便于测试)。
export function resolveDouyinThrottleConfig(
  env: EnvLike = process.env,
): DouyinThrottleConfig {
  return {
    "creator-center": resolveChannelConfig("creator-center", env),
    iesdouyin: resolveChannelConfig("iesdouyin", env),
  };
}

// 只读默认(测试 / 文档参考;不要就地改)。
export const DOUYIN_THROTTLE_DEFAULTS: DouyinThrottleConfig = DEFAULTS;
