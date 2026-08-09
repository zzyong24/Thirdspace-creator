import { NextResponse } from "next/server";
import * as fs from "node:fs/promises";
import {
  safeJoin,
  verifyBlobToken,
  blobStorageRootId,
  PathTraversalError,
  type BlobMethod,
} from "@creatoros/backend/modules/assets";
import { getStorageRootForRequest } from "@/server/persistence-client";
import { readSessionCookie } from "../../auth/_session";
import { resolveRequestContext } from "@/lib/request-context.server";
import { streamBlobToFile } from "@/server/blob-upload";
import {
  isTrustedLocalRequest,
  loopbackForbidden,
} from "@/lib/loopback-guard.server";

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

async function resolveIdentityAndRoot(
  req: Request,
): Promise<{ userId: string; root: string } | null> {
  // CreatorOS 桌面端是单机免登录产品：没有 session 时仍必须通过统一 ctx 解析器取得
  // 本机主用户；有效 session 则解析为其真实用户。无论哪条路径，后续 HMAC 都绑定这里
  // 得到的 userId + storageRootId，且 route 前面仍有启动级 loopback 握手，不能把“免登录”
  // 误写成“免身份”。库内无用户、无效显式 session 或 DB 异常继续失败关闭。
  const rawToken = readSessionCookie(req);
  try {
    const ctx = await resolveRequestContext(rawToken);
    return { userId: ctx.userId, root: await getStorageRootForRequest(ctx) };
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
  // blob 绕过 proxy 是为了不让大文件 body 被 clone/截断，不代表绕过启动级握手。
  // 在 route 内专门校验 header，不读取或复制 body。
  if (!isTrustedLocalRequest(req)) return loopbackForbidden();

  const { key } = await routeCtx.params;
  const storageKey = decodeKey(key);
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get("exp"));
  const token = url.searchParams.get("token");

  const identity = await resolveIdentityAndRoot(req);
  if (!identity) return forbidden("not authenticated");

  const verdict = verifyBlobToken(method, storageKey, exp, token, {
    userId: identity.userId,
    storageRootId: blobStorageRootId(identity.root),
  });
  if (!verdict.ok) return forbidden(`blob token rejected: ${verdict.reason}`);

  let absKey: string;
  try {
    absKey = safeJoin(identity.root, storageKey);
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
  if (!req.body) {
    return NextResponse.json({ error: "empty upload body" }, { status: 400 });
  }
  await streamBlobToFile(req.body, gated.absKey);
  return new NextResponse(null, { status: 200 });
}

// [T-296] 解析单区间 Range 头(`bytes=start-end`),支持开/闭区间与后缀区间。
// 非法/多区间 → 返回 null(降级整文件 200)。
function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;
  let start: number;
  let end: number;
  if (rawStart === "") {
    // 后缀区间 `bytes=-N`:最后 N 字节。
    const n = Number(rawEnd);
    if (!Number.isFinite(n) || n <= 0) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;
  end = Math.min(end, size - 1);
  return { start, end };
}

export async function GET(req: Request, routeCtx: RouteCtx): Promise<Response> {
  const gated = await gate(req, routeCtx, "GET");
  if (gated instanceof NextResponse) return gated;

  let size: number;
  try {
    size = (await fs.stat(gated.absKey)).size;
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

  // [T-296] HTTP Range 支持:WKWebView 播/预览视频要 Range 才能 seek 到片尾取 moov
  //   (存量 .mov 多为 moov-at-end 非 faststart);无 Range 支持则 `<video>` 加载失败 → 占位。
  //   总是回 Accept-Ranges;有合法 Range → 206 只读该区间(不把整片读进内存)。
  const range = parseRange(req.headers.get("range"), size);
  if (range) {
    const { start, end } = range;
    const length = end - start + 1;
    let fh: fs.FileHandle | undefined;
    try {
      fh = await fs.open(gated.absKey, "r");
      const buf = Buffer.alloc(length);
      await fh.read(buf, 0, length, start);
      return new NextResponse(new Uint8Array(buf), {
        status: 206,
        headers: {
          "content-type": contentType,
          "accept-ranges": "bytes",
          "content-range": `bytes ${start}-${end}/${size}`,
          "content-length": String(length),
          "cache-control": "private, max-age=0",
        },
      });
    } catch {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    } finally {
      await fh?.close();
    }
  }

  // 非 Range:整文件 200,但带 Accept-Ranges + Content-Length(让浏览器知道可 Range,
  //   下一次 seek 会发 Range 请求)。
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(gated.absKey);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": contentType,
      "accept-ranges": "bytes",
      "content-length": String(size),
      "cache-control": "private, max-age=0",
    },
  });
}
