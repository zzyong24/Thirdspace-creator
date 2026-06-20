import { ENDPOINTS, createClient } from "@creatoros/contract";
import { mockTransport } from "@/server/mock-backend/mock-transport";

// In-process contract client over the MockBackend (no `server-only` guard, so it
// is importable from in-process handler/transport tests). App server code should
// import `@/lib/contract-client.server`, which re-exports this behind the guard.
export const client = createClient(ENDPOINTS, mockTransport);
