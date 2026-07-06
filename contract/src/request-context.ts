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
// [T-136 切片 a] `accountId` is the SECOND ownership dimension (多抖音号 / 多人设):
// 「本次请求作用在哪个号」。`null` / `undefined` = 未选号 / 全局视图 (§E 退化). It is
// derived server-side in `resolveRequestContext` from the `x-account-id` header and
// **only after** verifying the account is owned by `userId` (SPEC §A BLOCKER-1: never
// trust the client-supplied header — a forged id pointing at another user's account
// must degrade to null, not穿透 the per-account repo filter). 切片 a establishes the
// dimension end-to-end (select → header → server owner-check → RequestContext); repo
// consumption of it lands in切片 b.
//
// Type-only module — no runtime, no non-determinism.
export interface RequestContext {
  userId: string;
  requestId: string;
  source: "user" | "ingestion" | "ai";
  accountId?: string | null;
  ingestionRunId?: string;
  aiTaskId?: string;
}
