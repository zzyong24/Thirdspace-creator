const PROJECT_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * 桌面安装包的产品级 identity。它不是渠道 identity，也不是秘密：
 * 所有 CreatorOS 渠道共用一个 projectKey，具体 channelRef 仍由激活码经 AM 签名下发。
 */
export function assertLicenseProjectKey(
  env = process.env,
) {
  const projectKey = env.CREATOROS_LICENSE_PROJECT_KEY?.trim() ?? "";
  if (!PROJECT_KEY_PATTERN.test(projectKey)) {
    throw new Error(
      "[desktop:package] CREATOROS_LICENSE_PROJECT_KEY 缺失或格式非法。" +
        "它必须是显式的产品级 key（例如 test），不能靠 Finder 启动时再注入。",
    );
  }
  return projectKey;
}
