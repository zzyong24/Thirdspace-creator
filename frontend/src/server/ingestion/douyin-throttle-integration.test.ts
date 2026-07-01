import { describe, it, expect } from "vitest";
import {
  fetchDouyinVideoUrl,
  fetchDouyinComments,
  fetchDouyinCommentsForWorks,
  fetchDouyinMetrics,
  fetchDouyinWorkListExport,
  isXlsxBytes,
} from "./douyin-cdp";
import {
  withDouyinChannel,
  instantNoopGateway,
  type DouyinChannel,
  type DouyinOutcome,
  type DouyinChannelGate,
} from "./douyin-request-gateway";

// T-038b 限流网关集成冒烟测(确定性,注入 spy/instant gateway,不真抓、不起 Chromium)。
// 覆盖 [gate-F7] 5 个插装点各调 acquire(正确 channel) + 结束 report + 错误→classify 映射 +
// [gate-F5] dispatch 采集串行闸(concurrency 1)。全程用 spy gateway 记录调用序列(acquire=
// 立即 resolve,不真等;既有 40 douyin-cdp 测不传 gateway → 用 instantNoopGateway,零回归)。

// ── spy gateway:记录 acquire/report 调用序列(acquire 立即放行,不节流)────────────
type GateCall =
  | { op: "acquire"; channel: DouyinChannel }
  | { op: "report"; channel: DouyinChannel; outcome: DouyinOutcome };

function makeSpyGateway(): {
  gateway: DouyinChannelGate;
  calls: GateCall[];
  acquireCount(channel: DouyinChannel): number;
  reports(channel?: DouyinChannel): DouyinOutcome[];
} {
  const calls: GateCall[] = [];
  const gateway: DouyinChannelGate = {
    async acquire(channel) {
      calls.push({ op: "acquire", channel });
    },
    report(channel, outcome) {
      calls.push({ op: "report", channel, outcome });
    },
  };
  return {
    gateway,
    calls,
    acquireCount: (channel) =>
      calls.filter((c) => c.op === "acquire" && c.channel === channel).length,
    reports: (channel) =>
      calls
        .filter(
          (c): c is Extract<GateCall, { op: "report" }> =>
            c.op === "report" && (channel ? c.channel === channel : true),
        )
        .map((c) => c.outcome),
  };
}

// ── 插装点① fetchDouyinVideoUrl → iesdouyin ────────────────────────────────────
function routerDataHtml(inner: unknown): string {
  return (
    "<!doctype html><html><body>" +
    `<script>window._ROUTER_DATA = ${JSON.stringify(inner)}</script>` +
    "</body></html>"
  );
}
const OK_HTML = routerDataHtml({
  loaderData: {
    "video_(id)/page": {
      videoInfoRes: {
        item_list: [
          {
            aweme_id: "7400",
            video: {
              play_addr: { url_list: ["https://v3.douyinvod.com/x/?playwm=1"] },
            },
          },
        ],
      },
    },
  },
});

describe("[gate-F7 插装点①] fetchDouyinVideoUrl 过 iesdouyin channel", () => {
  it("成功:acquire('iesdouyin') 一次 → report('ok')", async () => {
    const spy = makeSpyGateway();
    const okFetch = async () =>
      new Response(OK_HTML, { status: 200 }) as unknown as Response;
    const out = await fetchDouyinVideoUrl("7400", {
      fetch: okFetch as typeof fetch,
      gateway: spy.gateway,
    });
    expect(out.playUrl).not.toContain("playwm"); // 去水印生效(证真跑了 fn)
    expect(spy.acquireCount("iesdouyin")).toBe(1);
    expect(spy.acquireCount("creator-center")).toBe(0);
    // 序列:先 acquire 后 report;report=ok。
    expect(spy.calls[0]).toEqual({ op: "acquire", channel: "iesdouyin" });
    expect(spy.reports("iesdouyin")).toEqual(["ok"]);
  });

  it("[错误映射] 无 _ROUTER_DATA(风控残页)→ report('throttled') 且仍抛原错", async () => {
    const spy = makeSpyGateway();
    const badFetch = async () =>
      new Response("<html>被风控的残页</html>", {
        status: 200,
      }) as unknown as Response;
    await expect(
      fetchDouyinVideoUrl("7400", {
        fetch: badFetch as typeof fetch,
        gateway: spy.gateway,
      }),
    ).rejects.toThrow(); // 报告后仍抛原错(不吞)
    expect(spy.acquireCount("iesdouyin")).toBe(1);
    // router-data-missing → throttled(退避)。
    expect(spy.reports("iesdouyin")).toEqual(["throttled"]);
  });
});

// ── 插装点② fetchDouyinMetrics 翻页循环 → creator-center(每页一次)──────────────
// fake context/page:每次滚动 evaluate 触发一次 work_list XHR(命中 hint),前 N 页 has_more=true、
// 第 N 页 has_more=false 停。断言翻页每页 acquire 一次 creator-center。
function makeFakeMetricsContext(pages: number) {
  const calls = { close: 0 };
  let handler: ((resp: { url(): string; json(): Promise<unknown> }) => void) | null =
    null;
  let served = 0;
  // 每翻一页(mouse.wheel 每循环恰好调 1 次)喂一页 work_list XHR:served<pages 前 has_more=true,
  // 第 pages 页 has_more=false 停。evaluate(每循环调 2 次)不喂,避免双计数。
  const serveOnePage = () => {
    served += 1;
    const hasMore = served < pages;
    handler?.({
      url: () => "https://x/aweme/v1/creator/item/list?count=12",
      json: () =>
        Promise.resolve({
          aweme_list: [{ aweme_id: `w-${served}`, statistics: { play_count: 1 } }],
          has_more: hasMore,
        }),
    });
  };
  const page = {
    on(_e: "response", cb: typeof handler) {
      handler = cb;
    },
    async goto() {
      return undefined;
    },
    async waitForTimeout() {
      return undefined;
    },
    async evaluate() {
      return undefined as unknown; // 滚动 evaluate 不喂 XHR(每循环 2 次,避免双计数)
    },
    keyboard: {
      async press() {
        return undefined;
      },
    },
    mouse: {
      async wheel() {
        serveOnePage(); // 每翻一页恰好 1 次 → 每页一条 work_list XHR
        return undefined;
      },
    },
  };
  const ctx = {
    pages() {
      return [page];
    },
    async newPage() {
      return page;
    },
    async cookies() {
      return [{ name: "sessionid" }];
    },
    async close() {
      calls.close += 1;
    },
  };
  type InjectedOpenCtx = NonNullable<
    Parameters<typeof fetchDouyinMetrics>[1]
  >["openContext"];
  type InjectedCtx = Awaited<ReturnType<NonNullable<InjectedOpenCtx>>>;
  const openContext: NonNullable<InjectedOpenCtx> = async () =>
    ctx as unknown as InjectedCtx;
  return { calls, openContext };
}

describe("[gate-F7 插装点②] fetchDouyinMetrics 翻页每页过 creator-center", () => {
  it("N 页翻页 → acquire N 次 creator-center(每页一次,非整函数一次)", async () => {
    const spy = makeSpyGateway();
    const N = 3;
    const { calls, openContext } = makeFakeMetricsContext(N);
    const records = await fetchDouyinMetrics(
      { authDir: "/fake/.auth", capturedAt: "2026-07-02T00:00:00.000Z", maxPages: 10, gateway: spy.gateway },
      { openContext },
    );
    // has_more=false 在第 N 页,故翻页循环恰好 N 次 → N 次 acquire。
    expect(spy.acquireCount("creator-center")).toBe(N);
    expect(spy.acquireCount("iesdouyin")).toBe(0);
    // 每页 acquire 后 report('ok')(滚动成功)。
    expect(spy.reports("creator-center")).toEqual(["ok", "ok", "ok"]);
    expect(records.length).toBeGreaterThan(0); // 真解析出作品
    expect(calls.close).toBe(1);
  });
});

// ── 插装点③④ 评论(每作品一次 + 作品内翻页每页一次)→ creator-center ───────────────
type FakeResp = { url(): string; json(): Promise<unknown> };
type FakeHandler = (resp: FakeResp) => void;

// fake 评论 context:每次滚动 evaluate 喂一页评论 XHR。scrapeCommentsForWork 连续 3 轮无新
// 评论才停 → 每作品固定翻 3 页(stale)后停,便于断言"每页一次"acquire。
function makeFakeCommentContext() {
  const calls = { close: 0, goto: 0 };
  let handlers: FakeHandler[] = [];
  const page = {
    on(_e: "response", cb: FakeHandler) {
      handlers.push(cb);
    },
    off(_e: "response", cb: FakeHandler) {
      handlers = handlers.filter((h) => h !== cb);
    },
    async goto(url: string) {
      calls.goto += 1;
      const m = /item_id=([^&]+)/.exec(url);
      const aweme = m ? decodeURIComponent(m[1]!) : "";
      // 首屏喂 2 条(c-<aweme> + c-dup);翻页 wheel 每轮**只重喂 c-dup**(始终已见 → seenIds
      // 从第 0 轮起就不增 → 连续 3 轮 stale 停 → 翻页循环恰好 3 次 → 3 次 acquire)。
      const payload = {
        comments: [
          { cid: `c-${aweme}`, aweme_id: aweme, text: `评-${aweme}`, digg_count: 1 },
          { cid: "c-dup", aweme_id: aweme, text: "dup", digg_count: 1 },
        ],
      };
      for (const h of handlers)
        h({ url: () => "https://x/aweme/v1/web/comment/list/?c=20", json: () => Promise.resolve(payload) });
      return undefined;
    },
    async waitForTimeout() {
      return undefined;
    },
    async evaluate() {
      return undefined as unknown; // 滚动 evaluate 不喂 XHR(避免与 wheel 双计数)
    },
    mouse: {
      async wheel() {
        // 翻页喂同一条 c-dup(始终不新 → 从第 0 轮起就 stale)。
        const payload = { comments: [{ cid: "c-dup", text: "dup", digg_count: 1 }] };
        for (const h of handlers)
          h({ url: () => "https://x/aweme/v1/web/comment/list/?c=20", json: () => Promise.resolve(payload) });
        return undefined;
      },
    },
  };
  const ctx = {
    pages() {
      return [page];
    },
    async newPage() {
      return page;
    },
    async cookies() {
      return [{ name: "sessionid" }];
    },
    async close() {
      calls.close += 1;
    },
  };
  type InjectedOpenCtx = NonNullable<
    Parameters<typeof fetchDouyinCommentsForWorks>[2]
  >["openContext"];
  type InjectedCtx = Awaited<ReturnType<NonNullable<InjectedOpenCtx>>>;
  const openContext: NonNullable<InjectedOpenCtx> = async () =>
    ctx as unknown as InjectedCtx;
  return { calls, openContext };
}

describe("[gate-F7 插装点③④] 评论采集过 creator-center", () => {
  it("插装点④:fetchDouyinCommentsForWorks 3 作品 → 每作品各 1 次作品级 acquire", async () => {
    const spy = makeSpyGateway();
    const { openContext } = makeFakeCommentContext();
    const awemeIds = ["7401", "7402", "7403"];
    // maxPages=0 → 作品内不翻页(scrapeCommentsForWork 翻页循环 0 次)→ 只剩作品级 acquire。
    const results = await fetchDouyinCommentsForWorks(
      awemeIds,
      { authDir: "/fake/.auth", maxPages: 0 },
      { openContext, gateway: spy.gateway },
    );
    expect(results).toHaveLength(3);
    // 插装点④:每作品一次作品级 acquire(maxPages=0 → 无翻页 acquire),故恰好 3 次。
    expect(spy.acquireCount("creator-center")).toBe(3);
    expect(spy.acquireCount("iesdouyin")).toBe(0);
    expect(spy.reports("creator-center")).toEqual(["ok", "ok", "ok"]);
  });

  it("插装点③:单作品翻页 → 翻页每页各 1 次 acquire(此处 3 页 stale 后停)", async () => {
    const spy = makeSpyGateway();
    const { openContext } = makeFakeCommentContext();
    // 单作品路径(fetchDouyinComments):不套作品级 acquire,只有翻页每页 acquire。fake 每次滚动
    // 喂重复 cid → 连续 3 轮 stale 停 → 翻页循环恰好 3 次 → 3 次 acquire。
    await fetchDouyinComments(
      { awemeId: "7409", authDir: "/fake/.auth", maxPages: 40 },
      { openContext, gateway: spy.gateway },
    );
    expect(spy.acquireCount("creator-center")).toBe(3); // 3 轮翻页 stale 后停
    expect(spy.reports("creator-center").every((o) => o === "ok")).toBe(true);
  });
});

// ── 插装点⑤ fetchDouyinWorkListExport → creator-center + 导出错误映射 ─────────────
const CODE_TAB_POSTS = [25237, 31295, 20316, 21697].join(",");
const CODE_SUBTAB_LIST = [25237, 31295, 21015, 34920].join(",");
const CODE_BTN_EXPORT = [23548, 20986, 25968, 25454].join(",");
const CODE_TOAST_NO_DATA = [
  24403, 21069, 26242, 26080, 25968, 25454, 21487, 23548, 20986,
].join(",");

// 复用 douyin-cdp.test.ts 的 fake export context 建模(切投稿列表→点导出→触发 download);
// 扩展:noDataToast=true 时导出永不下载(图集/无数据)+ hasVisible 探针对 toast 返 true。
function makeFakeExportContext(config: {
  present: Set<string>;
  downloadBytes?: Uint8Array;
  noDataToast?: boolean; // true:导出点击不触发 download(超时),且 no-data toast 可见
}) {
  const state = { onPostsTab: false, onListSubtab: false };
  let lastMarkedKey: string | null = null;
  let fireDownload: (() => void) | null = null;
  const isPresent = (key: string): boolean => {
    if (key === CODE_TOAST_NO_DATA) return !!config.noDataToast;
    if (!config.present.has(key)) return false;
    if (key === CODE_SUBTAB_LIST && !state.onPostsTab) return false;
    return true;
  };
  const page = {
    async goto() {
      return undefined;
    },
    async waitForTimeout() {
      return undefined;
    },
    async evaluate(
      fn: ((codes: number[]) => number | boolean) | ((a: unknown) => number),
      arg: number[] | { exportCodes: number[]; refreshCodes: number[] },
    ): Promise<number | boolean> {
      if (arg && !Array.isArray(arg)) {
        const key = arg.exportCodes.join(",");
        if (state.onListSubtab && isPresent(key)) {
          lastMarkedKey = key;
          return 1;
        }
        lastMarkedKey = null;
        return 0;
      }
      const codes = arg as number[];
      const key = codes.join(",");
      const present = isPresent(key);
      if (fn.name === "hasVisibleByCharCodesInPage") return present;
      if (!present) {
        lastMarkedKey = null;
        return 0;
      }
      lastMarkedKey = key;
      return 1;
    },
    locator(_selector: string) {
      const keyAtBind = lastMarkedKey;
      return {
        async count() {
          return keyAtBind ? 1 : 0;
        },
        async click() {
          if (!keyAtBind) throw new Error("no marked element");
          if (keyAtBind === CODE_TAB_POSTS) state.onPostsTab = true;
          if (keyAtBind === CODE_SUBTAB_LIST) state.onListSubtab = true;
          if (keyAtBind === CODE_BTN_EXPORT) {
            // noDataToast=true:图集/无数据 → 永不触发 download(超时);否则正常 resolve。
            if (state.onListSubtab && !config.noDataToast && fireDownload)
              fireDownload();
          }
        },
      };
    },
    async waitForEvent(
      _e: "download",
      opts?: { timeout?: number },
    ): Promise<{ path(): Promise<string> }> {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error(
                'page.waitForEvent: Timeout exceeded while waiting for event "download"',
              ),
            ),
          opts?.timeout ?? 50,
        );
        fireDownload = () => {
          clearTimeout(timer);
          resolve({
            async path() {
              return "/tmp/fake/作品列表.xlsx";
            },
          });
        };
      });
    },
    async screenshot() {
      return undefined;
    },
  };
  const ctx = {
    pages() {
      return [page];
    },
    async newPage() {
      return page;
    },
    async cookies() {
      return [{ name: "sessionid" }];
    },
    async close() {
      return undefined;
    },
  };
  type InjectedOpenCtx = NonNullable<
    Parameters<typeof fetchDouyinWorkListExport>[1]
  >["openContext"];
  type InjectedCtx = Awaited<ReturnType<NonNullable<InjectedOpenCtx>>>;
  const openContext: NonNullable<InjectedOpenCtx> = async () =>
    ctx as unknown as InjectedCtx;
  const readFile = async () =>
    config.downloadBytes ?? new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01]);
  return { openContext, readFile };
}

describe("[gate-F7 插装点⑤] fetchDouyinWorkListExport 过 creator-center", () => {
  it("成功导出:acquire('creator-center') 一次 → report('ok')", async () => {
    const spy = makeSpyGateway();
    const { openContext, readFile } = makeFakeExportContext({
      present: new Set([CODE_TAB_POSTS, CODE_SUBTAB_LIST, CODE_BTN_EXPORT]),
    });
    const bytes = await fetchDouyinWorkListExport(
      { authDir: "/fake/.auth" },
      { openContext, readFile, downloadTimeoutMs: 100, gateway: spy.gateway },
    );
    expect(isXlsxBytes(bytes)).toBe(true);
    expect(spy.acquireCount("creator-center")).toBe(1);
    expect(spy.reports("creator-center")).toEqual(["ok"]);
  });

  it("[gate-F6 错误映射] download 超时 + 有「暂无数据」toast → report('content-error')(图集不退避)", async () => {
    const spy = makeSpyGateway();
    const { openContext, readFile } = makeFakeExportContext({
      present: new Set([CODE_TAB_POSTS, CODE_SUBTAB_LIST, CODE_BTN_EXPORT]),
      noDataToast: true, // 图集/无数据:导出永不下载 → 超时,但 no-data toast 可见
    });
    await expect(
      fetchDouyinWorkListExport(
        { authDir: "/fake/.auth" },
        { openContext, readFile, downloadTimeoutMs: 60, gateway: spy.gateway },
      ),
    ).rejects.toThrow(); // 仍抛原超时错(不吞)
    expect(spy.acquireCount("creator-center")).toBe(1);
    // [gate-F6] 有 toast → content-error(不退避),而非 throttled。
    expect(spy.reports("creator-center")).toEqual(["content-error"]);
  });

  it("[gate-F6 错误映射] download 超时 + 无 toast → report('throttled')(疑似频控退避)", async () => {
    const spy = makeSpyGateway();
    // present 缺 CODE_BTN_EXPORT → 点不到导出 → 抛 DouyinExportError(非 download 超时路径),
    // 归 content-error。为测"无 toast + download 超时 → throttled",让导出可点但 download 永不来:
    const { openContext, readFile } = makeFakeExportContext({
      present: new Set([CODE_TAB_POSTS, CODE_SUBTAB_LIST, CODE_BTN_EXPORT]),
      noDataToast: false, // 无 toast
      // downloadBytes 无关(不会走到读文件)。构造:导出点击不触发 download → 超时且无 toast。
    });
    // 覆盖 locator.click 使导出点击"成功但不触发 download":用 present 有导出但 fireDownload 不调。
    // 复用 noDataToast=true 的"不触发 download"分支 + toast 不可见 → 需单独造。这里改用:
    // present 含导出、noDataToast=false,但把 export 点击的 fireDownload 抑制 —— 通过让
    // waitForEvent 超时(downloadTimeoutMs 极短)且导出点击前 onListSubtab 已 true 但我们
    // 令 config.noDataToast 控制是否 fire。为无 toast + 超时:需要"导出点了但没下载"。
    // 简化:直接用 withDouyinChannel 层面已由插装点⑤覆盖成功/有toast两分支;此分支用
    // makeFakeExportContext 的 noDataToast=true 造"永不下载",再把 toast 探针置不可见 —— 见下。
    void openContext;
    void readFile;
    // —— 用一个专造 context:导出可点、永不下载、toast 不可见。
    const noFire = makeExportNeverDownloadNoToast();
    await expect(
      fetchDouyinWorkListExport(
        { authDir: "/fake/.auth" },
        {
          openContext: noFire.openContext,
          readFile: noFire.readFile,
          downloadTimeoutMs: 60,
          gateway: spy.gateway,
        },
      ),
    ).rejects.toThrow();
    expect(spy.acquireCount("creator-center")).toBe(1);
    // 无 toast + download 超时 → throttled(退避)。
    expect(spy.reports("creator-center")).toEqual(["throttled"]);
  });
});

// 专造:切到投稿列表、导出可标记可点,但点击**不触发** download(→ waitForEvent 超时),
// 且 no-data toast **不可见**([gate-F6] 无 toast + 超时 → throttled 分支)。
function makeExportNeverDownloadNoToast() {
  const state = { onPostsTab: false, onListSubtab: false };
  let lastMarkedKey: string | null = null;
  const present = new Set([CODE_TAB_POSTS, CODE_SUBTAB_LIST, CODE_BTN_EXPORT]);
  const isPresent = (key: string): boolean => {
    if (key === CODE_TOAST_NO_DATA) return false; // toast 不可见
    if (!present.has(key)) return false;
    if (key === CODE_SUBTAB_LIST && !state.onPostsTab) return false;
    return true;
  };
  const page = {
    async goto() {
      return undefined;
    },
    async waitForTimeout() {
      return undefined;
    },
    async evaluate(
      fn: ((codes: number[]) => number | boolean) | ((a: unknown) => number),
      arg: number[] | { exportCodes: number[]; refreshCodes: number[] },
    ): Promise<number | boolean> {
      if (arg && !Array.isArray(arg)) {
        const key = arg.exportCodes.join(",");
        if (state.onListSubtab && isPresent(key)) {
          lastMarkedKey = key;
          return 1;
        }
        lastMarkedKey = null;
        return 0;
      }
      const codes = arg as number[];
      const key = codes.join(",");
      const p = isPresent(key);
      if (fn.name === "hasVisibleByCharCodesInPage") return p;
      if (!p) {
        lastMarkedKey = null;
        return 0;
      }
      lastMarkedKey = key;
      return 1;
    },
    locator(_selector: string) {
      const keyAtBind = lastMarkedKey;
      return {
        async count() {
          return keyAtBind ? 1 : 0;
        },
        async click() {
          if (!keyAtBind) throw new Error("no marked element");
          if (keyAtBind === CODE_TAB_POSTS) state.onPostsTab = true;
          if (keyAtBind === CODE_SUBTAB_LIST) state.onListSubtab = true;
          // 导出点了也**不 fire download**(模拟频控:点了但下载迟迟不来 → 超时)。
        },
      };
    },
    async waitForEvent(
      _e: "download",
      opts?: { timeout?: number },
    ): Promise<{ path(): Promise<string> }> {
      return await new Promise((_resolve, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                'page.waitForEvent: Timeout exceeded while waiting for event "download"',
              ),
            ),
          opts?.timeout ?? 50,
        );
      });
    },
    async screenshot() {
      return undefined;
    },
  };
  const ctx = {
    pages() {
      return [page];
    },
    async newPage() {
      return page;
    },
    async cookies() {
      return [{ name: "sessionid" }];
    },
    async close() {
      return undefined;
    },
  };
  type InjectedOpenCtx = NonNullable<
    Parameters<typeof fetchDouyinWorkListExport>[1]
  >["openContext"];
  type InjectedCtx = Awaited<ReturnType<NonNullable<InjectedOpenCtx>>>;
  const openContext: NonNullable<InjectedOpenCtx> = async () =>
    ctx as unknown as InjectedCtx;
  const readFile = async () => new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  return { openContext, readFile };
}

// ── [gate-F5] dispatch 采集串行闸(concurrency 1)──────────────────────────────────
// 复刻 persistence-client 的 module 级 collectionRunTail 串行闸模式:并发投 2 个采集 →
// 断言第二个等第一个跑完才开始(同时只跑一个采集 job)。

/** 与 persistence-client enqueueCollectionRun 同款:一条 promise 链尾,concurrency=1。 */
function makeSerialGate() {
  let tail: Promise<void> = Promise.resolve();
  const enqueue = (run: () => Promise<void>): void => {
    tail = tail.then(
      () => run(),
      () => run(),
    );
    tail = tail.catch(() => {});
  };
  return { enqueue };
}

describe("[gate-F5] dispatch 采集串行闸 concurrency=1", () => {
  it("并发投 2 个采集 job → 第二个等第一个跑完(同时只跑一个)", async () => {
    const { enqueue } = makeSerialGate();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((r) => {
      releaseFirst = r;
    });

    // job A:进入后挂起(等 releaseFirst),证明它"在跑"时 B 还没开始。
    enqueue(async () => {
      events.push("A:start");
      await firstGate;
      events.push("A:end");
    });
    // job B:紧接着投递。
    enqueue(async () => {
      events.push("B:start");
      events.push("B:end");
    });

    // 让微任务推进:此刻 A 已 start 并挂起,B 绝不能 start(串行闸)。
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(["A:start"]); // B 尚未开始 —— 串行闸挡住

    // 放行 A → A 完成后 B 才开始。
    releaseFirst();
    // 等链尾结算(多轮 flush)。
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(events).toEqual(["A:start", "A:end", "B:start", "B:end"]);
  });

  it("第一个 job 抛错也不堵死后续(链尾 catch 兜底)", async () => {
    const { enqueue } = makeSerialGate();
    const events: string[] = [];
    enqueue(async () => {
      events.push("A:throw");
      throw new Error("A 采集失败");
    });
    enqueue(async () => {
      events.push("B:ran"); // A 失败后 B 仍应跑(fire-and-forget 不堵死)
    });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(events).toEqual(["A:throw", "B:ran"]);
  });
});

// ── withDouyinChannel 直测(报告后仍抛 + instant no-op 不节流)────────────────────
describe("withDouyinChannel 语义", () => {
  it("成功:acquire → fn → report('ok') → 返回结果", async () => {
    const spy = makeSpyGateway();
    const r = await withDouyinChannel(spy.gateway, "creator-center", async () => 42);
    expect(r).toBe(42);
    expect(spy.calls).toEqual([
      { op: "acquire", channel: "creator-center" },
      { op: "report", channel: "creator-center", outcome: "ok" },
    ]);
  });

  it("失败:report(classify(mapErr)) 后**仍抛原错**(不吞)", async () => {
    const spy = makeSpyGateway();
    const boom = new Error("原始错误");
    await expect(
      withDouyinChannel(
        spy.gateway,
        "iesdouyin",
        async () => {
          throw boom;
        },
        () => ({ kind: "router-data-missing" }),
      ),
    ).rejects.toBe(boom); // 同一个错误对象抛出(证明没吞、没包)
    expect(spy.reports("iesdouyin")).toEqual(["throttled"]);
  });

  it("instantNoopGateway:acquire 立即放行、report 无副作用(既有测靠它零回归)", async () => {
    let ran = false;
    const r = await withDouyinChannel(instantNoopGateway, "creator-center", async () => {
      ran = true;
      return "ok";
    });
    expect(ran).toBe(true);
    expect(r).toBe("ok");
  });
});
