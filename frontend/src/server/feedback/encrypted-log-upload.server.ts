import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, readdir, open, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  encryptedLogReceipt,
  observabilityConfigResponse,
  observabilityReceipt,
} from "@creatoros/contract";
const GROWTH_ORIGIN = "https://growth.aitongban.cloud";
const MAX_LOG_BYTES = 10485760;
const digest = (body: Buffer | string) =>
  createHash("sha256").update(body).digest("hex");
export type LogSnapshot = {
  fileName?: string;
  body: Buffer;
  byteLength: number;
  sessionId: string;
  sha256: string;
  logDate: string;
};
export type InstallationIdentity = {
  installationAlias: string;
  appVersion: string;
  osName: "macos" | "windows" | "linux";
};
// SEMANTIC_BOUNDARY_ALLOW: 只读原CRLOG完整帧边界，不解密、不判断日志内容。
export function completeLogPrefix(body: Buffer) {
  if (body.length < 7 || !body.subarray(0, 6).equals(Buffer.from("CRLOG\x01")))
    throw Error("LOG_HEADER_INVALID");
  const recipients = body[6]!;
  if (recipients < 1 || recipients > 8) throw Error("LOG_RECIPIENTS_INVALID");
  const header = 7 + 96 * recipients;
  if (body.length < header) throw Error("LOG_HEADER_TRUNCATED");
  let end = header;
  while (end + 4 <= body.length) {
    const length = body.readUInt32LE(end);
    if (length < 16 || length > MAX_LOG_BYTES) throw Error("LOG_FRAME_INVALID");
    if (end + 4 + length > body.length) break;
    end += 4 + length;
  }
  return body.subarray(0, end);
}
export async function listEncryptedLogSnapshots(
  logDir: string,
  maxBytes = MAX_LOG_BYTES,
  wasAcknowledged: (sha: string) => Promise<boolean> = async () => false,
): Promise<LogSnapshot[]> {
  if (!isAbsolute(logDir)) return [];
  const rootStat = await lstat(logDir);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw Error("LOG_DIRECTORY_INVALID");
  const root = await realpath(logDir);
  const names = (await readdir(root))
    .filter((name) =>
      /^sidecar-\d{4}-\d{2}-\d{2}(?:-\d+)?\.log\.enc$/.test(name),
    )
    .sort()
    .slice(-64);
  const result: LogSnapshot[] = [];
  let remaining = Math.min(MAX_LOG_BYTES, maxBytes);
  for (const name of names) {
    const file = join(root, name);
    const info = await lstat(file);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size > MAX_LOG_BYTES ||
      info.size > remaining
    )
      continue;
    const actual = await realpath(file);
    const rel = relative(root, actual);
    if (rel.startsWith("..") || isAbsolute(rel) || actual !== file) continue;
    const handle = await open(
      file,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    try {
      const current = await handle.stat();
      if (
        !current.isFile() ||
        current.dev !== info.dev ||
        current.ino !== info.ino ||
        current.size > MAX_LOG_BYTES
      )
        continue;
      const raw = Buffer.alloc(current.size);
      const { bytesRead } = await handle.read(raw, 0, current.size, 0);
      let body: Buffer;
      try {
        body = completeLogPrefix(raw.subarray(0, bytesRead));
      } catch {
        continue;
      }
      const header = 7 + 96 * body[6]!;
      if (body.length === header) continue;
      const sha256 = digest(body);
      if (await wasAcknowledged(sha256)) continue;
      remaining -= body.length;
      result.push({
        fileName: name,
        body: Buffer.from(body),
        byteLength: body.length,
        sessionId: digest(body.subarray(0, header)),
        sha256,
        logDate: name.slice(8, 18),
      });
    } finally {
      await handle.close();
    }
  }
  return result;
}
async function boundedJson(response: Response, limit: number) {
  const reader = response.body?.getReader();
  if (!reader) throw Error("OBSERVABILITY_EMPTY_RESPONSE");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > limit) throw Error("OBSERVABILITY_RESPONSE_TOO_LARGE");
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
  }
}
function throttled(body: Buffer, bytesPerSecond: number, signal: AbortSignal) {
  let offset = 0;
  let nextAt = Date.now();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (signal.aborted) throw signal.reason;
        const wait = nextAt - Date.now();
        if (wait > 0) await delay(wait, undefined, { signal });
        if (offset >= body.length) {
          controller.close();
          return;
        }
        const chunk = body.subarray(
          offset,
          Math.min(offset + 16384, body.length),
        );
        offset += chunk.length;
        nextAt = Date.now() + (chunk.length / bytesPerSecond) * 1000;
        controller.enqueue(chunk);
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
// Node core显式绝对预算覆盖stream与receipt，避免fetch/Undici默认300秒header帽子。
async function coreRequest(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  body: Buffer | undefined,
  rate: number,
) {
  return new Promise<unknown>((resolve, reject) => {
    const transfer = new AbortController();
    const transferSignal = AbortSignal.any([signal, transfer.signal]);
    let settled = false;
    const address = new URL(url);
    const headers = {
      ...Object.fromEntries(new Headers(init.headers).entries()),
      "Accept-Encoding": "identity",
      ...(body ? { "Content-Length": String(body.length) } : {}),
    };
    function finish(error: unknown, value?: unknown) {
      if (settled) return;
      settled = true;
      if (error) reject(error); else resolve(value);
      // 回执/拒绝结束即停止限速泵，不能让已结束日轮留下孤儿上传。
      transfer.abort(error ?? new Error("OBSERVABILITY_TRANSFER_COMPLETE"));
      request.destroy();
    }
    const request = (address.protocol === "https:" ? httpsRequest : httpRequest)(
      address, { method: init.method ?? "GET", headers, signal: transferSignal,
        ...(address.protocol === "https:" ? { rejectUnauthorized: true } : {}),
      }, response => {
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(`OBSERVABILITY_HTTP_${response.statusCode ?? 0}`);
          response.destroy(); finish(error); return;
        }
        const chunks: Buffer[] = []; let length = 0;
        response.on("data", chunk => {
          length += chunk.length;
          if (length > 8192) { response.destroy(); finish(new Error("OBSERVABILITY_RESPONSE_TOO_LARGE")); return; }
          chunks.push(chunk);
        });
        response.on("error", error => finish(error));
        response.on("end", () => {
          try { finish(null, JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
          catch (error) { finish(error); }
        });
      },
    );
    request.on("error", error => finish(error));
    void (async () => {
      if (body) {
        let nextAt = Date.now();
        for (let offset = 0; offset < body.length; offset += 16384) {
          const wait = nextAt - Date.now();
          if (wait > 0) await delay(wait, undefined, { signal: transferSignal });
          if (transferSignal.aborted) throw transferSignal.reason;
          const chunk = body.subarray(offset, Math.min(offset + 16384, body.length));
          if (!request.write(chunk)) await once(request, "drain", { signal: transferSignal });
          nextAt = Date.now() + (chunk.length / rate) * 1000;
        }
      }
      request.end();
    })().catch(error => finish(error));
  });
}

export function createGrowthObservabilityTransport(
  options: { fetchImpl?: typeof fetch; testOrigin?: string } = {},
) {
  let origin = GROWTH_ORIGIN;
  if (options.testOrigin) {
    const parsed = new URL(options.testOrigin);
    if (
      parsed.protocol !== "http:" ||
      !["127.0.0.1", "[::1]", "localhost"].includes(parsed.hostname) ||
      parsed.pathname !== "/" ||
      parsed.username ||
      parsed.password
    )
      throw Error("OBSERVABILITY_TEST_ORIGIN_INVALID");
    origin = parsed.origin;
  }
  const send = options.fetchImpl;
  async function request(
    path: string,
    init: RequestInit,
    signal: AbortSignal,
    body?: Buffer,
    rate = 131072,
  ) {
    const requestSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(
        120000 + (body ? Math.ceil((body.byteLength / rate) * 1000) : 0),
      ),
    ]);
    if (!send)
      return coreRequest(`${origin}${path}`, init, requestSignal, body, rate);
    const response = await send(`${origin}${path}`, {
      ...init,
      redirect: "error",
      credentials: "omit",
      signal: requestSignal,
      ...(body
        ? { body: throttled(body, rate, requestSignal), duplex: "half" }
        : {}),
    } as RequestInit);
    if (!response.ok) {
      await response.body?.cancel();
      throw Error(`OBSERVABILITY_HTTP_${response.status}`);
    }
    return boundedJson(response, 8192);
  }
  return {
    async getConfig(identity: InstallationIdentity, signal: AbortSignal) {
      const query = new URLSearchParams(identity);
      return observabilityConfigResponse.parse(
        await request(
          `/api/v2/client-observability/config?${query}`,
          { method: "GET" },
          signal,
        ),
      ).config;
    },
    async uploadBatch(
      batch: { batchId: string; body: string; bodySha256: string },
      rate: number,
      signal: AbortSignal,
    ) {
      const receipt = observabilityReceipt.parse(
        await request(
          "/api/v2/client-observability/batches",
          { method: "POST", headers: { "Content-Type": "application/json" } },
          signal,
          Buffer.from(batch.body),
          rate,
        ),
      );
      if (
        receipt.batchId !== batch.batchId ||
        receipt.bodySha256 !== batch.bodySha256
      )
        throw Error("OBSERVABILITY_RECEIPT_MISMATCH");
      return receipt;
    },
    async uploadLog(
      identity: InstallationIdentity,
      snapshot: LogSnapshot,
      rate: number,
      signal: AbortSignal,
    ) {
      const receipt = encryptedLogReceipt.parse(
        await request(
          "/api/v2/client-logs",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/octet-stream",
              "X-Installation-Alias": identity.installationAlias,
              "X-App-Version": identity.appVersion,
              "X-Os-Name": identity.osName,
              "X-Log-Session-Id": snapshot.sessionId,
              "X-Log-Sha256": snapshot.sha256,
              "X-Log-Date": snapshot.logDate,
            },
          },
          signal,
          snapshot.body,
          rate,
        ),
      );
      if (
        receipt.installationAlias !== identity.installationAlias ||
        receipt.sessionId !== snapshot.sessionId ||
        receipt.sha256 !== snapshot.sha256 ||
        receipt.byteLength !== snapshot.byteLength
      )
        throw Error("LOG_RECEIPT_MISMATCH");
      return receipt;
    },
  };
}

export async function readPendingEncryptedLog(
  logDir: string,
  meta: {
    fileName: string;
    sessionId: string;
    sha256: string;
    byteLength: number;
    logDate: string;
  },
): Promise<LogSnapshot> {
  if (
    !/^sidecar-\d{4}-\d{2}-\d{2}(?:-\d+)?\.log\.enc$/.test(meta.fileName) ||
    meta.byteLength < 103 ||
    meta.byteLength > MAX_LOG_BYTES
  )
    throw Error("LOG_PENDING_INVALID");
  const root = await realpath(logDir);
  const file = join(root, meta.fileName);
  const info = await lstat(file);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size < meta.byteLength ||
    (await realpath(file)) !== file
  )
    throw Error("LOG_PENDING_SOURCE_UNAVAILABLE");
  const handle = await open(
    file,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const current = await handle.stat();
    if (
      !current.isFile() ||
      current.dev !== info.dev ||
      current.ino !== info.ino
    )
      throw Error("LOG_PENDING_SOURCE_UNAVAILABLE");
    const body = Buffer.alloc(meta.byteLength);
    const read = await handle.read(body, 0, body.length, 0);
    if (
      read.bytesRead !== body.length ||
      completeLogPrefix(body).length !== body.length ||
      digest(body) !== meta.sha256 ||
      digest(body.subarray(0, 7 + 96 * body[6]!)) !== meta.sessionId
    )
      throw Error("LOG_PENDING_SOURCE_CHANGED");
    return { ...meta, body };
  } finally {
    await handle.close();
  }
}

export async function activeEncryptedLogSession(
  logDir: string,
): Promise<string | null> {
  const root = await realpath(logDir);
  const names = (await readdir(root)).filter((name) =>
    /^sidecar-\d{4}-\d{2}-\d{2}(?:-\d+)?\.log\.enc$/.test(name),
  );
  let latest: { name: string; mtime: number } | null = null;
  for (const name of names.slice(-64)) {
    const stat = await lstat(join(root, name));
    if (
      stat.isFile() &&
      !stat.isSymbolicLink() &&
      (!latest || stat.mtimeMs > latest.mtime)
    )
      latest = { name, mtime: stat.mtimeMs };
  }
  if (!latest) return null;
  const handle = await open(
    join(root, latest.name),
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const prefix = Buffer.alloc(775);
    const read = await handle.read(prefix, 0, prefix.length, 0);
    if (
      read.bytesRead < 7 ||
      !prefix.subarray(0, 6).equals(Buffer.from("CRLOG\x01")) ||
      prefix[6]! < 1 ||
      prefix[6]! > 8
    )
      return null;
    const bytes = 7 + 96 * prefix[6]!;
    if (read.bytesRead < bytes) return null;
    return digest(prefix.subarray(0, bytes));
  } finally {
    await handle.close();
  }
}
export async function readNativeExceptionMetadata(logDir: string) {
  const root = await realpath(logDir);
  const target = join(root, "host-exceptions.jsonl");
  let info;
  try {
    info = await lstat(target);
  } catch {
    return [];
  }
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size > 1048576 ||
    (await realpath(target)) !== target
  )
    throw Error("HOST_EXCEPTION_OUTBOX_INVALID");
  const handle = await open(
    target,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 1048576)
      throw Error("HOST_EXCEPTION_OUTBOX_INVALID");
    const bytes = Buffer.alloc(info.size);
    const read = await handle.read(bytes, 0, bytes.length, 0);
    const body = bytes.subarray(0, read.bytesRead).toString("utf8");
    const cutoff = Date.now() - 30 * 86400000;
    const events: Array<{
      eventId: string;
      code: string;
      occurredAt: string;
      logSessionId: string;
    }> = [];
    for (const line of body.split("\n").slice(0, -1).slice(-5000)) {
      try {
        const value = JSON.parse(line);
        if (
          Object.keys(value).sort().join(",") !==
            "code,eventId,logSessionId,occurredAt" ||
          !["HOST_PANIC", "SIDECAR_EXIT", "NODE_UNCAUGHT_EXCEPTION"].includes(
            value.code,
          ) ||
          !/^[a-f0-9]{64}$/.test(value.eventId) ||
          !/^[a-f0-9]{64}$/.test(value.logSessionId) ||
          !Number.isFinite(Date.parse(value.occurredAt)) ||
          Date.parse(value.occurredAt) < cutoff ||
          Date.parse(value.occurredAt) > Date.now() + 300000
        )
          continue;
        events.push(value);
      } catch {
        /* 不完整或异常行不造计数 */
      }
    }
    return events;
  } finally {
    await handle.close();
  }
}
