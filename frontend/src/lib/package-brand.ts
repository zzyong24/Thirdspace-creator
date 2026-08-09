/**
 * 桌面包级品牌是激活前的离线兜底；激活后的名称仍由 Growth 已验签 runtime 覆盖。
 * 这里只接收构建入口写入的公开字段，不包含 channelRef、授权或任何密钥。
 */
export const OFFICIAL_PACKAGE_BRAND_NAME = "CreatorOS";

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
