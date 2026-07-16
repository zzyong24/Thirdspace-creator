/**
 * [T-365/T-362] sidecar 生命周期守护 —— 进程泄漏与库半写的 sidecar 侧双保险。
 *
 * 背景(2026-07-16 真机事故):app 退出不总能带走 sidecar(Tauri 崩溃/强退时 Rust 清理
 * 不执行;旧 kill 还是单进程 SIGKILL)→ 孤儿 next-server 累积(实测 5 个 × ~90% CPU,
 * 其一带 headless Chrome 树);孤儿/硬杀还并发写同一 PGlite → WAL 半写库损坏。
 *
 * 双保险分工:
 *   壳侧(lib.rs):spawn 进程组 + 退出 killpg(SIGTERM → 5s → SIGKILL)——正常退出路径。
 *   本模块(sidecar 侧):
 *     ① SIGTERM/SIGINT handler → 优雅退出(先 flush PGlite 再退)——接住壳侧的 SIGTERM;
 *     ② 孤儿自检:轮询 `process.ppid === 1`(父死被 init 收养)→ 同一条优雅退出——
 *        覆盖壳崩溃/强退等 Rust 清理到不了的场景;退出前对**自己的进程组**补发 SIGTERM,
 *        把自己拉起的 Chrome/ffmpeg 一并带走(自己在 exiting 态,幂等忽略)。
 *
 * PGlite flush:persistence-client 装配完成后把 `dispose`(client.close(),flush WAL)挂在
 * `globalThis.__creatorosDisposePersistence`;这里若见到就调(没见到 = 库还没开,直接退)。
 * 观测永不伤主链路:全程 best-effort,优雅流程 3s 兜底强退。
 */

export interface LifecycleProcess {
  readonly ppid: number;
  readonly pid: number;
  kill(pid: number, signal: string): void;
  exit(code: number): void;
  on(event: string, handler: () => void): void;
}

const GRACE_TIMEOUT_MS = 3_000;
const ORPHAN_POLL_MS = 2_000;

let exiting = false;

/** 单次优雅退出:组内广播 SIGTERM(带走 Chrome/ffmpeg)→ flush PGlite → exit。幂等。 */
export async function beginGracefulExit(
  proc: LifecycleProcess,
  reason: string,
  log: (msg: string) => void = (m) => console.error(m),
): Promise<void> {
  if (exiting) return;
  exiting = true;
  log(`[lifecycle] 优雅退出(${reason}):广播组 SIGTERM → flush 数据库 → 退出`);
  // 兜底:优雅流程卡住(库 close 挂起等)也必须在 GRACE_TIMEOUT 内退——绝不变孤儿常驻。
  const hardExit = setTimeout(() => proc.exit(0), GRACE_TIMEOUT_MS);
  (hardExit as { unref?: () => void }).unref?.();
  // ① 组内广播 SIGTERM(负 pid = 进程组;壳侧 spawn 已设组长=本进程)。自己也会收到,
  //    但 exiting 已置位 → handler 幂等忽略。子进程(Playwright Chrome/ffmpeg)收到自关。
  try {
    proc.kill(-proc.pid, "SIGTERM");
  } catch {
    /* 没有组(dev 直跑)→ 忽略,子进程随后由 OS 处理 */
  }
  // ② flush PGlite(persistence 已装配才有钩子;close 即 flush WAL,防半写损坏)。
  try {
    const dispose = (
      globalThis as { __creatorosDisposePersistence?: () => Promise<void> }
    ).__creatorosDisposePersistence;
    if (dispose) {
      await dispose();
      log("[lifecycle] 数据库已安全落盘关闭");
    }
  } catch (err) {
    log(`[lifecycle] 数据库关闭失败(照退,损坏防线在壳侧 SIGTERM 窗口): ${String(err).slice(0, 120)}`);
  }
  clearTimeout(hardExit);
  proc.exit(0);
}

/** 安装信号 handler + 孤儿自检轮询。返回停止函数(测试用)。 */
export function installSidecarLifecycle(
  proc: LifecycleProcess,
  log: (msg: string) => void = (m) => console.error(m),
): () => void {
  const onSignal = () => {
    void beginGracefulExit(proc, "收到终止信号", log);
  };
  proc.on("SIGTERM", onSignal);
  proc.on("SIGINT", onSignal);
  const timer = setInterval(() => {
    // 父进程死亡 → 被 init(pid 1)收养。壳崩溃/强退时 Rust 清理不执行,靠这条自杀兜底。
    if (proc.ppid === 1) {
      void beginGracefulExit(proc, "父进程已死(孤儿自检)", log);
    }
  }, ORPHAN_POLL_MS);
  (timer as { unref?: () => void }).unref?.();
  return () => clearInterval(timer);
}

/** 测试钩子:重置幂等位。 */
export function __resetLifecycleForTest(): void {
  exiting = false;
}
