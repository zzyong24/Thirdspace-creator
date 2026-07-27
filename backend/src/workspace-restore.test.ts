// [T-363] PRESERVE 表迁回单测 —— 同时是「同进程双 file-PGlite 实例」的可行性证明:
// 归档库与新库是两个不同数据目录的 PGlite 实例,在同一 Node 进程内并存读写。
import { mkdtemp, rm, readFile, access, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { count } from "drizzle-orm";

import { createDb, type Db } from "./db";
import { PRESERVE_TABLES } from "./reset-preserve";
import {
  PRESERVE_RESTORE_MARKER,
  findPreserveRestoreCandidate,
  preserveTableRegistryNames,
  restorePreservedUserAssets,
} from "./workspace-restore";
import { users, sessions } from "./schema/identity";
import {
  accountSkillOverlays,
  accountSkillOverlayVersions,
  modelConfigurations,
  skillConfigOverrides,
  skillConfigOverrideVersions,
} from "./schema/settings";
import { activationState } from "./schema/activation";

// 静音日志(断言只看报告;失败诚实语义由 status 承载)。
const silent = () => {};

// file-PGlite(落盘 + 全量迁移)在全量测试并发负载下单库可 >5s,双库用例给足余量。
const HEAVY_TIMEOUT = 120_000;

describe("workspace-restore(T-363 归档后 user 级资产迁回)", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "t363-restore-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  /** 造一个「归档库」:file-PGlite 全量迁移后写入 PRESERVE 样本行,关闭释放句柄。 */
  async function buildArchive(dirName = "db.archived-20260717-000000") {
    const archiveDir = join(root, dirName);
    const { db, client } = await createDb({ dataDir: archiveDir });
    await db.insert(users).values({
      id: "user-zyongzhu",
      email: "old@example.com",
      displayName: "老名字",
      timezone: "Asia/Shanghai",
      locale: "zh-CN",
      passwordHash: "hash",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await db.insert(sessions).values({
      id: "sess-1",
      userId: "user-zyongzhu",
      tokenHash: "tok",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    await db.insert(modelConfigurations).values({
      id: "model-1",
      userId: "user-zyongzhu",
      capability: "default",
      provider: "minimax",
      modelName: "MiniMax-M2",
      secretValue: "enc:v1:abc",
      settings: { temperature: 0.6 },
      apiFormat: "anthropic",
      isDefault: true,
    });
    await db.insert(skillConfigOverrides).values({
      id: "script.draft",
      version: "3",
      template: "用户定制模板",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    await db.insert(skillConfigOverrideVersions).values({
      id: "skover-1",
      overrideId: "script.draft",
      version: "3",
      template: "用户定制模板",
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    await db.insert(accountSkillOverlays).values({
      id: "account-skill-1",
      userId: "user-zyongzhu",
      accountId: "account-a",
      skillId: "script.draft",
      rowRevision: 1,
      observedBaseVersion: "v1",
      overlayVersion: "1",
      overlay: { template: "账号 A 增量模板" },
      updatedBy: "user-zyongzhu",
      createdAt: "2026-07-24T00:00:00.000Z",
      updatedAt: "2026-07-24T00:00:00.000Z",
    });
    await db.insert(accountSkillOverlayVersions).values({
      id: "account-skill-version-1",
      overlayId: "account-skill-1",
      userId: "user-zyongzhu",
      accountId: "account-a",
      skillId: "script.draft",
      rowRevision: 1,
      observedBaseVersion: "v1",
      overlayVersion: "1",
      overlay: { template: "账号 A 增量模板" },
      updatedBy: "user-zyongzhu",
      createdAt: "2026-07-24T00:00:00.000Z",
    });
    await db.insert(activationState).values({
      id: "singleton",
      machineId: "machine-1",
      code: "enc:v1:code",
      licenseMode: "TIME",
      projectKey: "test",
      activatedAt: "2026-06-01T00:00:00.000Z",
      lastOnlineCheckAt: "2026-07-01T00:00:00.000Z",
    });
    await client.close();
    return archiveDir;
  }

  /** 造重置后的「新库」(全量迁移、空表)。 */
  async function buildFreshDb(): Promise<{ db: Db; close: () => Promise<void> }> {
    const dataDir = join(root, "db");
    const { db, client } = await createDb({ dataDir });
    return { db, close: () => client.close() };
  }

  it("迁回映射表覆盖 PRESERVE 清单全量(清单与 reset-db 同源,加表必须登记映射)", () => {
    const registry = new Set(preserveTableRegistryNames());
    for (const t of PRESERVE_TABLES) {
      expect(registry.has(t), `PRESERVE 表 ${t} 缺映射`).toBe(true);
    }
  });

  it("无归档目录 → null(安静快路径)", { timeout: HEAVY_TIMEOUT }, async () => {
    const { db, close } = await buildFreshDb();
    try {
      const report = await restorePreservedUserAssets({
        dataDir: join(root, "db"),
        db,
        log: silent,
      });
      expect(report).toBeNull();
    } finally {
      await close();
    }
  });

  it("round-trip:归档 PRESERVE 行迁回新库 + 落一次性标记 + 规范用户 profile 清空", { timeout: HEAVY_TIMEOUT }, async () => {
    const archiveDir = await buildArchive();
    const { db, close } = await buildFreshDb();
    try {
      const report = await restorePreservedUserAssets({
        dataDir: join(root, "db"),
        db,
        log: silent,
      });
      expect(report).not.toBeNull();
      expect(report!.ok).toBe(true);
      expect(report!.archiveDir).toBe(archiveDir);

      // 各样本表真的迁回来了。
      const models = await db.select().from(modelConfigurations);
      expect(models).toHaveLength(1);
      expect(models[0]!.provider).toBe("minimax");
      expect(models[0]!.secretValue).toBe("enc:v1:abc"); // 密文原样保留
      const overrides = await db.select().from(accountSkillOverlays);
      expect(overrides).toHaveLength(1);
      expect(overrides[0]!.accountId).toBe("account-a");
      expect(overrides[0]!.overlay).toEqual({
        template: "账号 A 增量模板",
      });
      const versions = await db.select().from(accountSkillOverlayVersions);
      expect(versions).toHaveLength(1);
      // [T-513] 旧全局覆盖即使存在于归档库也不得迁回新库。
      expect(await db.select().from(skillConfigOverrides)).toHaveLength(0);
      expect(await db.select().from(skillConfigOverrideVersions)).toHaveLength(
        0,
      );
      const act = await db.select().from(activationState);
      expect(act).toHaveLength(1);
      expect(act[0]!.machineId).toBe("machine-1");
      const sess = await db.select().from(sessions);
      expect(sess).toHaveLength(1);

      // [用户裁决 2026-07-06] 规范用户 profile 清回空白(登录身份保留)。
      const userRows = await db.select().from(users);
      expect(userRows).toHaveLength(1);
      expect(userRows[0]!.displayName).toBe("");
      expect(userRows[0]!.email).toBe("");
      expect(userRows[0]!.passwordHash).toBe("hash");

      // 标记已落归档目录(一次性)。
      const marker = JSON.parse(
        await readFile(join(archiveDir, PRESERVE_RESTORE_MARKER), "utf8"),
      ) as { tables: { table: string }[] };
      expect(marker.tables.length).toBe(PRESERVE_TABLES.length);
    } finally {
      await close();
    }
  });

  it("幂等:标记已落 → 二次启动无候选;新库非空表绝不被覆盖", { timeout: HEAVY_TIMEOUT }, async () => {
    const archiveDir = await buildArchive();
    const { db, close } = await buildFreshDb();
    try {
      const first = await restorePreservedUserAssets({
        dataDir: join(root, "db"),
        db,
        log: silent,
      });
      expect(first!.ok).toBe(true);

      // 用户在迁回后改写模型配置 → 二次运行(即便强行绕过标记)也不得覆盖。
      await db
        .update(modelConfigurations)
        .set({ provider: "anthropic" }); // 全表(样本仅单行)
      const second = await restorePreservedUserAssets({
        dataDir: join(root, "db"),
        db,
        log: silent,
      });
      expect(second).toBeNull(); // 标记生效,直接无候选。

      // 删标记模拟「标记写失败后的重试轮」:各表因非空跳过,数据不被归档旧值覆盖。
      await rm(join(archiveDir, PRESERVE_RESTORE_MARKER));
      const third = await restorePreservedUserAssets({
        dataDir: join(root, "db"),
        db,
        log: silent,
      });
      expect(third).not.toBeNull();
      expect(
        third!.tables.filter((t) => t.status === "skipped-nonempty").length,
      ).toBeGreaterThan(0);
      const models = await db.select().from(modelConfigurations);
      expect(models[0]!.provider).toBe("anthropic"); // 用户新值幸存
    } finally {
      await close();
    }
  });

  it("归档名同形的**文件**(非目录)→ 不算候选,安静跳过", { timeout: HEAVY_TIMEOUT }, async () => {
    await writeFile(join(root, "db.archived-20260717-111111"), "not a directory");
    const { db, close } = await buildFreshDb();
    try {
      const report = await restorePreservedUserAssets({
        dataDir: join(root, "db"),
        db,
        log: silent,
      });
      expect(report).toBeNull();
    } finally {
      await close();
    }
  });

  it("失败诚实:归档目录存在但内容损坏 → ok=false、全表 failed、不落标记", { timeout: HEAVY_TIMEOUT }, async () => {
    const brokenDir = join(root, "db.archived-20260717-222222");
    // 造一个「看起来像 PG 数据目录但打不开」的目录:塞个假 PG_VERSION。
    const { mkdir } = await import("node:fs/promises");
    await mkdir(brokenDir, { recursive: true });
    await writeFile(join(brokenDir, "PG_VERSION"), "999");
    const { db, close } = await buildFreshDb();
    try {
      const report = await restorePreservedUserAssets({
        dataDir: join(root, "db"),
        db,
        log: silent,
      });
      expect(report).not.toBeNull();
      expect(report!.ok).toBe(false);
      expect(report!.tables.every((t) => t.status === "failed")).toBe(true);
      // 不落标记 → 下次启动仍是候选(重试语义)。
      await expect(
        access(join(brokenDir, PRESERVE_RESTORE_MARKER)),
      ).rejects.toThrow();
      // 新库未被污染,启动不被阻断(能正常查询)。
      const countRows = await db.select({ n: count() }).from(users);
      expect(Number(countRows[0]?.n ?? -1)).toBe(0);
    } finally {
      await close();
    }
  });

  it("多个归档目录 → 只处理最新的(时间戳字典序)", { timeout: HEAVY_TIMEOUT }, async () => {
    await buildArchive("db.archived-20260101-000000"); // 旧归档
    const newest = await buildArchive("db.archived-20260717-000000");
    const candidate = await findPreserveRestoreCandidate(join(root, "db"));
    expect(candidate).toBe(newest);
  });
});
