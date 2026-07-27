#!/usr/bin/env node

import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readlinkSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} 失败(exit=${result.status})\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
  return result;
}

function makeReadOnly(root) {
  const visit = (path) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) visit(join(path, entry));
      chmodSync(path, 0o555);
      return;
    }
    const executable = (stat.mode & 0o111) !== 0;
    chmodSync(path, executable ? 0o555 : 0o444);
  };
  visit(root);
}

function makeWritableForCleanup(root) {
  const visit = (path) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return;
    chmodSync(path, stat.isDirectory() ? 0o755 : 0o644);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) visit(join(path, entry));
    }
  };
  try {
    visit(root);
  } catch {
    // fixture 主结论不应被 best-effort 清理覆盖；rmSync 会继续报告真正无法清理的路径。
  }
}

function writeSource(path, source) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
}

if (process.platform !== "darwin") {
  console.log(
    JSON.stringify({
      rat: "RAT-PKG-03",
      verdict: "NOT_APPLICABLE",
      reason: "该 fixture 必须在 macOS 原生主机运行",
    }),
  );
  process.exit(0);
}

const root = mkdtempSync(join(tmpdir(), "creatoros-rat-pkg-03-"));
try {
  const source = join(root, "source");
  const app = join(root, "CreatorOS-RAT.app");
  const macos = join(app, "Contents", "MacOS");
  const runtime = join(
    app,
    "Contents",
    "Resources",
    "runtime",
    "rat-runtime",
  );
  const lib = join(runtime, "lib");
  const launcher = join(macos, "creatoros-rat");
  const dylib = join(lib, "libfixture.dylib");
  const dylibLink = join(lib, "libfixture-current.dylib");

  mkdirSync(macos, { recursive: true });
  mkdirSync(lib, { recursive: true });
  writeSource(
    join(source, "libfixture.c"),
    "int creatoros_fixture_answer(void) { return 42; }\n",
  );
  writeSource(
    join(source, "main.c"),
    [
      "#include <stdio.h>",
      "extern int creatoros_fixture_answer(void);",
      "int main(void) {",
      '  printf("%d\\n", creatoros_fixture_answer());',
      "  return creatoros_fixture_answer() == 42 ? 0 : 1;",
      "}",
      "",
    ].join("\n"),
  );
  writeSource(
    join(app, "Contents", "Info.plist"),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0"><dict>',
      "<key>CFBundleExecutable</key><string>creatoros-rat</string>",
      "<key>CFBundleIdentifier</key><string>cloud.aitongban.creatoros.rat</string>",
      "<key>CFBundleName</key><string>CreatorOS-RAT</string>",
      "<key>CFBundlePackageType</key><string>APPL</string>",
      "<key>CFBundleVersion</key><string>1</string>",
      "</dict></plist>",
      "",
    ].join("\n"),
  );

  run("xcrun", [
    "clang",
    "-dynamiclib",
    join(source, "libfixture.c"),
    "-Wl,-install_name,@rpath/libfixture-current.dylib",
    "-o",
    dylib,
  ]);
  symlinkSync("libfixture.dylib", dylibLink);
  run("xcrun", [
    "clang",
    join(source, "main.c"),
    "-L",
    lib,
    "-lfixture",
    "-Wl,-rpath,@executable_path/../Resources/runtime/rat-runtime/lib",
    "-o",
    launcher,
  ]);

  // 所有 runtime 内容注入完成后才签名，模拟正式 post-bundle 顺序。
  run("codesign", ["--force", "--deep", "--sign", "-", app]);
  run("codesign", ["--verify", "--deep", "--strict", app]);

  const archive = join(root, "CreatorOS-RAT.app.zip");
  run("ditto", ["-c", "-k", "--keepParent", app, archive]);
  const restoredRoot = join(root, "restored");
  mkdirSync(restoredRoot);
  run("ditto", ["-x", "-k", archive, restoredRoot]);
  const restoredApp = join(restoredRoot, "CreatorOS-RAT.app");
  const restoredRuntime = join(
    restoredApp,
    "Contents",
    "Resources",
    "runtime",
    "rat-runtime",
  );
  const restoredLink = join(
    restoredRuntime,
    "lib",
    "libfixture-current.dylib",
  );
  const restoredLauncher = join(
    restoredApp,
    "Contents",
    "MacOS",
    "creatoros-rat",
  );

  run("codesign", ["--verify", "--deep", "--strict", restoredApp]);
  if (!lstatSync(restoredLink).isSymbolicLink()) {
    throw new Error("updater archive 解包后 dylib 相对 symlink 已丢失");
  }
  if (readlinkSync(restoredLink) !== "libfixture.dylib") {
    throw new Error(`dylib symlink 指向包外:${readlinkSync(restoredLink)}`);
  }

  makeReadOnly(restoredApp);
  const isolatedHome = join(root, "isolated-home");
  const isolatedTmp = join(root, "isolated-tmp");
  mkdirSync(isolatedHome);
  mkdirSync(isolatedTmp);
  const launch = run(restoredLauncher, [], {
    cwd: "/",
    env: {
      HOME: isolatedHome,
      TMPDIR: isolatedTmp,
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    },
  });
  if (launch.stdout.trim() !== "42") {
    throw new Error(`隔离启动输出异常:${launch.stdout.trim()}`);
  }

  console.log(
    JSON.stringify({
      rat: "RAT-PKG-03",
      verdict: "PASS",
      checks: {
        injectBeforeFinalCodesign: true,
        codesignStrict: true,
        readOnlyRuntimeLaunch: true,
        isolatedCwdAndHome: true,
        relativeDylibResolution: true,
        updaterArchivePreservesSymlink: true,
      },
    }),
  );
} finally {
  makeWritableForCleanup(root);
  rmSync(root, { recursive: true, force: true });
}
