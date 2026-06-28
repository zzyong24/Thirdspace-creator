// Settings error surface. Reuses the ONE typed `OwnershipError` promoted to the
// identity module's public entry; it carries `ErrorCode.OwnershipError`, which
// the /api/v1/dispatch route maps to HTTP 404 (foundation §2: cross-user access →
// 404, never 403, to avoid leaking row existence across tenants). Settings rows
// are user-scoped upserts/creates, so most operations cannot ownership-fail; this
// class exists for the rare not-found path (and the account read delegates to
// Identity, which throws its own OwnershipError on a missing user).
export { OwnershipError } from "@/server/modules/identity";

import { ErrorCode } from "@creatoros/contract";

// putStorage validation — an illegal media root (empty, the filesystem root, a
// system-sensitive prefix, or a path that fails the mkdir-p writability probe) is
// rejected, NOT silently accepted. Carries `ErrorCode.ValidationError` so the
// dispatch route maps it to HTTP 400.
export class StorageValidationError extends Error {
  readonly code = ErrorCode.ValidationError;
  constructor(message: string) {
    super(message);
    this.name = "StorageValidationError";
  }
}
