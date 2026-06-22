// RequestContext (SPEC §10) — re-exported from the contract package so every
// module imports ONE definition via shared infra (`@creatoros/backend`). Task 8
// moved the canonical declaration into `@creatoros/contract` because the
// transport seam (`Transport.request`) carries `ctx` as its third argument and
// contract is the lowest package in the graph (backend → contract); declaring it
// there avoids a circular import. Consumers that import `RequestContext` from
// `@creatoros/backend` are unchanged.
export type { RequestContext } from "@creatoros/contract";
