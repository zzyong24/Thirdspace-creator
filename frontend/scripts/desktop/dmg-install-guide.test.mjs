import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildChannelTauriOverride } from "./tauri-package-config.mjs";

function pngSize(bytes) {
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

describe("CreatorOS macOS DMG 安装引导", () => {
  const frontendRoot = process.cwd();
  const tauriConfig = JSON.parse(
    readFileSync(join(frontendRoot, "src-tauri/tauri.conf.json"), "utf8"),
  );

  it("官方包使用与 Finder 坐标严格对应的 2× Retina 背景", () => {
    const dmg = tauriConfig.bundle.macOS.dmg;
    expect(dmg.background).toMatch(/@2x\.png$/);
    expect(dmg.appPosition).toEqual({ x: 225, y: 245 });
    expect(dmg.applicationFolderPosition).toEqual({ x: 575, y: 245 });
    expect(pngSize(readFileSync(join(frontendRoot, "src-tauri", dmg.background)))).toEqual({
      width: dmg.windowSize.width * 2,
      height: dmg.windowSize.height * 2,
    });
  });

  it("高清源图包含品牌、拖动说明和完整三步文案", () => {
    const source = readFileSync(
      join(frontendRoot, "src-tauri/dmg/creatoros-install-background.svg"),
      "utf8",
    );
    expect(source).toContain("CreatorOS · macOS 安装");
    expect(source).toContain("拖动 CreatorOS 到“应用程序”");
    expect(source).toContain("01");
    expect(source).toContain("02");
    expect(source).toContain("03");
  });

  it("渠道包显式关闭官方 CreatorOS 背景，避免安装阶段串品牌", () => {
    const override = buildChannelTauriOverride({
      manifest: {
        displayName: "测试渠道",
        binaryName: "TestChannel",
        appIdentifier: "com.example.test-channel",
      },
      icon: "/tmp/test-channel.icns",
      latestUrl: "https://updates.example.com/latest.json",
    });
    expect(override.bundle.macOS.dmg.background).toBeNull();
    expect(override.bundle.macOS.dmg.windowSize).toEqual({ width: 660, height: 400 });
    expect(override.bundle.macOS.dmg.appPosition).toEqual({ x: 180, y: 170 });
    expect(override.bundle.macOS.dmg.applicationFolderPosition).toEqual({
      x: 480,
      y: 170,
    });
    expect(override.productName).toBe("测试渠道");
  });
});
