import { describe, it, expect, vi } from "vitest";

import {
  createBrowserPool,
  resolvePoolSize,
  type PoolCapableContext,
  type PoolSessionPorts,
} from "./browser-pool";

// [T-370b] browser-pool 单测(deps 全注入:fake launch/wipe/session 端口,不起真浏览器、
// 不碰真文件系统)。覆盖:域亲和 sticky / 征用触发擦除 / 擦除失败拒用 / 池满 FIFO 排队 /
// return 回写+清 cookie+唤醒 / 并发 checkout 不超上限 / 注入回灌。

interface FakeCtx extends PoolCapableContext {
  addedCookies: unknown[][];
  initScripts: string[];
  clearedCookies: boolean;
  closed: boolean;
}

function makeFakeCtx(stateOnReturn: unknown = null): FakeCtx {
  const ctx: FakeCtx = {
    addedCookies: [],
    initScripts: [],
    clearedCookies: false,
    closed: false,
    addCookies: async (cookies) => {
      ctx.addedCookies.push(cookies);
    },
    addInitScript: async (script) => {
      ctx.initScripts.push(script);
    },
    clearCookies: async () => {
      ctx.clearedCookies = true;
    },
    storageState: async () => stateOnReturn,
    close: async () => {
      ctx.closed = true;
    },
  };
  return ctx;
}

const emptySession: PoolSessionPorts = {
  getState: async () => null,
  saveState: async () => {},
};

function makePool(opts: {
  size: number;
  wipe?: (dir: string) => Promise<void>;
  stateOnReturn?: unknown;
}) {
  const launched: string[] = [];
  const contexts: FakeCtx[] = [];
  const pool = createBrowserPool<FakeCtx>({
    poolDir: "/tmp/pool",
    size: opts.size,
    launch: async (dir) => {
      launched.push(dir);
      const ctx = makeFakeCtx(opts.stateOnReturn ?? null);
      contexts.push(ctx);
      return ctx;
    },
    wipeMemberStorage: opts.wipe ?? (async () => {}),
  });
  return { pool, launched, contexts };
}

describe("resolvePoolSize", () => {
  it("env 缺失/非法 → 默认 5;合法 → 取整;下限 1", () => {
    expect(resolvePoolSize(undefined)).toBe(5);
    expect(resolvePoolSize("abc")).toBe(5);
    expect(resolvePoolSize("0")).toBe(5);
    expect(resolvePoolSize("3")).toBe(3);
  });
});

describe("域亲和 sticky(SPEC §2.4 主保险)", () => {
  it("同域复用同一成员(released 后再 checkout 同域 → 同 memberDir,不擦除)", async () => {
    const wipe = vi.fn(async () => {});
    const { pool } = makePool({ size: 3, wipe });
    const h1 = await pool.checkout("chatgpt.com", emptySession);
    const dir1 = h1.memberDir;
    await h1.release();
    const h2 = await pool.checkout("chatgpt.com", emptySession);
    expect(h2.memberDir).toBe(dir1); // sticky:严格优先 lastDomain 同域成员
    expect(wipe).not.toHaveBeenCalled(); // 同域复用绝不擦
    await h2.release();
  });

  it("新域优先取从未用过的成员(域数 ≤ 池上限时永不跨域复用)", async () => {
    const wipe = vi.fn(async () => {});
    const { pool } = makePool({ size: 3, wipe });
    const h1 = await pool.checkout("a.com", emptySession);
    await h1.release();
    const h2 = await pool.checkout("b.com", emptySession);
    expect(h2.memberDir).not.toBe(h1.memberDir); // 不征用 a.com 的成员
    expect(wipe).not.toHaveBeenCalled();
    await h2.release();
  });
});

describe("征用擦除(SPEC §2.4 双保险之二)", () => {
  it("域数超上限须征用他域成员 → 先目录级擦除再注入", async () => {
    const wipe = vi.fn(async () => {});
    const { pool } = makePool({ size: 2, wipe });
    // 占满两个成员的 lastDomain。
    const ha = await pool.checkout("a.com", emptySession);
    await ha.release();
    const hb = await pool.checkout("b.com", emptySession);
    await hb.release();
    // 第三个域 → 必须征用(a.com 成员是 FIFO 首个 idle)→ 擦除被调。
    const hc = await pool.checkout("c.com", emptySession);
    expect(wipe).toHaveBeenCalledTimes(1);
    expect([ha.memberDir, hb.memberDir]).toContain(hc.memberDir);
    await hc.release();
    // 擦除后成员归 c.com;再 checkout c.com → sticky 不再擦。
    const hc2 = await pool.checkout("c.com", emptySession);
    expect(hc2.memberDir).toBe(hc.memberDir);
    expect(wipe).toHaveBeenCalledTimes(1);
    await hc2.release();
  });

  it("擦除失败 → 拒用该成员换下一个(第二个擦除成功者被用)", async () => {
    const wiped: string[] = [];
    let first = true;
    const wipe = vi.fn(async (dir: string) => {
      wiped.push(dir);
      if (first) {
        first = false;
        throw new Error("EBUSY");
      }
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { pool } = makePool({ size: 2, wipe });
      const ha = await pool.checkout("a.com", emptySession);
      await ha.release();
      const hb = await pool.checkout("b.com", emptySession);
      await hb.release();
      const hc = await pool.checkout("c.com", emptySession);
      expect(wipe).toHaveBeenCalledTimes(2); // 第一个失败被拒 → 换下一个
      expect(hc.memberDir).toBe(wiped[1]); // 用的是第二个(擦除成功)成员
      await hc.release();
    } finally {
      warn.mockRestore();
    }
  });

  it("全部 idle 成员擦除都失败 → 诚实报错(绝不带脏注入)", async () => {
    const wipe = vi.fn(async () => {
      throw new Error("EPERM");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { pool } = makePool({ size: 2, wipe });
      const ha = await pool.checkout("a.com", emptySession);
      await ha.release();
      const hb = await pool.checkout("b.com", emptySession);
      await hb.release();
      await expect(pool.checkout("c.com", emptySession)).rejects.toThrow(
        /擦除失败/,
      );
    } finally {
      warn.mockRestore();
    }
  });
});

describe("池满 FIFO 排队 + 并发上限", () => {
  it("全 busy → 排队;release 后按 FIFO 唤醒", async () => {
    const { pool } = makePool({ size: 1 });
    const h1 = await pool.checkout("a.com", emptySession);
    const order: string[] = [];
    const p2 = pool.checkout("b.com", emptySession).then((h) => {
      order.push("b");
      return h;
    });
    const p3 = pool.checkout("c.com", emptySession).then((h) => {
      order.push("c");
      return h;
    });
    expect(pool.stats().queued).toBe(2);
    await h1.release();
    const h2 = await p2;
    expect(order).toEqual(["b"]); // 严格 FIFO:b 先醒,c 还等着
    await h2.release();
    const h3 = await p3;
    expect(order).toEqual(["b", "c"]);
    await h3.release();
  });

  it("并发 checkout 不超池上限(launch 数 ≤ size)", async () => {
    const { pool, launched } = makePool({ size: 2 });
    const hs = [
      pool.checkout("a.com", emptySession),
      pool.checkout("b.com", emptySession),
      pool.checkout("c.com", emptySession),
      pool.checkout("d.com", emptySession),
    ];
    // 前两个立即拿到,后两个排队。
    const h1 = await hs[0];
    const h2 = await hs[1];
    expect(launched).toHaveLength(2);
    expect(pool.stats()).toMatchObject({ busy: 2, queued: 2 });
    await h1.release();
    await h2.release();
    const h3 = await hs[2];
    const h4 = await hs[3];
    await h3.release();
    await h4.release();
    expect(launched.length).toBeLessThanOrEqual(4); // 每次 checkout 一个 launch,但从未并存 >2
  });

  it("launch 失败 → 释放预留成员并上抛(不卡死池)", async () => {
    let fail = true;
    const pool = createBrowserPool<FakeCtx>({
      poolDir: "/tmp/pool",
      size: 1,
      launch: async () => {
        if (fail) throw new Error("launch boom");
        return makeFakeCtx();
      },
      wipeMemberStorage: async () => {},
    });
    await expect(pool.checkout("a.com", emptySession)).rejects.toThrow("launch boom");
    fail = false;
    const h = await pool.checkout("a.com", emptySession); // 成员未被卡成永久 busy
    await h.release();
  });
});

describe("checkout 注入 + return 回写(§2.5)", () => {
  const STATE = {
    cookies: [{ name: "sessionid", value: "v", domain: ".a.com", path: "/" }],
    origins: [
      { origin: "https://a.com", localStorage: [{ name: "jwt", value: "tok" }] },
    ],
  };

  it("DB 有该域 state → addCookies + addInitScript 回灌", async () => {
    const { pool, contexts } = makePool({ size: 1 });
    const session: PoolSessionPorts = {
      getState: async () => JSON.stringify(STATE),
      saveState: async () => {},
    };
    const h = await pool.checkout("a.com", session);
    const ctx = contexts[0];
    expect(ctx.addedCookies).toEqual([STATE.cookies]);
    expect(ctx.initScripts).toHaveLength(1);
    expect(ctx.initScripts[0]).toContain("https://a.com");
    expect(ctx.initScripts[0]).toContain("jwt");
    await h.release();
  });

  it("release → storageState 回写 saveState → clearCookies → close → 唤醒排队者", async () => {
    const saved: Array<{ domain: string; json: string }> = [];
    const { pool, contexts } = makePool({ size: 1, stateOnReturn: STATE });
    const session: PoolSessionPorts = {
      getState: async () => null,
      saveState: async (domain, json) => {
        saved.push({ domain, json });
      },
    };
    const h = await pool.checkout("a.com", session);
    const waiting = pool.checkout("b.com", emptySession);
    await h.release();
    expect(saved).toEqual([{ domain: "a.com", json: JSON.stringify(STATE) }]);
    const ctx = contexts[0];
    expect(ctx.clearedCookies).toBe(true);
    expect(ctx.closed).toBe(true);
    const h2 = await waiting; // 归还唤醒了排队者
    await h2.release();
  });

  it("回写失败(master-key 不可用拒存)→ warn 不阻断归还;release 幂等", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { pool, contexts } = makePool({ size: 1, stateOnReturn: STATE });
      const session: PoolSessionPorts = {
        getState: async () => null,
        saveState: async () => {
          throw new Error("master key 不可用");
        },
      };
      const h = await pool.checkout("a.com", session);
      await h.release();
      await h.release(); // 幂等
      expect(contexts[0].closed).toBe(true);
      expect(pool.stats().busy).toBe(0);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("T-915 排队取消与启动清理", () => {
  it("池满排队时取消，立即移出队列且归还后不启动", async () => {
    const {pool, launched} = makePool({size: 1});
    const first = await pool.checkout("a.com", emptySession);
    const controller = new AbortController();
    const pending = pool.checkout("b.com", emptySession, {signal: controller.signal});
    const rejection = expect(pending).rejects.toThrow();
    controller.abort();
    await rejection;
    expect(pool.stats().queued).toBe(0);
    await first.release();
    expect(launched).toHaveLength(1);
  });

  it("启动途中取消，关闭迟到 context 并释放成员", async () => {
    const controller = new AbortController();
    const ctx = makeFakeCtx();
    const pool = createBrowserPool({poolDir: "/tmp/pool", size: 1, launch: async () => {controller.abort(); return ctx;}});
    await expect(pool.checkout("a.com", emptySession, {signal: controller.signal})).rejects.toThrow();
    expect(ctx.closed).toBe(true);
    expect(pool.stats().busy).toBe(0);
  });
});

it("T-915 到期队首被归还操作先唤醒，不能阻塞后续有效等待者", async () => {
  vi.useFakeTimers();
  try {
    const {pool} = makePool({size: 1});
    const first = await pool.checkout("a.com", emptySession);
    const expired = pool.checkout("b.com", emptySession, {deadlineAt: Date.now() + 100});
    const rejected = expect(expired).rejects.toThrow();
    const next = pool.checkout("a.com", emptySession);
    vi.setSystemTime(Date.now() + 101);
    await first.release();
    await rejected;
    const handle = await next;
    await handle.release();
    expect(pool.stats()).toMatchObject({busy: 0, queued: 0});
  } finally {vi.useRealTimers();}
});
