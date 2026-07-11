import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import { createPlatformAccountService } from "@creatoros/backend/modules/platform-account";
import type { PlatformAccountService } from "@creatoros/backend/modules/platform-account";
import type { RequestContext } from "@creatoros/contract";

import {
  ensureDouyinAccountUpsert,
  mergeDouyinPlaceholders,
} from "@/server/persistence-client";

// [T-136§D-bind⑤] 扫码 upsert 去重 + 占位号合并单测(against 真实 platformAccountService)。
// 用户报障:扫一次冒俩占位号(migration 0025 seed 的「待完善」+ loginDouyin ensure 的「我的抖音」);
// 抓到真实身份后 refresh 只回填一个,另一个残留 → 账号页两行占位。修正后:
//   - ensureDouyinAccountUpsert(扫码):传占位 handle 时复用既有占位,不冒第二个;
//   - mergeDouyinPlaceholders(refresh 抓到真实昵称):把所有占位合并为一行真实号。
// 关键可见结果:扫完只剩一行真实号(active),不是两行占位。

const NOW = "2026-07-06T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };

function makeService(db: Db): PlatformAccountService {
  let seq = 0;
  return createPlatformAccountService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
  });
}

async function activeHandles(
  svc: PlatformAccountService,
): Promise<string[]> {
  const { rows } = await svc.listAccounts(ctx, {
    platform: "douyin",
    limit: 100,
    offset: 0,
  });
  return rows
    .filter((r) => r.status === "active")
    .map((r) => r.accountHandle)
    .sort();
}

describe("douyin 扫码 upsert 去重 + 占位号合并", () => {
  let db: Db;
  let svc: PlatformAccountService;
  beforeEach(async () => {
    ({ db } = await createDb());
    svc = makeService(db);
  });

  it("ensure:无号 → 建一个占位「我的抖音」", async () => {
    const { id } = await ensureDouyinAccountUpsert(svc, ctx, {
      platform: "douyin",
      handle: "我的抖音",
    });
    expect(id).toBeTruthy();
    expect(await activeHandles(svc)).toEqual(["我的抖音"]);
  });

  it("ensure:已有「待完善」占位 → 复用它,不冒第二个占位(核心 bug 修复)", async () => {
    // 模拟 migration 0025 seed 的默认占位号。
    const seeded = await svc.createAccount(ctx, {
      platform: "douyin",
      accountHandle: "待完善",
    });
    // loginDouyin 用占位 handle「我的抖音」ensure → 应复用「待完善」,不新建。
    const { id } = await ensureDouyinAccountUpsert(svc, ctx, {
      platform: "douyin",
      handle: "我的抖音",
    });
    expect(id).toBe(seeded.id);
    // 仍只有一行占位(没冒俩)。
    expect(await activeHandles(svc)).toEqual(["待完善"]);
  });

  it("ensure:精确 handle(真实昵称号)已存在 → 幂等复用", async () => {
    const real = await svc.createAccount(ctx, {
      platform: "douyin",
      accountHandle: "@真实达人",
    });
    const { id } = await ensureDouyinAccountUpsert(svc, ctx, {
      platform: "douyin",
      handle: "@真实达人",
    });
    expect(id).toBe(real.id);
    expect(await activeHandles(svc)).toEqual(["@真实达人"]);
  });

  it("[T-201a] ensure:号已是真实昵称(非占位)+ 再用占位 handle 绑 → 复用同号,不冒重号(锚点漂移根因/用户 bug 现场)", async () => {
    // 用户 bug 现场:首绑建「我的抖音」→ updateAccountHandle 改成真实昵称「月明水清深」→
    //   再走 loginDouyin(仍传占位 handle「我的抖音」)。旧写法只找「handle 仍是占位」的 active 号,
    //   找不到 → 冒第二个号 → 采集/存储锚点漂移。修后:复用任一既有 active 号(单号现实)。
    const real = await svc.createAccount(ctx, {
      platform: "douyin",
      accountHandle: "月明水清深", // 已被 updateAccountHandle 改成真实昵称(非占位)
    });
    const { id } = await ensureDouyinAccountUpsert(svc, ctx, {
      platform: "douyin",
      handle: "我的抖音", // loginDouyin 仍传占位 handle
    });
    expect(id).toBe(real.id); // 复用,不新建
    // 仍只有一行(没冒第二个号)。
    expect(await activeHandles(svc)).toEqual(["月明水清深"]);
  });

  it("merge:两个占位号(待完善 + 我的抖音)→ 抓到真实昵称后合并为一行真实号", async () => {
    // 复现 bug 现场:两条占位号并存。
    await svc.createAccount(ctx, { platform: "douyin", accountHandle: "待完善" });
    await svc.createAccount(ctx, {
      platform: "douyin",
      accountHandle: "我的抖音",
    });
    // 现场:两条占位号并存(bug 复现)。activeHandles 已 sort。
    expect(await activeHandles(svc)).toEqual(["我的抖音", "待完善"].sort());
    // refresh 抓到真实昵称 → 合并。
    await mergeDouyinPlaceholders(svc, ctx, {
      platform: "douyin",
      handle: "@抖音真实昵称",
    });
    // 关键可见结果:只剩一行真实号(active),两个占位合并/archive。
    expect(await activeHandles(svc)).toEqual(["@抖音真实昵称"]);
  });

  it("merge:真实号已存在 + 残留占位 → archive 占位,只留真实号一行(幂等)", async () => {
    await svc.createAccount(ctx, {
      platform: "douyin",
      accountHandle: "@抖音真实昵称",
    });
    await svc.createAccount(ctx, {
      platform: "douyin",
      accountHandle: "我的抖音",
    });
    await mergeDouyinPlaceholders(svc, ctx, {
      platform: "douyin",
      handle: "@抖音真实昵称",
    });
    expect(await activeHandles(svc)).toEqual(["@抖音真实昵称"]);
    // 再跑一次幂等:仍只剩真实号一行。
    await mergeDouyinPlaceholders(svc, ctx, {
      platform: "douyin",
      handle: "@抖音真实昵称",
    });
    expect(await activeHandles(svc)).toEqual(["@抖音真实昵称"]);
  });

  it("merge:无占位可合并 → no-op(不误建/不误删)", async () => {
    await svc.createAccount(ctx, {
      platform: "douyin",
      accountHandle: "@已经是真实号",
    });
    await mergeDouyinPlaceholders(svc, ctx, {
      platform: "douyin",
      handle: "@另一个真实号",
    });
    // 既有真实号不动,也不建新号。
    expect(await activeHandles(svc)).toEqual(["@已经是真实号"]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // [T-201b] 身份键解耦(external_account_id / sec_uid):昵称漂移不再冒重号。
  // ───────────────────────────────────────────────────────────────────────────

  async function findAccount(
    svc: PlatformAccountService,
    id: string,
  ) {
    const { rows } = await svc.listAccounts(ctx, {
      platform: "douyin",
      limit: 100,
      offset: 0,
    });
    return rows.find((r) => r.id === id)!;
  }

  it("[T-201b] ensure:按 external_account_id(sec_uid)幂等复用 —— 昵称已改真实值,再绑仍复用同号", async () => {
    // 号早已建、handle 是真实昵称、身份键=sec_uid。
    const real = await svc.createAccount(ctx, {
      platform: "douyin",
      accountHandle: "月明水清深",
      externalAccountId: "sec-uid-A",
    });
    // 再次绑定:传占位 handle 但带上采集到的 sec_uid → 按身份键复用,绝不冒第二个号。
    const { id } = await ensureDouyinAccountUpsert(svc, ctx, {
      platform: "douyin",
      handle: "我的抖音",
      externalAccountId: "sec-uid-A",
    });
    expect(id).toBe(real.id);
    expect(await activeHandles(svc)).toEqual(["月明水清深"]); // 仍一行
  });

  it("[T-201b] merge:昵称回填只改 display,且一次性回填身份键 sec_uid(永不覆盖已有)", async () => {
    // 占位号,身份键为空。
    const ph = await svc.createAccount(ctx, {
      platform: "douyin",
      accountHandle: "我的抖音",
    });
    expect((await findAccount(svc, ph.id)).externalAccountId).toBeNull();
    // 采集抓到真实昵称 + sec_uid → 回填 display + 身份键。
    await mergeDouyinPlaceholders(svc, ctx, {
      platform: "douyin",
      handle: "@真实昵称",
      externalAccountId: "sec-uid-B",
    });
    const after = await findAccount(svc, ph.id);
    expect(after.accountHandle).toBe("@真实昵称"); // display 改了
    expect(after.externalAccountId).toBe("sec-uid-B"); // 身份键落地
    // 号已非占位、身份键已有 → 再次采集(即便平台返回不同临时 sec_uid)身份键**不被覆盖**(永不改身份锚)。
    //   走 realExisting 分支(handle 命中当前真实名),backfill 因 current 非空跳过。
    await mergeDouyinPlaceholders(svc, ctx, {
      platform: "douyin",
      handle: "@真实昵称",
      externalAccountId: "sec-uid-DIFFERENT",
    });
    const after2 = await findAccount(svc, ph.id);
    expect(after2.externalAccountId).toBe("sec-uid-B"); // 身份键纹丝不动
    expect(after2.id).toBe(ph.id); // id 锚点不变
    expect(await activeHandles(svc)).toEqual(["@真实昵称"]); // 始终一行
  });

  it("扫码全链路模拟:ensure(建占位)→ ensure(复用不冒俩)→ merge(回填真实名)= 一行真实号", async () => {
    // migration seed 占位。
    await svc.createAccount(ctx, { platform: "douyin", accountHandle: "待完善" });
    // 首次扫码 loginDouyin ensure(占位 handle)→ 复用「待完善」。
    await ensureDouyinAccountUpsert(svc, ctx, {
      platform: "douyin",
      handle: "我的抖音",
    });
    expect(await activeHandles(svc)).toEqual(["待完善"]); // 没冒第二个占位
    // refresh 抓到真实身份 → 合并回填。
    await mergeDouyinPlaceholders(svc, ctx, {
      platform: "douyin",
      handle: "@真实抖音号",
    });
    expect(await activeHandles(svc)).toEqual(["@真实抖音号"]); // 只剩一行真实号
  });
});
