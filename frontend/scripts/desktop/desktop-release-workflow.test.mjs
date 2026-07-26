import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  join(process.cwd(), "..", ".github", "workflows", "desktop-release.yml"),
  "utf8",
);

describe("桌面正式构建的 Runtime Image 缓存契约", () => {
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
