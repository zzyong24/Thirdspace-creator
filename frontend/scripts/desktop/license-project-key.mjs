import {
  assertDistributableProjectKey,
} from "./product-identity.mjs";

/**
 * 桌面安装包的产品级 identity。它不是渠道 identity，也不是秘密：
 * 所有 CreatorOS 渠道共用 Growth 商品的 canonical projectKey，具体 channelRef 仍由
 * 激活码经 AM 签名下发。package.mjs 只生成可分发 artifact，因此这里不提供 dev 宽松分支。
 */
export function assertLicenseProjectKey(
  env = process.env,
) {
  return assertDistributableProjectKey(
    env.CREATOROS_LICENSE_PROJECT_KEY ?? "",
  );
}
