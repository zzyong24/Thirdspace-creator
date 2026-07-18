import { describe, it, expect, beforeEach } from "vitest";
import {
  createDb,
  type Db,
  activationState,
  ENC_PREFIX,
  isEncrypted,
  eq,
} from "@creatoros/backend";
import { createActivationRepository } from "./activation-repository";
import type {
  ActivationSecurityMirror,
  StoredActivation,
} from "./activation-service";

// T-147 P5 —— activation_state 持久层(真 pglite,迁移 0027 建表 + 0049 安全三列)单测。
// 覆盖:写→读回;code 加密落库(masterKey 注入时列是密文,读回明文);单行 upsert(第二次写覆盖);
//   clear;缺 masterKey 明文透传(降级);[T-372 L2] writeMirror 展示副本 upsert(三列落库)。

const KEY = Buffer.alloc(32, 9);

function fixture(over: Partial<StoredActivation> = {}): StoredActivation {
  return {
    machineId: "M1",
    code: "PLAINTEXT-CODE",
    licenseMode: "TIME",
    projectKey: "test",
    expiresAt: "2027-07-06T00:00:00.000Z",
    activatedAt: "2026-07-06T00:00:00.000Z",
    lastOnlineCheckAt: "2026-07-06T00:00:00.000Z",
    // [T-372 L2] 安全门展示副本三列(P5 写路径默认空值)。
    lastSeenAt: null,
    graceSeconds: null,
    revoked: false,
    ...over,
  };
}

function mirrorFixture(
  over: Partial<ActivationSecurityMirror> = {},
): ActivationSecurityMirror {
  return {
    machineId: "M1",
    code: "MIRROR-CODE",
    licenseMode: "TIME",
    projectKey: "test",
    expiresAt: "2026-07-20T12:00:00Z",
    activatedAt: "2026-07-17T12:00:00Z",
    lastOnlineCheckAt: "2026-07-17T12:00:00Z",
    lastSeenAt: "2026-07-17T12:00:00Z",
    graceSeconds: 86400,
    revoked: false,
    ...over,
  };
}

describe("activation repository (pglite)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("write→read 往返(masterKey 注入)", async () => {
    const repo = createActivationRepository(db, { masterKey: KEY });
    await repo.write(fixture());
    const read = await repo.read();
    expect(read).toEqual(fixture());
  });

  it("code 加密落库:DB 底层列是 enc:v1: 密文,非明文", async () => {
    const repo = createActivationRepository(db, { masterKey: KEY });
    await repo.write(fixture({ code: "SECRET-XYZ" }));
    const rows = await db
      .select()
      .from(activationState)
      .where(eq(activationState.id, "singleton"));
    expect(rows[0]!.code.startsWith(ENC_PREFIX)).toBe(true);
    expect(isEncrypted(rows[0]!.code)).toBe(true);
    expect(rows[0]!.code).not.toContain("SECRET-XYZ");
  });

  it("单行 upsert:第二次写覆盖(不新增行)", async () => {
    const repo = createActivationRepository(db, { masterKey: KEY });
    await repo.write(fixture({ code: "C1", expiresAt: "2027-01-01T00:00:00.000Z" }));
    await repo.write(fixture({ code: "C2", expiresAt: "2028-01-01T00:00:00.000Z" }));
    const all = await db.select().from(activationState);
    expect(all).toHaveLength(1);
    const read = await repo.read();
    expect(read?.code).toBe("C2");
    expect(read?.expiresAt).toBe("2028-01-01T00:00:00.000Z");
  });

  it("clear 删除激活态 → read 返回 null", async () => {
    const repo = createActivationRepository(db, { masterKey: KEY });
    await repo.write(fixture());
    await repo.clear();
    expect(await repo.read()).toBeNull();
  });

  it("无本地态 → read 返回 null", async () => {
    const repo = createActivationRepository(db, { masterKey: KEY });
    expect(await repo.read()).toBeNull();
  });

  it("缺 masterKey → 明文透传(降级,向后兼容)", async () => {
    const repo = createActivationRepository(db);
    await repo.write(fixture({ code: "PLAIN" }));
    const rows = await db.select().from(activationState);
    // 无 key = 明文落库(与 settings.repository 缺省语义一致)。
    expect(rows[0]!.code).toBe("PLAIN");
    expect(isEncrypted(rows[0]!.code)).toBe(false);
    const read = await repo.read();
    expect(read?.code).toBe("PLAIN");
  });

  // ── [T-372 L2] Rust 壳展示副本同步入口 ─────────────────────────────────────
  it("writeMirror:整行 upsert,三列安全态落库,code 仍加密", async () => {
    const repo = createActivationRepository(db, { masterKey: KEY });
    await repo.writeMirror(mirrorFixture({ revoked: true, graceSeconds: 2592000 }));
    const rows = await db.select().from(activationState);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lastSeenAt).toBe("2026-07-17T12:00:00Z");
    expect(rows[0]!.graceSeconds).toBe(2592000);
    expect(rows[0]!.revoked).toBe(1);
    expect(isEncrypted(rows[0]!.code)).toBe(true);
    const read = await repo.read();
    expect(read?.code).toBe("MIRROR-CODE");
    expect(read?.revoked).toBe(true);
    expect(read?.graceSeconds).toBe(2592000);
  });

  it("writeMirror 覆盖既有 P5 行(单行不变式),后续 write 不抹安全三列以外的镜像", async () => {
    const repo = createActivationRepository(db, { masterKey: KEY });
    await repo.write(fixture());
    await repo.writeMirror(mirrorFixture());
    const all = await db.select().from(activationState);
    expect(all).toHaveLength(1);
    const read = await repo.read();
    expect(read?.code).toBe("MIRROR-CODE");
    expect(read?.lastSeenAt).toBe("2026-07-17T12:00:00Z");
    // P5 写路径(write)再跑:领域字段更新,但不动 upsert set 里的安全三列(展示副本来源单一)。
    await repo.write(fixture({ code: "C-NEW" }));
    const read2 = await repo.read();
    expect(read2?.code).toBe("C-NEW");
    expect(read2?.lastSeenAt).toBe("2026-07-17T12:00:00Z");
  });
});
