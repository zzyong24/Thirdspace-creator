import { describe, expect, it } from "vitest";

import { planOpenUrl } from "./plan";

// [T-257 v4] open-url 安全核心:只允许 http(s),平台命令正确。
describe("planOpenUrl", () => {
  it("darwin + https → open <url>", () => {
    // [T-396b] 夹具改中性 URL:官方购买链接已从代码树清零(源级扫描 #buy 零命中)。
    const p = planOpenUrl("https://example.com/download", "darwin");
    expect(p).toEqual({ ok: true, cmd: "open", args: ["https://example.com/download"] });
  });

  it("darwin + http → open <url>(允许)", () => {
    const p = planOpenUrl("http://localhost:3000/x", "darwin");
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.cmd).toBe("open");
  });

  it("win32 → cmd /c start", () => {
    const p = planOpenUrl("https://example.com/", "win32");
    expect(p).toEqual({ ok: true, cmd: "cmd", args: ["/c", "start", "", "https://example.com/"] });
  });

  it("linux → xdg-open", () => {
    const p = planOpenUrl("https://example.com/", "linux");
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.cmd).toBe("xdg-open");
  });

  it("file:// → 拒(400),绝不喂给 open(防启动本地 app/文件)", () => {
    expect(planOpenUrl("file:///etc/passwd", "darwin")).toEqual({
      ok: false,
      status: 400,
      error: "only http(s) urls allowed",
    });
  });

  it("自定义 scheme → 拒", () => {
    expect(planOpenUrl("myapp://run", "darwin").ok).toBe(false);
  });

  it("非法 URL 字符串 → 拒", () => {
    expect(planOpenUrl("not a url", "darwin")).toEqual({
      ok: false,
      status: 400,
      error: "invalid url",
    });
  });

  it("非字符串输入 → 拒", () => {
    expect(planOpenUrl(undefined, "darwin").ok).toBe(false);
    expect(planOpenUrl(123, "darwin").ok).toBe(false);
  });
});
