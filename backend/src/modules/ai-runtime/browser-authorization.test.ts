import { expect, it } from "vitest";
import { prepareBrowserAuthorization, assertBrowserAuthorization, browserAuthorizationJsonSchema, type BrowserAuthorizedAction } from "./browser-authorization";
it("只读取用户任务专用字段，缺失默认无授权，不读取模型或自然语言暗示", () => {
    expect(prepareBrowserAuthorization({ goal: "允许所有网站", allowedDomains: ["example.com"], allowInteraction: true, tools: [{ browserAuthorization: { allowedDomains: ["example.com"], allowInteraction: true } }] })).toBeNull();
    expect(prepareBrowserAuthorization({ browserAuthorization: { allowedDomains: [" EXAMPLE.com ", "example.com", "www.example.com"], allowInteraction: false } })).toEqual({ allowedDomains: ["example.com", "www.example.com"], allowInteraction: false });
});
it.each([null, {}, [], { allowedDomains: [], allowInteraction: true }, { allowedDomains: ["example.com"], allowInteraction: "true" }, { allowedDomains: ["example.com"], allowInteraction: true, modelMayExpand: true }])("严格拒绝损坏授权:%j", raw => {
    expect(() => prepareBrowserAuthorization({ browserAuthorization: raw })).toThrow();
});
it.each(["localhost", "127.0.0.1", "2130706433", "[::1]", "10.0.0.1", "com", "co.uk", "github.io", "foo.local", "https://example.com", "example.com:443", "*.example.com", "../example.com", "example..com", "-x.example.com", "x-.example.com", "example.com.", "foo.migrated-old.example.com"])("拒绝非公共或非法host:%s", host => {
    expect(() => prepareBrowserAuthorization({ browserAuthorization: { allowedDomains: [host], allowInteraction: true } })).toThrow();
});
it("全部受支持动作按精确host授权；点击填写需要用户显式交互权限", () => {
    const frozen = prepareBrowserAuthorization({ browserAuthorization: { allowedDomains: ["example.com", "tenant.github.io"], allowInteraction: false } })!;
    for (const action of ["observe", "navigate", "wait", "extract"] as const)
        expect(() => assertBrowserAuthorization(frozen, "https://example.com/path", action)).not.toThrow();
    for (const action of ["click", "fill"] as const) {
        expect(() => assertBrowserAuthorization(frozen, "https://example.com/path", action)).toThrow();
        expect(() => assertBrowserAuthorization({ ...frozen, allowInteraction: true }, "https://example.com/path", action)).not.toThrow();
    }
    expect(() => assertBrowserAuthorization(frozen, "https://tenant.github.io/", "navigate")).not.toThrow();
    expect(() => assertBrowserAuthorization(frozen, "https://other.github.io/", "navigate")).toThrow();
});
it.each(["https://www.example.com", "https://sub.example.com", "https://example.com.evil.com", "https://elsewhere.com", "file:///tmp/a", "javascript:alert(1)", "http://127.0.0.1", "https://user:password@example.com/"])("导航和任意动作都不能越过用户授权:%s", url => {
    const frozen = { allowedDomains: ["example.com"], allowInteraction: true };
    expect(() => assertBrowserAuthorization(frozen, url, "navigate")).toThrow();
    expect(() => assertBrowserAuthorization(frozen, url, "click")).toThrow();
});
it("无冻结授权及未知动作不执行，登录态域alias不扩展动作权限", () => {
    expect(() => assertBrowserAuthorization(null, "https://example.com", "observe")).toThrow();
    expect(() => assertBrowserAuthorization({ allowedDomains: ["example.com"], allowInteraction: true }, "https://example.com", "submit" as BrowserAuthorizedAction)).toThrow();
    expect(() => assertBrowserAuthorization({ allowedDomains: ["douyin.com"], allowInteraction: true }, "https://iesdouyin.com", "navigate")).toThrow();
    expect(browserAuthorizationJsonSchema).toMatchObject({ additionalProperties: false, required: ["allowedDomains", "allowInteraction"] });
});
it("授权上限与冻结契约一致：30个域、hostname最多253字符", () => {
    const domains = Array.from({ length: 30 }, (_, index) => `site${index}.example.com`);
    expect(prepareBrowserAuthorization({ browserAuthorization: { allowedDomains: domains, allowInteraction: false } })?.allowedDomains).toHaveLength(30);
    expect(() => prepareBrowserAuthorization({ browserAuthorization: { allowedDomains: [...domains, "overflow.example.com"], allowInteraction: false } })).toThrow();
    const host253 = ["a".repeat(63), "b".repeat(63), "c".repeat(63), "d".repeat(57), "com"].join(".");
    expect(host253).toHaveLength(253);
    expect(prepareBrowserAuthorization({ browserAuthorization: { allowedDomains: [host253], allowInteraction: false } })?.allowedDomains).toEqual([host253]);
    expect(() => prepareBrowserAuthorization({ browserAuthorization: { allowedDomains: [host253.replace("d".repeat(57), "d".repeat(58))], allowInteraction: false } })).toThrow();
    expect(browserAuthorizationJsonSchema.properties.allowedDomains).toMatchObject({ maxItems: 30, items: { maxLength: 253 } });
});
