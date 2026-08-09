/**
 * [T-365/T-362] sidecar 生命周期守护 —— 进程泄漏与库半写的 sidecar 侧双保险。
 *
 * 背景(2026-07-16 真机事故):app 退出不总能带走 sidecar(Tauri 崩溃/强退时 Rust 清理
 * 不执行;旧 kill 还是单进程 SIGKILL)→ 孤儿 next-server 累积(实测 5 个 × ~90% CPU,
 * 其一带 headless Chrome 树);孤儿/硬杀还并发写同一 PGlite → WAL 半写库损坏。
 *
 * 双保险分工(macOS/Linux,POSIX):
 *   壳侧(lib.rs):spawn 进程组 + 退出 killpg(SIGTERM → 5s → SIGKILL)——正常退出路径。
 *   本模块(sidecar 侧):
 *     ① SIGTERM/SIGINT handler → 优雅退出(先 flush PGlite 再退)——接住壳侧的 SIGTERM;
 *     ② 孤儿自检:轮询 `process.ppid === 1`(父死被 init 收养)→ 同一条优雅退出——
 *        覆盖壳崩溃/强退等 Rust 清理到不了的场景;退出前对**自己的进程组**补发 SIGTERM,
 *        把自己拉起的 Chrome/ffmpeg 一并带走(自己在 exiting 态,幂等忽略)。
 *
 * [T-372 W-core W4] Windows 分支(POSIX 三件套在 Win 全失效,逐项换等价机制):
 *   · 优雅停机信号:Windows 上 OS **不投递真 SIGTERM** 给 Node(process.kill 的 'SIGTERM'
 *     实为无条件 TerminateProcess,handler 根本没机会跑)→ 壳侧(lib.rs)改为经 **stdin 写
 *     停机哨兵行**(SHUTDOWN_SENTINEL,两侧单测各自钉住契约),本模块读到即优雅退出;
 *     SIGINT/SIGBREAK handler 照挂(有 console 的场景可用,CREATE_NO_WINDOW 下通常不会来)。
 *   · 孤儿自检:Windows **没有「父死被 init(pid 1)收养」语义**——父进程死后 ppid 只是个
 *     悬空旧值,`ppid === 1` 永假 → **唯一可靠机制** = **stdin 管道断开**(壳进程退出/崩溃,
 *     OS 关闭管道另一端 → 'end'/'error' 事件)。[T-457] 曾试图用 `kill(ppid, 0)` 探活兜底,
 *     但 Node@25 Windows 上不同 UAC/进程隔离场景下 kill 会抛 EPERM(见 2026-07-21 真机白屏
 *     事故:sidecar 起来 2s 内被误杀 → shell 60s 后仍导航死端口 → 白屏)—— 已移除该兜底,
 *     只保留 stdin 检测(误报率 > 命中率的兜底不如没有)。
 *   · 组内广播:Windows 无 POSIX 进程组,`kill(-pid)` 非法 → 不广播;Chrome/ffmpeg 子进程
 *     的兜底清理由壳侧 Job Object(JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,lib.rs W3)承担——
 *     壳句柄一关整棵树内核级必死,比 POSIX 侧还强。
 *
 * PGlite flush:persistence-client 装配完成后把 `dispose`(client.close(),flush WAL)挂在
 * `globalThis.__creatorosDisposePersistence`;这里若见到就调(没见到 = 库还没开,直接退)。
 * 观测永不伤主链路:全程 best-effort,优雅流程 3s 兜底强退。
 */

export interface LifecycleProcess {
  readonly ppid: number;
  readonly pid: number;
  /** 平台标识(真实进程即 process.platform;测试注入 "win32" 走 Windows 分支)。 */
  readonly platform?: string;
  /** POSIX 信号 / Win 探活(signal=0 只测存在,不投递)。 */
  kill(pid: number, signal: string | number): void;
  exit(code: number): void;
  on(event: string, handler: () => void): void;
  /** [W4] Windows 分支读 stdin:壳侧停机哨兵 + 管道断开(父死)检测。POSIX 分支不读。 */
  stdin?: {
    on(event: string, handler: (chunk?: unknown) => void): void;
  } | null;
}

/**
 * [T-372 W4] 壳(lib.rs)→ sidecar 的停机哨兵。Windows 无真 SIGTERM,壳经 stdin 写
 * `${SHUTDOWN_SENTINEL}\n` 触发优雅退出。⚠️ 与 lib.rs `SIDECAR_SHUTDOWN_SENTINEL`
 * 必须一致 —— 两侧单测各自钉住字面值,改任一侧必挂测。
 */
export const SHUTDOWN_SENTINEL = "__CREATOROS_SHUTDOWN__";

const GRACE_TIMEOUT_MS = 3_000;
const ORPHAN_POLL_MS = 2_000;

let exiting = false;

function isWindows(proc: LifecycleProcess): boolean {
  return (proc.platform ?? process.platform) === "win32";
}

/** 单次优雅退出:组内广播 SIGTERM(POSIX;带走 Chrome/ffmpeg)→ flush PGlite → exit。幂等。 */
export async function beginGracefulExit(
  proc: LifecycleProcess,
  reason: string,
  log: (msg: string) => void = (m) => console.error(m),
): Promise<void> {
  if (exiting) return;
  exiting = true;
  log(`[lifecycle] 优雅退出(${reason}):广播组 SIGTERM(POSIX)→ flush 数据库 → 退出`);
  // 兜底:优雅流程卡住(库 close 挂起等)也必须在 GRACE_TIMEOUT 内退——绝不变孤儿常驻。
  const hardExit = setTimeout(() => proc.exit(0), GRACE_TIMEOUT_MS);
  (hardExit as { unref?: () => void }).unref?.();
  // ① 组内广播 SIGTERM(负 pid = 进程组;壳侧 spawn 已设组长=本进程)。自己也会收到,
  //    但 exiting 已置位 → handler 幂等忽略。子进程(Playwright Chrome/ffmpeg)收到自关。
  //    [W4] Windows 无 POSIX 进程组,负 pid 非法 → 跳过;子进程兜底清理靠壳侧 Job Object
  //    (KILL_ON_JOB_CLOSE,lib.rs W3):壳退出/句柄关闭 → 整棵树(含 Chrome/ffmpeg)内核级必死。
  if (!isWindows(proc)) {
    try {
      proc.kill(-proc.pid, "SIGTERM");
    } catch {
      /* 没有组(dev 直跑)→ 忽略,子进程随后由 OS 处理 */
    }
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
    log(`[lifecycle] 数据库关闭失败(照退,损坏防线在壳侧 SIGTERM/Job Object 窗口): ${String(err).slice(0, 120)}`);
  }
  clearTimeout(hardExit);
  proc.exit(0);
}

/** 安装信号 handler + 孤儿自检轮询(平台分支见文件头注释)。返回停止函数(测试用)。 */
export function installSidecarLifecycle(
  proc: LifecycleProcess,
  log: (msg: string) => void = (m) => console.error(m),
): () => void {
  const win = isWindows(proc);
  const onSignal = () => {
    void beginGracefulExit(proc, "收到终止信号", log);
  };
  // SIGTERM:POSIX 主信号;Windows 上 OS 不会真投递(挂着无害,壳侧走 stdin 哨兵)。
  proc.on("SIGTERM", onSignal);
  proc.on("SIGINT", onSignal);
  if (win) {
    // [W4] SIGBREAK 是 Windows 独有可捕获信号(Ctrl+Break / GenerateConsoleCtrlEvent),
    //   有 console 的场景(dev 直跑)可用;打包态 CREATE_NO_WINDOW 无 console,主停机
    //   通道是下面的 stdin 哨兵。
    proc.on("SIGBREAK", onSignal);
    const stdin = proc.stdin;
    if (stdin) {
      // 停机哨兵:壳侧 kill 序列第①步写 `${SHUTDOWN_SENTINEL}\n` → 优雅退出(flush 库),
      //   壳侧等 5s 后才 TerminateJobObject 硬杀 —— 与 macOS「SIGTERM → 5s → SIGKILL」同构。
      stdin.on("data", (chunk) => {
        if (String(chunk).includes(SHUTDOWN_SENTINEL)) {
          void beginGracefulExit(proc, "收到壳侧停机哨兵(stdin)", log);
        }
      });
      // 管道断开 = 壳进程已退出/崩溃(OS 关闭了写端)→ Win 孤儿自检主检测。
      stdin.on("end", () => {
        void beginGracefulExit(proc, "stdin 管道断开(父进程已退出,Win 孤儿自检)", log);
      });
      stdin.on("error", () => {
        void beginGracefulExit(proc, "stdin 管道错误(父进程已退出,Win 孤儿自检)", log);
      });
    }
  }
  const timer = setInterval(() => {
    if (win) {
      // [T-457 后修] **移除 kill(ppid, 0) 探活** —— 2026-07-21 真机白屏事故实证:
      //   Node@25 Windows 上,sidecar 起来 2s 内 kill(process.ppid, 0) 会抛 EPERM
      //   (安装模式/UAC 隔离导致 OpenProcess 权限拒;不同用户机行为不一致,难以本地
      //    复现)→ 误判"父进程已死" → sidecar 自杀 → shell 端 60s 后仍导航死端口 → 白屏。
      //   Windows 上**唯一可靠的**孤儿信号是 stdin 管道断开(OS 关另一端 = 父死 = 事件),
      //   已在上面 `stdin.on("end"/"error")` 覆盖。轮询探活本就是"兜底",实测误报率 >
      //   命中率,直接砍。POSIX 分支 `ppid === 1` 检测保留(那是 init 收养,语义可靠)。
    } else if (proc.ppid === 1) {
      // POSIX:父进程死亡 → 被 init(pid 1)收养。壳崩溃/强退时 Rust 清理不执行,靠这条自杀兜底。
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
