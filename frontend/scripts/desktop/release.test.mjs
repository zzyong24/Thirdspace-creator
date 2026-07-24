// [T-326 ENG-H03] release.mjs updater base URL 解析/校验单测。
// 覆盖:缺失硬失败、显式 opt-out 占位、https 强制、非法 URL、OWNER/REPO 残留、合法 URL 归一化。
// (buildLatestJson 纯函数一并覆盖,保 latest.json 结构与 Tauri updater 约定一致。)

import { describe, it, expect } from "vitest";
import {
  resolveUpdateBaseUrl,
  buildLatestJson,
  mergeLatestJson,
  updaterArtifactFileName,
  validateLatestJson,
} from "./release.mjs";

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

describe("updaterArtifactFileName(跨平台 updater 文件名)", () => {
  it("从 Windows runner 绝对路径提取纯文件名", () => {
    expect(
      updaterArtifactFileName(
        "D:\\a\\Thirdspace-creator\\Thirdspace-creator\\frontend\\src-tauri\\target\\release\\bundle\\nsis\\CreatorOS_0.1.0_x64-setup.exe",
      ),
    ).toBe("CreatorOS_0.1.0_x64-setup.exe");
  });

  it("从 POSIX 绝对路径提取纯文件名", () => {
    expect(
      updaterArtifactFileName(
        "/Users/runner/work/Thirdspace-creator/frontend/src-tauri/target/release/bundle/macos/CreatorOS.app.tar.gz",
      ),
    ).toBe("CreatorOS.app.tar.gz");
  });
});

describe("validateLatestJson(updater 下载地址门禁)", () => {
  it("拒绝混入 Windows runner 绝对路径的 URL", () => {
    const latest = buildLatestJson({
      version: "0.1.0",
      signature: "sig",
      url: "https://github.com/acme/app/releases/download/v0.1.0/D:\\a\\repo\\CreatorOS-setup.exe",
      target: "windows-x86_64",
    });
    expect(validateLatestJson(latest)).toEqual({
      ok: false,
      error: expect.stringMatching(/windows-x86_64.*反斜杠/),
    });
  });

  it("接受双平台 HTTPS 纯文件名 URL", () => {
    const latest = mergeLatestJson(
      buildLatestJson({
        version: "0.1.0",
        signature: "mac-sig",
        url: "https://github.com/acme/app/releases/download/v0.1.0/CreatorOS.app.tar.gz",
        target: "darwin-aarch64",
      }),
      buildLatestJson({
        version: "0.1.0",
        signature: "win-sig",
        url: "https://github.com/acme/app/releases/download/v0.1.0/CreatorOS_0.1.0_x64-setup.exe",
        target: "windows-x86_64",
      }),
    );
    expect(validateLatestJson(latest)).toEqual({ ok: true });
  });
});

// [T-372 W-core §11.2-5] 双端 latest.json 合并:同版本 platforms 并存,不再互相覆盖。
describe("mergeLatestJson(双端 platforms 合并)", () => {
  const mac = buildLatestJson({
    version: "1.2.3",
    signature: "mac-sig",
    url: "https://cdn.example.com/CreatorOS.app.tar.gz",
    pubDate: "2026-07-17T00:00:00.000Z",
    target: "darwin-aarch64",
  });
  const win = buildLatestJson({
    version: "1.2.3",
    signature: "win-sig",
    url: "https://cdn.example.com/CreatorOS-setup.nsis.zip",
    pubDate: "2026-07-17T01:00:00.000Z",
    target: "windows-x86_64",
  });

  it("无已存在文件 → 恒等返回(单平台打包行为零变化)", () => {
    expect(mergeLatestJson(null, mac)).toEqual(mac);
  });

  it("同版本 → platforms 键合并,双端并存(Win 后打不覆盖 mac)", () => {
    const merged = mergeLatestJson(mac, win);
    expect(merged.version).toBe("1.2.3");
    expect(merged.platforms).toEqual({
      "darwin-aarch64": { signature: "mac-sig", url: "https://cdn.example.com/CreatorOS.app.tar.gz" },
      "windows-x86_64": { signature: "win-sig", url: "https://cdn.example.com/CreatorOS-setup.nsis.zip" },
    });
  });

  it("同版本同平台重打 → 新产物覆盖同键(重出包更新签名/URL)", () => {
    const macAgain = buildLatestJson({
      version: "1.2.3",
      signature: "mac-sig-v2",
      url: "https://cdn.example.com/CreatorOS-2.app.tar.gz",
      target: "darwin-aarch64",
    });
    const merged = mergeLatestJson(mac, macAgain);
    expect(merged.platforms["darwin-aarch64"].signature).toBe("mac-sig-v2");
  });

  it("版本不同 → 整体替换(旧版本 platforms 不混入新版本元数据)", () => {
    const next = buildLatestJson({
      version: "1.3.0",
      signature: "new-sig",
      url: "https://cdn.example.com/next.app.tar.gz",
      target: "darwin-aarch64",
    });
    const merged = mergeLatestJson(win, next);
    expect(merged.version).toBe("1.3.0");
    expect(merged.platforms).toEqual({
      "darwin-aarch64": { signature: "new-sig", url: "https://cdn.example.com/next.app.tar.gz" },
    });
  });

  it("已存在文件损坏(非对象)→ 按全新生成处理", () => {
    expect(mergeLatestJson("garbage", mac)).toEqual(mac);
  });
});
