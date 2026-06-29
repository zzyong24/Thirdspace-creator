import "server-only";
import type { MetricRecord } from "@/server/modules/ingestion/ingestion.schema";

// 抖音真实指标抓取适配器(线 B)。通过 Chrome CDP 连用户**常驻已登录**的浏览器
// (chromium.connectOverCDP),拦截创作者中心 XHR 拿 JSON,映射成 ingestion 的
// `MetricRecord`(对齐 metric_snapshots 落库目标)。参考 cheat-on-content 的
// douyin-session/crawler.py 的 endpoint 与字段形状,Node/TS 重写。
//
// 分层:① 纯函数 parseWorkList/parseDetail/toMetricRecords —— 不碰浏览器,可单测;
//       ② fetchDouyinMetrics —— 真连浏览器(测试不跑;需用户已登录的 CDP 会话)。
// cookie/会话只活在用户自己的浏览器里,绝不落库、绝不入 Git。

// ---------------------------------------------------------------------------
// 纯函数(可单测)
// ---------------------------------------------------------------------------

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[,\s]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export interface DouyinWork {
  awemeId: string;
  desc: string;
  createTime: number;
  durationSec: number;
  stats: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    favorites: number;
  };
}

export interface DouyinDetail {
  awemeId: string;
  // 创作者中心数据页的细分指标(完播率/转粉等),键名按抓到的字段兜底。
  finishRate: number | null;
  followerGain: number | null;
}

/** 解析创作者中心 work_list XHR(`aweme_list` 或 `item_list`),字段兜底取 0。 */
export function parseWorkList(json: unknown): DouyinWork[] {
  const root = (json ?? {}) as Record<string, unknown>;
  const list =
    (Array.isArray(root.aweme_list) && root.aweme_list) ||
    (Array.isArray(root.item_list) && root.item_list) ||
    (Array.isArray((root.data as Record<string, unknown>)?.aweme_list) &&
      ((root.data as Record<string, unknown>).aweme_list as unknown[])) ||
    [];
  return (list as unknown[])
    .map((raw): DouyinWork | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const awemeId = str(o.aweme_id) || str(o.item_id) || str(o.id);
      if (!awemeId) return null;
      const s = (o.statistics ?? o.stats ?? {}) as Record<string, unknown>;
      const video = (o.video ?? {}) as Record<string, unknown>;
      return {
        awemeId,
        desc: str(o.desc) || str(o.title),
        createTime: num(o.create_time),
        durationSec: Math.round(num(video.duration) / 1000) || num(video.duration),
        stats: {
          views: num(s.play_count ?? s.play ?? s.vv),
          likes: num(s.digg_count ?? s.like_count ?? s.digg),
          comments: num(s.comment_count ?? s.comment),
          shares: num(s.share_count ?? s.share),
          favorites: num(s.collect_count ?? s.favorite_count ?? s.collect),
        },
      };
    })
    .filter((w): w is DouyinWork => w !== null);
}

/** 解析数据中心明细 XHR(完播率/转粉等),按 aweme_id 归集;缺字段记 null。 */
export function parseDetail(json: unknown, awemeId: string): DouyinDetail {
  const root = (json ?? {}) as Record<string, unknown>;
  const d = (root.data ?? root.statistics ?? root) as Record<string, unknown>;
  const finish = d.finish_rate ?? d.play_finish_rate ?? d.complete_rate;
  const fans = d.fans_increment ?? d.follower_gain ?? d.new_fans;
  return {
    awemeId,
    finishRate: finish == null ? null : num(finish),
    followerGain: fans == null ? null : num(fans),
  };
}

/**
 * 把 work + detail 映射成 ingestion 的 MetricRecord[](落库目标:metric_snapshots /
 * metric_values)。metric 键名对齐现有 douyin seed(views/likes/comments/shares/
 * favorites/finish_rate/follower_gain)。capturedAt 是 Analytics 幂等锚。
 */
export function toMetricRecords(
  works: DouyinWork[],
  details: Map<string, DouyinDetail>,
  capturedAt: string,
): MetricRecord[] {
  return works.map((w) => {
    const det = details.get(w.awemeId);
    const metrics: Record<string, number> = {
      views: w.stats.views,
      likes: w.stats.likes,
      comments: w.stats.comments,
      shares: w.stats.shares,
      favorites: w.stats.favorites,
    };
    if (det?.finishRate != null) metrics.finish_rate = det.finishRate;
    if (det?.followerGain != null) metrics.follower_gain = det.followerGain;
    return {
      // 幂等键:同一作品同一抓取时刻唯一(Analytics 落库去重锚)。
      recordKey: `douyin:${w.awemeId}:${capturedAt}`,
      platform: "douyin",
      externalId: w.awemeId,
      capturedAt,
      metrics,
    };
  });
}

// ---------------------------------------------------------------------------
// 真连浏览器(测试不跑;需用户常驻 CDP + 已登录抖音创作者中心)
// ---------------------------------------------------------------------------

export interface FetchDouyinOptions {
  /** CDP endpoint;默认读 env CREATOROS_CDP_URL,再默认 localhost:9222。 */
  cdpUrl?: string;
  /** 抓取的 capturedAt(ISO8601);调用方传入(纯函数化 Date)。 */
  capturedAt: string;
  /** 最多翻几页 work_list(防止无限滚动卡死)。 */
  maxPages?: number;
}

const WORK_LIST_HINT = "/creator/pc/work_list";
const DETAIL_HINTS = ["/data_center", "/data_external", "/aweme_statistic"];
const CREATOR_HOME = "https://creator.douyin.com/creator-micro/content/manage";

/**
 * 真抓:连用户常驻 Chrome(已登录)→ 导航创作者中心 → 拦截 work_list / 明细 XHR →
 * 礼貌滚动翻页 → 映射成 MetricRecord[]。**不落库**(落库由 ingestion.service 负责)。
 * 仅在用户带 --remote-debugging-port 起的已登录 Chrome 上运行;CI/测试不调用。
 */
export async function fetchDouyinMetrics(
  opts: FetchDouyinOptions,
): Promise<MetricRecord[]> {
  // 动态 import,避免把 playwright 拉进不需要它的打包路径。
  const { chromium } = await import("@playwright/test");
  const cdpUrl =
    opts.cdpUrl ?? process.env.CREATOROS_CDP_URL ?? "http://localhost:9222";
  const maxPages = opts.maxPages ?? 10;

  const browser = await chromium.connectOverCDP(cdpUrl);
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());

    const workJsons: unknown[] = [];
    const detailJsons: Array<{ url: string; json: unknown }> = [];
    page.on("response", async (resp) => {
      const url = resp.url();
      try {
        if (url.includes(WORK_LIST_HINT)) {
          workJsons.push(await resp.json());
        } else if (DETAIL_HINTS.some((h) => url.includes(h))) {
          detailJsons.push({ url, json: await resp.json() });
        }
      } catch {
        /* 非 JSON 响应,忽略 */
      }
    });

    await page.goto(CREATOR_HOME, { waitUntil: "networkidle" });
    // 礼貌滚动触发懒加载;连续无新响应或到 maxPages 即停。
    let lastCount = -1;
    for (let i = 0; i < maxPages; i++) {
      if (workJsons.length === lastCount) break;
      lastCount = workJsons.length;
      await page.mouse.wheel(0, 2400);
      await page.waitForTimeout(2000);
    }

    const works = workJsons.flatMap((j) => parseWorkList(j));
    // 去重(同 aweme_id 保留最后一次)。
    const byId = new Map<string, DouyinWork>();
    for (const w of works) byId.set(w.awemeId, w);
    const deduped = [...byId.values()];

    const details = new Map<string, DouyinDetail>();
    for (const w of deduped) {
      const hit = detailJsons.find((d) => d.url.includes(w.awemeId));
      if (hit) details.set(w.awemeId, parseDetail(hit.json, w.awemeId));
    }

    return toMetricRecords(deduped, details, opts.capturedAt);
  } finally {
    await browser.close();
  }
}
