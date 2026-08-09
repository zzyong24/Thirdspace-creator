import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, type RequestContext } from "@creatoros/backend";
import { isEncrypted } from "@creatoros/backend";

import { channelModelCredentials } from "./settings.db-schema";
import { createSettingsRepository } from "./settings.repository";

const ctxA: RequestContext = { userId: "user-a", requestId: "req-a", source: "user" };
const ctxB: RequestContext = { userId: "user-b", requestId: "req-b", source: "user" };
const KEY = Buffer.alloc(32, 9);

describe("T-645 渠道 service Key 本地隔离存储", () => {
  it("按 user + scope + service 加密保存并可供 resolver 读取", async () => {
    const { db } = await createDb();
    const repo = createSettingsRepository(db, {
      now: () => "2026-08-02T00:00:00.000Z",
      nextId: (prefix) => `${prefix}-1`,
      masterKey: KEY,
    });

    await repo.putChannelModelCredential(ctxA, "scope-a", "service-text", "sk-secret");
    const raw = await db
      .select()
      .from(channelModelCredentials)
      .where(
        and(
          eq(channelModelCredentials.userId, ctxA.userId),
          eq(channelModelCredentials.scopeId, "scope-a"),
          eq(channelModelCredentials.serviceId, "service-text"),
        ),
      );
    expect(raw).toHaveLength(1);
    expect(isEncrypted(raw[0]!.encryptedSecret)).toBe(true);
    expect(raw[0]!.encryptedSecret).not.toContain("sk-secret");
    await expect(
      repo.getChannelModelCredential(ctxA, "scope-a", "service-text"),
    ).resolves.toBe("sk-secret");
  });

  it("同 service 在不同用户或不同 scope 不可见，切回原 scope 可读", async () => {
    const { db } = await createDb();
    const repo = createSettingsRepository(db, {
      now: () => "2026-08-02T00:00:00.000Z",
      nextId: (prefix) => `${prefix}-1`,
      masterKey: KEY,
    });
    await repo.putChannelModelCredential(ctxA, "scope-a", "service-asr", "sk-asr");

    await expect(
      repo.getChannelModelCredential(ctxA, "scope-b", "service-asr"),
    ).resolves.toBeNull();
    await expect(
      repo.getChannelModelCredential(ctxB, "scope-a", "service-asr"),
    ).resolves.toBeNull();
    await expect(
      repo.getChannelModelCredential(ctxA, "scope-a", "service-asr"),
    ).resolves.toBe("sk-asr");
  });

  it("没有 desktop master key 时拒绝保存，不降级成明文", async () => {
    const { db } = await createDb();
    const repo = createSettingsRepository(db, {
      now: () => "2026-08-02T00:00:00.000Z",
      nextId: (prefix) => `${prefix}-1`,
    });

    await expect(
      repo.putChannelModelCredential(ctxA, "scope-a", "service-text", "sk-plain"),
    ).rejects.toThrow(/master key/);
  });
});
