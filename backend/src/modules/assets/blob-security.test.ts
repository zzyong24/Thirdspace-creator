import { describe, it, expect } from "vitest";
import * as path from "node:path";
import {
  safeJoin,
  PathTraversalError,
  signBlobToken,
  verifyBlobToken,
  blobStorageRootId,
  rootPathLegalityReason,
} from "./blob-security";

const ROOT = "/var/folders/test/CreatorOS/media";

describe("safeJoin — path-traversal guard", () => {
  it("resolves a normal nested key under root", () => {
    const out = safeJoin(ROOT, "image/uploads/objkey-1");
    expect(out).toBe(path.resolve(ROOT, "image/uploads/objkey-1"));
    expect(out.startsWith(path.resolve(ROOT) + path.sep)).toBe(true);
  });

  it("rejects a `..` traversal that escapes root", () => {
    expect(() => safeJoin(ROOT, "../../../etc/passwd")).toThrow(
      PathTraversalError,
    );
    expect(() => safeJoin(ROOT, "image/../../secret")).toThrow(
      PathTraversalError,
    );
  });

  it("rejects an absolute key", () => {
    expect(() => safeJoin(ROOT, "/etc/passwd")).toThrow(PathTraversalError);
  });

  it("rejects an empty / dot segment", () => {
    expect(() => safeJoin(ROOT, "")).toThrow(PathTraversalError);
    expect(() => safeJoin(ROOT, "image//objkey")).toThrow(PathTraversalError);
    expect(() => safeJoin(ROOT, "image/./objkey")).toThrow(PathTraversalError);
  });

  it("rejects a backslash traversal segment (windows-style) on posix host", () => {
    expect(() => safeJoin(ROOT, "image\\..\\..\\secret")).toThrow(
      PathTraversalError,
    );
  });
});

describe("signBlobToken / verifyBlobToken — HMAC token gate", () => {
  const KEY = "image/uploads/objkey-7";
  const NOW = 1_000_000;
  const EXP = NOW + 900_000; // 15 min ahead
  const SECRET = "unit-test-secret";
  const TRUST = { secret: SECRET, bootId: "boot-a" };
  const BINDING = {
    userId: "user-a",
    storageRootId: blobStorageRootId(ROOT),
  };

  it("a freshly minted token verifies for the same (method,key,exp)", () => {
    const token = signBlobToken("PUT", KEY, EXP, BINDING, TRUST);
    expect(
      verifyBlobToken("PUT", KEY, EXP, token, BINDING, NOW, TRUST).ok,
    ).toBe(true);
  });

  it("rejects an expired token", () => {
    const token = signBlobToken("GET", KEY, EXP, BINDING, TRUST);
    const r = verifyBlobToken("GET", KEY, EXP, token, BINDING, EXP + 1, TRUST);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("expired");
  });

  it("rejects a tampered token (forged signature)", () => {
    const token = signBlobToken("PUT", KEY, EXP, BINDING, TRUST);
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    const r = verifyBlobToken("PUT", KEY, EXP, tampered, BINDING, NOW, TRUST);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bad-signature");
  });

  it("rejects a token signed for a different method / key (cross-binding)", () => {
    const putToken = signBlobToken("PUT", KEY, EXP, BINDING, TRUST);
    // Same token replayed as GET must fail (method is bound into the payload).
    expect(verifyBlobToken("GET", KEY, EXP, putToken, BINDING, NOW, TRUST).ok).toBe(
      false,
    );
    // Token for a different key must fail.
    expect(
      verifyBlobToken("PUT", "image/other-key", EXP, putToken, BINDING, NOW, TRUST).ok,
    ).toBe(false);
  });

  it("rejects a missing token", () => {
    const r = verifyBlobToken("PUT", KEY, EXP, null, BINDING, NOW, TRUST);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing");
  });

  it("binds user, storage root and boot id; old-boot and cross-tenant replay fail", () => {
    const token = signBlobToken("GET", KEY, EXP, BINDING, TRUST);
    expect(
      verifyBlobToken(
        "GET",
        KEY,
        EXP,
        token,
        { ...BINDING, userId: "user-b" },
        NOW,
        TRUST,
      ).ok,
    ).toBe(false);
    expect(
      verifyBlobToken(
        "GET",
        KEY,
        EXP,
        token,
        { ...BINDING, storageRootId: blobStorageRootId("/tmp/other") },
        NOW,
        TRUST,
      ).ok,
    ).toBe(false);
    expect(
      verifyBlobToken("GET", KEY, EXP, token, BINDING, NOW, {
        secret: SECRET,
        bootId: "boot-b",
      }).ok,
    ).toBe(false);
  });

  it("has no source-known fallback: absent trust root fails closed", () => {
    expect(() => signBlobToken("GET", KEY, EXP, BINDING)).toThrow(
      /blob trust root unavailable/i,
    );
    expect(() =>
      verifyBlobToken("GET", KEY, EXP, "00", BINDING, NOW),
    ).toThrow(/blob trust root unavailable/i);
  });
});

describe("rootPathLegalityReason — system-directory guard", () => {
  it("accepts a normal user media root", () => {
    expect(rootPathLegalityReason("/Users/x/CreatorOS/media")).toBeNull();
    expect(rootPathLegalityReason("/tmp/creatoros-test")).toBeNull();
  });

  it("rejects the filesystem root", () => {
    expect(rootPathLegalityReason("/")).not.toBeNull();
  });

  it("rejects system directories", () => {
    expect(rootPathLegalityReason("/etc")).not.toBeNull();
    expect(rootPathLegalityReason("/etc/creatoros")).not.toBeNull();
    expect(rootPathLegalityReason("/usr/local/media")).not.toBeNull();
    expect(rootPathLegalityReason("/bin")).not.toBeNull();
  });

  it("rejects an empty path", () => {
    expect(rootPathLegalityReason("")).not.toBeNull();
    expect(rootPathLegalityReason("   ")).not.toBeNull();
  });
});
