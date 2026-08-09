import { NextResponse } from "next/server";
import packageJson from "../../../../../../package.json";

import {
  isTrustedLocalRequest,
  loopbackForbidden,
} from "@/lib/loopback-guard.server";

export const dynamic = "force-dynamic";

const ALLOWED_KINDS = new Set([
  "root_error",
  "window_error",
  "unhandled_rejection",
]);
const recent = new Map<string, number>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
let windowStartedAt = 0;
let windowCount = 0;

type SafeDiagnostic = {
  contractVersion: "creatoros-client-diagnostic-v1";
  kind: string;
  traceId: string;
  errorHash: string;
  digest: string | null;
  occurredAt: string;
};

function parseSafeDiagnostic(value: unknown): SafeDiagnostic | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).sort().join(",") !==
      "contractVersion,digest,errorHash,kind,occurredAt,traceId" ||
    row.contractVersion !== "creatoros-client-diagnostic-v1" ||
    typeof row.kind !== "string" ||
    !ALLOWED_KINDS.has(row.kind) ||
    typeof row.traceId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(row.traceId) ||
    typeof row.errorHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(row.errorHash) ||
    !(row.digest === null ||
      (typeof row.digest === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(row.digest))) ||
    typeof row.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(row.occurredAt))
  ) {
    return null;
  }
  return row as SafeDiagnostic;
}

export async function POST(req: Request): Promise<Response> {
  if (!isTrustedLocalRequest(req)) return loopbackForbidden();
  const now = Date.now();
  if (now - windowStartedAt >= WINDOW_MS) {
    windowStartedAt = now;
    windowCount = 0;
  }
  if (windowCount >= MAX_PER_WINDOW) {
    return new NextResponse(null, { status: 204 });
  }
  let parsed: SafeDiagnostic | null = null;
  try {
    parsed = parseSafeDiagnostic(await req.json());
  } catch {
    // invalid body
  }
  if (!parsed) {
    return NextResponse.json({ error: "invalid diagnostic" }, { status: 400 });
  }
  const dedupeKey = `${parsed.kind}:${parsed.errorHash}`;
  if (now - (recent.get(dedupeKey) ?? 0) >= WINDOW_MS) {
    recent.set(dedupeKey, now);
    windowCount += 1;
    // 原始 message/stack 不跨浏览器边界；sidecar stdout 会进入既有加密、脱敏、轮转日志。
    console.error("[client-diagnostic]", JSON.stringify({
      ...parsed,
      appVersion: packageJson.version,
      os: process.platform,
      surface: "webview",
    }));
  }
  return new NextResponse(null, { status: 204 });
}
