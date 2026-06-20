import { NextResponse } from "next/server";
import { ENDPOINTS, type Endpoint } from "@creatoros/contract";
import { compositeTransport } from "@/server/persistence-client";

// RPC dispatch over HTTP. The browser's HttpTransport POSTs { id, input };
// this runs the matching contract operation against the SERVER store and
// returns the contract envelope. Stage 16 replaces `mockTransport` with a
// persistence-backed transport behind this same route — the HttpTransport and
// the contract are unchanged.

const ENDPOINTS_BY_ID: Record<string, Endpoint> = Object.fromEntries(
  Object.values(ENDPOINTS).map((e) => [e.id, e]),
);

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

  try {
    const envelope = await compositeTransport.request(
      endpoint,
      (payload.input ?? {}) as never,
    );
    return NextResponse.json(envelope);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Unimplemented operations surface as 501 so the client throws clearly.
    const status = /not implemented/i.test(message) ? 501 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
