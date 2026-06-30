import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  resolveDbDriver,
  defaultPgliteDataDir,
  createConfiguredDb,
  createDb,
} from "./index";
import { projects } from "./schema/projects";
import { users } from "./schema/identity";

// ── L0 本地优先存储:driver 选择优先级 + file-PGlite 落盘/迁移/重启/并发(SPEC §4.1/§7-L0)──
//
// resolveDbDriver 是纯函数(注入 env/cwd),所以优先级矩阵零 I/O 极快。落盘相关用
// 系统临时目录隔离,afterEach 清理 —— 不碰用户真目录,不依赖全局 process.env。

const tmpDirs: string[] = [];
async function freshTmp(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop()!;
    await fs.rm(d, { recursive: true, force: true });
  }
});

describe("resolveDbDriver 优先级(L0 三态)", () => {
  it("DATABASE_URL 最高优先 → postgres(即便同时设了 PGLITE_DATA_DIR)", () => {
    const r = resolveDbDriver({
      env: {
        DATABASE_URL: "postgres://x/y",
        PGLITE_DATA_DIR: "/tmp/ignored",
      },
      cwd: "/repo",
    });
    expect(r.kind).toBe("postgres");
    expect(r.target).toBe("postgres://x/y");
  });

  it("无 DATABASE_URL + 有 PGLITE_DATA_DIR → file-pglite(目录解析为绝对路径)", () => {
    const r = resolveDbDriver({
      env: { PGLITE_DATA_DIR: "/tmp/creatoros-l0-test" },
      cwd: "/repo",
    });
    expect(r.kind).toBe("file-pglite");
    expect(r.target).toBe("/tmp/creatoros-l0-test");
  });

  it("PGLITE_DATA_DIR 相对路径 → 相对 cwd 解析为绝对", () => {
    const r = resolveDbDriver({
      env: { PGLITE_DATA_DIR: "var/db" },
      cwd: "/repo",
    });
    expect(r.target).toBe(path.join("/repo", "var", "db"));
  });

  it("PGLITE_DATA_DIR 以 ~ 开头 → 展开到 homedir", () => {
    const r = resolveDbDriver({
      env: { PGLITE_DATA_DIR: "~/cr/db" },
      cwd: "/repo",
    });
    expect(r.target).toBe(path.join(os.homedir(), "cr", "db"));
  });

  it("测试态(NODE_ENV=test)无配置 → 内存 pglite(不落盘)", () => {
    const r = resolveDbDriver({ env: { NODE_ENV: "test" }, cwd: "/repo" });
    expect(r.kind).toBe("memory-pglite");
    expect(r.target).toBeUndefined();
  });

  it("测试态(VITEST=1)无配置 → 内存 pglite", () => {
    const r = resolveDbDriver({ env: { VITEST: "1" }, cwd: "/repo" });
    expect(r.kind).toBe("memory-pglite");
  });

  it("runtime(非测试)无任何 DB 配置 → 本地优先默认落盘(file-pglite,非内存)", () => {
    const r = resolveDbDriver({ env: {}, cwd: "/repo" });
    expect(r.kind).toBe("file-pglite");
    expect(r.target).toBe(defaultPgliteDataDir("/repo"));
    expect(r.target).toBe(path.join("/repo", ".data", "pglite"));
  });

  it("runtime 无 PGLITE_DATA_DIR 但有 CREATOROS_DB_DIR → 用它落盘", () => {
    const r = resolveDbDriver({
      env: { CREATOROS_DB_DIR: "/custom/db" },
      cwd: "/repo",
    });
    expect(r.kind).toBe("file-pglite");
    expect(r.target).toBe("/custom/db");
  });
});

describe("file-backed PGlite 落盘 + 迁移一致 + 重启不丢(L0 验收)", () => {
  it("createConfiguredDb(PGLITE_DATA_DIR) → 迁移建表与内存态一致 + 写入落盘后重启仍在", async () => {
    const dir = await freshTmp("creatoros-l0-file-");

    // 第一进程:file-PGlite 启动跑迁移,写一行 user + 一行 project。
    const first = await createConfiguredDb({
      env: { PGLITE_DATA_DIR: dir },
      cwd: dir,
    });
    expect(first.driver.kind).toBe("file-pglite");

    const NOW = "2026-07-01T00:00:00.000Z";
    await first.db.insert(users).values({
      id: "u-l0",
      email: "l0@example.com",
      displayName: "L0 Tester",
      timezone: "UTC",
      locale: "zh-CN",
      passwordHash: "x",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await first.db.insert(projects).values({
      id: "proj-l0",
      userId: "u-l0",
      title: "落盘验收作品",
      brief: "",
      creationMode: "guided",
      status: "active",
      currentStage: "ideation",
      progressPct: 0,
      starred: false,
      startedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await first.dispose(); // 关连接(模拟进程退出)。

    // 第二进程:同目录重开 —— 迁移幂等(不重建),先前两行还在。
    const second = await createConfiguredDb({
      env: { PGLITE_DATA_DIR: dir },
      cwd: dir,
    });
    const got = await second.db.select().from(projects);
    expect(got).toHaveLength(1);
    expect(got[0]?.id).toBe("proj-l0");
    expect(got[0]?.title).toBe("落盘验收作品");
    const gotUsers = await second.db.select().from(users);
    expect(gotUsers.map((u) => u.id)).toContain("u-l0");
    await second.dispose();
  });

  it("file-PGlite 与 内存 PGlite 建出的表集合一致(迁移结果同构)", async () => {
    const dir = await freshTmp("creatoros-l0-parity-");
    const file = await createConfiguredDb({
      env: { PGLITE_DATA_DIR: dir },
      cwd: dir,
    });
    const mem = await createDb(); // 无 dataDir = 内存。

    const TABLES_SQL = `select table_name from information_schema.tables
      where table_schema = 'public' order by table_name`;
    // drizzle 暴露底层 session.execute;两端都是 PgDatabase,SQL 同构。
    const fileTables = await file.db.execute(TABLES_SQL);
    const memTables = await mem.db.execute(TABLES_SQL);
    const names = (r: { rows: Array<Record<string, unknown>> }) =>
      r.rows.map((x) => String(x.table_name)).sort();
    expect(names(fileTables)).toEqual(names(memTables));
    expect(names(fileTables).length).toBeGreaterThan(20); // 全模块表已建。
    await file.dispose();
    await mem.client.close();
  });
});

describe("PGlite 单连接并发落盘(gate 点名:串行化不锁竞争/不丢写)", () => {
  it("N 个并发写 + 同时并发读,全部落盘、计数精确、无丢写/无死锁", async () => {
    const dir = await freshTmp("creatoros-l0-concurrency-");
    const { db, dispose } = await createConfiguredDb({
      env: { PGLITE_DATA_DIR: dir },
      cwd: dir,
    });
    const NOW = "2026-07-01T00:00:00.000Z";
    await db.insert(users).values({
      id: "u-cc",
      email: "cc@example.com",
      displayName: "CC",
      timezone: "UTC",
      locale: "zh-CN",
      passwordHash: "x",
      createdAt: NOW,
      updatedAt: NOW,
    });

    const N = 100;
    // 模拟 后台 drainQueue 异步 worker 与前台 UI 并发对同一 PGlite 连接读写:
    // N 个 insert(写)与 N 个 select count(读)全部 Promise.all 同时发起 ——
    // PGlite 单连接内部串行化 query,断言不丢写(最终精确 N 行)且读不抛错。
    const writes = Array.from({ length: N }, (_, i) =>
      db.insert(projects).values({
        id: `proj-cc-${i}`,
        userId: "u-cc",
        title: `并发作品 ${i}`,
        brief: "",
        creationMode: "guided",
        status: "active",
        currentStage: "ideation",
        progressPct: 0,
        starred: false,
        startedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      }),
    );
    const reads = Array.from({ length: N }, () =>
      db.execute(`select count(*)::int as c from projects`),
    );
    // 写读交错并发(不等写完再读)—— 这正是 drain+UI 的真并发形状。
    const results = await Promise.all([...writes, ...reads]);
    // 读结果都是合法整数(0..N,串行化下单调不减,绝不抛/不卡)。
    const readCounts = results
      .slice(N)
      .map((r) =>
        Number(
          (r as { rows: Array<Record<string, unknown>> }).rows[0]?.c,
        ),
      );
    for (const c of readCounts) {
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(N);
    }

    // 最终一致:精确 N 行,无一丢写。
    const finalRows = await db.select().from(projects);
    expect(finalRows).toHaveLength(N);
    const ids = new Set(finalRows.map((r) => r.id));
    expect(ids.size).toBe(N); // 无重复、无缺失。

    // 落盘验证:dispose 后重开,N 行仍在(并发写真持久化了)。
    await dispose();
    const reopened = await createConfiguredDb({
      env: { PGLITE_DATA_DIR: dir },
      cwd: dir,
    });
    const persisted = await reopened.db.select().from(projects);
    expect(persisted).toHaveLength(N);
    await reopened.dispose();
  });
});
