import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@creatoros/backend/modules/assets", () => ({
  installBlobTrustRoot: vi.fn(),
}));

import { installBlobTrustRoot } from "@creatoros/backend/modules/assets";
import { installBlobTrustRootFromInheritedFd } from "./blob-trust-bootstrap";

describe("blob trust fd bootstrap", () => {
  it("installs secret + bootId from the inherited fd without env secret", () => {
    installBlobTrustRootFromInheritedFd(
      { CREATOROS_BLOB_SECRET_FD: "3" },
      (fd) => {
        expect(fd).toBe(3);
        return `BLOBV2:${"s".repeat(43)}:${"b".repeat(22)}`;
      },
    );
    expect(installBlobTrustRoot).toHaveBeenCalledWith({
      secret: "s".repeat(43),
      bootId: "b".repeat(22),
    });
  });

  it("fails closed for missing fd or malformed payload", () => {
    expect(() =>
      installBlobTrustRootFromInheritedFd({}, () => ""),
    ).toThrow(/required/);
    expect(() =>
      installBlobTrustRootFromInheritedFd(
        { CREATOROS_BLOB_SECRET_FD: "0" },
        () => "known-default",
      ),
    ).toThrow(/invalid/);
  });
});
