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
  pruneStandaloneLeaks,
  resolveEntryPackage,
  assertNoPackagedBuildArtifacts,
  assertCreatorOsCliRuntime,
  assertNoPortableMetadataFiles,
  portableTarEnv,
  prunePortableMetadataFiles,
  copyPortableBundleTree,
  canvasNativePackageFor,
  findPnpmEntryForPackage,
  materializeRuntimePackageClosure,
  windowsTarBinary,
  resolvePiPnpmEntry,
} from "./build-sidecar.mjs";

describe("Windows release 归档与 Pi 入口解析", () => {
  it("Windows 固定使用 System32 tar，避免 Git tar 把盘符当远端", () => {
    expect(windowsTarBinary("win32", { SystemRoot: "C:\\Windows" })).toBe("C:\\Windows/System32/tar.exe");
    expect(windowsTarBinary("darwin", {})).toBe("tar");
  });
  it("Pi 可通过项目 node_modules 的真实入口回溯 .pnpm 条目", () => {
    const root = mkdtempSync(join(tmpdir(), "creatoros-pi-resolve-"));
    try {
      const pnpm = join(root, "node_modules", ".pnpm");
      const body = join(pnpm, "pi-entry", "node_modules", "@earendil-works", "pi-coding-agent");
      mkdirSync(body, { recursive: true });
      writeFileSync(join(body, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent", version: "0.80.7" }));
      const anchor = join(root, "backend", "node_modules", "@earendil-works", "pi-coding-agent");
      mkdirSync(dirname(anchor), { recursive: true });
      symlinkSync(body, anchor, "dir");
      expect(resolvePiPnpmEntry(pnpm, root, "@earendil-works/pi-coding-agent")).toBe("pi-entry");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("T-843 CreatorOS CLI 随包运行时", () => {
  it("双平台都要求 CLI bundle 与随包 Node 同时存在", () => {
    const root = mkdtempSync(join(tmpdir(), "creatoros-cli-runtime-"));
    try {
      mkdirSync(join(root, "frontend", "cli"), { recursive: true });
      writeFileSync(join(root, "frontend", "cli", "creatoros.cjs"), "bundle");
      expect(() => assertCreatorOsCliRuntime(root, "win32")).toThrow(/cli.node\.exe/);
      mkdirSync(join(root, "cli"), { recursive: true });
      writeFileSync(join(root, "cli", "node.exe"), "node");
      expect(() => assertCreatorOsCliRuntime(root, "win32")).not.toThrow();

      expect(() => assertCreatorOsCliRuntime(root, "darwin")).toThrow(/server\.app/);
      const macNode = join(root, "server.app", "Contents", "MacOS", "creatoros-server");
      mkdirSync(dirname(macNode), { recursive: true });
      writeFileSync(macNode, "node");
      expect(() => assertCreatorOsCliRuntime(root, "darwin")).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("macOS bundle 可搬运复制", () => {
  it("保留 Framework 的相对 symlink，不改写成构建机绝对路径", () => {
    const root = mkdtempSync(join(tmpdir(), "creatoros-portable-bundle-"));
    try {
      const src = join(root, "cache", "Browser.app");
      const framework = join(src, "Contents", "Frameworks", "Browser.framework");
      const version = join(framework, "Versions", "1.0");
      mkdirSync(join(version, "Resources"), { recursive: true });
      symlinkSync("1.0", join(framework, "Versions", "Current"));
      symlinkSync("Versions/Current/Resources", join(framework, "Resources"));

      const dest = join(root, "bundle", "Browser.app");
      mkdirSync(dirname(dest), { recursive: true });
      copyPortableBundleTree(src, dest);

      const copiedFramework = join(dest, "Contents", "Frameworks", "Browser.framework");
      expect(readlinkSync(join(copiedFramework, "Versions", "Current"))).toBe("1.0");
      expect(readlinkSync(join(copiedFramework, "Resources"))).toBe("Versions/Current/Resources");
      expect(realpathSync(join(copiedFramework, "Resources"))).toBe(
        realpathSync(join(copiedFramework, "Versions", "1.0", "Resources")),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

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

describe("T-768 本地 Whisper 双平台兜底运行时", () => {
  it("构建脚本强制物化 Transformers/ONNX、随包 ffmpeg，并在缺依赖时硬失败", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts", "desktop", "build-sidecar.mjs"),
      "utf8",
    );
    expect(source).toContain('const PKG = "@xenova/transformers"');
    expect(source).toContain("打包版 whisper-local 必崩,不出包");
    expect(source).toContain("onnxruntime_binding.node");
    expect(source).toContain('platform === "win32"');
    expect(source).toContain("ensureFfmpegStatic");
    expect(source).toContain("ensureFfprobeStatic");
  });
});

describe("sidecar 构建产物递归污染哨兵", () => {
  it("主动剥离 Next trace 混入的 src-tauri 构建树", () => {
    const root = mkdtempSync(join(tmpdir(), "creatoros-sidecar-prune-"));
    try {
      const frontend = join(root, "frontend");
      mkdirSync(join(frontend, "src-tauri", "target", "release"), { recursive: true });
      writeFileSync(join(frontend, "src-tauri", "target", "release", "CreatorOS"), "binary");
      mkdirSync(join(frontend, ".next"), { recursive: true });
      mkdirSync(join(frontend, "node_modules"), { recursive: true });
      mkdirSync(join(frontend, "public"), { recursive: true });
      writeFileSync(join(frontend, "server.js"), "server");
      writeFileSync(join(frontend, "package.json"), "{}");

      expect(pruneStandaloneLeaks(root)).toBeGreaterThan(0);
      expect(existsSync(join(frontend, "src-tauri"))).toBe(false);
      expect(() => assertNoPackagedBuildArtifacts(root)).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("打 tar 前拒绝任何嵌套安装包或 sidecar tarball", () => {
    const root = mkdtempSync(join(tmpdir(), "creatoros-sidecar-sentinel-"));
    try {
      mkdirSync(join(root, "frontend", "cache"), { recursive: true });
      writeFileSync(join(root, "frontend", "cache", "CreatorOS.app.tar.gz"), "nested-package");

      expect(() => assertNoPackagedBuildArtifacts(root)).toThrow(/CreatorOS\.app\.tar\.gz/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("macOS AppleDouble 打包防线", () => {
  it("macOS tar 强制关闭 copyfile 元数据编码", () => {
    expect(portableTarEnv({ MARKER: "kept" }, "darwin")).toEqual({
      MARKER: "kept",
      COPYFILE_DISABLE: "1",
    });
    expect(portableTarEnv({ MARKER: "kept" }, "linux")).toEqual({ MARKER: "kept" });
  });

  it("签名前清理并拒绝残留的 ._* 与 .DS_Store", () => {
    const root = mkdtempSync(join(tmpdir(), "creatoros-appledouble-"));
    try {
      mkdirSync(join(root, "server.app", "Contents", "MacOS"), { recursive: true });
      writeFileSync(join(root, "server.app", "Contents", "._Info.plist"), "appledouble");
      writeFileSync(join(root, ".DS_Store"), "finder");
      expect(() => assertNoPortableMetadataFiles(root)).toThrow(/AppleDouble/);
      expect(prunePortableMetadataFiles(root).sort()).toEqual([
        ".DS_Store",
        "server.app/Contents/._Info.plist",
      ]);
      expect(() => assertNoPortableMetadataFiles(root)).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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

describe("PDF 附件解析桌面运行时闭包", () => {
  it("按目标平台选择 canvas 原生包，不把开发机架构写死", () => {
    expect(canvasNativePackageFor("darwin", "arm64")).toBe(
      "@napi-rs/canvas-darwin-arm64",
    );
    expect(canvasNativePackageFor("win32", "x64")).toBe(
      "@napi-rs/canvas-win32-x64-msvc",
    );
    expect(canvasNativePackageFor("plan9", "x64")).toBeNull();
  });

  it("macOS/Linux 从 pdf-parse 根 entry 带齐 canvas 与原生依赖并建立解析锚", () => {
    const { root, pnpm } = makeStore();
    try {
      const pdfEntry = "pdf-parse@2.4.5";
      const canvasEntry = "@napi-rs+canvas@0.1.80";
      const nativeEntry = "@napi-rs+canvas-darwin-arm64@0.1.80";
      const pdfDir = makeEntry(pnpm, pdfEntry, "pdf-parse", "pdf");
      const canvasDir = makeEntry(pnpm, canvasEntry, "@napi-rs/canvas", "canvas");
      const nativeDir = makeEntry(
        pnpm,
        nativeEntry,
        "@napi-rs/canvas-darwin-arm64",
        "native",
      );

      const linkDep = (entry, name, target) => {
        const link = join(pnpm, entry, "node_modules", ...name.split("/"));
        mkdirSync(dirname(link), { recursive: true });
        symlinkSync(relative(dirname(link), target), link, "dir");
      };
      linkDep(pdfEntry, "@napi-rs/canvas", canvasDir);
      linkDep(canvasEntry, "@napi-rs/canvas-darwin-arm64", nativeDir);

      expect(findPnpmEntryForPackage(pnpm, "pdf-parse")).toBe(pdfEntry);
      const runtimeRoot = join(root, "runtime");
      const result = materializeRuntimePackageClosure({
        srcPnpm: pnpm,
        runtimeRoot,
        packageName: "pdf-parse",
        targetPlatform: "darwin",
      });

      expect(result.closure).toEqual(new Set([pdfEntry, canvasEntry, nativeEntry]));
      const anchor = join(runtimeRoot, "frontend", "node_modules", "pdf-parse");
      expect(lstatSync(anchor).isSymbolicLink()).toBe(true);
      expect(readFileSync(join(anchor, "marker.txt"), "utf8")).toBe("pdf");
      const canvasAnchor = join(
        runtimeRoot,
        "frontend",
        "node_modules",
        "@napi-rs",
        "canvas",
      );
      const nativeAnchor = join(
        runtimeRoot,
        "frontend",
        "node_modules",
        "@napi-rs",
        "canvas-darwin-arm64",
      );
      expect(lstatSync(canvasAnchor).isSymbolicLink()).toBe(true);
      expect(lstatSync(nativeAnchor).isSymbolicLink()).toBe(true);
      expect(readFileSync(join(canvasAnchor, "marker.txt"), "utf8")).toBe("canvas");
      expect(readFileSync(join(nativeAnchor, "marker.txt"), "utf8")).toBe("native");
      expect(
        readFileSync(
          join(
            runtimeRoot,
            "node_modules",
            ".pnpm",
            nativeEntry,
            "node_modules",
            "@napi-rs",
            "canvas-darwin-arm64",
            "marker.txt",
          ),
          "utf8",
        ),
      ).toBe("native");
      expect(readFileSync(join(pdfDir, "marker.txt"), "utf8")).toBe("pdf");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("Windows 将 external 闭包物化为无 junction 的顶层真目录", () => {
    const { root, pnpm } = makeStore();
    try {
      const pdfEntry = "pdf-parse@2.4.5";
      const canvasEntry = "@napi-rs+canvas@0.1.80";
      const pdfDir = makeEntry(pnpm, pdfEntry, "pdf-parse", "pdf-win");
      const canvasDir = makeEntry(pnpm, canvasEntry, "@napi-rs/canvas", "canvas-win");
      const link = join(pnpm, pdfEntry, "node_modules", "@napi-rs", "canvas");
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(relative(dirname(link), canvasDir), link, "dir");

      const runtimeRoot = join(root, "runtime-win");
      materializeRuntimePackageClosure({
        srcPnpm: pnpm,
        runtimeRoot,
        packageName: "pdf-parse",
        targetPlatform: "win32",
      });

      const pdf = join(runtimeRoot, "frontend", "node_modules", "pdf-parse");
      const canvas = join(
        runtimeRoot,
        "frontend",
        "node_modules",
        "@napi-rs",
        "canvas",
      );
      expect(lstatSync(pdf).isSymbolicLink()).toBe(false);
      expect(lstatSync(canvas).isSymbolicLink()).toBe(false);
      expect(readFileSync(join(pdf, "marker.txt"), "utf8")).toBe("pdf-win");
      expect(readFileSync(join(canvas, "marker.txt"), "utf8")).toBe("canvas-win");
      expect(readFileSync(join(pdfDir, "marker.txt"), "utf8")).toBe("pdf-win");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
