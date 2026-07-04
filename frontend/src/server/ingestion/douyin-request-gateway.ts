// 抖音采集统一限流/退避网关(T-038a / SPEC §4.1–§4.2)。所有对外抖音请求过它:
// `acquire(channel)` 拿令牌 → 完成后 `report(channel, outcome)`。本片是纯可测核心
// (无集成):不碰 douyin-cdp / dispatch(那是 T-038b)。
//
// 三块:
//   1. classifyDouyinOutcome —— 纯函数,风控 vs 内容错误分类([gate-F6] 优先级写死)。
//   2. ThrottleStatePort —— 依赖倒置端口(单测注 fake、runtime 注 PGlite 适配器)。
//   3. DouyinRequestGateway —— 每 channel 串行队列 + 最小间隔 + jitter + 指数退避 +
//      [gate-F3] readyPromise barrier(恢复未完成前全阻塞,防重启后 thundering herd)。

import type {
  DouyinChannel,
  DouyinChannelConfig,
  DouyinThrottleConfig,
} from "./douyin-throttle-config";

export type { DouyinChannel } from "./douyin-throttle-config";

// ── 分类(SPEC §4.2)───────────────────────────────────────────────────────────
//
// classifyDouyinOutcome 的入参**刻意设计成可判定的结构化信号**(不耦合 Playwright):
// 调用方(T-038b withDouyinChannel)负责把原始异常/页面状态归一成这个 `kind` + flags。

export type DouyinOutcome = "throttled" | "content-error" | "ok";

// 归一后的信号种类。调用方据原始异常/页面产出其一:
//   - "ok":请求成功拿到内容。
//   - "http-429":HTTP 429 明确速率限制。
//   - "captcha":页面含验证码/滑块。
//   - "router-data-missing":iesdouyin 无 `_ROUTER_DATA` / JSON 解析失败(T-037 撞的点)。
//   - "export-download-timeout":创作者中心导出 waitForEvent('download') 超时。
//     ——**必须配合 hasNoDataToast 才能定分类**([gate-F6],见下)。
//   - "empty-item-list":item_list 空但页面正常(内容性质)。
//   - "atlas":desc 标注图集(内容性质,非视频)。
//   - "ffmpeg-183":ffmpeg 退出码 183(图集无视频流,内容性质)。
//   - "net-timeout":网络 ERR_TIMED_OUT(偶发)——单次不长退避([gate-F6])。
export type DouyinSignalKind =
  | "ok"
  | "http-429"
  | "captcha"
  | "router-data-missing"
  | "export-download-timeout"
  | "empty-item-list"
  | "atlas"
  | "ffmpeg-183"
  | "net-timeout";

export interface ClassifyInput {
  kind: DouyinSignalKind;
  // 仅 export-download-timeout 路径相关:页面是否出现「当前暂无数据可导出」toast。
  // [gate-F6] download 超时**不能**直接判 throttled——「暂无数据可导出」时永不触发
  // download 事件 = 必然 waitForEvent 超时(douyin-cdp.ts:881 注释坐实),即图集/无数据
  // 导出会走 download 超时路径。故:① 先检测该 toast → content-error;② 仅当无该 toast
  // 且 download 超时 → throttled。**顺序写死,否则图集导出被误判风控退避**(违反
  // T-037「41 图集 0 风控」教训)。
  hasNoDataToast?: boolean;
  // 仅 net-timeout 路径相关:调用方维护的**该 channel 连续 timeout 计数**(含本次)。
  // [gate-F6] ERR_TIMED_OUT 单次不长退避(家宽抖动误伤)——连续 ≥ timeoutThrottleThreshold
  // (默认 2)才升级为 throttled;单次仅记数不 cooldown → 归 content-error(不动退避)。
  consecutiveTimeouts?: number;
  // net-timeout 升级阈值(默认 2,来自 config.backoff.timeoutThrottleThreshold)。
  timeoutThrottleThreshold?: number;
}

// 纯函数:据结构化信号定分类。保守偏「throttled」——宁可慢,不可封(SPEC §4.2)。
export function classifyDouyinOutcome(input: ClassifyInput): DouyinOutcome {
  const {
    kind,
    hasNoDataToast,
    consecutiveTimeouts,
    timeoutThrottleThreshold = 2,
  } = input;

  switch (kind) {
    case "ok":
      return "ok";

    // 明确风控信号 → throttled。
    case "http-429":
    case "captcha":
    case "router-data-missing":
      return "throttled";

    // [gate-F6] 导出 download 超时:先看「暂无数据可导出」toast。
    case "export-download-timeout":
      // ① 有 toast → 内容空,非频控(图集/无数据导出),不退避。
      if (hasNoDataToast) return "content-error";
      // ② 无 toast + 超时 → 疑似频控,退避。
      return "throttled";

    // 内容性质,非风控(图集/无视频/已删除)——不触发退避(T-037:41 图集 0 风控)。
    case "empty-item-list":
    case "atlas":
    case "ffmpeg-183":
      return "content-error";

    // [gate-F6] 偶发网络:单次不 cooldown(仅记数),连续 ≥ 阈值才 throttled 长退避。
    case "net-timeout": {
      const n = consecutiveTimeouts ?? 1;
      return n >= timeoutThrottleThreshold ? "throttled" : "content-error";
    }

    default:
      // 未知信号保守退避(宁可慢不可封)。
      return "throttled";
  }
}

// ── 持久状态端口(依赖倒置,SPEC §4.1/§4.3)────────────────────────────────────

export interface ThrottleStateRecord {
  cooldownUntil: number | null; // epoch ms;null = 无 cooldown
  consecutiveThrottles: number;
  lastRequestAt: number | null; // epoch ms;null = 从未请求
}

// runtime 注 PGlite 适配器(createPgliteThrottleStatePort),单测注 fake。
export interface ThrottleStatePort {
  load(channel: DouyinChannel): Promise<ThrottleStateRecord | null>;
  save(channel: DouyinChannel, state: ThrottleStateRecord): Promise<void>;
}

// ── Gateway(SPEC §4.1)─────────────────────────────────────────────────────────

export interface GatewayDeps {
  config: DouyinThrottleConfig;
  port: ThrottleStatePort;
  now: () => number; // 注入时钟(测试确定性,不真等)
  sleep: (ms: number) => Promise<void>; // 注入 sleep(测试可假)
  // jitter 源:给一个 channel/base,返回实际抖动后的等待毫秒。默认实现用 Math.random,
  // 但**可注入确定性源**让单测断言落 ±ratio 区间(不用真 Math.random 致 flaky)。
  // 语义:baseMs 应用 ±jitterRatio → 返回 [base*(1-ratio), base*(1+ratio)] 内的值。
  jitter?: (baseMs: number, jitterRatio: number) => number;
}

export interface ChannelStatus {
  cooldownActive: boolean;
  cooldownEtaMs: number; // 距 cooldown 到期还剩多少 ms(未激活为 0)
  consecutiveThrottles: number;
  lastRequestAt: number | null;
}

// ── DI 端口 + withDouyinChannel(T-038b / SPEC §4.4)────────────────────────────
//
// douyin-cdp 的插装点**不**硬编码 import DouyinRequestGateway 单例(否则单测会真等 9s);
// 只依赖这个**结构化窄端口**(DouyinRequestGateway 天然满足它)。runtime 注真单例;既有
// 单测传「即时 no-op gateway」(acquire 立即 resolve、report 为 noop)→ 不真等、零回归。
export interface DouyinChannelGate {
  acquire(channel: DouyinChannel): Promise<void>;
  // report 可同步或异步(DouyinRequestGateway.report 返 Promise;no-op 返 void);
  // withDouyinChannel 不 await 其结果(退避持久化是后台副作用,不阻塞调用方)。
  report(channel: DouyinChannel, outcome: DouyinOutcome): void | Promise<void>;
}

// 即时 no-op gate:acquire 立即放行、report 什么都不做。既有 douyin-cdp 单测的默认注入
// (不传 gateway 时用它)—— 保证不真等、不 flaky(SPEC 本片"既有 40 测零回归"硬约束)。
export const instantNoopGateway: DouyinChannelGate = {
  async acquire(): Promise<void> {
    /* 立即放行,不节流 */
  },
  report(): void {
    /* no-op */
  },
};

/**
 * withDouyinChannel(SPEC §4.4):把一次对外抖音请求包进「acquire → 跑 → report」一条龙:
 *   acquire(channel) → try { r = await fn(); report(channel,"ok"); return r }
 *                      catch(e) { report(channel, classify(mapErr(e))); throw e }
 * **报告后仍抛原错**(不吞)—— report 只更新退避状态,失败照旧向上传播,调用方原逻辑不变。
 * `mapErr` 把该路径的真实异常/页面状态归一成 classifyDouyinOutcome 的结构化 `kind`
 * (router-data-missing / export-download-timeout+hasNoDataToast / net-timeout+consecutive…);
 * 省略 mapErr → 一律按 net-timeout 单次(content-error 不退避,保守但不误封,兜底)。
 */
export async function withDouyinChannel<T>(
  gateway: DouyinChannelGate,
  channel: DouyinChannel,
  fn: () => Promise<T>,
  mapErr?: (err: unknown) => ClassifyInput,
): Promise<T> {
  await gateway.acquire(channel);
  try {
    const r = await fn();
    // 成功:清退避(report 可能返 Promise,不 await —— 持久化是后台副作用)。
    void gateway.report(channel, "ok");
    return r;
  } catch (e) {
    // 失败:据映射分类 → report(throttled/content-error),**报告后仍抛原错**。
    const input: ClassifyInput = mapErr
      ? mapErr(e)
      : { kind: "net-timeout", consecutiveTimeouts: 1 };
    void gateway.report(channel, classifyDouyinOutcome(input));
    throw e;
  }
}

// 每 channel 的运行时状态(内存镜像 + 串行链尾)。
interface ChannelState {
  cooldownUntil: number | null;
  consecutiveThrottles: number;
  lastRequestAt: number | null;
  // 串行闸:acquire 排队的 promise 链尾(并发恒为 1)。
  tail: Promise<void>;
}

const CHANNELS: DouyinChannel[] = ["creator-center", "iesdouyin"];

// 默认 jitter:baseMs 应用 ±jitterRatio,均匀分布在 [base*(1-r), base*(1+r)]。
function defaultJitter(baseMs: number, jitterRatio: number): number {
  if (baseMs <= 0 || jitterRatio <= 0) return Math.max(0, baseMs);
  const delta = baseMs * jitterRatio;
  // [-delta, +delta] 均匀。
  const offset = (Math.random() * 2 - 1) * delta;
  return Math.max(0, baseMs + offset);
}

export class DouyinRequestGateway {
  private readonly config: DouyinThrottleConfig;
  private readonly port: ThrottleStatePort;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly jitter: (baseMs: number, jitterRatio: number) => number;

  private readonly state: Record<DouyinChannel, ChannelState>;

  // [gate-F3] 恢复 barrier:构造即启,acquire 第一步 await 它。恢复完成前全阻塞。
  readonly readyPromise: Promise<void>;

  constructor(deps: GatewayDeps) {
    this.config = deps.config;
    this.port = deps.port;
    this.now = deps.now;
    this.sleep = deps.sleep;
    this.jitter = deps.jitter ?? defaultJitter;

    this.state = {
      "creator-center": {
        cooldownUntil: null,
        consecutiveThrottles: 0,
        lastRequestAt: null,
        tail: Promise.resolve(),
      },
      iesdouyin: {
        cooldownUntil: null,
        consecutiveThrottles: 0,
        lastRequestAt: null,
        tail: Promise.resolve(),
      },
    };

    // [gate-F3] 构造函数**不能同步 new 完就可用**——启动一个 readyPromise = restore()。
    // 恢复完成前进来的 acquire(重启后 scheduler tick + dispatch fire-and-forget)一律阻塞。
    this.readyPromise = this.restore();
  }

  // 从持久层恢复每 channel 的 cooldownUntil / consecutive(SPEC §4.1 ⓪ / §4.3)。
  private async restore(): Promise<void> {
    await Promise.all(
      CHANNELS.map(async (channel) => {
        const rec = await this.port.load(channel);
        if (!rec) return;
        const s = this.state[channel];
        s.cooldownUntil = rec.cooldownUntil;
        s.consecutiveThrottles = rec.consecutiveThrottles;
        s.lastRequestAt = rec.lastRequestAt;
      }),
    );
  }

  // acquire:拿该 channel 的放行令牌(SPEC §4.1 ⓪–④)。
  //   ⓪ [gate-F3] await readyPromise —— DB 恢复未完成前全阻塞,绝不在 cooldownUntil
  //      未加载时放行(否则重启后第一拨照样撞风控,破坏卖点)。
  //   ① 若 channel 在 cooldown → 等到 cooldownUntil(+jitter)。
  //   ② 串行:等上一个 acquire 释放(每 channel 并发=1,promise 链)。
  //   ③ 距 lastRequestAt 不足 minInterval → 等差额(+jitter)。
  //   ④ 记 lastRequestAt = now,放行。
  async acquire(channel: DouyinChannel): Promise<void> {
    // ⓪ 恢复 barrier —— 必须在排队之前 await(恢复完才知道真 cooldown)。
    await this.readyPromise;

    const s = this.state[channel];
    // ② 串行:把本次 acquire 挂到链尾。用一个 gate promise 让「上一个释放」→「本次开始」。
    const prev = s.tail;
    let release!: () => void;
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });
    // 链尾推进:下一个 acquire 会等 mine 完成(即本次放行后调用方 report/继续,直到
    // 下一次 acquire——但串行语义只需保证「同一时刻仅一个 acquire 在跑 ①③ 的等待」)。
    // 这里 tail 只串「acquire 的准入等待」阶段,放行后立即 release 让下一个进入。
    s.tail = prev.then(() => mine);

    // 等上一个释放。
    await prev;

    try {
      const cfg: DouyinChannelConfig = this.config[channel];

      // ① cooldown:恢复出来或 report 设置的 cooldownUntil 未到 → 等到期(+jitter)。
      //   循环 re-check:极端下 sleep 完仍未到(时钟/重设),再等一次。
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const cd = s.cooldownUntil;
        if (cd === null) break;
        const remain = cd - this.now();
        if (remain <= 0) {
          // 到期:清 cooldown(consecutive 不清——留给 report(ok) 清,cooldown 只是时间闸)。
          s.cooldownUntil = null;
          break;
        }
        const waited = this.jitter(remain, cfg.pacing.jitterRatio);
        await this.sleep(waited);
      }

      // ③ 最小间隔:距 lastRequestAt 不足 minInterval → 等差额(+jitter)。
      const last = s.lastRequestAt;
      if (last !== null) {
        const elapsed = this.now() - last;
        const deficit = cfg.pacing.minIntervalMs - elapsed;
        if (deficit > 0) {
          const waited = this.jitter(deficit, cfg.pacing.jitterRatio);
          await this.sleep(waited);
        }
      }

      // ④ 记 lastRequestAt = now,放行。
      s.lastRequestAt = this.now();
    } finally {
      // 放行:释放串行闸,让下一个 acquire 进入准入等待。
      release();
    }
  }

  // report:据结果更新退避状态(SPEC §4.1 report)。
  //   ok:consecutive=0,清 cooldown,save。
  //   throttled:consecutive++,cooldownUntil = now + min(base*factor^(n-1), max),save。
  //   content-error:不动退避状态(图集/无视频等,非风控)。
  async report(channel: DouyinChannel, outcome: DouyinOutcome): Promise<void> {
    const s = this.state[channel];
    const cfg = this.config[channel];

    if (outcome === "content-error") {
      // 不动退避状态(既不升 consecutive、也不清 cooldown)。
      return;
    }

    if (outcome === "ok") {
      s.consecutiveThrottles = 0;
      s.cooldownUntil = null;
      await this.persist(channel);
      return;
    }

    // throttled:指数退避 + 封顶。
    s.consecutiveThrottles += 1;
    const n = s.consecutiveThrottles;
    const raw =
      cfg.backoff.baseCooldownMs * Math.pow(cfg.backoff.factor, n - 1);
    const cooldownMs = Math.min(raw, cfg.backoff.maxCooldownMs);
    s.cooldownUntil = this.now() + cooldownMs;
    await this.persist(channel);
  }

  // getChannelStatus:可观测(供 T-038c 透传自动化)。
  getChannelStatus(channel: DouyinChannel): ChannelStatus {
    const s = this.state[channel];
    const cd = s.cooldownUntil;
    const remain = cd === null ? 0 : Math.max(0, cd - this.now());
    return {
      cooldownActive: remain > 0,
      cooldownEtaMs: remain,
      consecutiveThrottles: s.consecutiveThrottles,
      lastRequestAt: s.lastRequestAt,
    };
  }

  private async persist(channel: DouyinChannel): Promise<void> {
    const s = this.state[channel];
    await this.port.save(channel, {
      cooldownUntil: s.cooldownUntil,
      consecutiveThrottles: s.consecutiveThrottles,
      lastRequestAt: s.lastRequestAt,
    });
  }
}
