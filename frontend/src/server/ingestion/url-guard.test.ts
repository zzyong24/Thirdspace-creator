import { describe, it, expect, vi } from "vitest";
import {
  UrlBlockedError,
  assertUrlAllowed,
  blockedIpReason,
  collectRedirectChainUrls,
  type LookupFn,
} from "./url-guard";

// [T-326·RT-H04] SSRF URL 守卫单测 —— 阻断矩阵逐类一例 + 合法公网放行 + DNS 语义 + 重定向链收集。
// lookup 全部注入 fake,不打真 DNS(单测确定性)。

/** 造一个固定解析结果的 lookup(公网 IP 缺省)。 */
function fakeLookup(addresses: string[] = ["93.184.216.34"]): LookupFn {
  return async () => addresses.map((address) => ({ address }));
}

/** 断言某 URL 被守卫拒绝,且原因含关键字。 */
async function expectBlocked(url: string, reasonHint: string, lookup?: LookupFn) {
  await expect(
    assertUrlAllowed(url, { lookup: lookup ?? fakeLookup() }),
  ).rejects.toThrowError(UrlBlockedError);
  await expect(
    assertUrlAllowed(url, { lookup: lookup ?? fakeLookup() }),
  ).rejects.toThrow(reasonHint);
}

describe("assertUrlAllowed — 协议白名单", () => {
  it("http/https 放行(公网解析)", async () => {
    await expect(
      assertUrlAllowed("https://example.com/post", { lookup: fakeLookup() }),
    ).resolves.toBeUndefined();
    await expect(
      assertUrlAllowed("http://example.com/", { lookup: fakeLookup() }),
    ).resolves.toBeUndefined();
  });

  it("file:/ftp:/javascript: 等非 http(s) 协议 → 拒", async () => {
    await expectBlocked("file:///etc/passwd", "只支持 http/https");
    await expectBlocked("ftp://example.com/x", "只支持 http/https");
  });

  it("不是合法 URL → 拒(人话)", async () => {
    await expectBlocked("not a url", "不是合法的 URL");
  });
});

describe("assertUrlAllowed — IP 字面量阻断矩阵(每类一例)", () => {
  it("回环 127.0.0.1 → 拒", async () => {
    await expectBlocked("http://127.0.0.1/admin", "回环");
  });
  it("回环 IPv6 [::1] → 拒", async () => {
    await expectBlocked("http://[::1]:8080/", "回环");
  });
  it("私网 10.0.0.5 → 拒", async () => {
    await expectBlocked("http://10.0.0.5/", "10.0.0.0/8");
  });
  it("私网 172.16.0.1(段内)→ 拒;172.32.0.1(段外)不按私网拒", async () => {
    await expectBlocked("http://172.16.0.1/", "172.16.0.0/12");
    await expect(
      assertUrlAllowed("http://172.32.0.1/", { lookup: fakeLookup() }),
    ).resolves.toBeUndefined(); // 172.32/12 段外是公网
  });
  it("私网 192.168.1.1 → 拒", async () => {
    await expectBlocked("http://192.168.1.1/", "192.168.0.0/16");
  });
  it("链路本地 169.254.1.1 与云元数据 169.254.169.254 → 拒", async () => {
    await expectBlocked("http://169.254.1.1/", "链路本地");
    await expectBlocked("http://169.254.169.254/latest/meta-data/", "元数据");
  });
  it("IPv6 链路本地 fe80::1 与 ULA fd00::1 → 拒", async () => {
    await expectBlocked("http://[fe80::1]/", "链路本地");
    await expectBlocked("http://[fd00::1]/", "fc00::/7");
  });
  it("0.0.0.0 → 拒", async () => {
    await expectBlocked("http://0.0.0.0/", "0.0.0.0/8");
  });
  it("阿里云元数据 100.100.100.200(100.64/10)→ 拒", async () => {
    await expectBlocked("http://100.100.100.200/", "100.64.0.0/10");
  });
  it("IPv4-mapped IPv6 [::ffff:127.0.0.1] → 按内嵌 IPv4 拒", async () => {
    await expectBlocked("http://[::ffff:127.0.0.1]/", "回环");
  });
});

describe("assertUrlAllowed — IPv4 绕过形式(WHATWG URL 归一化后照样判)", () => {
  it("16 进制 0x7f000001 → 归一化成 127.0.0.1 → 拒", async () => {
    await expectBlocked("http://0x7f000001/", "回环");
  });
  it("8 进制 0177.0.0.1 → 拒", async () => {
    await expectBlocked("http://0177.0.0.1/", "回环");
  });
  it("纯整数 2130706433 → 拒", async () => {
    await expectBlocked("http://2130706433/", "回环");
  });
  it("短横式 127.1 → 拒", async () => {
    await expectBlocked("http://127.1/", "回环");
  });
});

describe("assertUrlAllowed — 域名黑名单与 DNS 解析复核", () => {
  it("localhost / 子域 .localhost → 不查 DNS 直接拒", async () => {
    const lookup = vi.fn(fakeLookup());
    await expect(
      assertUrlAllowed("http://localhost:3000/", { lookup }),
    ).rejects.toThrow("localhost");
    await expect(
      assertUrlAllowed("http://app.localhost/", { lookup }),
    ).rejects.toThrow("localhost");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("云元数据域名 metadata.google.internal → 拒", async () => {
    await expectBlocked("http://metadata.google.internal/computeMetadata/v1/", "元数据");
  });

  it("无点单标签主机名(内网机器名)→ 拒", async () => {
    await expectBlocked("http://intranet-fileserver/", "单标签");
  });

  it("域名解析到私网 IP(DNS 指内网)→ 拒(fail-closed:任一地址命中即拒)", async () => {
    await expectBlocked(
      "https://evil.example.com/",
      "10.0.0.5",
      fakeLookup(["93.184.216.34", "10.0.0.5"]),
    );
  });

  it("合法公网域名(解析到公网 IPv4/IPv6)→ 放行", async () => {
    await expect(
      assertUrlAllowed("https://chatgpt.com/share/abc", {
        lookup: fakeLookup(["104.18.32.47", "2606:4700::6810:84e5"]),
      }),
    ).resolves.toBeUndefined();
  });

  it("DNS 解析失败 → 放行(解析不到 ≠ 恶意;goto 会自己以「页面打不开」诚实失败)", async () => {
    const lookup: LookupFn = async () => {
      throw Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
    };
    await expect(
      assertUrlAllowed("https://no-such-site.example.net/", { lookup }),
    ).resolves.toBeUndefined();
  });
});

describe("blockedIpReason — 直接判 IP 文本", () => {
  it("公网 IP → null(放行)", () => {
    expect(blockedIpReason("93.184.216.34")).toBeNull();
    expect(blockedIpReason("2606:4700::6810:84e5")).toBeNull();
  });
  it("非 IP 文本 → null(交上层语义)", () => {
    expect(blockedIpReason("example.com")).toBeNull();
  });
  it("保留段 240.0.0.1 / 广播 255.255.255.255 → 拒", () => {
    expect(blockedIpReason("240.0.0.1")).toContain("240.0.0.0/4");
    expect(blockedIpReason("255.255.255.255")).toContain("240.0.0.0/4");
  });
  it("IPv6 zone index(fe80::1%en0)照样判链路本地", () => {
    expect(blockedIpReason("fe80::1%en0")).toContain("链路本地");
  });
});

describe("collectRedirectChainUrls — Playwright 重定向链鸭子类型收集", () => {
  it("沿 request().redirectedFrom() 往回收全链,按时间序返回", () => {
    const first = {
      url: () => "https://public.example.com/start",
      redirectedFrom: () => null,
    };
    const second = {
      url: () => "http://169.254.169.254/latest/meta-data/",
      redirectedFrom: () => first,
    };
    const finalReq = {
      url: () => "https://public.example.com/landing",
      redirectedFrom: () => second,
    };
    const resp = { request: () => finalReq };
    expect(collectRedirectChainUrls(resp)).toEqual([
      "https://public.example.com/start",
      "http://169.254.169.254/latest/meta-data/",
      "https://public.example.com/landing",
    ]);
  });

  it("fake response 没有 request()(单测桩)→ 空数组(只复检 finalUrl)", () => {
    expect(collectRedirectChainUrls({ status: () => 200, url: () => "x" })).toEqual([]);
    expect(collectRedirectChainUrls(null)).toEqual([]);
  });

  it("循环引用/取值抛错不弄崩(加固不反噬正常读取)", () => {
    const a: { url: () => string; redirectedFrom: () => unknown } = {
      url: () => "https://a.example.com/",
      redirectedFrom: () => a, // 自环
    };
    expect(collectRedirectChainUrls({ request: () => a })).toEqual([
      "https://a.example.com/",
    ]);
    const broken = {
      request: () => ({
        url: () => {
          throw new Error("boom");
        },
        redirectedFrom: () => null,
      }),
    };
    expect(collectRedirectChainUrls(broken)).toEqual([]);
  });
});

// ── [T-438] fake-ip 代理例外:域名解析到 198.18.0.0/15 放行,其余保留段一律不变 ─────────
describe("[T-438] fake-ip 代理例外(Clash/Surge 默认池 198.18.0.0/16)", () => {
  it("域名解析到 198.18.x.x → 放行(否则开代理的用户网页截图全废)", async () => {
    await expect(
      assertUrlAllowed("https://www.kimi.com/", { lookup: fakeLookup(["198.18.2.233"]) }),
    ).resolves.toBeUndefined();
    await expect(
      assertUrlAllowed("https://en.wikipedia.org/", { lookup: fakeLookup(["198.18.2.236"]) }),
    ).resolves.toBeUndefined();
  });

  it("直接写 198.18.x.x IP 字面量 → 仍阻断(可疑探测,不属 fake-ip 场景)", async () => {
    await expectBlocked("http://198.18.2.1/", "198.18.0.0/15");
  });

  it("其余保留段经 DNS 解析照样阻断(例外只针对 fake-ip 段)", async () => {
    await expectBlocked("https://a.example.com/", "127.0.0.0/8", fakeLookup(["127.0.0.1"]));
    await expectBlocked("https://b.example.com/", "192.168.0.0/16", fakeLookup(["192.168.1.1"]));
    await expectBlocked(
      "https://c.example.com/",
      "169.254.0.0/16",
      fakeLookup(["169.254.169.254"]),
    );
  });

  it("多解析结果中混有真私网 → 仍阻断(fake-ip 例外不掩护真内网)", async () => {
    await expectBlocked(
      "https://mixed.example.com/",
      "10.0.0.0/8",
      fakeLookup(["198.18.2.5", "10.0.0.7"]),
    );
  });
});
