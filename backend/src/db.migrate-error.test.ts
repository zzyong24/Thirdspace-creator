import { describe, it, expect, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

// [DATA-H09] 迁移阶段失败**绝不**隔离原目录 + 空库(那才是「数据全没了」的错误路径)。
//
// 老实现:createDb 捕获 openAndMigrate 的**所有**异常 → 一律改名 `.corrupt-*` + 建空库。
// 迁移 SQL / 权限 / 磁盘错误也被当成「库损坏」→ 用户表现为数据全丢且无恢复入口。
//
// 本文件把 pglite migrator **mock 成必抛**,让「打开阶段」真跑(库能开、SELECT 1 通),
// 但「迁移阶段」失败,断言:createDb **原样抛出**迁移错误、**不**改名、原目录分毫未动。
// 这条与 db.driver.test.ts 里「真损坏(缺 pg_control → WASM Aborted)仍走隔离+重建」的
// T-175 集成测试互为对照 —— 两个方向都锁死,证明精确收窄没误伤真损坏恢复。
//
// migrator mock 是文件级(vi.mock hoist),故本用例单独成文件:此文件里所有 createDb 的
// 迁移都会抛,不影响其它测试文件的真迁移。

const migrateMock = vi.fn(async () => {
  // 模拟一条普通迁移 SQL 失败(Postgres 报错,无 fs code)—— 属「迁移阶段」,非库损坏。
  throw Object.assign(new Error('migration failed: syntax error at or near "OOPS"'), {
    // 迁移 SQL 错误不带文件系统 errno code(不是 EACCES/ENOSPC 一类)。
  });
});

vi.mock("drizzle-orm/pglite/migrator", () => ({
  migrate: migrateMock,
}));

// db.ts 静态 import 了 migrate,mock 必须在其被引入前登记(vi.mock 已 hoist)。动态引入 createDb。
async function loadCreateDb() {
  const mod = await import("./db");
  return mod.createDb;
}

const tmpDirs: string[] = [];
async function freshTmp(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  migrateMock.mockClear();
  while (tmpDirs.length) {
    const d = tmpDirs.pop()!;
    await fs.rm(d, { recursive: true, force: true });
  }
});

describe("[DATA-H09] 迁移阶段失败 → 如实上抛,绝不隔离+空库", () => {
  it("迁移抛错时:createDb 原样抛、不建 .corrupt-* 隔离目录、原数据目录保持不动", async () => {
    const createDb = await loadCreateDb();
    const base = await freshTmp("creatoros-migfail-");
    const dir = path.join(base, "db");

    // 库能被打开(openPglite 的 SELECT 1 探针会通),但迁移被 mock 成抛错。
    await expect(createDb({ dataDir: dir })).rejects.toThrow(/migration failed/);

    // 迁移在「打开成功」之后失败 → 库确实被 mock 调用过一次(证明走到了迁移阶段,非打开阶段)。
    expect(migrateMock).toHaveBeenCalledTimes(1);

    // 关键断言:**没有**任何 `db.corrupt-*` 隔离目录被创建 —— 迁移错误没有被当成库损坏。
    const siblings = (await fs.readdir(base)).filter((n) =>
      n.startsWith("db.corrupt-"),
    );
    expect(siblings).toHaveLength(0);

    // 原目录仍在(PGlite 打开时已建;数据/文件未被改名移走)—— 数据没「全没了」。
    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  }, 30_000);

  it("迁移失败在内存库(无 dataDir)同样原样抛(无目录可隔离,不触发降级)", async () => {
    const createDb = await loadCreateDb();
    await expect(createDb()).rejects.toThrow(/migration failed/);
  }, 30_000);
});
