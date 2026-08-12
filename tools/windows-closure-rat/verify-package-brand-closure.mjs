#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPackageBrandBuildEnv } from "../../frontend/scripts/desktop/package-flavor.mjs";

const TEXT_EXTENSIONS = new Set([".js", ".json", ".html", ".txt", ".map"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function textFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name)) && statSync(path).size <= 32 * 1024 * 1024) {
        files.push(path);
      }
    }
  };
  visit(root);
  return files;
}

export function verifyPackageBrandClosure({ inputPath, closureRoot, proofPath }) {
  if (!existsSync(inputPath) || !existsSync(closureRoot)) {
    throw new Error("[T-781] 品牌输入或 Windows closure 不存在");
  }
  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  const env = readPackageBrandBuildEnv(input);
  const expectedBrand = env.NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_NAME;
  const expectedIcon = env.NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_ICON_DATA_URL;
  const brandMatches = [];
  const iconMatches = [];
  for (const path of textFiles(closureRoot)) {
    const content = readFileSync(path, "utf8");
    if (content.includes(expectedBrand)) brandMatches.push(relative(closureRoot, path));
    if (content.includes(expectedIcon)) iconMatches.push(relative(closureRoot, path));
  }
  if (!brandMatches.length || !iconMatches.length) {
    throw new Error(
      `[T-781] 最终 Windows WebView 未烘焙渠道品牌：brand=${brandMatches.length},icon=${iconMatches.length}`,
    );
  }
  const proof = {
    schema: "creatoros-package-brand-closure-proof/v1",
    packageRef: input.packageRef,
    brandName: expectedBrand,
    brandNameSha256: sha256(expectedBrand),
    iconSha256: input.iconSha256,
    brandMatchFiles: brandMatches.sort(),
    iconMatchFiles: iconMatches.sort(),
    passed: true,
  };
  writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(`[package-brand-proof] ✓ ${input.packageRef}/${expectedBrand} 已烘焙进 Windows WebView closure`);
  return proof;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const [inputPath, closureRoot, proofPath] = process.argv.slice(2).map((value) => resolve(value));
  if (!inputPath || !closureRoot || !proofPath) {
    throw new Error("用法: verify-package-brand-closure <input> <closure> <proof>");
  }
  verifyPackageBrandClosure({ inputPath, closureRoot, proofPath });
}
