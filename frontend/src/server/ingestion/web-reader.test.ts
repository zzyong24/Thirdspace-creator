import { describe, it, expect, vi } from "vitest";

import {
  extractChatGptShare,
  extractReadable,
  readUrl,
  WebReaderLoginRequiredError,
  type ReaderCapableContext,
  type ReaderCapablePage,
} from "./web-reader";
import { WebCaptureError } from "./web-capture";

// [T-217b] Web Reader:抽取器纯函数 + readUrl 三墙分类/抽取器选择(openContext 注 fake page,
// 不起真浏览器)。

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
