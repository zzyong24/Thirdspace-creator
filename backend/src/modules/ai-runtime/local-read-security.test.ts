import { describe, it, expect } from "vitest";
import {
  sensitivePathReason,
  normalizeLocalPath,
  isProbablyBinary,
  MAX_LOCAL_READ_BYTES,
  MAX_LOCAL_DIR_ENTRIES,
} from "./local-read-security";

// [T-253] local.read 安全硬门单测 —— denylist(.env/*key*/*secret*/钥匙串/ssh)、路径归一/
// 穿越防护、二进制探测、大小上限常量。硬门与授权无关:哪怕用户点了允许,这些也拒。

describe("[T-253] sensitivePathReason — 敏感文件 denylist 硬拒", () => {
  it(".env 与 .env.* 拒读(任意段位)", () => {
    expect(sensitivePathReason("/Users/u/proj/.env")).toContain(".env");
    expect(sensitivePathReason("/Users/u/proj/.env.local")).toContain(".env");
    expect(sensitivePathReason("/Users/u/.env/notes.txt")).toContain(".env");
  });

  it("*key* / *secret* / *token* / *credential* 命名拒读", () => {
    expect(sensitivePathReason("/Users/u/api_key.txt")).toContain("key");
    expect(sensitivePathReason("/Users/u/secrets.json")).toContain("secret");
    expect(sensitivePathReason("/Users/u/github-token.md")).toContain("token");
    expect(sensitivePathReason("/Users/u/aws-credentials")).toContain("credential");
  });

  it("SSH / 钥匙串 / 云凭据目录整树拒读", () => {
    expect(sensitivePathReason("/Users/u/.ssh/id_rsa")).toContain(".ssh");
    expect(sensitivePathReason("/Users/u/Library/Keychains/login.keychain-db")).toContain(
      "Keychains",
    );
    expect(sensitivePathReason("/Users/u/.aws/config")).toContain(".aws");
    expect(sensitivePathReason("/Users/u/.gnupg/pubring.kbx")).toContain(".gnupg");
  });

  it("证书/密钥容器扩展名拒读(.pem/.p12 等)", () => {
    expect(sensitivePathReason("/Users/u/cert.pem")).toContain(".pem");
    expect(sensitivePathReason("/Users/u/identity.p12")).toContain(".p12");
  });

  it("凭据 dotfile 精确名拒读(.netrc/.npmrc)", () => {
    expect(sensitivePathReason("/Users/u/.netrc")).toContain(".netrc");
    expect(sensitivePathReason("/Users/u/.npmrc")).toContain(".npmrc");
  });

  it("普通文件放行(返回 null)", () => {
    expect(sensitivePathReason("/Users/u/Desktop/稿子.md")).toBeNull();
    expect(sensitivePathReason("/Users/u/notes/上下文工程.txt")).toBeNull();
    expect(sensitivePathReason("/Users/u/Workbase/proj/README.md")).toBeNull();
  });
});

describe("[T-253] normalizeLocalPath — 路径归一 + 穿越防护", () => {
  const HOME = "/Users/u";

  it("~ 展开到 home;~/ 前缀展开", () => {
    expect(normalizeLocalPath("~", HOME)).toBe("/Users/u");
    expect(normalizeLocalPath("~/Desktop/a.md", HOME)).toBe("/Users/u/Desktop/a.md");
  });

  it("相对路径拒绝(null)—— 不隐式挂 cwd", () => {
    expect(normalizeLocalPath("Desktop/a.md", HOME)).toBeNull();
    expect(normalizeLocalPath("./a.md", HOME)).toBeNull();
    expect(normalizeLocalPath("../a.md", HOME)).toBeNull();
    expect(normalizeLocalPath("", HOME)).toBeNull();
    expect(normalizeLocalPath("   ", HOME)).toBeNull();
  });

  it("`..` 段归一(穿越写法归一成真实目标,denylist 对归一结果生效)", () => {
    expect(normalizeLocalPath("/Users/u/safe/../.ssh/id_rsa", HOME)).toBe(
      "/Users/u/.ssh/id_rsa",
    );
    // 归一后再过 denylist → 仍拒(穿越伪装挡不住硬门)。
    expect(
      sensitivePathReason(normalizeLocalPath("/Users/u/safe/../.ssh/id_rsa", HOME)!),
    ).toContain(".ssh");
  });

  it("越过根的 `..` 停在根(不产生根之外路径)", () => {
    expect(normalizeLocalPath("/../../etc/hosts", HOME)).toBe("/etc/hosts");
  });

  it("`.` 段与重复斜杠归一", () => {
    expect(normalizeLocalPath("/Users/u/./a//b.md", HOME)).toBe("/Users/u/a/b.md");
  });
});

describe("[T-253] isProbablyBinary — 二进制探测", () => {
  it("含 NUL 字节 → 二进制", () => {
    expect(isProbablyBinary(new Uint8Array([0x50, 0x4b, 0x00, 0x04]))).toBe(true);
  });

  it("UTF-8 中文文本 → 非二进制", () => {
    expect(isProbablyBinary(new TextEncoder().encode("这是一段正常的中文笔记\n第二行"))).toBe(
      false,
    );
  });

  it("空文件 → 非二进制(0 字节文本)", () => {
    expect(isProbablyBinary(new Uint8Array())).toBe(false);
  });
});

describe("[T-253] 上限常量", () => {
  it("文本读取上限 1MB;目录 listing 上限 200 条", () => {
    expect(MAX_LOCAL_READ_BYTES).toBe(1024 * 1024);
    expect(MAX_LOCAL_DIR_ENTRIES).toBe(200);
  });
});
