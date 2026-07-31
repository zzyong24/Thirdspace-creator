import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = import.meta.url.startsWith("file:")
  ? dirname(fileURLToPath(import.meta.url))
  : join(process.cwd(), "scripts", "desktop");
const CANONICAL_INPUT_PATH = join(
  moduleDir,
  "..",
  "..",
  "product-identity.json",
);
const canonicalInputJson = readFileSync(CANONICAL_INPUT_PATH, "utf8").trim();
const canonicalInput = JSON.parse(canonicalInputJson);
const canonicalKeys = [
  "schema",
  "productRef",
  "appIdentifier",
  "projectKey",
];
if (
  Object.keys(canonicalInput).length !== canonicalKeys.length ||
  !canonicalKeys.every((key) => Object.hasOwn(canonicalInput, key)) ||
  canonicalInput.schema !== "thirdspace-product-manifest/v1" ||
  canonicalInput.productRef !== "creatoros" ||
  canonicalInput.appIdentifier !== "cloud.aitongban.creatoros" ||
  canonicalInput.projectKey !== "creatoros"
) {
  throw new Error(
    "[T-635] frontend/product-identity.json 不是 approved canonical ProductManifest",
  );
}

export const CANONICAL_PROJECT_KEY = canonicalInput.projectKey;
export const PRODUCT_REF = canonicalInput.productRef;
export const APP_IDENTIFIER = canonicalInput.appIdentifier;
export const PRODUCT_MANIFEST_FILE = "creatoros-product-manifest.json";
export const RELEASE_ATTESTATION_FILE = "creatoros-release-attestation.json";

export function assertDistributableProjectKey(raw) {
  const projectKey = String(raw ?? "").trim();
  if (projectKey !== CANONICAL_PROJECT_KEY) {
    throw new Error(
      "[desktop:package] CREATOROS_LICENSE_PROJECT_KEY 必须 exact 为 creatoros；" +
        "missing、test、其它合法产品或格式非法值均不得生成可分发包。",
    );
  }
  return projectKey;
}

export function createProductManifest(projectKey = CANONICAL_PROJECT_KEY) {
  assertDistributableProjectKey(projectKey);
  return { ...canonicalInput };
}

export function canonicalProductManifestJson(
  projectKey = CANONICAL_PROJECT_KEY,
) {
  createProductManifest(projectKey);
  return canonicalInputJson;
}

export function sha256File(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

export function assertBinaryContainsProductManifest(
  binaryPath,
  manifestJson = canonicalProductManifestJson(),
) {
  if (!existsSync(binaryPath) || !statSync(binaryPath).isFile()) {
    throw new Error(`[T-635] 找不到 CreatorOS 主二进制：${binaryPath}`);
  }
  if (!readFileSync(binaryPath).includes(Buffer.from(manifestJson))) {
    throw new Error(
      `[T-635] 主二进制未嵌入 canonical ProductManifest：${binaryPath}`,
    );
  }
}

export function findInstallerArtifacts(bundleDir) {
  if (!existsSync(bundleDir)) return [];
  const artifacts = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.endsWith(".app")) walk(path);
        continue;
      }
      if (
        entry.isFile() &&
        (entry.name.endsWith(".dmg") ||
          entry.name.endsWith("-setup.exe") ||
          entry.name.endsWith(".msi") ||
          entry.name.endsWith(".app.tar.gz") ||
          entry.name.endsWith(".nsis.zip") ||
          entry.name.endsWith(".msi.zip"))
      ) {
        artifacts.push(path);
      }
    }
  };
  walk(bundleDir);
  return artifacts.sort();
}

export function findShellBinary({ targetDir, bundleDir, platform }) {
  if (platform === "darwin") {
    const macosDir = join(bundleDir, "macos");
    if (existsSync(macosDir)) {
      for (const entry of readdirSync(macosDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.endsWith(".app")) continue;
        const binary = join(
          macosDir,
          entry.name,
          "Contents",
          "MacOS",
          "CreatorOS",
        );
        if (existsSync(binary)) return binary;
      }
    }
  }
  const binary = join(
    targetDir,
    platform === "win32" ? "CreatorOS.exe" : "CreatorOS",
  );
  if (existsSync(binary)) return binary;
  throw new Error(`[T-635] 无法定位 ${platform} CreatorOS 主二进制`);
}

function normalizeCommit(value) {
  const commit = String(value ?? "").trim();
  return /^[a-f0-9]{40,64}$/i.test(commit) ? commit.toLowerCase() : null;
}

export function releaseCommitsFromEnv(env = process.env) {
  return {
    creator: normalizeCommit(
      env.CREATOROS_CREATOR_RELEASE_COMMIT ?? env.GITHUB_SHA,
    ),
    growth: normalizeCommit(env.CREATOROS_GROWTH_RELEASE_COMMIT),
    activity: normalizeCommit(env.CREATOROS_ACTIVITY_RELEASE_COMMIT),
  };
}

export function writeProductReleaseAttestation({
  bundleDir,
  profile,
  binaryPath,
  artifactPaths = findInstallerArtifacts(bundleDir),
  releaseCommits = releaseCommitsFromEnv(),
  generatedAt = new Date().toISOString(),
}) {
  if (!["release", "release-fast"].includes(profile)) {
    throw new Error(`[T-635] 非法 release profile：${profile}`);
  }
  const manifest = createProductManifest();
  const manifestJson = canonicalProductManifestJson();
  assertBinaryContainsProductManifest(binaryPath, manifestJson);
  if (artifactPaths.length === 0) {
    throw new Error(`[T-635] ${bundleDir} 下没有可绑定的安装/更新产物`);
  }

  const manifestPath = join(bundleDir, PRODUCT_MANIFEST_FILE);
  writeJsonAtomic(manifestPath, manifest);
  const commits = {
    creator: normalizeCommit(releaseCommits.creator),
    growth: normalizeCommit(releaseCommits.growth),
    activity: normalizeCommit(releaseCommits.activity),
  };
  const complete = Object.values(commits).every(Boolean);
  const attestation = {
    schema: "thirdspace-release-attestation/v1",
    generatedAt,
    releaseProfile: profile,
    productIdentity: {
      ...manifest,
      manifestPath: PRODUCT_MANIFEST_FILE,
      manifestSha256: sha256File(manifestPath),
      binaryPath: basename(binaryPath),
      binarySha256: sha256File(binaryPath),
      binaryContainsCanonicalManifest: true,
    },
    artifacts: artifactPaths.map((path) => ({
      path: relative(bundleDir, path).replaceAll("\\", "/"),
      sha256: sha256File(path),
      bytes: statSync(path).size,
    })),
    releaseCommits: { ...commits, complete },
    claimEnabled: false,
    publishAuthorized: false,
    publishBlocker: complete
      ? "T-575 live program-gate GO 尚未附着"
      : "三仓 release commit 未完整绑定，且 T-575 live program-gate GO 尚未附着",
  };
  const attestationPath = join(bundleDir, RELEASE_ATTESTATION_FILE);
  writeJsonAtomic(attestationPath, attestation);
  return { manifestPath, attestationPath, manifest, attestation };
}
