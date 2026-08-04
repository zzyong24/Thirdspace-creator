#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertVerdictPublicKey } from "../../frontend/scripts/desktop/verdict-key-material.mjs";

export function bakeVerdictPublicKey(closureRootArg, env = process.env) {
  const closureRoot = resolve(closureRootArg);
  const serverRoot = resolve(closureRoot, "frontend", ".next", "server");
  if (!existsSync(serverRoot)) {
    throw new Error(
      `[T-675] production closure 缺 Next server 目录，无法烘焙 verdict 公钥:${serverRoot}`,
    );
  }

  const { publicKeyB64 } = assertVerdictPublicKey(env);
  const verdictPath = resolve(serverRoot, "verdict-verify-key.json");
  mkdirSync(dirname(verdictPath), { recursive: true });
  writeFileSync(
    verdictPath,
    `${JSON.stringify(
      {
        publicKeyB64,
        algorithm: "ed25519",
        bakedBy: "windows-production-closure T-675",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`[T-675] ✓ verdict 验签公钥已烘焙:${verdictPath}`);
  return verdictPath;
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const [closureRootArg] = process.argv.slice(2);
  if (!closureRootArg) {
    throw new Error(
      "usage: node bake-verdict-public-key.mjs <closure-dir>",
    );
  }
  bakeVerdictPublicKey(closureRootArg);
}
