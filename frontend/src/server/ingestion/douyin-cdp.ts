import "server-only";
import type { MetricRecord } from "@creatoros/backend/modules/ingestion";

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
    // 数据底座(SPEC §1.3):携带真实标题(desc)+ 发布时刻(create_time 秒 → ISO),
    //   供 ensureImportedProject 给历史项目起真名 / 落 platform_ref.publishedAt。
    const title = w.desc.trim() || undefined;
    const publishedAt =
      w.createTime > 0
        ? new Date(w.createTime * 1000).toISOString()
        : undefined;
    return {
      // 幂等键:同一作品同一抓取时刻唯一(Analytics 落库去重锚)。
      recordKey: `douyin:${w.awemeId}:${capturedAt}`,
      platform: "douyin",
      externalId: w.awemeId,
      capturedAt,
      metrics,
      ...(title ? { title } : {}),
      ...(publishedAt ? { publishedAt } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// 真连浏览器(测试不跑;需用户常驻 CDP + 已登录抖音创作者中心)
// ---------------------------------------------------------------------------

export interface FetchDouyinOptions {
  /** 持久化 profile 目录(cookie 落这;首次扫码后复刷复用)。 */
  authDir: string;
  /** 抓取的 capturedAt(ISO8601);调用方传入(纯函数化 Date)。 */
  capturedAt: string;
  /** 最多翻几页(防无限滚动卡死)。 */
  maxPages?: number;
}

export interface LoginDouyinOptions {
  authDir: string;
  /** 扫码最多等多少秒(默认 240)。 */
  timeoutSec?: number;
}

// 未登录抖音创作者中心 —— 调用方据此提示用户先「登录抖音」(弹窗扫码),区别于真正抓取失败。
export class DouyinNotLoggedInError extends Error {
  constructor() {
    super("DouyinNotLoggedInError: 未检测到抖音创作者中心登录态,请先扫码登录");
    this.name = "DouyinNotLoggedInError";
  }
}

const CREATOR_LOGIN_HOME = "https://creator.douyin.com/creator-micro/home";
const CREATOR_CONTENT = "https://creator.douyin.com/creator-micro/content/manage";
// 作品列表 XHR —— cheat-on-content 验证过的真端点 + 旧 work_list 兜底(match 任一)。
const WORK_LIST_HINTS = [
  "/aweme/v1/creator/item/list",
  "/creator/pc/work_list",
  "/web/aweme/post",
];

// launchPersistentContext 前清掉上次异常退出残留的单例锁,否则 relaunch 报
// "SingletonLock: File exists" 直接 abort。
async function clearSingletonLocks(authDir: string): Promise<void> {
  const { rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  for (const n of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    await rm(join(authDir, n), { force: true }).catch(() => {});
  }
}

// 自起 Chromium + 持久化 profile(.auth/),不连用户现成浏览器(connectOverCDP 那条路对真实
// 用户 Chrome 不稳)。headless=false 用于扫码登录;true 用于复刷抓取。
async function openContext(authDir: string, headless: boolean) {
  const { chromium } = await import("@playwright/test");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(authDir, { recursive: true }).catch(() => {});
  await clearSingletonLocks(authDir);
  return chromium.launchPersistentContext(authDir, {
    headless,
    viewport: { width: 1440, height: 900 },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-proxy-server", // 抖音国内站直连,跳过系统代理避免 Clash 端口变化报错
    ],
  });
}

async function isLoggedIn(
  ctx: import("@playwright/test").BrowserContext,
): Promise<boolean> {
  const cookies = await ctx.cookies("https://creator.douyin.com");
  return cookies.some((c) => c.name === "sessionid" || c.name === "sessionid_ss");
}

/**
 * 登录:headed 弹 Chromium 窗口让用户扫码;轮询 sessionid cookie,检测到即成功(落 .auth/)。
 * 仅在用户机器上跑(server 弹窗)。返回是否登录成功。
 */
export async function loginDouyin(opts: LoginDouyinOptions): Promise<boolean> {
  const timeoutSec = opts.timeoutSec ?? 240;
  const ctx = await openContext(opts.authDir, false);
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page
      .goto(CREATOR_LOGIN_HOME, { waitUntil: "domcontentloaded" })
      .catch(() => {});
    for (let i = 0; i < timeoutSec; i++) {
      if (await isLoggedIn(ctx)) return true;
      await page.waitForTimeout(1000);
    }
    return false;
  } finally {
    await ctx.close().catch(() => {}); // 关我们自起的 Chromium(非用户浏览器)
  }
}

/**
 * 真抓:headless 复用 .auth/ 登录态 → 导航创作者中心 → 拦作品列表 XHR → 礼貌滚动翻页 →
 * MetricRecord[]。**不落库**(落库由 ingestion.service 负责)。未登录抛 DouyinNotLoggedInError
 * (调用方提示先扫码登录)。仅在用户机器上跑;CI/测试不调用。
 */
export async function fetchDouyinMetrics(
  opts: FetchDouyinOptions,
): Promise<MetricRecord[]> {
  const maxPages = opts.maxPages ?? 40; // 上限(每页 ~12 条;has_more=false 会提前停,40 覆盖 ~480 作品)
  const ctx = await openContext(opts.authDir, true);
  try {
    if (!(await isLoggedIn(ctx))) throw new DouyinNotLoggedInError();
    const page = ctx.pages()[0] ?? (await ctx.newPage());

    const workJsons: unknown[] = [];
    const seenIds = new Set<string>();
    let hasMore = true; // 直到某页 work_list 明确 has_more=false 才停(比"无新响应"可靠)
    const readHasMore = (j: unknown): boolean | undefined => {
      const root = (j ?? {}) as Record<string, unknown>;
      const data = (root.data ?? root) as Record<string, unknown>;
      const v = root.has_more ?? data.has_more ?? root.hasMore ?? data.hasMore;
      return typeof v === "boolean" ? v : v == null ? undefined : Boolean(v);
    };
    page.on("response", async (resp) => {
      const url = resp.url();
      if (!WORK_LIST_HINTS.some((h) => url.includes(h))) return;
      try {
        const j = await resp.json();
        workJsons.push(j);
        for (const w of parseWorkList(j)) seenIds.add(w.awemeId);
        const hm = readHasMore(j);
        if (hm !== undefined) hasMore = hm;
      } catch {
        /* 非 JSON 响应,忽略 */
      }
    });

    await page.goto(CREATOR_CONTENT, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(3000); // 等首屏 work_list XHR 回来

    // 激进滚动翻页:window 滚到底 + 滚最高可滚容器 + End 键 + 滚轮。单一 mouse.wheel 触不到列表
    // 容器,是只抓到首页 24 条的根因。停止:某页 has_more=false(可靠),或连续 3 轮无新作品,或到上限。
    let staleRounds = 0;
    for (let i = 0; i < maxPages; i++) {
      if (!hasMore) break; // 抖音 work_list 明确翻到底
      const before = seenIds.size;
      await page
        .evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        .catch(() => {});
      await page
        .evaluate(() => {
          const els = Array.from(
            document.querySelectorAll("*"),
          ) as HTMLElement[];
          let best: HTMLElement | null = null;
          let max = 0;
          for (const el of els) {
            if (el.scrollHeight > el.clientHeight + 200 && el.scrollHeight > max) {
              max = el.scrollHeight;
              best = el;
            }
          }
          if (best) (best as HTMLElement).scrollTop = (best as HTMLElement).scrollHeight;
        })
        .catch(() => {});
      await page.keyboard.press("End").catch(() => {});
      await page.mouse.wheel(0, 3000).catch(() => {});
      await page.waitForTimeout(2500);
      staleRounds = seenIds.size === before ? staleRounds + 1 : 0;
      if (staleRounds >= 3) break; // has_more 不返回时的兜底,防死循环
    }

    const works = workJsons.flatMap((j) => parseWorkList(j));
    // 去重(同 aweme_id 保留最后一次)。明细(完播/转粉)留后续补;先返回列表级真实指标。
    const byId = new Map<string, DouyinWork>();
    for (const w of works) byId.set(w.awemeId, w);
    return toMetricRecords([...byId.values()], new Map(), opts.capturedAt);
  } finally {
    await ctx.close().catch(() => {}); // 关我们自起的 Chromium(非用户浏览器)
  }
}
