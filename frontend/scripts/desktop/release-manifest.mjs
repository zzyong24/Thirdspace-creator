// [T-147 P6 / T-164] release manifest 读写 —— 记录本次打包的签名/公证/updater 状态。
// gate ⑥:codesign/notarize skip 时在这里标 signed:false,防未签产物被下游误当已签分发。
// 落点:src-tauri/target/release/bundle/creatoros-release-manifest.json(产物旁)。

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_MANIFEST_PATH = join(
  FRONTEND,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "creatoros-release-manifest.json",
);

export function readManifest(path = DEFAULT_MANIFEST_PATH) {
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      // 损坏 → 从空开始(不阻塞打包)。
    }
  }
  return { generatedAt: new Date().toISOString() };
}

export function writeManifest(manifest, path = DEFAULT_MANIFEST_PATH) {
  manifest.updatedAt = new Date().toISOString();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return path;
}
