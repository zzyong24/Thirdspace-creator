import { ENDPOINTS, createClient } from "@creatoros/contract";
import { mockTransport } from "@/server/mock-backend/mock-transport";

// Composition root. Stage 17 swaps `mockTransport` for an `httpTransport`
// pointing at /api/v1 — no page code changes.
export const client = createClient(ENDPOINTS, mockTransport);
