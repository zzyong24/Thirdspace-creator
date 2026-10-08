import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  beginGracefulExit,
  installSidecarLifecycle,
  __resetLifecycleForTest,
  SHUTDOWN_SENTINEL,
  type LifecycleProcess,
} from "./sidecar-lifecycle";

// [T-365/T-362] sidecar 生命周期守护单测:孤儿自检 / 信号优雅退出 / 组广播 / flush 钩子 / 幂等。
// [T-372 W-core W4] Windows 分支:注入 platform="win32" 在 macOS 上验证 Win 路径
// (停机哨兵 / stdin 断开 / ppid 探活 / 不调 POSIX 负 pid 组信号)—— 无 Windows 实机,
// 真机行为验证归 W-ci;这里钉住的是平台分支选择与跨语言哨兵契约。

function makeProc(
  ppid = 100,
  opts: { platform?: string; parentAlive?: boolean } = {},
): LifecycleProcess & {
  killed: Array<[number, string | number]>;
  exited: number[];
  handlers: Map<string, () => void>;
  stdinHandlers: Map<string, (chunk?: unknown) => void>;
  setPpid: (v: number) => void;
  setParentAlive: (v: boolean) => void;
} {
  let currentPpid = ppid;
  let parentAlive = opts.parentAlive ?? true;
  const killed: Array<[number, string | number]> = [];
  const exited: number[] = [];
  const handlers = new Map<string, () => void>();
  const stdinHandlers = new Map<string, (chunk?: unknown) => void>();
  return {
    get ppid() {
      return currentPpid;
    },
    pid: 4242,
    platform: opts.platform,
    kill: (pid, sig) => {
      // Win 探活语义:kill(ppid, 0) 在父进程不存在时抛 ESRCH。
      if (sig === 0 && pid === currentPpid && !parentAlive) {
        throw Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });
      }
      killed.push([pid, sig]);
    },
    exit: (code) => {
      exited.push(code);
    },
    on: (ev, h) => {
      handlers.set(ev, h);
    },
    stdin: {
      on: (ev, h) => {
        stdinHandlers.set(ev, h);
      },
    },
    killed,
    exited,
    handlers,
    stdinHandlers,
    setPpid: (v) => {
      currentPpid = v;
    },
    setParentAlive: (v) => {
      parentAlive = v;
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

// ── [T-372 W-core W4] Windows 分支(注入 platform="win32";§14 平台分支单测)──────
describe("Windows 分支(platform=win32)", () => {
  it("停机哨兵契约:与 Rust 壳(lib.rs SIDECAR_SHUTDOWN_SENTINEL)钉同一字面值", () => {
    // ⚠️ 改这个值必须同步改 lib.rs 常量(那侧 cargo test 也钉住同一字面值)。
    expect(SHUTDOWN_SENTINEL).toBe("__CREATOROS_SHUTDOWN__");
  });

  it("beginGracefulExit:不发 POSIX 负 pid 组信号(Win 无进程组),仍 flush 库并退出", async () => {
    const proc = makeProc(100, { platform: "win32" });
    const dispose = vi.fn(async () => undefined);
    (globalThis as { __creatorosDisposePersistence?: () => Promise<void> })
      .__creatorosDisposePersistence = dispose;
    await beginGracefulExit(proc, "test", () => {});
    expect(proc.killed.filter(([p]) => typeof p === "number" && p < 0)).toHaveLength(0);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(proc.exited).toEqual([0]);
  });

  it("stdin 收到停机哨兵 → 优雅退出(壳侧 kill 序列第①步的 Win 等价 SIGTERM)", async () => {
    const proc = makeProc(100, { platform: "win32" });
    const stop = installSidecarLifecycle(proc, () => {});
    proc.stdinHandlers.get("data")!(Buffer.from(`${SHUTDOWN_SENTINEL}\n`));
    await vi.waitFor(() => expect(proc.exited).toEqual([0]));
    stop();
  });

  it('Windows停机哨兵等待自建浏览器关闭及租约释放，再flush和退出',async()=>{
    const {createBrowserHostDisposer}=await import('./browser-host-dispose');
    const {createBrowserShutdownScope}=await import('../../../ai-worker/src/runtime/browser/browser-shutdown-scope');
    const {guardedLaunch}=await import('../../../ai-worker/src/runtime/browser/chromium-guard');
    const scope=createBrowserShutdownScope(),events:string[]=[];let release!:()=>void;
    const lease=new Promise<void>(resolve=>release=resolve),proc=makeProc(100,{platform:'win32'});
    await guardedLaunch('/windows-shutdown/owned',async()=>({close:async()=>{events.push('browser');}}),{shutdownScope:scope,onStopped:async()=>{await lease;events.push('lease');}},{listProfileProcesses:async()=>[],killPid:async()=>{},removeFile:async()=>{}});
    (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence=createBrowserHostDisposer({browser:scope,stopWorkers:async()=>{},disposeDatabase:async()=>{events.push('database');}});
    const stop=installSidecarLifecycle(proc,()=>{});proc.stdinHandlers.get('data')!(Buffer.from(`${SHUTDOWN_SENTINEL}\n`));
    await vi.waitFor(()=>expect(events).toContain('browser'));expect(events).not.toContain('database');expect(proc.exited).toEqual([]);
    release();await vi.waitFor(()=>expect(proc.exited).toEqual([0]));expect(events).toEqual(['browser','lease','database']);expect(proc.killed).toEqual([]);stop();
  });

  it("stdin 普通数据(非哨兵)不触发退出", async () => {
    const proc = makeProc(100, { platform: "win32" });
    const stop = installSidecarLifecycle(proc, () => {});
    proc.stdinHandlers.get("data")!(Buffer.from("hello\n"));
    await new Promise((r) => setTimeout(r, 10));
    expect(proc.exited).toEqual([]);
    stop();
  });

  it("stdin 管道断开(end)→ 优雅退出(壳崩溃孤儿兜底主检测)", async () => {
    const proc = makeProc(100, { platform: "win32" });
    const stop = installSidecarLifecycle(proc, () => {});
    proc.stdinHandlers.get("end")!();
    await vi.waitFor(() => expect(proc.exited).toEqual([0]));
    stop();
  });

  it("[T-457] 移除 kill(ppid,0) 探活:父死也不自杀(靠 stdin 断开兜);避免 EPERM 误报", async () => {
    vi.useFakeTimers();
    const proc = makeProc(100, { platform: "win32", parentAlive: true });
    const stop = installSidecarLifecycle(proc, () => {});
    // 父活/死状态都不再影响 sidecar 自杀 —— 探活已移除。避免 Node@25 Win 上 EPERM 误判
    //   (2026-07-21 白屏事故:kill(ppid, 0) 抛权限错 → 误杀 → shell 60s 后仍导航死端口)。
    proc.setParentAlive(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(proc.exited).toEqual([]); // 就是不退!
    // 唯一可靠的 Win 父死信号 = stdin 管道断开(OS 关另一端)。这里模拟:
    proc.stdinHandlers.get("end")!();
    await vi.waitFor(() => expect(proc.exited).toEqual([0]));
    stop();
  });

  it("挂 SIGBREAK handler(Win 独有可捕获信号);全程不出现负 pid 组信号", async () => {
    const proc = makeProc(100, { platform: "win32" });
    const stop = installSidecarLifecycle(proc, () => {});
    expect(proc.handlers.has("SIGBREAK")).toBe(true);
    proc.handlers.get("SIGBREAK")!();
    await vi.waitFor(() => expect(proc.exited).toEqual([0]));
    expect(proc.killed.filter(([p]) => typeof p === "number" && p < 0)).toHaveLength(0);
    stop();
  });
});

it("T-1066 取消信号即时，慢落盘在 120 秒内完成不被强退", async () => {
  vi.useFakeTimers();
  const proc = makeProc();
  let resolve!: () => void;
  (globalThis as { __creatorosDisposePersistence?: () => Promise<void> }).__creatorosDisposePersistence =
    () => new Promise<void>(r => { resolve = r; });
  const exiting = beginGracefulExit(proc, "取消", () => {});
  expect(proc.killed).toContainEqual([-4242, "SIGTERM"]);
  await vi.advanceTimersByTimeAsync(90_000);
  expect(proc.exited).toEqual([]);
  resolve();
  await exiting;
  expect(proc.exited).toEqual([0]);
  await vi.advanceTimersByTimeAsync(40_000);
  expect(proc.exited).toEqual([0]);
  vi.useRealTimers();
});
