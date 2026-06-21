// RequestContext (SPEC §10) — the per-request ownership boundary every module
// scopes against. It lives in shared infra (@creatoros/backend) so every module
// imports ONE definition instead of redeclaring the shape (foundation §1/§2).
//
// `userId` is the sole multi-tenant boundary: every repository query filters
// `eq(table.userId, ctx.userId)` and every insert stamps it. `source`
// distinguishes a human request from machine-originated work (ingestion / AI),
// carrying the originating run/task id when applicable.
//
// Type-only module — no runtime, no non-determinism. The identity service
// (the one place that *derives* a context from a session) imports this type;
// the dispatch route + transports thread a value of it (Tasks 8/9).
export interface RequestContext {
  userId: string;
  requestId: string;
  source: "user" | "ingestion" | "ai";
  ingestionRunId?: string;
  aiTaskId?: string;
}
