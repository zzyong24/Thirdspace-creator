/**
 * 桌面包级品牌是激活前的离线兜底；激活后的名称仍由 Growth 已验签 runtime 覆盖。
 * 这里只接收构建入口写入的公开字段，不包含 channelRef、授权或任何密钥。
 */
export const OFFICIAL_PACKAGE_BRAND_NAME = "CreatorOS";
const OFFICIAL_PACKAGE_ORIGIN = "https://creatoros.aitongban.cloud";
const OFFICIAL_HUMAN_FEEDBACK_URL =
  "https://my.feishu.cn/share/base/form/shrcnJlbt9gDcaohA9iLmbPLQqh";

type PackagePublicLinkEnv = Readonly<Record<string, string | undefined>>;

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

/** 非官方包字段缺失/损坏时保持空值，只有 CreatorOS 官方包使用官方缺省入口。 */
export function resolvePackagePublicLinks(
  env: PackagePublicLinkEnv,
): PackagePublicLinks {
  const packageRef = env.NEXT_PUBLIC_CREATOROS_PACKAGE_REF?.trim() || "creatoros";
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

const SIDEBAR_THEME_KEYS = [
  "background",
  "surfaceSubtle",
  "foreground",
  "mutedForeground",
  "border",
  "brand",
  "brandHover",
  "brandSoft",
  "brandForeground",
] as const;
type PackageSidebarTheme = Readonly<Record<(typeof SIDEBAR_THEME_KEYS)[number], string>>;

/**
 * 包级离线主题只影响渠道壳侧栏，不参与 Growth、授权或业务链接。
 * 公共代码不认识具体渠道；未声明或非法输入返回空对象，完整保留官方默认 CSS。
 */
export function resolvePackageSidebarThemeStyle(
  raw: string | undefined,
): Readonly<Record<string, string>> {
  if (!raw?.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const record = parsed as Record<string, unknown>;
    if (
      Object.keys(record).length !== SIDEBAR_THEME_KEYS.length ||
      SIDEBAR_THEME_KEYS.some(
        (key) =>
          typeof record[key] !== "string" ||
          !/^#[0-9a-fA-F]{6}$/.test(record[key] as string),
      )
    ) {
      return {};
    }
    const theme = record as PackageSidebarTheme;
    return {
      backgroundColor: theme.background,
      color: theme.foreground,
      "--creatoros-surface": theme.background,
      "--creatoros-surface-subtle": theme.surfaceSubtle,
      "--creatoros-brand": theme.brand,
      "--creatoros-brand-hover": theme.brandHover,
      "--creatoros-brand-soft": theme.brandSoft,
      "--creatoros-brand-foreground": theme.brandForeground,
      "--creatoros-text": theme.foreground,
      "--creatoros-text-muted": theme.mutedForeground,
      "--creatoros-border": theme.border,
      "--background": theme.background,
      "--foreground": theme.foreground,
      "--card": theme.background,
      "--card-foreground": theme.foreground,
      "--popover": theme.background,
      "--popover-foreground": theme.foreground,
      "--muted": theme.surfaceSubtle,
      "--muted-foreground": theme.mutedForeground,
      "--border": theme.border,
      "--color-surface": theme.background,
      "--color-surface-subtle": theme.surfaceSubtle,
      "--color-card": theme.background,
      "--color-card-foreground": theme.foreground,
      "--color-muted": theme.surfaceSubtle,
      "--color-brand": theme.brand,
      "--color-brand-hover": theme.brandHover,
      "--color-brand-soft": theme.brandSoft,
      "--color-brand-foreground": theme.brandForeground,
      "--color-foreground": theme.foreground,
      "--color-text": theme.foreground,
      "--color-text-muted": theme.mutedForeground,
      "--color-border": theme.border,
      "--color-primary": theme.brand,
      "--primary": theme.brand,
      "--primary-foreground": theme.brandForeground,
      "--color-secondary": theme.brandSoft,
      "--secondary": theme.brandSoft,
      "--secondary-foreground": theme.foreground,
      "--color-accent": theme.brandSoft,
      "--accent": theme.brandSoft,
      "--accent-foreground": theme.foreground,
      "--color-ring": theme.brand,
      "--ring": theme.brand,
      "--color-sidebar": theme.background,
      "--sidebar": theme.background,
      "--color-sidebar-foreground": theme.foreground,
      "--sidebar-foreground": theme.foreground,
      "--color-sidebar-primary": theme.brand,
      "--sidebar-primary": theme.brand,
      "--color-sidebar-primary-foreground": theme.brandForeground,
      "--sidebar-primary-foreground": theme.brandForeground,
      "--color-sidebar-accent": theme.brandSoft,
      "--sidebar-accent": theme.brandSoft,
      "--color-sidebar-accent-foreground": theme.foreground,
      "--sidebar-accent-foreground": theme.foreground,
      "--color-sidebar-border": theme.border,
      "--sidebar-border": theme.border,
      "--color-sidebar-ring": theme.brand,
      "--sidebar-ring": theme.brand,
    };
  } catch {
    return {};
  }
}

export const PACKAGE_BRAND_SIDEBAR_STYLE = resolvePackageSidebarThemeStyle(
  process.env.NEXT_PUBLIC_CREATOROS_PACKAGE_SIDEBAR_THEME,
);

export const PACKAGE_BRAND_ICON_DATA_URL = cleanBrandIconDataUrl(
  process.env.NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_ICON_DATA_URL,
);

// Next.js 只替换字面量的 NEXT_PUBLIC 访问，不能把整个 process.env 动态索引进浏览器。
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
export const PACKAGE_UPDATE_MANIFEST_URL = packagePublicLinks.updateManifestUrl;

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
