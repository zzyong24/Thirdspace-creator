import assert from "node:assert/strict";
import test from "node:test";

import { isNonRuntimeTracedAsset } from "./traced-asset-policy.mjs";

test("Windows production closure 排除 Next 误追踪的工程源码与验证文件", () => {
  for (const asset of [
    "frontend/src/app/page.tsx",
    "frontend/src-tauri/target/release/CreatorOS.exe",
    "frontend/tests/e2e/app-shell.spec.ts",
    "frontend/docs/acceptance/screenshot.png",
    "frontend/specs/page-specs.md",
    "frontend/scripts/desktop/package.mjs",
  ]) {
    assert.equal(isNonRuntimeTracedAsset(asset), true, asset);
  }
});

test("Windows production closure 保留真实运行资产", () => {
  for (const asset of [
    "frontend/.next/server/app/page.js",
    "frontend/.next/static/chunks/app.js",
    "frontend/public/courses/xuehui-ip-practical-course/manifest.json",
    "frontend/package.json",
    "backend/drizzle/0068_keyring_only_credentials.sql",
    "node_modules/.pnpm/pdf-parse@2.4.5/node_modules/pdf-parse/dist/cjs/index.cjs",
  ]) {
    assert.equal(isNonRuntimeTracedAsset(asset), false, asset);
  }
});

test("Windows 路径分隔符不能绕过非运行资产边界", () => {
  assert.equal(
    isNonRuntimeTracedAsset("frontend\\src\\server\\persistence-client.ts"),
    true,
  );
});
