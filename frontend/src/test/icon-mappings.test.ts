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

const expectedPlatformLabels = {
  youtube: "YouTube",
  bilibili: "哔哩哔哩",
  douyin: "抖音",
  xiaohongshu: "小红书",
  wechatVideo: "微信视频号",
  x: "X",
} as const;

const localColorPattern = /^#[0-9a-f]{6}$/i;

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
      Object.keys(expectedPlatformLabels).sort(),
    );

    for (const [id, label] of Object.entries(expectedPlatformLabels)) {
      const entry = platformIcons[id as keyof typeof platformIcons];

      expect(Object.isFrozen(entry)).toBe(true);
      expect(entry).toMatchObject({ id, label });
      expect(entry.glyph.trim().length).toBeGreaterThan(0);
      expect(entry.background).toMatch(localColorPattern);
      expect(entry.foreground).toMatch(localColorPattern);
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
