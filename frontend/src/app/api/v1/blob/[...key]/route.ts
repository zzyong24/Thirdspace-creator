import { NextResponse } from "next/server";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  safeJoin,
  verifyBlobToken,
  PathTraversalError,
  type BlobMethod,
} from "@creatoros/backend/modules/assets";
import { getStorageRootForRequest } from "@/server/persistence-client";
import { readSessionCookie } from "../../auth/_session";
import { resolveRequestContext } from "@/lib/request-context.server";

// Local-fs blob route (item B). The local-fs object-storage adapter mints
// token-gated URLs at `/api/v1/blob/<key>?exp=&token=`; this route is where the
// FE's two-phase upload PUTs the real bytes (phase 1) and where download /
// copy-link GETs them. It is the ONLY public surface that touches media bytes on
// disk, so it is hard-gated:
//
//   1. HMAC token — token = HMAC(`${method}:${storageKey}:${exp}`, secret). We
//      verify the signature + that `exp` is in the future. A missing / forged /
//      expired token → 403. This stops arbitrary write-to-disk / read-from-disk.
//   2. Path-traversal guard — the storageKey is decoded then `safeJoin`-ed under
//      the resolved media root; any `..` / absolute / escaping key → 403.
//
// The media root is resolved per-request from the signed-in user's storage_config
// (the same root the upload URL was minted against). The PUT request carries the
// same-origin session cookie, so the route is user-scoped like /dispatch.

// Rebuild the storageKey from the catch-all segments (each was percent-encoded as
// a single path segment by the adapter's blobUrl()).
function decodeKey(segments: string[]): string {
  return segments.map((s) => decodeURIComponent(s)).join("/");
}

async function resolveRoot(req: Request): Promise<string | null> {
  // [T-046 单机免登录] 有 session cookie 验 token,无/失效 cookie 以本机主用户直通,
  // 解析其配置的 media root。HMAC token + path-traversal 两道硬门不变(仍是唯一真门)。
  const rawToken = readSessionCookie(req);
  try {
    const ctx = await resolveRequestContext(rawToken);
    return await getStorageRootForRequest(ctx);
  } catch {
    return null;
  }
}

function forbidden(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

interface RouteCtx {
  params: Promise<{ key: string[] }>;
}

// Shared gate: verify token + path, return the safe absolute path or a 403/404.
async function gate(
  req: Request,
  routeCtx: RouteCtx,
  method: BlobMethod,
): Promise<{ absKey: string } | NextResponse> {
  const { key } = await routeCtx.params;
  const storageKey = decodeKey(key);
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get("exp"));
  const token = url.searchParams.get("token");

  const verdict = verifyBlobToken(method, storageKey, exp, token);
  if (!verdict.ok) return forbidden(`blob token rejected: ${verdict.reason}`);

  const root = await resolveRoot(req);
  if (!root) return forbidden("not authenticated");

  let absKey: string;
  try {
    absKey = safeJoin(root, storageKey);
  } catch (err) {
    if (err instanceof PathTraversalError) {
      return forbidden(err.message);
    }
    throw err;
  }
  return { absKey };
}

export async function PUT(req: Request, routeCtx: RouteCtx): Promise<Response> {
  const gated = await gate(req, routeCtx, "PUT");
  if (gated instanceof NextResponse) return gated;
  const body = Buffer.from(await req.arrayBuffer());
  await fs.mkdir(path.dirname(gated.absKey), { recursive: true });
  await fs.writeFile(gated.absKey, body);
  return new NextResponse(null, { status: 200 });
}

export async function GET(req: Request, routeCtx: RouteCtx): Promise<Response> {
  const gated = await gate(req, routeCtx, "GET");
  if (gated instanceof NextResponse) return gated;
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(gated.absKey);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // Best-effort content-type from the sidecar; default octet-stream.
  let contentType = "application/octet-stream";
  try {
    const meta = JSON.parse(
      await fs.readFile(`${gated.absKey}.meta.json`, "utf8"),
    ) as { mimeType?: string };
    if (meta.mimeType) contentType = meta.mimeType;
  } catch {
    // No sidecar — keep the default.
  }
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: { "content-type": contentType },
  });
}
