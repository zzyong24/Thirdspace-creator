import { ErrorCode } from "@creatoros/contract";

export {
  AccountRequiredError,
  OwnershipError,
  requireAccountId,
} from "@creatoros/backend";

export class IntelligenceConflictError extends Error {
  readonly code = ErrorCode.ConflictError;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class IntelligenceValidationError extends Error {
  readonly code = ErrorCode.ValidationError;
  constructor(message: string) {
    super(message);
    this.name = "IntelligenceValidationError";
  }
}
