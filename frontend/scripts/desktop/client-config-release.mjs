const OFFICIAL_GROWTH_ORIGIN = "https://growth.aitongban.cloud";

function rawPublicKey(value) {
  const input = String(value ?? "").trim();
  if (!input || /\s/.test(input) || !/^[A-Za-z0-9+/]+={0,2}$/.test(input)) {
    throw new Error("[T-679] CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64 不是合法标准 base64");
  }
  const bytes = Buffer.from(input, "base64");
  const canonical = bytes.toString("base64");
  if (bytes.length !== 32 || canonical.replace(/=+$/, "") !== input.replace(/=+$/, "")) {
    throw new Error("[T-679] CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64 必须是 32B Ed25519 公钥");
  }
  return bytes;
}

/**
 * 正式开启渠道配置拉取时，在任何 Next/Cargo 重活之前校验构建材料。
 * 本地普通测试包未开启拉取时保持兼容，不强迫开发者持有生产公钥。
 */
export function assertClientConfigBuildEnv(env = process.env) {
  if (env.CREATOROS_CLIENT_CONFIG_PULL_ENABLED?.trim() !== "1") {
    return { enabled: false };
  }
  const origin = env.CREATOROS_GROWTH_CLIENT_CONFIG_ORIGIN?.trim() ?? "";
  if (origin !== OFFICIAL_GROWTH_ORIGIN) {
    throw new Error(`[T-679] CREATOROS_GROWTH_CLIENT_CONFIG_ORIGIN 必须为 ${OFFICIAL_GROWTH_ORIGIN}`);
  }
  rawPublicKey(env.CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64);
  const keyId = env.CREATOROS_GROWTH_CONFIG_KEY_ID?.trim() ?? "";
  if (!keyId || !/^[A-Za-z0-9._-]+$/.test(keyId)) {
    throw new Error("[T-679] CREATOROS_GROWTH_CONFIG_KEY_ID 缺失或格式非法");
  }
  return { enabled: true, origin, keyId };
}
