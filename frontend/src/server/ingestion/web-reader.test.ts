import { describe, it, expect, vi } from "vitest";

import {
  extractChatGptShare,
  extractChatGptShareSsr,
  formatChatTurns,
  harvestChatGptTurnsInPage,
  extractReadable,
  readUrl,
  WebReaderLoginRequiredError,
  type ReaderCapableContext,
  type ReaderCapablePage,
} from "./web-reader";
import { WebCaptureError } from "./web-capture";

// [T-217b] Web Reader:抽取器纯函数 + readUrl 三墙分类/抽取器选择(openContext 注 fake page,
// 不起真浏览器)。

// [T-326·RT-H04] 默认 SSRF 守卫会 DNS 解析域名 —— mock 掉 node:dns/promises 让既有用例的
// example.com / chatgpt.com 等域名都「解析到公网 IP」,单测不打真 DNS、不受网络环境影响。
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

describe("extractChatGptShare", () => {
  it("从 __NEXT_DATA__ SSR JSON 抽逐轮对话全文", () => {
    const payload = {
      props: {
        pageProps: {
          serverResponse: {
            data: {
              mapping: {
                a: { message: { author: { role: "user" }, content: { parts: ["帮我想三个选题"] } } },
                b: { message: { author: { role: "assistant" }, content: { parts: ["选题一…\n选题二…"] } } },
              },
            },
          },
        },
      },
    };
    const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script></body></html>`;
    const text = extractChatGptShare(html);
    expect(text).toContain("用户:");
    expect(text).toContain("帮我想三个选题");
    expect(text).toContain("ChatGPT:");
    expect(text).toContain("选题一");
  });

  it("无 __NEXT_DATA__ 时回落 data-message-author-role DOM", () => {
    const html = `
      <div data-message-author-role="user"><div>用户这句</div></div>
      <div data-message-author-role="assistant"><div>助手那句</div></div>
    `;
    const text = extractChatGptShare(html);
    expect(text).toContain("用户:");
    expect(text).toContain("用户这句");
    expect(text).toContain("ChatGPT:");
    expect(text).toContain("助手那句");
  });

  it("既无 NEXT_DATA 又无对话 DOM → null", () => {
    expect(extractChatGptShare("<html><body>空页</body></html>")).toBeNull();
  });
});

// ── [T-237] React Router 流式 SSR(turbo-stream 扁平引用池)fixture 工厂 ─────────
// 池布局:0 根 {serverResponse:…};对象 {"_K":V} 键=pool[K] 值=解引用 pool[V];数组=下标数组。
// 3 轮对话(user/assistant/user),走 linear_conversation 有序路径。
function makeTurboStreamPool(): unknown[] {
  return [
    /*0*/ { _1: 2 },
    /*1*/ "serverResponse",
    /*2*/ { _3: 4 },
    /*3*/ "data",
    /*4*/ { _5: 6, _23: 24 },
    /*5*/ "linear_conversation",
    /*6*/ [7, 14, 28],
    /*7*/ { _8: 9 },
    /*8*/ "message",
    /*9*/ { _10: 11, _12: 13 },
    /*10*/ "author",
    /*11*/ { _15: 16 },
    /*12*/ "content",
    /*13*/ { _17: 18 },
    /*14*/ { _8: 20 },
    /*15*/ "role",
    /*16*/ "user",
    /*17*/ "parts",
    /*18*/ [19],
    /*19*/ "帮我想三个选题",
    /*20*/ { _10: 21, _12: 22 },
    /*21*/ { _15: 25 },
    /*22*/ { _17: 26 },
    /*23*/ "mapping",
    /*24*/ {},
    /*25*/ "assistant",
    /*26*/ [27],
    /*27*/ '选题一:含 "引号" 与换行\n选题二:…',
    /*28*/ { _8: 29 },
    /*29*/ { _10: 11, _12: 30 },
    /*30*/ { _17: 31 },
    /*31*/ [32],
    /*32*/ "第二个更好,展开讲讲",
  ];
}

/** 把池 JSON 转成 enqueue("…") 的 JS 字符串字面量脚本;chunkAt 处切成两片模拟流式分片。 */
function makeStreamHtml(pool: unknown[], opts: { chunkAt?: number } = {}): string {
  const raw = JSON.stringify(pool) + "\nP99:[{}]\n"; // 尾随 Promise 延迟块,应被忽略
  const escaped = JSON.stringify(raw).slice(1, -1); // JS 字符串字面量转义(去掉外层引号)
  const cut = opts.chunkAt ?? Math.floor(escaped.length / 2);
  // 注意:不能切在 \x 转义序列中间 —— 往后挪到安全位置(非反斜杠后)。
  let safeCut = cut;
  while (escaped[safeCut - 1] === "\\") safeCut += 1;
  const parts =
    opts.chunkAt === 0 ? [escaped] : [escaped.slice(0, safeCut), escaped.slice(safeCut)];
  const scripts = parts
    .map(
      (p) =>
        `<script nonce="x">window.__reactRouterContext.streamController.enqueue("${p}");</script>`,
    )
    .join("\n");
  return `<html><body><div id="root"></div>${scripts}</body></html>`;
}

describe("extractChatGptShareSsr(React Router 流式 SSR,T-237 修①)", () => {
  it("从 streamController.enqueue 分片拼接的 turbo-stream 池抽全量有序轮次", () => {
    const html = makeStreamHtml(makeTurboStreamPool());
    const turns = extractChatGptShareSsr(html);
    expect(turns).not.toBeNull();
    expect(turns!).toHaveLength(3);
    expect(turns![0]).toEqual({ role: "user", text: "帮我想三个选题" });
    expect(turns![1].role).toBe("assistant");
    expect(turns![1].text).toContain('含 "引号" 与换行');
    expect(turns![2].text).toBe("第二个更好,展开讲讲");
    // 拼段落文本:角色前缀 + 无任何 HTML 标签泄漏
    const text = formatChatTurns(turns!);
    expect(text).toContain("用户:");
    expect(text).toContain("ChatGPT:");
    expect(text).not.toContain("<");
  });

  it("单片(不切分)同样解析", () => {
    const html = makeStreamHtml(makeTurboStreamPool(), { chunkAt: 0 });
    expect(extractChatGptShareSsr(html)).toHaveLength(3);
  });

  it("结构不符(池里没有 message 形状)→ 诚实返 null,不硬凑", () => {
    // 形如「对话已删除」页:serverResponse 只有 error 文案
    const pool = [
      { _1: 2 },
      "serverResponse",
      { _3: 4 },
      "error",
      "Conversation has been deleted. Start a new chat.",
    ];
    expect(extractChatGptShareSsr(makeStreamHtml(pool))).toBeNull();
  });

  it("主数组 JSON 断裂(分片缺失)→ null", () => {
    const html =
      '<script>window.__reactRouterContext.streamController.enqueue("[{\\"_1\\":2},\\"serverResp");</script>';
    expect(extractChatGptShareSsr(html)).toBeNull();
  });

  it("无 enqueue 脚本但有 __NEXT_DATA__(旧存档 HTML)→ 走历史结构兼容", () => {
    const payload = {
      props: {
        mapping: {
          a: { message: { author: { role: "user" }, content: { parts: ["老结构问题"] } } },
        },
      },
    };
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script>`;
    const turns = extractChatGptShareSsr(html);
    expect(turns).toHaveLength(1);
    expect(turns![0].text).toBe("老结构问题");
  });
});

describe("harvestChatGptTurnsInPage(页内 DOM 兜底,T-237 修②③;jsdom 直调)", () => {
  it("textContent 抽取:嵌套标签零泄漏 + 只收 user/assistant 非空轮", async () => {
    document.body.innerHTML = `
      <div data-message-author-role="user"><div class="x"><p>用户这句</p><code>&lt;div&gt;</code></div></div>
      <div data-message-author-role="assistant"><div><pre><span>助手</span>那句</pre></div></div>
      <div data-message-author-role="system"><div>隐藏系统消息</div></div>
      <div data-message-author-role="user"></div>
    `;
    const turns = await harvestChatGptTurnsInPage({ settleMs: 1, maxRounds: 5 });
    expect(turns).toHaveLength(2);
    expect(turns[0].role).toBe("user");
    expect(turns[0].text).toContain("用户这句");
    expect(turns[0].text).toContain("<div>"); // code 里的实体是**用户可见文本**,保留
    expect(turns[0].text).not.toContain("class="); // 但绝无标签属性/标签本体泄漏
    expect(turns[1].text).toContain("助手");
    const text = formatChatTurns(turns);
    expect(text).not.toContain("data-message-author-role");
  });

  it("计数稳定循环:等到懒渲染的后续轮次都出现才收(连续两轮计数不变)", async () => {
    document.body.innerHTML = `<div id="list"><div data-message-author-role="user"><p>第 1 轮</p></div></div>`;
    const p = harvestChatGptTurnsInPage({ settleMs: 30, maxRounds: 20 });
    // 模拟滚动触发的懒渲染:首轮 settle 后追加两轮
    await new Promise((r) => setTimeout(r, 40));
    document.getElementById("list")!.insertAdjacentHTML(
      "beforeend",
      `<div data-message-author-role="assistant"><p>第 2 轮</p></div>
       <div data-message-author-role="user"><p>第 3 轮</p></div>`,
    );
    const turns = await p;
    expect(turns).toHaveLength(3);
    expect(turns[2].text).toBe("第 3 轮");
  });

  it("maxRounds 上限防死循环:计数一直变也会在上限处收手返回", async () => {
    document.body.innerHTML = `<div id="list"><div data-message-author-role="user"><p>0</p></div></div>`;
    const feeder = setInterval(() => {
      document
        .getElementById("list")!
        .insertAdjacentHTML("beforeend", `<div data-message-author-role="assistant"><p>x</p></div>`);
    }, 5);
    try {
      const turns = await harvestChatGptTurnsInPage({ settleMs: 10, maxRounds: 3 });
      expect(turns.length).toBeGreaterThanOrEqual(1); // 收手即返回,不死循环
    } finally {
      clearInterval(feeder);
    }
  });
});

describe("extractReadable(jsdom + Readability)", () => {
  it("抽出文章正文纯文本(去 chrome)", async () => {
    const html = `<html><head><title>一篇文章</title></head><body>
      <nav>导航栏无关内容</nav>
      <article>
        <h1>一篇文章</h1>
        <p>这是第一段正文,足够长以便 Readability 认定为正文主体内容,继续写一些字撑够阈值。</p>
        <p>这是第二段正文,同样写足够多的字,保证抽取器判定这是文章主体而不是噪声区域。</p>
      </article>
    </body></html>`;
    const res = await extractReadable(html, "https://example.com/post");
    expect(res).not.toBeNull();
    expect(res!.text).toContain("第一段正文");
    expect(res!.text).toContain("第二段正文");
    expect(res!.text).not.toContain("导航栏无关内容");
  });
});

// fake page/ctx 工厂。
function makeCtx(page: Partial<ReaderCapablePage>): ReaderCapableContext {
  const full: ReaderCapablePage = {
    goto: vi.fn(async () => ({ status: () => 200, url: () => "https://example.com/post" })),
    url: () => "https://example.com/post",
    title: async () => "标题",
    content: async () => "<html></html>",
    waitForTimeout: vi.fn(async () => undefined),
    waitForSelector: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => undefined as never),
    ...page,
  };
  return {
    pages: () => [full],
    newPage: async () => full,
    close: async () => undefined,
  };
}

describe("readUrl(三墙分类 + 抽取器选择)", () => {
  it("非 http/https → WebCaptureError", async () => {
    await expect(readUrl("ftp://x.com", { authDir: "/tmp/x" })).rejects.toBeInstanceOf(
      WebCaptureError,
    );
  });

  it("HTTP 4xx → 带状态码 WebCaptureError", async () => {
    const ctx = makeCtx({
      goto: async () => ({ status: () => 403, url: () => "https://x.com/p" }),
    });
    await expect(
      readUrl("https://x.com/p", { authDir: "/tmp/x" }, { openContext: async () => ctx }),
    ).rejects.toThrow(/HTTP 403/);
  });

  it("登录墙命中 → WebReaderLoginRequiredError(结构化降级,带 domain)", async () => {
    const ctx = makeCtx({
      goto: async () => ({ status: () => 200, url: () => "https://chatgpt.com/share/x" }),
      url: () => "https://chatgpt.com/share/x",
      content: async () => "<html><body>请先登录后查看</body></html>",
    });
    const err = await readUrl(
      "https://chatgpt.com/share/x",
      { authDir: "/tmp/x" },
      { openContext: async () => ctx },
    ).catch((e) => e);
    expect(err).toBeInstanceOf(WebReaderLoginRequiredError);
    expect((err as WebReaderLoginRequiredError).domain).toBe("chatgpt.com");
  });

  it("chatgpt.com/share → 命中定制 extractor(逐轮对话)", async () => {
    const payload = {
      d: { m: { message: { author: { role: "user" }, content: { parts: ["你好"] } } } },
    };
    const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script></body></html>`;
    const ctx = makeCtx({
      goto: async () => ({ status: () => 200, url: () => "https://chatgpt.com/share/abc" }),
      url: () => "https://chatgpt.com/share/abc",
      title: async () => "分享对话",
      content: async () => html,
    });
    const res = await readUrl(
      "https://chatgpt.com/share/abc",
      { authDir: "/tmp/x" },
      { openContext: async () => ctx },
    );
    expect(res.extractor).toBe("chatgpt-share");
    expect(res.text).toContain("你好");
  });

  it("chatgpt.com/share·当前真实结构(React Router 流式 SSR)→ extractPath=ssr + turnCount 全量", async () => {
    const html = makeStreamHtml(makeTurboStreamPool());
    const ctx = makeCtx({
      goto: async () => ({ status: () => 200, url: () => "https://chatgpt.com/share/def" }),
      url: () => "https://chatgpt.com/share/def",
      title: async () => "分享对话",
      content: async () => html,
    });
    const res = await readUrl(
      "https://chatgpt.com/share/def",
      { authDir: "/tmp/x" },
      { openContext: async () => ctx },
    );
    expect(res.extractor).toBe("chatgpt-share");
    expect(res.extractPath).toBe("ssr");
    expect(res.turnCount).toBe(3);
    expect(res.text).toContain("第二个更好");
    expect(res.text).not.toContain("<div");
  });

  it("chatgpt.com/share·SSR 结构对不上 → 页内 evaluate DOM 兜底(extractPath=dom + turnCount)", async () => {
    const evaluate = vi.fn(async (fn: unknown) => {
      // readUrl 里有两处 evaluate:通用滚动(无参)与 harvest(带 opts)。按函数区分。
      if (fn === harvestChatGptTurnsInPage) {
        return [
          { role: "user", text: "第一轮" },
          { role: "assistant", text: "第二轮" },
          { role: "user", text: "第三轮" },
          { role: "assistant", text: "第四轮" },
        ] as never;
      }
      return undefined as never;
    });
    const ctx = makeCtx({
      goto: async () => ({ status: () => 200, url: () => "https://chatgpt.com/share/ghi" }),
      url: () => "https://chatgpt.com/share/ghi",
      title: async () => "分享对话",
      content: async () => "<html><body><div id='root'>纯客户端渲染,无 SSR 数据</div></body></html>",
      evaluate: evaluate as unknown as ReaderCapablePage["evaluate"],
    });
    const res = await readUrl(
      "https://chatgpt.com/share/ghi",
      { authDir: "/tmp/x" },
      { openContext: async () => ctx },
    );
    expect(res.extractor).toBe("chatgpt-share");
    expect(res.extractPath).toBe("dom");
    expect(res.turnCount).toBe(4);
    expect(res.text).toContain("用户:\n第一轮");
    expect(res.text).toContain("ChatGPT:\n第四轮");
  });

  it("普通文章 → 通用 Readability 兜底", async () => {
    const html = `<html><head><title>博文</title></head><body><article>
      <p>这是一段足够长的正文内容,让 Readability 判定为文章主体,继续补字凑够阈值继续补字。</p>
      <p>第二段也写足够长的正文内容,确保通用抽取器返回非空正文文本给上层落库。</p>
    </article></body></html>`;
    const ctx = makeCtx({
      goto: async () => ({ status: () => 200, url: () => "https://blog.example.com/p" }),
      url: () => "https://blog.example.com/p",
      title: async () => "博文",
      content: async () => html,
    });
    const res = await readUrl(
      "https://blog.example.com/p",
      { authDir: "/tmp/x" },
      { openContext: async () => ctx },
    );
    expect(res.extractor).toBe("readability");
    expect(res.text).toContain("正文内容");
  });
});

// ── [T-239c S2] 长工具可中断:readUrl 的 AbortSignal 提前退出 ─────────────────────────
describe("[T-239c] readUrl — AbortSignal 提前退出", () => {
  it("入口已中断的 signal → 立刻抛 AbortError,不起浏览器", async () => {
    const openContext = vi.fn(async () => makeCtx({}));
    const ac = new AbortController();
    ac.abort();
    await expect(
      readUrl(
        "https://example.com/post",
        { authDir: "/tmp/x", signal: ac.signal },
        { openContext },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(openContext).not.toHaveBeenCalled();
  });

  it("导航挂起时中断 → 关 context 让 goto reject,改抛 AbortError(不误报「页面打不开」)", async () => {
    let rejectGoto: ((e: Error) => void) | null = null;
    const base = makeCtx({
      goto: () =>
        new Promise((_resolve, reject) => {
          rejectGoto = reject;
        }),
    });
    const ctx = {
      ...base,
      close: async () => {
        rejectGoto?.(new Error("Target page, context or browser has been closed"));
      },
    };
    const ac = new AbortController();
    const pending = readUrl(
      "https://example.com/post",
      { authDir: "/tmp/x", signal: ac.signal },
      { openContext: async () => ctx },
    );
    await new Promise((r) => setTimeout(r, 10));
    ac.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

// ── [T-326·RT-H04] SSRF 守卫接入 readUrl:私网/元数据前置拒(不开浏览器)+ 重定向逐跳复检 ──
describe("[T-326·RT-H04] readUrl — SSRF 守卫", () => {
  it("私网/回环/元数据目标 → WebCaptureError(SSRF),且不开浏览器", async () => {
    for (const url of [
      "http://127.0.0.1:8080/admin",
      "http://10.0.0.5/",
      "http://192.168.1.1/router",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://localhost:3000/",
    ]) {
      const openContext = vi.fn(async () => makeCtx({}));
      await expect(
        readUrl(url, { authDir: "/tmp/x" }, { openContext }),
      ).rejects.toBeInstanceOf(WebCaptureError);
      expect(openContext).not.toHaveBeenCalled(); // 起浏览器之前就拒
    }
  });

  it("合法公网 URL(域名解析到公网 IP)→ 放行,正常读到正文(不误杀)", async () => {
    const ctx = makeCtx({
      goto: async () => ({ status: () => 200, url: () => "https://blog.example.com/p" }),
      url: () => "https://blog.example.com/p",
      content: async () =>
        `<html><head><title>好文</title></head><body><article><h1>好文</h1>${"<p>这是一段足够长的正文内容,用来让 Readability 认定这是文章主体。</p>".repeat(8)}</article></body></html>`,
    });
    const res = await readUrl(
      "https://blog.example.com/p",
      { authDir: "/tmp/x" },
      { openContext: async () => ctx },
    );
    expect(res.extractor).toBe("readability");
    expect(res.text).toContain("正文内容");
  });

  it("重定向到私网/元数据地址 → 逐跳复检拒绝,正文绝不返回", async () => {
    // 伪造 Playwright 重定向链:公网起跳 → 169.254.169.254 → 公网落地(finalUrl 公网,
    // 只查 finalUrl 会漏 —— 必须逐跳复检才拦得住)。
    const first = {
      url: () => "https://example.com/start",
      redirectedFrom: () => null,
    };
    const meta = {
      url: () => "http://169.254.169.254/latest/meta-data/",
      redirectedFrom: () => first,
    };
    const finalReq = {
      url: () => "https://example.com/landing",
      redirectedFrom: () => meta,
    };
    const content = vi.fn(async () => "<html><body>敏感元数据</body></html>");
    const ctx = makeCtx({
      goto: async () => ({
        status: () => 200,
        url: () => "https://example.com/landing",
        request: () => finalReq,
      }),
      url: () => "https://example.com/landing",
      content,
    });
    await expect(
      readUrl("https://example.com/start", { authDir: "/tmp/x" }, { openContext: async () => ctx }),
    ).rejects.toThrow(/SSRF/);
    expect(content).not.toHaveBeenCalled(); // 正文抽取根本没跑
  });

  it("重定向落到私网 finalUrl(fake resp 无 request 链)→ finalUrl 复检也拦得住", async () => {
    const ctx = makeCtx({
      goto: async () => ({ status: () => 200, url: () => "http://10.0.0.8/internal" }),
      url: () => "http://10.0.0.8/internal",
    });
    await expect(
      readUrl("https://example.com/jump", { authDir: "/tmp/x" }, { openContext: async () => ctx }),
    ).rejects.toThrow(/SSRF/);
  });
});
