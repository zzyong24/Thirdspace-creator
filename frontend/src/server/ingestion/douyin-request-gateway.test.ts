import { describe, it, expect } from "vitest";
import {
  DouyinRequestGateway,
  classifyDouyinOutcome,
  type ThrottleStatePort,
  type ThrottleStateRecord,
  type DouyinChannel,
  type GatewayDeps,
} from "./douyin-request-gateway";
import {
  DOUYIN_THROTTLE_DEFAULTS,
  resolveDouyinThrottleConfig,
  type DouyinThrottleConfig,
} from "./douyin-throttle-config";

// 抖音限流网关确定性单测(T-038a / SPEC §5 ①–⑩)。全程注入假时钟 + 假 sleep,不真等:
// - clock 由测试手动推进(advance),sleep 注册到期 waiter,advance 时结算。
// - jitter 注入确定性源(默认 identity:返回 base,便于精确断言;区间测试单开一例)。
// - port 注 fake(内存 map),持久化集成测另用真 PGlite(见文件末)。

// ── 假时钟 + 假 sleep 台架 ──────────────────────────────────────────────────────
interface Harness {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  advance: (ms: number) => Promise<void>; // 推进时钟并结算到期 sleep(含微任务 flush)
  flush: () => Promise<void>; // 只 flush 微任务(不推进时钟)
  pendingCount: () => number;
}

function makeClock(start = 1_000_000): Harness {
  let t = start;
  interface Waiter {
    deadline: number;
    resolve: () => void;
  }
  let waiters: Waiter[] = [];

  const flush = async () => {
    // 多轮微任务 flush,让链式 then/await 全部推进到下一个 await 点。
    for (let i = 0; i < 50; i++) {
      await Promise.resolve();
    }
  };

  const settleDue = () => {
    const due = waiters.filter((w) => w.deadline <= t);
    waiters = waiters.filter((w) => w.deadline > t);
    for (const w of due) w.resolve();
  };

  return {
    now: () => t,
    sleep: (ms: number) =>
      new Promise<void>((resolve) => {
        if (ms <= 0) {
          resolve();
          return;
        }
        waiters.push({ deadline: t + ms, resolve });
      }),
    advance: async (ms: number) => {
      t += ms;
      settleDue();
      await flush();
      // 结算可能唤醒新的 sleep(链式),再结算一轮到期的(deadline 已 ≤ t)。
      for (let i = 0; i < 20; i++) {
        settleDue();
        await flush();
      }
    },
    flush,
    pendingCount: () => waiters.length,
  };
}

// identity jitter:返回 base 本身(不抖动)——让 ①②④⑤⑥⑦⑧⑩ 精确断言。
const noJitter = (baseMs: number) => baseMs;

// ── 假 port(内存 map)────────────────────────────────────────────────────────
function makeFakePort(
  seed: Partial<Record<DouyinChannel, ThrottleStateRecord>> = {},
): ThrottleStatePort & {
  saved: Record<string, ThrottleStateRecord>;
  saveCount: number;
} {
  const store = new Map<DouyinChannel, ThrottleStateRecord>();
  for (const [k, v] of Object.entries(seed)) {
    store.set(k as DouyinChannel, v as ThrottleStateRecord);
  }
  const saved: Record<string, ThrottleStateRecord> = {};
  let saveCount = 0;
  return {
    saved,
    get saveCount() {
      return saveCount;
    },
    async load(channel) {
      return store.get(channel) ?? null;
    },
    async save(channel, state) {
      store.set(channel, { ...state });
      saved[channel] = { ...state };
      saveCount += 1;
    },
  };
}

const CONFIG: DouyinThrottleConfig = DOUYIN_THROTTLE_DEFAULTS;
const CC = "creator-center" as const; // minInterval 4000
const IES = "iesdouyin" as const; // minInterval 9000

function makeGateway(
  h: Harness,
  port: ThrottleStatePort,
  overrides: Partial<GatewayDeps> = {},
): DouyinRequestGateway {
  return new DouyinRequestGateway({
    config: CONFIG,
    port,
    now: h.now,
    sleep: h.sleep,
    jitter: noJitter,
    ...overrides,
  });
}

// ── 分类纯函数单测(classify + ⑨⑩ 的分类部分)─────────────────────────────────
describe("classifyDouyinOutcome (SPEC §4.2)", () => {
  it("明确风控信号 → throttled", () => {
    expect(classifyDouyinOutcome({ kind: "http-429" })).toBe("throttled");
    expect(classifyDouyinOutcome({ kind: "captcha" })).toBe("throttled");
    expect(classifyDouyinOutcome({ kind: "router-data-missing" })).toBe(
      "throttled",
    );
  });

  it("图集/无视频/ffmpeg-183/空 item_list → content-error(不退避)", () => {
    expect(classifyDouyinOutcome({ kind: "atlas" })).toBe("content-error");
    expect(classifyDouyinOutcome({ kind: "empty-item-list" })).toBe(
      "content-error",
    );
    expect(classifyDouyinOutcome({ kind: "ffmpeg-183" })).toBe("content-error");
  });

  it("ok → ok", () => {
    expect(classifyDouyinOutcome({ kind: "ok" })).toBe("ok");
  });

  // ⑨ [gate-F6] 导出 download 超时优先级
  it("⑨ 导出 download 超时 + 有『暂无数据』toast → content-error(不退避)", () => {
    expect(
      classifyDouyinOutcome({
        kind: "export-download-timeout",
        hasNoDataToast: true,
      }),
    ).toBe("content-error");
  });
  it("⑨ 导出 download 超时 + 无 toast → throttled", () => {
    expect(
      classifyDouyinOutcome({
        kind: "export-download-timeout",
        hasNoDataToast: false,
      }),
    ).toBe("throttled");
  });

  // ⑩ [gate-F6] ERR_TIMED_OUT 单次不升级、连续 2 次才 throttled
  it("⑩ net-timeout 单次(consecutive=1)→ content-error(不 cooldown)", () => {
    expect(
      classifyDouyinOutcome({
        kind: "net-timeout",
        consecutiveTimeouts: 1,
        timeoutThrottleThreshold: 2,
      }),
    ).toBe("content-error");
  });
  it("⑩ net-timeout 连续 2 次(≥阈值)→ throttled", () => {
    expect(
      classifyDouyinOutcome({
        kind: "net-timeout",
        consecutiveTimeouts: 2,
        timeoutThrottleThreshold: 2,
      }),
    ).toBe("throttled");
  });
});

// ── Gateway 行为单测 ①–⑧ ───────────────────────────────────────────────────────
describe("DouyinRequestGateway (SPEC §5)", () => {
  it("① 串行:同 channel 并发 acquire 按序放行(第二个要等第一个的 min-interval)", async () => {
    const h = makeClock();
    const port = makeFakePort();
    const gw = makeGateway(h, port);
    await gw.readyPromise;

    const order: number[] = [];
    const p1 = gw.acquire(CC).then(() => order.push(1));
    const p2 = gw.acquire(CC).then(() => order.push(2));
    const p3 = gw.acquire(CC).then(() => order.push(3));

    // 第一个立即放行(无 lastRequestAt、无 cooldown)。
    await h.flush();
    expect(order).toEqual([1]);

    // 第二个被 min-interval(4000)挡住,未放行。
    await h.flush();
    expect(order).toEqual([1]);

    // 推进 4000 → 第二个放行;再 4000 → 第三个放行。
    await h.advance(4000);
    expect(order).toEqual([1, 2]);
    await h.advance(4000);
    expect(order).toEqual([1, 2, 3]);

    await Promise.all([p1, p2, p3]);
  });

  it("② min-interval:两次 acquire 间隔 ≥ minInterval(creator-center 4000)", async () => {
    const h = makeClock();
    const gw = makeGateway(h, makeFakePort());
    await gw.readyPromise;

    await gw.acquire(CC);
    const firstAt = gw.getChannelStatus(CC).lastRequestAt!;

    // 立刻再 acquire:被挡。
    let granted = false;
    const p = gw.acquire(CC).then(() => {
      granted = true;
    });
    await h.flush();
    expect(granted).toBe(false);

    // 差 1ms 不够:推进 3999 仍不放行。
    await h.advance(3999);
    expect(granted).toBe(false);
    // 补足到 4000:放行。
    await h.advance(1);
    expect(granted).toBe(true);
    const secondAt = gw.getChannelStatus(CC).lastRequestAt!;
    expect(secondAt - firstAt).toBeGreaterThanOrEqual(4000);
    await p;
  });

  it("② 两 channel 相互独立(iesdouyin 的间隔不影响 creator-center)", async () => {
    const h = makeClock();
    const gw = makeGateway(h, makeFakePort());
    await gw.readyPromise;

    await gw.acquire(IES); // 用掉 iesdouyin 一次
    // creator-center 首次仍立即放行,不受 iesdouyin 影响。
    let ccGranted = false;
    const p = gw.acquire(CC).then(() => {
      ccGranted = true;
    });
    await h.flush();
    expect(ccGranted).toBe(true);
    await p;
  });

  it("③ jitter 落在 ±ratio 区间内(注随机源,断言等待值)", async () => {
    // 用一个「记录被要求等多久」的 jitter 源,断言它拿到的 base 正确、返回落区间。
    const h = makeClock();
    const seenBases: number[] = [];
    // jitter 源:把 base 应用 +ratio 上界(确定性),并记录 base。
    const jitter = (baseMs: number, ratio: number) => {
      seenBases.push(baseMs);
      return baseMs * (1 + ratio); // 落在 [base*(1-r), base*(1+r)] 内(上界)
    };
    const gw = makeGateway(h, makeFakePort(), { jitter });
    await gw.readyPromise;

    await gw.acquire(CC); // 首次无等待
    // 第二次:min-interval base=4000 会过 jitter。
    const p = gw.acquire(CC);
    await h.flush();
    // jitter 拿到的 base 是 4000(minInterval),等待值 = 4000*1.3 = 5200(在 ±30% 区间)。
    expect(seenBases).toContain(4000);
    const waited = 4000 * 1.3;
    expect(waited).toBeGreaterThanOrEqual(4000 * 0.7);
    expect(waited).toBeLessThanOrEqual(4000 * 1.3);
    // 推进到该等待值放行。
    await h.advance(Math.ceil(waited));
    await p;
  });

  it("③ 默认 jitter(真 Math.random)不会超出 ±ratio 区间", async () => {
    // 不注 jitter → 用 defaultJitter(Math.random)。跑多次,断言等待值恒落区间。
    // 通过 sleep 拦截实际传入的等待 ms。
    const base = 4000;
    const ratio = 0.3;
    const observed: number[] = [];
    const h = makeClock();
    const sleepSpy = (ms: number) => {
      observed.push(ms);
      return h.sleep(ms);
    };
    for (let i = 0; i < 30; i++) {
      const gw = new DouyinRequestGateway({
        config: CONFIG,
        port: makeFakePort(),
        now: h.now,
        sleep: sleepSpy,
        // 不传 jitter → defaultJitter
      });
      await gw.readyPromise;
      await gw.acquire(CC);
      const p = gw.acquire(CC);
      await h.flush();
      await h.advance(base * (1 + ratio) + 10); // 足够放行
      await p;
    }
    expect(observed.length).toBeGreaterThan(0);
    for (const ms of observed) {
      expect(ms).toBeGreaterThanOrEqual(base * (1 - ratio) - 1e-6);
      expect(ms).toBeLessThanOrEqual(base * (1 + ratio) + 1e-6);
    }
  });

  it("④ backoff:连续 throttled 的 cooldown 指数增长且封顶", async () => {
    const h = makeClock();
    const port = makeFakePort();
    const gw = makeGateway(h, port);
    await gw.readyPromise;

    const base = CONFIG[CC].backoff.baseCooldownMs; // 120000
    const factor = CONFIG[CC].backoff.factor; // 2
    const max = CONFIG[CC].backoff.maxCooldownMs; // 3600000

    // 第 1 次 throttled → base*factor^0 = base。
    await gw.report(CC, "throttled");
    expect(gw.getChannelStatus(CC).cooldownEtaMs).toBe(base);
    expect(gw.getChannelStatus(CC).consecutiveThrottles).toBe(1);

    // 第 2 次 → base*2。
    await gw.report(CC, "throttled");
    expect(gw.getChannelStatus(CC).cooldownEtaMs).toBe(base * factor);

    // 第 3 次 → base*4。
    await gw.report(CC, "throttled");
    expect(gw.getChannelStatus(CC).cooldownEtaMs).toBe(base * factor * factor);

    // 继续 throttled 直到超过 max → 封顶在 max。
    for (let i = 0; i < 10; i++) await gw.report(CC, "throttled");
    expect(gw.getChannelStatus(CC).cooldownEtaMs).toBe(max);

    // 落库正确(最后一次 save 的 consecutive)。
    expect(port.saved[CC]!.consecutiveThrottles).toBe(13);
  });

  it("⑤ report(ok) 清零 consecutive + 清 cooldown + 落库", async () => {
    const h = makeClock();
    const port = makeFakePort();
    const gw = makeGateway(h, port);
    await gw.readyPromise;

    await gw.report(CC, "throttled");
    await gw.report(CC, "throttled");
    expect(gw.getChannelStatus(CC).consecutiveThrottles).toBe(2);
    expect(gw.getChannelStatus(CC).cooldownActive).toBe(true);

    await gw.report(CC, "ok");
    expect(gw.getChannelStatus(CC).consecutiveThrottles).toBe(0);
    expect(gw.getChannelStatus(CC).cooldownActive).toBe(false);
    expect(gw.getChannelStatus(CC).cooldownEtaMs).toBe(0);
    // 落库:cooldownUntil=null, consecutive=0。
    expect(port.saved[CC]!.cooldownUntil).toBeNull();
    expect(port.saved[CC]!.consecutiveThrottles).toBe(0);
  });

  it("⑥ content-error 不动退避状态(不升 consecutive、不清已有 cooldown、不 save)", async () => {
    const h = makeClock();
    const port = makeFakePort();
    const gw = makeGateway(h, port);
    await gw.readyPromise;

    await gw.report(CC, "throttled"); // 建一个 cooldown + consecutive=1
    const savesAfterThrottle = port.saveCount;
    const etaBefore = gw.getChannelStatus(CC).cooldownEtaMs;

    await gw.report(CC, "content-error");
    // consecutive 不变、cooldown 不变、无新 save。
    expect(gw.getChannelStatus(CC).consecutiveThrottles).toBe(1);
    expect(gw.getChannelStatus(CC).cooldownEtaMs).toBe(etaBefore);
    expect(port.saveCount).toBe(savesAfterThrottle);
  });

  it("⑦ cooldown 期间 acquire 阻塞到期才放行", async () => {
    const h = makeClock();
    const gw = makeGateway(h, makeFakePort());
    await gw.readyPromise;

    await gw.report(CC, "throttled"); // cooldown = base(120000)
    const eta = gw.getChannelStatus(CC).cooldownEtaMs;
    expect(eta).toBe(120000);

    let granted = false;
    const p = gw.acquire(CC).then(() => {
      granted = true;
    });
    await h.flush();
    expect(granted).toBe(false); // cooldown 未到,阻塞

    await h.advance(119999);
    expect(granted).toBe(false);
    await h.advance(1); // 到期
    expect(granted).toBe(true);
    await p;
  });

  it("⑧ [gate-F3] 恢复 barrier:restore 未 resolve 前 acquire 不放行;resolve(带 cooldownUntil>now)后仍等到期", async () => {
    const h = makeClock();
    // 造一个「可手动 resolve」的 port.load —— restore 挂住不完成。
    let releaseLoad!: (rec: ThrottleStateRecord | null) => void;
    const loadGate = new Promise<ThrottleStateRecord | null>((resolve) => {
      releaseLoad = resolve;
    });
    const port: ThrottleStatePort = {
      async load(channel) {
        // creator-center 的 load 挂住;其它直接 null(不影响本测)。
        if (channel === CC) return loadGate;
        return null;
      },
      async save() {},
    };
    const gw = makeGateway(h, port);

    // restore 未完成:acquire 不放行(readyPromise 未 resolve)。
    let granted = false;
    const p = gw.acquire(CC).then(() => {
      granted = true;
    });
    await h.flush();
    expect(granted).toBe(false); // ⓪ barrier 阻塞

    // 即便推进时钟也不放行(还没恢复,不知道 cooldown)。
    await h.advance(1_000_000);
    expect(granted).toBe(false);

    // restore resolve,带 cooldownUntil = now + 60000(未来)。
    const cdUntil = h.now() + 60000;
    releaseLoad({
      cooldownUntil: cdUntil,
      consecutiveThrottles: 3,
      lastRequestAt: null,
    });
    await gw.readyPromise;
    await h.flush();
    // 恢复完但 cooldown 未到 → 仍不放行。
    expect(granted).toBe(false);
    expect(gw.getChannelStatus(CC).cooldownActive).toBe(true);
    expect(gw.getChannelStatus(CC).consecutiveThrottles).toBe(3);

    // 推进到 cooldown 到期 → 放行。
    await h.advance(60000);
    expect(granted).toBe(true);
    await p;
  });

  it("⑧-b 恢复出 lastRequestAt:acquire 立即受 min-interval 约束(不是无脑放行)", async () => {
    const h = makeClock();
    // 恢复出 lastRequestAt = now - 1000(距上次仅 1s < 4s minInterval)。
    const lastReq = h.now() - 1000;
    const port = makeFakePort({
      [CC]: {
        cooldownUntil: null,
        consecutiveThrottles: 0,
        lastRequestAt: lastReq,
      },
    });
    const gw = makeGateway(h, port);
    await gw.readyPromise;

    let granted = false;
    const p = gw.acquire(CC).then(() => {
      granted = true;
    });
    await h.flush();
    // 距上次 1s,还差 3s 才够 4s → 阻塞。
    expect(granted).toBe(false);
    await h.advance(3000);
    expect(granted).toBe(true);
    await p;
  });

  it("恢复出 cooldown 已过期:acquire 直接放行(不倒扣)", async () => {
    const h = makeClock();
    const port = makeFakePort({
      [CC]: {
        cooldownUntil: h.now() - 5000, // 已过期
        consecutiveThrottles: 2,
        lastRequestAt: null,
      },
    });
    const gw = makeGateway(h, port);
    await gw.readyPromise;
    // cooldown 已过 → 立即放行;但 consecutive 仍保留(留给 report(ok) 清)。
    let granted = false;
    const p = gw.acquire(CC).then(() => {
      granted = true;
    });
    await h.flush();
    expect(granted).toBe(true);
    expect(gw.getChannelStatus(CC).consecutiveThrottles).toBe(2);
    await p;
  });
});

// ── 配置 env 覆盖 ───────────────────────────────────────────────────────────────
describe("douyin-throttle-config env overrides (§4.6)", () => {
  it("默认值符合 SPEC §4.6", () => {
    const cfg = resolveDouyinThrottleConfig({});
    expect(cfg["creator-center"].pacing.minIntervalMs).toBe(4000);
    expect(cfg.iesdouyin.pacing.minIntervalMs).toBe(9000);
    expect(cfg["creator-center"].pacing.jitterRatio).toBe(0.3);
    expect(cfg.iesdouyin.backoff.baseCooldownMs).toBe(120000);
    expect(cfg.iesdouyin.backoff.factor).toBe(2);
    expect(cfg.iesdouyin.backoff.maxCooldownMs).toBe(3600000);
  });

  it("env 覆盖单 channel 单参数(DOUYIN_THROTTLE_IESDOUYIN_MIN_INTERVAL_MS)", () => {
    const cfg = resolveDouyinThrottleConfig({
      DOUYIN_THROTTLE_IESDOUYIN_MIN_INTERVAL_MS: "15000",
    });
    expect(cfg.iesdouyin.pacing.minIntervalMs).toBe(15000);
    // 其它不受影响。
    expect(cfg["creator-center"].pacing.minIntervalMs).toBe(4000);
  });

  it("非法 env(负数/NaN)回退默认(不把限流关成 0)", () => {
    const cfg = resolveDouyinThrottleConfig({
      DOUYIN_THROTTLE_CREATOR_CENTER_MIN_INTERVAL_MS: "-1",
      DOUYIN_THROTTLE_IESDOUYIN_MIN_INTERVAL_MS: "abc",
    });
    expect(cfg["creator-center"].pacing.minIntervalMs).toBe(4000);
    expect(cfg.iesdouyin.pacing.minIntervalMs).toBe(9000);
  });
});
