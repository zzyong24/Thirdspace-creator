import { describe, it, expect } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createIngestionService,
  type DouyinFetchPort,
  type DouyinSelfIdentity,
  type IngestionPlatformAccountPort,
} from "./ingestion.service";
import { createIngestionRepository } from "./ingestion.repository";
import type { MetricRecord } from "./ingestion.schema";

// 线 B 抖音真抓落库 — refreshDouyin 编排:校验来源(douyin)→注入端口 fetch(测试注 fake,
// 不连真浏览器)→createRun→ingestMetrics(经 publishing.resolvePublication →
// analytics.appendSnapshot 落 metric_snapshots)→completeRun。真 db + mock 下游 port。

const NOW = "2026-06-29T00:00:00.000Z";
const ctx: RequestContext = {
  userId: "user-zyongzhu",
  requestId: "r1",
  source: "user",
  accountId: "acct-zyongzhu", // [T-332 S2] per-account strict
};

interface Cap {
  fetchCalls: number;
  resolveCalls: number;
  appendCalls: number;
}

function makeService(db: Db, records: MetricRecord[], cap: Cap) {
  let seq = 0;
  const douyinFetch: DouyinFetchPort = {
    fetch: async () => {
      cap.fetchCalls += 1;
      return records;
    },
    login: async () => true,
    status: async () => true,
  };
  return createIngestionService({
    deps: { now: () => NOW, nextId: (p: string) => `${p}-${++seq}` },
    db,
    douyinFetch,
    ports: {
      publishing: {
        resolvePublication: (_c, ref) => {
          cap.resolveCalls += 1;
          return Promise.resolve({ id: `pub-${ref.externalId}` });
        },
      },
      analytics: {
        appendSnapshot: () => {
          cap.appendCalls += 1;
          return Promise.resolve({ created: true });
        },
      },
      knowledge: { ingest: () => Promise.resolve({ id: "kn" }) },
      assets: { registerExternalAsset: () => Promise.resolve({ id: "as" }) },
      artifacts: {
        createCandidateVersion: () => Promise.resolve({ id: "av" }),
      },
    },
  });
}

async function seedSource(
  db: Db,
  id: string,
  sourceType: string,
  accountId: string = ctx.accountId as string, // [T-332 S2] 源 stamp 号(缺省当前号)
): Promise<void> {
  let seq = 0;
  await createIngestionRepository(db, {
    now: () => NOW,
    nextId: (p: string) => `${p}-seed-${++seq}`,
    userId: ctx.userId,
    accountId, // seedExternalSources 直插行,repo 门不影响 seed;行自带 accountId
  }).seedExternalSources([
    {
      id,
      userId: ctx.userId,
      accountId,
      sourceType,
      name: sourceType,
      sourceIdentifier: `${sourceType}://x`,
      secretReference: "",
      configuration: {},
      createdAt: NOW,
    },
  ]);
}

describe("ingestion.refreshDouyin — 抖音真抓落库 (线 B)", () => {
  it("校验源→fetch→createRun→ingestMetrics→completeRun, 真写入快照", async () => {
    const { db } = await createDb();
    await seedSource(db, "src-douyin", "douyin");
    const cap: Cap = { fetchCalls: 0, resolveCalls: 0, appendCalls: 0 };
    const records: MetricRecord[] = [
      {
        recordKey: "douyin:7400:NOW",
        platform: "douyin",
        externalId: "7400",
        capturedAt: NOW,
        metrics: { views: 128000, likes: 5400 },
      },
      {
        recordKey: "douyin:7401:NOW",
        platform: "douyin",
        externalId: "7401",
        capturedAt: NOW,
        metrics: { views: 86000 },
      },
    ];
    const svc = makeService(db, records, cap);
    const run = await svc.refreshDouyin(ctx, {
      externalSourceId: "src-douyin",
    });
    expect(cap.fetchCalls).toBe(1);
    expect(run.status).toBe("completed");
    expect(run.recordsWritten).toBe(2);
    expect(cap.resolveCalls).toBe(2); // 每条 resolvePublication
    expect(cap.appendCalls).toBe(2); // 每条 appendSnapshot 落库
  });

  it("不存在的来源 → 抛错(不建 run)", async () => {
    const { db } = await createDb();
    const cap: Cap = { fetchCalls: 0, resolveCalls: 0, appendCalls: 0 };
    const svc = makeService(db, [], cap);
    await expect(
      svc.refreshDouyin(ctx, { externalSourceId: "src-missing" }),
    ).rejects.toThrow();
    expect(cap.fetchCalls).toBe(0); // 校验先于抓取
  });

  it("非抖音来源(mock)→ 抛错", async () => {
    const { db } = await createDb();
    await seedSource(db, "src-mock", "mock");
    const svc = makeService(db, [], {
      fetchCalls: 0,
      resolveCalls: 0,
      appendCalls: 0,
    });
    await expect(
      svc.refreshDouyin(ctx, { externalSourceId: "src-mock" }),
    ).rejects.toThrow();
  });

  it("[T-136 §D] 当前号透传 fetch(拼登录态目录)+ downstreamCtx 透传到 appendSnapshot(采集 stamp)", async () => {
    const { db } = await createDb();
    await seedSource(db, "src-douyin-a1", "douyin", "acct-1"); // acct-1 的源
    const ctxA1: RequestContext = { ...ctx, accountId: "acct-1" };
    let fetchAccountId: string | null | undefined = "unset";
    let snapshotAccountId: string | null | undefined = "unset";
    let seq = 0;
    const svc = createIngestionService({
      deps: { now: () => NOW, nextId: (p: string) => `${p}-${++seq}` },
      db,
      douyinFetch: {
        fetch: async (opts) => {
          fetchAccountId = opts.accountId; // 端口收到当前号 → 拼 `.auth/douyin/acct-1`
          return [
            {
              recordKey: "douyin:9001:NOW",
              platform: "douyin",
              externalId: "9001",
              capturedAt: NOW,
              metrics: { views: 100 },
            },
          ];
        },
        login: async () => true,
        status: async () => true,
      },
      ports: {
        publishing: {
          resolvePublication: () => Promise.resolve({ id: "pub-9001" }),
        },
        analytics: {
          appendSnapshot: (dctx) => {
            // downstreamCtx 透传的号 → 采集 stamp account_id 的来源(漏传 = null 无号归属)。
            snapshotAccountId = dctx.accountId;
            return Promise.resolve({ created: true });
          },
        },
        knowledge: { ingest: () => Promise.resolve({ id: "kn" }) },
        assets: { registerExternalAsset: () => Promise.resolve({ id: "as" }) },
        artifacts: {
          createCandidateVersion: () => Promise.resolve({ id: "av" }),
        },
      },
    });
    const run = await svc.refreshDouyin(ctxA1, {
      externalSourceId: "src-douyin-a1",
    });
    expect(run.status).toBe("completed");
    expect(fetchAccountId).toBe("acct-1"); // fetch 端口拿到当前号
    expect(snapshotAccountId).toBe("acct-1"); // downstreamCtx 透传到 appendSnapshot(采集 stamp)
  });
});

// [T-136 §D] 绑定流程:采集时抓登录用户自己的真实身份(昵称+抖音号),回填当前号占位
//   (external_source.name / platform_account.handle),替「我的抖音」。**仅抓到才覆盖**、幂等、
//   best-effort(回填失败不阻断采集)。scraper 抓身份的纯函数在 douyin-cdp.test.ts;此处测编排。
describe("ingestion.refreshDouyin — 回填登录用户真实身份 (T-136 §D)", () => {
  const record: MetricRecord = {
    recordKey: "douyin:9100:NOW",
    platform: "douyin",
    externalId: "9100",
    capturedAt: NOW,
    metrics: { views: 100 },
  };

  function identityService(
    db: Db,
    fetchResult:
      | MetricRecord[]
      | {
          records: MetricRecord[];
          identity: {
            nickname: string;
            secUid: string;
            douyinId: string;
            followerCount: number | null; // [T-214]
          } | null;
        },
    handleUpdates: Array<{
      platform: string;
      handle: string;
      externalAccountId?: string | null;
      followerCount?: number | null; // [T-214]
    }>,
  ) {
    let seq = 0;
    const douyinFetch: DouyinFetchPort = {
      fetch: async () => fetchResult,
      login: async () => true,
      status: async () => true,
    };
    const platformAccount: IngestionPlatformAccountPort = {
      ensureAccount: async () => ({ id: "acct-x" }),
      updateAccountHandle: async (_c, input) => {
        handleUpdates.push(input);
      },
    };
    return createIngestionService({
      deps: { now: () => NOW, nextId: (p: string) => `${p}-${++seq}` },
      db,
      douyinFetch,
      platformAccount,
      ports: {
        publishing: {
          resolvePublication: () => Promise.resolve({ id: "pub-9100" }),
        },
        analytics: { appendSnapshot: () => Promise.resolve({ created: true }) },
        knowledge: { ingest: () => Promise.resolve({ id: "kn" }) },
        assets: { registerExternalAsset: () => Promise.resolve({ id: "as" }) },
        artifacts: {
          createCandidateVersion: () => Promise.resolve({ id: "av" }),
        },
      },
    });
  }

  async function readSource(db: Db, id: string) {
    let seq = 0;
    return createIngestionRepository(db, {
      now: () => NOW,
      nextId: (p: string) => `${p}-r-${++seq}`,
      userId: ctx.userId,
      accountId: ctx.accountId as string, // [T-332 S2] strict 门:读回同号
    }).getExternalSource(id);
  }

  it("抓到真实身份 → external_source.name=真实昵称、sourceIdentifier=抖音号;platform_account handle 更新", async () => {
    const { db } = await createDb();
    await seedSource(db, "src-douyin-id", "douyin"); // 占位 name(seedSource 里 name=sourceType)
    const updates: Array<{
      platform: string;
      handle: string;
      externalAccountId?: string | null;
      followerCount?: number | null;
    }> = [];
    const svc = identityService(
      db,
      {
        records: [record],
        identity: {
          nickname: "月色创作者",
          secUid: "MS4wsecuid",
          douyinId: "moonlit_creator",
          followerCount: 12345, // [T-214] 采到总粉丝数
        },
      },
      updates,
    );
    await svc.refreshDouyin(ctx, { externalSourceId: "src-douyin-id" });
    const src = await readSource(db, "src-douyin-id");
    expect(src?.name).toBe("月色创作者"); // 真实昵称替占位
    expect(src?.sourceIdentifier).toBe("moonlit_creator"); // 抖音号存 sourceIdentifier
    // platform_account handle 也更新为真实昵称。
    // [T-201b] 顺带把稳定身份锚 sec_uid 一并透传(handle=显示名,externalAccountId=身份键)。
    // [T-214] 顺带把总粉丝数 followerCount 透传(实现侧仅 >0 才回填 followerBaseline)。
    expect(updates).toEqual([
      {
        platform: "douyin",
        handle: "月色创作者",
        externalAccountId: "MS4wsecuid",
        followerCount: 12345,
      },
    ]);
  });

  it("抓不到身份(identity=null)→ 保留占位 name,不覆盖不清空、不更新账号 handle", async () => {
    const { db } = await createDb();
    await seedSource(db, "src-douyin-noid", "douyin");
    const before = await readSource(db, "src-douyin-noid");
    const updates: Array<{ platform: string; handle: string; externalAccountId?: string | null }> = [];
    const svc = identityService(
      db,
      { records: [record], identity: null },
      updates,
    );
    await svc.refreshDouyin(ctx, { externalSourceId: "src-douyin-noid" });
    const after = await readSource(db, "src-douyin-noid");
    expect(after?.name).toBe(before?.name); // 占位保持,不被清空
    expect(updates).toHaveLength(0); // 未抓到 → 不更新账号 handle
  });

  it("旧数组形状(无 identity 的向后兼容 fetch)→ 不回填,采集照旧完成", async () => {
    const { db } = await createDb();
    await seedSource(db, "src-douyin-legacy", "douyin");
    const before = await readSource(db, "src-douyin-legacy");
    const updates: Array<{ platform: string; handle: string; externalAccountId?: string | null }> = [];
    // fetch 返回裸 MetricRecord[](旧装配)→ normalizeFetch identity=null。
    const svc = identityService(db, [record], updates);
    const run = await svc.refreshDouyin(ctx, {
      externalSourceId: "src-douyin-legacy",
    });
    expect(run.status).toBe("completed");
    const after = await readSource(db, "src-douyin-legacy");
    expect(after?.name).toBe(before?.name); // 无 identity → 保持占位
    expect(updates).toHaveLength(0);
  });

  it("幂等:重复采集同一昵称 → external_source.name 稳定(值不变,无副作用)", async () => {
    const { db } = await createDb();
    await seedSource(db, "src-douyin-idem", "douyin");
    const updates: Array<{ platform: string; handle: string; externalAccountId?: string | null }> = [];
    const svc = identityService(
      db,
      {
        records: [record],
        identity: { nickname: "月色", secUid: "s", douyinId: "d", followerCount: null },
      },
      updates,
    );
    // 换 capturedAt 触发新 run(否则 idempotencyKey=capturedAt 会复用同 run)。
    await svc.refreshDouyin(ctx, {
      externalSourceId: "src-douyin-idem",
      capturedAt: "2026-06-29T01:00:00.000Z",
    });
    await svc.refreshDouyin(ctx, {
      externalSourceId: "src-douyin-idem",
      capturedAt: "2026-06-29T02:00:00.000Z",
    });
    const src = await readSource(db, "src-douyin-idem");
    expect(src?.name).toBe("月色"); // 两次采集后仍是真实昵称(稳定)
  });
});

// T-032a 被动状态探针 —— checkDouyinStatus 直穿注入端口的 status()(测试注 fake,不连浏览器),
// 返回 { loggedIn }。设置页「账号绑定」徽标读它;不建 run、不抓取、不需要 externalSource。
describe("ingestion.checkDouyinStatus — 抖音登录态被动探针 (T-032a)", () => {
  function statusService(db: Db, loggedIn: boolean) {
    let seq = 0;
    const douyinFetch: DouyinFetchPort = {
      fetch: async () => [],
      login: async () => true,
      status: async () => loggedIn,
    };
    return createIngestionService({
      deps: { now: () => NOW, nextId: (p: string) => `${p}-${++seq}` },
      db,
      douyinFetch,
      ports: {
        publishing: { resolvePublication: () => Promise.resolve({ id: "pub" }) },
        analytics: { appendSnapshot: () => Promise.resolve({ created: true }) },
        knowledge: { ingest: () => Promise.resolve({ id: "kn" }) },
        assets: { registerExternalAsset: () => Promise.resolve({ id: "as" }) },
        artifacts: {
          createCandidateVersion: () => Promise.resolve({ id: "av" }),
        },
      },
    });
  }

  it("status() → true ⇒ { loggedIn: true }", async () => {
    const { db } = await createDb();
    const svc = statusService(db, true);
    // T-144:响应 additive 加了 sourceReady 字段(此处只断 loggedIn,专测见下方 sourceReady 用例)。
    await expect(svc.checkDouyinStatus(ctx)).resolves.toMatchObject({
      loggedIn: true,
    });
  });

  it("status() → false ⇒ { loggedIn: false }(未连接 / 登录态过期)", async () => {
    const { db } = await createDb();
    const svc = statusService(db, false);
    await expect(svc.checkDouyinStatus(ctx)).resolves.toMatchObject({
      loggedIn: false,
    });
  });

  it("sourceReady 反映真实采集源:无源 → false;ensure 后 → true(T-144 去虚假承诺)", async () => {
    const { db } = await createDb();
    const svc = statusService(db, true);
    // 登录态 true 但还没建采集源 → sourceReady=false(诚实:登录态≠能采集)。
    await expect(svc.checkDouyinStatus(ctx)).resolves.toEqual({
      loggedIn: true,
      sourceReady: false,
    });
    // ensure 出真实源后 → sourceReady=true。
    await svc.ensureDouyinSource(ctx);
    await expect(svc.checkDouyinStatus(ctx)).resolves.toEqual({
      loggedIn: true,
      sourceReady: true,
    });
  });

  // [T-136 §D 切片 c] status 按号:端口收到当前号(拼 `.auth/douyin/<accountId>`);
  //   sourceReady 针对该号的源(选号后 ensure 该号源 → 该号 true,另一号仍 false,不串)。
  const ctxA1: RequestContext = { ...ctx, accountId: "acct-1" };
  const ctxA2: RequestContext = { ...ctx, accountId: "acct-2" };

  it("[T-136] status() 端口收到当前号 accountId(据此拼登录态目录)", async () => {
    const { db } = await createDb();
    let seenAccountId: string | null | undefined = "unset";
    let seq = 0;
    const svc = createIngestionService({
      deps: { now: () => NOW, nextId: (p: string) => `${p}-${++seq}` },
      db,
      douyinFetch: {
        fetch: async () => [],
        login: async () => true,
        status: async (opts) => {
          seenAccountId = opts?.accountId;
          return true;
        },
      },
      ports: {
        publishing: { resolvePublication: () => Promise.resolve({ id: "pub" }) },
        analytics: { appendSnapshot: () => Promise.resolve({ created: true }) },
        knowledge: { ingest: () => Promise.resolve({ id: "kn" }) },
        assets: { registerExternalAsset: () => Promise.resolve({ id: "as" }) },
        artifacts: {
          createCandidateVersion: () => Promise.resolve({ id: "av" }),
        },
      },
    });
    await svc.checkDouyinStatus(ctxA1);
    expect(seenAccountId).toBe("acct-1");
  });

  it("[T-136] sourceReady 按号:ensure acct-1 的源后,acct-1 就绪、acct-2 仍未就绪(不串)", async () => {
    const { db } = await createDb();
    const svc = statusService(db, true);
    await svc.ensureDouyinSource(ctxA1); // 只给 acct-1 建源
    await expect(svc.checkDouyinStatus(ctxA1)).resolves.toEqual({
      loggedIn: true,
      sourceReady: true,
    });
    await expect(svc.checkDouyinStatus(ctxA2)).resolves.toEqual({
      loggedIn: true,
      sourceReady: false, // 另一号无源 → 未就绪(跨号隔离)
    });
  });

  it("[T-332 S2] 未选号(accountId 缺失)→ AccountRequiredError(引导态;存量回落链已随清库退役)", async () => {
    const { db } = await createDb();
    const svc = statusService(db, true);
    const noAcct: RequestContext = { ...ctx, accountId: null };
    await expect(svc.checkDouyinStatus(noAcct)).rejects.toMatchObject({
      name: "AccountRequiredError",
    });
  });
});

// T-144 —— ensureDouyinSource:确保本 user 有一条确定 id 的真实抖音采集源(无源建、有源复用),
// 取代采集器写死的已退役 "src-douyin-canonical" fallback。复用 ensureManualRun 的确定性 id +
// 幂等 seed 范式。source_type=douyin,拿不到 handle 用占位名。
describe("ingestion.ensureDouyinSource — 确保真实抖音采集源 (T-144)", () => {
  function bareService(db: Db) {
    let seq = 0;
    const douyinFetch: DouyinFetchPort = {
      fetch: async () => [],
      login: async () => true,
      status: async () => true,
    };
    return createIngestionService({
      deps: { now: () => NOW, nextId: (p: string) => `${p}-${++seq}` },
      db,
      douyinFetch,
      ports: {
        publishing: { resolvePublication: () => Promise.resolve({ id: "pub" }) },
        analytics: { appendSnapshot: () => Promise.resolve({ created: true }) },
        knowledge: { ingest: () => Promise.resolve({ id: "kn" }) },
        assets: { registerExternalAsset: () => Promise.resolve({ id: "as" }) },
        artifacts: {
          createCandidateVersion: () => Promise.resolve({ id: "av" }),
        },
      },
    });
  }

  it("无源 → 建一条 source_type=douyin 的真实源,返回确定 id(非 canonical)", async () => {
    const { db } = await createDb();
    const svc = bareService(db);
    const id = await svc.ensureDouyinSource(ctx);
    // [T-332 S2] 每号独立源:id 带当前号(不再是 user 级 id)。
    expect(id).toBe(`extsrc-douyin-${ctx.accountId}`);
    expect(id).not.toContain("canonical");
    // 建出的源可被 refreshDouyin 校验为 douyin(此前 canonical 查无 → 0 条)。
    const run = await svc.refreshDouyin(ctx, { externalSourceId: id });
    expect(run.status).toBe("completed"); // 源存在且 sourceType=douyin,不再抛「外部来源不存在」
  });

  it("有源 → 复用同一确定 id(幂等,不建第二条)", async () => {
    const { db } = await createDb();
    const svc = bareService(db);
    const a = await svc.ensureDouyinSource(ctx);
    const b = await svc.ensureDouyinSource(ctx);
    expect(a).toBe(b);
  });

  it("已存在同 id 的源被复用,不覆盖其 name/handle(onConflictDoNothing)", async () => {
    const { db } = await createDb();
    // 预置一条同确定 id、用户自定义 name 的源(带当前号,[T-332 S2])。
    await seedSource(db, `extsrc-douyin-${ctx.accountId}`, "douyin");
    const svc = bareService(db);
    const id = await svc.ensureDouyinSource(ctx);
    expect(id).toBe(`extsrc-douyin-${ctx.accountId}`);
  });

  // [T-136 §D 切片 c] 每号独立源:选号 → id 变 `extsrc-douyin-<accountId>`;两号各建独立源。
  const ctxAcct1: RequestContext = { ...ctx, accountId: "acct-1" };
  const ctxAcct2: RequestContext = { ...ctx, accountId: "acct-2" };

  it("[T-136] 选号 → 建 `extsrc-douyin-<accountId>` 独立源(每号一套)", async () => {
    const { db } = await createDb();
    const svc = bareService(db);
    const id1 = await svc.ensureDouyinSource(ctxAcct1);
    const id2 = await svc.ensureDouyinSource(ctxAcct2);
    expect(id1).toBe("extsrc-douyin-acct-1");
    expect(id2).toBe("extsrc-douyin-acct-2");
    expect(id1).not.toBe(id2); // 两号独立源
  });

  it("[T-332 S2] 换号 ensure → 建该号自己的新源(不回落别的 id;存量回落链已随清库退役)", async () => {
    const { db } = await createDb();
    const svc = bareService(db);
    // acct-1 已有源;acct-2 ensure → 各建各的,互不借用。
    const id1 = await svc.ensureDouyinSource(ctxAcct1);
    const id2 = await svc.ensureDouyinSource(ctxAcct2);
    expect(id1).toBe("extsrc-douyin-acct-1");
    expect(id2).toBe("extsrc-douyin-acct-2");
    // 该号新源能被 refreshDouyin(带号 ctx)校验通过。
    const run = await svc.refreshDouyin(ctxAcct1, { externalSourceId: id1 });
    expect(run.status).toBe("completed");
  });

  it("[T-332 S2] 未选号 ensureDouyinSource / refreshDouyin → AccountRequiredError(引导态禁读写)", async () => {
    const { db } = await createDb();
    const svc = bareService(db);
    const noAcct: RequestContext = { ...ctx, accountId: null };
    await expect(svc.ensureDouyinSource(noAcct)).rejects.toMatchObject({
      name: "AccountRequiredError",
    });
    await expect(
      svc.refreshDouyin(noAcct, { externalSourceId: "extsrc-douyin-x" }),
    ).rejects.toMatchObject({ name: "AccountRequiredError" });
  });

  it("[T-136] 选号后再 ensure 幂等:第二次复用第一次建的该号源", async () => {
    const { db } = await createDb();
    const svc = bareService(db);
    const a = await svc.ensureDouyinSource(ctxAcct1);
    const b = await svc.ensureDouyinSource(ctxAcct1);
    expect(a).toBe(b);
    expect(a).toBe("extsrc-douyin-acct-1");
  });
});

// T-144 —— 扫码登录同时建 platform_account + external_source,让「设置徽标 / 切换器 / 日历」
// 三处账号状态同源(都基于真实绑定)。platformAccount 端口可选:未注入 → 仅建源(不破旧组合)。
describe("ingestion.loginDouyin — 扫码成功同时建采集源 + 平台账号 (T-144)", () => {
  function loginService(
    db: Db,
    loggedIn: boolean,
    accountPort?: IngestionPlatformAccountPort,
  ) {
    let seq = 0;
    const douyinFetch: DouyinFetchPort = {
      fetch: async () => [],
      login: async () => loggedIn,
      status: async () => loggedIn,
    };
    return createIngestionService({
      deps: { now: () => NOW, nextId: (p: string) => `${p}-${++seq}` },
      db,
      douyinFetch,
      platformAccount: accountPort,
      ports: {
        publishing: { resolvePublication: () => Promise.resolve({ id: "pub" }) },
        analytics: { appendSnapshot: () => Promise.resolve({ created: true }) },
        knowledge: { ingest: () => Promise.resolve({ id: "kn" }) },
        assets: { registerExternalAsset: () => Promise.resolve({ id: "as" }) },
        artifacts: {
          createCandidateVersion: () => Promise.resolve({ id: "av" }),
        },
      },
    });
  }

  it("扫码成功 → ensure 真实源 + ensure 平台账号(三处状态同源的地基)", async () => {
    const { db } = await createDb();
    const ensured: Array<{ platform: string; handle: string }> = [];
    const accountPort: IngestionPlatformAccountPort = {
      ensureAccount: async (_c, input) => {
        ensured.push(input);
        return { id: "acct-1" };
      },
    };
    const svc = loginService(db, true, accountPort);
    const res = await svc.loginDouyin(ctx);
    expect(res.loggedIn).toBe(true);
    // 源已建(sourceReady 转真)。
    await expect(svc.checkDouyinStatus(ctx)).resolves.toMatchObject({
      sourceReady: true,
    });
    // 平台账号已 ensure(douyin,占位 handle 或真实 handle)。
    expect(ensured).toHaveLength(1);
    expect(ensured[0]!.platform).toBe("douyin");
    expect(ensured[0]!.handle.length).toBeGreaterThan(0);
  });

  it("扫码失败(loggedIn=false)→ 不建源、不建账号(不假装绑定)", async () => {
    const { db } = await createDb();
    const ensured: Array<{ platform: string; handle: string }> = [];
    const accountPort: IngestionPlatformAccountPort = {
      ensureAccount: async (_c, input) => {
        ensured.push(input);
        return { id: "acct-1" };
      },
    };
    const svc = loginService(db, false, accountPort);
    const res = await svc.loginDouyin(ctx);
    expect(res.loggedIn).toBe(false);
    expect(ensured).toHaveLength(0);
    await expect(svc.checkDouyinStatus(ctx)).resolves.toMatchObject({
      sourceReady: false,
    });
  });

  it("platformAccount 端口未注入 → 仍建源(退化,不破旧组合根)", async () => {
    const { db } = await createDb();
    const svc = loginService(db, true, undefined);
    const res = await svc.loginDouyin(ctx);
    expect(res.loggedIn).toBe(true);
    await expect(svc.checkDouyinStatus(ctx)).resolves.toMatchObject({
      sourceReady: true,
    });
  });

  // [Bug-13 T-029] 扫码成功 → 立即 fire-and-forget refreshDouyin 刷真昵称,避免「占位未刷 → 立即
  // 触发 job 时 collector 拿不到 accountId/cookies → needs_reconnect」的时序坑。test 模拟 douyinFetch.fetch
  // 计数(被 refreshDouyin 内部调)→ 等 fire-and-forget 链跑完再断言 fetch 被调到 1 次。
  it("[Bug-13 T-029] 扫码成功 → fire-and-forget 立即 refreshDouyin 一次(刷真昵称,end-to-end 扫码即齐活)", async () => {
    const { db } = await createDb();
    let fetchCalls = 0;
    const accountPort: IngestionPlatformAccountPort = {
      ensureAccount: async () => ({ id: "acct-1" }),
    };
    let seq = 0;
    const douyinFetch: DouyinFetchPort = {
      fetch: async () => {
        fetchCalls += 1;
        return [];
      },
      login: async () => true,
      status: async () => true,
    };
    const svc = createIngestionService({
      deps: { now: () => NOW, nextId: (p: string) => `${p}-${++seq}` },
      db,
      douyinFetch,
      platformAccount: accountPort,
      ports: {
        publishing: { resolvePublication: () => Promise.resolve({ id: "pub" }) },
        analytics: { appendSnapshot: () => Promise.resolve({ created: true }) },
        knowledge: { ingest: () => Promise.resolve({ id: "kn" }) },
        assets: { registerExternalAsset: () => Promise.resolve({ id: "as" }) },
        artifacts: {
          createCandidateVersion: () => Promise.resolve({ id: "av" }),
        },
      },
    });
    const res = await svc.loginDouyin(ctx);
    expect(res.loggedIn).toBe(true);
    // 等 fire-and-forget 链跑完:用 await new Promise(setImmediate) 把微任务队列抽干
    // (refreshDouyin 内部 await 多个 IO,需要多轮)。
    for (let i = 0; i < 20; i++) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    // 关键:fire-and-forget refreshDouyin 跑了 → douyinFetch.fetch 被调 1 次。
    expect(fetchCalls).toBe(1);
  });
});

// T-189a —— 扫码绑定成功 → fire-and-forget 调 onDouyinBound(组合根据此建三个每天定时采集 job +
//   初始化跑一次)。「已有账户」路径也复用 loginDouyin,故同样触发。onDouyinBound 注入时不再跑
//   Bug-13 内联 refreshDouyin(避免双跑 Chromium 抢号)。
describe("ingestion.loginDouyin — 绑定成功触发 onDouyinBound (T-189a)", () => {
  function bindService(
    db: Db,
    loggedIn: boolean,
    onDouyinBound?: (c: RequestContext) => void,
    opts?: { fetch?: () => Promise<MetricRecord[]> },
  ) {
    let seq = 0;
    const douyinFetch: DouyinFetchPort = {
      fetch: opts?.fetch ?? (async () => []),
      login: async () => loggedIn,
      status: async () => loggedIn,
    };
    const accountPort: IngestionPlatformAccountPort = {
      ensureAccount: async () => ({ id: "acct-1" }),
    };
    return createIngestionService({
      deps: { now: () => NOW, nextId: (p: string) => `${p}-${++seq}` },
      db,
      douyinFetch,
      platformAccount: accountPort,
      onDouyinBound,
      ports: {
        publishing: { resolvePublication: () => Promise.resolve({ id: "pub" }) },
        analytics: { appendSnapshot: () => Promise.resolve({ created: true }) },
        knowledge: { ingest: () => Promise.resolve({ id: "kn" }) },
        assets: { registerExternalAsset: () => Promise.resolve({ id: "as" }) },
        artifacts: {
          createCandidateVersion: () => Promise.resolve({ id: "av" }),
        },
      },
    });
  }

  it("扫码成功 → onDouyinBound 被调一次(带绑定 ctx),源已就绪", async () => {
    const { db } = await createDb();
    const boundCtx: RequestContext[] = [];
    const svc = bindService(db, true, (c) => boundCtx.push(c));
    const res = await svc.loginDouyin(ctx);
    expect(res.loggedIn).toBe(true);
    for (let i = 0; i < 10; i++) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    expect(boundCtx).toHaveLength(1);
    expect(boundCtx[0]!.userId).toBe(ctx.userId);
    await expect(svc.checkDouyinStatus(ctx)).resolves.toMatchObject({
      sourceReady: true,
    });
  });

  it("扫码失败 → onDouyinBound 不被调(不假装绑定)", async () => {
    const { db } = await createDb();
    let calls = 0;
    const svc = bindService(db, false, () => {
      calls += 1;
    });
    const res = await svc.loginDouyin(ctx);
    expect(res.loggedIn).toBe(false);
    for (let i = 0; i < 10; i++) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    expect(calls).toBe(0);
  });

  it("onDouyinBound 注入时不跑 Bug-13 内联 refreshDouyin(避免双跑抢号 → fetch 不被调)", async () => {
    const { db } = await createDb();
    let fetchCalls = 0;
    const svc = bindService(db, true, () => {}, {
      fetch: async () => {
        fetchCalls += 1;
        return [];
      },
    });
    const res = await svc.loginDouyin(ctx);
    expect(res.loggedIn).toBe(true);
    for (let i = 0; i < 20; i++) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    // 初始化采集由组合根 onDouyinBound(此处 fake 空实现)负责;service 内联 refresh 不再跑。
    expect(fetchCalls).toBe(0);
  });
});

// [T-330] 「扫码绑定新抖音号」forceNew 编排 —— 根治「绑新号命中旧号 sessionid → 二维码不出现
//   直接登进旧号」:staging 隔离扫码 → 同步读回身份 → ensureAccount(真实 handle+sec_uid)→
//   staging 搬该号正式目录 → 绑定编排带真号。诚实:身份读不回 → 清 staging + 明确错误,绝不
//   默默挂 _default/旧号;非 forceNew 路径行为完全不变。全部注入 fake 端口(既有范式),不连真浏览器。
describe("ingestion.loginDouyin — forceNew 绑新号 staging 编排 (T-330)", () => {
  const IDENTITY: DouyinSelfIdentity = {
    nickname: "新号真实昵称",
    secUid: "sec-uid-new",
    douyinId: "douyin-new-1",
    followerCount: 42,
  };

  // 可观测 staging 端口:记录四步调用序 + 入参;各步行为可按用例覆盖。
  function stagedPort(overrides?: {
    loginNewLoggedIn?: boolean;
    identity?: DouyinSelfIdentity | null;
    fetchIdentityError?: Error;
    adoptError?: Error;
    omitStagingMethods?: boolean;
  }) {
    const calls: string[] = [];
    const adopted: Array<{ stagingKey: string; accountId: string }> = [];
    const discarded: string[] = [];
    let legacyLoginCalls = 0;
    const port: DouyinFetchPort = {
      fetch: async () => [],
      login: async () => {
        legacyLoginCalls += 1;
        return true;
      },
      status: async () => true,
      ...(overrides?.omitStagingMethods
        ? {}
        : {
            loginNew: async () => {
              calls.push("loginNew");
              return {
                loggedIn: overrides?.loginNewLoggedIn ?? true,
                stagingKey: "0123456789abcdef",
              };
            },
            fetchIdentity: async () => {
              calls.push("fetchIdentity");
              if (overrides?.fetchIdentityError) throw overrides.fetchIdentityError;
              return overrides?.identity === undefined ? IDENTITY : overrides.identity;
            },
            adoptStaging: async (opts: { stagingKey: string; accountId: string }) => {
              calls.push("adoptStaging");
              if (overrides?.adoptError) throw overrides.adoptError;
              adopted.push(opts);
            },
            discardStaging: async (opts: { stagingKey: string }) => {
              calls.push("discardStaging");
              discarded.push(opts.stagingKey);
            },
          }),
    };
    return {
      port,
      calls,
      adopted,
      discarded,
      legacyLoginCalls: () => legacyLoginCalls,
    };
  }

  function forceNewService(args: {
    db: Db;
    port: DouyinFetchPort;
    accountPort?: IngestionPlatformAccountPort;
    onDouyinBound?: (c: RequestContext) => void;
  }) {
    let seq = 0;
    return createIngestionService({
      deps: { now: () => NOW, nextId: (p: string) => `${p}-${++seq}` },
      db: args.db,
      douyinFetch: args.port,
      platformAccount: args.accountPort,
      onDouyinBound: args.onDouyinBound,
      ports: {
        publishing: { resolvePublication: () => Promise.resolve({ id: "pub" }) },
        analytics: { appendSnapshot: () => Promise.resolve({ created: true }) },
        knowledge: { ingest: () => Promise.resolve({ id: "kn" }) },
        assets: { registerExternalAsset: () => Promise.resolve({ id: "as" }) },
        artifacts: {
          createCandidateVersion: () => Promise.resolve({ id: "av" }),
        },
      },
    });
  }

  it("成功链:staging 扫码 → 同步读身份 → ensureAccount(真实昵称+sec_uid)→ 搬目录 → onDouyinBound 带真号;不清 staging、不走旧 login", async () => {
    const { db } = await createDb();
    const staged = stagedPort();
    const ensured: Array<{ platform: string; handle: string; externalAccountId?: string | null }> = [];
    const handleUpdates: Array<{ handle: string; externalAccountId?: string | null; followerCount?: number | null }> = [];
    const boundCtxs: RequestContext[] = [];
    const accountPort: IngestionPlatformAccountPort = {
      ensureAccount: async (_c, input) => {
        ensured.push(input);
        return { id: "acct-new" };
      },
      updateAccountHandle: async (_c, input) => {
        handleUpdates.push(input);
      },
    };
    const svc = forceNewService({
      db,
      port: staged.port,
      accountPort,
      onDouyinBound: (c) => boundCtxs.push(c),
    });

    const res = await svc.loginDouyin(ctx, { forceNew: true });
    expect(res.loggedIn).toBe(true);
    // 步序:staging 扫码 → 身份 → 搬目录(身份确认后才搬);失败清理 discard 不出现。
    expect(staged.calls).toEqual(["loginNew", "fetchIdentity", "adoptStaging"]);
    expect(staged.discarded).toEqual([]);
    // 旧链 login(会命中旧 sessionid 短路)绝不被调 —— 这正是 T-330 的根因隔离。
    expect(staged.legacyLoginCalls()).toBe(0);
    // ensureAccount 吃真实身份(非占位「我的抖音」),sec_uid 同传(同号重扫命中既有行)。
    expect(ensured).toEqual([
      { platform: "douyin", handle: "新号真实昵称", externalAccountId: "sec-uid-new" },
    ]);
    // 登录态搬到 ensureAccount 返回的真号目录。
    expect(staged.adopted).toEqual([
      { stagingKey: "0123456789abcdef", accountId: "acct-new" },
    ]);
    // 身份回填(applyDouyinIdentity)带 sec_uid + 粉丝数。
    expect(handleUpdates).toEqual([
      {
        platform: "douyin",
        handle: "新号真实昵称",
        externalAccountId: "sec-uid-new",
        followerCount: 42,
      },
    ]);
    // 绑定编排带真号(建号绑定 job/初始化采集全落新号,不落 null;claim 已随 T-332 S2 退役,新数据出生即带号)。
    expect(boundCtxs).toHaveLength(1);
    expect(boundCtxs[0]!.accountId).toBe("acct-new");
    // 每号独立源已建:以新号 ctx 查 sourceReady=true。
    await expect(
      svc.checkDouyinStatus({ ...ctx, accountId: "acct-new" }),
    ).resolves.toMatchObject({ sourceReady: true });
  });

  it("未扫码(loggedIn=false)→ 清 staging、不建账号、诚实返回 false", async () => {
    const { db } = await createDb();
    const staged = stagedPort({ loginNewLoggedIn: false });
    const ensured: unknown[] = [];
    const svc = forceNewService({
      db,
      port: staged.port,
      accountPort: {
        ensureAccount: async (_c, input) => {
          ensured.push(input);
          return { id: "acct-x" };
        },
      },
    });
    const res = await svc.loginDouyin(ctx, { forceNew: true });
    expect(res.loggedIn).toBe(false);
    expect(staged.calls).toEqual(["loginNew", "discardStaging"]);
    expect(ensured).toEqual([]);
    expect(staged.adopted).toEqual([]);
  });

  it("身份读不回(identity=null)→ 清 staging + 明确错误;绝不 ensureAccount / 搬目录", async () => {
    const { db } = await createDb();
    const staged = stagedPort({ identity: null });
    const ensured: unknown[] = [];
    const svc = forceNewService({
      db,
      port: staged.port,
      accountPort: {
        ensureAccount: async (_c, input) => {
          ensured.push(input);
          return { id: "acct-x" };
        },
      },
    });
    await expect(svc.loginDouyin(ctx, { forceNew: true })).rejects.toThrow(
      /读不回账号身份/,
    );
    expect(staged.calls).toEqual(["loginNew", "fetchIdentity", "discardStaging"]);
    expect(ensured).toEqual([]);
    expect(staged.adopted).toEqual([]);
  });

  it("读身份抛错 → 清 staging + 明确错误(不吞成假成功)", async () => {
    const { db } = await createDb();
    const staged = stagedPort({
      fetchIdentityError: new Error("DouyinNotLoggedInError"),
    });
    const svc = forceNewService({
      db,
      port: staged.port,
      accountPort: { ensureAccount: async () => ({ id: "acct-x" }) },
    });
    await expect(svc.loginDouyin(ctx, { forceNew: true })).rejects.toThrow(
      /读取账号身份失败/,
    );
    expect(staged.calls).toEqual(["loginNew", "fetchIdentity", "discardStaging"]);
  });

  it("搬目录失败 → 清 staging + 明确错误(登录态不落无主目录)", async () => {
    const { db } = await createDb();
    const staged = stagedPort({ adoptError: new Error("EACCES") });
    const svc = forceNewService({
      db,
      port: staged.port,
      accountPort: { ensureAccount: async () => ({ id: "acct-x" }) },
    });
    await expect(svc.loginDouyin(ctx, { forceNew: true })).rejects.toThrow(
      /登录态归位失败/,
    );
    expect(staged.calls).toEqual([
      "loginNew",
      "fetchIdentity",
      "adoptStaging",
      "discardStaging",
    ]);
  });

  it("组合根未升级(端口缺 staging 方法)→ 诚实报错,绝不静默退回旧链", async () => {
    const { db } = await createDb();
    const staged = stagedPort({ omitStagingMethods: true });
    const svc = forceNewService({
      db,
      port: staged.port,
      accountPort: { ensureAccount: async () => ({ id: "acct-x" }) },
    });
    await expect(svc.loginDouyin(ctx, { forceNew: true })).rejects.toThrow(
      /不支持绑定新号/,
    );
    // 旧链 login 未被调(静默退回旧链 = 复现 bug,必须挡住)。
    expect(staged.legacyLoginCalls()).toBe(0);
  });

  it("platformAccount 端口未注入 → 诚实报错(身份没处登记,绑不成新号)", async () => {
    const { db } = await createDb();
    const staged = stagedPort();
    const svc = forceNewService({ db, port: staged.port });
    await expect(svc.loginDouyin(ctx, { forceNew: true })).rejects.toThrow(
      /platformAccount/,
    );
  });

  it("非 forceNew(重连当前号)行为不变:走旧 login,staging 四步全不碰", async () => {
    const { db } = await createDb();
    const staged = stagedPort();
    const svc = forceNewService({
      db,
      port: staged.port,
      accountPort: { ensureAccount: async () => ({ id: "acct-1" }) },
      onDouyinBound: () => {},
    });
    const res = await svc.loginDouyin(ctx);
    expect(res.loggedIn).toBe(true);
    expect(staged.legacyLoginCalls()).toBe(1);
    expect(staged.calls).toEqual([]); // loginNew/fetchIdentity/adoptStaging/discardStaging 零调用
  });

  it("onDouyinBound 未注入 → 回退 fire-and-forget refreshDouyin(带真号初始化采集)", async () => {
    const { db } = await createDb();
    let fetchCalls = 0;
    const fetchCtxSeen: Array<string | null> = [];
    const staged = stagedPort();
    // 包一层 fetch 计数(refreshDouyin 内部调 douyinFetch.fetch)。
    const port: DouyinFetchPort = {
      ...staged.port,
      fetch: async () => {
        fetchCalls += 1;
        return { records: [], identity: IDENTITY };
      },
    };
    const svc = forceNewService({
      db,
      port,
      accountPort: {
        ensureAccount: async () => ({ id: "acct-new" }),
      },
    });
    const res = await svc.loginDouyin(ctx, { forceNew: true });
    expect(res.loggedIn).toBe(true);
    for (let i = 0; i < 20; i++) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    expect(fetchCalls).toBe(1);
    void fetchCtxSeen;
  });
});
