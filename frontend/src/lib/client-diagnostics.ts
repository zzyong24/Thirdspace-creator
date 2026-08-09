"use client";

type ClientDiagnosticKind = "root_error" | "window_error" | "unhandled_rejection";

const RECENT = new Map<string, number>();
const DEDUPE_MS = 60_000;

function errorText(value: unknown): string {
  if (value instanceof Error) {
    return [value.name, value.message, value.stack ?? ""].join("\n");
  }
  if (typeof value === "string") return value;
  return Object.prototype.toString.call(value);
}

export async function fingerprintClientError(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(errorText(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function reportClientDiagnostic(
  kind: ClientDiagnosticKind,
  value: unknown,
  nextDigest?: string,
): Promise<void> {
  try {
    const errorHash = await fingerprintClientError(value);
    const now = Date.now();
    if (now - (RECENT.get(`${kind}:${errorHash}`) ?? 0) < DEDUPE_MS) return;
    RECENT.set(`${kind}:${errorHash}`, now);
    await fetch("/api/v1/local/diagnostics", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contractVersion: "creatoros-client-diagnostic-v1",
        kind,
        traceId: crypto.randomUUID(),
        errorHash,
        digest:
          nextDigest && /^[A-Za-z0-9_-]{1,128}$/.test(nextDigest)
            ? nextDigest
            : null,
        occurredAt: new Date(now).toISOString(),
      }),
    });
  } catch {
    // 诊断失败不能制造新的未处理异常，也不能把原始错误改投其他网络出口。
  }
}
