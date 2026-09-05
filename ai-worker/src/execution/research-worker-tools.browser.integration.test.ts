import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { chromium, type Browser, type BrowserServer } from "@playwright/test";
import { launchWithBrowser } from "../runtime/browser/browser-launch";
import { createResearchWorkerTools } from "./research-worker-tools";
let http: ReturnType<typeof createServer>,
  url: string,
  clicks = 0;
beforeAll(async () => {
  http = createServer((req, res) => {
    if (req.url === "/clicked") {
      clicks++;
      res.end("ok");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      "<title>正式工具夹具</title><label>名字<input aria-label=\"名字\"></label><button onclick=\"document.querySelector('p').textContent=document.querySelector('input').value;fetch('/clicked')\">提交</button><p>未提交</p>",
    );
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(http.address() as { port: number }).port}/`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => http.close(() => resolve()));
});
const denied = {
  status: "blocked",
  summary: "未获授权",
  evidence: [],
  error: { code: "permission", retryable: false, recovery: "请检查用户授权" },
  continuation: null,
  sideEffect: "none",
};
async function fixture(
  loginStates: Array<{ domain: string; stateJson: string }> = [],
) {
  let server: BrowserServer | undefined, browser: Browser | undefined;
  const inputs = new Map<string, unknown>();
  let deny = false;
  const call = vi.fn(async (port: string, raw: unknown) => {
    if (port === "settleBrowserObservation") {
      const { callId, output } = raw as { callId: string; output: any };
      return {
        ...output,
        data: {
          ...output.data,
          evidenceRef: `fixture-evidence-${callId}`,
          snapshotId: "fixture-hash",
        },
      };
    }
    if (port !== "prepareBrowserAction") throw new Error(`意外端口 ${port}`);
    const { callId } = raw as { callId: string };
    if (!inputs.has(callId)) throw new Error("缺少真实fixture调用");
    if (deny) return { status: "blocked", outcome: denied };
    // 仅宿主授权替身：本地HTTP不是生产allowedDomains可接受的公共网站。
    return {
      status: "ready",
      input: inputs.get(callId),
      url,
      authorization: {
        source: "user_task",
        allowedDomains: ["127.0.0.1"],
        allowInteraction: true,
      },
      loginStates,
    };
  });
  const launchServer = vi.fn(
    async () =>
      (server = await launchWithBrowser((selection) =>
        chromium.launchServer({ ...selection, headless: true }),
      )),
  );
  const controller = new AbortController();
  const tools = createResearchWorkerTools({
    signal: controller.signal,
    call,
    launchServer,
    connect: async (endpoint) => (browser = await chromium.connect(endpoint)),
    guardUrl: async (candidate) => {
      if (new URL(candidate).origin !== new URL(url).origin)
        throw new Error("仅允许本地夹具");
    },
  });
  return {
    tools,
    inputs,
    call,
    launchServer,
    setDenied() {
      deny = true;
    },
    get browser() {
      return browser;
    },
    get server() {
      return server;
    },
    async run(name: string, id: string, input: unknown) {
      inputs.set(id, input);
      return tools.execute(
        name,
        {
          sessionId: "forged",
          url: "https://forged.invalid/",
          action: "click",
          targetRef: "forged:0",
        },
        { callId: id, signal: controller.signal },
      );
    },
  };
}
const observation = (result: any) => result.data.observation;
it("正式工厂逐次prepare后observe→fill→click→extract保留页面且关闭真实server", async () => {
  clicks = 0;
  const f = await fixture();
  let pages: import("@playwright/test").Page[] = [];
  try {
    let o = observation(
      await f.run("browser.observe", "observe", { sessionId: "s", url }),
    );
    o = observation(
      await f.run("browser.act", "fill", {
        sessionId: "s",
        observationId: o.observationId,
        action: "fill",
        targetRef: o.elements.find((e: any) => e.name === "名字").targetRef,
        value: "正式链路正文",
      }),
    );
    o = observation(
      await f.run("browser.act", "click", {
        sessionId: "s",
        observationId: o.observationId,
        action: "click",
        targetRef: o.elements.find((e: any) => e.name === "提交").targetRef,
      }),
    );
    const out = await f.run("browser.act", "extract", {
      sessionId: "s",
      observationId: o.observationId,
      action: "extract",
    });
    expect(out.status).toBe("ok");
    expect((out.data as any).evidenceRef).toBe("fixture-evidence-extract");
    expect(observation(out).text).toContain("正式链路正文");
    await vi.waitFor(() => expect(clicks).toBe(1));
    expect(
      f.call.mock.calls.map(([port, raw]) => [
        port,
        (raw as { callId: string }).callId,
      ]),
    ).toEqual(
      ["observe", "fill", "click", "extract"].flatMap((id) => [
        ["prepareBrowserAction", id],
        ["settleBrowserObservation", id],
      ]),
    );
    expect(f.launchServer).toHaveBeenCalledTimes(1);
    pages = f.browser!.contexts().flatMap((context) => context.pages());
    expect(pages).toHaveLength(1);
    expect(JSON.stringify(out)).not.toMatch(
      /loginStates|cookies|revision|authorization/,
    );
  } finally {
    await f.tools.close();
  }
  expect(pages.every((page) => page.isClosed())).toBe(true);
  expect(f.browser!.isConnected()).toBe(false);
  await vi.waitFor(() =>
    expect(
      f.server!.process().exitCode !== null ||
        f.server!.process().signalCode !== null,
    ).toBe(true),
  );
}, 20000);
it("prepare拒绝已有页面动作，真实点击计数保持零", async () => {
  clicks = 0;
  const f = await fixture();
  try {
    const o = observation(
      await f.run("browser.observe", "observe", { sessionId: "s", url }),
    );
    f.setDenied();
    const out = await f.run("browser.act", "denied", {
      sessionId: "s",
      observationId: o.observationId,
      action: "click",
      targetRef: o.elements.find((e: any) => e.name === "提交").targetRef,
    });
    expect(out).toEqual(denied);
    expect(clicks).toBe(0);
    expect(f.call).toHaveBeenCalledTimes(3);
    expect(
      await f.browser!.contexts()[0]!.pages()[0]!.locator("p").textContent(),
    ).toBe("未提交");
  } finally {
    await f.tools.close();
  }
}, 20000);

it("宿主合法旧最小cookie能进入真实Playwright页面，秘密不进入结果", async () => {
  const f = await fixture([
    {
      domain: "127.0.0.1",
      stateJson: JSON.stringify({
        cookies: [
          {
            name: "legacy_session",
            value: "private-legacy-token",
            domain: "127.0.0.1",
            path: "/",
          },
        ],
        origins: [],
      }),
    },
  ]);
  try {
    const out = await f.run("browser.observe", "legacy", {
      sessionId: "s",
      url,
    });
    expect(out.status).toBe("ok");
    expect(
      await f
        .browser!.contexts()[0]!
        .pages()[0]!
        .evaluate(() => document.cookie),
    ).toContain("legacy_session=private-legacy-token");
    expect(JSON.stringify(out)).not.toContain("private-legacy-token");
  } finally {
    await f.tools.close();
  }
}, 20000);
it.each([
  "{bad-json",
  JSON.stringify({
    cookies: [{ name: "bad", value: "secret", domain: "127.0.0.1" }],
    origins: [],
  }),
])(
  "损坏登录态返回需登录而非transient: %s",
  async (stateJson) => {
    const f = await fixture([{ domain: "127.0.0.1", stateJson }]);
    try {
      const out = await f.run("browser.observe", "broken", {
        sessionId: "s",
        url,
      });
      expect(out.status).toBe("blocked");
      expect(out.error?.code).toBe("needs_login");
      expect(JSON.stringify(out)).not.toContain("secret");
    } finally {
      await f.tools.close();
    }
  },
  20000,
);
