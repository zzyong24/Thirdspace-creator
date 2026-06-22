// Notifications error surface. Wave-0 promoted the typed `OwnershipError` to the
// identity module's public entry (frontend/src/server/modules/identity/index.ts);
// it carries `ErrorCode.OwnershipError`, which the /api/v1/dispatch route maps to
// HTTP 404 (foundation §2: cross-user access → 404, never 403, to avoid leaking
// row existence across tenants). Notifications reuses that ONE typed class rather
// than minting a parallel one, so a cross-user `markRead` surfaces as 404
// structurally (by `.code`) exactly like every other module's ownership failures.
export { OwnershipError } from "@/server/modules/identity";
