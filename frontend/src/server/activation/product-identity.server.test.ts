import { describe, expect, it } from "vitest";

import {
  assertVerdictProductIdentity,
  CANONICAL_PRODUCT_IDENTITY,
  ProductIdentitySecurityError,
  resolveProductIdentity,
} from "./product-identity.server";

const manifest = JSON.stringify(CANONICAL_PRODUCT_IDENTITY);

describe("packaged product identity", () => {
  it("接受 Rust 注入的 exact canonical ProductManifest", () => {
    expect(
      resolveProductIdentity({
        CREATOROS_PRODUCT_MANIFEST_JSON: manifest,
        CREATOROS_BUILTIN_LICENSE_PROJECT_KEY: "creatoros",
      }),
    ).toEqual({
      identity: CANONICAL_PRODUCT_IDENTITY,
      packaged: true,
    });
  });

  it.each([
    ["test projectKey", { ...CANONICAL_PRODUCT_IDENTITY, projectKey: "test" }],
    ["其它产品", { ...CANONICAL_PRODUCT_IDENTITY, productRef: "growth" }],
    ["额外字段", { ...CANONICAL_PRODUCT_IDENTITY, channelRef: "direct" }],
  ])("拒绝 packaged manifest：%s", (_label, value) => {
    expect(() =>
      resolveProductIdentity({
        CREATOROS_PRODUCT_MANIFEST_JSON: JSON.stringify(value),
        CREATOROS_BUILTIN_LICENSE_PROJECT_KEY: "creatoros",
      }),
    ).toThrow(ProductIdentitySecurityError);
  });

  it("拒绝 builtin key、manifest 和授权 verdict 之间的漂移", () => {
    expect(() =>
      resolveProductIdentity({
        CREATOROS_PRODUCT_MANIFEST_JSON: manifest,
        CREATOROS_BUILTIN_LICENSE_PROJECT_KEY: "test",
      }),
    ).toThrow(ProductIdentitySecurityError);
    expect(() =>
      assertVerdictProductIdentity("test", {
        CREATOROS_PRODUCT_MANIFEST_JSON: manifest,
        CREATOROS_BUILTIN_LICENSE_PROJECT_KEY: "creatoros",
      }),
    ).toThrow(ProductIdentitySecurityError);
  });

  it("Web/dev 缺少 packaged manifest 时不冒充已验证产物", () => {
    expect(resolveProductIdentity({})).toEqual({
      identity: CANONICAL_PRODUCT_IDENTITY,
      packaged: false,
    });
  });
});
