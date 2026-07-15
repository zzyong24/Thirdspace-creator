import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createPublishingRepository,
  type PublishingRepository,
} from "./publishing.repository";
import { createPublishingService, type PublishingService } from "./publishing.service";
import { createMockPublisher } from "./platform-publisher";
import { bootstrapDouyinCollectionJobs } from "../ai-runtime/collection-bootstrap";

// [T-331] 绑定 claim 收敛回归(真机数据污染根因)——pglite 真库 + 真 publishing repo/service +
//   collection-bootstrap 编排,模拟组合根接线(persistence-client 的 claimOrphans →
//   publishingService.claimOrphanPublications)。
//
// 背景:T-200 的 claimOrphans 在绑定成功后**无条件**把该 user 全部 account_id IS NULL 的
//   publications 认领给触发绑定的号。用户绑第二个抖音号时,旧号(如「月明」)时代落的 NULL 存量
//   (属谁未知)被整批错认给新号 → 旧号按号门(当前号 OR NULL)看不见这批作品:catalog 缩水、
//   定时明细任务匹不上、比率指标永远「待采集」。
// 修法:收敛门 hasOtherActiveDouyinAccount —— 首绑(无其它 active 抖音号)claim 照旧;
//   二绑及以后零 claim(NULL 留 NULL,lenient 门继续可见)。

const USER = "user-t331";
const NOW = "2026-07-15T00:00:00.000Z";
const ACCT_OLD = "acct-old"; // 旧号(月明)
const ACCT_NEW = "acct-new"; // 新绑的第二个号

function repoDeps(userId: string, accountId: string | null, tag: string) {
  const counters = new Map<string, number>();
  return {
    now: () => NOW,
    // 按 tag 命名空间隔离 id,同库多 repo 不撞主键。
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${tag}-${n}`;
    },
    userId,
    accountId,
  };
}

function ctxFor(accountId: string | null): RequestContext {
  return {
    userId: USER,
    requestId: `req-${accountId ?? "none"}`,
    source: "ingestion",
    accountId,
  };
}

/** 组合根同款 bootstrap 接线(job 端口用最小 fake;claim 走真 publishing service)。 */
function bootstrapDeps(
  service: PublishingService,
  opts: { hasOtherActive: boolean },
) {
  let claimCalls = 0;
  let seq = 0;
  return {
    deps: {
      listJobsBySourceKind: async () => [],
      createJob: async () => ({ id: `job-${++seq}` }),
      trigger: async () => {},
      claimOrphans: async (c: RequestContext) => {
        claimCalls += 1;
        // 与 persistence-client 同构:经模块公开 claim 端口认领(此处只接 publishing —— 回归
        // 焦点是 catalog;scheduling/analytics/assets/projects 同款门在编排层统一挡住)。
        const publications = await service.claimOrphanPublications(c);
        return { publications };
      },
      hasOtherActiveDouyinAccount: async () => opts.hasOtherActive,
      target: {},
    },
    stats: {
      get claimCalls() {
        return claimCalls;
      },
    },
  };
}

let db: Db;
let repoOld: PublishingRepository; // 旧号 ctx 的写路径(stamp acct-old)
let repoNull: PublishingRepository; // 无号 ctx 的写路径(stamp NULL —— 污染前的存量形态)
let service: PublishingService;

beforeEach(async () => {
  ({ db } = await createDb());
  repoOld = createPublishingRepository(db, repoDeps(USER, ACCT_OLD, "old"));
  repoNull = createPublishingRepository(db, repoDeps(USER, null, "null"));
  service = createPublishingService({
    db,
    now: () => NOW,
    nextId: (() => {
      let n = 0;
      return (prefix: string) => `${prefix}-svc-${++n}`;
    })(),
    publisher: createMockPublisher(),
  });

  // 三形态存量:3 条归旧号 + 2 条 NULL(旧号时代无号 ctx 落的)——绑定第二个号前的真机形态。
  for (let i = 1; i <= 3; i += 1) {
    await repoOld.createImportedPublication(`out-old-${i}`, {
      platform: "douyin",
      accountReference: "douyin 导入",
      externalId: `aweme-old-${i}`,
      title: `旧号作品 ${i}`,
    });
  }
  for (let i = 1; i <= 2; i += 1) {
    await repoNull.createImportedPublication(`out-null-${i}`, {
      platform: "douyin",
      accountReference: "douyin 导入",
      externalId: `aweme-null-${i}`,
      title: `无号存量 ${i}`,
    });
  }
});

describe("publishing × collection-bootstrap — 绑定 claim 收敛 (T-331)", () => {
  it("二绑不 claim → 旧号 catalog 不缩水(NULL 存量留 NULL,lenient 门继续可见)", async () => {
    // 绑定前:旧号 ctx 的 catalog = 旧号 3 条 + NULL 2 条(accountGate = 当前号 OR NULL)。
    const before = await service.getRecentPublicationsWithTitle(
      ctxFor(ACCT_OLD),
      { limit: 100 },
    );
    expect(before).toHaveLength(5);

    // 绑第二个号:该 user 已有其它 active 抖音号(acct-old)→ 收敛门 true → claim 零调用。
    const { deps, stats } = bootstrapDeps(service, { hasOtherActive: true });
    await bootstrapDouyinCollectionJobs(ctxFor(ACCT_NEW), deps);
    expect(stats.claimCalls).toBe(0);

    // 回归核心:旧号 catalog 不缩水(明细任务的按号门仍能匹上全部 5 条)。
    const after = await service.getRecentPublicationsWithTitle(ctxFor(ACCT_OLD), {
      limit: 100,
    });
    expect(after).toHaveLength(5);
    // NULL 存量仍是 NULL(没有被错认给新号)。
    const nullRows = after.filter((r) => r.accountId === null);
    expect(nullRows.map((r) => r.externalId).sort()).toEqual([
      "aweme-null-1",
      "aweme-null-2",
    ]);
    // 新号 catalog 只见 NULL 存量(lenient 门),不见旧号名下作品 —— 没有「新号挂满别人作品」。
    const newView = await service.getRecentPublicationsWithTitle(
      ctxFor(ACCT_NEW),
      { limit: 100 },
    );
    expect(newView.map((r) => r.accountId ?? null)).not.toContain(ACCT_OLD);
    expect(newView).toHaveLength(2);
  });

  it("对照(修前旧行为):二绑仍无条件 claim → NULL 被错认给新号,旧号 catalog 缩水", async () => {
    // 直接调用 claim(= 修前 bootstrap 的无条件行为),证明收敛门挡掉的正是这种污染。
    const claimed = await service.claimOrphanPublications(ctxFor(ACCT_NEW));
    expect(claimed).toBe(2); // 2 条 NULL 被认领给新号

    const oldView = await service.getRecentPublicationsWithTitle(
      ctxFor(ACCT_OLD),
      { limit: 100 },
    );
    expect(oldView).toHaveLength(3); // 缩水:5 → 3(明细匹不上的真机症状)

    const newView = await service.getRecentPublicationsWithTitle(
      ctxFor(ACCT_NEW),
      { limit: 100 },
    );
    expect(newView).toHaveLength(2); // 新号名下挂着不属于它的作品
    expect(newView.every((r) => r.accountId === ACCT_NEW)).toBe(true);
  });

  it("首绑(无其它 active 号)claim 照旧:NULL 存量归首绑号(兼容 T-200 修串号原意)", async () => {
    const { deps, stats } = bootstrapDeps(service, { hasOtherActive: false });
    await bootstrapDouyinCollectionJobs(ctxFor(ACCT_OLD), deps);
    expect(stats.claimCalls).toBe(1);

    // NULL 2 条归了首绑号;旧号 catalog 仍全量 5 条(自己的 3 + 收编的 2)。
    const view = await service.getRecentPublicationsWithTitle(ctxFor(ACCT_OLD), {
      limit: 100,
    });
    expect(view).toHaveLength(5);
    expect(view.filter((r) => r.accountId === null)).toHaveLength(0);

    // 幂等:再跑一次首绑 bootstrap,无 NULL 可认领,catalog 不变。
    const again = bootstrapDeps(service, { hasOtherActive: false });
    await bootstrapDouyinCollectionJobs(ctxFor(ACCT_OLD), again.deps);
    const view2 = await service.getRecentPublicationsWithTitle(
      ctxFor(ACCT_OLD),
      { limit: 100 },
    );
    expect(view2).toHaveLength(5);
  });
});
