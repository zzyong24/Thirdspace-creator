import { NextResponse } from "next/server";
import {
  ENDPOINTS,
  ErrorCode,
  ERROR_HTTP,
  type Endpoint,
} from "@creatoros/contract";
import { compositeTransport, getIdentityService } from "@/server/persistence-client";
import {
  AuthenticationError,
  OwnershipError,
} from "@/server/modules/identity";
import { readSessionCookie } from "../auth/_session";

// RPC dispatch over HTTP. The browser's HttpTransport POSTs { id, input };
// this runs the matching contract operation against the SERVER store and
// returns the contract envelope.
//
// Task 9: this route now DERIVES the RequestContext from the session cookie
// (foundation §2 "RequestContext derivation"). No/invalid cookie → 401. The ctx
// is threaded as the transport's third arg (Task 8 signature). Thrown domain
// errors map to the SPEC §14 status table (OwnershipError → 404,
// AuthenticationError → 401, ConflictError → 409, else 501/400).

const ENDPOINTS_BY_ID: Record<string, Endpoint> = Object.fromEntries(
  Object.values(ENDPOINTS).map((e) => [e.id, e]),
);

function errorEnvelope(
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json(
    { error: { code, message, details }, meta: { requestId: "dispatch" } },
    { status: ERROR_HTTP[code] },
  );
}

export async function POST(req: Request): Promise<Response> {
  let payload: { id?: unknown; input?: unknown };
  try {
    payload = (await req.json()) as { id?: unknown; input?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const id = typeof payload.id === "string" ? payload.id : "";
  const endpoint = ENDPOINTS_BY_ID[id];
  if (!endpoint) {
    return NextResponse.json({ error: `unknown operation: ${id}` }, { status: 404 });
  }

  // Derive RequestContext from the session cookie. No/invalid cookie → 401
  // (foundation §2 "Unauthenticated → 401"). The composite transport also
  // enforces this for persisted ops, but deriving here keeps every dispatch
  // request user-scoped and lets the ctx reach the transport.
  const rawToken = readSessionCookie(req);
  if (!rawToken) {
    return errorEnvelope(ErrorCode.AuthenticationError, "Not authenticated");
  }
  const identity = await getIdentityService();
  let ctx;
  try {
    ctx = await identity.resolveContextFromToken(rawToken);
  } catch (err) {
    if (err instanceof AuthenticationError) {
      return errorEnvelope(ErrorCode.AuthenticationError, err.message);
    }
    throw err;
  }

  try {
    const envelope = await compositeTransport.request(
      endpoint,
      (payload.input ?? {}) as never,
      ctx,
    );
    return NextResponse.json(envelope);
  } catch (err) {
    // SPEC §14 status mapping for thrown domain errors.
    if (err instanceof AuthenticationError) {
      return errorEnvelope(ErrorCode.AuthenticationError, err.message);
    }
    if (err instanceof OwnershipError) {
      return errorEnvelope(ErrorCode.OwnershipError, err.message);
    }
    // Module domain errors carry a contract `ErrorCode` in `.code` (e.g.
    // taxonomy's DuplicateTagError → ConflictError/409, InvalidEntityRefError →
    // ValidationError/400, TagNotFoundError → OwnershipError/404). Map by that
    // code so each module's errors surface with the SPEC §14 status without the
    // route importing every module's error classes.
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && code in ERROR_HTTP) {
      // Domain errors may carry a structured `details` payload (e.g. Projects'
      // StageGateError → { stage, missing } so the stepper can render「为什么进不
      // 去」). Pass it through to the error envelope's details when present.
      const rawDetails = (err as { details?: unknown }).details;
      const details =
        rawDetails && typeof rawDetails === "object"
          ? (rawDetails as Record<string, unknown>)
          : {};
      return errorEnvelope(
        code as ErrorCode,
        err instanceof Error ? err.message : String(err),
        details,
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    // Unimplemented operations surface as 501 so the client throws clearly;
    // everything else is a 400 (matches the pre-Task-9 split).
    const status = /not implemented/i.test(message) ? 501 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
