// One project-wide lock for writers that update BACKLOG plus an append-only
// event ledger. mkdir is the atomic primitive: concurrent agents either own the
// whole multi-file transition or fail explicitly; they never both overwrite a
// snapshot assembled from stale reads.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return null;
  }
}

function readOwner(ownerFile) {
  try {
    return JSON.parse(readFileSync(ownerFile, "utf8"));
  } catch {
    return null;
  }
}

export function acquireStateLock(root, { operation = "state-write" } = {}) {
  const canonicalRoot = realpathSync(root);
  const controlDir = path.join(canonicalRoot, "orchestrator");
  const lockDir = path.join(controlDir, ".state-write.lock");
  const ownerFile = path.join(lockDir, "owner.json");
  mkdirSync(controlDir, { recursive: true });

  const claim = () => mkdirSync(lockDir);
  try {
    claim();
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const previous = readOwner(ownerFile);
    // Do not auto-steal a stale-looking lock: PID reuse and two simultaneous
    // stealers can otherwise reintroduce the exact split-brain this guard
    // prevents. A provably dead owner is reported as stale for explicit,
    // inspectable recovery.
    const alive = previous ? processIsAlive(previous.pid) : null;
    const holder = previous
      ? `pid=${previous.pid}, operation=${previous.operation}, since=${previous.started_at}${
          alive === false ? ", stale-owner" : ""
        }`
      : "owner unreadable";
    throw new Error(
      `状态写锁已被占用（${holder}）；拒绝并发覆盖 BACKLOG/event${
        alive === false ? `。确认无写进程后移除 ${lockDir}` : ""
      }`,
    );
  }

  const token = randomUUID();
  try {
    writeFileSync(
      ownerFile,
      `${JSON.stringify({
        schema: "orchestrator-state-lock/v1",
        token,
        pid: process.pid,
        operation,
        started_at: new Date().toISOString(),
      })}\n`,
    );
  } catch (error) {
    rmSync(lockDir, { recursive: true, force: true });
    throw error;
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const current = existsSync(ownerFile) ? readOwner(ownerFile) : null;
    // Never remove a successor's lock if this owner was recovered/replaced.
    if (current?.token === token) rmSync(lockDir, { recursive: true, force: true });
    process.off("exit", release);
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  };
  const onSigint = () => {
    release();
    process.exit(130);
  };
  const onSigterm = () => {
    release();
    process.exit(143);
  };
  process.once("exit", release);
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  return release;
}
