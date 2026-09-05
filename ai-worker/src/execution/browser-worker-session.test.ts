import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer } from "node:http";
import { chromium, type Browser } from "@playwright/test";
import { launchWithBrowser } from "../runtime/browser/browser-launch";
import { createBrowserWorkerSession } from "./browser-worker-session";
let browser: Browser, server: ReturnType<typeof createServer>, url: string;
beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      "<title>隔离会话</title><main><p>真实正文</p><button onclick=\"document.querySelector('p').textContent='已点击'\">执行</button><label>名字<input aria-label=\"名字\"></label></main>",
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await launchWithBrowser((selection) =>
    chromium.launch({ ...selection, headless: true }),
  );
}, 30000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((done) => server?.close(() => done()));
});
const signal = () => new AbortController().signal;
it("真实Chromium观察/点击/填写/提取，只接受观察生成的不透明引用", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    const session = createBrowserWorkerSession({
      page,
      sessionId: "s1",
      guardUrl: async (candidate) => {
        if (!candidate.startsWith(url)) throw new Error("denied");
      },
    });
    const observed = await session.observe(signal());
    const observation = (observed.data as any).observation;
    expect(observation).toMatchObject({
      sessionId: "s1",
      url: url + "/",
      title: "隔离会话",
    });
    const button = observation.elements.find((el: any) => el.name === "执行");
    expect(button.targetRef).toBeTruthy();
    const click = await session.act(
      {
        sessionId: "s1",
        observationId: observation.observationId,
        action: "click",
        targetRef: button.targetRef,
      },
      signal(),
    );
    expect(click.status).toBe("ok");
    expect(await page.locator("p").textContent()).toBe("已点击");
    const next = (click.data as any).observation;
    const field = next.elements.find((el: any) => el.name === "名字");
    const filled = await session.act(
      {
        sessionId: "s1",
        observationId: next.observationId,
        action: "fill",
        targetRef: field.targetRef,
        value: "测试名字",
      },
      signal(),
    );
    expect(filled.status).toBe("ok");
    expect(await page.locator("input").inputValue()).toBe("测试名字");
  } finally {
    await page.close();
  }
});
it("DOM变化或旧observation拒绝旧动作并返回新观察，不点击目标", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    const session = createBrowserWorkerSession({
      page,
      sessionId: "s2",
      guardUrl: async () => {},
    });
    const first = (await session.observe(signal())).data as any;
    await page
      .locator("main")
      .evaluate((el) => el.setAttribute("data-changed", "yes"));
    const result = await session.act(
      {
        sessionId: "s2",
        observationId: first.observation.observationId,
        action: "click",
        targetRef: first.observation.elements.find(
          (el: any) => el.name === "执行",
        ).targetRef,
      },
      signal(),
    );
    expect(result.error?.code).toBe("stale_observation");
    expect(result.sideEffect).toBe("none");
    expect((result.data as any).observation.observationId).not.toBe(
      first.observation.observationId,
    );
    expect(await page.locator("p").textContent()).toBe("真实正文");
  } finally {
    await page.close();
  }
});
it("guard等待期间DOM改变仍原子拒绝点击，动作内DOM变化作为新观察返回", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    let modify = false;
    const session = createBrowserWorkerSession({
      page,
      sessionId: "race",
      guardUrl: async () => {
        if (modify) {
          modify = false;
          await page
            .locator("main")
            .evaluate((el) => el.setAttribute("data-race", "1"));
        }
      },
    });
    const observation = (await session.observe(signal())).data as any;
    modify = true;
    const result = await session.act(
      {
        sessionId: "race",
        observationId: observation.observation.observationId,
        action: "click",
        targetRef: observation.observation.elements.find(
          (el: any) => el.name === "执行",
        ).targetRef,
      },
      signal(),
    );
    expect(result.error?.code).toBe("stale_observation");
    expect(await page.locator("p").textContent()).toBe("真实正文");
    const fresh = (result.data as any).observation;
    const success = await session.act(
      {
        sessionId: "race",
        observationId: fresh.observationId,
        action: "click",
        targetRef: fresh.elements.find((el: any) => el.name === "执行")
          .targetRef,
      },
      signal(),
    );
    expect(success.status).toBe("ok");
    expect((success.data as any).execution).toMatchObject({
      trusted: false,
      eventDispatched: true,
    });
    expect((success.data as any).observation.text).toContain("已点击");
  } finally {
    await page.close();
  }
});
it("navigate/wait/extract均返回新观察，URL变化拒绝旧操作", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    const session = createBrowserWorkerSession({
      page,
      sessionId: "nav",
      guardUrl: async (candidate) => {
        expect(new URL(candidate).origin).toBe(url);
      },
    });
    let observation = (await session.observe(signal())).data as any;
    let result = await session.act(
      {
        sessionId: "nav",
        observationId: observation.observation.observationId,
        action: "navigate",
        value: url + "/next",
      },
      signal(),
    );
    expect(result.status).toBe("ok");
    let next = (result.data as any).observation;
    result = await session.act(
      {
        sessionId: "nav",
        observationId: next.observationId,
        action: "wait",
        value: url + "/next",
      },
      signal(),
    );
    expect(result.status).toBe("ok");
    next = (result.data as any).observation;
    result = await session.act(
      {
        sessionId: "nav",
        observationId: next.observationId,
        action: "extract",
      },
      signal(),
    );
    expect(result.evidence[0]?.text).toContain("真实正文");
    await page.goto(url + "/changed");
    const stale = await session.act(
      {
        sessionId: "nav",
        observationId: next.observationId,
        action: "extract",
      },
      signal(),
    );
    expect(stale.error?.code).toBe("stale_observation");
  } finally {
    await page.close();
  }
});
it("动作派发后观察失败为unknown，不重复点击", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    let postGuard = false;
    const session = createBrowserWorkerSession({
      page,
      sessionId: "unknown",
      guardUrl: async () => {
        if (postGuard && (await page.locator("p").textContent()) === "已点击")
          throw new Error("post-action guard denied");
      },
    });
    const observation = (await session.observe(signal())).data as any;
    postGuard = true;
    const result = await session.act(
      {
        sessionId: "unknown",
        observationId: observation.observation.observationId,
        action: "click",
        targetRef: observation.observation.elements.find(
          (el: any) => el.name === "执行",
        ).targetRef,
      },
      signal(),
    );
    expect(result.error?.code).toBe("unknown_commit");
    expect(result.sideEffect).toBe("unknown");
    expect(await page.locator("p").textContent()).toBe("已点击");
  } finally {
    await page.close();
  }
});
it("预先取消不执行动作，外部context仍由调用者关闭", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    const session = createBrowserWorkerSession({
      page,
      sessionId: "cancel",
      guardUrl: async () => {},
    });
    const first = (await session.observe(signal())).data as any;
    const controller = new AbortController();
    controller.abort();
    expect(
      (
        await session.act(
          {
            sessionId: "cancel",
            observationId: first.observation.observationId,
            action: "click",
            targetRef: first.observation.elements[0].targetRef,
          },
          controller.signal,
        )
      ).error?.code,
    ).toBe("cancelled");
    expect(await page.locator("p").textContent()).toBe("真实正文");
    await session.close();
    expect(page.isClosed()).toBe(false);
  } finally {
    await page.close();
  }
});
it("未知提交即使DOM未变也销毁旧observation，不能再次派发旧点击", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    await page.locator("button").evaluate((el) => {
      (window as any).clickCount = 0;
      el.onclick = () => {
        (window as any).clickCount++;
      };
    });
    let rejectAfterAction = true;
    const session = createBrowserWorkerSession({
      page,
      sessionId: "uncertain",
      guardUrl: async () => {
        if (
          rejectAfterAction &&
          (await page.evaluate(() => (window as any).clickCount > 0))
        )
          throw new Error("observer unavailable");
      },
    });
    const first = (await session.observe(signal())).data as any;
    const action = {
      sessionId: "uncertain",
      observationId: first.observation.observationId,
      action: "click" as const,
      targetRef: first.observation.elements.find(
        (el: any) => el.name === "执行",
      ).targetRef,
    };
    expect((await session.act(action, signal())).error?.code).toBe(
      "unknown_commit",
    );
    rejectAfterAction = false;
    expect((await session.act(action, signal())).error?.code).toBe(
      "stale_observation",
    );
    expect(await page.evaluate(() => (window as any).clickCount)).toBe(1);
  } finally {
    await page.close();
  }
});
it("目标提取返回元素事实、wait可见及同URL导航有效，拒绝额外selector", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    const session = createBrowserWorkerSession({
      page,
      sessionId: "extract",
      guardUrl: async () => {},
    });
    let observation = (await session.observe(signal())).data as any;
    let current = observation.observation;
    const extracted = await session.act(
      {
        sessionId: "extract",
        observationId: current.observationId,
        action: "extract",
        targetRef: current.elements.find((el: any) => el.name === "执行")
          .targetRef,
      },
      signal(),
    );
    expect((extracted.data as any).extraction).toMatchObject({
      text: "执行",
      truncated: false,
    });
    current = (extracted.data as any).observation;
    const waited = await session.act(
      {
        sessionId: "extract",
        observationId: current.observationId,
        action: "wait",
        targetRef: current.elements[0].targetRef,
      },
      signal(),
    );
    expect(waited.status).toBe("ok");
    current = (waited.data as any).observation;
    const navigated = await session.act(
      {
        sessionId: "extract",
        observationId: current.observationId,
        action: "navigate",
        value: url + "/",
      },
      signal(),
    );
    expect(navigated.status).toBe("ok");
    current = (navigated.data as any).observation;
    const invalid = await session.act(
      {
        sessionId: "extract",
        observationId: current.observationId,
        action: "click",
        targetRef: current.elements[0].targetRef,
        selector: "body",
      } as any,
      signal(),
    );
    expect(invalid.error?.code).toBe("invalid_input");
  } finally {
    await page.close();
  }
});
it("并发重复动作串行化只派发一次，另一调用使用旧观察被拒绝", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    await page.locator("button").evaluate((el) => {
      (window as any).serialClicks = 0;
      el.onclick = () => {
        (window as any).serialClicks++;
      };
    });
    const session = createBrowserWorkerSession({
      page,
      sessionId: "serial",
      guardUrl: async () => {},
    });
    const observed = (await session.observe(signal())).data as any;
    const action = {
      sessionId: "serial",
      observationId: observed.observation.observationId,
      action: "click" as const,
      targetRef: observed.observation.elements.find(
        (el: any) => el.name === "执行",
      ).targetRef,
    };
    const results = await Promise.all([
      session.act(action, signal()),
      session.act(action, signal()),
    ]);
    expect(results.map((r) => r.error?.code ?? "ok")).toEqual([
      "ok",
      "stale_observation",
    ]);
    expect(await page.evaluate(() => (window as any).serialClicks)).toBe(1);
  } finally {
    await page.close();
  }
});
it("密码与文件输入拒绝普通fill，不填写秘密或选择文件", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    await page.locator("main").evaluate((el) => {
      el.insertAdjacentHTML(
        "beforeend",
        '<input type="password" aria-label="登录密码"><input type="file" aria-label="文件">',
      );
    });
    const session = createBrowserWorkerSession({
      page,
      sessionId: "sensitive",
      guardUrl: async () => {},
    });
    for (const [name, code] of [
      ["登录密码", "needs_login"],
      ["文件", "permission"],
    ]) {
      const observation = (await session.observe(signal())).data as any;
      const result = await session.act(
        {
          sessionId: "sensitive",
          observationId: observation.observation.observationId,
          action: "fill",
          targetRef: observation.observation.elements.find(
            (el: any) => el.name === name,
          ).targetRef,
          value: "private-value",
        },
        signal(),
      );
      expect(result.status).toBe("blocked");
      expect(result.error?.code).toBe(code);
      expect(result.sideEffect).toBe("none");
      expect(JSON.stringify(result)).not.toContain("private-value");
    }
    expect(await page.locator('input[type="password"]').inputValue()).toBe("");
    expect(await page.locator('input[type="file"]').inputValue()).toBe("");
  } finally {
    await page.close();
  }
});
it("链接目标guard完成时取消不得提交后续DOM点击", async () => {
  const page = await browser.newPage();
  let clicks = 0;
  try {
    await page.goto(url);
    await page.exposeFunction("recordCancelledClick", () => {
      clicks++;
    });
    await page
      .locator("main")
      .evaluate(
        (el, href) =>
          el.insertAdjacentHTML(
            "beforeend",
            `<a href="${href}" onclick="event.preventDefault();window.recordCancelledClick()">链接</a>`,
          ),
        url + "/target",
      );
    const controller = new AbortController();
    let abortDestination = false;
    const session = createBrowserWorkerSession({
      page,
      sessionId: "abort-race",
      guardUrl: async (candidate) => {
        if (abortDestination && candidate.endsWith("/target"))
          controller.abort();
      },
    });
    const observation = (await session.observe(signal())).data as any;
    abortDestination = true;
    const result = await session.act(
      {
        sessionId: "abort-race",
        observationId: observation.observation.observationId,
        action: "click",
        targetRef: observation.observation.elements.find(
          (el: any) => el.name === "链接",
        ).targetRef,
      },
      controller.signal,
    );
    await new Promise((done) => setTimeout(done, 50));
    expect(result.error?.code).toBe("cancelled");
    expect(clicks).toBe(0);
  } finally {
    await page.close();
  }
});
it.each(["", "00", "+0", "0x0"])(
  "未观察过的targetRef尾缀%s不可定位元素0",
  async (suffix) => {
    const page = await browser.newPage();
    try {
      await page.goto(url);
      const session = createBrowserWorkerSession({
        page,
        sessionId: "badref",
        guardUrl: async () => {},
      });
      const observed = (await session.observe(signal())).data as any;
      const result = await session.act(
        {
          sessionId: "badref",
          observationId: observed.observation.observationId,
          action: "click",
          targetRef: observed.observation.observationId + ":" + suffix,
        },
        signal(),
      );
      expect(result.error?.code).toBe("invalid_input");
      expect(await page.locator("p").textContent()).toBe("真实正文");
    } finally {
      await page.close();
    }
  },
);
it("等待中的取消完成真实page关闭，不以逻辑closed冒充浏览器已停止", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    const session = createBrowserWorkerSession({
      page,
      sessionId: "close-page",
      guardUrl: async () => {},
    });
    const observed = (await session.observe(signal())).data as any;
    const controller = new AbortController();
    const pending = session.act(
      {
        sessionId: "close-page",
        observationId: observed.observation.observationId,
        action: "wait",
        value: url + "/never",
      },
      controller.signal,
    );
    setTimeout(() => controller.abort(), 30);
    const result = await pending;
    expect(result.error?.code).toBe("cancelled");
    expect(page.isClosed()).toBe(true);
  } finally {
    await page.close();
  }
});
