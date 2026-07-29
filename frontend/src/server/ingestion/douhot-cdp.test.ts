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
  userInfoCodes?: number[];
  billboardPayload?: unknown;
  billboardRequestBody?: unknown;
  billboardResponses?: Array<{
    payload: unknown;
    requestBody?: unknown;
  }>;
  inputVisibleAfterChecks?: number;
  visibleInputSelector?: string;
}) {
  const close = vi.fn(async () => {});
  const fill = vi.fn(async () => {});
  const waitForTimeout = vi.fn(async () => {});
  let responseHandler: ((response: unknown) => void) | null = null;
  let userInfoProbeCount = 0;
  let inputVisibilityChecks = 0;
  const inputSelectorCalls: string[] = [];
  const boardClick = vi.fn(async () => {
    if (options.boardClickFails) throw new Error("click failed");
  });
  const windowClick = vi.fn(async () => {});
  const press = vi.fn(async () => {
    if (!responseHandler) return;
    const responses =
      options.billboardResponses ??
      (options.billboardPayload
        ? [
            {
              payload: options.billboardPayload,
              requestBody:
                options.billboardRequestBody ?? { date_window: "2d" },
            },
          ]
        : []);
    for (const response of responses) {
      responseHandler({
        url: () =>
          "https://douhot.douyin.com/douhot/v1/material/video_billboard",
        status: () => 200,
        json: async () => response.payload,
        request: () => ({
          postDataJSON: () => response.requestBody,
        }),
      });
    }
  });

  const page = {
    context: () => ({
      cookies: async () => [{ name: "sessionid", value: "sensitive" }],
    }),
    on: vi.fn((event: string, handler: (response: unknown) => void) => {
      if (event === "response") responseHandler = handler;
    }),
    off: vi.fn(),
    goto: vi.fn(async () => null),
    url: () => options.url ?? "https://douhot.douyin.com/",
    title: async () => options.title ?? "生活服务热点中心",
    evaluate: vi.fn(async () => {
      const codes = options.userInfoCodes ?? [0];
      const code = codes[Math.min(userInfoProbeCount, codes.length - 1)];
      userInfoProbeCount += 1;
      return { httpStatus: 200, code };
    }),
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
    locator: (selector: string) => ({
      filter: () => ({
        first: () => ({
          isVisible: async () => {
            inputSelectorCalls.push(selector);
            if (options.visibleInputSelector) {
              return selector === options.visibleInputSelector;
            }
            inputVisibilityChecks += 1;
            return (
              inputVisibilityChecks >
              (options.inputVisibleAfterChecks ?? 0)
            );
          },
          fill,
          press,
        }),
      }),
    }),
    waitForTimeout,
  } as unknown as Page;

  return {
    page,
    close,
    fill,
    waitForTimeout,
    boardClick,
    windowClick,
    press,
    inputSelectorCalls,
  };
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
      evaluate: vi.fn(async () => ({ httpStatus: 200, code: 0 })),
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

  it("旧低粉榜单入口不存在或点击失败时不抢跑报结构变化，继续以官方响应为准", async () => {
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
        name: "DouhotNoValidResponseError",
        message: "热点宝榜单未返回有效响应",
      });
      expect(fake.fill).toHaveBeenCalledWith("AI");
      expect(fake.waitForTimeout).toHaveBeenCalled();
    }
  });

  it("旧 48 小时时间窗入口不存在时不抢跑报结构变化，继续以响应中的真实窗口为准", async () => {
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
      name: "DouhotNoValidResponseError",
      message: "热点宝榜单未返回有效响应",
    });
    expect(fake.fill).toHaveBeenCalledWith("AI");
    expect(fake.waitForTimeout).toHaveBeenCalled();
  });
});

describe("T-572 热点宝登录态与页面漂移恢复", () => {
  it("页面尚停在热点宝域名但 user_info 已明确 code=8 时，不抢跑报告登录成功", async () => {
    const fake = createFakePage({
      url: "https://douhot.douyin.com/",
      userInfoCodes: [8],
    });

    await expect(
      loginDouhot(
        { authDir: "/tmp/fake-auth", timeoutSec: 1 },
        { openPage: async () => fake },
      ),
    ).resolves.toEqual({ loggedIn: false });
    expect(fake.waitForTimeout).toHaveBeenCalled();
  });

  it("同步页异步跳 OAuth 前先由 user_info code=8 识别未授权，不误报页面结构变化", async () => {
    const fake = createFakePage({
      url: "https://douhot.douyin.com/",
      userInfoCodes: [8],
      boardVisible: false,
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
    ).rejects.toBeInstanceOf(DouyinNotLoggedInError);
    expect(fake.fill).not.toHaveBeenCalled();
  });

  it("旧榜单与时间窗文案消失时，以关键词触发的有效官方响应为准", async () => {
    const fake = createFakePage({
      userInfoCodes: [0],
      boardVisible: false,
      windowVisible: false,
      billboardPayload: {
        code: 0,
        data: {
          objs: [
            {
              item_id: "item-new-ui",
              item_title: "新页面仍返回的真实作品",
              like_cnt: 1800,
              fans_cnt: 300,
              publish_time: 1_800_000_000,
            },
          ],
        },
      },
      billboardRequestBody: {
        date_window: 72,
        sub_type: 1002,
        keyword: "AI",
      },
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
    ).resolves.toMatchObject({
      listValid: true,
      candidates: [
        expect.objectContaining({
          itemId: "item-new-ui",
          title: "新页面仍返回的真实作品",
        }),
      ],
    });
    expect(fake.fill).toHaveBeenCalledWith("AI");
    expect(fake.press).toHaveBeenCalled();
  });
});

describe("T-573 热点宝新版低粉爆款路由", () => {
  it("[T-613] 识别热点宝当前“大家都在搜”搜索框，授权后继续执行关键词采集", async () => {
    const fake = createFakePage({
      userInfoCodes: [0],
      visibleInputSelector: 'input[placeholder*="搜"]',
      billboardPayload: {
        code: 0,
        data: {
          objs: [
            {
              item_id: "item-current-search",
              item_title: "当前搜索框返回作品",
              like_cnt: 1800,
              fans_cnt: 300,
              publish_time: 1_800_000_000,
            },
          ],
        },
      },
      billboardRequestBody: {
        date_window: 72,
        sub_type: 1002,
        keyword: "粤菜",
      },
    });

    await expect(
      fetchDouhotLowFollowerBreakout(
        {
          authDir: "/tmp/fake-auth",
          keyword: "粤菜",
          board: "low_follower_breakout",
        },
        { openPage: async () => fake },
      ),
    ).resolves.toMatchObject({
      listValid: true,
      candidates: [{ itemId: "item-current-search" }],
    });
    expect(fake.inputSelectorCalls).toContain(
      'input[placeholder*="搜"]',
    );
    expect(fake.fill).toHaveBeenCalledWith("粤菜");
  });

  it("从默认分析页进入 72 小时低粉爆款详情，并只消费当前关键词的 sub_type=1002 响应", async () => {
    const validPayload = {
      code: 0,
      data: {
        objs: [
          {
            item_id: "item-low-follower",
            item_title: "当前关键词的低粉爆款",
            like_cnt: 3200,
            fans_cnt: 800,
            publish_time: 1_800_000_000,
          },
        ],
      },
    };
    const fake = createFakePage({
      url: "https://douhot.douyin.com/analysis",
      userInfoCodes: [0],
      inputVisibleAfterChecks: 4,
      billboardResponses: [
        {
          payload: validPayload,
          requestBody: {
            sub_type: 1002,
            date_window: 72,
            keyword: "Agent",
          },
        },
        {
          payload: { code: 0, data: { objs: [] } },
          requestBody: {
            sub_type: 1004,
            date_window: 72,
            keyword: "Agent",
          },
        },
        {
          payload: { code: 0, data: { objs: [] } },
          requestBody: {
            sub_type: 1002,
            date_window: 72,
            keyword: "另一个词",
          },
        },
      ],
    });

    await expect(
      fetchDouhotLowFollowerBreakout(
        {
          authDir: "/tmp/fake-auth",
          keyword: "Agent",
          board: "low_follower_breakout",
        },
        { openPage: async () => fake },
      ),
    ).resolves.toMatchObject({
      listValid: true,
      officialWindow: "72",
      candidates: [
        expect.objectContaining({
          itemId: "item-low-follower",
          title: "当前关键词的低粉爆款",
        }),
      ],
    });
    expect(fake.page.goto).toHaveBeenCalledWith(
      "https://douhot.douyin.com/square/hotspot?active_tab=hotspot_video&date_window=72&sub_type=1002",
      expect.objectContaining({ waitUntil: "domcontentloaded" }),
    );
  });

  it("同轮多条匹配响应中忽略最后的过渡空壳，采用前面的真实结果", async () => {
    const fake = createFakePage({
      url: "https://douhot.douyin.com/analysis",
      userInfoCodes: [0],
      billboardResponses: [
        {
          payload: {
            code: 0,
            data: {
              objs: [
                {
                  item_id: "item-real",
                  item_title: "真实结果",
                  publish_time: 1_800_000_000,
                },
              ],
            },
          },
          requestBody: {
            sub_type: 1002,
            date_window: 72,
            keyword: "川菜",
          },
        },
        {
          payload: { code: 0, data: {} },
          requestBody: {
            sub_type: 1002,
            date_window: 72,
            keyword: "川菜",
          },
        },
      ],
    });

    await expect(
      fetchDouhotLowFollowerBreakout(
        {
          authDir: "/tmp/fake-auth",
          keyword: "川菜",
          board: "low_follower_breakout",
        },
        { openPage: async () => fake },
      ),
    ).resolves.toMatchObject({
      listValid: true,
      windowHours: 72,
      candidates: [{ itemId: "item-real" }],
    });
  });
});
