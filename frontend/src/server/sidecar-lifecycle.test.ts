import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  beginGracefulExit,
  installSidecarLifecycle,
  __resetLifecycleForTest,
  type LifecycleProcess,
} from "./sidecar-lifecycle";

// [T-365/T-362] sidecar 生命周期守护单测:孤儿自检 / 信号优雅退出 / 组广播 / flush 钩子 / 幂等。

function makeProc(ppid = 100): LifecycleProcess & {
  killed: Array<[number, string]>;
  exited: number[];
  handlers: Map<string, () => void>;
  setPpid: (v: number) => void;
} {
  let currentPpid = ppid;
  const killed: Array<[number, string]> = [];
  const exited: number[] = [];
  const handlers = new Map<string, () => void>();
  return {
    get ppid() {
      return currentPpid;
    },
    pid: 4242,
    kill: (pid, sig) => {
      killed.push([pid, sig]);
    },
    exit: (code) => {
      exited.push(code);
    },
    on: (ev, h) => {
      handlers.set(ev, h);
    },
    killed,
    exited,
    handlers,
    setPpid: (v) => {
      currentPpid = v;
    },
  };
}

beforeEach(() => {
  __resetLifecycleForTest();
  delete (globalThis as { __creatorosDisposePersistence?: unknown })
    .__creatorosDisposePersistence;
  vi.useRealTimers();
});

describe("beginGracefulExit", () => {
  it("组广播 SIGTERM(负 pid)→ 调 dispose 钩子 flush 库 → exit(0)", async () => {
    const proc = makeProc();
    const dispose = vi.fn(async () => undefined);
    (globalThis as { __creatorosDisposePersistence?: () => Promise<void> })
      .__creatorosDisposePersistence = dispose;
    await beginGracefulExit(proc, "test", () => {});
    expect(proc.killed).toContainEqual([-4242, "SIGTERM"]);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(proc.exited).toEqual([0]);
  });

  it("库未装配(无钩子)→ 照样退出;dispose 抛错也照退(best-effort)", async () => {
    const proc = makeProc();
    await beginGracefulExit(proc, "test", () => {});
    expect(proc.exited).toEqual([0]);

    __resetLifecycleForTest();
    const proc2 = makeProc();
    (globalThis as { __creatorosDisposePersistence?: () => Promise<void> })
      .__creatorosDisposePersistence = vi.fn(async () => {
      throw new Error("close boom");
    });
    await beginGracefulExit(proc2, "test", () => {});
    expect(proc2.exited).toEqual([0]);
  });

  it("幂等:重复调用只执行一次(组信号回环打到自己不会递归)", async () => {
    const proc = makeProc();
    await beginGracefulExit(proc, "a", () => {});
    await beginGracefulExit(proc, "b", () => {});
    expect(proc.exited).toEqual([0]);
    expect(proc.killed.filter(([p]) => p === -4242)).toHaveLength(1);
  });
});

describe("installSidecarLifecycle", () => {
  it("挂 SIGTERM/SIGINT handler;信号触发优雅退出", async () => {
    const proc = makeProc();
    const stop = installSidecarLifecycle(proc, () => {});
    expect(proc.handlers.has("SIGTERM")).toBe(true);
    expect(proc.handlers.has("SIGINT")).toBe(true);
    proc.handlers.get("SIGTERM")!();
    await vi.waitFor(() => expect(proc.exited).toEqual([0]));
    stop();
  });

  it("孤儿自检:ppid 变 1 → 自杀(壳崩溃/强退兜底)", async () => {
    vi.useFakeTimers();
    const proc = makeProc(100);
    const stop = installSidecarLifecycle(proc, () => {});
    // 父还活着:轮询不触发退出。
    await vi.advanceTimersByTimeAsync(5_000);
    expect(proc.exited).toEqual([]);
    // 父死(被 init 收养)→ 下一轮自检触发优雅退出。
    proc.setPpid(1);
    await vi.advanceTimersByTimeAsync(2_100);
    expect(proc.exited).toEqual([0]);
    stop();
  });
});
