import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createBenchmarkService, type BenchmarkService } from "./benchmark.service";
import {
  OwnershipError,
  ValidationError,
  AccountRequiredError,
} from "./benchmark.errors";

// [T-212a] Benchmark service 单测（fake now/nextId, pglite db）——对标源 CRUD 可见性、
// 幂等 create、toggle/remove ownership 404-class、按号隔离、recordWork 幂等落库。

const NOW = "2026-07-11T00:00:00.000Z";
const ctxA: RequestContext = { userId: "user-a", requestId: "r1", source: "user", accountId: "acc-a" };
const ctxB: RequestContext = { userId: "user-b", requestId: "r2", source: "user", accountId: "acc-b" };

function makeService(db: Db): BenchmarkService {
  let seq = 0;
  return createBenchmarkService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
  });
}

const PAGE = { page: 1, pageSize: 100 };

describe("benchmark service", () => {
  let db: Db;
  let svc: BenchmarkService;
  beforeEach(async () => {
    ({ db } = await createDb());
    svc = makeService(db);
  });

  it("create → list 可见,字段回填", async () => {
    const created = await svc.createSource(ctxA, {
      externalAccountId: "sec-abc",
      nickname: "对标号",
      homeUrl: "https://douyin.com/user/sec-abc",
      note: "备注",
    });
    expect(created.externalAccountId).toBe("sec-abc");
    expect(created.enabled).toBe(true);
    expect(created.accountId).toBe("acc-a");
    const { rows, total } = await svc.listSources(ctxA, PAGE);
    expect(total).toBe(1);
    expect(rows[0]!.nickname).toBe("对标号");
  });

  it("空 sec_uid → ValidationError", async () => {
    await expect(
      svc.createSource(ctxA, { externalAccountId: "  " }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("幂等:同 sec_uid 重复登记 → 更新不新建", async () => {
    await svc.createSource(ctxA, { externalAccountId: "sec-x", nickname: "旧名" });
    const second = await svc.createSource(ctxA, {
      externalAccountId: "sec-x",
      nickname: "新名",
    });
    expect(second.nickname).toBe("新名");
    const { total } = await svc.listSources(ctxA, PAGE);
    expect(total).toBe(1);
  });

  it("toggle enabled 生效,listEnabledSources 反映", async () => {
    const s = await svc.createSource(ctxA, { externalAccountId: "sec-t" });
    expect((await svc.listEnabledSources(ctxA)).length).toBe(1);
    const toggled = await svc.toggleSource(ctxA, s.id, false);
    expect(toggled.enabled).toBe(false);
    expect((await svc.listEnabledSources(ctxA)).length).toBe(0);
  });

  it("跨用户 toggle/remove → OwnershipError(404-class)", async () => {
    const s = await svc.createSource(ctxA, { externalAccountId: "sec-own" });
    await expect(svc.toggleSource(ctxB, s.id, false)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(svc.removeSource(ctxB, s.id)).rejects.toBeInstanceOf(OwnershipError);
  });

  it("remove 删除后 list 不再可见", async () => {
    const s = await svc.createSource(ctxA, { externalAccountId: "sec-del" });
    await svc.removeSource(ctxA, s.id);
    const { total } = await svc.listSources(ctxA, PAGE);
    expect(total).toBe(0);
  });

  it("按号隔离:ctxA 的源 ctxB 看不到", async () => {
    await svc.createSource(ctxA, { externalAccountId: "sec-a-only" });
    const { total } = await svc.listSources(ctxB, PAGE);
    expect(total).toBe(0);
  });

  it("recordWork 幂等:同 aweme_id 第二次为 update", async () => {
    const s = await svc.createSource(ctxA, { externalAccountId: "sec-w" });
    const base = {
      sourceId: s.id,
      sourceExternalAccountId: "sec-w",
      awemeId: "aw-1",
      diggCount: 12345,
      isViral: true,
      viralMultiple: 4.2,
      capturedAt: NOW,
    };
    const first = await svc.recordWork(ctxA, base);
    expect(first.inserted).toBe(true);
    const second = await svc.recordWork(ctxA, { ...base, diggCount: 22222 });
    expect(second.inserted).toBe(false);
  });

  // ── [T-332 S2] 账号全域隔离:_v2 唯一键回归 + 未选号引导态 ──
  describe("账号维度唯一键与未选号 (T-332 S2)", () => {
    const ctxA1: RequestContext = {
      userId: "user-a",
      requestId: "ra1",
      source: "user",
      accountId: "acct-1",
    };
    const ctxA2: RequestContext = {
      userId: "user-a",
      requestId: "ra2",
      source: "user",
      accountId: "acct-2",
    };
    const noAcct: RequestContext = { userId: "user-a", requestId: "rn", source: "user" };

    it("同 user 两个号对标同一博主(sec_uid)→ 各自成行互不改写;同号重复登记仍幂等命中 _v2 键", async () => {
      const s1 = await svc.createSource(ctxA1, { externalAccountId: "sec-dup", nickname: "号1名" });
      const s2 = await svc.createSource(ctxA2, { externalAccountId: "sec-dup", nickname: "号2名" });
      expect(s2.id).not.toBe(s1.id); // 旧 (user, platform, sec_uid) 键下这里会 upsert 改写号1
      // 同号重复 → upsert 更新(不新建),证明 ON CONFLICT 真命中 _v2 索引。
      const s1again = await svc.createSource(ctxA1, { externalAccountId: "sec-dup", nickname: "号1新名" });
      expect(s1again.id).toBe(s1.id);
      expect(s1again.nickname).toBe("号1新名");
      // 号2 未被号1 的重复登记改写。
      const { rows: rows2 } = await svc.listSources(ctxA2, PAGE);
      expect(rows2).toHaveLength(1);
      expect(rows2[0]!.nickname).toBe("号2名");
    });

    it("两个号各自采同一 aweme → 各自成行;同号重跑为 update(_v2 upsert 回归)", async () => {
      const s1 = await svc.createSource(ctxA1, { externalAccountId: "sec-w1" });
      const s2 = await svc.createSource(ctxA2, { externalAccountId: "sec-w2" });
      const base = (sourceId: string) => ({
        sourceId,
        sourceExternalAccountId: "sec-w1",
        awemeId: "aw-same",
        diggCount: 100,
        capturedAt: NOW,
      });
      expect((await svc.recordWork(ctxA1, base(s1.id))).inserted).toBe(true);
      // 号2 同 aweme → 新行(旧 user 级键下 inserted=false 且会改写号1 的统计)。
      expect((await svc.recordWork(ctxA2, base(s2.id))).inserted).toBe(true);
      // 同号重跑 → 幂等 update。
      expect((await svc.recordWork(ctxA1, base(s1.id))).inserted).toBe(false);
    });

    it("同 user 跨号 toggle/remove → OwnershipError(号一致性门,§4.5)", async () => {
      const s1 = await svc.createSource(ctxA1, { externalAccountId: "sec-gate" });
      await expect(svc.toggleSource(ctxA2, s1.id, false)).rejects.toBeInstanceOf(
        OwnershipError,
      );
      await expect(svc.removeSource(ctxA2, s1.id)).rejects.toBeInstanceOf(
        OwnershipError,
      );
    });

    it("未选号 → 读写均 AccountRequiredError(引导态,禁读写)", async () => {
      await expect(
        svc.createSource(noAcct, { externalAccountId: "sec-x" }),
      ).rejects.toBeInstanceOf(AccountRequiredError);
      await expect(svc.listSources(noAcct, PAGE)).rejects.toBeInstanceOf(
        AccountRequiredError,
      );
      await expect(svc.listEnabledSources(noAcct)).rejects.toBeInstanceOf(
        AccountRequiredError,
      );
    });
  });
});
