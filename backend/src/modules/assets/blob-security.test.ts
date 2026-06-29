import { describe, it, expect } from "vitest";
import * as path from "node:path";
import {
  safeJoin,
  PathTraversalError,
  signBlobToken,
  verifyBlobToken,
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

  it("a freshly minted token verifies for the same (method,key,exp)", () => {
    const token = signBlobToken("PUT", KEY, EXP, SECRET);
    expect(
      verifyBlobToken("PUT", KEY, EXP, token, NOW, SECRET).ok,
    ).toBe(true);
  });

  it("rejects an expired token", () => {
    const token = signBlobToken("GET", KEY, EXP, SECRET);
    const r = verifyBlobToken("GET", KEY, EXP, token, EXP + 1, SECRET);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("expired");
  });

  it("rejects a tampered token (forged signature)", () => {
    const token = signBlobToken("PUT", KEY, EXP, SECRET);
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    const r = verifyBlobToken("PUT", KEY, EXP, tampered, NOW, SECRET);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bad-signature");
  });

  it("rejects a token signed for a different method / key (cross-binding)", () => {
    const putToken = signBlobToken("PUT", KEY, EXP, SECRET);
    // Same token replayed as GET must fail (method is bound into the payload).
    expect(verifyBlobToken("GET", KEY, EXP, putToken, NOW, SECRET).ok).toBe(
      false,
    );
    // Token for a different key must fail.
    expect(
      verifyBlobToken("PUT", "image/other-key", EXP, putToken, NOW, SECRET).ok,
    ).toBe(false);
  });

  it("rejects a missing token", () => {
    const r = verifyBlobToken("PUT", KEY, EXP, null, NOW, SECRET);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing");
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
