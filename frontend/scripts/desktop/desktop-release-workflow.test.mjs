import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  join(process.cwd(), "..", ".github", "workflows", "desktop-release.yml"),
  "utf8",
);

describe("桌面正式构建的 Runtime Image 缓存契约", () => {
  it("T-575 使用唯一测试版号，不覆盖 0.2.0 公共更新清单", () => {
    const frontendPackage = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    );
    const tauriConfig = JSON.parse(
      readFileSync(join(process.cwd(), "src-tauri", "tauri.conf.json"), "utf8"),
    );
    const cargoToml = readFileSync(
      join(process.cwd(), "src-tauri", "Cargo.toml"),
      "utf8",
    );
    expect(frontendPackage.version).toBe("0.2.1-beta.2");
    expect(tauriConfig.version).toBe("0.2.1-beta.2");
    expect(cargoToml).toContain('version = "0.2.1-beta.2"');
    expect(workflow).not.toContain("sites/creatoros/updates/latest.json");
  });

  it("草稿 Release 在无需 checkout 的 job 中显式绑定当前仓库", () => {
    expect(workflow).toContain(
      'gh release view "$tag" --repo "$GITHUB_REPOSITORY"',
    );
    expect(workflow).toContain(
      'gh release create "$tag" --repo "$GITHUB_REPOSITORY"',
    );
    expect(workflow).toContain(
      'gh release upload "$tag" artifacts/* --repo "$GITHUB_REPOSITORY" --clobber',
    );
  });

  it("tag 测试发行默认只构建 macOS，Windows 必须手动显式选择", () => {
    expect(workflow).toContain('options: ["macos", "windows", "all"]');
    expect(workflow).toContain('default: "macos"');
    expect(workflow).toContain('if [ "$ONLY" = "all" ]');
    expect(workflow).toContain('elif [ "$ONLY" = "windows" ]');
    expect(workflow).toContain(
      `jq -c '[.[]|select(.os|contains("macos"))]'`,
    );
  });

  it("T-575 remote sidecar ACL 放行领取命令，并与 invoke handler 同名", () => {
    const buildRs = readFileSync(
      join(process.cwd(), "src-tauri", "build.rs"),
      "utf8",
    );
    const capability = JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          "src-tauri",
          "capabilities",
          "remote-sidecar.json",
        ),
        "utf8",
      ),
    );
    for (const command of [
      "entitlement_claim_start",
      "entitlement_claim_poll",
      "entitlement_claim_resume",
    ]) {
      expect(buildRs).toContain(`"${command}"`);
      expect(capability.permissions).toContain(
        `allow-${command.replaceAll("_", "-")}`,
      );
    }
  });

  it("T-575 测试发布显式开启领取/反馈，普通 build 仍由 Next 配置归零", () => {
    const nextConfig = readFileSync(
      join(process.cwd(), "next.config.ts"),
      "utf8",
    );
    expect(workflow).toMatch(
      /name:\s*构建 clean Runtime Image[\s\S]*?GROWTH_ENTITLEMENT_API_ORIGIN:\s*"https:\/\/growth\.aitongban\.cloud"[\s\S]*?CREATOROS_ENTITLEMENT_CLAIM_ENABLED:\s*"1"[\s\S]*?CREATOROS_PRODUCT_FEEDBACK_SUBMIT_ENABLED:\s*"1"/,
    );
    expect(workflow).toMatch(
      /name:\s*打包\(release\.mjs 全链\)[\s\S]*?GROWTH_ENTITLEMENT_API_ORIGIN:\s*"https:\/\/growth\.aitongban\.cloud"[\s\S]*?CREATOROS_ENTITLEMENT_CLAIM_ENABLED:\s*"1"[\s\S]*?CREATOROS_PRODUCT_FEEDBACK_SUBMIT_ENABLED:\s*"1"/,
    );
    expect(workflow).toContain("steps.runtime-inputs.outputs.config");
    expect(nextConfig).toContain(
      'return value?.trim() === "1" ? "1" : "0"',
    );
    expect(nextConfig).toContain(
      "NEXT_PUBLIC_CREATOROS_PRODUCT_FEEDBACK_SUBMIT_ENABLED:",
    );
    expect(nextConfig).toContain("desktopFeedbackSubmitEnabled");
  });

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
    const sidecarSource = readFileSync(
      join(process.cwd(), "scripts", "desktop", "build-sidecar.mjs"),
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
    expect(sidecarSource).toContain("assertVerdictPublicKey()");
    expect(sidecarSource).not.toContain("assertVerdictKeyMaterial()");
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

  it("Windows 上传产物前执行安装冒烟，上传后执行卸载冒烟", () => {
    expect(workflow).toContain("Windows 安装期 runtime 原生冒烟(T-487)");
    expect(workflow).toContain('Start-Process -FilePath $setup.FullName');
    expect(workflow).toContain("runtime-current.txt");
    expect(workflow).toContain("runtime-images/$runtimeId/sidecar/frontend/server.js");
    expect(workflow).toContain('Test-Path (Join-Path $installDir "sidecar.tar.gz")');
    expect(workflow).toContain("CreatorOS RAT02 Space");
    expect(workflow).toContain("Windows 主动卸载清理冒烟(T-557)");
    expect(workflow).toContain('$uninstaller = Join-Path $installDir "uninstall.exe"');
    expect(workflow).toContain("主动卸载后仍残留 runtime-images");
    expect(workflow.indexOf("Windows 安装期 runtime 原生冒烟(T-487)")).toBeLessThan(
      workflow.indexOf("actions/upload-artifact@v4"),
    );
    expect(workflow.indexOf("actions/upload-artifact@v4")).toBeLessThan(
      workflow.indexOf("Windows 主动卸载清理冒烟(T-557)"),
    );
  });

  it("Windows 上传后真启动 GUI，并等待 WebView 主页面完成加载", () => {
    expect(workflow).toContain("Windows 安装后真启动与主页面加载冒烟(T-562)");
    expect(workflow).toContain('$appExe = Join-Path $installDir "CreatorOS.exe"');
    expect(workflow).toContain("MAIN_PAGE_LOAD_FINISHED");
    expect(workflow).toContain("-RedirectStandardError");
    expect(workflow).toContain("CloseMainWindow()");
    expect(workflow.indexOf("actions/upload-artifact@v4")).toBeLessThan(
      workflow.indexOf("Windows 安装后真启动与主页面加载冒烟(T-562)"),
    );
  });

  it("T-565 候选包必须真安装、断网首启、读取 WebView DOM，通过后才上传 setup", () => {
    const shellSource = readFileSync(
      join(process.cwd(), "src-tauri", "src", "lib.rs"),
      "utf8",
    );
    const packageRat = workflow.slice(
      workflow.indexOf("windows-closure-rat:"),
      workflow.indexOf("draft-release:"),
    );
    expect(packageRat).toContain("windows_package_rat");
    expect(packageRat).toContain("prepare-packaged-runtime.mjs");
    expect(packageRat).toContain("构建真实 NSIS 候选包（不发布）");
    expect(packageRat).toContain("New-NetFirewallRule");
    expect(packageRat).toContain("MAIN_PAGE_LOAD_FINISHED");
    expect(packageRat).toContain("inspect-installed-webview.mjs");
    expect(packageRat).toContain("runtimeFilesChangedOnFirstLaunch");
    expect(packageRat).toContain("runtimeFilesChangedSample");
    expect(packageRat).toContain("[Net.Sockets.TcpListener]::new");
    expect(packageRat).toContain("webviewDebugArgumentProcesses");
    expect(packageRat).toContain(
      "WebView2 子进程未收到 remote-debugging-port",
    );
    expect(packageRat).toContain('"node_modules"');
    expect(shellSource).toContain(
      'std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS")',
    );
    expect(shellSource).toContain(".additional_browser_args(&browser_args)");
    const nextConfigSource = readFileSync(
      join(process.cwd(), "next.config.ts"),
      "utf8",
    );
    expect(nextConfigSource).toContain("isrFlushToDisk: false");
    expect(packageRat).not.toContain("dist-upload");
    expect(packageRat).toContain(
      "上传已通过真安装验证的 Windows 候选包",
    );
    expect(packageRat).toContain(
      "if: ${{ success() && inputs.windows_package_rat == true }}",
    );
    expect(packageRat).toContain(
      "path: frontend/src-tauri/target/release-fast/bundle/nsis/*-setup.exe",
    );
    expect(
      packageRat.indexOf("真安装、断网首启与 WebView 非白屏验证"),
    ).toBeLessThan(
      packageRat.indexOf("上传已通过真安装验证的 Windows 候选包"),
    );
  });

  it("T-565 Windows 候选包与 macOS 正式 build 可在同一提交并行验证", () => {
    expect(workflow).toContain(
      "测试发行平台（默认 macOS；Windows/双端必须手动显式选择；RAT job 不受此项影响）",
    );
    const combinedRunCondition =
      "(inputs.windows_package_rat == true && inputs.only == 'macos')";
    expect(workflow.split(combinedRunCondition)).toHaveLength(3);
    expect(workflow).toContain(
      'select(.os|contains(\\"$ONLY\\"))',
    );
  });
});
