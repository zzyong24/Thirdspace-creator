#!/usr/bin/env node
// [T-326 RT-H09] 按 target-triple 拉取**静态链接**的 ffmpeg 二进制(供 build-sidecar 实拷进
// sidecar/frontend/bin/,运行时由 resolveFfmpegPath 解析链第②级命中)。
//
// 为什么不能拷本机 Homebrew ffmpeg:Homebrew 的 ffmpeg 是**动态链接**(libavcodec/libavformat
// 等几十个 dylib 全在 /opt/homebrew 下),裸拷二进制到无 Homebrew 的用户机 dyld 必崩 ——
// 与 sidecar node 的 libnode dylib 坑同型(见 build-sidecar.mjs)。必须用**静态构建**。
//
// 二进制源:eugeneware/ffmpeg-static 的 GitHub release(npm 包 ffmpeg-static 的同一产物;
// 不装 npm 包 —— 装了会让每次 pnpm install 都强制下载 ~50-80MB 平台二进制,打包期才需要)。
//   https://github.com/eugeneware/ffmpeg-static/releases/download/<TAG>/ffmpeg-<platform>-<arch>
// 四平台资产已逐一在线核实(2026-07-15,HTTP 200):
//   darwin-arm64 45.6MB / darwin-x64 78.8MB / win32-x64 81.1MB / linux-x64 78.7MB
// ⚠️ 许可:这些是 GPL 构建(含 x264 等)。随包分发需在应用的第三方许可声明里带 ffmpeg(GPL)
//   条目 —— 打包链接入时诚实标注,不隐瞒。
//
// 用法:
//   node scripts/desktop/fetch-ffmpeg.mjs [target-triple]   # 默认本机 triple;打印二进制路径
// 环境变量:
//   CREATOROS_FFMPEG_BUNDLE_SRC  显式给一个静态 ffmpeg 二进制路径(镜像/预下载逃生门),
//                                跳过下载直接用它(打包方自证其为目标平台的静态构建)。
// 缓存:~/.cache/creatoros/ffmpeg-static/<TAG>/<asset> —— 命中即不重下(sidecar 每次重建
//   都会 rmSync,缓存必须放 sidecar 外)。

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { arch, platform } from "node:process";
import { fileURLToPath } from "node:url";

const RELEASE_TAG = "b6.0"; // ffmpeg 6.0 静态构建(eugeneware/ffmpeg-static release tag)

// target-triple → release 资产名(与 build-sidecar.mjs targetTriple() 的映射表对齐)。
const ASSET_BY_TRIPLE = {
  "aarch64-apple-darwin": "ffmpeg-darwin-arm64",
  "x86_64-apple-darwin": "ffmpeg-darwin-x64",
  "x86_64-pc-windows-msvc": "ffmpeg-win32-x64",
  "x86_64-unknown-linux-gnu": "ffmpeg-linux-x64",
};

// 本机 platform-arch → triple(与 build-sidecar 同表;CLI 缺省参数用)。
export function hostTriple() {
  const map = {
    "darwin-arm64": "aarch64-apple-darwin",
    "darwin-x64": "x86_64-apple-darwin",
    "win32-x64": "x86_64-pc-windows-msvc",
    "linux-x64": "x86_64-unknown-linux-gnu",
  };
  const triple = map[`${platform}-${arch}`];
  if (!triple) throw new Error(`[fetch-ffmpeg] 未映射的平台 ${platform}-${arch}`);
  return triple;
}

/** 该资产是否能在本机直接执行(-version 冒烟验证只对 host 可跑的资产做,诚实跳过交叉产物)。 */
function assetRunnableOnHost(asset) {
  const host = `${platform}-${arch}`;
  return (
    (asset === "ffmpeg-darwin-arm64" && host === "darwin-arm64") ||
    (asset === "ffmpeg-darwin-x64" && (host === "darwin-x64" || host === "darwin-arm64")) || // Rosetta 2
    (asset === "ffmpeg-win32-x64" && host === "win32-x64") ||
    (asset === "ffmpeg-linux-x64" && host === "linux-x64")
  );
}

/** -version 冒烟:exit 0 且 stdout 以 "ffmpeg version" 开头。跑不动(交叉平台)→ null(诚实跳过)。 */
function smokeTest(binPath, asset) {
  if (!assetRunnableOnHost(asset)) return null;
  const r = spawnSync(binPath, ["-version"], { encoding: "utf8" });
  return r.status === 0 && `${r.stdout}`.startsWith("ffmpeg version");
}

/**
 * 确保目标 triple 的静态 ffmpeg 就绪,返回其绝对路径。
 * 解析顺序:env CREATOROS_FFMPEG_BUNDLE_SRC(显式逃生门)→ 本地缓存 → GitHub release 下载。
 * 下载失败 / 冒烟失败 → throw(调用方 build-sidecar 决定 warn+skip 还是硬失败)。
 */
export function ensureFfmpegStatic(triple) {
  const asset = ASSET_BY_TRIPLE[triple];
  if (!asset) {
    throw new Error(
      `[fetch-ffmpeg] triple ${triple} 无静态 ffmpeg 资产映射(支持:${Object.keys(ASSET_BY_TRIPLE).join(", ")})`,
    );
  }

  // ① 显式逃生门:打包方自备二进制(镜像/离线场景)。
  const explicit = process.env.CREATOROS_FFMPEG_BUNDLE_SRC?.trim();
  if (explicit) {
    if (!existsSync(explicit)) {
      throw new Error(`[fetch-ffmpeg] CREATOROS_FFMPEG_BUNDLE_SRC 指向的文件不存在:${explicit}`);
    }
    console.log(`[fetch-ffmpeg] 使用显式指定的 ffmpeg 二进制:${explicit}`);
    return explicit;
  }

  // ② 缓存命中。win 资产落盘名补 .exe——Windows CreateProcess 不执行无扩展名文件,
  //    否则 -version 冒烟必败被误删(CI 实测;GitHub 资产名本身无 .exe,仅本地落盘名补)。
  const cacheDir = join(homedir(), ".cache", "creatoros", "ffmpeg-static", RELEASE_TAG);
  const cached = join(cacheDir, asset.includes("win32") ? `${asset}.exe` : asset);
  if (existsSync(cached)) {
    const ok = smokeTest(cached, asset);
    if (ok !== false) {
      console.log(`[fetch-ffmpeg] 缓存命中:${cached}${ok === null ? "(交叉平台,跳过 -version 冒烟)" : ""}`);
      return cached;
    }
    console.warn(`[fetch-ffmpeg] ⚠ 缓存的 ${asset} -version 冒烟失败(下载残缺?)→ 删除重下`);
    rmSync(cached, { force: true });
  }

  // ③ 下载(curl -fL:跟随重定向、HTTP 错误即失败;--retry 抗瞬时抖动)。先落 .part 再原子改名,
  //    避免中断留半截文件被当缓存命中。
  const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${RELEASE_TAG}/${asset}`;
  mkdirSync(cacheDir, { recursive: true });
  const part = `${cached}.part`;
  rmSync(part, { force: true });
  console.log(`[fetch-ffmpeg] 下载 ${url} …(静态构建,~50-80MB)`);
  const r = spawnSync("curl", ["-fL", "--retry", "3", "--retry-delay", "2", "-o", part, url], {
    stdio: "inherit",
  });
  if (r.status !== 0) {
    rmSync(part, { force: true });
    throw new Error(`[fetch-ffmpeg] 下载失败(curl exit ${r.status}):${url}`);
  }
  // 尺寸下限硬校验:四个资产均 >40MB;截断/错误页(几 KB)绝不放行。
  const size = statSync(part).size;
  if (size < 10 * 1024 * 1024) {
    rmSync(part, { force: true });
    throw new Error(`[fetch-ffmpeg] 下载产物过小(${size} bytes)—— 疑为截断/错误响应,已丢弃`);
  }
  renameSync(part, cached);
  if (!asset.includes("win32")) chmodSync(cached, 0o755);

  // ④ 冒烟(host 可跑才验;交叉产物诚实跳过并写日志)。
  const ok = smokeTest(cached, asset);
  if (ok === false) {
    rmSync(cached, { force: true });
    throw new Error(`[fetch-ffmpeg] ${asset} 下载后 -version 冒烟失败 —— 已删除,请重试或换镜像`);
  }
  console.log(
    `[fetch-ffmpeg] ✓ ${asset} 就绪(${(size / 1024 / 1024).toFixed(1)}MB)→ ${cached}` +
      (ok === null ? "(交叉平台产物,-version 冒烟留待目标机验证 —— 诚实标注)" : ""),
  );
  return cached;
}

// CLI 直跑:node fetch-ffmpeg.mjs [triple](被 build-sidecar import 时不执行)。
const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  const triple = process.argv[2] || hostTriple();
  const p = ensureFfmpegStatic(triple);
  console.log(p);
}
