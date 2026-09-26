import { describe, expect, it, vi } from "vitest";
import { readWebDocument, type WebReadWorkflowPorts } from "./web-read-workflow";
import { WebReaderLoginRequiredError, type ReadResult } from "./web-reader";
import { WebCaptureError } from "./web-capture";

const input = { url: "https://example.com/original" };
const document: ReadResult = { text: "原始正文".repeat(4000), title: "页面标题", finalUrl: "https://example.com/redirect", extractor: "chatgpt-share", extractPath: "ssr", turnCount: 40 };
function ports() {
  return {
    readCached: vi.fn<WebReadWorkflowPorts["readCached"]>(async () => null),
    read: vi.fn<WebReadWorkflowPorts["read"]>(async () => document),
    searchers: vi.fn<WebReadWorkflowPorts["searchers"]>(async () => []),
    hasSession: vi.fn<WebReadWorkflowPorts["hasSession"]>(async () => false),
    saveDocument: vi.fn<WebReadWorkflowPorts["saveDocument"]>(async ({ name }) => ({ assetId: "real-asset", name, previewUrl: null })),
  };
}

describe("正式网页读取共享编排", () => {
  it("缓存完整正文不启动浏览器，保留原缓存诊断和 excerpt", async () => {
    const deps = ports();
    deps.readCached.mockResolvedValue({ assetId: "cached", name: "正文·旧标题", previewUrl: null, fullText: document.text });
    expect(await readWebDocument(input, deps)).toMatchObject({ assetId: "cached", title: "旧标题", sourceUrl: input.url, fromCache: true, fullText: document.text, excerpt: document.text.slice(0, 280), extractor: "cached", turnCount: null });
    expect(deps.read).not.toHaveBeenCalled(); expect(deps.saveDocument).not.toHaveBeenCalled();
  });

  it("明确刷新跳过旧缓存且不删除原素材，返回新读正文", async () => {
    const deps = ports();
    deps.readCached.mockResolvedValue({ assetId: "old", name: "旧导航", previewUrl: null, fullText: "旧迁移页" });
    expect(await readWebDocument({ ...input, refresh: true }, deps)).toMatchObject({fromCache:false,fullText:document.text});
    expect(deps.readCached).not.toHaveBeenCalled();expect(deps.read).toHaveBeenCalledTimes(1);expect(deps.saveDocument).toHaveBeenCalledTimes(1);
  });

  it("缓存修复失败直接失败，不重新抓取或创建素材", async () => {
    const deps = ports(); deps.readCached.mockRejectedValue(new Error("来源投影失败"));
    await expect(readWebDocument(input, deps)).rejects.toThrow("来源投影失败");
    expect(deps.read).not.toHaveBeenCalled(); expect(deps.saveDocument).not.toHaveBeenCalled();
  });

  it.each(["ssr", "dom"] as const)("缓存 miss 后读全文，%s 诊断和原 URL 保留", async (extractPath) => {
    const deps = ports(); deps.read.mockResolvedValue({ ...document, extractPath });
    const result = await readWebDocument(input, deps);
    expect(result).toMatchObject({ needLogin: false, assetId: "real-asset", sourceUrl: input.url, fullText: document.text, excerpt: document.text.slice(0, 280), fromCache: false, turnCount: 40 });
    expect(result).toHaveProperty("extraction", extractPath === "ssr" ? "抽到 40 轮对话(SSR 全量,长对话不截断)" : "抽到 40 轮对话(DOM 渲染抽取,超长对话可能不全)");
    expect(deps.saveDocument).toHaveBeenCalledWith({ name: "正文·页面标题", sourceUrl: input.url, fullText: document.text }, undefined);
  });

  it("空标题只在素材名称中使用最终 URL，不改来源", async () => {
    const deps = ports(); deps.read.mockResolvedValue({ ...document, title: "", turnCount: null });
    expect(await readWebDocument(input, deps)).toMatchObject({ name: `正文·${document.finalUrl}`, title: "", sourceUrl: input.url, extraction: null });
  });

  it("登录错误返回实际 domain，不搜索也不保存", async () => {
    const deps = ports(); deps.read.mockRejectedValue(new WebReaderLoginRequiredError("login.example.com"));
    expect(await readWebDocument(input, deps)).toEqual({ needLogin: true, domain: "login.example.com" });
    expect(deps.searchers).not.toHaveBeenCalled(); expect(deps.saveDocument).not.toHaveBeenCalled();
  });

  it.each([true, false])("HTTP 被拒保留来源候选与登录态提示（已有会话 %s）", async (session) => {
    const deps = ports(); const alternate = { title: "候选", url: "https://other.example/a", snippet: "摘要" };
    deps.read.mockRejectedValue(new WebCaptureError("HTTP 403", { status: 403 }));
    deps.searchers.mockResolvedValue([async () => { throw new Error("第一路失败"); }, async () => [alternate]]);
    deps.hasSession.mockResolvedValue(session);
    const result = await readWebDocument(input, deps);
    expect(result).toMatchObject({ blocked: true, status: 403, alternates: [alternate] });
    if (!("blocked" in result)) throw new Error("必须被拒");
    expect(result.message).toBe(session ? "HTTP 403" : "HTTP 403(该站还没在「设置 → 网站登录保管库」登录过 —— 登录后重试,带登录态访问更容易通过)");
    expect(deps.read).toHaveBeenCalledTimes(1); expect(deps.saveDocument).not.toHaveBeenCalled();
  });

  it("其他读取错误与保存错误保持失败，不制造成功结果", async () => {
    const deps = ports(); deps.read.mockRejectedValueOnce(new Error("抽不出正文"));
    await expect(readWebDocument(input, deps)).rejects.toThrow("抽不出正文");
    expect(deps.searchers).not.toHaveBeenCalled();
    deps.saveDocument.mockRejectedValue(new Error("保存失败"));
    await expect(readWebDocument(input, deps)).rejects.toThrow("保存失败");
  });

  it("读取返回前取消，不开始保存，并向端口透传同一 signal", async () => {
    const deps = ports(); const controller = new AbortController();
    deps.read.mockImplementation(async () => { controller.abort(); return document; });
    await expect(readWebDocument({ ...input, signal: controller.signal }, deps)).rejects.toThrow();
    expect(deps.readCached).toHaveBeenCalledWith(input.url, controller.signal);
    expect(deps.read).toHaveBeenCalledWith(input.url, controller.signal);
    expect(deps.saveDocument).not.toHaveBeenCalled();
  });

  it("HTTP 被拒后取消，不启动后续搜索或保存", async () => {
    const deps = ports(); const controller = new AbortController();
    deps.read.mockRejectedValue(new WebCaptureError("HTTP 500", { status: 500 }));
    const second = vi.fn(async () => []);
    deps.searchers.mockResolvedValue([async () => { controller.abort(); throw new Error("中断"); }, second]);
    await expect(readWebDocument({ ...input, signal: controller.signal }, deps)).rejects.toThrow();
    expect(second).not.toHaveBeenCalled(); expect(deps.hasSession).not.toHaveBeenCalled(); expect(deps.saveDocument).not.toHaveBeenCalled();
  });

  it("会话读取取消不被当成没有登录态吞掉", async () => {
    const deps = ports(); const controller = new AbortController();
    deps.read.mockRejectedValue(new WebCaptureError("HTTP 404", { status: 404 }));
    deps.hasSession.mockImplementation(async () => { controller.abort(); throw new Error("取消"); });
    await expect(readWebDocument({ ...input, signal: controller.signal }, deps)).rejects.toThrow();
    expect(deps.saveDocument).not.toHaveBeenCalled();
  });
});
