import * as path from "node:path";
import { describe, expect, it } from "vitest";

import {
  RESET_CONFIRM_WORD,
  RESET_PENDING_MARKER,
  checkConfirmWord,
  isLoopbackHost,
  resetPendingMarkerPath,
  resolveAppDataDir,
} from "./plan";

// [T-332 S5] 「重置工作区」纯逻辑:目录解析 / 确认词 / loopback 判定。

describe("resolveAppDataDir", () => {
  it("优先使用壳层直接注入的 canonical appDataDir", () => {
    expect(
      resolveAppDataDir({
        CREATOROS_APP_DATA_DIR: "/canonical/app",
        CREATOROS_DB_DIR: "/wrong/db",
      }),
    ).toBe("/canonical/app");
  });

  it("CREATOROS_DB_DIR 的父级 = appDataDir", () => {
    expect(resolveAppDataDir({ CREATOROS_DB_DIR: "/data/app/db" })).toBe(
      path.join("/data", "app"),
    );
  });

  it("未注入(web / dev)→ null", () => {
    expect(resolveAppDataDir({})).toBeNull();
  });

  it("空白值当作未设置", () => {
    expect(resolveAppDataDir({ CREATOROS_DB_DIR: "   " })).toBeNull();
  });
});

describe("resetPendingMarkerPath", () => {
  it("标记文件落 appDataDir 顶层(与 Rust 侧 RESET_MARKER_FILE 同名)", () => {
    expect(resetPendingMarkerPath("/data/app")).toBe(
      path.join("/data/app", RESET_PENDING_MARKER),
    );
    expect(RESET_PENDING_MARKER).toBe("reset-pending.json");
  });
});

describe("checkConfirmWord", () => {
  it("逐字匹配确认词 → 通过", () => {
    expect(checkConfirmWord(RESET_CONFIRM_WORD)).toEqual({ ok: true });
  });

  it("前后空白容忍(输入框提交常带空格)", () => {
    expect(checkConfirmWord(`  ${RESET_CONFIRM_WORD} `)).toEqual({ ok: true });
  });

  it("错词 → 400 + 可读文案", () => {
    const r = checkConfirmWord("确认");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.error).toContain(RESET_CONFIRM_WORD);
    }
  });

  it("非字符串(undefined / 数字)→ 400", () => {
    expect(checkConfirmWord(undefined).ok).toBe(false);
    expect(checkConfirmWord(42).ok).toBe(false);
  });
});

describe("isLoopbackHost", () => {
  it("127.0.0.1(带/不带端口)→ 放行", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("127.0.0.1:41730")).toBe(true);
  });

  it("localhost(含大写)→ 放行", () => {
    expect(isLoopbackHost("localhost:3000")).toBe(true);
    expect(isLoopbackHost("LOCALHOST")).toBe(true);
  });

  it("IPv6 回环 [::1] → 放行", () => {
    expect(isLoopbackHost("[::1]")).toBe(true);
    expect(isLoopbackHost("[::1]:8080")).toBe(true);
  });

  it("局域网/公网 Host → 拒", () => {
    expect(isLoopbackHost("192.168.1.5:3000")).toBe(false);
    expect(isLoopbackHost("evil.example.com")).toBe(false);
    // 127.0.0.1 出现在别人域名前缀里也不能骗过(剥端口后整串比对)。
    expect(isLoopbackHost("127.0.0.1.evil.com")).toBe(false);
  });

  it("Host 缺失/空白 → 拒(fail closed)", () => {
    expect(isLoopbackHost(null)).toBe(false);
    expect(isLoopbackHost("   ")).toBe(false);
  });
});
