// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { createObservabilityHost } from "./observability-host.server";
const ctx = { userId: "local", requestId: "test", source: "user" as const };
function fixture() {
  let enabled = false,
    due = true,
    busy = false;
  const aborts: boolean[] = [];
  const transport = {
    getConfig: vi.fn(async () => ({
      revision: 1,
      enabled: true,
      reportIntervalHours: 24,
      maxRoundBytes: 65536,
      uploadBytesPerSecond: 16384,
      captureLevel: "error",
      debugExpiresAt: null,
      exceptionSampleRate: 1,
      scopeModules: ["ui"],
      expiresAt: "2027-01-01T00:00:00.000Z",
    })),
    uploadBatch: vi.fn(),
    uploadLog: vi.fn(),
  };
  const collector = {
    status: vi.fn(async () => ({ enabled, metricsEnabled: enabled })),
    claimRound: vi.fn(async () =>
      due ? ((due = false), { installationAlias: crypto.randomUUID() }) : null,
    ),
    saveConfig: vi.fn(async (c) => c),
    sealBatches: vi.fn(async () => []),
    prune: vi.fn(async () => {}),
    setError: vi.fn(),
    wasLogAcknowledged: vi.fn(),
    acknowledgeLog: vi.fn(),
    acknowledgeBatch: vi.fn(),
  };
  const host = createObservabilityHost({
    ctx,
    collector: collector as never,
    ledger: { isBusy: async () => busy, sweep: async () => 0 } as never,
    transport: transport as never,
    logDir: null,
    appVersion: "1.2.0",
    osName: "macos",
    online: () => true,
  });
  return {
    host,
    transport,
    collector,
    enable: () => (enabled = true),
    setBusy: () => (busy = true),
    aborts,
  };
}
describe("T1255 host daily network boundary", () => {
  it("unconsented makes zero requests", async () => {
    const f = fixture();
    await f.host.tick();
    expect(f.transport.getConfig).not.toHaveBeenCalled();
    expect(f.collector.claimRound).not.toHaveBeenCalled();
  });
  it("busy postpones atomic claim and network", async () => {
    const f = fixture();
    f.enable();
    f.setBusy();
    await f.host.tick();
    expect(f.collector.claimRound).not.toHaveBeenCalled();
    expect(f.transport.getConfig).not.toHaveBeenCalled();
  });
  it("remote pause permits one due control GET but zero data", async () => {
    const f = fixture();
    f.enable();
    f.transport.getConfig.mockResolvedValueOnce({
      ...(await f.transport.getConfig()),
      enabled: false,
    });
    f.transport.getConfig.mockClear();
    await f.host.tick();
    await f.host.tick();
    expect(f.transport.getConfig).toHaveBeenCalledTimes(1);
    expect(f.transport.uploadLog).not.toHaveBeenCalled();
    expect(f.transport.uploadBatch).not.toHaveBeenCalled();
  });
  it("failed config consumes the round without immediate retry", async () => {
    const f = fixture();
    f.enable();
    f.transport.getConfig.mockRejectedValueOnce(Error("offline"));
    await f.host.tick();
    await f.host.tick();
    expect(f.transport.getConfig).toHaveBeenCalledTimes(1);
    expect(f.collector.setError).toHaveBeenCalledWith(
      "OBSERVABILITY_NETWORK_UNAVAILABLE",
    );
  });
});
import { resolveObservabilityAppVersion } from "./observability-host.server";
it("uses the actual injected desktop version and real package fallback without inventing a version", () => {
  expect(resolveObservabilityAppVersion("2.3.4-owner", "1.2.0-dev")).toBe(
    "2.3.4-owner",
  );
  expect(resolveObservabilityAppVersion(undefined, "1.2.0-dev")).toBe(
    "1.2.0-dev",
  );
  expect(resolveObservabilityAppVersion("bad/path", "")).toBeNull();
});

import { createRequire } from "node:module";
import { resolve } from "node:path";
const backendRequire = createRequire(
  resolve(process.cwd(), "../backend/package.json"),
);
const { PGlite } = backendRequire("@electric-sql/pglite");
const { drizzle } = backendRequire("drizzle-orm/pglite");
import { createObservabilityCollector } from "@creatoros/backend/modules/observability";
import { OBSERVABILITY_DDL } from "../../../backend/src/schema/observability";
import { DEFAULT_OBSERVABILITY_CONFIG } from "@creatoros/contract";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
it("two real durable daily rounds alternate a full 10MiB ciphertext and metrics without widening budget", async () => {
  const pg = new PGlite();
  await pg.exec(OBSERVABILITY_DDL);
  const dir = await mkdtemp(join(tmpdir(), "t1255-full-round-"));
  let at = "2026-10-12T00:00:00.000Z";
  const database = drizzle(pg) as never;
  const make = () =>
    createObservabilityCollector(database, {
      now: () => at,
      uploadAvailable: () => true,
      writeEncryptedContext: () => {},
    });
  const collector = make();
  try {
    const header = Buffer.concat([
      Buffer.from("CRLOG\x01"),
      Buffer.from([1]),
      Buffer.alloc(96),
    ]);
    const length = 10485760 - header.length - 4;
    const len = Buffer.alloc(4);
    len.writeUInt32LE(length);
    const body = Buffer.concat([header, len, Buffer.alloc(length)]);
    await writeFile(join(dir, "sidecar-2026-10-12.log.enc"), body);
    await collector.setConsent(ctx, {
      enabled: true,
      metricsEnabled: true,
      consentVersion: 2,
    });
    await collector.recordOutcome(ctx, {
      eventId: "metric-one",
      measurement: "request",
      operationId: "ai.tasks.create",
      result: "success",
      occurredAt: "2026-10-12T00:01:00.000Z",
    });
    const sends: string[] = [];
    const transport = {
      getConfig: async () => ({ ...DEFAULT_OBSERVABILITY_CONFIG, revision: 1 }),
      uploadBatch: async () => {
        sends.push("metrics");
        return {};
      },
      uploadLog: async (_identity: any, snapshot: any) => {
        sends.push("log");
        expect(snapshot.byteLength).toBe(10485760);
        expect(createHash("sha256").update(snapshot.body).digest("hex")).toBe(
          snapshot.sha256,
        );
        return { receiptId: "full-log" };
      },
    };
    const ledger = { isBusy: async () => false, sweep: async () => 0 };
    at = "2026-10-13T00:00:00.000Z";
    const first = createObservabilityHost({
      ctx,
      collector,
      ledger: ledger as never,
      transport: transport as never,
      logDir: dir,
      appVersion: "1.2.0-fixture",
      osName: "macos",
      online: () => true,
    });
    await first.tick();
    await first.tick();
    expect(sends).toEqual(["metrics"]);
    expect(await collector.pendingLogs(ctx)).toHaveLength(1);
    first.stop();
    at = "2026-10-14T00:00:00.000Z";
    const restarted = make();
    await restarted.recordOutcome(ctx, {
      eventId: "metric-two",
      measurement: "request",
      operationId: "ai.tasks.create",
      result: "success",
      occurredAt: "2026-10-13T00:01:00.000Z",
    });
    const second = createObservabilityHost({
      ctx,
      collector: restarted,
      ledger: ledger as never,
      transport: transport as never,
      logDir: dir,
      appVersion: "1.2.0-fixture",
      osName: "macos",
      online: () => true,
    });
    await second.tick();
    expect(sends).toEqual(["metrics", "log"]);
    expect(await restarted.pendingLogs(ctx)).toHaveLength(0);
    expect(
      await restarted.sealBatches(ctx, {
        appVersion: "1.2.0-fixture",
        osName: "macos",
      }),
    ).toHaveLength(1);
    second.stop();
  } finally {
    await pg.close();
    await rm(dir, { recursive: true, force: true });
  }
});
it("log-only daily round diagnoses rotated pending file and continues a valid ciphertext", async () => {
  const pg = new PGlite();
  await pg.exec(OBSERVABILITY_DDL);
  const dir = await mkdtemp(join(tmpdir(), "t1255-rotated-round-"));
  let at = "2026-10-12T00:00:00.000Z";
  const collector = createObservabilityCollector(drizzle(pg) as never, {
    now: () => at,
    uploadAvailable: () => true,
    writeEncryptedContext: () => {},
  });
  try {
    await collector.setConsent(ctx, {
      enabled: true,
      metricsEnabled: false,
      consentVersion: 2,
    });
    await collector.enqueueLog(ctx, {
      fileName: "sidecar-2026-10-11.log.enc",
      sessionId: "a".repeat(64),
      sha256: "b".repeat(64),
      byteLength: 123,
      logDate: "2026-10-11",
    });
    const header = Buffer.concat([
      Buffer.from("CRLOG\x01"),
      Buffer.from([1]),
      Buffer.alloc(96),
    ]);
    await writeFile(
      join(dir, "sidecar-2026-10-12.log.enc"),
      Buffer.concat([header, Buffer.from([16, 0, 0, 0]), Buffer.alloc(16)]),
    );
    let received = 0;
    const host = createObservabilityHost({
      ctx,
      collector,
      ledger: { isBusy: async () => false, sweep: async () => 0 } as never,
      transport: {
        getConfig: async () => ({
          ...DEFAULT_OBSERVABILITY_CONFIG,
          revision: 1,
        }),
        uploadLog: async () => {
          received++;
          return { receiptId: "good-log" };
        },
      } as never,
      logDir: dir,
      appVersion: "1.2.0-fixture",
      osName: "macos",
      online: () => true,
    });
    at = "2026-10-13T00:00:00.000Z";
    await host.tick();
    expect(received).toBe(1);
    expect(await collector.pendingLogs(ctx)).toHaveLength(0);
    expect((await collector.status(ctx)).lastErrorCode).toBe(
      "LOG_PENDING_SOURCE_UNAVAILABLE",
    );
    const state = await pg.query(
      "SELECT dropped_log_count FROM observability_installation",
    );
    expect(state.rows).toEqual([{ dropped_log_count: 1 }]);
    host.stop();
  } finally {
    await pg.close();
    await rm(dir, { recursive: true, force: true });
  }
});

import { spawn } from "node:child_process";
it("actual Node uncaught exception still exits with failure after the passive monitor", async () => {
  const script = `import {installNodeExceptionMonitor} from './src/server/observability-host.server.ts';installNodeExceptionMonitor(process,event=>{process.stderr.write('T1255_MONITOR:'+JSON.stringify({code:event.code,module:event.module})+'\\n')});throw new Error('fake fixture fatal');`;
  const result = await new Promise<{ code: number | null; error: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", script],
        { cwd: process.cwd(), stdio: ["ignore", "ignore", "pipe"] },
      );
      let error = "";
      const deadline = setTimeout(() => {
        child.kill("SIGKILL");
        reject(Error("fixture process exceeded 120s"));
      }, 120000);
      child.stderr.on("data", (chunk) => (error += chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(deadline);
        resolve({ code, error });
      });
    },
  );
  expect(result.code).toBe(1);
  expect(result.error).toContain(
    'T1255_MONITOR:{"code":"UNCLASSIFIED_EXCEPTION","module":"backend"}',
  );
  expect(result.error).toContain("fake fixture fatal");
});

import { readNativeExceptionMetadata } from "./feedback/encrypted-log-upload.server";
it("fatal child exits1, next startup imports closed metadata once and preserves separate continuous metrics grant", async () => {
  const dir = await mkdtemp(join(tmpdir(), "t1255-node-fatal-"));
  const pg = new PGlite();
  await pg.exec(OBSERVABILITY_DDL);
  let at = new Date(Date.now() - 10000).toISOString();
  const database = drizzle(pg) as never;
  const make = () =>
    createObservabilityCollector(database, {
      now: () => at,
      uploadAvailable: () => true,
      writeEncryptedContext: () => {},
    });
  let collector = make();
  try {
    await writeFile(
      join(dir, "sidecar-2026-10-12.log.enc"),
      Buffer.concat([
        Buffer.from("CRLOG\x01"),
        Buffer.from([1]),
        Buffer.alloc(96),
      ]),
    );
    await collector.setConsent(ctx, {
      enabled: true,
      metricsEnabled: true,
      consentVersion: 2,
    });
    const script = `import {installNodeExceptionMonitor,captureNodeFatalContext} from './src/server/observability-host.server.ts';installNodeExceptionMonitor(process,event=>captureNodeFatalContext(event,process.env.T1255_TEST_LOG_DIR));throw new Error('fake fatal private body');`;
    const result = await new Promise<{ code: number | null; error: string }>(
      (done, reject) => {
        const child = spawn(
          process.execPath,
          ["--import", "tsx", "--input-type=module", "-e", script],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              CREATOROS_LOG_SESSION_ID: "a".repeat(64),
              T1255_TEST_LOG_DIR: dir,
            },
            stdio: ["ignore", "ignore", "pipe"],
          },
        );
        let error = "";
        const deadline = setTimeout(() => {
          child.kill("SIGKILL");
          reject(Error("fatal fixture exceeded120s"));
        }, 120000);
        child.stderr.on("data", (chunk) => (error += chunk));
        child.on("error", reject);
        child.on("close", (code) => {
          clearTimeout(deadline);
          done({ code, error });
        });
      },
    );
    expect(result.code).toBe(1);
    expect(result.error).toContain("fake fatal private body");
    const raw = await readFile(join(dir, "host-exceptions.jsonl"), "utf8");
    expect(raw).not.toContain("private body");
    const rows = await readNativeExceptionMetadata(dir);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual([
      "code",
      "eventId",
      "logSessionId",
      "occurredAt",
    ]);
    expect(rows[0]!.code).toBe("NODE_UNCAUGHT_EXCEPTION");
    at = new Date(Date.now() + 1000).toISOString();
    await collector.setConsent(ctx, {
      enabled: false,
      metricsEnabled: true,
      consentVersion: 2,
    });
    collector = make();
    expect(await collector.recordNativeException(ctx, rows[0]!)).toBe(true);
    expect(await collector.recordNativeException(ctx, rows[0]!)).toBe(false);
    const batches = await collector.sealBatches(ctx, {
      appVersion: "1.2.0-t1255-fixture",
      osName: "macos",
    });
    expect(batches).toHaveLength(1);
    const body = JSON.parse(batches[0]!.body);
    expect(body.exceptions).toEqual([
      expect.objectContaining({
        code: "NODE_UNCAUGHT_EXCEPTION",
        module: "backend",
        count: 1,
      }),
    ]);
    await collector.acknowledgeBatch(
      ctx,
      batches[0]!.batchId,
      batches[0]!.bodySha256,
      "fake-fatal-receipt",
    );
    collector = make();
    expect(await collector.recordNativeException(ctx, rows[0]!)).toBe(false);
    await collector.setConsent(ctx, {
      enabled: true,
      metricsEnabled: false,
      consentVersion: 2,
    });
    const disallowed = {
      ...rows[0]!,
      eventId: crypto.randomUUID(),
      occurredAt: new Date(Date.now() + 2000).toISOString(),
    };
    expect(await collector.recordNativeException(ctx, disallowed)).toBe(false);
    at = new Date(Date.now() + 3000).toISOString();
    await collector.setConsent(ctx, {
      enabled: true,
      metricsEnabled: true,
      consentVersion: 2,
    });
    expect(await collector.recordNativeException(ctx, disallowed)).toBe(false);
  } finally {
    await pg.close();
    await rm(dir, { recursive: true, force: true });
  }
});
