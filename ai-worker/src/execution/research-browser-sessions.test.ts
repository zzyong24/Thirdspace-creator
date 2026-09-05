import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { chromium, type Browser, type Page } from "@playwright/test";
import { launchWithBrowser } from "../runtime/browser/browser-launch";
import { createResearchBrowserSessions } from "./research-browser-sessions";
let browser: Browser, server: ReturnType<typeof createServer>, url: string;
beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      "<title>页面保留</title><label>名字<input aria-label=\"名字\"></label><button onclick=\"document.querySelector('p').textContent=document.querySelector('input').value\">提交</button><p>尚未提交</p>",
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  browser = await launchWithBrowser((selection) =>
    chromium.launch({ ...selection, headless: true }),
  );
}, 30000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});
const signal = () => new AbortController().signal;
const observation = (out: any) => out.data.observation;
const guardUrl = async (value: string) => {
  if (new URL(value).origin !== new URL(url).origin)
    throw new Error("拒绝外站");
};
it("跨轮真实fill/click/extract保留同一页面，新observe导航仍有新观察", async () => {
  let page!: Page;
  const openPage = vi.fn(async () => (page = await browser.newPage()));
  const sessions = createResearchBrowserSessions({ openPage, guardUrl });
  try {
    let o = observation(
      await sessions.execute(
        "browser.observe",
        { sessionId: "s", url },
        { signal: signal() },
      ),
    );
    const targetRef = o.elements.find(
      (el: any) => el.name === "名字",
    ).targetRef;
    o = observation(
      await sessions.execute(
        "browser.act",
        {
          sessionId: "s",
          observationId: o.observationId,
          action: "fill",
          targetRef,
          value: "真实输入",
        },
        { signal: signal() },
      ),
    );
    o = observation(
      await sessions.execute(
        "browser.act",
        {
          sessionId: "s",
          observationId: o.observationId,
          action: "click",
          targetRef: o.elements.find((el: any) => el.name === "提交").targetRef,
        },
        { signal: signal() },
      ),
    );
    const extracted = await sessions.execute(
      "browser.act",
      { sessionId: "s", observationId: o.observationId, action: "extract" },
      { signal: signal() },
    );
    expect(extracted.status).toBe("ok");
    expect(observation(extracted).text).toContain("真实输入");
    expect(await page.locator("p").textContent()).toBe("真实输入");
    const next = observation(
      await sessions.execute(
        "browser.observe",
        { sessionId: "s", url },
        { signal: signal() },
      ),
    );
    expect(next.observationId).not.toBe(o.observationId);
    expect(openPage).toHaveBeenCalledTimes(1);
  } finally {
    await sessions.close();
  }
  expect(page.isClosed()).toBe(true);
});
it("缺失session的旧act不创建或重放页面，首observe缺URL也不创建", async () => {
  const openPage = vi.fn(async () => browser.newPage());
  const sessions = createResearchBrowserSessions({ openPage, guardUrl });
  try {
    const out = await sessions.execute(
      "browser.act",
      {
        sessionId: "lost",
        observationId: "old",
        action: "click",
        targetRef: "old:0",
      },
      { signal: signal() },
    );
    expect(out.error?.code).toBe("stale_observation");
    expect(
      (
        await sessions.execute(
          "browser.observe",
          { sessionId: "lost" },
          { signal: signal() },
        )
      ).error?.code,
    ).toBe("invalid_input");
    expect(openPage).not.toHaveBeenCalled();
  } finally {
    await sessions.close();
  }
});
it.each(["close", "abort"] as const)(
  "%s与真实页面创建交错，迟到页面必须关闭且不导航",
  async (mode) => {
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve)),
      started = new Promise<void>((resolve) => (entered = resolve));
    let page!: Page;
    const controller = new AbortController();
    const sessions = createResearchBrowserSessions({
      guardUrl,
      openPage: async () => {
        page = await browser.newPage();
        entered();
        await gate;
        return page;
      },
    });
    const running = sessions
      .execute(
        "browser.observe",
        { sessionId: "pending", url },
        { signal: controller.signal },
      )
      .catch((error) => error);
    await started;
    let closed = false;
    let closing: Promise<void> | undefined;
    if (mode === "close")
      closing = sessions.close().then(() => {
        closed = true;
      });
    else controller.abort();
    await Promise.resolve();
    expect(closed).toBe(false);
    expect(page.url()).toBe("about:blank");
    release();
    expect(await running).toBeInstanceOf(Error);
    await closing;
    await sessions.close();
    expect(page.isClosed()).toBe(true);
  },
);
it("guard取消后不创建页面，已存在页面取消立即关闭", async () => {
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve)),
    started = new Promise<void>((resolve) => (entered = resolve));
  const controller = new AbortController();
  const openPage = vi.fn(async () => browser.newPage());
  const sessions = createResearchBrowserSessions({
    openPage,
    guardUrl: async () => {
      entered();
      await gate;
    },
  });
  const running = sessions
    .execute(
      "browser.observe",
      { sessionId: "s", url },
      { signal: controller.signal },
    )
    .catch((error) => error);
  await started;
  controller.abort();
  release();
  expect(await running).toBeInstanceOf(Error);
  expect(openPage).not.toHaveBeenCalled();
  await sessions.close();
});
it("派发后观察失败原样保留unknown_commit，旧动作不重复派发", async () => {
  let page!: Page;
  let denyAfter = false;
  const sessions = createResearchBrowserSessions({
    openPage: async () => (page = await browser.newPage()),
    guardUrl: async (value) => {
      await guardUrl(value);
      if (denyAfter && (await page.evaluate(() => (window as any).clicks > 0)))
        throw new Error("事后观察拒绝");
    },
  });
  try {
    await sessions.execute(
      "browser.observe",
      { sessionId: "s", url },
      { signal: signal() },
    );
    await page.locator("button").evaluate((el) => {
      (window as any).clicks = 0;
      (el as HTMLButtonElement).onclick = () => {
        (window as any).clicks++;
      };
    });
    const o = observation(
      await sessions.execute(
        "browser.observe",
        { sessionId: "s" },
        { signal: signal() },
      ),
    );
    const action = {
      sessionId: "s",
      observationId: o.observationId,
      action: "click",
      targetRef: o.elements.find((el: any) => el.name === "提交").targetRef,
    };
    denyAfter = true;
    const out = await sessions.execute("browser.act", action, {
      signal: signal(),
    });
    expect(out.error?.code).toBe("unknown_commit");
    expect(out.sideEffect).toBe("unknown");
    expect(await page.evaluate(() => (window as any).clicks)).toBe(1);
    denyAfter = false;
    expect(
      (await sessions.execute("browser.act", action, { signal: signal() }))
        .error?.code,
    ).toBe("stale_observation");
    expect(await page.evaluate(() => (window as any).clicks)).toBe(1);
  } finally {
    await sessions.close();
  }
});
it("已关闭页面拒绝旧act，不通过openPage自动恢复", async () => {
  let page!: Page;
  const openPage = vi.fn(async () => (page = await browser.newPage()));
  const sessions = createResearchBrowserSessions({ openPage, guardUrl });
  try {
    const o = observation(
      await sessions.execute(
        "browser.observe",
        { sessionId: "s", url },
        { signal: signal() },
      ),
    );
    await page.close();
    expect(
      (
        await sessions.execute(
          "browser.act",
          { sessionId: "s", observationId: o.observationId, action: "extract" },
          { signal: signal() },
        )
      ).error?.code,
    ).toBe("stale_observation");
    expect(openPage).toHaveBeenCalledTimes(1);
  } finally {
    await sessions.close();
  }
});
it("已有页面正在guard时取消，等待真实page关闭且不导航", async () => {
  let page!: Page, entered!: () => void, release!: () => void;
  let hold = false;
  const gate = new Promise<void>((resolve) => (release = resolve)),
    started = new Promise<void>((resolve) => (entered = resolve));
  const sessions = createResearchBrowserSessions({
    openPage: async () => (page = await browser.newPage()),
    guardUrl: async (value) => {
      await guardUrl(value);
      if (hold) {
        entered();
        await gate;
      }
    },
  });
  try {
    await sessions.execute(
      "browser.observe",
      { sessionId: "s", url },
      { signal: signal() },
    );
    hold = true;
    const controller = new AbortController();
    const pending = sessions
      .execute(
        "browser.observe",
        { sessionId: "s", url: url + "next" },
        { signal: controller.signal },
      )
      .catch((error) => error);
    await started;
    controller.abort();
    release();
    expect(await pending).toBeInstanceOf(Error);
    expect(page.isClosed()).toBe(true);
  } finally {
    await sessions.close();
  }
});

it("host initialUrl仅用于无页面恢复，有页面无URL观察不得重载丢失输入", async () => {
  let page!: Page;
  const sessions = createResearchBrowserSessions({
    openPage: async () => (page = await browser.newPage()),
    guardUrl,
  });
  try {
    let o = observation(
      await sessions.execute(
        "browser.observe",
        { sessionId: "s" },
        { signal: signal(), initialUrl: url },
      ),
    );
    await sessions.execute(
      "browser.act",
      {
        sessionId: "s",
        observationId: o.observationId,
        action: "fill",
        targetRef: o.elements.find((el: any) => el.name === "名字").targetRef,
        value: "保留未提交输入",
      },
      { signal: signal() },
    );
    o = observation(
      await sessions.execute(
        "browser.observe",
        { sessionId: "s" },
        { signal: signal(), initialUrl: url },
      ),
    );
    expect(o.url).toBe(url);
    expect(await page.locator("input").inputValue()).toBe("保留未提交输入");
  } finally {
    await sessions.close();
  }
});
