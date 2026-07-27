import { describe, expect, it } from "vitest";

import {
  discoverSameOriginFeedUrl,
  isSyndicationFeed,
} from "./feed-discovery";

describe("discoverSameOriginFeedUrl", () => {
  it("识别属性顺序不同的同源 RSS alternate", () => {
    const html = `
      <html><head>
        <link href="/feeds/all.xml" title="全部" type="application/rss+xml" rel="alternate">
      </head></html>
    `;
    expect(
      discoverSameOriginFeedUrl(html, "https://example.com/articles"),
    ).toBe("https://example.com/feeds/all.xml");
  });

  it("EdgeOne 挑战页只回退到同源 /feed.xml", () => {
    const html = `<script>document.cookie = "EO_Bot_Ssid=challenge";</script>`;
    expect(
      discoverSameOriginFeedUrl(html, "https://aihot.virxact.com/"),
    ).toBe("https://aihot.virxact.com/feed.xml");
  });

  it("拒绝跨源 alternate，避免服务端被页面引向第三方", () => {
    const html = `<link rel="alternate" type="application/atom+xml" href="https://evil.example/feed">`;
    expect(discoverSameOriginFeedUrl(html, "https://example.com/")).toBeNull();
  });

  it("普通 HTML 没有公开 feed 时不猜测", () => {
    expect(
      discoverSameOriginFeedUrl("<html><body>文章</body></html>", "https://example.com/"),
    ).toBeNull();
  });
});

describe("isSyndicationFeed", () => {
  it("识别 RSS 与 Atom，不把普通 HTML 当 feed", () => {
    expect(isSyndicationFeed('<?xml version="1.0"?><rss version="2.0"></rss>')).toBe(true);
    expect(isSyndicationFeed('<feed xmlns="http://www.w3.org/2005/Atom"></feed>')).toBe(true);
    expect(isSyndicationFeed("<html><body>feed</body></html>")).toBe(false);
  });
});
