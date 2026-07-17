// [T-369] chromium-guard 单测:锁/残留清理、同 profile 并发串行、活 context 跳过预检、
// 超时/失败人话报错。全 fake deps(不碰真进程/真文件系统/真浏览器)。
import { describe, expect, it } from "vitest";

import {
  BrowserLaunchError,
  chromiumSandboxOpts,
  ensureChromiumLaunchable,
  guardedLaunch,
  liveContextCount,
  SINGLETON_LOCK_FILES,
  type ChromiumGuardDeps,
} from "./chromium-guard";

function makeFakeDeps(pids: number[] = []) {
  const killed: number[] = [];
  const removed: string[] = [];
  let listCalls = 0;
  const deps: ChromiumGuardDeps = {
    listProfileProcesses: async () => {
      listCalls += 1;
      return pids;
    },
    killPid: async (pid) => {
      killed.push(pid);
    },
    removeFile: async (p) => {
      removed.push(p);
    },
  };
  return {
    deps,
    killed,
    removed,
    get listCalls() {
      return listCalls;
    },
  };
}

function makeFakeCtx() {
  let closed = false;
  return {
    get closed() {
      return closed;
    },
    close: async () => {
      closed = true;
    },
  };
}

describe("ensureChromiumLaunchable", () => {
  it("杀掉 profile 匹配的残留进程并清 3 个 Singleton 锁文件(不碰其他文件)", async () => {
    const fake = makeFakeDeps([111, 222]);
    await ensureChromiumLaunchable("/tmp/fake-profile", fake.deps);
    expect(fake.killed).toEqual([111, 222]);
    expect(fake.removed).toEqual(
      SINGLETON_LOCK_FILES.map((f) => `/tmp/fake-profile/${f}`),
    );
  });

  it("无残留进程时只清锁,不 kill", async () => {
    const fake = makeFakeDeps([]);
    await ensureChromiumLaunchable("/tmp/fake-profile-2", fake.deps);
    expect(fake.killed).toEqual([]);
    expect(fake.removed).toHaveLength(3);
  });
});

describe("guardedLaunch 并发串行", () => {
  it("同 profile 两个 launch 串行:第二个等第一个 launch 完成才起飞", async () => {
    const profile = "/tmp/guard-serial";
    const fake = makeFakeDeps();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((r) => {
      releaseFirst = r;
    });
    const p1 = guardedLaunch(
      profile,
      async () => {
        order.push("launch1-start");
        await firstGate;
        order.push("launch1-done");
        return makeFakeCtx();
      },
      {},
      fake.deps,
    );
    const p2 = guardedLaunch(
      profile,
      async () => {
        order.push("launch2-start");
        return makeFakeCtx();
      },
      {},
      fake.deps,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual(["launch1-start"]); // 第二个还没起飞
    releaseFirst();
    const [c1, c2] = await Promise.all([p1, p2]);
    expect(order).toEqual(["launch1-start", "launch1-done", "launch2-start"]);
    await c1.close();
    await c2.close();
    expect(liveContextCount(profile)).toBe(0);
  });

  it("profile 有活 context 时跳过预检(不杀进程/不清活窗的锁);close 后恢复预检", async () => {
    const profile = "/tmp/guard-live";
    const fake = makeFakeDeps([999]);
    const c1 = await guardedLaunch(profile, async () => makeFakeCtx(), {}, fake.deps);
    expect(fake.listCalls).toBe(1); // 首个 launch 走了预检
    expect(liveContextCount(profile)).toBe(1);
    const c2 = await guardedLaunch(profile, async () => makeFakeCtx(), {}, fake.deps);
    expect(fake.listCalls).toBe(1); // 活 context 在 → 第二次跳过预检
    await c1.close();
    await c2.close();
    expect(liveContextCount(profile)).toBe(0);
    const c3 = await guardedLaunch(profile, async () => makeFakeCtx(), {}, fake.deps);
    expect(fake.listCalls).toBe(2); // 全关了 → 预检恢复
    await c3.close();
  });

  it("close 幂等:重复 close 不把 refcount 减成负数", async () => {
    const profile = "/tmp/guard-idempotent";
    const fake = makeFakeDeps();
    const ctx = await guardedLaunch(profile, async () => makeFakeCtx(), {}, fake.deps);
    await ctx.close();
    await ctx.close();
    expect(liveContextCount(profile)).toBe(0);
  });
});

describe("guardedLaunch 超时/失败诚实", () => {
  it("launch 超时 → BrowserLaunchError 人话报错,迟到的 context 被顺手关掉", async () => {
    const profile = "/tmp/guard-timeout";
    const fake = makeFakeDeps();
    const late = makeFakeCtx();
    let resolveLate!: (c: typeof late) => void;
    const pending = new Promise<typeof late>((r) => {
      resolveLate = r;
    });
    await expect(
      guardedLaunch(profile, () => pending, { timeoutMs: 20, label: "测试窗口" }, fake.deps),
    ).rejects.toThrow(BrowserLaunchError);
    resolveLate(late); // 底层 launch 迟到成功
    await new Promise((r) => setTimeout(r, 10));
    expect(late.closed).toBe(true); // 不泄漏进程
    expect(liveContextCount(profile)).toBe(0);
  });

  it("超时错误文案是人话(含「请重试」)", async () => {
    const fake = makeFakeDeps();
    await expect(
      guardedLaunch(
        "/tmp/guard-timeout-msg",
        () => new Promise<ReturnType<typeof makeFakeCtx>>(() => {}),
        { timeoutMs: 20 },
        fake.deps,
      ),
    ).rejects.toThrow(/启动超时.*请重试/);
  });

  it("launch 抛错 → 包成 BrowserLaunchError 人话(保留原因首行)", async () => {
    const fake = makeFakeDeps();
    await expect(
      guardedLaunch(
        "/tmp/guard-err",
        async () => {
          throw new Error("Failed to launch: boom\nstack detail");
        },
        {},
        fake.deps,
      ),
    ).rejects.toThrow(/没能启动:Failed to launch: boom。.*请重试/);
  });

  it("前一个 launch 失败不堵队列:后一个照常执行", async () => {
    const profile = "/tmp/guard-fail-chain";
    const fake = makeFakeDeps();
    await expect(
      guardedLaunch(
        profile,
        async () => {
          throw new Error("boom");
        },
        {},
        fake.deps,
      ),
    ).rejects.toThrow(BrowserLaunchError);
    const ctx = await guardedLaunch(profile, async () => makeFakeCtx(), {}, fake.deps);
    expect(liveContextCount(profile)).toBe(1);
    await ctx.close();
  });

  it("profileDir=null(无持久 profile)不做预检,仍有超时/报错包装", async () => {
    const fake = makeFakeDeps([123]);
    const ctx = await guardedLaunch(null, async () => makeFakeCtx(), {}, fake.deps);
    expect(fake.listCalls).toBe(0);
    expect(fake.killed).toEqual([]);
    await ctx.close();
  });
});

describe("chromiumSandboxOpts", () => {
  it("darwin/win32 显式开沙箱(去掉 --no-sandbox 注入),其他平台交回默认", () => {
    const opts = chromiumSandboxOpts();
    if (process.platform === "darwin" || process.platform === "win32") {
      expect(opts).toEqual({ chromiumSandbox: true });
    } else {
      expect(opts).toEqual({});
    }
  });
});
