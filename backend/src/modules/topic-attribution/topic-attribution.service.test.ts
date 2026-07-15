import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createTopicAttributionService,
  type TopicAttributionService,
} from "./topic-attribution.service";
import { AccountRequiredError } from "./topic-attribution.errors";

// [T-235d] TopicAttribution service 单测(fake now/nextId, pglite db,照 trend-sources 范式)——
// 落库/读回、幂等锚(同 publication upsert 覆盖更新不重复行)、hasAttribution、
// publicationId 过滤、user/account 隔离。迁移 0036 建表(createDb 跑齐版本化迁移即验)。

const NOW = "2026-07-11T00:00:00.000Z";
const ctxA: RequestContext = { userId: "user-a", requestId: "r1", source: "user", accountId: "acc-a" };
const ctxB: RequestContext = { userId: "user-b", requestId: "r2", source: "user", accountId: "acc-b" };

function makeService(db: Db): TopicAttributionService {
  let seq = 0;
  return createTopicAttributionService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
  });
}

const PAGE = { page: 1, pageSize: 100 };

const BASE_INPUT = {
  publicationId: "pub-1",
  projectId: "proj-1",
  performanceTier: "viral",
  baselineRatio: 3.2,
  topicType: "教程",
  hookType: "具体数字",
  structureFormula: "三步教程",
  whyWorked: "开头「3 个提示词技巧」给了数字承诺",
  whyFailed: "",
  reusableFormula: "数字承诺 + 三步拆解",
  raw: { tierRatio: 3.2 },
};

describe("topic-attribution service", () => {
  let db: Db;
  let svc: TopicAttributionService;
  beforeEach(async () => {
    ({ db } = await createDb());
    svc = makeService(db);
  });

  it("saveAttribution → list 读回(枚举字段/分层/raw 溯源完整);accountId 从 ctx stamp", async () => {
    const saved = await svc.saveAttribution(ctxA, BASE_INPUT);
    expect(saved.id).toBe("tattr-1");
    expect(saved.accountId).toBe("acc-a");
    const { rows, total } = await svc.listAttributions(ctxA, PAGE);
    expect(total).toBe(1);
    expect(rows[0]!.topicType).toBe("教程");
    expect(rows[0]!.performanceTier).toBe("viral");
    expect(rows[0]!.baselineRatio).toBe(3.2);
    expect(rows[0]!.whyWorked).toContain("3 个提示词技巧");
    expect(rows[0]!.raw).toEqual({ tierRatio: 3.2 });
  });

  it("幂等锚:同 (user, publication) 重跑 → 覆盖更新,不重复行(id 保留)", async () => {
    const first = await svc.saveAttribution(ctxA, BASE_INPUT);
    const again = await svc.saveAttribution(ctxA, {
      ...BASE_INPUT,
      performanceTier: "normal",
      topicType: "观点",
    });
    expect(again.id).toBe(first.id); // upsert 保留原行 id
    const { rows, total } = await svc.listAttributions(ctxA, PAGE);
    expect(total).toBe(1);
    expect(rows[0]!.topicType).toBe("观点"); // 覆盖更新生效
    expect(rows[0]!.performanceTier).toBe("normal");
  });

  it("hasAttribution:落库后 true,未落库/他人作品 false", async () => {
    expect(await svc.hasAttribution(ctxA, "pub-1")).toBe(false);
    await svc.saveAttribution(ctxA, BASE_INPUT);
    expect(await svc.hasAttribution(ctxA, "pub-1")).toBe(true);
    // user 隔离:B 看不到 A 的归因锚。
    expect(await svc.hasAttribution(ctxB, "pub-1")).toBe(false);
  });

  it("list 按 publicationId 过滤;user/account 隔离", async () => {
    await svc.saveAttribution(ctxA, BASE_INPUT);
    await svc.saveAttribution(ctxA, {
      ...BASE_INPUT,
      publicationId: "pub-2",
      topicType: "故事",
    });
    const filtered = await svc.listAttributions(ctxA, {
      ...PAGE,
      publicationId: "pub-2",
    });
    expect(filtered.total).toBe(1);
    expect(filtered.rows[0]!.topicType).toBe("故事");
    // 跨用户不可见。
    const other = await svc.listAttributions(ctxB, PAGE);
    expect(other.total).toBe(0);
  });

  // ── [T-332 S2] 账号全域隔离:同 user 双号隔离 + 未选号引导态 ──
  describe("账号隔离与未选号 (T-332 S2)", () => {
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

    it("同 user 双号:list/hasAttribution 各自 scoped(strict,跨号诚实 false/空)", async () => {
      await svc.saveAttribution(ctxA1, { ...BASE_INPUT, publicationId: "pub-a1" });
      // 号2 视图看不到号1 的归因(strict)。
      expect((await svc.listAttributions(ctxA2, PAGE)).total).toBe(0);
      expect(await svc.hasAttribution(ctxA2, "pub-a1")).toBe(false);
      // 号1 自己可见。
      expect((await svc.listAttributions(ctxA1, PAGE)).total).toBe(1);
      expect(await svc.hasAttribution(ctxA1, "pub-a1")).toBe(true);
    });

    it("accountId 从 ctx stamp;同号重跑 upsert 幂等((user, publication) 键保持,SPEC §3.1)", async () => {
      const first = await svc.saveAttribution(ctxA1, { ...BASE_INPUT, publicationId: "pub-x" });
      expect(first.accountId).toBe("acct-1");
      const again = await svc.saveAttribution(ctxA1, {
        ...BASE_INPUT,
        publicationId: "pub-x",
        topicType: "观点",
      });
      expect(again.id).toBe(first.id); // upsert 命中,不重复行
      expect((await svc.listAttributions(ctxA1, PAGE)).total).toBe(1);
    });

    it("未选号 → 读写均 AccountRequiredError(引导态,禁读写)", async () => {
      await expect(svc.saveAttribution(noAcct, BASE_INPUT)).rejects.toBeInstanceOf(
        AccountRequiredError,
      );
      await expect(svc.listAttributions(noAcct, PAGE)).rejects.toBeInstanceOf(
        AccountRequiredError,
      );
      await expect(svc.hasAttribution(noAcct, "pub-1")).rejects.toBeInstanceOf(
        AccountRequiredError,
      );
    });
  });
});
