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
    inputFingerprint: `sha256:${"1".repeat(64)}`,
    sourceRef: "douyin:aweme:w1",
    trigger: "task:t1",
    authorityDigest: `sha256:${"2".repeat(64)}`,
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
      inputFingerprint: `sha256:${"b".repeat(64)}`,
    })).rejects.toThrow("ASR_USAGE_IDEMPOTENCY_CONFLICT");
  });

  it("恢复时重新估算不同仍读取首次冻结的 canonical body", async () => {
    const repo = await setup();
    const first = await repo.begin(ctx, input);
    const replay = await repo.begin({ ...ctx, requestId: "request-retry" }, {
      ...input,
      requestFingerprint: `sha256:${"c".repeat(64)}`,
      durationSeconds: 61,
      byteLength: 488_000,
    });
    expect(replay.id).toBe(first.id);
    expect(replay).toMatchObject({
      requestFingerprint: input.requestFingerprint,
      durationSeconds: 60,
      byteLength: 480_000,
    });
  });

  it("同一 source 同时只有一个 active operation，终态后才允许新操作", async () => {
    const repo = await setup();
    await repo.begin(ctx, input);
    const next = {
      ...input,
      intentId: "task:t2:aweme:w1",
      idempotencyKey: "creatoros-asr-87654321",
      inputFingerprint: `sha256:${"3".repeat(64)}`,
    };
    await expect(repo.begin(ctx, next)).rejects.toThrow("ASR_USAGE_ACTIVE_CONFLICT");
    await repo.recordProviderFailed(ctx, input.intentId, "PROVIDER_TIMEOUT");
    await expect(repo.begin(ctx, next)).resolves.toMatchObject({ intentId: next.intentId });
  });

  it("保留 leaseRef 与固定收费事实，provider 失败进入待核对而非假退款", async () => {
    const repo = await setup();
    await repo.begin(ctx, input);
    await repo.recordLease(ctx, input.intentId, {
      leaseRef: "lease-support-ref",
      chargedUnits: 25_000,
      expiresAt: "2026-08-08T12:01:00.000Z",
    });
    await repo.recordProviderFailed(ctx, input.intentId, "PROVIDER_TIMEOUT");
    const [row] = await repo.listByIntent(ctx, input.intentId);
    expect(row).toMatchObject({
      leaseRef: "lease-support-ref",
      chargedUnits: 25_000,
      providerOutcome: "charged_provider_failed",
      fallbackReason: "PROVIDER_TIMEOUT",
      reconcileState: "terminal",
    });
  });

  it("响应是否签发不确定时标人工核对，不伪造 used/refunded", async () => {
    const repo = await setup();
    await repo.begin(ctx, input);
    await repo.recordLeaseUncertain(ctx, input.intentId, "ASR_LEASE_UNAVAILABLE");
    expect(await repo.listPending(ctx)).toEqual([]);
  });

  it("签发后过期与已释放保留不同收费终态", async () => {
    const repo = await setup();
    await repo.begin(ctx, input);
    await repo.recordLeaseStatus(ctx, input.intentId, {
      result: "charged_expired",
      leaseRef: "lease-expired-ref",
      chargedUnits: 25_000,
    });
    const [expired] = await repo.listByIntent(ctx, input.intentId);
    expect(expired).toMatchObject({
      providerOutcome: "charged_expired",
      reconcileState: "terminal",
      chargedUnits: 25_000,
    });

    const releasedInput = {
      ...input,
      intentId: "task:t2:aweme:w1",
      idempotencyKey: "creatoros-asr-released-1234",
    };
    await repo.begin(ctx, releasedInput);
    await repo.recordLeaseStatus(ctx, releasedInput.intentId, {
      result: "released",
      leaseRef: "lease-released-ref",
      chargedUnits: 0,
    });
    const [released] = await repo.listByIntent(ctx, releasedInput.intentId);
    expect(released).toMatchObject({
      providerOutcome: "released",
      reconcileState: "terminal",
      chargedUnits: 0,
    });
  });
});
