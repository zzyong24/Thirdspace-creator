import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import { createPgliteThrottleStatePort } from "./douyin-throttle-state-port.pglite";
import { DouyinRequestGateway } from "./douyin-request-gateway";
import { DOUYIN_THROTTLE_DEFAULTS } from "./douyin-throttle-config";

// PGlite 持久化集成测(T-038a / SPEC §5「持久化集成测」)。真 PGlite(createDb 跑全部
// 迁移含 0012_douyin_throttle_state)——验证:
//   1. port.save 落表、port.load 读回(epoch ms ↔ ISO TEXT 边界转换无损)。
//   2. [gate-F3] 端到端:report(throttled) 落表 → 新建 gateway 从表 restore 出 cooldown,
//      恢复完成后 acquire 仍受该 cooldown 阻塞(证「重启后不撞风控」的持久面真跑通)。

const CC = "creator-center" as const;

describe("PGlite ThrottleStatePort (integration, real pglite + 迁移 0012)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb()); // 内存 PGlite,跑 backend/drizzle/*(含 0012)
  });

  it("save → load 往返(cooldownUntil / consecutive / lastRequestAt 无损)", async () => {
    const port = createPgliteThrottleStatePort(db);
    // load 空表 → null。
    expect(await port.load(CC)).toBeNull();

    const cooldownUntil = 1_800_000_000_000; // 固定 epoch ms
    const lastRequestAt = 1_700_000_000_000;
    await port.save(CC, {
      cooldownUntil,
      consecutiveThrottles: 3,
      lastRequestAt,
    });

    const rec = await port.load(CC);
    expect(rec).not.toBeNull();
    expect(rec!.cooldownUntil).toBe(cooldownUntil);
    expect(rec!.consecutiveThrottles).toBe(3);
    expect(rec!.lastRequestAt).toBe(lastRequestAt);
  });

  it("save 二次 upsert(channel PK):同 channel 覆盖不产生第二行", async () => {
    const port = createPgliteThrottleStatePort(db);
    await port.save(CC, {
      cooldownUntil: 111,
      consecutiveThrottles: 1,
      lastRequestAt: null,
    });
    await port.save(CC, {
      cooldownUntil: null,
      consecutiveThrottles: 0,
      lastRequestAt: 222,
    });
    const rec = await port.load(CC);
    expect(rec!.consecutiveThrottles).toBe(0);
    expect(rec!.cooldownUntil).toBeNull();
    expect(rec!.lastRequestAt).toBe(222);
  });

  it("[gate-F3] report(throttled) 落表 → 新 gateway 从表 restore 出 cooldown 并阻塞 acquire", async () => {
    const port = createPgliteThrottleStatePort(db);
    // 固定时钟(gateway A)——report(throttled) 会写 cooldownUntil = now + base。
    const T0 = 1_900_000_000_000;
    const base = DOUYIN_THROTTLE_DEFAULTS[CC].backoff.baseCooldownMs; // 120000

    const gwA = new DouyinRequestGateway({
      config: DOUYIN_THROTTLE_DEFAULTS,
      port,
      now: () => T0,
      sleep: async () => {},
    });
    await gwA.readyPromise;
    await gwA.report(CC, "throttled");

    // 表里应有 cooldownUntil = T0 + base。
    const persisted = await port.load(CC);
    expect(persisted!.cooldownUntil).toBe(T0 + base);
    expect(persisted!.consecutiveThrottles).toBe(1);

    // 新建 gateway B(模拟重启),同一张表 restore。用一个「距到期还差 1000ms」的时钟:
    // now = T0 + base - 1000 → cooldown 未到,acquire 必须阻塞。
    let tB = T0 + base - 1000;
    let slept = 0;
    const gwB = new DouyinRequestGateway({
      config: DOUYIN_THROTTLE_DEFAULTS,
      port,
      now: () => tB,
      sleep: async (ms: number) => {
        slept += ms;
        tB += ms; // 假 sleep 推进 B 的时钟
      },
      jitter: (b) => b, // 不抖动,精确
    });
    await gwB.readyPromise;

    // 恢复后 cooldown 应仍激活(consecutive=1)。
    expect(gwB.getChannelStatus(CC).cooldownActive).toBe(true);
    expect(gwB.getChannelStatus(CC).consecutiveThrottles).toBe(1);

    // acquire:会 sleep 到 cooldown 到期(1000ms)才放行——证「重启后第一拨不撞风控」。
    await gwB.acquire(CC);
    expect(slept).toBeGreaterThanOrEqual(1000);
    // 放行后 cooldown 清、lastRequestAt 记上。
    expect(gwB.getChannelStatus(CC).cooldownActive).toBe(false);
    expect(gwB.getChannelStatus(CC).lastRequestAt).not.toBeNull();
  });
});
