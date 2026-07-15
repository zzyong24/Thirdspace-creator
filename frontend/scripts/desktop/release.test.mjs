// [T-326 ENG-H03] release.mjs updater base URL 解析/校验单测。
// 覆盖:缺失硬失败、显式 opt-out 占位、https 强制、非法 URL、OWNER/REPO 残留、合法 URL 归一化。
// (buildLatestJson 纯函数一并覆盖,保 latest.json 结构与 Tauri updater 约定一致。)

import { describe, it, expect } from "vitest";
import { resolveUpdateBaseUrl, buildLatestJson } from "./release.mjs";

describe("resolveUpdateBaseUrl(ENG-H03:占位/缺失硬失败)", () => {
  it("未设 CREATOROS_UPDATE_BASE_URL → 失败(不再默认占位成功)", () => {
    const r = resolveUpdateBaseUrl({}, "1.2.3");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/CREATOROS_UPDATE_BASE_URL/);
    expect(r.error).toMatch(/CREATOROS_UPDATE_ALLOW_PLACEHOLDER=1/);
  });

  it("空白字符串等同未设 → 失败", () => {
    const r = resolveUpdateBaseUrl({ CREATOROS_UPDATE_BASE_URL: "   " }, "1.2.3");
    expect(r.ok).toBe(false);
  });

  it("未设 + CREATOROS_UPDATE_ALLOW_PLACEHOLDER=1 → 占位放行且标记 placeholder", () => {
    const r = resolveUpdateBaseUrl({ CREATOROS_UPDATE_ALLOW_PLACEHOLDER: "1" }, "1.2.3");
    expect(r.ok).toBe(true);
    expect(r.placeholder).toBe(true);
    expect(r.baseUrl).toBe("https://github.com/OWNER/REPO/releases/download/v1.2.3");
  });

  it("opt-out 值不是字面 '1' → 不放行", () => {
    const r = resolveUpdateBaseUrl({ CREATOROS_UPDATE_ALLOW_PLACEHOLDER: "true" }, "1.2.3");
    expect(r.ok).toBe(false);
  });

  it("显式设置的非法值不被 opt-out 放行(opt-out 只覆盖缺失场景)", () => {
    const r = resolveUpdateBaseUrl(
      {
        CREATOROS_UPDATE_BASE_URL: "http://cdn.example.com/updates",
        CREATOROS_UPDATE_ALLOW_PLACEHOLDER: "1",
      },
      "1.2.3",
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/https/);
  });

  it("非 https 协议 → 失败", () => {
    const r = resolveUpdateBaseUrl(
      { CREATOROS_UPDATE_BASE_URL: "http://github.com/me/app/releases/download/v1.2.3" },
      "1.2.3",
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/https/);
  });

  it("不是 URL 的字符串 → 失败", () => {
    const r = resolveUpdateBaseUrl({ CREATOROS_UPDATE_BASE_URL: "not a url" }, "1.2.3");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/不是合法 URL/);
  });

  it("残留 OWNER/REPO 占位段 → 失败", () => {
    for (const bad of [
      "https://github.com/OWNER/REPO/releases/download/v1.2.3",
      "https://github.com/OWNER/my-app/releases/download/v1.2.3",
      "https://github.com/me/REPO/releases/download/v1.2.3",
    ]) {
      const r = resolveUpdateBaseUrl({ CREATOROS_UPDATE_BASE_URL: bad }, "1.2.3");
      expect(r.ok, bad).toBe(false);
      expect(r.error).toMatch(/OWNER\/REPO 占位/);
    }
  });

  it("真实小写 owner/repo 不误伤(路径段级检查,非子串)", () => {
    const r = resolveUpdateBaseUrl(
      { CREATOROS_UPDATE_BASE_URL: "https://github.com/owner/repo/releases/download/v1.2.3" },
      "1.2.3",
    );
    expect(r.ok).toBe(true);
    expect(r.placeholder).toBe(false);
  });

  it("合法 https URL → 通过并去尾斜杠", () => {
    const r = resolveUpdateBaseUrl(
      { CREATOROS_UPDATE_BASE_URL: "https://updates.creatoros.example/v1.2.3/" },
      "1.2.3",
    );
    expect(r.ok).toBe(true);
    expect(r.placeholder).toBe(false);
    expect(r.baseUrl).toBe("https://updates.creatoros.example/v1.2.3");
  });

  it("R2/CDN 式自定义域也通过", () => {
    const r = resolveUpdateBaseUrl(
      { CREATOROS_UPDATE_BASE_URL: "https://cdn.example.com/creatoros/releases" },
      "9.9.9",
    );
    expect(r.ok).toBe(true);
  });
});

describe("buildLatestJson(latest.json 结构)", () => {
  it("产出 Tauri updater 约定的结构", () => {
    const j = buildLatestJson({
      version: "1.2.3",
      signature: "sig==",
      url: "https://cdn.example.com/app.tar.gz",
      pubDate: "2026-07-15T00:00:00.000Z",
      target: "darwin-aarch64",
    });
    expect(j).toEqual({
      version: "1.2.3",
      notes: "",
      pub_date: "2026-07-15T00:00:00.000Z",
      platforms: {
        "darwin-aarch64": { signature: "sig==", url: "https://cdn.example.com/app.tar.gz" },
      },
    });
  });
});
