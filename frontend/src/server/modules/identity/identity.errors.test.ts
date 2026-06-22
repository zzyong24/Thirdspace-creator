import { describe, expect, it } from "vitest";
import { ErrorCode, ERROR_HTTP } from "@creatoros/contract";
import { AuthenticationError, OwnershipError } from "./identity.errors";

describe("identity.errors", () => {
  describe("AuthenticationError", () => {
    it("is an Error subclass and resolves to HTTP 401 via its ErrorCode", () => {
      const err = new AuthenticationError();
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AuthenticationError);
      expect(err.name).toBe("AuthenticationError");
      expect(err.code).toBe(ErrorCode.AuthenticationError);
      expect(ERROR_HTTP[err.code]).toBe(401);
    });

    it("has a generic default message and accepts an override", () => {
      expect(new AuthenticationError().message).toBe("Invalid credentials");
      expect(new AuthenticationError("nope").message).toBe("nope");
    });
  });

  describe("OwnershipError", () => {
    it("is an Error subclass and resolves to HTTP 404 via its ErrorCode", () => {
      const err = new OwnershipError();
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(OwnershipError);
      expect(err.name).toBe("OwnershipError");
      expect(err.code).toBe(ErrorCode.OwnershipError);
      expect(ERROR_HTTP[err.code]).toBe(404);
    });

    it("has a generic default message (404, not 403 — no existence leak)", () => {
      expect(new OwnershipError().message).toBe("Not found");
      expect(new OwnershipError("user not found: x").message).toBe(
        "user not found: x",
      );
    });
  });
});
