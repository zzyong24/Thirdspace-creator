import { describe, it, expect } from "vitest";
import {
  parseWorkList,
  parseDetail,
  toMetricRecords,
  parseCommentList,
  ingestComments,
  fetchDouyinComments,
  fetchDouyinCommentsForWorks,
  DouyinNotLoggedInError,
  parseDouyinVideoUrl,
  DouyinAudioFetchError,
  fetchDouyinWorkListExport,
  isXlsxBytes,
  DouyinExportError,
  type DouyinDetail,
  type CommentRecord,
  type CommentIngestPorts,
} from "./douyin-cdp";

// 真实 work_list XHR 形状的 fixture(对齐 cheat-on-content 抓到的字段)。
const WORK_LIST = {
  aweme_list: [
    {
      aweme_id: "7400000000000000001",
      desc: "为什么你的 Agent 总跑偏",
      create_time: 1717000000,
      video: { duration: 185000 },
      statistics: {
        play_count: 128000,
        digg_count: 5400,
        comment_count: 320,
        share_count: 210,
        collect_count: 1800,
      },
    },
    {
      // 字段缺失 / 字符串数字 → 兜底取 0 / 解析。
      item_id: "7400000000000000002",
      title: "RAG 最小实现",
      statistics: { play_count: "86,000", digg_count: 3100 },
    },
    { desc: "无 id 的脏数据应被丢弃" },
  ],
  has_more: false,
};

describe("douyin-cdp 纯函数", () => {
  it("parseWorkList 抽取作品 + 字段兜底 + 丢弃无 id", () => {
    const works = parseWorkList(WORK_LIST);
    expect(works).toHaveLength(2); // 第三条无 id 被丢
    const [a, b] = works;
    expect(a.awemeId).toBe("7400000000000000001");
    expect(a.stats.views).toBe(128000);
    expect(a.stats.favorites).toBe(1800);
    expect(a.durationSec).toBe(185); // 185000ms → 185s
    // 第二条:item_id 兜底 + 字符串 "86,000" → 86000 + 缺失字段 → 0
    expect(b.awemeId).toBe("7400000000000000002");
    expect(b.stats.views).toBe(86000);
    expect(b.stats.comments).toBe(0);
  });

  it("parseWorkList 对空/脏 JSON 容错(返回 [])", () => {
    expect(parseWorkList(null)).toEqual([]);
    expect(parseWorkList({})).toEqual([]);
    expect(parseWorkList({ aweme_list: "not-an-array" })).toEqual([]);
  });

  it("parseDetail 抽完播/转粉 + 缺字段记 null", () => {
    const d1 = parseDetail(
      { data: { finish_rate: 0.42, fans_increment: 120 } },
      "7400000000000000001",
    );
    expect(d1.finishRate).toBe(0.42);
    expect(d1.followerGain).toBe(120);
    const d2 = parseDetail({}, "x");
    expect(d2.finishRate).toBeNull();
    expect(d2.followerGain).toBeNull();
  });

  it("toMetricRecords 映射成 MetricRecord(键名对齐 seed,detail 可选合并)", () => {
    const works = parseWorkList(WORK_LIST);
    const details = new Map<string, DouyinDetail>([
      [
        "7400000000000000001",
        { awemeId: "7400000000000000001", finishRate: 0.42, followerGain: 120 },
      ],
    ]);
    const records = toMetricRecords(works, details, "2026-06-29T00:00:00.000Z");
    expect(records).toHaveLength(2);
    const r0 = records[0];
    expect(r0.platform).toBe("douyin");
    expect(r0.externalId).toBe("7400000000000000001");
    expect(r0.capturedAt).toBe("2026-06-29T00:00:00.000Z");
    expect(r0.metrics).toMatchObject({
      views: 128000,
      likes: 5400,
      comments: 320,
      shares: 210,
      favorites: 1800,
      finish_rate: 0.42,
      follower_gain: 120,
    });
    // 第二条无 detail → 不含 finish_rate/follower_gain 键。
    expect(records[1].metrics.finish_rate).toBeUndefined();
    expect(records[1].metrics.views).toBe(86000);
  });
});

// 真实创作者中心评论 list XHR 形状的 fixture(对齐 cheat-on-content
// `_normalize_comment_creator`:cid / text / digg_count / create_time / user.nickname)。
const COMMENT_LIST = {
  comments: [
    {
      cid: "7500000000000000001",
      aweme_id: "7400000000000000001",
      text: "这个 Agent 教程太实用了,求一期 RAG 落地",
      digg_count: 42,
      reply_comment_total: 3,
      create_time: 1717001000,
      user: { uid: "u-1", nickname: "小明产品笔记" },
      ip_label: "浙江",
    },
    {
      // 字段缺失 / 别名键(comment_id / content / like_count)→ 兜底解析。
      comment_id: "7500000000000000002",
      item_id: "7400000000000000001",
      content: "第二条评论用 content 字段",
      like_count: 7,
      user_info: { user_id: "u-2", name: "阿强" },
    },
    { cid: "", text: "无 cid 脏数据丢弃" }, // 无 commentId → 丢
    { cid: "7500000000000000003", text: "   " }, // 正文空白 → 丢(rawText 不能空)
  ],
};

describe("parseCommentList 纯函数(评论解析,T-007 D2)", () => {
  it("抽取评论 + 字段兜底 + 丢弃无 id/空正文", () => {
    const comments = parseCommentList(COMMENT_LIST);
    expect(comments).toHaveLength(2); // 后两条脏数据被丢
    const [a, b] = comments;
    expect(a.commentId).toBe("7500000000000000001");
    expect(a.awemeId).toBe("7400000000000000001");
    expect(a.text).toContain("Agent 教程");
    expect(a.likeCount).toBe(42);
    expect(a.replyCount).toBe(3);
    expect(a.createTime).toBe(1717001000);
    expect(a.userId).toBe("u-1");
    expect(a.userName).toBe("小明产品笔记");
    expect(a.ipLabel).toBe("浙江");
    // 第二条:comment_id / content / like_count / user_info 别名键兜底 + 缺失字段 → 0/""
    expect(b.commentId).toBe("7500000000000000002");
    expect(b.text).toBe("第二条评论用 content 字段");
    expect(b.likeCount).toBe(7);
    expect(b.replyCount).toBe(0);
    expect(b.createTime).toBe(0);
    expect(b.userName).toBe("阿强");
    expect(b.ipLabel).toBe("");
  });

  it("defaultAwemeId 兜底(评论体无 aweme_id/item_id 时)", () => {
    const comments = parseCommentList(
      { comments: [{ cid: "c9", text: "无作品 id 的评论" }] },
      "7400000000000000009",
    );
    expect(comments[0].awemeId).toBe("7400000000000000009");
  });

  it("对空/脏 JSON 容错(返回 []),并支持 comment_list / data.comments 键", () => {
    expect(parseCommentList(null)).toEqual([]);
    expect(parseCommentList({})).toEqual([]);
    expect(parseCommentList({ comments: "not-an-array" })).toEqual([]);
    // comment_list 别名键
    expect(
      parseCommentList({ comment_list: [{ cid: "c1", text: "x" }] }),
    ).toHaveLength(1);
    // data.comments 嵌套键
    expect(
      parseCommentList({ data: { comments: [{ cid: "c2", text: "y" }] } }),
    ).toHaveLength(1);
  });
});

// fake CommentIngestPorts:内存模拟 run + ux_ingestion_records_run_key 去重 + 信号写。
// resolveMap(可选):aweme_id → publicationId(命中回填,未命中 null)。省略则不装
// resolvePublicationId port(D2 纯落库口径,publication_id 全留空)。
function makeFakePorts(resolveMap?: Record<string, string | null>) {
  const signals: Array<{
    source: string;
    rawText: string;
    runId: string;
    publicationId: string | null;
  }> = [];
  const ledger = new Set<string>(); // `${runId}::${recordKey}` = ux 去重锚
  const runs = new Map<string, string>(); // idempotencyKey → runId(建 run 幂等)
  let runSeq = 0;
  const calls = {
    createRun: 0,
    ingestSignal: 0,
    completeRun: 0,
    resolvePublicationId: 0,
  };
  const ports: CommentIngestPorts = {
    async createRun(input) {
      calls.createRun += 1;
      const existing = runs.get(input.idempotencyKey);
      if (existing) return { id: existing }; // 同幂等键取回原 run
      const id = `run-${++runSeq}`;
      runs.set(input.idempotencyKey, id);
      return { id };
    },
    async recordExists(runId, recordKey) {
      return ledger.has(`${runId}::${recordKey}`);
    },
    async markRecordWritten(runId, recordKey) {
      ledger.add(`${runId}::${recordKey}`);
    },
    async ingestSignal(input) {
      calls.ingestSignal += 1;
      signals.push({
        source: input.source,
        rawText: input.rawText,
        runId: input.ingestionRunId,
        publicationId: input.publicationId,
      });
    },
    async completeRun() {
      calls.completeRun += 1;
    },
    // 只有传入 resolveMap 时才装该 port(否则保持 D2 纯落库口径)。
    ...(resolveMap
      ? {
          async resolvePublicationId(awemeId: string) {
            calls.resolvePublicationId += 1;
            return resolveMap[awemeId] ?? null;
          },
        }
      : {}),
  };
  return { ports, signals, calls };
}

const CMT_FIXTURE: CommentRecord[] = [
  {
    commentId: "c-1",
    awemeId: "7400",
    text: "求 RAG 落地教程",
    likeCount: 42,
    replyCount: 3,
    createTime: 1717001000,
    userId: "u-1",
    userName: "小明",
    ipLabel: "浙江",
  },
  {
    commentId: "c-2",
    awemeId: "7400",
    text: "这条能变现吗",
    likeCount: 7,
    replyCount: 0,
    createTime: 1717002000,
    userId: "u-2",
    userName: "阿强",
    ipLabel: "",
  },
];

describe("ingestComments 落库 helper(fake ports,T-007 D2)", () => {
  it("建 run → 逐条评论写 audience_signal(source=comment) → completeRun", async () => {
    const { ports, signals, calls } = makeFakePorts();
    const res = await ingestComments("7400", CMT_FIXTURE, {
      ports,
      externalSourceId: "src-douyin",
      capturedAt: "2026-06-30T00:00:00.000Z",
    });
    expect(res.received).toBe(2);
    expect(res.written).toBe(2);
    expect(res.skipped).toBe(0);
    expect(signals).toHaveLength(2);
    // C-4:每条信号 source=comment 且带真 run id。
    expect(signals.every((s) => s.source === "comment")).toBe(true);
    expect(signals.every((s) => s.runId === res.runId)).toBe(true);
    expect(signals[0].rawText).toBe("求 RAG 落地教程");
    expect(calls.completeRun).toBe(1);
  });

  it("幂等:同评论(同 run 幂等键)跑两次只写一次(record_key 去重锚)", async () => {
    const { ports, signals } = makeFakePorts();
    const deps = {
      ports,
      externalSourceId: "src-douyin",
      capturedAt: "2026-06-30T00:00:00.000Z",
    };
    const first = await ingestComments("7400", CMT_FIXTURE, deps);
    expect(first.written).toBe(2);
    // 第二次同源同刻 → 取回同一 run,record_key 全命中 → 全跳过,不重复写信号。
    const second = await ingestComments("7400", CMT_FIXTURE, deps);
    expect(second.runId).toBe(first.runId); // 同一 run(建 run 幂等)
    expect(second.written).toBe(0);
    expect(second.skipped).toBe(2);
    expect(signals).toHaveLength(2); // 总信号数仍为 2,未翻倍
  });

  it("部分重复:混入 1 条新评论 → 只写新的那条", async () => {
    const { ports, signals } = makeFakePorts();
    const deps = {
      ports,
      externalSourceId: "src-douyin",
      capturedAt: "2026-06-30T00:00:00.000Z",
    };
    await ingestComments("7400", CMT_FIXTURE, deps);
    const withNew: CommentRecord[] = [
      ...CMT_FIXTURE,
      { ...CMT_FIXTURE[0], commentId: "c-3", text: "全新评论" },
    ];
    const res = await ingestComments("7400", withNew, deps);
    expect(res.written).toBe(1); // 只有 c-3 是新的
    expect(res.skipped).toBe(2); // c-1 / c-2 命中已写
    expect(signals).toHaveLength(3); // 累计 3 条(2 原 + 1 新)
    expect(signals[2].rawText).toBe("全新评论");
  });
});

describe("ingestComments 按 aweme_id 回填 publication_id(T-030 D6,F3)", () => {
  it("命中 imported 作品 publication → 每条信号带 publication_id(一次解析复用整批)", async () => {
    // aweme_id=7400 → publication pub-P(模拟 publications.externalId=aweme_id 命中)。
    const { ports, signals, calls } = makeFakePorts({ "7400": "pub-P" });
    const res = await ingestComments("7400", CMT_FIXTURE, {
      ports,
      externalSourceId: "src-douyin",
      capturedAt: "2026-06-30T00:00:00.000Z",
    });
    expect(res.written).toBe(2);
    expect(signals).toHaveLength(2);
    // 两条评论都回填同一 publication_id。
    expect(signals.every((s) => s.publicationId === "pub-P")).toBe(true);
    // 一次解析复用整批(按 aweme 而非按评论 resolve)。
    expect(calls.resolvePublicationId).toBe(1);
  });

  it("无匹配作品(未导入/未发布)→ publication_id 空,评论仍落库,不报错(F3)", async () => {
    // resolveMap 无该 aweme → 返回 null。评论照常写,只是不绑作品。
    const { ports, signals, calls } = makeFakePorts({ "9999": "pub-Q" });
    const res = await ingestComments("7400", CMT_FIXTURE, {
      ports,
      externalSourceId: "src-douyin",
      capturedAt: "2026-06-30T00:00:00.000Z",
    });
    expect(res.written).toBe(2); // 落库不受影响
    expect(signals.every((s) => s.publicationId === null)).toBe(true);
    expect(calls.resolvePublicationId).toBe(1);
  });

  it("未装 resolvePublicationId port(D2 纯落库口径)→ publication_id 全空,向后兼容", async () => {
    const { ports, signals, calls } = makeFakePorts(); // 不传 resolveMap
    const res = await ingestComments("7400", CMT_FIXTURE, {
      ports,
      externalSourceId: "src-douyin",
      capturedAt: "2026-06-30T00:00:00.000Z",
    });
    expect(res.written).toBe(2);
    expect(signals.every((s) => s.publicationId === null)).toBe(true);
    expect(calls.resolvePublicationId).toBe(0); // port 未装 → 不调用
  });
});

// —— 逐字稿取音频通路(T-030-D2,SPEC §5.2)——
// 真实 iesdouyin 分享页把视频信息挂在 `window._ROUTER_DATA = {...}</script>`。这里喂一段
// canned HTML(结构对齐 skill fetch_metadata 抽取的 loaderData → item_list[0] → play_addr),
// 断言 parseDouyinVideoUrl 抽出 playUrl 且已 playwm→play 去水印。纯函数,不走网络/不跑 ffmpeg。

function routerDataHtml(inner: unknown): string {
  return (
    "<!doctype html><html><head></head><body>" +
    `<script>window._ROUTER_DATA = ${JSON.stringify(inner)}</script>` +
    "</body></html>"
  );
}

describe("parseDouyinVideoUrl 纯函数(iesdouyin 取直链,T-030-D2)", () => {
  it("抽 play_addr 直链并 playwm→play 去水印 + 带封面", () => {
    const html = routerDataHtml({
      loaderData: {
        "video_(id)/page": {
          videoInfoRes: {
            item_list: [
              {
                aweme_id: "7400000000000000001",
                desc: "上下文工程",
                video: {
                  play_addr: {
                    url_list: [
                      "https://v3.douyinvod.com/xxx/?a=1&playwm=1&ratio=720p",
                    ],
                  },
                  cover: {
                    url_list: ["https://p3.douyinpic.com/cover.jpeg"],
                  },
                },
              },
            ],
          },
        },
      },
    });
    const out = parseDouyinVideoUrl(html);
    // 去水印:playwm → play(不留 playwm 子串)。
    expect(out.playUrl).toContain("play=1"); // "playwm=1" → "play=1"
    expect(out.playUrl).not.toContain("playwm");
    expect(out.playUrl.startsWith("https://")).toBe(true);
    expect(out.coverUrl).toBe("https://p3.douyinpic.com/cover.jpeg");
  });

  it("play_addr 为空时回退 download_addr", () => {
    const html = routerDataHtml({
      loaderData: {
        "video_(id)/page": {
          videoInfoRes: {
            item_list: [
              {
                video: {
                  play_addr: { url_list: [] },
                  download_addr: {
                    url_list: ["https://v3.douyinvod.com/dl/?playwm=2"],
                  },
                },
              },
            ],
          },
        },
      },
    });
    const out = parseDouyinVideoUrl(html);
    expect(out.playUrl).toContain("play=2");
    expect(out.playUrl).not.toContain("playwm");
    expect(out.coverUrl).toBeUndefined();
  });

  it("无 _ROUTER_DATA / item_list 空 → 抛 DouyinAudioFetchError", () => {
    expect(() => parseDouyinVideoUrl("<html>no router data</html>")).toThrow(
      DouyinAudioFetchError,
    );
    const emptyHtml = routerDataHtml({
      loaderData: { "video_(id)/page": { videoInfoRes: { item_list: [] } } },
    });
    expect(() => parseDouyinVideoUrl(emptyHtml)).toThrow(DouyinAudioFetchError);
  });
});

// —— 多作品复用单 context 抓评论(T-033b:72作品×独立浏览器 → 单 context 循环)——
// fake context/page:openContext 只应被调 1 次、close 1 次,循环内逐 awemeId 在同一 page 上
// 导航(goto)并触发一次评论 list XHR(response handler),parseCommentList 解析。断言不碰真抖音。

type FakeResponse = { url(): string; json(): Promise<unknown> };
type FakeResponseHandler = (resp: FakeResponse) => void;

/**
 * 建 fake context 工厂 + page:
 *  - 记录 openContext / close 调用次数(断言开一次、关一次);
 *  - page.goto 从 url 的 item_id 取出当前 awemeId → 触发一次评论 list XHR(命中
 *    COMMENT_LIST_HINTS 的 `/aweme/v1/web/comment/list/`),payload 每作品一条评论(cid/text
 *    按 aweme 派生),供 scrapeCommentsForWork 的 response handler 解析;
 *  - page.off 摘监听(模拟真 Page.off,验证逐作品清理监听不复用旧 handler);
 *  - loggedIn=false 时 cookies 返空 → 触发 DouyinNotLoggedInError。
 */
function makeFakeCommentContext(loggedIn: boolean) {
  const calls = { openContext: 0, close: 0, goto: 0 };
  const gotoUrls: string[] = [];
  let handlers: FakeResponseHandler[] = [];

  const page = {
    on(_event: "response", cb: FakeResponseHandler) {
      handlers.push(cb);
    },
    off(_event: "response", cb: FakeResponseHandler) {
      handlers = handlers.filter((h) => h !== cb);
    },
    async goto(url: string) {
      calls.goto += 1;
      gotoUrls.push(url);
      // 从 ?item_id=<aweme> 取当前作品 id(评论管理页每作品 item_id 过滤)。
      const m = /item_id=([^&]+)/.exec(url);
      const aweme = m ? decodeURIComponent(m[1]!) : "";
      // 触发一次评论 list XHR(命中 hint),payload 每作品一条评论(cid/text 按 aweme 派生)。
      const payload = {
        comments: [
          {
            cid: `cmt-${aweme}`,
            aweme_id: aweme,
            text: `评论-${aweme}`,
            digg_count: 1,
          },
        ],
      };
      const resp: FakeResponse = {
        url: () => "https://x/aweme/v1/web/comment/list/?count=20",
        json: () => Promise.resolve(payload),
      };
      // 只喂给当前注册的 handler(off 后旧 handler 不在册 → 不会被重复喂)。
      for (const h of handlers) h(resp);
      return undefined;
    },
    async waitForTimeout() {
      // 立即 resolve;让 response handler 里的 async 解析(microtask)在此 await 时结算。
      return undefined;
    },
    async evaluate() {
      return undefined as unknown;
    },
    mouse: {
      async wheel() {
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
    async cookies(_url: string) {
      return loggedIn ? [{ name: "sessionid" }] : [];
    },
    async close() {
      calls.close += 1;
    },
  };

  // 注入的 openContext 签名(从 fetchDouyinCommentsForWorks 第 3 参数 deps 提取,含内部
  // CommentCapableContext 返回类型;内部类型不导出,故经此提取拿到精确形状)。
  type InjectedOpenContext = NonNullable<
    Parameters<typeof fetchDouyinCommentsForWorks>[2]
  >["openContext"];
  type InjectedContext = Awaited<ReturnType<NonNullable<InjectedOpenContext>>>;

  const openContext: NonNullable<InjectedOpenContext> = async (
    _authDir,
    _headless,
  ) => {
    calls.openContext += 1;
    return ctx as unknown as InjectedContext;
  };

  return { calls, gotoUrls, openContext };
}

describe("fetchDouyinCommentsForWorks 复用单 context 跨作品(T-033b)", () => {
  it("openContext 开一次 → 循环 N 作品各 parse → close 一次", async () => {
    const { calls, gotoUrls, openContext } = makeFakeCommentContext(true);
    const awemeIds = ["7401", "7402", "7403"];
    const results = await fetchDouyinCommentsForWorks(
      awemeIds,
      { authDir: "/fake/.auth", maxPages: 1 },
      { openContext },
    );
    // 核心断言:整批只开一次浏览器、只关一次(取代 N 作品 × 独立浏览器)。
    expect(calls.openContext).toBe(1);
    expect(calls.close).toBe(1);
    // 每作品各导航一次(同一 context/page,goto 换页)。
    expect(calls.goto).toBe(awemeIds.length);
    // T-041:评论页 URL 从旧 content/comment-manage 改到 interactive/comment(旧的被重定向到 upload)。
    expect(gotoUrls.every((u) => u.includes("interactive/comment"))).toBe(true);
    // 逐作品 parse 出各自评论(按 aweme 派生的 cid/text,证明用对了每作品的 item_id)。
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.awemeId)).toEqual(awemeIds);
    for (const { awemeId, records } of results) {
      expect(records).toHaveLength(1);
      expect(records[0].commentId).toBe(`cmt-${awemeId}`);
      expect(records[0].awemeId).toBe(awemeId);
      expect(records[0].text).toBe(`评论-${awemeId}`);
    }
  });

  it("空作品列表 → 仍开一次做登录校验、关一次,返回空", async () => {
    const { calls, openContext } = makeFakeCommentContext(true);
    const results = await fetchDouyinCommentsForWorks(
      [],
      { authDir: "/fake/.auth" },
      { openContext },
    );
    expect(results).toEqual([]);
    expect(calls.openContext).toBe(1);
    expect(calls.close).toBe(1);
    expect(calls.goto).toBe(0); // 无作品 → 不导航
  });

  it("未登录 → 一次性抛 DouyinNotLoggedInError(不是每作品抛),仍 close 一次", async () => {
    const { calls, openContext } = makeFakeCommentContext(false);
    await expect(
      fetchDouyinCommentsForWorks(
        ["7401", "7402"],
        { authDir: "/fake/.auth" },
        { openContext },
      ),
    ).rejects.toBeInstanceOf(DouyinNotLoggedInError);
    expect(calls.openContext).toBe(1);
    expect(calls.close).toBe(1); // finally 仍关一次
    expect(calls.goto).toBe(0); // 登录校验先于任何作品导航 → 未抓任何作品
  });
});

describe("fetchDouyinComments 单作品复用注入 openContext(T-033b)", () => {
  it("单作品:openContext 一次 + goto 一次 + close 一次,parse 出该作品评论", async () => {
    const { calls, gotoUrls, openContext } = makeFakeCommentContext(true);
    const records = await fetchDouyinComments(
      { awemeId: "7409", authDir: "/fake/.auth", maxPages: 1 },
      { openContext },
    );
    expect(calls.openContext).toBe(1);
    expect(calls.close).toBe(1);
    expect(calls.goto).toBe(1);
    expect(gotoUrls[0]).toContain("item_id=7409");
    expect(records).toHaveLength(1);
    expect(records[0].commentId).toBe("cmt-7409");
  });
});

describe("isXlsxBytes(PK 头校验,T-030-D8a)", () => {
  it("PK\\x03\\x04 开头 → true;JSON/HTML → false", () => {
    expect(isXlsxBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBe(
      true,
    );
    // 登录态过期返 JSON `{` → 头不符。
    expect(isXlsxBytes(new Uint8Array([0x7b, 0x22, 0x6f, 0x6b]))).toBe(false);
    expect(isXlsxBytes(new Uint8Array([0x50, 0x4b]))).toBe(false); // 太短
  });
});

// fetchDouyinWorkListExport 的 fake page/context —— 建模 DATA-2 真机流程:导出**只有在**已切到
// 「投稿列表」子tab 后点「导出数据」才触发 download(默认落在直播场次 tab → 那的导出永不下载,
// 正是旧超时真因)。charCode marking → locator 可信点击的装配也一并覆盖。
const CODE_TAB_POSTS = [25237, 31295, 20316, 21697].join(",");
const CODE_SUBTAB_LIST = [25237, 31295, 21015, 34920].join(",");
const CODE_BTN_EXPORT = [23548, 20986, 25968, 25454].join(",");
// [T-036] 发布时间 range picker(present key "datepicker")+ 快捷选择「全部」preset。
const CODE_QUICK_ALL = [20840, 37096].join(",");
const KEY_DATEPICKER = "datepicker";

function makeFakeExportContext(config: {
  loggedIn: boolean;
  // 页面上"存在"的 charCode 目标(缺失的 evaluate 返回 0 命中,模拟"没这个控件/tab")。
  present: Set<string>;
  // xlsx 下载内容(默认真 PK 头 xlsx bytes)。
  downloadBytes?: Uint8Array;
}) {
  const calls = {
    goto: [] as string[],
    marked: [] as string[], // 每次 evaluate 命中并标记的 charCode key
    clicked: [] as string[], // 每次 locator click 点掉的 charCode key
    close: 0,
    waitForEventDownload: 0,
  };
  const state = {
    onPostsTab: false, // 点了投稿作品 tab 后,投稿列表子tab 才"出现"(真机:子tab 随视图渲染)
    onListSubtab: false,
    exportClicked: false,
    // [T-036] 发布时间 picker:点开容器 → 快捷选择面板可交互;点「全部」→ 范围全量并收面板。
    pickerOpen: false,
    rangeAll: false,
  };
  let lastMarkedKey: string | null = null;
  // download 事件的"信箱":waitForEvent 先挂 pending promise,导出点击时若在列表子tab 则 resolve;
  // 否则由 downloadTimeoutMs 触发 reject(真机:落错 tab → 永不下载 → 超时,正是旧 bug)。
  let fireDownload: (() => void) | null = null;

  // 某 charCode 集当前是否"可见"(建模真机:投稿列表子tab 只有点了投稿作品 tab 才渲染出来)。
  const isPresent = (key: string): boolean => {
    if (!config.present.has(key)) return false;
    if (key === CODE_SUBTAB_LIST && !state.onPostsTab) return false;
    return true;
  };

  const page = {
    async goto(url: string) {
      calls.goto.push(url);
      return undefined;
    },
    async waitForTimeout() {
      return undefined;
    },
    // 建模三种页内函数(按 arg 形状分派):
    //   ① number[]  → markElementByCharCodesInPage / hasVisibleByCharCodesInPage(靠调用位置区分不了,
    //      统一:present 里有 → 命中;mark 语义额外记 lastMarkedKey;hasVisible 语义只读)。为区分 mark
    //      与 hasVisible,用返回类型:生产 waitForVisible 只读 boolean、markAndClick 读 number —— 两者
    //      都靠 present 判定,这里 mark 时才置 lastMarkedKey(hasVisible 不置)。用 fn.name 区分。
    //   ② {exportCodes,refreshCodes} → markExportNearRefreshInPage(锚定投稿列表导出)。
    async evaluate(
      fn: ((codes: number[]) => number | boolean) | ((a: unknown) => number),
      arg: number[] | { exportCodes: number[]; refreshCodes: number[] } | null,
    ): Promise<number | boolean> {
      // [T-036] 发布时间 picker 语义(fn.name 分派,先于 arg 形状判断 —— markDatePickerInPage
      // 的 arg 是 null,落到 number[] 分支会炸)。
      if (fn.name === "markDatePickerInPage") {
        if (isPresent(KEY_DATEPICKER)) {
          lastMarkedKey = KEY_DATEPICKER;
          calls.marked.push(KEY_DATEPICKER);
          return 1;
        }
        lastMarkedKey = null;
        return 0;
      }
      if (fn.name === "markQuickPresetInPage") {
        const key = (arg as number[]).join(",");
        // 真机:快捷选择面板只有点开 picker 后才存在。
        if (state.pickerOpen && isPresent(key)) {
          lastMarkedKey = key;
          calls.marked.push(key);
          return 1;
        }
        lastMarkedKey = null;
        return 0;
      }
      // 导出就近锚点:{exportCodes,refreshCodes}
      if (arg && !Array.isArray(arg)) {
        const key = arg.exportCodes.join(",");
        // 只有在投稿列表视图(点了子tab)才认为锚到刷新旁的导出。
        if (state.onListSubtab && isPresent(key)) {
          lastMarkedKey = key;
          calls.marked.push(key);
          return 1;
        }
        lastMarkedKey = null;
        return 0;
      }
      const codes = arg as number[];
      const key = codes.join(",");
      const present = isPresent(key);
      // hasVisibleByCharCodesInPage(只读探针,不标记):靠函数名判定。
      if (fn.name === "hasVisibleByCharCodesInPage") {
        return present;
      }
      // markElementByCharCodesInPage(标记):present → 记 lastMarkedKey 返回 1。
      if (!present) {
        lastMarkedKey = null;
        return 0;
      }
      lastMarkedKey = key;
      calls.marked.push(key);
      return 1;
    },
    // 建模 locator('[data-cos-export-target]').click():点掉"上次被标记"的目标。
    locator(_selector: string) {
      const keyAtBind = lastMarkedKey;
      return {
        async count() {
          return keyAtBind ? 1 : 0;
        },
        async click() {
          if (!keyAtBind) throw new Error("no marked element to click");
          calls.clicked.push(keyAtBind);
          if (keyAtBind === CODE_TAB_POSTS) state.onPostsTab = true;
          if (keyAtBind === CODE_SUBTAB_LIST) state.onListSubtab = true;
          // [T-036] 点 picker 容器开面板;点「全部」应用全量范围并收面板(真机行为)。
          if (keyAtBind === KEY_DATEPICKER) state.pickerOpen = true;
          if (keyAtBind === CODE_QUICK_ALL) {
            state.rangeAll = true;
            state.pickerOpen = false;
          }
          if (keyAtBind === CODE_BTN_EXPORT) {
            state.exportClicked = true;
            // 真机:在投稿列表子tab 点导出才真触发 download 事件 → resolve 之前挂的 waitForEvent。
            if (state.onListSubtab && fireDownload) fireDownload();
          }
        },
      };
    },
    async waitForEvent(
      _event: "download",
      opts?: { timeout?: number },
    ): Promise<{ path(): Promise<string> }> {
      calls.waitForEventDownload += 1;
      // 挂 pending:导出点击(在列表子tab)时才 resolve;否则超时 reject。
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              'page.waitForEvent: Timeout exceeded while waiting for event "download"',
            ),
          );
        }, opts?.timeout ?? 1000);
        fireDownload = () => {
          clearTimeout(timer);
          resolve({ async path() { return "/tmp/fake/作品列表.xlsx"; } });
        };
      });
    },
    // 真 page 有 screenshot;这里也给一个(不影响,debugShot 受 env 门控默认不落图)。
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
    async cookies(_url: string) {
      return config.loggedIn ? [{ name: "sessionid" }] : [];
    },
    async close() {
      calls.close += 1;
    },
  };

  type InjectedOpenCtx = NonNullable<
    Parameters<typeof fetchDouyinWorkListExport>[1]
  >["openContext"];
  type InjectedCtx = Awaited<ReturnType<NonNullable<InjectedOpenCtx>>>;
  const openContext: NonNullable<InjectedOpenCtx> = async () => {
    return ctx as unknown as InjectedCtx;
  };
  const readFile = async () =>
    config.downloadBytes ?? new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02]);

  return { calls, state, openContext, readFile };
}

describe("fetchDouyinWorkListExport 导航到投稿列表再导出(T-033a,DATA-2 真机流程)", () => {
  it("完整流程:切投稿作品 tab → 投稿列表子tab → 可信点导出 → 截 xlsx bytes(PK 头过)", async () => {
    const { calls, openContext, readFile } = makeFakeExportContext({
      loggedIn: true,
      present: new Set([CODE_TAB_POSTS, CODE_SUBTAB_LIST, CODE_BTN_EXPORT]),
    });
    const bytes = await fetchDouyinWorkListExport(
      { authDir: "/fake/.auth" },
      { openContext, readFile, downloadTimeoutMs: 1000 },
    );
    expect(isXlsxBytes(bytes)).toBe(true);
    // 关键:导出前必须先点了投稿列表子tab(不然导出永不下载 —— 旧 bug)。
    expect(calls.clicked).toContain(CODE_SUBTAB_LIST);
    expect(calls.clicked).toContain(CODE_BTN_EXPORT);
    // 顺序:投稿列表子tab 的点击在导出点击之前。
    expect(calls.clicked.indexOf(CODE_SUBTAB_LIST)).toBeLessThan(
      calls.clicked.indexOf(CODE_BTN_EXPORT),
    );
    // 导航到旧版数据中心 URL(Garfish)。
    expect(calls.goto[0]).toContain("data-center/content");
    expect(calls.close).toBe(1);
  });

  it("[T-036] 带发布时间 picker 时:点开 → 快捷选择「全部」→ 才点导出(默认近90天只导 ~38/73)", async () => {
    const { calls, state, openContext, readFile } = makeFakeExportContext({
      loggedIn: true,
      present: new Set([
        CODE_TAB_POSTS,
        CODE_SUBTAB_LIST,
        CODE_BTN_EXPORT,
        KEY_DATEPICKER,
        CODE_QUICK_ALL,
      ]),
    });
    const bytes = await fetchDouyinWorkListExport(
      { authDir: "/fake/.auth" },
      { openContext, readFile, downloadTimeoutMs: 1000 },
    );
    expect(isXlsxBytes(bytes)).toBe(true);
    // 范围设成了全量(点了快捷选择「全部」)。
    expect(state.rangeAll).toBe(true);
    // 顺序:先设范围(picker → 全部)再点导出 —— 反了导的还是默认近90天。
    expect(calls.clicked.indexOf(KEY_DATEPICKER)).toBeLessThan(
      calls.clicked.indexOf(CODE_QUICK_ALL),
    );
    expect(calls.clicked.indexOf(CODE_QUICK_ALL)).toBeLessThan(
      calls.clicked.indexOf(CODE_BTN_EXPORT),
    );
  });

  it("[T-036] 页面没有发布时间 picker(版式变化)→ silent 跳过设范围,仍按默认范围导出成功", async () => {
    const { calls, state, openContext, readFile } = makeFakeExportContext({
      loggedIn: true,
      // 无 KEY_DATEPICKER / CODE_QUICK_ALL —— 设范围整段跳过,导出不受影响。
      present: new Set([CODE_TAB_POSTS, CODE_SUBTAB_LIST, CODE_BTN_EXPORT]),
    });
    const bytes = await fetchDouyinWorkListExport(
      { authDir: "/fake/.auth" },
      { openContext, readFile, downloadTimeoutMs: 1000 },
    );
    expect(isXlsxBytes(bytes)).toBe(true);
    expect(state.rangeAll).toBe(false);
    expect(calls.clicked).toContain(CODE_BTN_EXPORT);
  });

  it("找不到「投稿列表」子tab → 抛 DouyinExportError(不会盲点直播场次导出干等超时),仍 close 一次", async () => {
    const { calls, openContext, readFile } = makeFakeExportContext({
      loggedIn: true,
      // 缺投稿列表子tab(present 无 CODE_SUBTAB_LIST)。
      present: new Set([CODE_TAB_POSTS, CODE_BTN_EXPORT]),
    });
    await expect(
      fetchDouyinWorkListExport(
        { authDir: "/fake/.auth" },
        { openContext, readFile, downloadTimeoutMs: 1000 },
      ),
    ).rejects.toBeInstanceOf(DouyinExportError);
    expect(calls.close).toBe(1);
    // 未进列表视图 → 绝不点导出干等 download 超时。
    expect(calls.clicked).not.toContain(CODE_BTN_EXPORT);
  });

  it("下载内容非 xlsx(PK 头缺失,登录态过期返 JSON/HTML)→ 抛 DouyinExportError", async () => {
    const { openContext } = makeFakeExportContext({
      loggedIn: true,
      present: new Set([CODE_TAB_POSTS, CODE_SUBTAB_LIST, CODE_BTN_EXPORT]),
    });
    // readFile 返 JSON `{` 头 → isXlsxBytes false。
    const readFile = async () => new Uint8Array([0x7b, 0x22, 0x6f, 0x6b]);
    await expect(
      fetchDouyinWorkListExport(
        { authDir: "/fake/.auth" },
        { openContext, readFile, downloadTimeoutMs: 1000 },
      ),
    ).rejects.toBeInstanceOf(DouyinExportError);
  });

  it("未登录 → 抛 DouyinNotLoggedInError(runner catch → needs_reconnect),仍 close 一次", async () => {
    const { calls, openContext, readFile } = makeFakeExportContext({
      loggedIn: false,
      present: new Set([CODE_TAB_POSTS, CODE_SUBTAB_LIST, CODE_BTN_EXPORT]),
    });
    await expect(
      fetchDouyinWorkListExport(
        { authDir: "/fake/.auth" },
        { openContext, readFile },
      ),
    ).rejects.toBeInstanceOf(DouyinNotLoggedInError);
    expect(calls.close).toBe(1);
    expect(calls.goto).toHaveLength(0); // 登录校验先于任何导航
  });
});
