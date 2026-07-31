import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CANONICAL_PROJECT_KEY,
  PRODUCT_MANIFEST_FILE,
  RELEASE_ATTESTATION_FILE,
  canonicalProductManifestJson,
  createProductManifest,
  writeProductReleaseAttestation,
} from "./product-identity.mjs";

describe("T-635 canonical ProductManifest 与 release attestation", () => {
  it("manifest 只含非秘密 canonical identity，字节稳定", () => {
    expect(createProductManifest(CANONICAL_PROJECT_KEY)).toEqual({
      schema: "thirdspace-product-manifest/v1",
      productRef: "creatoros",
      appIdentifier: "cloud.aitongban.creatoros",
      projectKey: "creatoros",
    });
    expect(canonicalProductManifestJson(CANONICAL_PROJECT_KEY)).toBe(
      '{"schema":"thirdspace-product-manifest/v1","productRef":"creatoros","appIdentifier":"cloud.aitongban.creatoros","projectKey":"creatoros"}',
    );
  });

  it("attestation 先证明二进制嵌入同一 manifest，再绑定安装包 digest/profile/commit", () => {
    const root = mkdtempSync(join(tmpdir(), "creatoros-product-identity-"));
    const bundleDir = join(root, "bundle");
    mkdirSync(bundleDir, { recursive: true });
    const manifestJson = canonicalProductManifestJson(CANONICAL_PROJECT_KEY);
    const binaryPath = join(root, "CreatorOS");
    const installerPath = join(bundleDir, "CreatorOS.dmg");
    writeFileSync(binaryPath, Buffer.concat([
      Buffer.from("binary-prefix\0"),
      Buffer.from(manifestJson),
      Buffer.from("\0binary-suffix"),
    ]));
    writeFileSync(installerPath, "signed-installer-bytes");

    const result = writeProductReleaseAttestation({
      bundleDir,
      profile: "release-fast",
      binaryPath,
      artifactPaths: [installerPath],
      releaseCommits: {
        creator: "a".repeat(40),
        growth: null,
        activity: null,
      },
      generatedAt: "2026-07-30T00:00:00.000Z",
    });

    expect(result.attestation).toMatchObject({
      schema: "thirdspace-release-attestation/v1",
      releaseProfile: "release-fast",
      productIdentity: {
        projectKey: "creatoros",
        binaryContainsCanonicalManifest: true,
      },
      releaseCommits: {
        creator: "a".repeat(40),
        growth: null,
        activity: null,
        complete: false,
      },
      claimEnabled: false,
      publishAuthorized: false,
    });
    expect(result.attestation.artifacts).toHaveLength(1);
    expect(result.attestation.artifacts[0]).toMatchObject({
      path: "CreatorOS.dmg",
      sha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect(
      JSON.parse(readFileSync(join(bundleDir, PRODUCT_MANIFEST_FILE), "utf8")),
    ).toEqual(createProductManifest(CANONICAL_PROJECT_KEY));
    expect(
      JSON.parse(readFileSync(join(bundleDir, RELEASE_ATTESTATION_FILE), "utf8")),
    ).toEqual(result.attestation);
  });

  it("二进制未嵌 canonical manifest 时拒绝生成假 attestation", () => {
    const root = mkdtempSync(join(tmpdir(), "creatoros-product-mismatch-"));
    const bundleDir = join(root, "bundle");
    mkdirSync(bundleDir, { recursive: true });
    const binaryPath = join(root, "CreatorOS");
    const installerPath = join(bundleDir, "CreatorOS.dmg");
    writeFileSync(binaryPath, "binary-without-product-manifest");
    writeFileSync(installerPath, "installer");

    expect(() =>
      writeProductReleaseAttestation({
        bundleDir,
        profile: "release",
        binaryPath,
        artifactPaths: [installerPath],
        releaseCommits: { creator: null, growth: null, activity: null },
      }),
    ).toThrow(/未嵌入 canonical ProductManifest/);
  });
});
