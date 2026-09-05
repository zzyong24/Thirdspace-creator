import { execFile, ChildProcess } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
type Identity = { pid: number; ppid: number; pgid: number; started: string; state: string };
async function snapshot(): Promise<Map<number, Identity>> {
  const { stdout } = await exec("ps", ["-axo", "pid=,ppid=,pgid=,lstart=,stat="], { timeout: 3000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, LC_ALL: "C" } });
  const rows = new Map<number, Identity>();
  for (const line of stdout.split("\n")) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+\S+\s+\d+)\s+(\S+)$/);
    if (match) rows.set(Number(match[1]), { pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), started: match[4]!, state: match[5]! });
  }
  if (!rows.has(process.pid)) throw new Error("WORKER_TREE_SNAPSHOT_INVALID");
  return rows;
}
const same = (a: Identity, b?: Identity) => !!b && a.pid === b.pid && a.pgid === b.pgid && a.started === b.started;
const live = (child: ChildProcess) => !!child.pid && child.exitCode === null && child.signalCode === null;

/** 仅接收宿主实际创建且仍存活的ChildProcess；不接受Worker自报PID。
 * Unix逐个冻结、核验后代，不向进程组发信号，因Worker可继承App的PG。
 * ps启动时间精度有限：身份复核缩小PID复用风险，并非内核级所有权保证。
 */
export async function killWorkerProcessTree(child: ChildProcess): Promise<void> {
  if (!(child instanceof ChildProcess)) throw new Error("WORKER_TREE_CHILD_HANDLE_REQUIRED");
  if (!live(child)) throw new Error("WORKER_TREE_ROOT_NOT_LIVE");
  const pid = child.pid!;
  if (process.platform === "win32") {
    await exec("taskkill", ["/PID", String(pid), "/T", "/F"], { timeout: 10000, windowsHide: true });
    return;
  }
  const before = (await snapshot()).get(pid);
  if (!before || before.ppid !== process.pid || !live(child)) throw new Error("WORKER_TREE_OWNER_UNVERIFIED");
  const frozen = new Map<number, Identity>();
  const killed = new Set<number>();
  let failure: unknown;
  try {
    if (!child.kill("SIGSTOP")) throw new Error("WORKER_TREE_FREEZE_FAILED");
    frozen.set(pid, before);
    let stable = 0;
    for (let round = 0; round < 16 && stable < 2; round++) {
      const rows = await snapshot();
      for (const identity of frozen.values()) {
        const now = rows.get(identity.pid);
        if (now && !same(identity, now)) throw new Error("WORKER_TREE_IDENTITY_CHANGED");
      }
      let added = false;
      // 每轮只沿已冻结且身份仍匹配的父节点扩展，避免信任陈旧ppid。
      for (const row of rows.values()) {
        const parent = frozen.get(row.ppid);
        if (frozen.has(row.pid) || !parent || !same(parent, rows.get(row.ppid))) continue;
        const current = (await snapshot()).get(row.pid);
        if (!current) continue;
        if (!same(row, current) || current!.ppid !== row.ppid) throw new Error("WORKER_TREE_IDENTITY_CHANGED");
        try { process.kill(row.pid, "SIGSTOP"); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ESRCH" && !(await snapshot()).has(row.pid)) continue;
          throw error;
        }
        frozen.set(row.pid, row); added = true;
      }
      stable = added || [...frozen.values()].some(row => {
        const current = rows.get(row.pid); return current && !/[TZ]/.test(current.state);
      }) ? 0 : stable + 1;
    }
    if (stable < 2) throw new Error("WORKER_TREE_NOT_STABLE");
    for (const identity of [...frozen.values()].reverse()) {
      const current = (await snapshot()).get(identity.pid);
      if (!current) { killed.add(identity.pid); continue; }
      if (!same(identity, current)) throw new Error("WORKER_TREE_IDENTITY_CHANGED");
      try { process.kill(identity.pid, "SIGKILL"); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH" || (await snapshot()).has(identity.pid)) throw error;
      }
      killed.add(identity.pid);
    }
    // kill已发出不代表清理完成；僵尸不再执行，待OS/父进程回收。
    for (let round = 0; round < 40; round++) {
      const rows = await snapshot();
      if ([...frozen.values()].every(row => !same(row, rows.get(row.pid)) || rows.get(row.pid)!.state.includes("Z"))) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error("WORKER_TREE_EXIT_TIMEOUT");
  } catch (error) { failure = error; throw error; }
  finally {
    if ([...frozen.keys()].some(pid => !killed.has(pid))) {
    let rows: Map<number, Identity> | undefined;
    let verificationError: unknown;
    for (let retry = 0; retry < 3; retry++) {
      try { rows = await snapshot(); break; }
      catch (error) { verificationError = error; await new Promise(resolve => setTimeout(resolve, 20)); }
    }
    if (!rows) throw new AggregateError([failure, verificationError].filter(Boolean), "WORKER_TREE_RESUME_UNVERIFIED");
    const resumeErrors: unknown[] = [];
    for (const row of frozen.values()) {
      if (!killed.has(row.pid) && !row.state.includes("T") && same(row, rows.get(row.pid))) {
        try { process.kill(row.pid, "SIGCONT"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") resumeErrors.push(error); }
      }
    }
    if (resumeErrors.length) throw new AggregateError([failure, ...resumeErrors].filter(Boolean), "WORKER_TREE_RESUME_FAILED");
    }
  }
}
