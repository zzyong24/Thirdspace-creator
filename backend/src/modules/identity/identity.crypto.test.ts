import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashToken,
} from "./identity.crypto";

// Task 2: the identity crypto primitives. scryptSync salted password hashing +
// sha256 session-token hashing, all from node:crypto (zero native deps). The
// raw session token lives only in the cookie; only its sha256 hash is stored.

describe("identity.crypto (Task 2)", () => {
  it("verifyPassword accepts the matching password", () => {
    const stored = hashPassword("hunter2");
    expect(verifyPassword("hunter2", stored)).toBe(true);
  });

  it("verifyPassword rejects a wrong password", () => {
    const stored = hashPassword("hunter2");
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("two hashPassword calls differ (random salt) yet both verify", () => {
    const a = hashPassword("same-password");
    const b = hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(verifyPassword("same-password", a)).toBe(true);
    expect(verifyPassword("same-password", b)).toBe(true);
  });

  it("generateSessionToken hash matches hashToken(raw)", () => {
    const { raw, hash } = generateSessionToken();
    expect(hash).toBe(hashToken(raw));
  });

  it("generateSessionToken raw is 64 hex chars", () => {
    const { raw } = generateSessionToken();
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
  });
});
