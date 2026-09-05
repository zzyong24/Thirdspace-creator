import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash } from "node:crypto";
import { createDb, browserSessions, eq, sql, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createBrowserSessionsService,
  BrowserSessionCryptoError,
  type BrowserSessionsService,
} from "./browser-sessions.service";

// [T-370a] browser-sessions service 单测(真 pglite db —— 迁移 0047 在测试链真实应用建表)。
// 覆盖:加密往返 / master-key 缺失拒存(绝不明文)/ 解密失败返 null(视为未登录)/
// 非密文行不信任 / upsert 幂等 / user 隔离 / remove / listDomains。

const NOW = "2026-07-17T00:00:00.000Z";
const ctxA: RequestContext = { userId: "user-a", requestId: "r1", source: "user", accountId: null };
const ctxB: RequestContext = { userId: "user-b", requestId: "r2", source: "user", accountId: null };

const KEY_A = createHash("sha256").update("test-master-key-a").digest();
const KEY_B = createHash("sha256").update("test-master-key-b").digest();

const STATE = JSON.stringify({
  cookies: [{ name: "sessionid", value: "s3cr3t", domain: ".chatgpt.com", path: "/" }],
  origins: [
    {
      origin: "https://chatgpt.com",
      localStorage: [{ name: "jwt", value: "eyJ0oken" }],
    },
  ],
});

function makeService(db: Db, masterKey?: Buffer): BrowserSessionsService {
  let seq = 0;
  return createBrowserSessionsService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
    masterKey,
  });
}

describe("browser-sessions service(加密存取,迁移 0047 建表)", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("加密往返:saveState → 落库为 enc:v1: 密文(非明文)→ getState 解回原 JSON", async () => {
    const svc = makeService(db, KEY_A);
    await svc.saveState(ctxA, "chatgpt.com", STATE);

    // 落库必须是密文,库里绝无 cookie 明文片段。
    const rows = await db.select().from(browserSessions);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.stateEncrypted.startsWith("enc:v1:")).toBe(true);
    expect(row.stateEncrypted).not.toContain("s3cr3t");
    expect(row.userId).toBe("user-a");
    expect(row.scopeKind).toBe("web-domain");
    expect(row.scopeKey).toBe("chatgpt.com");

    expect(await svc.getState(ctxA, "chatgpt.com")).toBe(STATE);
  });

  it("master-key 缺失 → saveState 抛人话错拒存,库里零行(绝不明文落库)", async () => {
    const svc = makeService(db, undefined);
    await expect(svc.saveState(ctxA, "chatgpt.com", STATE)).rejects.toThrow(
      BrowserSessionCryptoError,
    );
    await expect(svc.saveState(ctxA, "chatgpt.com", STATE)).rejects.toThrow(
      /拒绝明文/,
    );
    expect(await db.select().from(browserSessions)).toHaveLength(0);
  });

  it("解密失败(换 key)→ getState 返 null(视为未登录),不抛", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await makeService(db, KEY_A).saveState(ctxA, "chatgpt.com", STATE);
      const svcWrongKey = makeService(db, KEY_B);
      expect(await svcWrongKey.getState(ctxA, "chatgpt.com")).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("master-key 缺失时读 → null(不解密、不崩)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await makeService(db, KEY_A).saveState(ctxA, "chatgpt.com", STATE);
      expect(await makeService(db, undefined).getState(ctxA, "chatgpt.com")).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  it("行存在但非密文(异常态)→ 不信任,返 null", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await db.insert(browserSessions).values({
        id: "bsess-hand",
        userId: "user-a",
        scopeKind: "web-domain",
        scopeKey: "x.com",
        stateEncrypted: STATE, // 明文(本 service 从不这样写)
        createdAt: NOW,
        updatedAt: NOW,
      });
      expect(await makeService(db, KEY_A).getState(ctxA, "x.com")).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  it("同 (user, domain) upsert 幂等:二次 save 更新同一行(不新增)", async () => {
    const svc = makeService(db, KEY_A);
    await svc.saveState(ctxA, "chatgpt.com", STATE);
    const STATE2 = JSON.stringify({ cookies: [], origins: [] });
    await svc.saveState(ctxA, "chatgpt.com", STATE2);
    const rows = await db
      .select()
      .from(browserSessions)
      .where(eq(browserSessions.scopeKey, "chatgpt.com"));
    expect(rows).toHaveLength(1);
    expect(await svc.getState(ctxA, "chatgpt.com")).toBe(STATE2);
  });

  it("user 隔离:B 读不到 A 的登录态;remove 只删自己的", async () => {
    const svc = makeService(db, KEY_A);
    await svc.saveState(ctxA, "chatgpt.com", STATE);
    expect(await svc.getState(ctxB, "chatgpt.com")).toBeNull();
    expect(await svc.removeState(ctxB, "chatgpt.com")).toBe(false);
    expect(await svc.removeState(ctxA, "chatgpt.com")).toBe(true);
    expect(await svc.getState(ctxA, "chatgpt.com")).toBeNull();
  });

  it("listDomains 只列自己的域名(不返密文)", async () => {
    const svc = makeService(db, KEY_A);
    await svc.saveState(ctxA, "chatgpt.com", STATE);
    await svc.saveState(ctxA, "github.com", STATE);
    await svc.saveState(ctxB, "zhihu.com", STATE);
    const a = await svc.listDomains(ctxA);
    expect(a.map((d) => d.domain).sort()).toEqual(["chatgpt.com", "github.com"]);
    expect(a[0]).toEqual({ domain: expect.any(String), updatedAt: NOW });
  });

  // [T-378] 迁移 0048:清 T-370a 惰性迁移增殖 bug 写入的 scope_key 脏行(`x.migrated-<ts>`)。
  //   fresh db 已跑过 0048(空表清空,无感);这里造脏行后重放同一条 DELETE,验证:
  //   ① 只删 `.migrated-` 脏行,合法域名行零误伤;② 幂等(重放第二次结果不变)。
  it("[T-378] 迁移 0048 语句:造脏行 → 执行 → 只删净 .migrated- 行,幂等", async () => {
    const svc = makeService(db, KEY_A);
    await svc.saveState(ctxA, "bing.com", STATE); // 合法行(须保留)
    // 增殖 bug 产出的脏行形态(一层 + 嵌套)。
    await svc.saveState(ctxA, "bing.com.migrated-1784300846731", STATE);
    await svc.saveState(
      ctxA,
      "bing.com.migrated-1784300846731.migrated-1784300961712",
      STATE,
    );
    const cleanup = sql`DELETE FROM browser_sessions WHERE scope_key LIKE '%.migrated-%'`;
    await db.execute(cleanup);
    let rows = await db.select().from(browserSessions);
    expect(rows.map((r) => r.scopeKey)).toEqual(["bing.com"]);
    await db.execute(cleanup); // 幂等重放
    rows = await db.select().from(browserSessions);
    expect(rows.map((r) => r.scopeKey)).toEqual(["bing.com"]);
  });
});

describe("版本化会话CAS",()=>{
 it("空记录并发只有一个成功；密文revision不会泄露明文",async()=>{
  const {db,client}=await createDb();try{
   const svc=makeService(db,KEY_A);expect(await svc.getStateVersioned(ctxA,"chatgpt.com")).toEqual({stateJson:null,revision:null});
   const results=await Promise.all([svc.saveStateVersioned(ctxA,"chatgpt.com",STATE,null),svc.saveStateVersioned(ctxA,"chatgpt.com",STATE,null)]);
   expect(results.filter(r=>r.saved)).toHaveLength(1);const got=await svc.getStateVersioned(ctxA,"chatgpt.com");expect(got.stateJson).toBe(STATE);expect(got.revision).toMatch(/^[a-f0-9]{64}$/);
   const rows=await db.select().from(browserSessions);expect(rows).toHaveLength(1);expect(rows[0]!.stateEncrypted).not.toContain("s3cr3t");
  }finally{await client.close();}
 });
 it("用户重新登录或删除后旧Worker版本不能覆盖，同账号切换仍为用户级",async()=>{
  const {db,client}=await createDb();try{
   const svc=makeService(db,KEY_A);await svc.saveState(ctxA,"chatgpt.com",STATE);const old=await svc.getStateVersioned(ctxA,"chatgpt.com");
   const updated=STATE.replace("s3cr3t","human-new");await svc.saveState(ctxA,"chatgpt.com",updated);
   expect(await svc.saveStateVersioned(ctxA,"chatgpt.com",STATE,old.revision)).toMatchObject({saved:false});expect(await svc.getState(ctxA,"chatgpt.com")).toBe(updated);
   const current=await svc.getStateVersioned({...ctxA,accountId:"other"},"chatgpt.com");expect(current.stateJson).toBe(updated);
   expect(await svc.getStateVersioned(ctxB,"chatgpt.com")).toEqual({stateJson:null,revision:null});
   await svc.removeState(ctxA,"chatgpt.com");expect(await svc.saveStateVersioned(ctxA,"chatgpt.com",STATE,current.revision)).toEqual({saved:false,revision:null});
  }finally{await client.close();}
 });
 it("相同旧revision并发仅一次更新；没有key绝不保存；支持现有外层事务",async()=>{
  const {db,client}=await createDb();try{
   const svc=makeService(db,KEY_A);await svc.saveState(ctxA,"chatgpt.com",STATE);const old=await svc.getStateVersioned(ctxA,"chatgpt.com");
   const outcomes=await Promise.all([svc.saveStateVersioned(ctxA,"chatgpt.com",STATE,old.revision),svc.saveStateVersioned(ctxA,"chatgpt.com",STATE,old.revision)]);expect(outcomes.filter(o=>o.saved)).toHaveLength(1);
   await expect(makeService(db).saveStateVersioned(ctxB,"chatgpt.com",STATE,null)).rejects.toThrow(BrowserSessionCryptoError);
   await expect(db.transaction(async tx=>{const snap=await svc.getStateVersioned(ctxA,"chatgpt.com",tx);expect((await svc.saveStateVersioned(ctxA,"chatgpt.com","transaction-state",snap.revision,tx)).saved).toBe(true);throw new Error("rollback");})).rejects.toThrow("rollback");
   expect(await svc.getState(ctxA,"chatgpt.com")).toBe(STATE);
  }finally{await client.close();}
 });
});
