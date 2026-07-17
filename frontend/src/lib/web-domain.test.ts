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
  isArchivedWebProfileName,
  isNestedArchivedWebProfileName,
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

// [T-378] 惰性迁移归档目录名(`.migrated-` 后缀)不是域名 —— 曾被当域名探针触发
// 「迁移→归档」增殖(`x.migrated-a.migrated-b` + DB 脏行),必须整族拒绝。
describe("isSafeWebDomain —— 归档目录名(.migrated-)必须拒绝(T-378 增殖回归)", () => {
  const archived = [
    "bing.com.migrated-1784300846731",
    "bing.com.migrated-1784300846731.migrated-1784300961712", // 嵌套(归档的归档)
    "chatgpt.com.migrated-1",
  ];
  for (const a of archived) {
    it(`拒绝: ${JSON.stringify(a)}`, () => {
      expect(isSafeWebDomain(a)).toBe(false);
    });
  }
});

describe("isArchivedWebProfileName / isNestedArchivedWebProfileName(T-378)", () => {
  it("裸域名不是归档名", () => {
    expect(isArchivedWebProfileName("bing.com")).toBe(false);
    expect(isNestedArchivedWebProfileName("bing.com")).toBe(false);
  });
  it("一层归档:是归档名、非嵌套(保留 —— 可能还有未迁移登录态)", () => {
    const one = "bing.com.migrated-1784300846731";
    expect(isArchivedWebProfileName(one)).toBe(true);
    expect(isNestedArchivedWebProfileName(one)).toBe(false);
  });
  it("嵌套归档:两者皆真(归档的归档,可清理)", () => {
    const nested = "bing.com.migrated-1784300846731.migrated-1784300961712";
    expect(isArchivedWebProfileName(nested)).toBe(true);
    expect(isNestedArchivedWebProfileName(nested)).toBe(true);
  });
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
