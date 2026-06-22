import { ENDPOINTS, createClient } from "@creatoros/contract";
import { createHttpTransport } from "@/lib/http-transport";

// Client-safe composition root (browser islands). Calls go over HTTP to the
// /api/v1 dispatch route, which runs against the server store — so island
// mutations persist server-side and a router.refresh() reflects them.
//
// Server components import `@/lib/contract-client.server` instead (in-process,
// no network). Stage 16 swaps only the route's handler for real persistence.
export const client = createClient(ENDPOINTS, createHttpTransport());
