/**
 * 桌面包级品牌是激活前的离线兜底；激活后的名称仍由 Growth 已验签 runtime 覆盖。
 * 这里只接收构建入口写入的公开字段，不包含 channelRef、授权或任何密钥。
 */
export const OFFICIAL_PACKAGE_BRAND_NAME = "CreatorOS";
const OFFICIAL_PACKAGE_ORIGIN = "https://creatoros.aitongban.cloud";
const OFFICIAL_HUMAN_FEEDBACK_URL =
  "https://my.feishu.cn/share/base/form/shrcnJlbt9gDcaohA9iLmbPLQqh";

type PackagePublicLinkEnv = Readonly<
  Record<string, string | undefined>
>;

export interface PackagePublicLinks {
  readonly websiteUrl: string | null;
  readonly downloadUrl: string | null;
  readonly humanFeedbackUrl: string | null;
  readonly updateManifestUrl: string | null;
}

function safeHttpsUrl(
  value: string | undefined,
  isOfficialPackage: boolean,
): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      (!isOfficialPackage && url.origin === OFFICIAL_PACKAGE_ORIGIN)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/** 渠道包字段缺失/损坏时保持空值，只有官方包可以使用官方缺省入口。 */
export function resolvePackagePublicLinks(
  env: PackagePublicLinkEnv,
): PackagePublicLinks {
  const packageRef =
    env.NEXT_PUBLIC_CREATOROS_PACKAGE_REF?.trim() || "creatoros";
  const isOfficialPackage = packageRef === "creatoros";
  const resolve = (name: string, officialDefault: string) =>
    safeHttpsUrl(
      env[name] || (isOfficialPackage ? officialDefault : undefined),
      isOfficialPackage,
    );
  return {
    websiteUrl: resolve(
      "NEXT_PUBLIC_CREATOROS_PACKAGE_WEBSITE_URL",
      `${OFFICIAL_PACKAGE_ORIGIN}/`,
    ),
    downloadUrl: resolve(
      "NEXT_PUBLIC_CREATOROS_PACKAGE_DOWNLOAD_URL",
      `${OFFICIAL_PACKAGE_ORIGIN}/`,
    ),
    humanFeedbackUrl: resolve(
      "NEXT_PUBLIC_CREATOROS_PACKAGE_HUMAN_FEEDBACK_URL",
      OFFICIAL_HUMAN_FEEDBACK_URL,
    ),
    updateManifestUrl: resolve(
      "NEXT_PUBLIC_CREATOROS_PACKAGE_UPDATE_MANIFEST_URL",
      `${OFFICIAL_PACKAGE_ORIGIN}/updates/latest.json`,
    ),
  };
}

function cleanBrandName(value: string | undefined): string {
  const cleaned = value?.replace(/[\u0000-\u001f\u007f]/g, "").trim() ?? "";
  return cleaned.slice(0, 30) || OFFICIAL_PACKAGE_BRAND_NAME;
}

function cleanBrandIconDataUrl(value: string | undefined): string | null {
  const cleaned = value?.trim() ?? "";
  return /^data:image\/(?:x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+$/.test(
    cleaned,
  )
    ? cleaned
    : null;
}

export const PACKAGE_BRAND_NAME = cleanBrandName(
  process.env.NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_NAME,
);

export const PACKAGE_BRAND_ICON_DATA_URL = cleanBrandIconDataUrl(
  process.env.NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_ICON_DATA_URL,
);

// Next.js 只会把字面量 `process.env.NEXT_PUBLIC_*` 访问替换进浏览器 bundle；
// 不得把整个 process.env 交给动态索引，否则渠道构建会在真浏览器里误落官方缺省值。
const packagePublicLinks = resolvePackagePublicLinks({
  NEXT_PUBLIC_CREATOROS_PACKAGE_REF:
    process.env.NEXT_PUBLIC_CREATOROS_PACKAGE_REF,
  NEXT_PUBLIC_CREATOROS_PACKAGE_WEBSITE_URL:
    process.env.NEXT_PUBLIC_CREATOROS_PACKAGE_WEBSITE_URL,
  NEXT_PUBLIC_CREATOROS_PACKAGE_DOWNLOAD_URL:
    process.env.NEXT_PUBLIC_CREATOROS_PACKAGE_DOWNLOAD_URL,
  NEXT_PUBLIC_CREATOROS_PACKAGE_HUMAN_FEEDBACK_URL:
    process.env.NEXT_PUBLIC_CREATOROS_PACKAGE_HUMAN_FEEDBACK_URL,
  NEXT_PUBLIC_CREATOROS_PACKAGE_UPDATE_MANIFEST_URL:
    process.env.NEXT_PUBLIC_CREATOROS_PACKAGE_UPDATE_MANIFEST_URL,
});
export const PACKAGE_WEBSITE_URL = packagePublicLinks.websiteUrl;
export const PACKAGE_DOWNLOAD_URL = packagePublicLinks.downloadUrl;
export const PACKAGE_HUMAN_FEEDBACK_URL = packagePublicLinks.humanFeedbackUrl;
export const PACKAGE_UPDATE_MANIFEST_URL =
  packagePublicLinks.updateManifestUrl;

export function resolveVisibleBrandName(
  runtimeBrandName: string | null,
  packageBrandName: string = PACKAGE_BRAND_NAME,
): string {
  const runtime = runtimeBrandName
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 30);
  return runtime || cleanBrandName(packageBrandName);
}
