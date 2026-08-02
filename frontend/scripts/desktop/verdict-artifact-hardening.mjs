#!/usr/bin/env node

import {
  createReadStream,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";

const SENTINEL = "[T451-BOUND]";
const REMOVED_BYPASS = "CREATOROS_SMOKE_BYPASS_VERDICT";

export function forbiddenVerdictNeedles(signingSeed) {
  const seed = String(signingSeed ?? "");
  const needles = [
    { label: "legacy-sentinel", bytes: Buffer.from(SENTINEL) },
    { label: "removed-smoke-bypass", bytes: Buffer.from(REMOVED_BYPASS) },
  ];
  if (seed) {
    needles.unshift({ label: "raw-signing-seed", bytes: Buffer.from(seed) });
  }
  return needles;
}

async function scanStream(stream, needles, location, required = []) {
  const maxNeedle = Math.max(
    1,
    ...[...needles, ...required].map(({ bytes }) => bytes.length),
  );
  let overlap = Buffer.alloc(0);
  const foundRequired = new Set();
  try {
    for await (const rawChunk of stream) {
      const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
      const window = Buffer.concat([overlap, chunk]);
      for (const { label, bytes } of needles) {
        if (bytes.length > 0 && window.indexOf(bytes) !== -1) {
          throw new Error(`[T-656] 产物泄漏扫描命中 ${label}: ${location}`);
        }
      }
      for (const { label, bytes } of required) {
        if (bytes.length > 0 && window.indexOf(bytes) !== -1) {
          foundRequired.add(label);
        }
      }
      overlap = window.subarray(Math.max(0, window.length - maxNeedle + 1));
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("[T-656]")) throw error;
    throw new Error(
      `[T-656] 无法完整读取待扫描产物 ${location}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return foundRequired;
}

export async function assertFileHasNoForbidden(filePath, needles) {
  if (!existsSync(filePath) || !lstatSync(filePath).isFile()) {
    throw new Error(`[T-656] 待扫描文件不存在: ${filePath}`);
  }
  await scanStream(createReadStream(filePath), needles, filePath);
}

export async function assertGunzipTarHasNoForbidden(
  tarballPath,
  needles,
  required = [],
) {
  if (!existsSync(tarballPath) || !lstatSync(tarballPath).isFile()) {
    throw new Error(`[T-656] 待扫描 sidecar tar 不存在: ${tarballPath}`);
  }
  const found = await scanStream(
    createReadStream(tarballPath).pipe(createGunzip()),
    needles,
    `${tarballPath} (gunzip tar stream)`,
    required,
  );
  for (const { label } of required) {
    if (!found.has(label)) {
      throw new Error(`[T-656] sidecar tar 缺少必需材料 ${label}: ${tarballPath}`);
    }
  }
}

function parseTarText(header, start, length) {
  return header
    .subarray(start, start + length)
    .toString("utf8")
    .replace(/\0.*$/s, "")
    .trim();
}

export async function assertGunzipTarVerdictHardening(
  tarballPath,
  needles,
  publicKeyB64,
) {
  if (!publicKeyB64) {
    throw new Error("[T-656] 产物扫描缺 CREATOROS_VERDICT_PUBKEY_B64");
  }
  if (!existsSync(tarballPath) || !lstatSync(tarballPath).isFile()) {
    throw new Error(`[T-656] 待扫描 sidecar tar 不存在: ${tarballPath}`);
  }
  const targetSuffix = "frontend/.next/server/verdict-verify-key.json";
  const maxNeedle = Math.max(1, ...needles.map(({ bytes }) => bytes.length));
  let overlap = Buffer.alloc(0);
  let tarBuffer = Buffer.alloc(0);
  let entryRemaining = 0;
  let entryPadding = 0;
  let captureTarget = false;
  let targetBytes = [];
  let targetFound = false;

  try {
    for await (const rawChunk of createReadStream(tarballPath).pipe(createGunzip())) {
      const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
      const scanWindow = Buffer.concat([overlap, chunk]);
      for (const { label, bytes } of needles) {
        if (bytes.length > 0 && scanWindow.indexOf(bytes) !== -1) {
          throw new Error(`[T-656] 产物泄漏扫描命中 ${label}: ${tarballPath}`);
        }
      }
      overlap = scanWindow.subarray(
        Math.max(0, scanWindow.length - maxNeedle + 1),
      );

      tarBuffer = Buffer.concat([tarBuffer, chunk]);
      while (tarBuffer.length > 0) {
        if (entryRemaining > 0) {
          const consumed = Math.min(entryRemaining, tarBuffer.length);
          if (captureTarget) {
            targetBytes.push(tarBuffer.subarray(0, consumed));
            const capturedLength = targetBytes.reduce(
              (total, part) => total + part.length,
              0,
            );
            if (capturedLength > 64 * 1024) {
              throw new Error("[T-656] verdict-verify-key.json 异常超出 64 KiB");
            }
          }
          tarBuffer = tarBuffer.subarray(consumed);
          entryRemaining -= consumed;
          if (entryRemaining > 0) break;
          if (captureTarget) targetFound = true;
          continue;
        }
        if (entryPadding > 0) {
          const consumed = Math.min(entryPadding, tarBuffer.length);
          tarBuffer = tarBuffer.subarray(consumed);
          entryPadding -= consumed;
          if (entryPadding > 0) break;
          continue;
        }
        if (tarBuffer.length < 512) break;
        const header = tarBuffer.subarray(0, 512);
        tarBuffer = tarBuffer.subarray(512);
        if (header.every((byte) => byte === 0)) continue;
        const name = parseTarText(header, 0, 100);
        const prefix = parseTarText(header, 345, 155);
        const fullName = prefix ? `${prefix}/${name}` : name;
        const sizeText = parseTarText(header, 124, 12).replace(/\s/g, "");
        const size = Number.parseInt(sizeText || "0", 8);
        if (!Number.isSafeInteger(size) || size < 0) {
          throw new Error(`[T-656] tar entry size 非法: ${fullName}`);
        }
        entryRemaining = size;
        entryPadding = (512 - (size % 512)) % 512;
        captureTarget = fullName.replaceAll("\\", "/").endsWith(targetSuffix);
        if (captureTarget) {
          if (targetFound || targetBytes.length > 0) {
            throw new Error("[T-656] sidecar tar 含重复 verdict-verify-key.json");
          }
          targetBytes = [];
          if (size === 0) targetFound = true;
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("[T-656]")) throw error;
    throw new Error(
      `[T-656] 无法完整解析 sidecar tar ${tarballPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!targetFound) {
    throw new Error(`[T-656] sidecar tar 缺 ${targetSuffix}: ${tarballPath}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(targetBytes).toString("utf8"));
  } catch {
    throw new Error(`[T-656] sidecar tar 中 verdict-verify-key.json 无法解析: ${tarballPath}`);
  }
  if (parsed?.publicKeyB64 !== publicKeyB64) {
    throw new Error(`[T-656] sidecar tar 中 verdict 公钥与构建输入不匹配: ${tarballPath}`);
  }
}

function assertVerdictPublicKeyFile(filePath, publicKeyB64) {
  if (!publicKeyB64) {
    throw new Error("[T-656] 产物扫描缺 CREATOROS_VERDICT_PUBKEY_B64");
  }
  if (!existsSync(filePath) || !lstatSync(filePath).isFile()) {
    throw new Error(`[T-656] current runtime 缺 verdict-verify-key.json: ${filePath}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    throw new Error(`[T-656] current runtime 的 verdict-verify-key.json 无法解析: ${filePath}`);
  }
  if (parsed?.publicKeyB64 !== publicKeyB64) {
    throw new Error("[T-656] current runtime 的 verdict 公钥与构建输入不匹配");
  }
}

async function scanDirectory(
  directory,
  needles,
  required = [],
  root = directory,
  foundRequired = new Set(),
) {
  if (!existsSync(directory) || !lstatSync(directory).isDirectory()) {
    throw new Error(`[T-656] 待扫描 runtime 目录不存在: ${directory}`);
  }
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await scanDirectory(absolute, needles, required, root, foundRequired);
    } else if (entry.isFile()) {
      const found = await scanStream(
        createReadStream(absolute),
        needles,
        relative(root, absolute) || entry.name,
        required,
      );
      for (const label of found) foundRequired.add(label);
    }
  }
  return foundRequired;
}

export function resolveWindowsInstalledRuntime(installDir) {
  const runtimeImages = resolve(installDir, "runtime-images");
  const pointer = join(runtimeImages, "runtime-current.txt");
  if (!existsSync(pointer) || !lstatSync(pointer).isFile()) {
    throw new Error(`[T-656] 安装目录缺 runtime-current.txt: ${pointer}`);
  }
  const raw = readFileSync(pointer, "utf8");
  const lines = raw.split(/\r?\n/);
  while (lines.at(-1) === "") lines.pop();
  if (lines.length !== 1) {
    throw new Error("[T-656] runtime-current.txt 必须只有一行 runtimeId");
  }
  const runtimeId = lines[0];
  if (
    !runtimeId ||
    runtimeId.includes("..") ||
    !/^[A-Za-z0-9._-]+$/.test(runtimeId)
  ) {
    throw new Error("[T-656] runtime-current.txt 含非法 runtimeId");
  }
  const runtimeDir = resolve(runtimeImages, runtimeId, "sidecar");
  const rel = relative(runtimeImages, runtimeDir);
  if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw new Error("[T-656] runtime-current.txt 解析结果逃逸 runtime-images");
  }
  if (!existsSync(runtimeDir) || !lstatSync(runtimeDir).isDirectory()) {
    throw new Error(`[T-656] current runtime 实体目录不存在: ${runtimeDir}`);
  }
  return runtimeDir;
}

export async function scanWindowsInstalledRuntime(
  installDir,
  signingSeed,
  publicKeyB64,
) {
  const runtimeDir = resolveWindowsInstalledRuntime(installDir);
  await scanDirectory(runtimeDir, forbiddenVerdictNeedles(signingSeed));
  assertVerdictPublicKeyFile(
    join(
      runtimeDir,
      "frontend",
      ".next",
      "server",
      "verdict-verify-key.json",
    ),
    publicKeyB64,
  );
  return runtimeDir;
}

export async function verifyPackagedVerdictHardening({
  shellPath,
  canonicalTarball,
  packagedTarball,
  signingSeed,
  publicKeyB64,
}) {
  if (!publicKeyB64) {
    throw new Error("[T-656] 产物扫描缺 CREATOROS_VERDICT_PUBKEY_B64");
  }
  const needles = forbiddenVerdictNeedles(signingSeed);
  await assertFileHasNoForbidden(shellPath, needles);
  await assertGunzipTarVerdictHardening(
    canonicalTarball,
    needles,
    publicKeyB64,
  );
  if (packagedTarball) {
    await assertGunzipTarVerdictHardening(
      packagedTarball,
      needles,
      publicKeyB64,
    );
  }
}

const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const command = process.argv[2];
  if (command !== "--scan-installed-runtime" || !process.argv[3]) {
    console.error(
      "用法: node verdict-artifact-hardening.mjs --scan-installed-runtime <installDir>",
    );
    process.exit(2);
  }
  await scanWindowsInstalledRuntime(
    resolve(process.argv[3]),
    process.env.CREATOROS_VERDICT_SIGNING_KEY_B64,
    process.env.CREATOROS_VERDICT_PUBKEY_B64,
  );
  console.log("[T-656] ✓ Windows current runtime 泄漏扫描通过");
}
