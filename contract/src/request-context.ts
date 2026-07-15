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
// [T-136 切片 a → T-332 S3] `accountId` is the SECOND ownership dimension (多抖音号 /
// 多人设):「本次请求作用在哪个号」。`null` / `undefined` = 未选号 = **引导态**(per-account
// 域读写被 backend 以 AccountRequiredError 拒绝,SPEC §4.2;「未选号 = 全局视图」的退化
// 已随账号全域隔离退役)。It is derived server-side in `resolveRequestContext` from the
// `x-account-id` header and **only after** verifying the account is owned by `userId`
// AND active (SPEC BLOCKER-1 + T-332 §4.3: never trust the client-supplied header — a
// forged / archived / nonexistent id is REJECTED with OwnershipError 404, no longer
// silently degraded to null). RSC 读路径(session cookie 解析)是唯一的宽松点:坏 cookie
// 按未选号处理(引导态),不拒绝整页渲染。
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
