import {
  isTrustedLocalRequest,
  loopbackForbidden,
} from "@/lib/loopback-guard.server";
import { resolveRequestContext } from "@/lib/request-context.server";
import { readSessionCookie } from "../../auth/_session";
import { getObservabilityCollector, setObservabilityConnectivity } from "@/server/persistence-client";
import { exceptionCapture, localObservabilityConnectivity } from "@creatoros/contract";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  if (!isTrustedLocalRequest(request)) return loopbackForbidden();
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isSafeInteger(declared) || declared > 32768)
    return Response.json(
      { error: "OBSERVABILITY_CONTEXT_TOO_LARGE" },
      { status: 413, headers },
    );
  let ctx;
  try {
    ctx = await resolveRequestContext(readSessionCookie(request), null, {
      rejectInvalidToken: true,
    });
  } catch {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
  }
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json(
      { error: "INVALID_CONTEXT" },
      { status: 422, headers },
    );
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 32768)
        return Response.json(
          { error: "OBSERVABILITY_CONTEXT_TOO_LARGE" },
          { status: 413, headers },
        );
      chunks.push(next.value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const network = localObservabilityConnectivity.safeParse(body);
    if (network.success) {
      await setObservabilityConnectivity(network.data.online);
      return Response.json({ accepted: true }, { headers });
    }
    const parsed = exceptionCapture.safeParse(body);
    if (!parsed.success)
      return Response.json(
        { error: "INVALID_CONTEXT" },
        { status: 422, headers },
      );
    const captured = await (
      await getObservabilityCollector()
    ).recordException(ctx, parsed.data);
    return Response.json({ captured }, { headers });
  } catch {
    return Response.json(
      { error: "INVALID_CONTEXT" },
      { status: 422, headers },
    );
  } finally {
    await reader.cancel().catch(() => {});
  }
}
