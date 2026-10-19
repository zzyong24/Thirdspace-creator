import { NextResponse } from "next/server";

import { readSessionCookie } from "../../../../auth/_session";
import {
  readRequestAccountId,
  resolveRequestContext,
  readRequestGroupId,
} from "@/lib/request-context.server";
import { getExecutionPreviewRuntime } from "@/server/persistence-client";

export const dynamic = "force-dynamic";

export function parseRange(header: string | null, size: number): [number, number] | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return [-1, -1];
  if (size <= 0 || (!match[1] && !match[2])) return [-1, -1];
  if (!match[1] && match[2]) {
    const suffixLength = Number(match[2]);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return [-1, -1];
    return [Math.max(0, size - suffixLength), size - 1];
  }
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    return [-1, -1];
  }
  return [start, Math.min(end, size - 1)];
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ taskId: string; artifact: string[] }> },
): Promise<Response> {
  let ctx;
  try {
    ctx = await resolveRequestContext(
      readSessionCookie(req),
      readRequestAccountId(req),
    );
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const resolved = await params;
  const artifactPath = resolved.artifact.map(decodeURIComponent).join("/");
  try {
    const { bytes, mimeType } = await (
      await getExecutionPreviewRuntime()
    ).readVideo(ctx, resolved.taskId, artifactPath);
    const range = parseRange(req.headers.get("range"), bytes.byteLength);
    const common = {
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store, private",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        artifactPath.split("/").at(-1) ?? "preview.mp4",
      )}`,
    };
    if (range?.[0] === -1) {
      return new Response(null, {
        status: 416,
        headers: { ...common, "Content-Range": `bytes */${bytes.byteLength}` },
      });
    }
    if (range) {
      const [start, end] = range;
      const body = bytes.slice(start, end + 1);
      return new Response(Uint8Array.from(body).buffer, {
        status: 206,
        headers: {
          ...common,
          "Content-Length": String(body.byteLength),
          "Content-Range": `bytes ${start}-${end}/${bytes.byteLength}`,
        },
      });
    }
    return new Response(Uint8Array.from(bytes).buffer, {
      status: 200,
      headers: { ...common, "Content-Length": String(bytes.byteLength) },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
