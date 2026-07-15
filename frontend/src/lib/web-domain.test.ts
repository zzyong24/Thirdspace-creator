/**
 * [B-01] Web Session domain 白名单校验单测 —— 覆盖架构师审计给出的全部路径穿越攻击向量。
 * 目的:证明 `domain` 白名单(纵深防御第①层)拒绝一切能逃出 `.auth/web/<domain>` 的输入,
 * 只放行合法 hostname。
 */
import { describe, it, expect } from "vitest";
import {
  isSafeWebDomain,
  assertSafeWebDomain,
  normalizeWebDomain,
  WebDomainError,
} from "./web-domain";

describe("isSafeWebDomain —— 路径穿越攻击向量必须全拒", () => {
  const attacks = [
    "",
    " ",
    "..",
    "../..",
    "../../..",
    "..\\",
    "..\\..\\",
    "....//",
    "....//....//",
    "%2e%2e%2f", // 编码 ../
    "%2e%2e/", //   半编码
    "%2f", //        编码 /
    "..%2f..",
    "/etc/passwd", // 绝对路径(POSIX)
    "/", //          根
    "C:\\Windows", // 绝对路径(Windows 盘符)
    "c:", //         盘符
    "foo/bar", //    含分隔符
    "foo\\bar",
    ".hidden", //    前导点(可指向隐藏项 / 破坏归一)
    "-flag", //      前导连字符
    "a/../../b", //  夹带上跳
    "chatgpt.com/../../secret",
    "domain\u0000.com", // NUL 注入
    "domain .com", //     内嵌空格
    "a".repeat(300), //     超长(>253)
  ];
  for (const a of attacks) {
    it(`拒绝: ${JSON.stringify(a)}`, () => {
      expect(isSafeWebDomain(a)).toBe(false);
    });
  }
});

describe("isSafeWebDomain —— 合法 hostname 必须放行", () => {
  const legit = [
    "chatgpt.com",
    "www.zhihu.com",
    "sub.domain.co.uk",
    "example.org",
    "a.b.c.d.e.f",
    "xn--fiqs8s.com", // punycode(中文域名编码后)
    "localhost",
    "127.0.0.1", // 纯数字点分也合法(用作目录名安全)
    "CHATGPT.COM", // 大写 → 归一小写后合法
  ];
  for (const d of legit) {
    it(`放行: ${JSON.stringify(d)}`, () => {
      expect(isSafeWebDomain(d)).toBe(true);
    });
  }
});

describe("assertSafeWebDomain —— 合法归一 / 非法抛 WebDomainError", () => {
  it("合法域名返回归一(trim+lowercase)结果", () => {
    expect(assertSafeWebDomain("  ChatGPT.com ")).toBe("chatgpt.com");
  });
  it("路径穿越抛 WebDomainError", () => {
    expect(() => assertSafeWebDomain("../..")).toThrow(WebDomainError);
  });
  it("normalizeWebDomain 只做 trim+lowercase(不改结构)", () => {
    expect(normalizeWebDomain("  Foo.Bar.COM  ")).toBe("foo.bar.com");
  });
});
