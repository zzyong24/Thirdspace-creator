import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(process.cwd(), "..");
const workflow = readFileSync(
  join(repoRoot, ".github", "workflows", "channel-package.yml"),
  "utf8",
);
const packageChannel = readFileSync(
  join(process.cwd(), "scripts", "desktop", "package-channel.mjs"),
  "utf8",
);

describe("T-753 可复用渠道 GitHub 正式构建契约", () => {
  it("只允许手动选择已提交 packageRef，不接收任意 manifest 路径", () => {
    expect(workflow).toContain("name: channel-package");
    expect(workflow).toMatch(/workflow_dispatch:[\s\S]*?package_ref:/);
    expect(workflow).toMatch(/options: \["macos", "windows", "all"\]/);
    expect(workflow).not.toMatch(/\n\s*push:/);
    expect(workflow).not.toMatch(/inputs:\s*[\s\S]*?manifest:/);
    expect(workflow).toContain(
      "frontend/branding/packages/${PACKAGE_REF}/package.json",
    );
    expect(workflow).toContain("git diff --quiet HEAD -- \"$package_dir\"");
  });

  it("双端复用同一渠道入口并强制正式 profile", () => {
    expect(workflow).toContain("desktop:package-channel");
    expect(workflow).toContain("--mode release");
    expect(workflow).toContain("CREATOROS_RELEASE: \"1\"");
    expect(workflow).toContain('"macos-aarch64"');
    expect(workflow).toContain('"windows-x86_64"');
    expect(workflow).toMatch(
      /name: 构建渠道正式安装包[\s\S]*?run: \|\n\s+pnpm desktop:package-channel -- \\/,
    );
    expect(workflow).not.toContain("version=$(node -p");
    expect(workflow).toContain(
      "appendFileSync(process.env.GITHUB_OUTPUT",
    );
  });

  it("Windows closure 消费 plan-only 生成的同一品牌输入并上传非视觉闭包证明", () => {
    expect(packageChannel).toContain("package-brand-build-input.json");
    expect(workflow).toContain("CREATOROS_PACKAGE_BRAND_INPUT_PATH");
    expect(workflow).toContain("package-brand-closure-proof.json");
    expect(workflow).not.toContain("NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_NAME: 智溯AI");
  });

  it("macOS 缺签名凭据必须失败，并验证公证、staple 与 Gatekeeper", () => {
    for (const name of [
      "APPLE_CERTIFICATE_P12_B64",
      "APPLE_CERTIFICATE_PASSWORD",
      "APPLE_ID",
      "APPLE_APP_PASSWORD",
      "APPLE_TEAM_ID",
      "APPLE_SIGNING_IDENTITY",
    ]) {
      expect(workflow).toContain(name);
    }
    expect(workflow).toContain("codesign --verify --deep --strict");
    expect(workflow).toContain("xcrun stapler validate");
    expect(workflow).toContain("spctl -a -vv");
  });

  it("Windows 未签名边界必须写进机器证据，且不使用 45 秒硬失败", () => {
    expect(workflow).toMatch(
      /windowsAuthenticode\s*=\s*"unsigned-accepted-risk"/,
    );
    expect(workflow).not.toMatch(/TotalSeconds\s+-gt\s+45[\s\S]*?throw/);
  });

  it("只上传 Actions artifact，不创建 tag、Release 或修改线上配置", () => {
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).not.toContain("gh release");
    expect(workflow).not.toContain("softprops/action-gh-release");
    expect(workflow).not.toContain("latestVersion");
    expect(workflow).not.toContain("downloadUrl");
  });

  it("渠道预检不再把 release 请求伪造成已签名事实", () => {
    expect(packageChannel).not.toContain('signed: mode === "release"');
    expect(packageChannel).toContain('releaseRequested: mode === "release"');
    expect(packageChannel).toContain(
      'CREATOROS_RELEASE: mode === "release" ? "1" : "0"',
    );
    expect(packageChannel).toContain("releaseManifest.codesign ?? null");
    expect(packageChannel).toContain("releaseManifest.notarize ?? null");
  });
});
