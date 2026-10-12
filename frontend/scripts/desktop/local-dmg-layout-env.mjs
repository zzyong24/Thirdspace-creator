// 只落实明确选择的本地开发包配置，正式发行的 Finder 引导保持默认。
export function resolveLocalDmgLayoutEnv({
  platform,
  buildOnly,
  isFullRelease,
  env = {},
} = {}) {
  if (
    platform !== "darwin" ||
    buildOnly !== true ||
    isFullRelease !== false ||
    env === null ||
    typeof env !== "object" ||
    env.CREATOROS_LOCAL_DMG_HEADLESS !== "1" ||
    env.CREATOROS_LOCAL_ADHOC_SIGN !== "1" ||
    env.CREATOROS_LOCAL_SKIP_INSTALL !== "1" ||
    env.CREATOROS_PACKAGE_BUILD_ONLY !== "1"
  ) {
    return {};
  }
  return { CI: "true", TAURI_BUNDLER_DMG_IGNORE_CI: "false" };
}
