import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const TOP_LEVEL = new Set([
  "schema", "packageRef", "productRef", "projectKey", "expectedChannelRef",
  "displayName", "binaryName", "appIdentifier", "keychainService",
  "windowsUpgradeCode", "icons", "growthExpectations", "updates",
]);
const SECRET = /(secret|private.?key|password|token|api.?key|activation.?code)/i;
const REF = /^[a-z0-9][a-z0-9-]{1,62}$/;
const LOCATOR = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9-]+){2,}$/;
const HASH = /^[a-f0-9]{64}$/;
const GUID = /^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/;

function fail(message) { throw new Error(`[package-manifest] ${message}`); }
function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} 必须是对象`);
  for (const key of Object.keys(value)) {
    if (SECRET.test(key)) fail(`${label}.${key} 命中秘密字段规则`);
    if (!allowed.has(key)) fail(`${label} 含未知字段 ${key}`);
  }
}
function text(value, label) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) fail(`${label} 必须是非空且无首尾空白的字符串`);
  if (SECRET.test(value)) fail(`${label} 的值疑似包含秘密`);
  return value;
}
function httpsOrigin(value, label) {
  const url = new URL(text(value, label));
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search || url.pathname !== "/") {
    fail(`${label} 必须是无凭据、无路径、无查询、无 fragment 的 HTTPS origin`);
  }
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname) || url.hostname === "localhost") fail(`${label} 不允许 IP/localhost`);
  if (url.port) fail(`${label} 不允许非默认端口`);
  return url.origin;
}

export function validatePackageManifest(input) {
  exactKeys(input, TOP_LEVEL, "manifest");
  if (input.schema !== "creatoros-desktop-package/v1") fail("schema 不受支持");
  if (input.productRef !== "creatoros" || input.projectKey !== "creatoros") fail("商品身份必须为 creatoros");
  if (!REF.test(text(input.packageRef, "packageRef"))) fail("packageRef 格式非法");
  if (!LOCATOR.test(text(input.expectedChannelRef, "expectedChannelRef"))) fail("expectedChannelRef 必须是精确渠道 locator");
  text(input.displayName, "displayName");
  if (!/^[A-Za-z][A-Za-z0-9_-]{1,63}$/.test(text(input.binaryName, "binaryName"))) fail("binaryName 格式非法");
  if (!IDENTIFIER.test(text(input.appIdentifier, "appIdentifier"))) fail("appIdentifier 格式非法");
  if (!IDENTIFIER.test(text(input.keychainService, "keychainService"))) fail("keychainService 格式非法");
  if (!GUID.test(text(input.windowsUpgradeCode, "windowsUpgradeCode").toUpperCase())) fail("windowsUpgradeCode 必须是固定 GUID");

  exactKeys(input.icons, new Set(["macos", "windows"]), "icons");
  for (const platform of ["macos", "windows"]) {
    const icon = input.icons[platform];
    exactKeys(icon, new Set(["path", "sha256"]), `icons.${platform}`);
    text(icon.path, `icons.${platform}.path`);
    if (!HASH.test(text(icon.sha256, `icons.${platform}.sha256`))) fail(`icons.${platform}.sha256 格式非法`);
  }
  const growthKeys = new Set(["brandName", "purchaseUrl", "renewalUrl", "downloadUrl", "bugFeedbackUrl", "channelSupportUrl"]);
  exactKeys(input.growthExpectations, growthKeys, "growthExpectations");
  for (const key of growthKeys) {
    const value = text(input.growthExpectations[key], `growthExpectations.${key}`);
    if (key !== "brandName") {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.hash) fail(`growthExpectations.${key} 必须是安全 HTTPS URL`);
    }
  }
  exactKeys(input.updates, new Set(["channel", "packageUpdateOrigin", "sharedRuntimeOrigin"]), "updates");
  if (!REF.test(text(input.updates.channel, "updates.channel"))) fail("updates.channel 格式非法");
  input.updates.packageUpdateOrigin = httpsOrigin(input.updates.packageUpdateOrigin, "updates.packageUpdateOrigin");
  input.updates.sharedRuntimeOrigin = httpsOrigin(input.updates.sharedRuntimeOrigin, "updates.sharedRuntimeOrigin");
  return input;
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function compilePackageBrandBuildEnv({ manifest, iconBytes, iconMimeType }) {
  validatePackageManifest(structuredClone(manifest));
  if (!Buffer.isBuffer(iconBytes) || iconBytes.length === 0) {
    fail("WebView 品牌图标必须是非空 Buffer");
  }
  if (!["image/x-icon", "image/vnd.microsoft.icon"].includes(iconMimeType)) {
    fail("WebView 品牌图标只接受已校验的 ICO");
  }
  return {
    NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_NAME: manifest.displayName,
    NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_ICON_DATA_URL:
      `data:${iconMimeType};base64,${iconBytes.toString("base64")}`,
  };
}

export function validateManifestFiles(manifest, manifestPath) {
  const root = dirname(resolve(manifestPath));
  for (const [platform, icon] of Object.entries(manifest.icons)) {
    const path = resolve(root, icon.path);
    if (relative(root, path).startsWith("..")) fail(`icons.${platform}.path 越出清单目录`);
    if (!existsSync(path)) fail(`icons.${platform}.path 不存在: ${path}`);
    if (sha256File(path) !== icon.sha256) fail(`icons.${platform}.sha256 与文件不一致`);
  }
}

export function compilePackagePlan(input, { target }) {
  const manifest = validatePackageManifest(structuredClone(input));
  const iconKey = target.startsWith("windows") ? "windows" : "macos";
  return {
    schema: "creatoros-package-plan/v1",
    target,
    packageIdentity: {
      packageRef: manifest.packageRef,
      displayName: manifest.displayName,
      binaryName: manifest.binaryName,
      appIdentifier: manifest.appIdentifier,
      keychainService: manifest.keychainService,
      windowsUpgradeCode: manifest.windowsUpgradeCode,
      expectedChannelRef: manifest.expectedChannelRef,
      releaseTrustRootKeyId: "creatoros-update-root-20260805-01",
      releaseTrustRootSha256: "54f51d62d88b4bf429acef9a21d869a9a0957e1695d79938c00bff7e869f8a4c",
    },
    iconKey,
    latestUrl: `${manifest.updates.packageUpdateOrigin}/updates/v2/packages/${manifest.packageRef}/${manifest.updates.channel}/latest.json`,
    runtimeBaseUrl: `${manifest.updates.sharedRuntimeOrigin}/updates/v2/runtime/creatoros/${target}`,
  };
}

export function assertIdentityLock(manifest, lock) {
  if (lock.schema !== "creatoros-package-identity-lock/v1") fail("identity.lock schema 不受支持");
  for (const key of ["packageRef", "appIdentifier", "keychainService", "windowsUpgradeCode"]) {
    if (manifest[key] !== lock[key]) fail(`${key} 已被 identity.lock 固化，禁止变更`);
  }
}
