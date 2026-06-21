// ContentCalendar error surface (foundation §2). Re-uses the shared typed classes —
// `OwnershipError` (→404, cross-user access never leaks existence as 403),
// `ConflictError` (→409, an illegal state-machine transition planned→… per §7.2),
// `ValidationError` (→400, not-both-bound / bad FK / unknown frequency), and the
// shared `UnsupportedOperationError` / `AuthenticationError` the transport's default +
// no-ctx branches raise. We do NOT redefine these (plan Step 3): the dispatch route maps
// them structurally by `.code`, so reusing the identity/contract codes keeps the HTTP
// mapping consistent with the sibling platform-account module.
import { ErrorCode } from "@creatoros/contract";

export { OwnershipError } from "@/server/modules/identity";
export {
  UnsupportedOperationError,
  AuthenticationError,
} from "@creatoros/backend";

export class ConflictError extends Error {
  readonly code = ErrorCode.ConflictError;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class ValidationError extends Error {
  readonly code = ErrorCode.ValidationError;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
