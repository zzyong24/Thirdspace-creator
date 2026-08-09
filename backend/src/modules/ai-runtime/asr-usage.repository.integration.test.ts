import { afterEach, describe, expect, it } from "vitest";
import { createDb, type RequestContext } from "@creatoros/backend";

import { createAsrUsageRepository } from "./asr-usage.repository";

const ctx: RequestContext = {
  userId: "user-a",
  accountId: "account-a",
  requestId: "request-a",
  source: "user",
};

describe("T-731 ASR usage intent", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function setup() {
    const { db, client } = await createDb();
    close = () => client.close();
    let id = 0;
    return createAsrUsageRepository(db, {
      now: () => "2026-08-08T12:00:00.000Z",
      nextId: (prefix) => `${prefix}-${++id}`,
    });
  }

  const input = {
    intentId: "task:t1:aweme:w1",
    idempotencyKey: "creatoros-asr-12345678",
    requestFingerprint: `sha256:${"a".repeat(64)}`,
    serviceId: "qwen-asr-main" as const,
    durationSeconds: 60,
    byteLength: 480_000,
  };

  it("在申请 lease 前持久化 intent，重试复用同一行", async () => {
    const repo = await setup();
    const first = await repo.begin(ctx, input);
    const replay = await repo.begin({ ...ctx, requestId: "request-retry" }, input);
    expect(replay.id).toBe(first.id);
    expect(replay.reconcileState).toBe("requesting");
    expect(JSON.stringify(replay)).not.toMatch(/token|ticket|machineId|音频正文/);
  });

  it("同幂等键改请求内容失败关闭", async () => {
    const repo = await setup();
    await repo.begin(ctx, input);
    await expect(repo.begin(ctx, {
      ...input,
      requestFingerprint: `sha256:${"b".repeat(64)}`,
    })).rejects.toThrow("ASR_USAGE_IDEMPOTENCY_CONFLICT");
  });

  it("保留 leaseRef 与固定收费事实，provider 失败进入待核对而非假退款", async () => {
    const repo = await setup();
    await repo.begin(ctx, input);
    await repo.recordLease(ctx, input.intentId, {
      leaseRef: "lease-support-ref",
      chargedUnits: 25_000,
      expiresAt: "2026-08-08T12:01:00.000Z",
    });
    await repo.recordFallbackPending(ctx, input.intentId, "PROVIDER_TIMEOUT");
    const [pending] = await repo.listPending(ctx);
    expect(pending).toMatchObject({
      leaseRef: "lease-support-ref",
      chargedUnits: 25_000,
      providerOutcome: "failed",
      fallbackReason: "PROVIDER_TIMEOUT",
      reconcileState: "reconcile_pending",
    });
  });

  it("响应是否签发不确定时标人工核对，不伪造 used/refunded", async () => {
    const repo = await setup();
    await repo.begin(ctx, input);
    await repo.recordLeaseUncertain(ctx, input.intentId, "ASR_LEASE_UNAVAILABLE");
    expect(await repo.listPending(ctx)).toEqual([]);
  });
});
