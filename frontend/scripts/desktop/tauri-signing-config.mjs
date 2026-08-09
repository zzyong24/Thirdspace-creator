/**
 * Tauri 必须在生成 DMG 之前签好 .app。旧流水线只在 `tauri build` 结束后另跑 codesign，
 * 导致 bundle/macos 目录里的 app 虽被补签，已经封盘的 DMG 内仍是未签版本。
 */
export function tauriMacSigningOverride(
  env = process.env,
  targetPlatform = process.platform,
) {
  if (targetPlatform !== "darwin") return null;
  const identity = env.APPLE_SIGNING_IDENTITY?.trim();
  const localAdhoc = env.CREATOROS_LOCAL_ADHOC_SIGN?.trim() === "1";
  if (!identity && !localAdhoc) return null;
  return {
    bundle: {
      macOS: {
        signingIdentity: identity || "-",
      },
    },
  };
}
