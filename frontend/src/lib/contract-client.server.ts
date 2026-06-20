import "server-only";
import { ENDPOINTS, createClient } from "@creatoros/contract";
import { compositeTransport } from "@/server/persistence-client";

// Server-only composition root (server components, route handlers). Runs the
// composite transport in-process: REAL SQL persistence (@creatoros/backend over
// pglite) for project ops, the in-memory mock for the rest. The `server-only`
// guard keeps the mock backend + pglite out of any client bundle. Server reads
// and the /api/v1 route share this same store, so island writes persist.
export const client = createClient(ENDPOINTS, compositeTransport);
