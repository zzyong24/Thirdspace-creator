// Settings error surface. Reuses the ONE typed `OwnershipError` promoted to the
// identity module's public entry; it carries `ErrorCode.OwnershipError`, which
// the /api/v1/dispatch route maps to HTTP 404 (foundation §2: cross-user access →
// 404, never 403, to avoid leaking row existence across tenants). Settings rows
// are user-scoped upserts/creates, so most operations cannot ownership-fail; this
// class exists for the rare not-found path (and the account read delegates to
// Identity, which throws its own OwnershipError on a missing user).
export { OwnershipError } from "@/server/modules/identity";
