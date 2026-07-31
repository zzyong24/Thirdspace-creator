import "server-only";

import canonicalProductIdentity from "../../../product-identity.json";

export type ProductIdentity = {
  readonly schema: string;
  readonly productRef: string;
  readonly appIdentifier: string;
  readonly projectKey: string;
};

export const CANONICAL_PRODUCT_IDENTITY: ProductIdentity =
  Object.freeze({ ...canonicalProductIdentity });

export class ProductIdentitySecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductIdentitySecurityError";
  }
}

function exactObject(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

/**
 * Rust 壳在启动 packaged sidecar 时注入 build.rs 生成的 ProductManifest。
 * Web/dev 没有该 env 时仍使用 canonical 常量，但不冒充已验证的 packaged identity。
 */
export function resolveProductIdentity(
  env: Record<string, string | undefined> = process.env,
): { readonly identity: ProductIdentity; readonly packaged: boolean } {
  const raw = env.CREATOROS_PRODUCT_MANIFEST_JSON?.trim();
  if (!raw) {
    return { identity: CANONICAL_PRODUCT_IDENTITY, packaged: false };
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ProductIdentitySecurityError(
      "CreatorOS ProductManifest 不是合法 JSON",
    );
  }
  const keys = ["schema", "productRef", "appIdentifier", "projectKey"];
  if (
    !exactObject(value, keys) ||
    keys.some(
      (key) =>
        value[key] !==
        CANONICAL_PRODUCT_IDENTITY[
          key as keyof typeof CANONICAL_PRODUCT_IDENTITY
        ],
    )
  ) {
    throw new ProductIdentitySecurityError(
      "CreatorOS ProductManifest 与 canonical product identity 不一致",
    );
  }
  const builtInProjectKey =
    env.CREATOROS_BUILTIN_LICENSE_PROJECT_KEY?.trim();
  if (
    builtInProjectKey !== undefined &&
    builtInProjectKey !== CANONICAL_PRODUCT_IDENTITY.projectKey
  ) {
    throw new ProductIdentitySecurityError(
      "Rust builtin projectKey 与 ProductManifest 不一致",
    );
  }
  return { identity: CANONICAL_PRODUCT_IDENTITY, packaged: true };
}

export function assertVerdictProductIdentity(
  projectKey: string,
  env: Record<string, string | undefined> = process.env,
): ProductIdentity {
  const resolved = resolveProductIdentity(env);
  if (
    resolved.packaged &&
    projectKey !== resolved.identity.projectKey
  ) {
    throw new ProductIdentitySecurityError(
      "本机授权 projectKey 与 packaged ProductManifest 不一致",
    );
  }
  return resolved.identity;
}
