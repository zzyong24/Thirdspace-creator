import type { Endpoint, Transport } from "@creatoros/contract";

// Client-safe transport: serializes the operation to the /api/v1 RPC dispatch
// route, which runs the handler against the SERVER store and returns the
// contract envelope. Browser islands use this so their mutations reach the
// same server-side store the server components render from.
//
// No server imports here — keeps the mock backend + canonicalDataset out of the
// client bundle. Stage 16 replaces the route's handler with real persistence;
// this transport is unchanged.
export function createHttpTransport(baseUrl = "/api/v1"): Transport {
  return {
    async request(endpoint: Endpoint, input) {
      const res = await fetch(`${baseUrl}/dispatch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Send the httpOnly session cookie so the route can derive the
        // RequestContext (multi-tenant). Same-origin defaults to sending it,
        // but make it explicit so a future base-url change can't silently drop
        // auth.
        credentials: "same-origin",
        body: JSON.stringify({ id: endpoint.id, input }),
      });
      if (!res.ok) {
        throw new Error(`HttpTransport: ${res.status} for ${endpoint.id}`);
      }
      return res.json();
    },
  };
}
