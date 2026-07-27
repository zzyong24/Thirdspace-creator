import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  join(process.cwd(), "..", ".github", "workflows", "desktop-release.yml"),
  "utf8",
);

describe("桌面正式构建的 Runtime Image 缓存契约", () => {
  it("T-557 双端正式打包显式注入既定产品级 projectKey", () => {
    expect(workflow).toMatch(
      /name:\s*打包\(release\.mjs 全链\)[\s\S]*?CREATOROS_LICENSE_PROJECT_KEY:\s*"test"[\s\S]*?run:\s*node scripts\/desktop\/release\.mjs/,
    );
  });

  it("T-545 将产品级 projectKey 固化进统一安装包，Finder 启动不依赖终端环境", () => {
    const packageSource = readFileSync(
      join(process.cwd(), "scripts", "desktop", "package.mjs"),
      "utf8",
    );
    const buildRs = readFileSync(
      join(process.cwd(), "src-tauri", "build.rs"),
      "utf8",
    );
    const licenseRs = readFileSync(
      join(process.cwd(), "src-tauri", "src", "license.rs"),
      "utf8",
    );
    expect(packageSource).toContain("assertLicenseProjectKey()");
    expect(buildRs).toContain(
      "cargo:rerun-if-env-changed=CREATOROS_LICENSE_PROJECT_KEY",
    );
    expect(buildRs).toContain(
      "cargo:rustc-env=CREATOROS_BUILTIN_LICENSE_PROJECT_KEY",
    );
    expect(licenseRs).toContain(
      'option_env!("CREATOROS_BUILTIN_LICENSE_PROJECT_KEY")',
    );
  });

  it("所有可安装包在重活前校验 verdict 密钥对，私钥只进入 Tauri/Rust 编译", () => {
    const packageSource = readFileSync(
      join(process.cwd(), "scripts", "desktop", "package.mjs"),
      "utf8",
    );
    const releaseSource = readFileSync(
      join(process.cwd(), "scripts", "desktop", "release.mjs"),
      "utf8",
    );
    const buildRs = readFileSync(
      join(process.cwd(), "src-tauri", "build.rs"),
      "utf8",
    );
    expect(packageSource).toContain("assertVerdictKeyMaterial()");
    expect(packageSource).toContain(
      'delete childEnv.CREATOROS_VERDICT_SIGNING_KEY_B64',
    );
    expect(packageSource).toContain(
      'CREATOROS_ALLOW_VERDICT_SIGNING_KEY: "1"',
    );
    expect(releaseSource).toContain("assertVerdictKeyMaterial()");
    expect(buildRs).toContain(
      "cargo:rerun-if-env-changed=CREATOROS_VERDICT_SIGNING_KEY_B64",
    );
  });

  it("正式 runner 先精确恢复/构建并立即保存 clean runtime", () => {
    expect(workflow).toContain("actions/cache/restore@v4");
    expect(workflow).toContain("actions/cache/save@v4");
    expect(workflow).toContain("id: runtime-cache");
    expect(workflow).toContain("steps.runtime-cache.outputs.cache-hit != 'true'");
    expect(workflow).toContain("steps.runtime-cache.outputs.cache-primary-key");
    expect(workflow).not.toContain("restore-keys:");
  });

  it("缓存键隔离平台、架构、Node ABI 和所有 runtime 输入", () => {
    expect(workflow).toContain("${{ runner.os }}");
    expect(workflow).toContain("${{ runner.arch }}");
    expect(workflow).toContain("creatoros-runtime-v2-");
    expect(workflow).toContain("steps.runtime-inputs.outputs.fingerprint");
    expect(workflow).toContain("steps.runtime-inputs.outputs.pubkey");
    expect(workflow).toContain("process.versions.v8");
    expect(workflow).toContain("process.versions.modules");
    expect(workflow).not.toContain("CREATOROS_VERDICT_KEY_VERSION");
    for (const input of [
      "pnpm-lock.yaml",
      "frontend/src/**",
      "frontend/public/**",
      "ai-worker/**",
      "backend/**",
      "contract/**",
      "frontend/next.config.ts",
      "frontend/scripts/desktop/build-sidecar.mjs",
    ]) {
      expect(workflow).toContain(input);
    }
  });

  it("cache hit 后用缓存 Node 和已烘焙 verdict 公钥做二次硬校验", () => {
    expect(workflow).toContain("校验命中缓存的 Node/V8 ABI 与 verdict 公钥(T-487)");
    expect(workflow).toContain("EXPECTED_RUNTIME_FINGERPRINT");
    expect(workflow).toContain("creatoros-server-");
    expect(workflow).toContain("verdict-verify-key.json");
    expect(workflow).toContain("强制重建");
    expect(workflow).toContain(
      "steps.runtime-cache.outputs.cache-hit != 'true' || steps.runtime-abi.outputs.valid != 'true'",
    );
  });

  it("release 复用已恢复的 clean sidecar，不再重复跑 Next/闭包组装", () => {
    expect(workflow).toMatch(
      /name:\s*打包\(release\.mjs 全链\)[\s\S]*CREATOROS_SKIP_SIDECAR_REBUILD:\s*"1"/,
    );
  });

  it("clean runtime 阶段不提前压大 tar，最终变换后只由 beforeBuild 压一次", () => {
    expect(workflow).toMatch(
      /name:\s*构建 clean Runtime Image[\s\S]*CREATOROS_SKIP_TARBALL:\s*"1"/,
    );
    const packageSource = readFileSync(
      join(process.cwd(), "scripts", "desktop", "package.mjs"),
      "utf8",
    );
    const buildSource = readFileSync(
      join(process.cwd(), "scripts", "desktop", "build-sidecar.mjs"),
      "utf8",
    );
    expect(packageSource).toContain('{ CREATOROS_SKIP_TARBALL: "1" }');
    expect(buildSource).toContain('process.env.CREATOROS_SKIP_TARBALL !== "1"');
  });

  it("本地 release-fast 与正式 release 的最终产物自检读取各自 profile", () => {
    const packageSource = readFileSync(
      join(process.cwd(), "scripts", "desktop", "package.mjs"),
      "utf8",
    );
    expect(packageSource).toContain(
      'process.env.CREATOROS_RELEASE === "1" ? "release" : "release-fast"',
    );
    expect(packageSource).toMatch(
      /const app = join\([\s\S]*CARGO_PROFILE_DIR,[\s\S]*"bundle",[\s\S]*"macos"/,
    );
    expect(packageSource).not.toContain(
      'join(FRONTEND, "src-tauri", "target", "release", "bundle", "macos", "CreatorOS.app")',
    );
  });

  it("Windows 上传产物前真执行 NSIS 安装期 runtime 冒烟", () => {
    expect(workflow).toContain("Windows 安装期 runtime 原生冒烟(T-487)");
    expect(workflow).toContain('Start-Process -FilePath $setup.FullName');
    expect(workflow).toContain("runtime-current.txt");
    expect(workflow).toContain("runtime-images/$runtimeId/sidecar/frontend/server.js");
    expect(workflow).toContain('Test-Path (Join-Path $installDir "sidecar.tar.gz")');
    expect(workflow).toContain("CreatorOS RAT02 Space");
    expect(workflow).toContain('$uninstaller = Join-Path $installDir "uninstall.exe"');
    expect(workflow).toContain("主动卸载后仍残留 runtime-images");
  });
});
