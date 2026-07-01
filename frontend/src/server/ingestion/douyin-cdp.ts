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

// ---------------------------------------------------------------------------
// 评论(T-007 D2)—— 落 audience_signals。source 用既有 enum "comment"(不扩 enum),
// record_key=`douyin:comment:${commentId}` 经 ux_ingestion_records_run_key 去重。
// 字段口径对齐 cheat-on-content crawler.py `_normalize_comment_creator`:
//   拦截 XHR = /aweme/v1/web/comment/list/ (创作者中心评论管理页);
//   评论字段 = cid|comment_id|id / text|content / digg_count|like_count /
//              create_time / user.nickname / aweme_id|item_id。
// ---------------------------------------------------------------------------

export interface CommentRecord {
  commentId: string;
  awemeId: string;
  text: string;
  likeCount: number;
  replyCount: number;
  createTime: number; // 秒;缺失记 0
  userId: string; // 评论者 user id(缺失空串)
  userName: string; // 评论者昵称(缺失空串)
  ipLabel: string; // ip 归属(缺失空串)
}

/**
 * 解析创作者中心评论 list XHR(`/aweme/v1/web/comment/list/`)—— 纯函数,字段兜底。
 * 对齐 cheat-on-content `_normalize_comment_creator` 的字段口径(cid/text/digg_count/
 * create_time/user.nickname/aweme_id 多键兜底)。评论列表键宽松匹配 comments /
 * comment_list / data.comments。无 commentId 或无正文的脏数据丢弃。
 */
export function parseCommentList(
  json: unknown,
  defaultAwemeId = "",
): CommentRecord[] {
  const root = (json ?? {}) as Record<string, unknown>;
  const data = (root.data ?? {}) as Record<string, unknown>;
  const list =
    (Array.isArray(root.comments) && root.comments) ||
    (Array.isArray(root.comment_list) && root.comment_list) ||
    (Array.isArray(data.comments) && data.comments) ||
    (Array.isArray(data.comment_list) && data.comment_list) ||
    [];
  return (list as unknown[])
    .map((raw): CommentRecord | null => {
      const c = (raw ?? {}) as Record<string, unknown>;
      const commentId = str(c.cid) || str(c.comment_id) || str(c.id);
      const text = str(c.text) || str(c.content);
      // 无 id 或无正文 → 脏数据,丢弃(audience_signal.rawText 不能空)。
      if (!commentId || !text.trim()) return null;
      const user = (c.user ?? c.user_info ?? {}) as Record<string, unknown>;
      return {
        commentId,
        awemeId: str(c.aweme_id) || str(c.item_id) || defaultAwemeId,
        text,
        likeCount: num(c.digg_count ?? c.like_count),
        replyCount: num(c.reply_comment_total ?? c.reply_count),
        createTime: num(c.create_time),
        userId: str(user.uid) || str(user.user_id) || str(c.user_id),
        userName:
          str(user.nickname) || str(user.name) || str(c.user_name),
        ipLabel: str(c.ip_label) || str(c.ip_location),
      };
    })
    .filter((c): c is CommentRecord => c !== null);
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
// 逐字稿取音频通路(T-030-D2,SPEC §5.2)—— 移植 Python skill douyin_transcribe.py 的
// iesdouyin 通路(**无需 Cookie / 无需登录**,与上面的创作者中心 CDP 抓取是两条独立链路):
//   ① parseDouyinVideoUrl(html)  纯函数:从 iesdouyin 分享页 HTML 抽 window._ROUTER_DATA →
//      play_addr.url_list[0] → `playwm`→`play` 去水印。可喂 canned HTML 单测。
//   ② fetchDouyinVideoUrl(aweme) 注入 fetch:GET iesdouyin 手机 UA 页 → parseDouyinVideoUrl。
//   ③ streamAudioFromVideo(url)  注入 spawn:ffmpeg 从直链流式抽 16kHz/单声道/mp3 stdout bytes。
// 这三者是 D2 transcribe-runner 的取音频端口(端口注入,故 runner 可确定性单测,不碰真抖音/真 ffmpeg)。
// ---------------------------------------------------------------------------

// 手机 UA —— iesdouyin 分享页仅对移动端 UA 返回带 _ROUTER_DATA 的 HTML(对齐 skill PAGE_HEADERS)。
const DY_MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
  "EdgiOS/121.0.2277.107 Version/17.0 Mobile/15E148 Safari/604.1";

// ffmpeg 从直链抽音需带 Referer(抖音 CDN 校验来源),否则 403。对齐 skill DL_HEADERS。
const DY_VIDEO_REFERER = "https://www.douyin.com/";

/** iesdouyin 分享页解析结果:无水印播放直链 + 可选封面。 */
export interface DouyinVideoUrl {
  playUrl: string;
  coverUrl?: string;
}

/** 取音频失败(直链解析失败 / ffmpeg 抽音失败)—— D2 runner 据此把**该条 aweme** 标失败、
 *  其余继续(F7:别一条视频拖垮整批),区别于 ASR 未配的 TranscribeConfigError(整任务停)。 */
export class DouyinAudioFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DouyinAudioFetchError";
  }
}

/**
 * 从 iesdouyin 分享页 HTML 抽无水印播放直链(纯函数,可喂 canned HTML 单测)。
 * 逻辑忠实移植 skill `fetch_metadata`:
 *   正则抽 `window._ROUTER_DATA = {...}</script>` → JSON.parse →
 *   `loaderData["video_(id)/page" | "note_(id)/page"].videoInfoRes.item_list[0]` →
 *   `video.play_addr.url_list[0]`(拿不到用 `download_addr.url_list[0]`)→ `playwm`→`play` 去水印。
 * 任一环节缺失 → 抛 DouyinAudioFetchError(取音频失败,runner 标该 aweme 失败)。
 */
export function parseDouyinVideoUrl(html: string): DouyinVideoUrl {
  // `[\s\S]*?` 代替 `.*?` + `s` 标志(dotAll 仅 es2018+;本仓 tsc target 更低,避免 TS1501)。
  const m = /window\._ROUTER_DATA\s*=\s*([\s\S]*?)<\/script>/.exec(html);
  if (!m) {
    throw new DouyinAudioFetchError(
      "parseDouyinVideoUrl: 未在页面中找到 window._ROUTER_DATA(页面结构变化或被风控)",
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(m[1]!.trim());
  } catch {
    throw new DouyinAudioFetchError(
      "parseDouyinVideoUrl: _ROUTER_DATA JSON 解析失败",
    );
  }
  const root = (data ?? {}) as Record<string, unknown>;
  const loader = (root.loaderData ?? root) as Record<string, unknown>;

  let item: Record<string, unknown> | null = null;
  for (const key of ["video_(id)/page", "note_(id)/page"]) {
    const node = loader[key] as Record<string, unknown> | undefined;
    if (!node) continue;
    const videoInfoRes = (node.videoInfoRes ?? {}) as Record<string, unknown>;
    const items = videoInfoRes.item_list;
    if (Array.isArray(items) && items.length > 0) {
      item = (items[0] ?? {}) as Record<string, unknown>;
      break;
    }
  }
  if (!item) {
    throw new DouyinAudioFetchError(
      "parseDouyinVideoUrl: 无法从 _ROUTER_DATA 中解析视频信息(item_list 为空)",
    );
  }

  const video = (item.video ?? {}) as Record<string, unknown>;
  const playAddr = (video.play_addr ?? {}) as Record<string, unknown>;
  const downloadAddr = (video.download_addr ?? {}) as Record<string, unknown>;
  const playList = Array.isArray(playAddr.url_list) ? playAddr.url_list : [];
  const downloadList = Array.isArray(downloadAddr.url_list)
    ? downloadAddr.url_list
    : [];
  const rawUrl =
    (typeof playList[0] === "string" && playList[0]) ||
    (typeof downloadList[0] === "string" && downloadList[0]) ||
    "";
  if (!rawUrl) {
    throw new DouyinAudioFetchError(
      "parseDouyinVideoUrl: 未找到视频播放地址(play_addr/download_addr 皆空)",
    );
  }
  // 去水印:playwm → play(skill 同款一次替换)。
  const playUrl = rawUrl.replace("playwm", "play");

  const cover = (video.cover ?? {}) as Record<string, unknown>;
  const coverList = Array.isArray(cover.url_list) ? cover.url_list : [];
  const coverUrl =
    typeof coverList[0] === "string" ? coverList[0] : undefined;

  return coverUrl ? { playUrl, coverUrl } : { playUrl };
}

/** fetchDouyinVideoUrl 的可注入依赖(默认真全局 fetch;单测注 fake,不走网络)。 */
export interface FetchDouyinVideoUrlDeps {
  fetch: typeof fetch;
}

const REAL_FETCH_DEPS: FetchDouyinVideoUrlDeps = {
  fetch: (...args) => fetch(...args),
};

/**
 * GET iesdouyin 分享页(手机 UA)→ parseDouyinVideoUrl 抽无水印直链。fetch 可注入(默认真
 * 全局 fetch),故 D2 runner 里这层由 host 装配真 fetch,单测注 fake(返 canned HTML)。
 * 非 2xx / 无 _ROUTER_DATA → 抛 DouyinAudioFetchError(runner 标该 aweme 失败,其余继续)。
 */
export async function fetchDouyinVideoUrl(
  awemeId: string,
  deps: FetchDouyinVideoUrlDeps = REAL_FETCH_DEPS,
): Promise<DouyinVideoUrl> {
  const pageUrl = `https://www.iesdouyin.com/share/video/${encodeURIComponent(
    awemeId,
  )}/`;
  let res: Response;
  try {
    res = await deps.fetch(pageUrl, {
      headers: {
        "User-Agent": DY_MOBILE_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    });
  } catch (err) {
    throw new DouyinAudioFetchError(
      `fetchDouyinVideoUrl: 请求 iesdouyin 失败 (aweme ${awemeId}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (!res.ok) {
    throw new DouyinAudioFetchError(
      `fetchDouyinVideoUrl: iesdouyin HTTP ${res.status} (aweme ${awemeId})`,
    );
  }
  const html = await res.text();
  return parseDouyinVideoUrl(html);
}

/** streamAudioFromVideo 的可注入依赖(默认 child_process.spawn;单测注 fake,不跑真 ffmpeg)。
 *  只收窄到 stdout/stderr/exit 这三件事,便于 fake。 */
export interface SpawnedProcess {
  stdout: {
    on(event: "data", cb: (chunk: Uint8Array) => void): void;
  };
  stderr: {
    on(event: "data", cb: (chunk: Uint8Array) => void): void;
  };
  on(event: "error", cb: (err: Error) => void): void;
  on(event: "close", cb: (code: number | null) => void): void;
}

export interface StreamAudioDeps {
  spawn: (command: string, args: string[]) => SpawnedProcess;
  /** ffmpeg 可执行路径(默认 /opt/homebrew/bin/ffmpeg,已确认存在;可注入覆盖)。 */
  ffmpegPath?: string;
}

const REAL_SPAWN_DEPS: StreamAudioDeps = {
  spawn: (command, args) => {
    // 动态引入 child_process(server-only;避免打进客户端 bundle)。
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { spawn } = require("node:child_process") as typeof import("node:child_process");
    return spawn(command, args) as unknown as SpawnedProcess;
  },
  ffmpegPath: "/opt/homebrew/bin/ffmpeg",
};

/**
 * ffmpeg 从无水印直链**流式**抽音频(16kHz / 单声道 / 64k mp3),收 stdout mp3 bytes(不落盘)。
 * 忠实移植 skill `ffmpeg_stream_to_audio` 的命令(带 Referer 头 → pipe:1 stdout):
 *   ffmpeg -headers "Referer: https://www.douyin.com/\r\n" -i {url} -vn -ar 16000 -ac 1 -b:a 64k -f mp3 pipe:1
 * spawn 可注入(默认 child_process.spawn),故 D2 runner 里这层单测注 fake(返固定 bytes / 模拟非 0 退出)。
 * 非 0 退出 / spawn error / 无 bytes → 抛 DouyinAudioFetchError(runner 标该 aweme 失败,其余继续)。
 */
export async function streamAudioFromVideo(
  playUrl: string,
  deps: StreamAudioDeps = REAL_SPAWN_DEPS,
): Promise<Uint8Array> {
  const ffmpegPath = deps.ffmpegPath ?? "ffmpeg";
  // -headers 需以 \r\n 结尾(ffmpeg HTTP header 注入格式,对齐 skill headers_str)。
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-headers",
    `Referer: ${DY_VIDEO_REFERER}\r\n`,
    "-i",
    playUrl,
    "-vn",
    "-ar",
    "16000",
    "-ac",
    "1",
    "-b:a",
    "64k",
    "-f",
    "mp3",
    "pipe:1",
  ];

  return await new Promise<Uint8Array>((resolve, reject) => {
    let child: SpawnedProcess;
    try {
      child = deps.spawn(ffmpegPath, args);
    } catch (err) {
      reject(
        new DouyinAudioFetchError(
          `streamAudioFromVideo: 无法启动 ffmpeg(${ffmpegPath}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
      return;
    }

    const chunks: Uint8Array[] = [];
    let stderrTail = "";
    child.stdout.on("data", (chunk) => {
      chunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      // 只留尾部一小段供报错(ffmpeg 错误信息在 stderr)。
      stderrTail = (stderrTail + Buffer.from(chunk).toString("utf8")).slice(-500);
    });
    child.on("error", (err) => {
      reject(
        new DouyinAudioFetchError(
          `streamAudioFromVideo: ffmpeg 进程错误: ${err.message}`,
        ),
      );
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new DouyinAudioFetchError(
            `streamAudioFromVideo: ffmpeg 非 0 退出 (code=${code}): ${
              stderrTail || "<no stderr>"
            }`,
          ),
        );
        return;
      }
      // 拼接 stdout mp3 bytes。
      const total = chunks.reduce((n, c) => n + c.byteLength, 0);
      if (total === 0) {
        reject(
          new DouyinAudioFetchError(
            "streamAudioFromVideo: ffmpeg 退出 0 但未产出音频字节(直链失效/去水印无效?)",
          ),
        );
        return;
      }
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        out.set(c, off);
        off += c.byteLength;
      }
      resolve(out);
    });
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
// 评论列表 XHR —— cheat-on-content crawler.py 验证过的创作者中心评论端点。
const COMMENT_LIST_HINTS = ["/aweme/v1/web/comment/list/"];
// 创作者中心评论管理页(带 item_id 过滤 → 只显示该作品评论)。
const CREATOR_COMMENT_MANAGE =
  "https://creator.douyin.com/creator-micro/content/comment-manage";

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

export interface FetchCommentsTarget {
  /** 目标作品 aweme_id(评论管理页 item_id 过滤 → 只抓这条作品的评论)。 */
  awemeId: string;
  /** 持久化 profile 目录(复用 .auth/ 扫码登录态)。 */
  authDir: string;
  /** 最多滚动翻几页(防无限加载卡死;默认 40)。 */
  maxPages?: number;
}

/**
 * 真抓评论:headless 复用 .auth/ 登录态 → 导航创作者中心评论管理页(item_id 过滤) →
 * 拦 `/aweme/v1/web/comment/list/` XHR → 礼貌滚动翻页 → 去重 CommentRecord[]。
 * **不落库**(落库由 ingestComments 负责)。未登录抛 DouyinNotLoggedInError(调用方提示
 * 先扫码登录,D4 接状态机)。仅在用户机器上跑;CI/测试不调用(需真扫码登录态)。
 */
export async function fetchDouyinComments(
  target: FetchCommentsTarget,
): Promise<CommentRecord[]> {
  const maxPages = target.maxPages ?? 40;
  const ctx = await openContext(target.authDir, true);
  try {
    if (!(await isLoggedIn(ctx))) throw new DouyinNotLoggedInError();
    const page = ctx.pages()[0] ?? (await ctx.newPage());

    const commentJsons: unknown[] = [];
    const seenIds = new Set<string>();
    page.on("response", async (resp) => {
      const url = resp.url();
      if (!COMMENT_LIST_HINTS.some((h) => url.includes(h))) return;
      try {
        const j = await resp.json();
        commentJsons.push(j);
        for (const c of parseCommentList(j, target.awemeId)) {
          seenIds.add(c.commentId);
        }
      } catch {
        /* 非 JSON 响应,忽略 */
      }
    });

    // item_id 过滤 → 评论管理页只显示该作品的评论(对齐 crawler.py urls_to_try)。
    await page.goto(
      `${CREATOR_COMMENT_MANAGE}?item_id=${encodeURIComponent(target.awemeId)}`,
      { waitUntil: "domcontentloaded", timeout: 60000 },
    );
    await page.waitForTimeout(3000); // 等首屏 comment/list XHR 回来

    // 礼貌滚动翻页:滚到底触发下一页加载;连续 3 轮无新评论即停(评论无 has_more 可靠信号)。
    let staleRounds = 0;
    for (let i = 0; i < maxPages; i++) {
      const before = seenIds.size;
      await page
        .evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        .catch(() => {});
      await page.mouse.wheel(0, 2000).catch(() => {});
      await page.waitForTimeout(2000);
      staleRounds = seenIds.size === before ? staleRounds + 1 : 0;
      if (staleRounds >= 3) break;
    }

    // 去重(同 commentId 保留最后一次;跨页重复评论合一)。
    const byId = new Map<string, CommentRecord>();
    for (const j of commentJsons) {
      for (const c of parseCommentList(j, target.awemeId)) {
        byId.set(c.commentId, c);
      }
    }
    return [...byId.values()];
  } finally {
    await ctx.close().catch(() => {}); // 关我们自起的 Chromium(非用户浏览器)
  }
}

// ---------------------------------------------------------------------------
// 落库 helper(T-007 D2)—— 建 ingestion run → 逐条评论经 ux_ingestion_records_run_key
// 去重 → ingestAudienceSignal(source="comment")。ports 抽象化以便 fake 单测;真实装配
// (接 ingestion.service / candidate.service 的真 port)是 D3 的活,D2 不碰 persistence-client。
// ---------------------------------------------------------------------------

// 一次评论抓取落库需要的下游能力(D3 装配时接真 service/repository;测试注 fake)。
export interface CommentIngestPorts {
  /** 建/取一条 ingestion run(externalSourceId+idempotencyKey 幂等),返回 runId。 */
  createRun(input: {
    externalSourceId: string;
    runType: string;
    idempotencyKey: string;
  }): Promise<{ id: string }>;
  /** record_key 是否已在该 run 落过(ux_ingestion_records_run_key 预检 → 已写跳过)。 */
  recordExists(runId: string, recordKey: string): Promise<boolean>;
  /** 落 ingestion_records ledger(幂等锚);标记该 record_key 已写。 */
  markRecordWritten(runId: string, recordKey: string): Promise<void>;
  /** 写一条 audience_signal(C-4:ingestionRunId 必带,见 ingestAudienceSignal)。 */
  ingestSignal(input: {
    source: string;
    rawText: string;
    demandTag: string | null;
    ingestionRunId: string;
  }): Promise<void>;
  /** 完成该 run(status→completed)。 */
  completeRun(runId: string): Promise<void>;
}

export interface IngestCommentsResult {
  runId: string;
  received: number; // 收到评论条数
  written: number; // 实际新写入信号条数
  skipped: number; // record_key 命中已写 → 跳过条数
}

/**
 * 把一批评论落成 audience_signals(线 B 评论口径,SPEC §5 C-4)。
 * 流程照现有 metrics 落库范式:建 run → loop 评论 → record_key=`douyin:comment:${commentId}`
 * 经 ux_ingestion_records_run_key 去重(已写跳过)→ ingestAudienceSignal({source:"comment",
 * rawText:text, demandTag:null, ingestionRunId}) → 标记 record 已写 → completeRun。
 * **幂等**:同评论(同 commentId,同 run idempotencyKey)跑两次只写一次(record_key 去重锚)。
 * 导出为纯 ports 函数,可用 fake ports 单测,不依赖真浏览器/真 db。
 */
export async function ingestComments(
  awemeId: string,
  records: CommentRecord[],
  deps: {
    ports: CommentIngestPorts;
    externalSourceId: string;
    capturedAt: string;
  },
): Promise<IngestCommentsResult> {
  const { ports, externalSourceId, capturedAt } = deps;
  // 幂等键形如 `${sourceId}:comments:${capturedAt}`(同源同刻复跑取回同一 run)。
  const run = await ports.createRun({
    externalSourceId,
    runType: "douyin_comments",
    idempotencyKey: `${externalSourceId}:comments:${capturedAt}`,
  });
  let written = 0;
  let skipped = 0;
  for (const c of records) {
    const recordKey = `douyin:comment:${c.commentId}`;
    // 去重锚:record_key 已在该 run 落过 → 跳过(不重复写信号)。
    if (await ports.recordExists(run.id, recordKey)) {
      skipped += 1;
      continue;
    }
    await ports.ingestSignal({
      source: "comment", // 既有 enum(不扩 douyin_comment)
      rawText: c.text,
      demandTag: null,
      ingestionRunId: run.id, // C-4 铁律:信号写必带真 run id
    });
    await ports.markRecordWritten(run.id, recordKey);
    written += 1;
  }
  await ports.completeRun(run.id);
  return { runId: run.id, received: records.length, written, skipped };
}
