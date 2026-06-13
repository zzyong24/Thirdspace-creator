import { describe, expect, test } from "vitest";
import { creatorIcons } from "@/lib/icons";
import {
  getPlatformIcon,
  platformIcons,
  unknownPlatformIcon,
} from "@/lib/platform-icons";

const requiredCreatorIconKeys = [
  "dashboard",
  "projects",
  "knowledge",
  "assets",
  "publishing",
  "experience",
  "settings",
  "search",
  "notifications",
  "add",
  "more",
  "share",
  "edit",
  "filter",
  "sort",
  "chevronRight",
  "close",
  "check",
  "sparkles",
] as const;

const expectedPlatforms = {
  youtube: {
    label: "YouTube",
    background: "#ff0033",
    foreground: "#ffffff",
  },
  bilibili: {
    label: "哔哩哔哩",
    background: "#fb65a2",
    foreground: "#ffffff",
  },
  douyin: {
    label: "抖音",
    background: "#000000",
    foreground: "#ffffff",
  },
  xiaohongshu: {
    label: "小红书",
    background: "#ff2442",
    foreground: "#ffffff",
  },
  wechatVideo: {
    label: "微信视频号",
    background: "#fe860b",
    foreground: "#ffffff",
  },
  x: {
    label: "X",
    background: "#000000",
    foreground: "#ffffff",
  },
} as const;

describe("CreatorOS semantic icons", () => {
  test("provides every approved semantic key from a frozen mapping", () => {
    expect(Object.isFrozen(creatorIcons)).toBe(true);
    expect(Object.keys(creatorIcons).sort()).toEqual(
      [...requiredCreatorIconKeys].sort(),
    );

    for (const key of requiredCreatorIconKeys) {
      expect(creatorIcons[key]).toBeDefined();
    }
  });
});

describe("CreatorOS platform icons", () => {
  test("provides frozen deterministic local platform metadata", () => {
    expect(Object.isFrozen(platformIcons)).toBe(true);
    expect(Object.keys(platformIcons).sort()).toEqual(
      Object.keys(expectedPlatforms).sort(),
    );

    for (const [id, expected] of Object.entries(expectedPlatforms)) {
      const entry = platformIcons[id as keyof typeof platformIcons];

      expect(Object.isFrozen(entry)).toBe(true);
      expect(entry).toMatchObject({ id, ...expected });
      expect(entry.glyph.trim().length).toBeGreaterThan(0);
      expect(JSON.stringify(entry)).not.toMatch(/https?:\/\//);
    }
  });

  test("returns a frozen unknown fallback for unsupported values", () => {
    expect(Object.isFrozen(unknownPlatformIcon)).toBe(true);
    expect(unknownPlatformIcon).toMatchObject({
      id: "unknown",
      label: "未知平台",
      glyph: "?",
    });
    expect(getPlatformIcon("unsupported-platform")).toBe(unknownPlatformIcon);
    expect(getPlatformIcon("youtube")).toBe(platformIcons.youtube);
  });
});
