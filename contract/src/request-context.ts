// RequestContext (SPEC §10) — the per-request ownership boundary every module
// scopes against. It lives in the contract package because the transport seam
// (`Transport.request`) carries it as its third argument (foundation §2: "the
// transport signature gains a `ctx` parameter"); contract is the lowest package
// in the graph (backend → contract), so the type must originate here to avoid a
// circular import. `@creatoros/backend` re-exports it so every module still
// imports ONE definition from shared infra.
//
// `userId` is the sole multi-tenant boundary: every repository query filters
// `eq(table.userId, ctx.userId)` and every insert stamps it. `source`
// distinguishes a human request from machine-originated work (ingestion / AI),
// carrying the originating run/task id when applicable.
//
// Type-only module — no runtime, no non-determinism.
export interface RequestContext {
  userId: string;
  requestId: string;
  source: "user" | "ingestion" | "ai";
  ingestionRunId?: string;
  aiTaskId?: string;
}
