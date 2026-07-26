import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import {
  copyPnpmClosureVerbatim,
  dedupeIdenticalOnnxAliases,
  linkPackageAnchor,
  materializeHoistedEntryClosure,
  materializeNestedEntryTree,
  pruneOnnxRuntimeWebWasm,
  resolveEntryPackage,
} from "./build-sidecar.mjs";

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

describe("生产依赖闭包去重", () => {
  it("macOS/Linux 按 pnpm entry 线性复制并保留内部相对链", () => {
    const { root, pnpm } = makeStore();
    try {
      const rootEntry = "renderer@1.0.0";
      const depEntry = "shared@1.0.0";
      const rootDir = makeEntry(pnpm, rootEntry, "renderer");
      const depDir = makeEntry(pnpm, depEntry, "shared");
      const depLink = join(dirname(rootDir), "shared");
      symlinkSync(relative(dirname(depLink), depDir), depLink, "dir");

      const destPnpm = join(root, "dest", ".pnpm");
      const copied = copyPnpmClosureVerbatim(pnpm, destPnpm, [rootEntry]);

      expect(copied).toEqual(new Set([rootEntry, depEntry]));
      const copiedLink = join(destPnpm, rootEntry, "node_modules", "shared");
      expect(lstatSync(copiedLink).isSymbolicLink()).toBe(true);
      expect(realpathSync(copiedLink)).toBe(
        realpathSync(join(destPnpm, depEntry, "node_modules", "shared")),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("Windows hoist 让共享依赖只保留一份真目录", () => {
    const { root, pnpm } = makeStore();
    try {
      const rootEntry = "renderer@1.0.0";
      const leftEntry = "left@1.0.0";
      const rightEntry = "right@1.0.0";
      const sharedEntry = "shared@1.0.0";
      const rootDir = makeEntry(pnpm, rootEntry, "renderer");
      const leftDir = makeEntry(pnpm, leftEntry, "left");
      const rightDir = makeEntry(pnpm, rightEntry, "right");
      const sharedDir = makeEntry(pnpm, sharedEntry, "shared");

      const link = (fromPkgDir, packageName, targetDir) => {
        const dest = join(dirname(fromPkgDir), packageName);
        symlinkSync(relative(dirname(dest), targetDir), dest, "dir");
      };
      link(rootDir, "left", leftDir);
      link(rootDir, "right", rightDir);
      link(leftDir, "shared", sharedDir);
      link(rightDir, "shared", sharedDir);

      const destNodeModules = join(root, "hoisted", "node_modules");
      const result = materializeHoistedEntryClosure(
        pnpm,
        [rootEntry],
        destNodeModules,
      );

      expect(result.hoisted).toBe(4);
      expect(existsSync(join(destNodeModules, "shared", "marker.txt"))).toBe(true);
      expect(existsSync(join(destNodeModules, "left", "node_modules", "shared"))).toBe(false);
      expect(existsSync(join(destNodeModules, "right", "node_modules", "shared"))).toBe(false);
      expect(lstatSync(join(destNodeModules, "shared")).isSymbolicLink()).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("Node sidecar 删除永远不会加载的 onnxruntime-web WASM 副本", () => {
    const root = mkdtempSync(join(tmpdir(), "creatoros-onnx-web-"));
    try {
      const dist = join(
        root,
        "onnxruntime-web@1.14.0",
        "node_modules",
        "onnxruntime-web",
        "dist",
      );
      mkdirSync(dist, { recursive: true });
      writeFileSync(join(dist, "ort-wasm.wasm"), "duplicate-wasm");
      writeFileSync(join(dist, "ort-wasm-threaded.wasm"), "duplicate-wasm-threaded");
      writeFileSync(join(dist, "ort-web.node.js"), "module.exports = {}");

      expect(pruneOnnxRuntimeWebWasm(root)).toBe(2);
      expect(existsSync(join(dist, "ort-wasm.wasm"))).toBe(false);
      expect(existsSync(join(dist, "ort-wasm-threaded.wasm"))).toBe(false);
      expect(existsSync(join(dist, "ort-web.node.js"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("macOS ONNX ABI 别名改成相对 symlink，避免同一 dylib 存两份", () => {
    const root = mkdtempSync(join(tmpdir(), "creatoros-onnx-alias-"));
    try {
      const bin = join(
        root,
        "onnxruntime-node@1.27.0",
        "node_modules",
        "onnxruntime-node",
        "bin",
        "napi-v6",
        "darwin",
        "arm64",
      );
      mkdirSync(bin, { recursive: true });
      writeFileSync(join(bin, "libonnxruntime.1.27.0.dylib"), "same-binary");
      writeFileSync(join(bin, "libonnxruntime.1.dylib"), "same-binary");

      expect(dedupeIdenticalOnnxAliases(root, "darwin", "arm64")).toBe(1);
      const alias = join(bin, "libonnxruntime.1.dylib");
      expect(lstatSync(alias).isSymbolicLink()).toBe(true);
      expect(readlinkSync(alias)).toBe("libonnxruntime.1.27.0.dylib");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("Playwright 顶层解析锚复用 .pnpm 真身", () => {
    const root = mkdtempSync(join(tmpdir(), "creatoros-package-anchor-"));
    try {
      const target = join(root, "node_modules", ".pnpm", "playwright@1", "node_modules", "playwright");
      const anchor = join(root, "frontend", "node_modules", "playwright");
      mkdirSync(target, { recursive: true });
      writeFileSync(join(target, "package.json"), "{}");

      linkPackageAnchor(target, anchor);

      expect(lstatSync(anchor).isSymbolicLink()).toBe(true);
      expect(realpathSync(anchor)).toBe(realpathSync(target));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
