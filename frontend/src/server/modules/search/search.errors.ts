// Search error surface. Reuses the ONE typed `OwnershipError` promoted to the
// identity module's public entry (frontend/src/server/modules/identity/index.ts);
// it carries `ErrorCode.OwnershipError`, which the /api/v1/dispatch route maps to
// HTTP 404 (foundation §2: cross-user access → 404, never 403, to avoid leaking
// row existence across tenants). Search owns DERIVED data (the index), so most of
// its operations are idempotent no-ops rather than ownership failures; this class
// exists for the rare not-found path so a cross-user reference surfaces as 404
// structurally (by `.code`) exactly like every other module's ownership failures.
export { OwnershipError } from "@creatoros/backend";
