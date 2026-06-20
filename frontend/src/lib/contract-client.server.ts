import "server-only";

// Server-only composition root (server components, route handlers). The guard
// keeps the MockBackend + canonicalDataset out of any client bundle — a client
// component importing this fails the build. Runs in-process against the server
// store (no self-fetch; works during static generation). Stage 16 swaps the
// transport behind `in-process-client` for real persistence.
export { client } from "@/server/mock-backend/in-process-client";
