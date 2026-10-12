import {
  boundedExceptionContext,
  type ExceptionCapture,
} from "@creatoros/contract";
import {
  constants,
  openSync,
  closeSync,
  writeSync,
  fstatSync,
  readSync,
  lstatSync,
  readdirSync,
  realpathSync,
  fchmodSync,
  ftruncateSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";
import { createHash } from "node:crypto";
import packageJson from "../../package.json";
import type { RequestContext } from "@creatoros/contract";
import type {
  ObservabilityCollector,
  createObservabilityTaskLedger,
} from "@creatoros/backend/modules/observability";
import {
  type LogSnapshot,
  createGrowthObservabilityTransport,
  listEncryptedLogSnapshots,
  readPendingEncryptedLog,
  readNativeExceptionMetadata,
} from "./feedback/encrypted-log-upload.server";
export function createObservabilityHost(ports: {
  ctx: RequestContext;
  collector: ObservabilityCollector;
  ledger: ReturnType<typeof createObservabilityTaskLedger>;
  transport?: ReturnType<typeof createGrowthObservabilityTransport>;
  logDir: string | null;
  appVersion: string | null;
  osName: "macos" | "windows" | "linux";
  online: () => boolean;
}) {
  const transport = ports.transport ?? createGrowthObservabilityTransport();
  let running: Promise<void> | null = null;
  let active: AbortController | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  const allowed = async () => {
    const grant = await ports.collector.status(ports.ctx);
    return (
      (grant.enabled || grant.metricsEnabled) &&
      !stopped &&
      ports.online() &&
      !(await ports.ledger.isBusy(ports.ctx))
    );
  };
  async function round() {
    if (!ports.appVersion) {
      await ports.collector
        .setError("OBSERVABILITY_VERSION_UNAVAILABLE")
        .catch(() => {});
      return;
    }
    if (!(await allowed())) return;
    const claim = await ports.collector.claimRound(ports.ctx);
    if (!claim) return;
    const control = new AbortController();
    active = control;
    const wholeRoundDeadline = setTimeout(
      () => control.abort(new Error("OBSERVABILITY_ROUND_DEADLINE")),
      1960000,
    );
    wholeRoundDeadline.unref?.();
    let busyCheck = false;
    const busyMonitor = setInterval(() => {
      if (busyCheck) return;
      busyCheck = true;
      void allowed()
        .then((ok) => {
          if (!ok) control.abort(new Error("OBSERVABILITY_BUSY"));
        })
        .catch(() => control.abort())
        .finally(() => {
          busyCheck = false;
        });
    }, 5000);
    busyMonitor.unref?.();
    let pendingError: string | null = null;
    try {
      await ports.collector.prune();
      const identity = {
        installationAlias: claim.installationAlias,
        appVersion: ports.appVersion,
        osName: ports.osName,
      };
      const config = await ports.collector.saveConfig(
        await transport.getConfig(identity, control.signal),
      );
      if (!config.enabled || !(await allowed())) return;
      if (ports.logDir) {
        for (const event of await readNativeExceptionMetadata(ports.logDir))
          await ports.collector.recordNativeException(ports.ctx, event);
      }
      // 补读限每页200；只有本机空闲日轮执行，不做额外网络。
      for (let page = 0; page < 50; page++) {
        if ((await ports.ledger.sweep(ports.ctx)) < 100) break;
        if (!(await allowed())) return;
      }
      const grant = await ports.collector.status(ports.ctx);
      const batches = grant.metricsEnabled
        ? await ports.collector.sealBatches(
            ports.ctx,
            identity,
            4,
            Math.min(262144, config.maxRoundBytes),
          )
        : [];
      const snapshots: LogSnapshot[] = [];
      let frozenBytes = 10485760;
      if (grant.enabled && ports.logDir) {
        const pending = await ports.collector.pendingLogs(ports.ctx);
        for (const meta of pending.slice(0, 8)) {
          if (meta.byteLength > frozenBytes) break;
          try {
            const snapshot = await readPendingEncryptedLog(ports.logDir, meta);
            snapshots.push(snapshot);
            frozenBytes -= snapshot.byteLength;
          } catch (error) {
            const code =
              error instanceof Error &&
              error.message === "LOG_PENDING_SOURCE_CHANGED"
                ? "LOG_PENDING_SOURCE_CHANGED"
                : "LOG_PENDING_SOURCE_UNAVAILABLE";
            await ports.collector.dropPendingLog(ports.ctx, meta.sha256, code);
            pendingError = code;
          }
        }
        if (frozenBytes > 0) {
          const fresh = await listEncryptedLogSnapshots(
            ports.logDir,
            frozenBytes,
            async (sha) =>
              pending.some((v) => v.sha256 === sha) ||
              (await ports.collector.wasLogAcknowledged(sha)),
          );
          for (const snapshot of fresh.slice(0, 8 - snapshots.length)) {
            await ports.collector.enqueueLog(ports.ctx, {
              fileName: snapshot.fileName!,
              sessionId: snapshot.sessionId,
              sha256: snapshot.sha256,
              byteLength: snapshot.byteLength,
              logDate: snapshot.logDate,
            });
            snapshots.push(snapshot);
          }
        }
      }
      // 日轮此处全部冻结；实际数据slot至多9，含首个config GET不超过10个request。
      let remaining = config.maxRoundBytes;
      let slots = 9;
      const sendMetrics = async () => {
        for (const batch of batches) {
          const bytes = Buffer.byteLength(batch.body);
          if (slots === 0 || bytes > remaining || !(await allowed())) break;
          await transport.uploadBatch(
            batch,
            config.uploadBytesPerSecond,
            control.signal,
          );
          await ports.collector.acknowledgeBatch(
            ports.ctx,
            batch.batchId,
            batch.bodySha256,
            batch.batchId,
          );
          remaining -= bytes;
          slots--;
        }
      };
      const sendLogs = async () => {
        for (const snapshot of snapshots) {
          if (slots === 0 || control.signal.aborted || !(await allowed()))
            break;
          if (snapshot.byteLength > remaining) {
            pendingError = "LOG_PENDING_ROUND_BUDGET";
            continue;
          }
          const receipt = await transport.uploadLog(
            identity,
            snapshot,
            config.uploadBytesPerSecond,
            control.signal,
          );
          await ports.collector.acknowledgeLog(
            snapshot.sessionId,
            snapshot.sha256,
            receipt.receiptId,
          );
          remaining -= snapshot.byteLength;
          slots--;
        }
      };
      if (claim.preferLogs) {
        await sendLogs();
        await sendMetrics();
      } else {
        await sendMetrics();
        await sendLogs();
      }
      await ports.collector.setError(pendingError);
    } catch (error) {
      if (!control.signal.aborted) {
        const code =
          error instanceof Error &&
          /^OBSERVABILITY_HTTP_\d+$|^LOG_RECEIPT_MISMATCH$|^OBSERVABILITY_RECEIPT_MISMATCH$|^OBSERVABILITY_CONFIG_STALE$/.test(
            error.message,
          )
            ? error.message
            : "OBSERVABILITY_NETWORK_UNAVAILABLE";
        await ports.collector.setError(code).catch(() => {});
      }
    } finally {
      clearTimeout(wholeRoundDeadline);
      clearInterval(busyMonitor);
      if (active === control) active = null;
    }
  }
  return {
    tick() {
      if (stopped) return Promise.resolve();
      if (running) return running;
      running = round()
        .catch(() => {})
        .finally(() => {
          running = null;
        });
      return running;
    },
    start() {
      if (timer || stopped) return;
      timer = setInterval(() => {
        void this.tick();
      }, 60000);
      timer.unref?.();
    },
    pause() {
      active?.abort(new Error("OBSERVABILITY_PAUSED"));
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      active?.abort(new Error("OBSERVABILITY_STOPPED"));
      active = null;
    },
  };
}
export function installNodeExceptionMonitor(
  proc: Pick<NodeJS.Process, "on" | "off">,
  sink: (event: {
    eventId: string;
    module: "backend";
    code: string;
    occurredAt: string;
    referenceId: null;
    stack: string;
    message: string;
  }) => void,
) {
  const monitor = (error: Error) => {
    try {
      sink(
        boundedExceptionContext({
          eventId: createHash("sha256")
            .update(crypto.randomUUID())
            .digest("hex"),
          module: "backend",
          code: "UNCLASSIFIED_EXCEPTION",
          occurredAt: new Date().toISOString(),
          referenceId: null,
          stack: Buffer.from(error.stack ?? "")
            .subarray(0, 18000)
            .toString("utf8"),
          message: error.message,
        }),
      );
    } catch {
      /* 保原崩溃 */
    }
  };
  proc.on("uncaughtExceptionMonitor", monitor);
  return () => proc.off("uncaughtExceptionMonitor", monitor);
}

export function resolveObservabilityAppVersion(
  injected: unknown = process.env.CREATOROS_APP_VERSION,
  fallback: unknown = packageJson.version,
): string | null {
  for (const value of [injected, fallback])
    if (typeof value === "string" && /^[a-zA-Z0-9._+-]{1,64}$/.test(value))
      return value;
  return null;
}

export function captureNodeFatalContext(
  event: ExceptionCapture,
  logDir: string | undefined = process.env.CREATOROS_LOG_DIR,
) {
  const value = boundedExceptionContext(event);
  // 不等待SQL/异步console flush；原Rust stderr tee继续脱敏、公钥加密。
  try {
    writeSync(2, `[observability-exception] ${JSON.stringify(value)}\n`);
  } catch {
    /* 保原退出 */
  }
  if (!logDir || !isAbsolute(logDir)) return;
  try {
    if (lstatSync(logDir).isSymbolicLink()) return;
    const root = realpathSync(logDir);
    let sessionId = process.env.CREATOROS_LOG_SESSION_ID;
    if (sessionId === undefined) {
      const candidates = readdirSync(root)
        .filter((name) =>
          /^sidecar-\d{4}-\d{2}-\d{2}(?:-\d+)?\.log\.enc$/.test(name),
        )
        .slice(-64)
        .map((name) => ({ name, info: lstatSync(join(root, name)) }))
        .filter((v) => v.info.isFile() && !v.info.isSymbolicLink())
        .sort((a, b) => b.info.mtimeMs - a.info.mtimeMs);
      if (!candidates.length) return;
      const descriptor = openSync(
        join(root, candidates[0]!.name),
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
      );
      try {
        const header = Buffer.alloc(775);
        const length = readSync(descriptor, header, 0, header.length, 0);
        if (
          length < 7 ||
          !header.subarray(0, 6).equals(Buffer.from("CRLOG\x01")) ||
          header[6]! < 1 ||
          header[6]! > 8
        )
          return;
        const bytes = 7 + 96 * header[6]!;
        if (length < bytes) return;
        sessionId = createHash("sha256")
          .update(header.subarray(0, bytes))
          .digest("hex");
      } finally {
        closeSync(descriptor);
      }
    }
    if (!sessionId || !/^[a-f0-9]{64}$/.test(sessionId)) return;
    const target = join(root, "host-exceptions.jsonl");
    const file = openSync(
      target,
      constants.O_APPEND |
        constants.O_CREAT |
        constants.O_RDWR |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    try {
      const info = fstatSync(file);
      if (!info.isFile() || info.size > 1048576) return;
      fchmodSync(file, 0o600);
      const raw = Buffer.alloc(info.size);
      const length = readSync(file, raw, 0, raw.length, 0);
      let content = raw.subarray(0, length).toString("utf8");
      if (!content.endsWith("\n") && content.length) {
        content = content.slice(0, content.lastIndexOf("\n") + 1);
        ftruncateSync(file, Buffer.byteLength(content));
      }
      const cutoff = Date.now() - 30 * 86400000;
      const rows = content
        .split("\n")
        .slice(0, -1)
        .filter((line) => {
          try {
            const parsed = JSON.parse(line);
            return (
              Object.keys(parsed).sort().join(",") ===
                "code,eventId,logSessionId,occurredAt" &&
              Date.parse(parsed.occurredAt) >= cutoff
            );
          } catch {
            return false;
          }
        })
        .slice(-4999);
      const appended =
        JSON.stringify({
          eventId: value.eventId,
          code: "NODE_UNCAUGHT_EXCEPTION",
          occurredAt: value.occurredAt,
          logSessionId: sessionId,
        }) + "\n";
      let kept = rows.join("\n") + (rows.length ? "\n" : "");
      while (Buffer.byteLength(kept) + Buffer.byteLength(appended) > 1048576) {
        rows.shift();
        kept = rows.join("\n") + (rows.length ? "\n" : "");
      }
      if (kept !== content) {
        ftruncateSync(file, 0);
        if (kept) writeSync(file, kept);
      }
      writeSync(file, appended);
    } finally {
      closeSync(file);
    }
  } catch {
    /* 元数据故障不会吞异常/延缓原fatal */
  }
}
