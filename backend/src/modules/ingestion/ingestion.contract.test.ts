import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import { ENDPOINTS } from "@creatoros/contract";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import { createIngestionService } from "./ingestion.service";
import {
  createIngestionTransport,
  INGESTION_OP_IDS,
} from "./ingestion.transport";
import { createIngestionRepository } from "./ingestion.repository";
import {
  ingestionRunResource,
  douyinThrottleStatusResource,
} from "./ingestion.schema";
import { UnsupportedOperationError } from "./ingestion.errors";
import { makeFakePorts } from "./ingestion.test-helpers";

// Task 5 — contract conformance. Drive each of the 7 ops through the transport
// against a seeded pglite store; ingestionRunResource.parse(envelope.data)
// succeeds and meta carries requestId. An unknown op id → UnsupportedOperationError.

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = {
  userId: "user-a",
  requestId: "req-1",
  source: "user",
  accountId: "acct-a", // [T-332 S2] per-account strict
};

const ep = (key: keyof typeof ENDPOINTS): Endpoint =>
  ENDPOINTS[key] as unknown as Endpoint;

async function seedSource(db: Db): Promise<void> {
  let seq = 0;
  const repo = createIngestionRepository(db, {
    now: () => NOW,
    nextId: (p: string) => `${p}-seed-${++seq}`,
    userId: "user-a",
    accountId: "acct-a", // [T-332 S2] seed 带号
  });
  await repo.seedExternalSources([
    {
      id: "src-a",
      userId: "user-a",
      accountId: "acct-a",
      sourceType: "mock",
      name: "Mock",
      sourceIdentifier: "mock://x",
      secretReference: "",
      configuration: {},
      createdAt: NOW,
    },
  ]);
}

describe("ingestion contract conformance", () => {
  let db: Db;
  let transport: ReturnType<typeof createIngestionTransport>;

  beforeEach(async () => {
    ({ db } = await createDb());
    await seedSource(db);
    let seq = 0;
    const service = createIngestionService({
      deps: { now: () => NOW, nextId: (p: string) => `${p}-${++seq}` },
      ports: makeFakePorts(),
      db,
    });
    transport = createIngestionTransport(() => service);
  });

  // [T-248 批C] 四个 batch-push op(runs.metrics/knowledge/assets/artifacts)已删。
  it("exposes exactly the 7 ingestion op ids (run create/complete/get + 抖音刷新 + 抖音扫码登录 + 抖音状态探针 + 抖音限流可观测)", () => {
    expect([...INGESTION_OP_IDS].sort()).toEqual(
      [
        "ingestion.runs.create",
        "ingestion.douyin.refresh",
        "ingestion.douyin.login",
        "ingestion.douyin.status",
        "ingestion.douyin.throttleStatus",
        "ingestion.runs.complete",
        "ingestion.runs.get",
      ].sort(),
    );
  });

  it("ingestion.runs.create → ingestionRunResource", async () => {
    const env = await transport.request(
      ep("createRun"),
      {
        body: {
          externalSourceId: "src-a",
          runType: "metrics",
          idempotencyKey: "idem-1",
        },
      } as never,
      ctx,
    );
    const { data, meta } = env as { data: unknown; meta: Record<string, unknown> };
    expect(() => ingestionRunResource.parse(data)).not.toThrow();
    expect(meta.requestId).toBe("req-1");
    expect(JSON.stringify(data)).not.toContain("userId");
    expect(JSON.stringify(data)).not.toContain("user_id");
  });

  // [T-248 批C] 四个 batch-push op 的透传用例已随契约 op 删除;service 层
  // ingestMetrics/ingestKnowledge/… 的覆盖在 ingestion.service 相关测试里,不受影响。
  it("complete / get all return ingestionRunResource", async () => {
    const created = (await transport.request(
      ep("createRun"),
      {
        body: {
          externalSourceId: "src-a",
          runType: "metrics",
          idempotencyKey: "idem-flow",
        },
      } as never,
      ctx,
    )) as { data: { id: string } };
    const runId = created.data.id;

    const completed = await transport.request(
      ep("completeRun"),
      { params: { runId }, body: {} } as never,
      ctx,
    );
    expect(() =>
      ingestionRunResource.parse((completed as { data: unknown }).data),
    ).not.toThrow();

    const got = await transport.request(
      ep("getRun"),
      { params: { runId } } as never,
      ctx,
    );
    expect(() =>
      ingestionRunResource.parse((got as { data: unknown }).data),
    ).not.toThrow();
  });

  // T-038c 读侧:限流快照 op 走 transport。端口未注入(本 describe 的默认 service)→ 空 channels。
  it("ingestion.douyin.throttleStatus → 端口未注入返空 channels(诚实退化)", async () => {
    const env = await transport.request(
      ep("throttleStatusDouyin"),
      {} as never,
      ctx,
    );
    const { data, meta } = env as {
      data: unknown;
      meta: Record<string, unknown>;
    };
    const parsed = douyinThrottleStatusResource.parse(data);
    expect(parsed.channels).toEqual([]);
    expect(meta.requestId).toBe("req-1");
  });

  // 注入 fake 端口(某 channel 正 cooldown)→ 快照返 cooldownActive+eta;另一 channel inactive。
  it("ingestion.douyin.throttleStatus → cooldown 时返 cooldownActive+eta,非 cooldown 返 inactive", async () => {
    let seq = 0;
    const service = createIngestionService({
      deps: { now: () => NOW, nextId: (p: string) => `${p}-${++seq}` },
      ports: makeFakePorts(),
      db,
      throttleStatus: {
        read: () => ({
          channels: [
            {
              channel: "creator-center",
              cooldownActive: true,
              cooldownEtaMs: 90_000,
              consecutiveThrottles: 2,
              lastRequestAt: 1_700_000_000_000,
            },
            {
              channel: "iesdouyin",
              cooldownActive: false,
              cooldownEtaMs: 0,
              consecutiveThrottles: 0,
              lastRequestAt: null,
            },
          ],
        }),
      },
    });
    const t = createIngestionTransport(() => service);
    const env = await t.request(ep("throttleStatusDouyin"), {} as never, ctx);
    const parsed = douyinThrottleStatusResource.parse(
      (env as { data: unknown }).data,
    );
    const cc = parsed.channels.find((c) => c.channel === "creator-center")!;
    const ies = parsed.channels.find((c) => c.channel === "iesdouyin")!;
    expect(cc.cooldownActive).toBe(true);
    expect(cc.cooldownEtaMs).toBe(90_000);
    expect(cc.consecutiveThrottles).toBe(2);
    expect(ies.cooldownActive).toBe(false);
    expect(ies.cooldownEtaMs).toBe(0);
  });

  it("unknown op id → UnsupportedOperationError", async () => {
    await expect(
      transport.request(
        { id: "ingestion.unknown" } as Endpoint,
        {} as never,
        ctx,
      ),
    ).rejects.toBeInstanceOf(UnsupportedOperationError);
  });

  it("no ctx → AuthenticationError (unauthenticated dispatch)", async () => {
    await expect(
      transport.request(ep("getRun"), { params: { runId: "x" } } as never),
    ).rejects.toThrow();
  });
});
