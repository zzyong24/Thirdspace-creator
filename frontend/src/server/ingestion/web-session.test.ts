import { describe, it, expect, vi } from "vitest";

import {
  webDomainFromUrl,
  hasSessionCookie,
  loginWeb,
  openWebLoginWindow,
  checkWebSessionStatus,
  importLegacyProfileState,
  buildLocalStorageInitScript,
  injectStorageState,
  storageStateHasData,
  type WebSessionCapableContext,
  type WebSessionCapablePage,
} from "./web-session";

// [T-217a] Web Session Vault 纯逻辑 + 端口注入单测(不起真浏览器 —— openContext 注 fake ctx)。

describe("webDomainFromUrl", () => {
  it("取 hostname、小写、去前导 www.(chatgpt.com/share 归一)", () => {
    expect(webDomainFromUrl("https://www.chatgpt.com/share/abc")).toBe("chatgpt.com");
    expect(webDomainFromUrl("https://ChatGPT.com/share/x")).toBe("chatgpt.com");
    expect(webDomainFromUrl("http://zhuanlan.zhihu.com/p/123")).toBe("zhuanlan.zhihu.com");
  });
  it("非 http(s) / 非法 URL 抛错", () => {
    expect(() => webDomainFromUrl("ftp://x.com")).toThrow();
    expect(() => webDomainFromUrl("not a url")).toThrow();
  });
});

describe("hasSessionCookie(启发式,不硬编码单一 cookie 名)", () => {
  it("命中常见会话 cookie 名", () => {
    expect(hasSessionCookie([{ name: "sessionid" }])).toBe(true);
    expect(hasSessionCookie([{ name: "__Secure-next-auth.session-token" }])).toBe(true);
    expect(hasSessionCookie([{ name: "laravel_session" }])).toBe(true);
    expect(hasSessionCookie([{ name: "logged_in" }])).toBe(true);
  });
  it("无会话 cookie(仅埋点/CF cookie)→ false", () => {
    expect(hasSessionCookie([{ name: "__cf_bm" }, { name: "_ga" }])).toBe(false);
    expect(hasSessionCookie([])).toBe(false);
  });
  it("[T-221] 收紧:登录页匿名 cookie(裸 session / sid / sso)不再误判已登录", () => {
    // 治「浏览器秒关」根因:去掉裸子串匹配,登录页刚 set 的这些名不算登录态。
    expect(hasSessionCookie([{ name: "session" }])).toBe(false);
    expect(hasSessionCookie([{ name: "sid" }])).toBe(false);
    expect(hasSessionCookie([{ name: "sso" }])).toBe(false);
    expect(hasSessionCookie([{ name: "__Host-next-auth.csrf-token" }])).toBe(false);
    // 真正的登录态 cookie 仍命中(带下划线的 _session / 全等名)。
    expect(hasSessionCookie([{ name: "myapp_session" }])).toBe(true);
  });
});

describe("[T-221] openWebLoginWindow(显式确认,不自动关 → 治秒关)", () => {
  it("开窗导航后**保持打开**(不轮询、不自动关);confirm() 才关窗且认可登录成功", async () => {
    const { ctx, closed } = makeCtx([[{ name: "__cf_bm" }]]); // cookie 一直没有登录态
    const handle = await openWebLoginWindow(
      { authDir: "/tmp/x", url: "https://chatgpt.com", domain: "chatgpt.com" },
      { openContext: async () => ctx },
    );
    // 开窗后不能自动关(旧 bug:首轮 cookie 命中就 close)
    expect(closed()).toBe(false);
    const res = await handle.confirm();
    expect(res.loggedIn).toBe(true); // 用户显式确认 → 认可(不赌 cookie)
    expect(closed()).toBe(true); // confirm 才关窗(持久化 profile)
  });
  it("cancel() 关窗、不认可;confirm/cancel 幂等只关一次", async () => {
    const { ctx, closed } = makeCtx([[{ name: "__cf_bm" }]]);
    const handle = await openWebLoginWindow(
      { authDir: "/tmp/x", url: "https://x.com", domain: "x.com" },
      { openContext: async () => ctx },
    );
    await handle.cancel();
    expect(closed()).toBe(true);
    // 再 confirm 不应二次操作(settled 已置);不抛。
    await handle.confirm();
  });
});

// fake ctx 工厂:cookies() 按调用序返回不同结果(模拟登录中 cookie 逐渐出现)。
function makeCtx(cookieSequence: Array<Array<{ name: string }>>): {
  ctx: WebSessionCapableContext;
  closed: () => boolean;
} {
  let call = 0;
  let closed = false;
  const page: WebSessionCapablePage = {
    goto: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined), // 立即 resolve,单测不真等
  };
  const ctx: WebSessionCapableContext = {
    pages: () => [page],
    newPage: async () => page,
    cookies: async () => {
      const idx = Math.min(call, cookieSequence.length - 1);
      call += 1;
      return cookieSequence[idx];
    },
    close: async () => {
      closed = true;
    },
  };
  return { ctx, closed: () => closed };
}

describe("loginWeb(泛化 douyin-cdp 登录轮询)", () => {
  it("会话 cookie 出现即成功,并关闭自起浏览器", async () => {
    const { ctx, closed } = makeCtx([
      [{ name: "__cf_bm" }], // 第 1 次:未登录
      [{ name: "__cf_bm" }, { name: "__Secure-next-auth.session-token" }], // 第 2 次:登录态出现
    ]);
    const res = await loginWeb(
      { authDir: "/tmp/x", url: "https://chatgpt.com", domain: "chatgpt.com", timeoutSec: 5 },
      { openContext: async () => ctx },
    );
    expect(res.loggedIn).toBe(true);
    expect(closed()).toBe(true);
  });

  it("超时内 cookie 始终不出现 → loggedIn=false", async () => {
    const { ctx } = makeCtx([[{ name: "__cf_bm" }]]);
    const res = await loginWeb(
      { authDir: "/tmp/x", url: "https://x.com", domain: "x.com", timeoutSec: 3 },
      { openContext: async () => ctx },
    );
    expect(res.loggedIn).toBe(false);
  });
});

// ── [T-370a] storageState 注入/回写/惰性迁移 ─────────────────────────────────────

const STATE = {
  cookies: [{ name: "sessionid", value: "v", domain: ".chatgpt.com", path: "/" }],
  origins: [
    {
      origin: "https://chatgpt.com",
      localStorage: [{ name: "jwt", value: "tok<script>" }],
    },
  ],
};

// 带注入/回写能力的 fake ctx(makeCtx 的超集)。
function makeStatefulCtx(opts: {
  cookieSequence?: Array<Array<{ name: string }>>;
  storageState?: unknown;
}): {
  ctx: WebSessionCapableContext;
  closed: () => boolean;
  addedCookies: unknown[][];
  initScripts: string[];
} {
  const base = makeCtx(opts.cookieSequence ?? [[]]);
  const addedCookies: unknown[][] = [];
  const initScripts: string[] = [];
  const ctx: WebSessionCapableContext = {
    ...base.ctx,
    storageState: async () => opts.storageState ?? null,
    addCookies: async (cookies) => {
      addedCookies.push(cookies);
    },
    addInitScript: async (script) => {
      initScripts.push(script);
    },
  };
  return { ctx, closed: base.closed, addedCookies, initScripts };
}

describe("[T-370a] buildLocalStorageInitScript / injectStorageState(§2.5 注入机制)", () => {
  it("init script 按 origin 回灌 localStorage,只在 key 缺失时 set,转义 <(防 </script> 注入)", () => {
    const script = buildLocalStorageInitScript(STATE.origins);
    expect(script).toContain("https://chatgpt.com");
    expect(script).toContain("window.localStorage.getItem");
    expect(script).toContain("window.localStorage.setItem");
    expect(script).not.toContain("<script>"); // `<` 已转义成 <
    expect(script).toContain("\\u003c");
  });

  it("injectStorageState:cookies → addCookies;origins → addInitScript;损坏 JSON → false 不抛", async () => {
    const { ctx, addedCookies, initScripts } = makeStatefulCtx({});
    expect(await injectStorageState(ctx, JSON.stringify(STATE))).toBe(true);
    expect(addedCookies).toEqual([STATE.cookies]);
    expect(initScripts).toHaveLength(1);
    expect(await injectStorageState(ctx, "not-json{")).toBe(false);
    expect(await injectStorageState(ctx, JSON.stringify({ cookies: [], origins: [] }))).toBe(false);
  });

  it("storageStateHasData:cookies/localStorage 任一非空为真;空 state 为假", () => {
    expect(storageStateHasData(STATE)).toBe(true);
    expect(storageStateHasData({ cookies: [], origins: [] })).toBe(false);
    expect(storageStateHasData(null)).toBe(false);
    expect(
      storageStateHasData({ cookies: [], origins: [{ origin: "https://x.com", localStorage: [{ name: "a", value: "b" }] }] }),
    ).toBe(true);
  });
});

describe("[T-370a] 登录成功回写 DB(单一真值)", () => {
  it("openWebLoginWindow.confirm():storageState 全量读 → saveState 端口回写 → 关窗", async () => {
    const { ctx, closed } = makeStatefulCtx({ storageState: STATE });
    const saved: Array<{ domain: string; json: string }> = [];
    const handle = await openWebLoginWindow(
      { authDir: "/tmp/x", url: "https://chatgpt.com", domain: "chatgpt.com" },
      {
        openContext: async () => ctx,
        saveState: async (domain, json) => {
          saved.push({ domain, json });
        },
      },
    );
    const res = await handle.confirm();
    expect(res.loggedIn).toBe(true);
    expect(closed()).toBe(true);
    expect(saved).toEqual([
      { domain: "chatgpt.com", json: JSON.stringify(STATE) },
    ]);
  });

  it("confirm():saveState 拒存(master-key 不可用)→ 人话错上抛,但窗已关(登录不丢在 profile)", async () => {
    const { ctx, closed } = makeStatefulCtx({ storageState: STATE });
    const handle = await openWebLoginWindow(
      { authDir: "/tmp/x", url: "https://chatgpt.com", domain: "chatgpt.com" },
      {
        openContext: async () => ctx,
        saveState: async () => {
          throw new Error("master key 不可用,拒绝明文保存");
        },
      },
    );
    await expect(handle.confirm()).rejects.toThrow(/拒绝明文/);
    expect(closed()).toBe(true);
  });

  it("loginWeb:会话 cookie 出现(登录成功检测点)→ 回写 DB 再返回", async () => {
    const base = makeCtx([
      [{ name: "__cf_bm" }],
      [{ name: "sessionid" }], // 第 2 轮登录态出现
    ]);
    const ctx: WebSessionCapableContext = {
      ...base.ctx,
      storageState: async () => STATE,
    };
    const saved: string[] = [];
    const res = await loginWeb(
      { authDir: "/tmp/x", url: "https://chatgpt.com", domain: "chatgpt.com", timeoutSec: 5 },
      {
        openContext: async () => ctx,
        saveState: async (domain) => {
          saved.push(domain);
        },
      },
    );
    expect(res.loggedIn).toBe(true);
    expect(saved).toEqual(["chatgpt.com"]);
  });

  it("端口缺省 / ctx 无 storageState(老 fake)→ 旧行为不变(不回写不抛)", async () => {
    const { ctx } = makeCtx([[{ name: "sessionid" }]]);
    const res = await loginWeb(
      { authDir: "/tmp/x", url: "https://x.com", domain: "x.com", timeoutSec: 3 },
      { openContext: async () => ctx },
    );
    expect(res.loggedIn).toBe(true);
  });
});

describe("[T-370a] checkWebSessionStatus 注入回灌(DB 单一真值优先)", () => {
  it("DB 有该域 state → addCookies + addInitScript 回灌后按 cookie 判定 loggedIn", async () => {
    // 注入后 cookie 读回含会话 cookie(真实 Chromium 会丢过期 cookie,这里模拟注入生效)。
    const { ctx, addedCookies, initScripts } = makeStatefulCtx({
      cookieSequence: [[{ name: "sessionid" }]],
    });
    const res = await checkWebSessionStatus(
      { authDir: "/tmp/x", domain: "chatgpt.com" },
      {
        openContext: async () => ctx,
        getState: async () => JSON.stringify(STATE),
        saveState: async () => {},
        legacyProfileHasData: async () => false,
      },
    );
    expect(res.loggedIn).toBe(true);
    expect(addedCookies).toEqual([STATE.cookies]);
    expect(initScripts).toHaveLength(1);
  });

  it("DB 无 state 且无旧目录 → 旧行为(裸探针,未登录)", async () => {
    const { ctx, addedCookies } = makeStatefulCtx({
      cookieSequence: [[{ name: "__cf_bm" }]],
    });
    const res = await checkWebSessionStatus(
      { authDir: "/tmp/x", domain: "chatgpt.com" },
      {
        openContext: async () => ctx,
        getState: async () => null,
        saveState: async () => {},
        legacyProfileHasData: async () => false,
      },
    );
    expect(res.loggedIn).toBe(false);
    expect(addedCookies).toHaveLength(0);
  });
});

describe("[T-370a] 存量惰性迁移(§3.3:旧目录 → DB 导入 → 归档)", () => {
  it("旧目录有登录材料 → 起一次 context 读 storageState → saveState 落 DB → 归档旧目录", async () => {
    const { ctx } = makeStatefulCtx({ storageState: STATE });
    const saved: Array<{ domain: string; json: string }> = [];
    const archived: string[] = [];
    const out = await importLegacyProfileState(
      { authDir: "/auth/web/chatgpt.com", domain: "chatgpt.com" },
      {
        openContext: async () => ctx,
        saveState: async (domain, json) => {
          saved.push({ domain, json });
        },
        legacyProfileHasData: async () => true,
        archiveLegacyProfile: async (dir) => {
          archived.push(dir);
        },
      },
    );
    expect(out).toBe(JSON.stringify(STATE));
    expect(saved).toEqual([{ domain: "chatgpt.com", json: JSON.stringify(STATE) }]);
    expect(archived).toEqual(["/auth/web/chatgpt.com"]); // 导入成功后才归档
  });

  it("旧目录无内容 → 返 null(诚实要求重新登录),不 saveState 不归档", async () => {
    const archived: string[] = [];
    const out = await importLegacyProfileState(
      { authDir: "/auth/web/x.com", domain: "x.com" },
      {
        openContext: async () => {
          throw new Error("不应该起 context");
        },
        saveState: async () => {
          throw new Error("不应该 save");
        },
        legacyProfileHasData: async () => false,
        archiveLegacyProfile: async (dir) => {
          archived.push(dir);
        },
      },
    );
    expect(out).toBeNull();
    expect(archived).toEqual([]);
  });

  it("saveState 拒存(master-key 不可用)→ 不归档(旧目录仍是真值),本次仍返回读到的 state", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { ctx } = makeStatefulCtx({ storageState: STATE });
      const archived: string[] = [];
      const out = await importLegacyProfileState(
        { authDir: "/auth/web/chatgpt.com", domain: "chatgpt.com" },
        {
          openContext: async () => ctx,
          saveState: async () => {
            throw new Error("master key 不可用");
          },
          legacyProfileHasData: async () => true,
          archiveLegacyProfile: async (dir) => {
            archived.push(dir);
          },
        },
      );
      expect(out).toBe(JSON.stringify(STATE));
      expect(archived).toEqual([]); // 没进 DB 就绝不归档
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("checkWebSessionStatus:DB 无 state → 走惰性迁移导入 + 归档,再注入判定", async () => {
    // 第一次 openContext = 迁移读取(storageState 有料);第二次 = 注入探针。
    const migrateCtx = makeStatefulCtx({ storageState: STATE });
    const probeCtx = makeStatefulCtx({ cookieSequence: [[{ name: "sessionid" }]] });
    let call = 0;
    const saved: string[] = [];
    const archived: string[] = [];
    const res = await checkWebSessionStatus(
      { authDir: "/auth/web/chatgpt.com", domain: "chatgpt.com" },
      {
        openContext: async () => (++call === 1 ? migrateCtx.ctx : probeCtx.ctx),
        getState: async () => null,
        saveState: async (domain) => {
          saved.push(domain);
        },
        legacyProfileHasData: async () => true,
        archiveLegacyProfile: async (dir) => {
          archived.push(dir);
        },
      },
    );
    expect(res.loggedIn).toBe(true);
    expect(saved).toEqual(["chatgpt.com"]);
    expect(archived).toEqual(["/auth/web/chatgpt.com"]);
    expect(probeCtx.addedCookies).toEqual([STATE.cookies]); // 迁出的 state 被注入探针
    expect(migrateCtx.closed()).toBe(true);
    expect(probeCtx.closed()).toBe(true);
  });
});

describe("checkWebSessionStatus(headless 被动探针,不弹窗)", () => {
  it("有会话 cookie → loggedIn=true", async () => {
    const { ctx } = makeCtx([[{ name: "sessionid" }]]);
    const res = await checkWebSessionStatus(
      { authDir: "/tmp/x", domain: "chatgpt.com" },
      { openContext: async () => ctx },
    );
    expect(res.loggedIn).toBe(true);
  });
  it("profile 存在但无有效会话(过期)→ loggedIn=false", async () => {
    const { ctx, closed } = makeCtx([[{ name: "__cf_bm" }]]);
    const res = await checkWebSessionStatus(
      { authDir: "/tmp/x", domain: "chatgpt.com" },
      { openContext: async () => ctx },
    );
    expect(res.loggedIn).toBe(false);
    expect(closed()).toBe(true);
  });
});
