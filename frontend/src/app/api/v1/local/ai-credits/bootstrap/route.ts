import { isTrustedLocalRequest, loopbackForbidden } from "@/lib/loopback-guard.server";
import {
  authorizeAiCreditBootstrapRequest, readAiCreditBootstrapBody,
  aiCreditBootstrapLocalFailure, reserveAiCreditBootstrap ,
} from "@/server/activation/ai-credit-link.server";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };
function response(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: NO_STORE });
}
export async function POST(request: Request): Promise<Response> {
  if (!isTrustedLocalRequest(request)) return new Response(loopbackForbidden().body, { status: 403, headers: { ...NO_STORE, "Content-Type": "application/json" } });
  try {
    await authorizeAiCreditBootstrapRequest(request);
    const body = await readAiCreditBootstrapBody(request, "reserve");
    const result = await reserveAiCreditBootstrap({ serviceId: body.serviceId as string, code: body.code as string, idempotencyKey: request.headers.get("Idempotency-Key") ?? "" });
    return response(result, result.status === "applied" ? 200 : 202);
  } catch (cause) {
    const failure = aiCreditBootstrapLocalFailure(cause);
    return response(failure.body, failure.status);
  }
}
