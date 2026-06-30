import { describe, it, expect } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createIngestionService,
  type DouyinFetchPort,
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
