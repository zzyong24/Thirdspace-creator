import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { materializeNestedEntryTree, resolveEntryPackage } from "./build-sidecar.mjs";

describe("Pi 打包协议自检", () => {
  it("覆盖 CreatorOS 会使用的 Chat / Responses / Anthropic 三种 wire API", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts", "desktop", "build-sidecar.mjs"),
      "utf8",
    );
    expect(source).toContain("openai-responses.lazy.js");
    expect(source).toContain("openai-completions.lazy.js");
    expect(source).toContain("anthropic-messages.lazy.js");
  });
});

function makeStore() {
  const root = mkdtempSync(join(tmpdir(), "creatoros-pnpm-entry-"));
  return { root, pnpm: join(root, "node_modules", ".pnpm") };
}

function makeEntry(pnpm, entryName, packageName, marker = packageName) {
  const dir = join(pnpm, entryName, "node_modules", ...packageName.split("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: packageName, version: "1.0.0" }));
  writeFileSync(join(dir, "marker.txt"), marker);
  return dir;
}

describe("Windows pnpm 截断 entry", () => {
it("从 scoped entry 真身还原完整包名", () => {
  const { root, pnpm } = makeStore();
  try {
    const entry = "@csstools+css-parser-algori_0123456789abcdef0123456789abcdef";
    const dir = makeEntry(pnpm, entry, "@csstools/css-parser-algorithms");
    expect(resolveEntryPackage(pnpm, entry)).toEqual({
      name: "@csstools/css-parser-algorithms",
      dir,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  });

it("从 unscoped entry 真身还原完整包名", () => {
  const { root, pnpm } = makeStore();
  try {
    const entry = "a-very-long-package-name_abcdef0123456789abcdef0123456789";
    const dir = makeEntry(pnpm, entry, "a-very-long-package-name-that-was-truncated");
    expect(resolveEntryPackage(pnpm, entry)).toEqual({
      name: "a-very-long-package-name-that-was-truncated",
      dir,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  });

it("嵌套物化把截断依赖放到完整包名目录", () => {
  const { root, pnpm } = makeStore();
  try {
    const rootEntry = "root-package@1.0.0";
    const depEntry = "@csstools+css-parser-algori_fedcba9876543210fedcba9876543210";
    makeEntry(pnpm, rootEntry, "root-package", "root");
    const depDir = makeEntry(pnpm, depEntry, "@csstools/css-parser-algorithms", "full-name");

    const depLink = join(pnpm, rootEntry, "node_modules", "@csstools", "css-parser-algorithms");
    mkdirSync(dirname(depLink), { recursive: true });
    symlinkSync(relative(dirname(depLink), depDir), depLink, "dir");

    const dest = join(root, "materialized", "root-package");
    materializeNestedEntryTree(pnpm, rootEntry, dest, new Set([rootEntry]));
    expect(
      readFileSync(join(dest, "node_modules", "@csstools", "css-parser-algorithms", "marker.txt"), "utf8"),
    ).toBe("full-name");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  });
});
