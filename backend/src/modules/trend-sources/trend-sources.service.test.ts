import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createTrendSourcesService,
  deriveSourceType,
  type TrendSourcesService,
} from "./trend-sources.service";
import {
  OwnershipError,
  ValidationError,
  AccountRequiredError,
} from "./trend-sources.errors";

// [T-235b] TrendSources service 单测(fake now/nextId, pglite db,照 benchmark.service.test 范式)——
// 信源 CRUD 可见性、URL 归一/类型派生、幂等 create、toggle/remove ownership 404-class、按号隔离。

const NOW = "2026-07-11T00:00:00.000Z";
const ctxA: RequestContext = { userId: "user-a", requestId: "r1", source: "user", accountId: "acc-a" };
const ctxB: RequestContext = { userId: "user-b", requestId: "r2", source: "user", accountId: "acc-b" };

function makeService(db: Db): TrendSourcesService {
  let seq = 0;
  return createTrendSourcesService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
  });
}

const PAGE = { page: 1, pageSize: 100 };

describe("trend-sources service", () => {
  let db: Db;
  let svc: TrendSourcesService;
  beforeEach(async () => {
    ({ db } = await createDb());
    svc = makeService(db);
  });

  it("create → list 可见;domain 派生、缺名兜底 domain、默认 web 型", async () => {
    const created = await svc.createSource(ctxA, {
      url: "https://www.36kr.com/hot-list/catalog",
      note: "科技热榜",
    });
    expect(created.domain).toBe("www.36kr.com");
    expect(created.name).toBe("www.36kr.com"); // 缺名兜底 domain
    expect(created.sourceType).toBe("web");
    expect(created.enabled).toBe(true);
    expect(created.accountId).toBe("acc-a");
    const { rows, total } = await svc.listSources(ctxA, PAGE);
    expect(total).toBe(1);
    expect(rows[0]!.note).toBe("科技热榜");
  });

  it("feed 特征 URL 自动派生 rss 型;显式 sourceType 优先", async () => {
    const rss = await svc.createSource(ctxA, {
      url: "https://sspai.com/feed",
      name: "少数派",
    });
    expect(rss.sourceType).toBe("rss");
    const forced = await svc.createSource(ctxA, {
      url: "https://example.com/rss.xml",
      sourceType: "web", // 显式覆盖派生
    });
    expect(forced.sourceType).toBe("web");
  });

  it("deriveSourceType 纯函数:xml/rss/atom/feed 路径 → rss,其余 → web", () => {
    expect(deriveSourceType("https://a.com/feed")).toBe("rss");
    expect(deriveSourceType("https://a.com/blog/atom/")).toBe("rss");
    expect(deriveSourceType("https://a.com/index.xml")).toBe("rss");
    expect(deriveSourceType("https://a.com/hot")).toBe("web");
    expect(deriveSourceType("https://a.com/rssreader-review")).toBe("web"); // 非整段 rss 不误判
  });

  it("空/非 http(s) URL → ValidationError", async () => {
    await expect(svc.createSource(ctxA, { url: "  " })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      svc.createSource(ctxA, { url: "ftp://example.com/x" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("幂等:同 URL 重复登记 → 更新不新建", async () => {
    await svc.createSource(ctxA, { url: "https://x.com/hot", name: "旧名" });
    const second = await svc.createSource(ctxA, {
      url: "https://x.com/hot",
      name: "新名",
    });
    expect(second.name).toBe("新名");
    const { total } = await svc.listSources(ctxA, PAGE);
    expect(total).toBe(1);
  });

  it("toggle enabled 生效,listEnabledSources 反映", async () => {
    const s = await svc.createSource(ctxA, { url: "https://t.com/hot" });
    expect((await svc.listEnabledSources(ctxA)).length).toBe(1);
    const toggled = await svc.toggleSource(ctxA, s.id, false);
    expect(toggled.enabled).toBe(false);
    expect((await svc.listEnabledSources(ctxA)).length).toBe(0);
  });

  it("跨用户 toggle/remove → OwnershipError(404-class)", async () => {
    const s = await svc.createSource(ctxA, { url: "https://own.com/a" });
    await expect(svc.toggleSource(ctxB, s.id, false)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(svc.removeSource(ctxB, s.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("remove 删除后 list 不再可见;按号隔离 ctxB 看不到 ctxA 的源", async () => {
    const s = await svc.createSource(ctxA, { url: "https://d.com/hot" });
    expect((await svc.listSources(ctxB, PAGE)).total).toBe(0);
    await svc.removeSource(ctxA, s.id);
    expect((await svc.listSources(ctxA, PAGE)).total).toBe(0);
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

    it("同 user 两个号登记同一 URL → 各自成行互不改写;同号重复登记仍幂等命中 _v2 键", async () => {
      const s1 = await svc.createSource(ctxA1, { url: "https://x.com/hot", name: "号1名" });
      const s2 = await svc.createSource(ctxA2, { url: "https://x.com/hot", name: "号2名" });
      expect(s2.id).not.toBe(s1.id); // 旧 (user, url) 键下这里会 upsert 改写号1
      // 同号重复 → upsert 更新(不新建),证明 ON CONFLICT 真命中 _v2 索引。
      const s1again = await svc.createSource(ctxA1, { url: "https://x.com/hot", name: "号1新名" });
      expect(s1again.id).toBe(s1.id);
      expect(s1again.name).toBe("号1新名");
      // 号2 未被号1 的重复登记改写,各号各见一条。
      const { rows: rows2 } = await svc.listSources(ctxA2, PAGE);
      expect(rows2).toHaveLength(1);
      expect(rows2[0]!.name).toBe("号2名");
      expect((await svc.listSources(ctxA1, PAGE)).total).toBe(1);
    });

    it("同 user 跨号 toggle/remove → OwnershipError(号一致性门,§4.5)", async () => {
      const s1 = await svc.createSource(ctxA1, { url: "https://gate.com/a" });
      await expect(svc.toggleSource(ctxA2, s1.id, false)).rejects.toBeInstanceOf(
        OwnershipError,
      );
      await expect(svc.removeSource(ctxA2, s1.id)).rejects.toBeInstanceOf(
        OwnershipError,
      );
    });

    it("未选号 → 读写均 AccountRequiredError(引导态,禁读写)", async () => {
      await expect(
        svc.createSource(noAcct, { url: "https://no.com/a" }),
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
