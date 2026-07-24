import "server-only";

import type { BrowserContext, Page, Response } from "@playwright/test";

import type {
  DouhotBatch,
  DouhotCandidate,
} from "@/server/intelligence/source-adapter";
import { guardedLaunch, chromiumSandboxOpts } from "./chromium-guard";
import { launchWithBrowser } from "./douyin-cdp";
import { DouyinNotLoggedInError } from "./douyin-errors";

const DOUHOT_HOME = "https://douhot.douyin.com/";
const BILLBOARD_HINT = "/douhot/v1/material/video_billboard";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parsePublishTime(value: unknown): number | null {
  const numeric = nullableNumber(value);
  if (numeric !== null) {
    return numeric > 10_000_000_000 ? Math.floor(numeric / 1000) : numeric;
  }
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

function parseWindowHours(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value <= 14 ? value * 24 : value;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  const number = Number(normalized.match(/\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(number) || number <= 0) return null;
  if (/小时|hour|h\b/.test(normalized)) return number;
  if (/天|day|d\b/.test(normalized)) return number * 24;
  return number <= 14 ? number * 24 : number;
}

export function parseDouhotBillboard(
  json: unknown,
  requestBody: unknown,
): DouhotBatch & { windowHours: number | null } {
  const root = record(json);
  const data = record(root.data);
  const list = Array.isArray(data.objs) ? data.objs : null;
  const code = nullableNumber(root.code);
  const body = record(requestBody);
  const officialWindow =
    stringValue(body.date_window) ||
    stringValue(data.date_window) ||
    String(body.date_window ?? data.date_window ?? "");
  if (!list || (code !== null && code !== 0)) {
    return {
      listValid: false,
      officialWindow,
      windowHours: parseWindowHours(body.date_window ?? data.date_window),
      responseShape: "invalid-code/data/objs",
      candidates: [],
    };
  }

  const candidates: DouhotCandidate[] = [];
  for (const raw of list) {
    const item = record(raw);
    const itemId =
      stringValue(item.item_id) ||
      stringValue(item.aweme_id) ||
      stringValue(item.id);
    if (!itemId) continue;
    const itemUrl =
      stringValue(item.item_url) ||
      `https://www.douyin.com/video/${encodeURIComponent(itemId)}`;
    candidates.push({
      itemId,
      itemUrl,
      title:
        stringValue(item.item_title) ||
        stringValue(item.title) ||
        stringValue(item.desc),
      coverUrl:
        stringValue(item.item_cover_url) ||
        stringValue(item.cover_url) ||
        null,
      durationMs: nullableNumber(item.item_duration ?? item.duration),
      authorId:
        stringValue(item.author_id) ||
        stringValue(item.sec_uid) ||
        null,
      authorName:
        stringValue(item.nick_name) ||
        stringValue(item.author_name) ||
        null,
      followerCount: nullableNumber(item.fans_cnt),
      playCount: nullableNumber(item.play_cnt),
      likeCount: nullableNumber(item.like_cnt) ?? 0,
      commentCount: nullableNumber(item.comment_cnt),
      collectCount: nullableNumber(item.collect_cnt),
      shareCount: nullableNumber(item.share_cnt),
      publishTime: parsePublishTime(item.publish_time),
      officialRank: nullableNumber(item.rank),
      officialScore: nullableNumber(item.score),
    });
  }
  return {
    listValid: true,
    officialWindow,
    windowHours: parseWindowHours(body.date_window ?? data.date_window),
    responseShape: "code/data/objs",
    candidates,
  };
}

interface DouhotPage {
  page: Page;
  close(): Promise<void>;
}

async function openDouhotPage(authDir: string): Promise<DouhotPage> {
  const { chromium } = await import("@playwright/test");
  const context = await guardedLaunch(
    authDir,
    () =>
      launchWithBrowser((selection) =>
        chromium.launchPersistentContext(authDir, {
          headless: true,
          ...selection,
          ...chromiumSandboxOpts(),
          viewport: { width: 1440, height: 1000 },
          args: ["--disable-blink-features=AutomationControlled"],
        }),
      ),
    { label: "抖音热点宝" },
  );
  const page = context.pages()[0] ?? (await context.newPage());
  return {
    page,
    close: () => context.close(),
  };
}

export interface FetchDouhotOptions {
  authDir: string;
  keyword: string;
  board: "low_follower_breakout";
}

export interface FetchDouhotDeps {
  openPage?: (authDir: string) => Promise<DouhotPage>;
}

async function clickFirstVisible(page: Page, labels: RegExp[]): Promise<void> {
  for (const label of labels) {
    const target = page.getByText(label, { exact: false }).first();
    if (await target.isVisible().catch(() => false)) {
      await target.click().catch(() => {});
      return;
    }
  }
}

async function fillKeyword(page: Page, keyword: string): Promise<void> {
  const selectors = [
    'input[placeholder*="关键词"]',
    'input[placeholder*="搜索"]',
    'input[type="search"]',
    'input[type="text"]',
  ];
  for (const selector of selectors) {
    const input = page.locator(selector).filter({ visible: true }).first();
    if (await input.isVisible().catch(() => false)) {
      await input.fill(keyword);
      await input.press("Enter");
      return;
    }
  }
  throw Object.assign(new Error("热点宝关键词输入框不可用"), {
    name: "DouhotResponseShapeChangedError",
  });
}

/**
 * 只通过热点宝官方页面触发榜单请求。签名与 Cookie 由受控浏览器 profile 和页面运行时生成；
 * 本函数只读取结构化响应，不复制、记录或持久化请求凭据。
 */
export async function fetchDouhotLowFollowerBreakout(
  options: FetchDouhotOptions,
  deps: FetchDouhotDeps = {},
): Promise<DouhotBatch> {
  const opened = await (deps.openPage ?? openDouhotPage)(options.authDir);
  const { page } = opened;
  try {
    const contexts = page.context() as BrowserContext;
    const cookies = await contexts.cookies([
      "https://www.douyin.com",
      DOUHOT_HOME,
    ]);
    if (
      !cookies.some(
        (cookie) =>
          cookie.name === "sessionid" || cookie.name === "sessionid_ss",
      )
    ) {
      throw new DouyinNotLoggedInError();
    }

    const responses: Response[] = [];
    const onResponse = (response: Response) => {
      if (response.url().includes(BILLBOARD_HINT)) responses.push(response);
    };
    page.on("response", onResponse);
    await page.goto(DOUHOT_HOME, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    if (/login|passport|verify|captcha/i.test(page.url())) {
      throw new DouyinNotLoggedInError();
    }

    await clickFirstVisible(page, [/低粉爆款/, /低粉高赞/]);
    await clickFirstVisible(page, [/近\s*2\s*天/, /48\s*小时/]);
    await fillKeyword(page, options.keyword.trim());
    await page.waitForTimeout(6_000);
    page.off("response", onResponse);

    const response = responses.at(-1);
    if (!response || response.status() !== 200) {
      throw Object.assign(new Error("热点宝榜单未返回有效响应"), {
        name: "DouhotNoValidResponseError",
      });
    }
    const parsed = parseDouhotBillboard(
      await response.json(),
      response.request().postDataJSON(),
    );
    if (!parsed.listValid) {
      throw Object.assign(new Error("热点宝榜单响应结构已变化"), {
        name: "DouhotResponseShapeChangedError",
      });
    }
    if (parsed.windowHours === null || parsed.windowHours < 48) {
      throw Object.assign(new Error("热点宝榜单时间窗不足 48 小时"), {
        name: "DouhotResponseShapeChangedError",
      });
    }
    return parsed;
  } finally {
    await opened.close().catch(() => {});
  }
}
