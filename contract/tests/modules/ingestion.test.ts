import { describe, it, expect } from "vitest";
import {
  ingestionRunResource,
  douyinThrottleStatusResource,
} from "../../src/resources/ingestion";
import { ingestionOperations } from "../../src/operations/ingestion";

describe("ingestion contract", () => {
  it("parses an IngestionRun resource", () => {
    const run = ingestionRunResource.parse({
      id: "run-1",
      externalSourceId: "extsource-bilibili-metrics",
      runType: "metrics",
      idempotencyKey: "run-1-2026-06-12",
      status: "completed",
      recordsReceived: 8,
      recordsWritten: 7,
      recordsRejected: 1,
      startedAt: "2026-06-12T02:00:00.000Z",
      completedAt: "2026-06-12T02:01:00.000Z",
    });
    expect(run.recordsWritten).toBe(7);
    expect(run.status).toBe("completed");
  });

  it("allows null start/completion timestamps", () => {
    const run = ingestionRunResource.parse({
      id: "run-2",
      externalSourceId: "extsource-bilibili-metrics",
      runType: "metrics",
      idempotencyKey: "run-2",
      status: "pending",
      recordsReceived: 0,
      recordsWritten: 0,
      recordsRejected: 0,
      startedAt: null,
      completedAt: null,
    });
    expect(run.startedAt).toBeNull();
  });

  // [T-248 批C] pushMetrics 等四个 batch-push op 已删,断言只留 createRun。
  it("registers the create-run endpoint", () => {
    expect(ingestionOperations.createRun.method).toBe("POST");
    expect(ingestionOperations.createRun.path).toBe("/ingestion/runs");
    expect(ingestionOperations.createRun.fr.length).toBeGreaterThan(0);
    expect("pushMetrics" in ingestionOperations).toBe(false);
    expect("pushKnowledge" in ingestionOperations).toBe(false);
    expect("pushAssets" in ingestionOperations).toBe(false);
    expect("pushArtifacts" in ingestionOperations).toBe(false);
  });

  // T-038c 采集限流可观测:只读 GET op + channel 快照 resource。
  it("registers the douyin throttle-status read op (GET, no body)", () => {
    const op = ingestionOperations.throttleStatusDouyin;
    expect(op.id).toBe("ingestion.douyin.throttleStatus");
    expect(op.method).toBe("GET");
    expect(op.path).toBe("/ingestion/douyin/throttle-status");
    // 只读探针:无请求 body(照 statusDouyin)。
    expect(op.body).toBeUndefined();
    expect(op.fr.length).toBeGreaterThan(0);
  });

  it("[T-546] 抖音登录兼容旧空 body，并只接受受控的热点宝授权目标", () => {
    const body = ingestionOperations.loginDouyin.body;
    expect(body?.parse(undefined)).toBeUndefined();
    expect(
      body?.parse({
        accountId: "account-1",
        site: "douhot.douyin.com",
      }),
    ).toEqual({
      accountId: "account-1",
      site: "douhot.douyin.com",
    });
    expect(() =>
      body?.parse({
        accountId: "account-1",
        site: "untrusted.example.com",
      }),
    ).toThrow();
  });

  it("parses a douyin throttle-status snapshot (cooldown active)", () => {
    const snap = douyinThrottleStatusResource.parse({
      channels: [
        {
          channel: "creator-center",
          cooldownActive: true,
          cooldownEtaMs: 42_000,
          consecutiveThrottles: 3,
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
    });
    expect(snap.channels).toHaveLength(2);
    expect(snap.channels[0]!.cooldownActive).toBe(true);
    expect(snap.channels[0]!.cooldownEtaMs).toBe(42_000);
    expect(snap.channels[1]!.lastRequestAt).toBeNull();
  });

  it("accepts an empty channels array (gateway 未配/退化态)", () => {
    const snap = douyinThrottleStatusResource.parse({ channels: [] });
    expect(snap.channels).toEqual([]);
  });
});
