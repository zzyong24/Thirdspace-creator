import { afterAll, beforeAll, it, expect, vi } from "vitest";
import { createServer } from "node:http";
import { chromium, type Browser, type BrowserServer } from "@playwright/test";
import { launchWithBrowser } from "../runtime/browser/browser-launch";
import { createResearchWorkerTools } from "./research-worker-tools";
import type { AgenticToolOutcome } from "@creatoros/contract/execution-worker";
let http: ReturnType<typeof createServer>, url: string;
let enteredSlow: (() => void) | undefined;
const text = "这是本地夹具中的真实文章正文，验证浏览器读取与会话回调。".repeat(
  45,
);
beforeAll(async () => {
  http = createServer((req, res) => {
    if (req.url === "/slow") {
      enteredSlow?.();
      return;
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "set-cookie": "fixture=article; Path=/",
    });
    res.end(
      `<html><head><title>本地正文夹具</title></head><body><article><h1>本地正文夹具</h1><p>${text}</p></article></body></html>`,
    );
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
});
afterAll(async () => {
  http.closeAllConnections();
  await new Promise<void>((resolve) => http.close(() => resolve()));
});
function fixture() {
  let server: BrowserServer | undefined, browser: Browser | undefined;
  const controller = new AbortController();
  const call = vi.fn(async (port: string) => {
    throw Error(`不应调用旧端口:${port}`);
  });
  const read = vi.fn(async () => ({
    domain: "127.0.0.1",
    stateJson: null,
    revision: "fixture-revision",
  }));
  const save = vi.fn(
    async (
      _input: { callId: string; revision: string | null; stateJson: string },
      _signal: AbortSignal,
    ) => ({ saved: true, revision: "new-fixture-revision" }),
  );
  const onRead = vi.fn(
    async (
      _callId: string,
      observation: { sourceUrl: string; title: string; fullText: string },
      _signal: AbortSignal,
    ): Promise<AgenticToolOutcome> => ({
      status: "ok",
      summary: "读取真实正文",
      evidence: [],
      data: { observation },
      error: null,
      continuation: null,
      sideEffect: "none",
    }),
  );
  const tools = createResearchWorkerTools({
    signal: controller.signal,
    call,
    sessionAccess: { read, save },
    onRead,
    launchServer: async () =>
      (server = await launchWithBrowser((selection) =>
        chromium.launchServer({ ...selection, headless: true }),
      )),
    connect: async (endpoint) => (browser = await chromium.connect(endpoint)),
    guardUrl: async (candidate) => {
      if (new URL(candidate).origin !== url) throw Error("仅允许本地HTTP夹具");
    },
  });
  return {
    tools,
    controller,
    call,
    read,
    save,
    onRead,
    get server() {
      return server;
    },
    get browser() {
      return browser;
    },
  };
}
it("真实web.read使用sessionAccess/onRead，正文回调与Cookie保存不走旧host端口", async () => {
  const f = fixture();
  try {
    const result = await f.tools.execute(
      "web.read",
      { url: url + "/article" },
      { callId: "read-1", signal: f.controller.signal },
    );
    expect(result.status).toBe("ok");
    expect(f.read).toHaveBeenCalledTimes(1);
    expect(f.onRead).toHaveBeenCalledTimes(1);
    expect(f.onRead.mock.calls[0]![0]).toBe("read-1");
    const observation = f.onRead.mock.calls[0]![1];
    expect(observation.sourceUrl).toBe(url + "/article");
    expect(observation.title).toContain("本地正文夹具");
    expect(observation.fullText).toContain(text);
    expect(result.data).toEqual({ observation });
    expect(f.save).toHaveBeenCalledTimes(1);
    const saved = f.save.mock.calls[0]![0];
    expect(saved).toMatchObject({
      callId: "read-1",
      revision: "fixture-revision",
    });
    expect(JSON.parse(saved.stateJson).cookies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "fixture", value: "article" }),
      ]),
    );
    expect(f.call).not.toHaveBeenCalled();
    expect(f.browser?.contexts()).toHaveLength(0);
  } finally {
    await f.tools.close();
  }
  expect(f.server).toBeDefined();
  expect(f.browser?.isConnected()).toBe(false);
  expect(
    f.server!.process().exitCode !== null ||
      f.server!.process().signalCode !== null,
  ).toBe(true);
}, 30000);
it("真实页面请求进行中取消：不回传正文、不保存会话，关闭context和浏览器", async () => {
  const f = fixture();
  const entered = new Promise<void>((resolve) => {
    enteredSlow = resolve;
  });
  let pending: Promise<unknown> | undefined;
  try {
    pending = f.tools.execute(
      "web.read",
      { url: url + "/slow" },
      { callId: "read-cancel", signal: f.controller.signal },
    );
    const rejected = expect(pending).rejects.toThrow();
    await entered;
    f.controller.abort();
    await rejected;
    expect(f.onRead).not.toHaveBeenCalled();
    expect(f.save).not.toHaveBeenCalled();
    expect(f.call).not.toHaveBeenCalled();
  } finally {
    f.controller.abort();
    await pending?.catch(() => {});
    await f.tools.close();
    enteredSlow = undefined;
    http.closeAllConnections();
  }
  expect(f.server).toBeDefined();
  expect(f.browser?.isConnected()).toBe(false);
  expect(
    f.server!.process().exitCode !== null ||
      f.server!.process().signalCode !== null,
  ).toBe(true);
}, 30000);
