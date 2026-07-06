import { describe, it, expect } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createIngestionService,
  type DouyinFetchPort,
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
): Promise<void> {
  let seq = 0;
  await createIngestionRepository(db, {
    now: () => NOW,
    nextId: (p: string) => `${p}-seed-${++seq}`,
    userId: ctx.userId,
  }).seedExternalSources([
    {
      id,
      userId: ctx.userId,
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
    expect(id).toBe(`extsrc-douyin-${ctx.userId}`);
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
    // 预置一条同确定 id、用户自定义 name 的源。
    await seedSource(db, `extsrc-douyin-${ctx.userId}`, "douyin");
    const svc = bareService(db);
    const id = await svc.ensureDouyinSource(ctx);
    expect(id).toBe(`extsrc-douyin-${ctx.userId}`);
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
});
