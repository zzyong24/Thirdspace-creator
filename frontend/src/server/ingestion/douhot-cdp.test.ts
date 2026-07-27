import type { Page } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";

import {
  fetchDouhotLowFollowerBreakout,
  loginDouhot,
  parseDouhotBillboard,
} from "./douhot-cdp";
import { DouyinNotLoggedInError } from "./douyin-errors";

function createFakePage(options: {
  url?: string;
  title?: string;
  oauthBodyVisible?: boolean;
  boardVisible?: boolean;
  boardClickFails?: boolean;
  windowVisible?: boolean;
}) {
  const close = vi.fn(async () => {});
  const fill = vi.fn(async () => {});
  const waitForTimeout = vi.fn(async () => {});
  const boardClick = vi.fn(async () => {
    if (options.boardClickFails) throw new Error("click failed");
  });
  const windowClick = vi.fn(async () => {});

  const page = {
    context: () => ({
      cookies: async () => [{ name: "sessionid", value: "sensitive" }],
    }),
    on: vi.fn(),
    off: vi.fn(),
    goto: vi.fn(async () => null),
    url: () => options.url ?? "https://douhot.douyin.com/",
    title: async () => options.title ?? "生活服务热点中心",
    getByText: (label: RegExp) => {
      const isOauthBody = label.test(
        "使用抖音账号登录 生活服务热点中心",
      );
      const isBoard = label.test("低粉爆款");
      const isWindow = label.test("近 2 天");
      const visible =
        (isOauthBody && options.oauthBodyVisible === true) ||
        (isBoard && options.boardVisible === true) ||
        (isWindow && options.windowVisible === true);
      const click = isBoard ? boardClick : windowClick;
      return {
        first: () => ({
          isVisible: async () => visible,
          click,
        }),
      };
    },
    locator: () => ({
      filter: () => ({
        first: () => ({
          isVisible: async () => true,
          fill,
          press: vi.fn(async () => {}),
        }),
      }),
    }),
    waitForTimeout,
  } as unknown as Page;

  return { page, close, fill, waitForTimeout, boardClick, windowClick };
}

describe("T-482 热点宝低粉爆款响应解析", () => {
  it("只接受 code/data/objs，并保留 0 粉与未知粉丝的区别", () => {
    const parsed = parseDouhotBillboard(
      {
        code: 0,
        data: {
          objs: [
            {
              item_id: "item-zero",
              item_title: "零粉作品",
              item_url: "https://www.douyin.com/video/item-zero",
              fans_cnt: 0,
              like_cnt: 1200,
              comment_cnt: 12,
              publish_time: 1_800_000_000,
            },
            {
              item_id: "item-unknown",
              item_title: "粉丝未知作品",
              like_cnt: 3000,
              publish_time: 1_800_000_000,
            },
          ],
        },
      },
      {
        page: 1,
        page_size: 30,
        date_window: "2d",
        sub_type: "low_follower_breakout",
        keyword: "AI 写作",
      },
    );

    expect(parsed).toMatchObject({
      listValid: true,
      officialWindow: "2d",
      windowHours: 48,
      responseShape: "code/data/objs",
    });
    expect(parsed.candidates).toHaveLength(2);
    expect(parsed.candidates[0]).toMatchObject({
      itemId: "item-zero",
      followerCount: 0,
      likeCount: 1200,
      commentCount: 12,
    });
    expect(parsed.candidates[1]).toMatchObject({
      itemId: "item-unknown",
      followerCount: null,
    });
  });

  it("缺失 objs 或非零 code 时返回无效证据，不折叠成合法空榜", () => {
    expect(
      parseDouhotBillboard(
        { code: 500, data: {} },
        { date_window: 2 },
      ),
    ).toMatchObject({
      listValid: false,
      responseShape: "invalid-code/data/objs",
      candidates: [],
    });
  });
});

describe("T-546 热点宝真实登录与榜单交互", () => {
  it("使用同一采集账号 profile 打开热点宝授权页，授权回跳后才报告成功", async () => {
    let currentUrl =
      "https://open.douyin.com/platform/oauth/pc/auth?client_key=sensitive";
    const close = vi.fn(async () => {});
    const page = {
      goto: vi.fn(async () => null),
      url: () => currentUrl,
      title: async () => (currentUrl.includes("open.douyin.com") ? "抖音授权" : "生活服务热点中心"),
      getByText: () => ({
        first: () => ({ isVisible: async () => false }),
      }),
      waitForTimeout: vi.fn(async () => {
        currentUrl = "https://douhot.douyin.com/";
      }),
    } as unknown as Page;

    await expect(
      loginDouhot(
        { authDir: "/tmp/account-scoped-auth", timeoutSec: 3 },
        { openPage: async () => ({ page, close }) },
      ),
    ).resolves.toEqual({ loggedIn: true });
    expect(page.goto).toHaveBeenCalledWith(
      "https://douhot.douyin.com/",
      expect.objectContaining({ waitUntil: "domcontentloaded" }),
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("最终跳转到 open.douyin OAuth 授权页时归类为未登录，且不泄露 query", async () => {
    const fake = createFakePage({
      url: "https://open.douyin.com/platform/oauth/pc/auth?client_key=sensitive-client&state=sensitive-state",
      title: "抖音授权",
    });

    const result = fetchDouhotLowFollowerBreakout(
      {
        authDir: "/tmp/fake-auth",
        keyword: "AI",
        board: "low_follower_breakout",
      },
      { openPage: async () => fake },
    );

    await expect(result).rejects.toBeInstanceOf(DouyinNotLoggedInError);
    await expect(result).rejects.not.toThrow(/sensitive-client|sensitive-state/);
    expect(fake.fill).not.toHaveBeenCalled();
    expect(fake.close).toHaveBeenCalledOnce();
  });

  it("授权登录标题和正文也归类为未登录，不误报页面结构变化", async () => {
    const fake = createFakePage({
      title: "抖音授权",
      oauthBodyVisible: true,
    });

    await expect(
      fetchDouhotLowFollowerBreakout(
        {
          authDir: "/tmp/fake-auth",
          keyword: "AI",
          board: "low_follower_breakout",
        },
        { openPage: async () => fake },
      ),
    ).rejects.toBeInstanceOf(DouyinNotLoggedInError);
    expect(fake.fill).not.toHaveBeenCalled();
  });

  it("低粉榜单入口不存在或点击失败时立即显式报结构变化", async () => {
    for (const fake of [
      createFakePage({ boardVisible: false }),
      createFakePage({ boardVisible: true, boardClickFails: true }),
    ]) {
      await expect(
        fetchDouhotLowFollowerBreakout(
          {
            authDir: "/tmp/fake-auth",
            keyword: "AI",
            board: "low_follower_breakout",
          },
          { openPage: async () => fake },
        ),
      ).rejects.toMatchObject({
        name: "DouhotResponseShapeChangedError",
        message: "热点宝低粉爆款榜单入口不可用",
      });
      expect(fake.fill).not.toHaveBeenCalled();
      expect(fake.waitForTimeout).not.toHaveBeenCalled();
    }
  });

  it("48 小时时间窗入口不存在时立即显式报结构变化", async () => {
    const fake = createFakePage({
      boardVisible: true,
      windowVisible: false,
    });

    await expect(
      fetchDouhotLowFollowerBreakout(
        {
          authDir: "/tmp/fake-auth",
          keyword: "AI",
          board: "low_follower_breakout",
        },
        { openPage: async () => fake },
      ),
    ).rejects.toMatchObject({
      name: "DouhotResponseShapeChangedError",
      message: "热点宝 48 小时时间窗入口不可用",
    });
    expect(fake.fill).not.toHaveBeenCalled();
    expect(fake.waitForTimeout).not.toHaveBeenCalled();
  });
});
