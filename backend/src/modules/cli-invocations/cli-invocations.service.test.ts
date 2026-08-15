import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RequestContext } from "@creatoros/contract";

import { createDb, type Db } from "../../db";
import { cliInvocationResults, cliInvocations } from "../../schema/cli-invocations";
import { createCliInvocationService, type CliInvocationService } from "./cli-invocations.service";

describe("T-843 CLI invocation gateway", () => {
  let db: Db;
  let close: (() => Promise<void>) | undefined;
  let service: CliInvocationService;
  let sequence = 0;
  let now = new Date().toISOString();

  beforeEach(async () => {
    const created = await createDb();
    db = created.db;
    close = () => created.client.close();
    service = createCliInvocationService({
      db,
      masterKey: Buffer.alloc(32, 7),
      now: () => now,
      nextId: (prefix) => `${prefix}-${++sequence}`,
    });
  });

  afterEach(async () => close?.());

  const ctx = (accountId: string): RequestContext => ({
    userId: "user-cli",
    accountId,
    requestId: `request-${accountId}`,
    source: "user",
  });

  const input = {
    operation: "projects.create",
    effect: "write" as const,
    clientId: "cli-client-a",
    idempotencyKey: "same-key",
    inputHash: "sha256:aaa",
    targetRefs: ["project:new"],
  };

  it("同 scope、operation、key、hash 返回加密缓存结果而不再执行", async () => {
    const first = await service.begin(ctx("acct-a"), input);
    expect(first.kind).toBe("execute");
    if (first.kind !== "execute") return;
    const response = { data: { id: "project-1" }, meta: { requestId: "request-acct-a" } };
    await service.succeed(first.invocationId, response);

    const duplicate = await service.begin(ctx("acct-a"), input);
    expect(duplicate).toMatchObject({ kind: "cached", response });
    const rows = await db.select().from(cliInvocations);
    const results = await db.select().from(cliInvocationResults);
    expect(rows).toHaveLength(1);
    expect(results[0]?.resultEncrypted).toMatch(/^enc:v1:/);
    expect(results[0]?.resultEncrypted).not.toContain("project-1");
    expect(rows[0]).not.toHaveProperty("resultEncrypted");
  });

  it("同 key 不同 hash 冲突，三个账号同 key 则彼此独立", async () => {
    const perAccount = await Promise.all([
      service.begin(ctx("acct-a"), input),
      service.begin(ctx("acct-b"), input),
      service.begin(ctx("acct-c"), input),
    ]);
    expect(perAccount.map((item) => item.kind)).toEqual(["execute", "execute", "execute"]);

    const conflict = await service.begin(ctx("acct-a"), {
      ...input,
      inputHash: "sha256:different",
    });
    expect(conflict.kind).toBe("conflict");
  });

  it("结果过期只返回 result_expired 收据，绝不重放业务写入", async () => {
    const first = await service.begin(ctx("acct-a"), input);
    if (first.kind !== "execute") throw new Error("expected execute");
    await service.succeed(first.invocationId, { data: { id: "project-1" } });
    now = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();

    const duplicate = await service.begin(ctx("acct-a"), input);
    expect(duplicate).toMatchObject({
      kind: "receipt",
      receipt: { status: "succeeded", resultExpired: true },
    });
    expect(await db.select().from(cliInvocationResults)).toHaveLength(0);
  });

  it("旧 running 记录转 outcome_unknown 并要求人工核对", async () => {
    now = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const first = await service.begin(ctx("acct-a"), input);
    expect(first.kind).toBe("execute");
    now = new Date().toISOString();

    const duplicate = await service.begin(ctx("acct-a"), input);
    expect(duplicate).toMatchObject({
      kind: "receipt",
      receipt: {
        status: "outcome_unknown",
        outcomeUnknown: true,
        manualReconcileRequired: true,
      },
    });
  });

  it("旧 contract 版本或损坏结果缓存只返回收据且物理删除", async () => {
    const first = await service.begin(ctx("acct-a"), input);
    if (first.kind !== "execute") throw new Error("expected execute");
    await service.succeed(first.invocationId, { data: { id: "project-1" } });
    await db
      .update(cliInvocationResults)
      .set({ responseSchemaVersion: "contract:old" });

    const duplicate = await service.begin(ctx("acct-a"), input);
    expect(duplicate).toMatchObject({
      kind: "receipt",
      receipt: { status: "succeeded", resultExpired: true },
    });
    expect(await db.select().from(cliInvocationResults)).toHaveLength(0);
  });
});
