import "server-only";
import { createHash } from "node:crypto";
import type { MetricRecord } from "@creatoros/backend/modules/ingestion";
// [T-326 RT-H09] ffmpeg 路径统一解析链(env → 随包 sidecar → PATH/常见目录 → 诚实报错)——
// 与 ai-worker whisper-local PCM 解码共用同一把解析器,根治硬编码 /opt/homebrew/bin/ffmpeg。
import { resolveFfmpegPath } from "@creatoros/ai-worker";
// [T-326 B-04] 错误类抽到零依赖叶子模块(见下方 re-export 注释);本文件内部 throw/instanceof 用它。
import { DouyinNotLoggedInError } from "./douyin-errors";
// T-038b 限流网关集成:每个对外抖音请求过 withDouyinChannel(acquire→跑→report)。
// gateway 走**可注入窄端口**(DouyinChannelGate),默认 instantNoopGateway(不真等)——
// 既有单测不传 gateway 即用它,零回归;runtime 由 persistence-client 注真单例。
import {
  withDouyinChannel,
  instantNoopGateway,
  // [T-232] 评论批量采集的额度断点判别:撞冷却 → 立即停剩余作品(不逐个白撞)。
  DouyinCooldownActiveError,
  type DouyinChannelGate,
  type ClassifyInput,
} from "./douyin-request-gateway";

// 抖音真实指标抓取适配器(线 B)。通过 Chrome CDP 连用户**常驻已登录**的浏览器
// (chromium.connectOverCDP),拦截创作者中心 XHR 拿 JSON,映射成 ingestion 的
// `MetricRecord`(对齐 metric_snapshots 落库目标)。参考 cheat-on-content 的
// douyin-session/crawler.py 的 endpoint 与字段形状,Node/TS 重写。
//
// 分层:① 纯函数 parseWorkList/parseDetail/toMetricRecords —— 不碰浏览器,可单测;
//       ② fetchDouyinMetrics —— 真连浏览器(测试不跑;需用户已登录的 CDP 会话)。
// cookie/会话只活在用户自己的浏览器里,绝不落库、绝不入 Git。

// ---------------------------------------------------------------------------
// [T-202] 导航重试(可单测):抖音创作者中心 page.goto 偶发瞬时超时(真机报
//   `page.goto: Timeout 60000ms exceeded navigating to .../content/manage` —— run 历史证明
//   瞬时:首次 failed、重试即 succeeded)。裸 goto 首次撞抖动就抛,拖垮整轮采集 → self.detail
//   跑不完 →(可见性没同步/封面没回填/重建没排队)。抽一个统一重试 helper:goto 超时/失败 →
//   退避重试(默认 2s/5s/10s),全部失败才抛**原错**(保留 DouyinExportError 分类语义不变)。
// ---------------------------------------------------------------------------

/** gotoWithRetry 只依赖 page 的 goto + waitForTimeout(三处调用点的 page 接口都满足;
 *  fake page 单测同样只需这两件事)。 */
interface GotoCapablePage {
  goto(url: string, opts?: unknown): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
}

export interface GotoWithRetryOptions {
  /** 重试次数(不含首次尝试);默认 3(共 4 次)。 */
  retries?: number;
  /** 每次 goto 的超时(ms);默认 60000(与原裸 goto 一致)。 */
  timeoutMs?: number;
  /** 每次失败后的退避序列(ms);默认 [2000, 5000, 10000],超出长度取末位。 */
  backoffMs?: number[];
  /** goto 的 waitUntil(默认 domcontentloaded,与三处原调用一致)。 */
  waitUntil?: "domcontentloaded" | "load" | "networkidle" | "commit";
  /** 日志用短标签(默认取 url);标识是哪一步导航失败/自愈。 */
  label?: string;
}

/**
 * [T-202] 带退避重试的 page.goto。瞬时导航抖动(超时/网络)→ 退避后重试;直到成功或用尽重试
 * 抛**最后一次的原错**(不吞、不改类型 —— 上层 mapExportErr / catch 分类逻辑不变)。成功但曾
 * 失败过会 console.log 一行自愈记录,真机可观测「本轮是否踩到瞬时超时」。退避用 page.waitForTimeout
 * (真 Playwright / fake page 都有),不额外引 timer 依赖,保持可注入单测。
 */
export async function gotoWithRetry(
  page: GotoCapablePage,
  url: string,
  opts: GotoWithRetryOptions = {},
): Promise<void> {
  const retries = opts.retries ?? 3;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const backoff = opts.backoffMs ?? [2_000, 5_000, 10_000];
  const waitUntil = opts.waitUntil ?? "domcontentloaded";
  const label = opts.label ?? url;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await page.goto(url, { waitUntil, timeout: timeoutMs });
      if (attempt > 0) {
        console.log(
          `[douyin-goto] ${label} 第 ${attempt + 1} 次尝试成功(前 ${attempt} 次瞬时失败已自愈)`,
        );
      }
      return;
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) break; // 用尽重试 → 跳出抛原错
      const waitMs = backoff[Math.min(attempt, backoff.length - 1)] ?? 2_000;
      console.warn(
        `[douyin-goto] ${label} 第 ${attempt + 1} 次导航失败(${String(
          (err as { message?: unknown })?.message ?? err,
        ).slice(0, 160)}),${waitMs}ms 后重试`,
      );
      await page.waitForTimeout(waitMs);
    }
  }
  throw lastErr;
}

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
  // [T-089] 官方标题(o.title,创作者填的短标题;老作品/未填时空串)与整篇文案
  // (o.desc,多行 caption)分离 —— 不再混用。title 空时由 desc 首行派生短标题
  // (deriveWorkTitle),desc 全文另存(创作资产不丢)。
  title: string;
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
        // [T-089] 区分官方 title 与 desc(旧代码 `desc: str(o.desc) || str(o.title)`
        // 把两者混成一个字段 → 建项目 title 变整篇文案的根因)。
        title: str(o.title),
        desc: str(o.desc),
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
// 登录用户自己的抖音身份(T-136 §D 绑定流程)—— 昵称 + sec_uid + 抖音号。来源:创作者中心
// 作品列表 XHR 里每条作品的 `author`/`user` 字段(**登录用户自己的作品列表**,故 author 就是
// 自己)。扫码阶段的 sessionid cookie 不含昵称,只能从内容 payload 反解;抓不到给 null(诚实
// 降级,不硬造),service 保留占位「我的抖音」不覆盖。字段名从现有 scraper 及 cheat-on-content
// 推断:nickname(昵称)/ sec_uid | sec_user_id(稳定加密 uid)/ unique_id(抖音号)兜底 uid。
// ---------------------------------------------------------------------------

export interface DouyinSelfIdentity {
  /** 登录用户抖音昵称(必有才算抓到;空则整体返 null)。 */
  nickname: string;
  /** 稳定加密 uid(sec_uid / sec_user_id);抓不到空串。存 external_source.sourceIdentifier。 */
  secUid: string;
  /** 抖音号(unique_id)优先,兜底数字 uid;抓不到空串。人可读的号码,供展示/去重。 */
  douyinId: string;
  /**
   * [T-214] 账号总粉丝数 —— 从 author 对象取 follower_count ?? mplatform_followers_count ??
   * follower_count_str(数值化)。author 无粉丝字段 / 解析失败 → null(诚实降级,不硬造)。
   * service 侧仅当 >0 才回填 account.followerBaseline(治编导 agent「粉丝数 0」)。
   */
  followerCount: number | null;
}

/**
 * 从作品列表 XHR(`aweme_list`/`item_list`)抽登录用户**自己**的身份(纯函数,可单测)。
 * 取第一条带 author/user 且有 nickname 的作品的作者身份 —— 登录用户的作品列表里 author 就是
 * 本人。nickname 是身份最小充分条件:无 nickname(或列表空 / 脏 JSON)→ 返 null(降级,由
 * service 保留占位,不覆盖)。secUid/douyinId 尽力取,取不到留空串(不阻断)。
 */
export function parseSelfIdentity(json: unknown): DouyinSelfIdentity | null {
  const root = (json ?? {}) as Record<string, unknown>;
  const list =
    (Array.isArray(root.aweme_list) && root.aweme_list) ||
    (Array.isArray(root.item_list) && root.item_list) ||
    (Array.isArray((root.data as Record<string, unknown>)?.aweme_list) &&
      ((root.data as Record<string, unknown>).aweme_list as unknown[])) ||
    [];
  for (const raw of list as unknown[]) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const author = (o.author ?? o.user ?? {}) as Record<string, unknown>;
    const nickname = str(author.nickname) || str(author.name);
    if (!nickname.trim()) continue; // 无昵称不算身份,试下一条
    const secUid = str(author.sec_uid) || str(author.sec_user_id);
    // 抖音号(人可读):unique_id 优先(如 `moonlit_creator`);无则退化数字 uid。
    const douyinId = str(author.unique_id) || str(author.uid) || str(author.user_id);
    // [T-214] 总粉丝数:author 常带 follower_count / mplatform_followers_count(数值)或
    //   follower_count_str(字符串)。三键 ?? 兜底;字段全缺(undefined/null)→ null(诚实降级,
    //   不写 0 冒充);num() 解析失败退 0(不影响回填,service 只在 >0 时才覆盖 baseline)。
    const followerRaw =
      author.follower_count ??
      author.mplatform_followers_count ??
      author.follower_count_str;
    const followerCount = followerRaw == null ? null : num(followerRaw);
    return { nickname, secUid, douyinId, followerCount };
  }
  return null;
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

// [T-089] 短标题派生规则(单一真源,存量修正脚本同规则):官方 title 非空 → 原样用;
// 空 → desc 首行(去首尾空白)截 40 字。整篇文案不再当标题。
export const DERIVED_TITLE_MAX = 40;
export function deriveWorkTitle(title: string, desc: string): string {
  const official = title.trim();
  if (official) return official;
  const firstLine = (desc.split(/[\r\n]/)[0] ?? "").trim();
  // 按码点截(Array.from),别把 emoji 代理对劈成半个字符。
  return [...firstLine].slice(0, DERIVED_TITLE_MAX).join("");
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
    // 数据底座(SPEC §1.3):携带真实标题 + 发布时刻(create_time 秒 → ISO),
    //   供 ensureImportedProject 给历史项目起真名 / 落 platform_ref.publishedAt。
    // [T-089] title 不再是整篇 desc:官方 title 优先,空则 desc 首行截 40 字;
    //   desc 全文另存(→ 项目 brief,文案是创作资产不丢)。
    const title = deriveWorkTitle(w.title, w.desc) || undefined;
    const desc = w.desc.trim() || undefined;
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
      ...(desc ? { desc } : {}),
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
  // T-038b [gate-F7 插装点①]:iesdouyin channel 限流网关(无 cookie,封 IP,minInterval 9s)。
  // 默认 instantNoopGateway(既有单测不传即不真等);runtime 注真单例。
  gateway?: DouyinChannelGate;
}

const REAL_FETCH_DEPS: FetchDouyinVideoUrlDeps = {
  fetch: (...args) => fetch(...args),
};

// iesdouyin 取直链的错误 → classify 输入映射(T-038b):
//   - 无 _ROUTER_DATA / JSON 解析失败(parseDouyinVideoUrl 抛的两条,风控残页)→ router-data-missing(throttled)。
//   - item_list 空(图集/已删除,内容性质)→ empty-item-list(content-error 不退避)。
//   - 其余(网络失败 / HTTP 非 2xx / ffmpeg 等)→ net-timeout 单次(保守,单次不 cooldown)。
function mapIesdouyinErr(err: unknown): ClassifyInput {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (raw.includes("_ROUTER_DATA")) return { kind: "router-data-missing" };
  if (raw.includes("item_list 为空")) return { kind: "empty-item-list" };
  return { kind: "net-timeout", consecutiveTimeouts: 1 };
}

/**
 * GET iesdouyin 分享页(手机 UA)→ parseDouyinVideoUrl 抽无水印直链。fetch 可注入(默认真
 * 全局 fetch),故 D2 runner 里这层由 host 装配真 fetch,单测注 fake(返 canned HTML)。
 * 非 2xx / 无 _ROUTER_DATA → 抛 DouyinAudioFetchError(runner 标该 aweme 失败,其余继续)。
 *
 * [Bug-4 T-017] **30s 超时**(AbortSignal.timeout):iesdouyin 偶发半开连接 / IP 静默风控 /
 * 服务器不返响应,裸 await 永不 resolve → runner 卡死(封面回填看到「5/73」即此) →
 * 整批僵在某条作品等永远。30s 远超正常 (~1-3s) 但不至于让一个坏作品卡整批。
 * 超时触发 → fetch reject AbortError → 下面 try/catch 把它当失败归一,网关报 net-timeout,
 * runner 增 failed 计数继续下一条(已存在的兜底链路)。
 */
const IESDOUYIN_FETCH_TIMEOUT_MS = 30_000;

export async function fetchDouyinVideoUrl(
  awemeId: string,
  deps: FetchDouyinVideoUrlDeps = REAL_FETCH_DEPS,
): Promise<DouyinVideoUrl> {
  const gateway = deps.gateway ?? instantNoopGateway;
  // [gate-F7 插装点①] iesdouyin channel:acquire→取直链→report(classify)。报告后仍抛原错。
  return withDouyinChannel(
    gateway,
    "iesdouyin",
    async () => {
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
          signal: AbortSignal.timeout(IESDOUYIN_FETCH_TIMEOUT_MS),
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
    },
    mapIesdouyinErr,
  );
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
  /** ffmpeg 可执行路径(显式注入则短路解析链;默认走 resolveFfmpegPath 四级解析,RT-H09)。 */
  ffmpegPath?: string;
  /** 解析器可注入(单测 fake 解析链结果/抛错;默认真 resolveFfmpegPath)。 */
  resolveFfmpeg?: () => string;
}

const REAL_SPAWN_DEPS: StreamAudioDeps = {
  spawn: (command, args) => {
    // 动态引入 child_process(server-only;避免打进客户端 bundle)。
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { spawn } = require("node:child_process") as typeof import("node:child_process");
    return spawn(command, args) as unknown as SpawnedProcess;
  },
  // ffmpegPath 不再硬编码 —— 每次抽音时惰性走 resolveFfmpegPath 解析链
  // (env CREATOROS_FFMPEG_PATH → 随包 sidecar bin/ → PATH/常见安装目录 → 诚实报错)。
};

/**
 * ffmpeg 从无水印直链**流式**抽音频(16kHz / 单声道 / 64k mp3),收 stdout mp3 bytes(不落盘)。
 * 忠实移植 skill `ffmpeg_stream_to_audio` 的命令(带 Referer 头 → pipe:1 stdout):
 *   ffmpeg -headers "Referer: https://www.douyin.com/\r\n" -i {url} -vn -ar 16000 -ac 1 -b:a 64k -f mp3 pipe:1
 * spawn 可注入(默认 child_process.spawn),故 D2 runner 里这层单测注 fake(返固定 bytes / 模拟非 0 退出)。
 * 非 0 退出 / spawn error / 无 bytes → 抛 DouyinAudioFetchError(runner 标该 aweme 失败,其余继续)。
 * ffmpeg 找不到(解析链全 miss / env 配错)同样归 DouyinAudioFetchError —— 信息里带安装/配置
 * 引导,任务失败明细能看到「装 ffmpeg 或配 CREATOROS_FFMPEG_PATH」,不静默。
 */
export async function streamAudioFromVideo(
  playUrl: string,
  deps: StreamAudioDeps = REAL_SPAWN_DEPS,
): Promise<Uint8Array> {
  // 解析链:显式注入 ffmpegPath > 注入的解析器 > 真 resolveFfmpegPath(env → 随包 → PATH → 报错)。
  let ffmpegPath: string;
  try {
    ffmpegPath = deps.ffmpegPath ?? (deps.resolveFfmpeg ?? resolveFfmpegPath)();
  } catch (err) {
    throw new DouyinAudioFetchError(
      `streamAudioFromVideo: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
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
  // T-038b [gate-F7 插装点②]:creator-center channel 限流网关(带 sessionid,封账号,minInterval 4s)。
  // **每翻一页 acquire 一次**(把 40 页翻页真正限速)。默认 instantNoopGateway(既有单测不真等)。
  gateway?: DouyinChannelGate;
  // [T-177 增量化] 库里已知的 douyin 作品 awemeId 集(由 composition root 从 publications 反查)。
  //   作品列表默认按发布时间倒序(新→旧):某页作品**全部**已在该集(且非空)= 已翻到旧作品,
  //   提前停翻页(不再滚到 staleRounds≥3 / maxPages),省掉每轮几十页的重复滚动。
  //   省略 / 空集(首次采集,库里无作品)→ 退化为原全量滚动(安全,无行为变化)。
  //   **coverage 权衡(诚实标注)**:early-stop 只优化翻页深度 —— 稳态(无新作品)下会在最新页即停,
  //   故更旧的作品当轮不再被重新快照(时间序列仅最新作品每轮刷新,旧作品刷新频率下降)。这是本任务
  //   有意的省 token 取舍(创作者最关心近作指标);要旧作品也每轮全量快照,置空该集即可退回全量。
  knownAwemeIds?: Set<string>;
}

export interface LoginDouyinOptions {
  authDir: string;
  /** 扫码最多等多少秒(默认 240)。 */
  timeoutSec?: number;
}

// 未登录抖音创作者中心 —— 类本体已抽到零依赖叶子模块 douyin-errors.ts([T-326 B-04]:
// persistence-client 的同步 instanceof 判别点不必加载本重模块);顶部 import + 此处 re-export
// 保持既有 `from "./douyin-cdp"` 的 import 路径与错误类身份(同一 class 实例)全部兼容。
export { DouyinNotLoggedInError } from "./douyin-errors";

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
// T-041(2026-07-02 headed 实测):抖音把评论页从旧 `content/comment-manage` 挪到了
// `interactive/comment`——旧 URL 导航过去被重定向到 content/upload(发布页),评论 XHR
// (/aweme/v1/web/comment/list/)一次不触发 → 采集 succeeded 却 0 条。新 URL 带 ?item_id=
// 过滤停在本页且真触发评论 XHR(headed 复现:解析到该作品评论)。
const CREATOR_COMMENT_MANAGE =
  "https://creator.douyin.com/creator-micro/interactive/comment";
// 数据中心「作品分析」旧版 URL(T-030-D8a 明细导出入口)。TzFilm 踩坑:必须强制导航到旧版
// data-center/content,否则 Garfish 微前端不加载,「投稿列表」/「导出数据」都找不到。
const CREATOR_DATA_CENTER_CONTENT =
  "https://creator.douyin.com/creator-micro/data-center/content";

// [T-369] 启动预检/并发防抖/超时报错统一收进 chromium-guard.guardedLaunch(原地清锁的
// clearSingletonLocks 升级为「杀残留进程+清锁+同 profile 串行+15s 超时人话报错」共享 helper)。

// [T-173] Chromium 浏览器二进制(~344M)不打进桌面包 —— 首次用采集/扫码时**自动下载**到 Playwright
//   默认缓存(Mac: ~/Library/Caches/ms-playwright;Win: %LOCALAPPDATA%\ms-playwright)。跨 Win/Mac:
//   走 playwright CLI `install chromium`,平台差异由 Playwright 自己处理。装过即秒过(检查 executablePath
//   实际存在)。用 bundled node(process.execPath)跑 CLI —— 桌面包里就是它。
let chromiumEnsured = false;
// [T-281] 导出复用:video.render executor 的 Chromium 下载走这份 frontend-context 实现
//   (playwright CLI 定位只在 frontend 解析基准下可行;executor 在 backend chunk 里 resolve 会崩)。
export async function ensureChromiumInstalled(): Promise<void> {
  if (chromiumEnsured) return;
  const { chromium } = await import("@playwright/test");
  const { existsSync } = await import("node:fs");
  try {
    const p = chromium.executablePath();
    if (p && existsSync(p)) {
      chromiumEnsured = true;
      return;
    }
  } catch {
    // executablePath 抛错 = 版本/注册表异常,照样走下载兜底。
  }
  // 未装 → playwright install chromium(首启一次性下载;之后共享缓存,app 更新也复用)。
  console.warn("[ingestion] 未检测到 Chromium,首次自动下载(playwright install chromium)…");
  const { spawn } = await import("node:child_process");
  const { createRequire } = await import("node:module");
  const { dirname, join } = await import("node:path");
  const require = createRequire(import.meta.url);
  // playwright bin=cli.js,但 exports 未列 ./cli.js(require.resolve 被 exports 挡)→ 解析已导出的
  //   package.json 再 join 同级 cli.js。**包名拼接**避开 Next 构建期静态解析(否则 Next 把 playwright
  //   trace 到 ESM 入口 → "require() resolves to a EcmaScript module" build error);运行时才真解析
  //   (sidecar 内 bundlePlaywright 已实拷 playwright)。
  const pwPkgJson = require.resolve(["play", "wright/package.json"].join(""));
  const cli = join(dirname(pwPkgJson), "cli.js");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "install", "chromium"], {
      stdio: "inherit", // 进度打到 sidecar 日志(UI 侧「扫码中…」覆盖等待;进度条 UI 列后续)
      env: process.env,
    });
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`playwright install chromium 退出码 ${code}`)),
    );
    child.on("error", reject);
  });
  chromiumEnsured = true;
  console.warn("[ingestion] Chromium 下载完成。");
}

// 自起 Chromium + 持久化 profile(.auth/),不连用户现成浏览器(connectOverCDP 那条路对真实
// [T-299] 解析已打包的**全量** chromium 可执行路径。根因:headless 的 launchPersistentContext 默认
//   找 chrome-headless-shell(playwright 的独立 headless 浏览器),而打包只 bundle 了全量 chromium-<rev>
//   (bundleChromiumBrowser,T-284),没打 headless_shell → 装机版采集(评论/收藏夹/选题,都 headless)
//   崩「Executable doesn't exist …chromium_headless_shell-…」。修:显式传 executablePath=全量 chromium
//   → headless 也用全量(--headless),复用已打包的 341MB,不再多打 ~100MB。优先确定性扫
//   PLAYWRIGHT_BROWSERS_PATH(打包混淆 runtime 稳,复用视频渲染 locateBundledChromium 同款),
//   回落 chromium.executablePath()(dev 系统缓存)。都取不到 → undefined(交回 playwright 默认,
//   dev 环境有 headless_shell 不受影响)。
export async function resolveChromiumExecutable(): Promise<string | undefined> {
  const { join } = await import("node:path");
  const { readdir, stat } = await import("node:fs/promises");
  const browsersDir =
    process.env.PLAYWRIGHT_BROWSERS_PATH || join(process.cwd(), "browsers");
  try {
    const entries = await readdir(browsersDir).catch(() => [] as string[]);
    const dir = entries
      .filter((e) => /^chromium-\d+$/.test(e))
      .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)))[0];
    if (dir) {
      const rels = [
        "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chrome-linux/chrome",
        "chrome-win/chrome.exe",
      ];
      for (const rel of rels) {
        const p = join(browsersDir, dir, rel);
        const st = await stat(p).catch(() => null);
        if (st?.isFile()) return p;
      }
    }
  } catch {
    // fall through → executablePath 兜底
  }
  try {
    const { chromium } = await import("@playwright/test");
    const { existsSync } = await import("node:fs");
    const p = chromium.executablePath();
    if (p && existsSync(p)) return p;
  } catch {
    // ignore → undefined(交回 playwright 默认)
  }
  return undefined;
}

// [T-307] 统一浏览器选择:**优先系统 Chrome**(channel:"chrome" —— 登录 profile 兼容 + OAuth 友好),
//   起不来回落**已打包全量 chromium**(executablePath,绕缺失的 chrome-headless-shell)。
//   `chromium.launch` 与 `launchPersistentContext` 都经此双试——关键是保证「谁写登录态、谁读登录态」
//   用**同一个浏览器**:否则系统 Chrome 用钥匙串加密的 cookie,Chromium-for-Testing 解不开 → 读不到登录态。
export async function launchWithBrowser<T>(
  run: (sel: { channel?: string; executablePath?: string }) => Promise<T>,
): Promise<T> {
  try {
    return await run({ channel: "chrome" });
  } catch {
    const executablePath = await resolveChromiumExecutable();
    return await run(executablePath ? { executablePath } : {});
  }
}

// 用户 Chrome 不稳)。headless=false 用于扫码登录;true 用于复刷抓取。
async function openContext(authDir: string, headless: boolean) {
  await ensureChromiumInstalled(); // [T-173] 首启自动下载 Chromium(装过秒过)
  const { chromium } = await import("@playwright/test");
  const { mkdir } = await import("node:fs/promises");
  const { guardedLaunch, chromiumSandboxOpts } = await import("./chromium-guard");
  await mkdir(authDir, { recursive: true }).catch(() => {});
  // [T-299] 显式全量 chromium(headless 也用它,绕开缺失的 chrome-headless-shell)。
  const executablePath = await resolveChromiumExecutable();
  // [T-369] guardedLaunch:预检杀残留+清锁(只清锁,不动登录态)→ 同 profile 串行 → 超时人话报错。
  return guardedLaunch(
    authDir,
    () =>
      chromium.launchPersistentContext(authDir, {
        headless,
        ...(executablePath ? { executablePath } : {}),
        ...chromiumSandboxOpts(), // [T-369] 去掉 Playwright 默认 --no-sandbox(警告横幅根因)
        viewport: { width: 1440, height: 900 },
        acceptDownloads: true, // 明细导出走 download 事件截 xlsx;现代 Playwright 默认 true,显式设上保险
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-proxy-server", // 抖音国内站直连,跳过系统代理避免 Clash 端口变化报错
        ],
      }),
    { label: "抖音浏览器窗口" },
  );
}

async function isLoggedIn(
  ctx: import("@playwright/test").BrowserContext,
): Promise<boolean> {
  const cookies = await ctx.cookies("https://creator.douyin.com");
  return cookies.some((c) => c.name === "sessionid" || c.name === "sessionid_ss");
}

/**
 * 被动状态探针(T-032a):headless 起 context 快查 .auth/ 里的 sessionid cookie,**不弹窗**、
 * 不导航抓取。设置页「账号绑定」卡据此显「已连接/未连接」徽标。cookie 失效(登录态过期)即返
 * false —— .auth/ 目录只是持久 profile,存在≠有效登录,故 false 同时覆盖「未连接」与「已过期」。
 * 仅在用户机器上跑;测试经 service 层注入 fake 的 `status()` 端口,不连真浏览器。
 */
export async function checkDouyinStatus(opts: {
  authDir: string;
}): Promise<boolean> {
  const ctx = await openContext(opts.authDir, true);
  try {
    return await isLoggedIn(ctx);
  } finally {
    await ctx.close().catch(() => {}); // 关我们自起的 Chromium(非用户浏览器)
  }
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

// fetchDouyinMetrics 只依赖 page/context 的这几个能力(收窄便于 fake page 单测,不起真
// Chromium)。真实 Playwright Page/BrowserContext 结构上满足(默认注入时向上转型目标)。
type MetricsResponseHandler = (resp: {
  url(): string;
  json(): Promise<unknown>;
}) => void;
interface MetricsCapablePage {
  on(event: "response", cb: MetricsResponseHandler): void;
  goto(url: string, opts?: unknown): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<R>(fn: () => R): Promise<R>;
  keyboard: { press(key: string): Promise<void> };
  mouse: { wheel(deltaX: number, deltaY: number): Promise<void> };
}
interface MetricsCapableContext {
  pages(): MetricsCapablePage[];
  newPage(): Promise<MetricsCapablePage>;
  cookies(url: string): Promise<Array<{ name: string }>>;
  close(): Promise<void>;
}

/** fetchDouyinMetrics 的可注入依赖(默认真 openContext(.auth/, headless);单测注 fake page/ctx
 *  断言翻页每页 acquire creator-center + 关一次)。 */
export interface FetchDouyinMetricsDeps {
  openContext?: (
    authDir: string,
    headless: boolean,
  ) => Promise<MetricsCapableContext>;
}

const realMetricsOpenContext = (authDir: string, headless: boolean) =>
  openContext(authDir, headless) as unknown as Promise<MetricsCapableContext>;

/**
 * fetchDouyinMetrics 的返回:作品指标 records + 登录用户自己的身份 identity(T-136 §D)。
 * identity 从抓取过程中拦到的作品列表 XHR 反解(每条作品的 author 就是登录用户本人);抓不到
 * 给 null(诚实降级,service 保留占位不覆盖)。records 语义不变(向后兼容:归一 helper 见 service)。
 */
export interface FetchDouyinMetricsResult {
  records: MetricRecord[];
  identity: DouyinSelfIdentity | null;
}

/**
 * 真抓:headless 复用 .auth/ 登录态 → 导航创作者中心 → 拦作品列表 XHR → 礼貌滚动翻页 →
 * { records, identity }。**不落库**(落库由 ingestion.service 负责)。未登录抛 DouyinNotLoggedInError
 * (调用方提示先扫码登录)。openContext 端口注入(默认真 openContext),故翻页限流可确定性单测。
 * [T-136 §D] 顺带从作品列表 XHR 反解登录用户自己的身份(nickname/sec_uid/抖音号),供 service
 * 用真实昵称替占位「我的抖音」;抓不到 identity=null(不硬造)。
 */
export async function fetchDouyinMetrics(
  opts: FetchDouyinOptions,
  deps: FetchDouyinMetricsDeps = {},
): Promise<FetchDouyinMetricsResult> {
  const maxPages = opts.maxPages ?? 40; // 上限(每页 ~12 条;has_more=false 会提前停,40 覆盖 ~480 作品)
  const gateway = opts.gateway ?? instantNoopGateway; // [gate-F7 插装点②] creator-center 每页限流
  const openCtx = deps.openContext ?? realMetricsOpenContext;
  const ctx = await openCtx(opts.authDir, true);
  try {
    // 登录校验(窄接口只用 ctx.cookies;真 BrowserContext 结构满足)。
    const cookies = await ctx.cookies("https://creator.douyin.com");
    const loggedIn = cookies.some(
      (c) => c.name === "sessionid" || c.name === "sessionid_ss",
    );
    if (!loggedIn) throw new DouyinNotLoggedInError();
    const page = ctx.pages()[0] ?? (await ctx.newPage());

    const workJsons: unknown[] = [];
    const seenIds = new Set<string>();
    // [T-177 增量化] 库里已知作品集(倒序翻页 early-stop 锚);未注入 → 空集 → 退化全量。
    const known = opts.knownAwemeIds ?? new Set<string>();
    let reachedKnown = false; // 某页作品全已知(且非空)→ 已翻到旧作品,提前停翻页
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
        const works = parseWorkList(j);
        // [T-177] 本页作品全部已是库里已知 awemeId(且非空)→ 无新作品 → 更深页更旧、也全已知 → 停翻页。
        if (
          known.size > 0 &&
          works.length > 0 &&
          works.every((w) => known.has(w.awemeId))
        ) {
          reachedKnown = true;
        }
        for (const w of works) seenIds.add(w.awemeId);
        const hm = readHasMore(j);
        if (hm !== undefined) hasMore = hm;
      } catch {
        /* 非 JSON 响应,忽略 */
      }
    });

    // [T-202] 导航加退避重试(瞬时超时自愈,不首撞就抛)。
    await gotoWithRetry(page, CREATOR_CONTENT, {
      timeoutMs: 60_000,
      label: "creator-content(作品列表)",
    });
    await page.waitForTimeout(3000); // 等首屏 work_list XHR 回来

    // 激进滚动翻页:window 滚到底 + 滚最高可滚容器 + End 键 + 滚轮。单一 mouse.wheel 触不到列表
    // 容器,是只抓到首页 24 条的根因。停止:某页 has_more=false(可靠),或连续 3 轮无新作品,或到上限。
    let staleRounds = 0;
    for (let i = 0; i < maxPages; i++) {
      if (!hasMore) break; // 抖音 work_list 明确翻到底
      // [T-177 增量化] 首屏(goto 后)或上一轮滚动加载的页已全是库里已知作品 → 提前停,少滚几十页。
      if (reachedKnown) break;
      const before = seenIds.size;
      // [gate-F7 插装点②] 每翻一页 acquire 一次 creator-center(把翻页真正限速,防高频撞账号风控)。
      await withDouyinChannel(gateway, "creator-center", async () => {
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
              if (
                el.scrollHeight > el.clientHeight + 200 &&
                el.scrollHeight > max
              ) {
                max = el.scrollHeight;
                best = el;
              }
            }
            if (best)
              (best as HTMLElement).scrollTop = (
                best as HTMLElement
              ).scrollHeight;
          })
          .catch(() => {});
        await page.keyboard.press("End").catch(() => {});
        await page.mouse.wheel(0, 3000).catch(() => {});
        await page.waitForTimeout(2500);
      });
      if (reachedKnown) break; // [T-177] 本轮滚动加载的页全是已知作品 → 停
      staleRounds = seenIds.size === before ? staleRounds + 1 : 0;
      if (staleRounds >= 3) break; // has_more 不返回时的兜底,防死循环
    }

    const works = workJsons.flatMap((j) => parseWorkList(j));
    // 去重(同 aweme_id 保留最后一次)。明细(完播/转粉)留后续补;先返回列表级真实指标。
    const byId = new Map<string, DouyinWork>();
    for (const w of works) byId.set(w.awemeId, w);
    const records = toMetricRecords([...byId.values()], new Map(), opts.capturedAt);
    // [T-136 §D] 从拦到的作品列表 XHR 反解登录用户自己的身份(第一条命中的 author = 本人);
    //   抓不到 → null(service 保留占位「我的抖音」不覆盖,诚实降级)。
    let identity: DouyinSelfIdentity | null = null;
    for (const j of workJsons) {
      identity = parseSelfIdentity(j);
      if (identity) break;
    }
    // [T-214] 诊断日志(真机确认 author 到底有没有粉丝字段的唯一凭据):followerCount=null
    //   时明确标注「author 无粉丝字段」—— 若真机稳定为 null,说明 author 路径拿不到,得改从
    //   创作者中心主页 header 抓(本任务先做 author 路径,靠这条日志暴露真相,不假装拿到)。
    if (identity) {
      const fc = identity.followerCount;
      console.log(
        `[douyin-identity] nickname=${identity.nickname} secUid=${identity.secUid || "(空)"} ` +
          `followerCount=${fc === null ? "null(author 无粉丝字段,需改主页抓取)" : fc}`,
      );
    } else {
      console.log("[douyin-identity] 未解析到身份(作品列表空/无 author/脏 JSON)");
    }
    return { records, identity };
  } finally {
    await ctx.close().catch(() => {}); // 关我们自起的 Chromium(非用户浏览器)
  }
}

/**
 * [T-330] 轻量身份读回 —— 「扫码绑定新号」staging 登录态下同步读回登录用户是谁。
 * 实现选型:**复用 fetchDouyinMetrics 全套**(登录校验 + 作品列表 XHR 拦截 + parseSelfIdentity
 * 反解),只把 maxPages 压到 1(首屏 work_list 即含 author=本人,不深翻页)—— 不新写一条
 * XHR 拦截链(维护面最小,身份口径与 refresh 采集完全同源)。
 * 读不到(该号零作品/脏 JSON)→ null,由调用方诚实失败(绝不猜身份);staging 目录未登录
 * → 照抛 DouyinNotLoggedInError(调用方同样按失败清理)。records 顺带抓到也不落库(本函数
 * 只取 identity;正式全量采集由绑定成功后的初始化 refreshDouyin 负责)。
 */
export async function fetchDouyinIdentity(opts: {
  authDir: string;
}): Promise<DouyinSelfIdentity | null> {
  const { identity } = await fetchDouyinMetrics({
    authDir: opts.authDir,
    capturedAt: new Date().toISOString(),
    maxPages: 1,
  });
  return identity;
}

// ---------------------------------------------------------------------------
// [T-212a] 对标他号作品采集 —— 抓一个对标博主(sec_uid)主页的公开作品列表(digg/评论/收藏/
//   分享/时长/发布时间)。复用登录态指纹(蹭 .auth/ 的 douyin.com cookie),走用户主页
//   `www.douyin.com/user/<sec_uid>` 页内 aweme/post XHR(同 self.metrics 那套 WORK_LIST_HINTS,
//   `/web/aweme/post` 已在集内)。**只抓公开作品的公开统计**(合规红线),不碰非公开数据。
//
//   与 fetchDouyinMetrics 的区别:目标是"他号"(profile 页,非创作者中心 content/manage),
//   身份由 sec_uid 指定而非登录态自解。翻页默认 ~5 页(SPEC §2.1,精选源增量,非全网爬)。
//
//   ⚠️ 真机待验点(诚实标注):`www.douyin.com/user/<sec_uid>` 的 aweme/post 是否在当前
//     登录态下稳定触发、是否需额外 query 参(如 count/max_cursor)/风控参(a_bogus 等前端签名),
//     未在真机验证。若 profile 页 XHR 拿不到,备选是走 iesdouyin 分享页解析(同 fetchDouyinVideoUrl
//     那套匿名路径)。本函数按 self.metrics 的 XHR 拦截范式实现,gateway 限流已接;真机跑通前
//     视为"接线就绪、待验证"。
// ---------------------------------------------------------------------------

/** 对标他号一条作品(公开统计,程序化从 aweme/post XHR 抽取)。 */
export interface DouyinBenchmarkWork {
  awemeId: string;
  description: string;
  diggCount: number;
  commentCount: number;
  collectCount: number;
  shareCount: number;
  durationSec: number;
  createTime: number; // unix 秒(抖音原值)
}

export interface FetchUserPostsOptions {
  authDir: string;
  /** 对标博主稳定身份 sec_uid。 */
  secUid: string;
  /** 翻几页(默认 5;每页 ~18 条)。 */
  maxPages?: number;
  gateway?: DouyinChannelGate;
}

/**
 * 抓一个对标博主(sec_uid)主页的公开作品列表。复用 .auth/ 登录态、XHR 拦截、滚动翻页、限流网关
 * (每页 acquire creator-center gate 降频)。未登录抛 DouyinNotLoggedInError。openContext 端口注入
 * (默认真 openContext),故可确定性单测(不起真 Chromium)。**只读公开数据。**
 */
export async function fetchDouyinUserPosts(
  opts: FetchUserPostsOptions,
  deps: FetchDouyinMetricsDeps = {},
): Promise<DouyinBenchmarkWork[]> {
  const maxPages = opts.maxPages ?? 5;
  const gateway = opts.gateway ?? instantNoopGateway;
  const openCtx = deps.openContext ?? realMetricsOpenContext;
  const ctx = await openCtx(opts.authDir, true);
  try {
    // 登录态校验(蹭 douyin.com 会话;未登录 → 提示扫码,同 self.metrics)。
    const cookies = await ctx.cookies("https://www.douyin.com");
    const loggedIn = cookies.some(
      (c) => c.name === "sessionid" || c.name === "sessionid_ss",
    );
    if (!loggedIn) throw new DouyinNotLoggedInError();
    const page = ctx.pages()[0] ?? (await ctx.newPage());

    const workJsons: unknown[] = [];
    const seenIds = new Set<string>();
    let hasMore = true;
    const readHasMore = (j: unknown): boolean | undefined => {
      const root = (j ?? {}) as Record<string, unknown>;
      const data = (root.data ?? root) as Record<string, unknown>;
      const v = root.has_more ?? data.has_more;
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

    const profileUrl = `https://www.douyin.com/user/${encodeURIComponent(opts.secUid)}`;
    await gotoWithRetry(page, profileUrl, {
      timeoutMs: 60_000,
      label: `对标主页(${opts.secUid})`,
    });
    await page.waitForTimeout(3000); // 等首屏 aweme/post XHR

    let staleRounds = 0;
    for (let i = 0; i < maxPages; i++) {
      if (!hasMore) break;
      const before = seenIds.size;
      // 每翻一页 acquire 一次限流网关(降频 ≥ minInterval,防高频撞风控)。
      await withDouyinChannel(gateway, "creator-center", async () => {
        await page
          .evaluate(() => window.scrollTo(0, document.body.scrollHeight))
          .catch(() => {});
        await page.keyboard.press("End").catch(() => {});
        await page.mouse.wheel(0, 3000).catch(() => {});
        await page.waitForTimeout(2500);
      });
      staleRounds = seenIds.size === before ? staleRounds + 1 : 0;
      if (staleRounds >= 3) break; // 无新作品兜底,防死循环
    }

    // 去重(同 aweme_id 保留最后一次)+ 映射到对标作品形状。
    const byId = new Map<string, DouyinWork>();
    for (const j of workJsons) for (const w of parseWorkList(j)) byId.set(w.awemeId, w);
    const works: DouyinBenchmarkWork[] = [...byId.values()].map((w) => ({
      awemeId: w.awemeId,
      description: w.desc || w.title,
      diggCount: w.stats.likes,
      commentCount: w.stats.comments,
      collectCount: w.stats.favorites,
      shareCount: w.stats.shares,
      durationSec: w.durationSec,
      createTime: w.createTime,
    }));
    console.log(
      `[benchmark] fetchDouyinUserPosts sec_uid=${opts.secUid} → ${works.length} 条公开作品`,
    );
    return works;
  } finally {
    await ctx.close().catch(() => {}); // 关我们自起的 Chromium
  }
}

// ---------------------------------------------------------------------------
// [T-235b] 低粉黑马雷达搜索 —— 按关键词搜抖音「近 1 天 + 最多赞」候选视频(含作者粉丝数,
//   黑马赞粉比判定的分母)。复用 fetchDouyinUserPosts 同款范式:openContext(.auth/ 登录态)
//   + 页内 fetch(credentials:include 借登录态调 /aweme/v1/web/search/item/,darkhorse.py 同款
//   publish_time=1&sort_type=1)+ douyinGateway 限流 + 验证码检测跳过(返 [],不硬闯)。
//   **只读公开搜索结果的公开统计**(合规红线)。黑马三档判定不在此 —— 纯函数 detectDarkhorse
//   在 backend/modules/benchmark(本函数只抓原始候选,判定与抓取分层)。
// ---------------------------------------------------------------------------

/** 搜索命中的一条候选视频(公开统计 + 作者公开信息,程序化从 search/item JSON 抽取)。 */
export interface DouyinSearchVideo {
  awemeId: string;
  description: string;
  diggCount: number;
  commentCount: number;
  collectCount: number;
  shareCount: number;
  /** 时长(ms,抖音 video.duration 原值)。 */
  durationMs: number;
  /** 发布时间(unix 秒,抖音原值;缺失 0)。 */
  createTime: number;
  authorSecUid: string;
  authorNickname: string;
  /** 作者粉丝数(黑马赞粉比分母;缺失 0)。 */
  authorFollowerCount: number;
}

// darkhorse.py:43-49 同款搜索 API(publish_time=1 一天内 + sort_type=1 最多赞,count=24)。
const SEARCH_ITEM_API =
  "https://www.douyin.com/aweme/v1/web/search/item/?device_platform=webapp&aid=6383" +
  "&channel=channel_pc_web&search_channel=aweme_video_web&enable_history=1" +
  "&keyword={kw}&search_source=tab_search&query_correct_type=1" +
  "&is_filter_search=1&sort_type=1&publish_time=1&offset=0&count=24" +
  "&pc_client_type=1&version_code=170400&version_name=17.4.0&cookie_enabled=true" +
  "&screen_width=1920&screen_height=1080&browser_language=zh-CN&browser_platform=Win32" +
  "&browser_name=Chrome&browser_version=126.0.0.0&browser_online=true&platform=PC";

/** 解析 search/item API 的 JSON(data[].aweme_info 或直接条目),字段兜底(纯函数可单测)。 */
export function parseSearchVideoList(json: unknown): DouyinSearchVideo[] {
  const root = (json ?? {}) as Record<string, unknown>;
  const data = Array.isArray(root.data) ? (root.data as unknown[]) : [];
  const out: DouyinSearchVideo[] = [];
  for (const item of data) {
    const wrap = (item ?? {}) as Record<string, unknown>;
    // 条目可能包在 aweme_info 里(搜索混排),也可能就是条目本体(darkhorse.py 同款兜底)。
    const a = ((wrap.aweme_info ?? wrap) ?? {}) as Record<string, unknown>;
    const awemeId = str(a.aweme_id);
    if (!awemeId) continue; // 非视频条目(用户卡/合集卡)跳过
    const stats = (a.statistics ?? {}) as Record<string, unknown>;
    const author = (a.author ?? {}) as Record<string, unknown>;
    const video = (a.video ?? {}) as Record<string, unknown>;
    out.push({
      awemeId,
      description: str(a.desc).trim(),
      diggCount: num(stats.digg_count),
      commentCount: num(stats.comment_count),
      collectCount: num(stats.collect_count),
      shareCount: num(stats.share_count),
      durationMs: num(video.duration),
      createTime: num(a.create_time),
      authorSecUid: str(author.sec_uid),
      authorNickname: str(author.nickname),
      authorFollowerCount: num(author.follower_count),
    });
  }
  return out;
}

// fetchDouyinSearchVideos 只依赖 page/context 的这几个能力(收窄便于 fake 单测,不起真
// Chromium)。真实 Playwright Page/BrowserContext 结构上满足。
interface SearchCapablePage {
  goto(url: string, opts?: unknown): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  /** 无参求值(验证码检测读 body 文本)。 */
  evaluate<R>(fn: () => R): Promise<R>;
  /** 带参求值(页内 fetch 搜索 API;fn 序列化进页面执行,须自包含)。 */
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
}
interface SearchCapableContext {
  pages(): SearchCapablePage[];
  newPage(): Promise<SearchCapablePage>;
  cookies(url: string): Promise<Array<{ name: string }>>;
  close(): Promise<void>;
}

export interface FetchSearchVideosOptions {
  authDir: string;
  /** 搜索关键词(定位 keywords / 用户可配)。 */
  keyword: string;
  gateway?: DouyinChannelGate;
}

/** fetchDouyinSearchVideos 的可注入依赖(默认真 openContext(.auth/, headless);单测注 fake)。 */
export interface FetchSearchVideosDeps {
  openContext?: (
    authDir: string,
    headless: boolean,
  ) => Promise<SearchCapableContext>;
}

/**
 * 按关键词搜抖音「近 1 天最多赞」候选视频(黑马雷达的抓取半边)。复用 .auth/ 登录态、
 * douyinGateway 限流(整次搜索 acquire 一次 creator-center gate)。未登录抛
 * DouyinNotLoggedInError;**验证码命中 → 返 [] 跳过**(darkhorse.py 同款,不硬闯风控)。
 * openContext 端口注入,故解析/验证码分支可确定性单测。**只读公开数据。**
 */
export async function fetchDouyinSearchVideos(
  opts: FetchSearchVideosOptions,
  deps: FetchSearchVideosDeps = {},
): Promise<DouyinSearchVideo[]> {
  const gateway = opts.gateway ?? instantNoopGateway;
  const openCtx =
    deps.openContext ??
    ((authDir: string, headless: boolean) =>
      openContext(authDir, headless) as unknown as Promise<SearchCapableContext>);
  const ctx = await openCtx(opts.authDir, true);
  try {
    // 登录态校验(页内 fetch credentials:include 要借它;未登录 → 提示扫码,同 user-posts)。
    const cookies = await ctx.cookies("https://www.douyin.com");
    const loggedIn = cookies.some(
      (c) => c.name === "sessionid" || c.name === "sessionid_ss",
    );
    if (!loggedIn) throw new DouyinNotLoggedInError();
    const page = ctx.pages()[0] ?? (await ctx.newPage());

    const kw = encodeURIComponent(opts.keyword);
    // 整次搜索 acquire 一次限流网关(导航 + 页内 fetch 算一次请求节奏,防高频撞风控)。
    return await withDouyinChannel(gateway, "creator-center", async () => {
      // 先落到真实搜索页(建立 referer/风控上下文),再页内 fetch API(darkhorse.py:58-64 同款)。
      await gotoWithRetry(
        page as unknown as GotoCapablePage,
        `https://www.douyin.com/search/${kw}?publish_time=1&sort_type=1&type=video`,
        { timeoutMs: 60_000, label: `黑马搜索(${opts.keyword})` },
      );
      await page.waitForTimeout(5000); // 等页面就绪(darkhorse.py 等 6s,这里 5s + gateway 节奏)

      // 验证码检测:body 前 300 字含「验证」→ 跳过该词(返 [],不硬闯;调用方记日志)。
      const bodyHead = await page
        .evaluate(() => (document.body?.innerText ?? "").slice(0, 300))
        .catch(() => "");
      if (bodyHead.includes("验证")) {
        console.warn(
          `[darkhorse] 关键词「${opts.keyword}」搜索页命中验证码,跳过(返回空)`,
        );
        return [];
      }

      // 页内 fetch 搜索 API(credentials:include 借登录态;fn 自包含,只引用页面全局)。
      const json = await page.evaluate<unknown, string>(async (u: string) => {
        try {
          const r = await fetch(u, { credentials: "include" });
          return (await r.json()) as unknown;
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) };
        }
      }, SEARCH_ITEM_API.replace("{kw}", kw));

      const videos = parseSearchVideoList(json);
      console.log(
        `[darkhorse] fetchDouyinSearchVideos 关键词「${opts.keyword}」→ ${videos.length} 条候选`,
      );
      return videos;
    });
  } finally {
    await ctx.close().catch(() => {}); // 关我们自起的 Chromium
  }
}

// ---------------------------------------------------------------------------
// [T-243] 逐字稿覆盖率修复 —— iesdouyin 匿名分享页对相当一部分作品(含可见作品)就是解析
//   不出(item_list 为空),27/50 条逐字稿因此 fetch 失败。加**登录态 detail 回落**:
//   iesdouyin 解析失败 → openContext(.auth/douyin/<accountId>)+ 页内 fetch
//   `/aweme/v1/web/aweme/detail/?aweme_id=<id>`(credentials:include 借登录态,
//   fetchDouyinSearchVideos T-235b 同款范式)→ 从 aweme_detail.video.play_addr 拿直链。
//   同时识别**图集作品**(images 非空 / 无 video)→ 返回结构化「非视频」,调用方
//   (transcribe-runner)诚实跳过,不再当失败重试。
// ---------------------------------------------------------------------------

/** 取流结果:视频(带直链)或图集(非视频作品,无口播音频可转写)。
 *  video 变体的 kind 可省略 —— 兼容既有 fetchDouyinVideoUrl 返回的裸 DouyinVideoUrl。 */
export type DouyinVideoSource =
  | ({ kind?: "video" } & DouyinVideoUrl)
  | { kind: "image-album" };

// detail 接口(darkhorse.py / SEARCH_ITEM_API 同款 webapp 公参;页内 fetch 借登录态)。
const AWEME_DETAIL_API =
  "https://www.douyin.com/aweme/v1/web/aweme/detail/?device_platform=webapp&aid=6383" +
  "&channel=channel_pc_web&pc_client_type=1&version_code=170400&version_name=17.4.0" +
  "&cookie_enabled=true&screen_width=1920&screen_height=1080&browser_language=zh-CN" +
  "&browser_platform=Win32&browser_name=Chrome&browser_version=126.0.0.0" +
  "&browser_online=true&platform=PC&aweme_id={id}";

// 抖音图集类 aweme_type(68 = 图文/图集)。images 非空是首要判据,这个是兜底。
const AWEME_TYPE_IMAGE_ALBUM = 68;

/**
 * 解析 detail 接口 JSON(纯函数,可喂 canned JSON 单测):
 *   - aweme_detail 缺失 → 抛 DouyinAudioFetchError(作品不存在/不可见/接口风控)。
 *   - images 非空 / aweme_type=68 / 无 video 字段 → { kind:"image-album" }(结构化非视频,不算失败)。
 *   - 否则 video.play_addr.url_list[0](缺时 download_addr 兜底)→ playUrl(playwm→play 去水印)。
 */
export function parseAwemeDetail(json: unknown): DouyinVideoSource {
  const root = (json ?? {}) as Record<string, unknown>;
  const detail = root.aweme_detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    throw new DouyinAudioFetchError(
      "parseAwemeDetail: aweme_detail 为空(作品不存在/不可见/接口风控)",
    );
  }
  const d = detail as Record<string, unknown>;

  // 图集识别:images 非空 / aweme_type=68 / 根本没有 video 字段 → 非视频作品(诚实跳过,非失败)。
  const images = d.images;
  if (Array.isArray(images) && images.length > 0) return { kind: "image-album" };
  if (num(d.aweme_type) === AWEME_TYPE_IMAGE_ALBUM) return { kind: "image-album" };
  if (d.video == null) return { kind: "image-album" };

  const video = (d.video ?? {}) as Record<string, unknown>;
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
      "parseAwemeDetail: 未找到视频播放地址(play_addr/download_addr 皆空)",
    );
  }
  const playUrl = rawUrl.replace("playwm", "play");
  const cover = (video.cover ?? {}) as Record<string, unknown>;
  const coverList = Array.isArray(cover.url_list) ? cover.url_list : [];
  const coverUrl = typeof coverList[0] === "string" ? coverList[0] : undefined;
  return coverUrl
    ? { kind: "video", playUrl, coverUrl }
    : { kind: "video", playUrl };
}

export interface FetchVideoUrlViaDetailOptions {
  awemeId: string;
  /** 按号登录态目录(.auth/douyin/<accountId>);detail 接口页内 fetch 借它的 cookie。 */
  authDir: string;
  gateway?: DouyinChannelGate;
}

/** fetchDouyinVideoUrlViaDetail 的可注入依赖(默认真 openContext;单测注 fake context)。 */
export interface FetchVideoUrlViaDetailDeps {
  openContext?: (
    authDir: string,
    headless: boolean,
  ) => Promise<SearchCapableContext>;
}

// detail 回落的错误 → classify 输入映射:验证码 → captcha(明确风控,顶退避);
// aweme_detail 空(已删除/不可见,内容性质)→ empty-item-list(content-error 不退避);
// 其余(网络/导航)→ net-timeout 单次。
function mapDetailErr(err: unknown): ClassifyInput {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (raw.includes("验证码")) return { kind: "captcha" };
  if (raw.includes("aweme_detail 为空")) return { kind: "empty-item-list" };
  return { kind: "net-timeout", consecutiveTimeouts: 1 };
}

/**
 * [T-243] 登录态回落取流:openContext(.auth/)→ 落到该作品页(建立 referer/风控上下文)→
 * 页内 fetch detail 接口(credentials:include 借登录态)→ parseAwemeDetail。
 * 未登录抛 DouyinNotLoggedInError;**验证码命中 → 抛 DouyinAudioFetchError(消息含「验证码」)**
 * 不硬闯(单作品跳过,调用方分类计数)。每次调用 acquire 一次 creator-center gate(限流纪律)。
 * openContext 端口注入,故图集/验证码/解析分支可确定性单测。
 */
export async function fetchDouyinVideoUrlViaDetail(
  opts: FetchVideoUrlViaDetailOptions,
  deps: FetchVideoUrlViaDetailDeps = {},
): Promise<DouyinVideoSource> {
  const gateway = opts.gateway ?? instantNoopGateway;
  const openCtx =
    deps.openContext ??
    ((authDir: string, headless: boolean) =>
      openContext(authDir, headless) as unknown as Promise<SearchCapableContext>);
  const ctx = await openCtx(opts.authDir, true);
  try {
    // 登录态校验(页内 fetch credentials:include 要借它;未登录 → 提示扫码,同 search/user-posts)。
    const cookies = await ctx.cookies("https://www.douyin.com");
    const loggedIn = cookies.some(
      (c) => c.name === "sessionid" || c.name === "sessionid_ss",
    );
    if (!loggedIn) throw new DouyinNotLoggedInError();
    const page = ctx.pages()[0] ?? (await ctx.newPage());

    const id = encodeURIComponent(opts.awemeId);
    // 每 aweme acquire 一次限流网关(导航 + 页内 fetch 算一次请求节奏,同现有纪律)。
    return await withDouyinChannel(
      gateway,
      "creator-center",
      async () => {
        // 先落到作品页(建立 referer/风控上下文),再页内 fetch detail(T-235b 搜索同款)。
        await gotoWithRetry(
          page as unknown as GotoCapablePage,
          `https://www.douyin.com/video/${id}`,
          { timeoutMs: 60_000, label: `作品详情(${opts.awemeId})` },
        );
        await page.waitForTimeout(3000); // 等页面就绪(建立会话上下文)

        // 验证码检测:body 前 300 字含「验证」→ 不硬闯,该作品跳过(抛出让调用方分类计数)。
        const bodyHead = await page
          .evaluate(() => (document.body?.innerText ?? "").slice(0, 300))
          .catch(() => "");
        if (bodyHead.includes("验证")) {
          throw new DouyinAudioFetchError(
            `fetchDouyinVideoUrlViaDetail: 作品页命中验证码,跳过 (aweme ${opts.awemeId})`,
          );
        }

        // 页内 fetch detail 接口(credentials:include 借登录态;fn 自包含,只引用页面全局)。
        const json = await page.evaluate<unknown, string>(async (u: string) => {
          try {
            const r = await fetch(u, { credentials: "include" });
            return (await r.json()) as unknown;
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        }, AWEME_DETAIL_API.replace("{id}", id));

        return parseAwemeDetail(json);
      },
      mapDetailErr,
    );
  } finally {
    await ctx.close().catch(() => {}); // 关我们自起的 Chromium
  }
}

/** fetchDouyinVideoSource 的可注入依赖(单测注 fake 的两条路;默认绑真实现)。 */
export interface FetchVideoSourceDeps {
  /** 首选:iesdouyin 匿名分享页(无 cookie,快)。默认 fetchDouyinVideoUrl。 */
  fetchIesdouyin?: (awemeId: string) => Promise<DouyinVideoUrl>;
  /** 回落:登录态 detail 接口。默认 fetchDouyinVideoUrlViaDetail。 */
  fetchViaDetail?: (
    opts: FetchVideoUrlViaDetailOptions,
  ) => Promise<DouyinVideoSource>;
}

export interface FetchVideoSourceOptions {
  awemeId: string;
  /** 登录态目录(回落路径用;iesdouyin 匿名路径不需要)。 */
  authDir: string;
  /** iesdouyin 匿名 channel 的限流网关(首选路径)。 */
  gateway?: DouyinChannelGate;
}

/**
 * [T-243] 组合取流入口(transcribe-runner 的 fetchVideoUrl 端口绑它):
 *   ① fetchDouyinVideoUrl(iesdouyin 匿名,快)——成功 → { kind:"video", ... }。
 *   ② 解析类失败(消息含 parseDouyinVideoUrl:item_list 空 / _ROUTER_DATA 缺失 / JSON 解析失败 /
 *      无播放地址 —— 页面拿到了但解出不来,重试同路无意义)→ 回落登录态 detail 路径。
 *   网络/HTTP 类失败(请求 iesdouyin 失败 / 非 2xx)不回落 —— 那是瞬时/风控问题,回落只会
 *   双倍撞风控;交给现有 gateway 退避语义。
 */
export async function fetchDouyinVideoSource(
  opts: FetchVideoSourceOptions,
  deps: FetchVideoSourceDeps = {},
): Promise<DouyinVideoSource> {
  const fetchIesdouyin =
    deps.fetchIesdouyin ??
    ((awemeId: string) =>
      fetchDouyinVideoUrl(awemeId, {
        fetch: (...args) => fetch(...args),
        gateway: opts.gateway,
      }));
  const fetchViaDetail = deps.fetchViaDetail ?? fetchDouyinVideoUrlViaDetail;

  try {
    const url = await fetchIesdouyin(opts.awemeId);
    return { kind: "video", ...url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    const parseFailed =
      err instanceof DouyinAudioFetchError && msg.includes("parseDouyinVideoUrl");
    if (!parseFailed) throw err;
    console.log(
      `[transcribe] aweme ${opts.awemeId} iesdouyin 解析失败,回落登录态 detail 路径:${msg}`,
    );
    return fetchViaDetail({
      awemeId: opts.awemeId,
      authDir: opts.authDir,
      gateway: opts.gateway,
    });
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

// scrapeCommentsForWork / fetchDouyinCommentsForWorks 只依赖 page/context 的这几个能力
// (收窄便于 fake page/context 单测,不起真 Chromium)。真实 Playwright Page/BrowserContext
// 结构上满足这两个接口(用作默认注入时的向上转型目标)。
type CommentResponseHandler = (resp: {
  url(): string;
  json(): Promise<unknown>;
}) => void;

interface CommentCapablePage {
  on(event: "response", cb: CommentResponseHandler): void;
  // 多作品复用同一 page 时,每作品抓完必须摘掉本作品的 response 监听(否则监听在 page 上累积,
  // 后续作品的 XHR 会被历史 handler 重复解析,且泄漏监听器)。真实 Playwright Page 有 off。
  off(event: "response", cb: CommentResponseHandler): void;
  goto(url: string, opts?: unknown): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<R>(fn: () => R): Promise<R>;
  mouse: { wheel(deltaX: number, deltaY: number): Promise<void> };
}

interface CommentCapableContext {
  pages(): CommentCapablePage[];
  newPage(): Promise<CommentCapablePage>;
  cookies(url: string): Promise<Array<{ name: string }>>;
  close(): Promise<void>;
}

/** fetchDouyinComments / fetchDouyinCommentsForWorks 的可注入依赖(默认真 openContext(.auth/,
 *  headless);单测注 fake context 断言「开一次」+ 逐作品 parse + 关一次)。 */
export interface FetchDouyinCommentsDeps {
  /** 打开(或复用)一个带登录态的 headless context(默认 openContext(authDir, headless))。 */
  openContext?: (
    authDir: string,
    headless: boolean,
  ) => Promise<CommentCapableContext>;
  // T-038b [gate-F7 插装点③④]:creator-center channel 限流网关。③ 评论翻页**每页 acquire 一次**;
  // ④ 多作品**每作品 acquire 一次**。默认 instantNoopGateway(既有单测不传即不真等)。
  gateway?: DouyinChannelGate;
  // [T-177 增量化 · 收益最大] 评论 watermark 只读端口:按 awemeId 反查**库里该作品已知评论**的
  //   externalId 集(`douyin:comment:<cid>`,即 audience_signals.external_id;composition root 经
  //   publishingService.resolvePublication + candidateService.listCommentsForPublication 反查装配)。
  //   评论列表倒序(新→旧):翻页时某页评论**全部** ∈ 该集(且非空)= 已翻到之前抓过的老评论 →
  //   提前 break,不再滚到 staleRounds≥3。首次无 watermark(空集 / 省略)→ 退化为原全量(安全)。
  //   [依赖 item_id T-065,诚实标注]:若创作者中心评论管理页对该账号返回的是**全局评论列表**
  //   (item_id 未服务端过滤,见 scrapeCommentsForWork 注释),某页会混入**其它作品**的评论 →
  //   本作品 watermark 无法覆盖它们 → 该页非"全已知" → early-break 不触发,安全退化为全量滚动。
  //   故真增量收益(每作品少翻很多页)要等 item_id 真机验证/收窄后才**完全**兑现;当前实现无回归。
  commentWatermark?: (awemeId: string) => Promise<Set<string>>;
}

const DEFAULT_COMMENT_MAX_PAGES = 40;

async function isCommentContextLoggedIn(
  ctx: CommentCapableContext,
): Promise<boolean> {
  const cookies = await ctx.cookies("https://creator.douyin.com");
  return cookies.some((c) => c.name === "sessionid" || c.name === "sessionid_ss");
}

/**
 * 单作品评论抓取核心(内部 helper,给单/多两用):在**已开好的 page**上导航评论管理页
 * (item_id 过滤) → 拦 `/aweme/v1/web/comment/list/` XHR → 礼貌滚动翻页 → 去重 CommentRecord[]。
 * 不开/不关 context(context 生命周期由调用方管:单作品走 fetchDouyinComments,多作品走
 * fetchDouyinCommentsForWorks 复用同一 context 逐作品调本 helper)。
 */
async function scrapeCommentsForWork(
  page: CommentCapablePage,
  awemeId: string,
  maxPages: number,
  // [gate-F7 插装点③] 评论翻页限流网关(每页 acquire 一次 creator-center)。默认 no-op(单测不真等)。
  gateway: DouyinChannelGate = instantNoopGateway,
  // [T-177 增量化] 库里该作品已知评论的 externalId 集(倒序 early-break 锚)。空集 → 退化全量。
  watermark: Set<string> = new Set<string>(),
): Promise<CommentRecord[]> {
  const commentJsons: unknown[] = [];
  const seenIds = new Set<string>();
  // [T-177] 某页评论全部已在 watermark(且非空)→ 倒序下已翻到老评论,提前停翻页。
  let reachedWatermark = false;
  // [T-065 / T-176 已知未决] item_id 过滤是否真在服务端生效**尚未在真机核实**:onResponse 目前
  //   无条件收下每一个 `/comment/list/` XHR 并用页面级 awemeId 兜底归属(parseCommentList 的
  //   `|| defaultAwemeId`)。若创作者中心评论管理页对某些账号返回的是**全局评论列表**(item_id
  //   仅作 UI 过滤、XHR 未带 item_id / 未服务端过滤),则 N 个作品会各自拦到同一份列表并全部误挂到
  //   当前 awemeId → N 作品重刷 N 次。安全的收敛做法是「只保留 comment 自带 aweme_id/item_id ===
  //   目标 awemeId 的记录」,但当且仅当该 XHR 确实逐条带 aweme_id 时才不会误伤成采 0——这需要真机
  //   抓一次 comment/list 响应体确认字段形状(本任务硬约束:不跑真实采集/不扫码),故**暂不硬改**
  //   运行时行为以免把「重复」变成「采 0」。待 T-177 增量化或后续真机验证时按实测 XHR 形状收窄。
  const onResponse: CommentResponseHandler = (resp) => {
    const url = resp.url();
    if (!COMMENT_LIST_HINTS.some((h) => url.includes(h))) return;
    void (async () => {
      try {
        const j = await resp.json();
        commentJsons.push(j);
        const batch = parseCommentList(j, awemeId);
        // [T-177 增量化] 倒序 early-break:本页评论全部已在 watermark(库里已抓过)且非空 →
        //   已翻到老评论,标记提前停(externalId 口径同落库锚 commentExternalId,cid 缺失 hash 兜底一致)。
        if (
          watermark.size > 0 &&
          batch.length > 0 &&
          batch.every((c) => watermark.has(commentExternalId(c)))
        ) {
          reachedWatermark = true;
        }
        for (const c of batch) {
          seenIds.add(c.commentId);
        }
      } catch {
        /* 非 JSON 响应,忽略 */
      }
    })();
  };
  page.on("response", onResponse);
  try {
    // item_id 过滤 → 评论管理页只显示该作品的评论(对齐 crawler.py urls_to_try)。
    // [T-202] 导航加退避重试(瞬时超时自愈)。
    await gotoWithRetry(
      page,
      `${CREATOR_COMMENT_MANAGE}?item_id=${encodeURIComponent(awemeId)}`,
      { timeoutMs: 60_000, label: `comment-manage(${awemeId})` },
    );
    await page.waitForTimeout(3000); // 等首屏 comment/list XHR 回来

    // 礼貌滚动翻页:滚到底触发下一页加载;连续 3 轮无新评论即停(评论无 has_more 可靠信号)。
    let staleRounds = 0;
    for (let i = 0; i < maxPages; i++) {
      // [T-177 增量化] 首屏(goto 后)或上一轮已翻到全是库里已抓过的老评论 → 提前停,不再全量重翻。
      if (reachedWatermark) break;
      const before = seenIds.size;
      // [gate-F7 插装点③] 每翻一页 acquire 一次 creator-center(评论翻页真正限速)。
      await withDouyinChannel(gateway, "creator-center", async () => {
        await page
          .evaluate(() => {
            // 窗口滚 + 内层可滚容器全滚到底(T-065 拉全:评论管理页列表是内层滚动容器,
            // 只滚 window 触发不了下一页加载 → 之前每作品只拿到首屏)。
            window.scrollTo(0, document.body.scrollHeight);
            for (const el of Array.from(document.querySelectorAll("*"))) {
              const e = el as HTMLElement;
              if (e.scrollHeight > e.clientHeight + 100) {
                e.scrollTop = e.scrollHeight;
              }
            }
          })
          .catch(() => {});
        await page.mouse.wheel(0, 2000).catch(() => {});
        await page.waitForTimeout(2000);
      });
      if (reachedWatermark) break; // [T-177] 本轮滚动加载的页全是老评论 → 停
      staleRounds = seenIds.size === before ? staleRounds + 1 : 0;
      if (staleRounds >= 3) break;
    }

    // 去重(同 commentId 保留最后一次;跨页重复评论合一)。
    const byId = new Map<string, CommentRecord>();
    for (const j of commentJsons) {
      for (const c of parseCommentList(j, awemeId)) {
        byId.set(c.commentId, c);
      }
    }
    return [...byId.values()];
  } finally {
    // 多作品复用 page 时,摘掉本作品监听,避免监听在 page 上累积/后续作品 XHR 被重复解析。
    page.off("response", onResponse);
  }
}

const realCommentOpenContext = (authDir: string, headless: boolean) =>
  openContext(authDir, headless) as unknown as Promise<CommentCapableContext>;

/**
 * 真抓评论(单作品):headless 复用 .auth/ 登录态 → 导航创作者中心评论管理页(item_id 过滤) →
 * 拦 `/aweme/v1/web/comment/list/` XHR → 礼貌滚动翻页 → 去重 CommentRecord[]。
 * **不落库**(落库由 ingestComments 负责)。未登录抛 DouyinNotLoggedInError(调用方提示
 * 先扫码登录,D4 接状态机)。openContext 端口注入(默认真 openContext),故结构上可测。
 * 实现复用 scrapeCommentsForWork(与多作品路径同一核心);多作品请走 fetchDouyinCommentsForWorks
 * 以复用单个 context(避免每作品开一个浏览器)。
 */
export async function fetchDouyinComments(
  target: FetchCommentsTarget,
  deps: FetchDouyinCommentsDeps = {},
): Promise<CommentRecord[]> {
  const maxPages = target.maxPages ?? DEFAULT_COMMENT_MAX_PAGES;
  const openCtx = deps.openContext ?? realCommentOpenContext;
  const gateway = deps.gateway ?? instantNoopGateway;
  const ctx = await openCtx(target.authDir, true);
  try {
    if (!(await isCommentContextLoggedIn(ctx))) throw new DouyinNotLoggedInError();
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    // [T-177 增量化] 抓前反查该作品 watermark(库里已知评论 externalId 集);无端口 → 空集退化全量。
    const watermark = deps.commentWatermark
      ? await deps.commentWatermark(target.awemeId)
      : new Set<string>();
    // 单作品:翻页限流由 scrapeCommentsForWork 内部 acquire(插装点③);不额外套作品级 acquire。
    return await scrapeCommentsForWork(
      page,
      target.awemeId,
      maxPages,
      gateway,
      watermark,
    );
  } finally {
    await ctx.close().catch(() => {}); // 关我们自起的 Chromium(非用户浏览器)
  }
}

export interface FetchCommentsForWorksResult {
  awemeId: string;
  records: CommentRecord[];
}

/** [T-232] 多作品评论抓取的批结果:works = 已成功抓到的作品(逐作品评论);truncated = 是否因
 *  限流额度耗尽(DouyinCooldownActiveError)提前停(此时剩余作品**未采**,调用方在 run
 *  message 里诚实注明「额度截断:已采 X/N,下轮续」);cooldownRemainMs = 截断时通道剩余
 *  冷却毫秒(未截断为 0,供 message 展示)。 */
export interface FetchCommentsForWorksBatch {
  works: FetchCommentsForWorksResult[];
  truncated: boolean;
  cooldownRemainMs: number;
}

export interface FetchDouyinCommentsForWorksOptions {
  /** 持久化 profile 目录(复用 .auth/ 扫码登录态)。 */
  authDir: string;
  /** 每个作品最多滚动翻几页(防无限加载卡死;默认 40,同单作品口径)。 */
  maxPages?: number;
}

/**
 * 真抓评论(多作品,复用单 context):**openContext 开一次** → isLoggedIn 检查一次(未登录一次性
 * 抛 DouyinNotLoggedInError,不是每作品抛)→ 在**同一 context 的同一 page** 上逐 awemeId 调
 * scrapeCommentsForWork(导航评论管理页 + 拦 XHR + parseCommentList) → finally **close 一次**。
 * 取代「遍历 N 作品每个 openContext 开一个 headless 浏览器」的旧路径(N 作品 × 独立浏览器 →
 * 单 context 循环)。**不落库**(落库由调用方逐作品 ingestComments 负责,ingest 逻辑不变)。
 * openContext 端口注入(默认真 openContext),故可确定性单测:断言 openContext 被调 1 次、
 * 循环 N 个 awemeId 各 parse、close 一次,不碰真抖音。
 *
 * [T-232] 限流预算断点:任一作品(作品级或翻页级 acquire)撞 DouyinCooldownActiveError →
 * **立即停止剩余作品**(不再逐个撞冷却白烧时间),返回已抓到的部分 + truncated=true。
 * 撞冷却的那个作品本轮记未采(其已拦到的零散 XHR 丢弃,下轮完整重采,watermark 保幂等)。
 * 其它异常照旧向上抛(登录态/网络问题不该被吞成"截断")。
 */
export async function fetchDouyinCommentsForWorks(
  awemeIds: string[],
  opts: FetchDouyinCommentsForWorksOptions,
  deps: FetchDouyinCommentsDeps = {},
): Promise<FetchCommentsForWorksBatch> {
  const maxPages = opts.maxPages ?? DEFAULT_COMMENT_MAX_PAGES;
  const openCtx = deps.openContext ?? realCommentOpenContext;
  const gateway = deps.gateway ?? instantNoopGateway;
  // openContext 开一次(整批复用);空作品列表也开一次做登录校验,保持行为一致(校验优先)。
  const ctx = await openCtx(opts.authDir, true);
  try {
    // isLoggedIn 检查一次(未登录一次性抛,不是每作品抛)。
    if (!(await isCommentContextLoggedIn(ctx))) throw new DouyinNotLoggedInError();
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    const out: FetchCommentsForWorksResult[] = [];
    for (const awemeId of awemeIds) {
      // [T-177 增量化] 每作品抓前反查其 watermark(库里已知评论 externalId 集);无端口 → 空集退化全量。
      const watermark = deps.commentWatermark
        ? await deps.commentWatermark(awemeId)
        : new Set<string>();
      try {
        // [gate-F7 插装点④] **每作品 acquire 一次** creator-center(把 72 作品逐个导航真正限速);
        // 作品内翻页再由 scrapeCommentsForWork 内部 acquire(插装点③),两层正交、均串行到 creator-center。
        const records = await withDouyinChannel(gateway, "creator-center", () =>
          // 同一 context / 同一 page 逐作品导航抓取(评论管理页每作品 item_id 过滤,goto 会换页)。
          scrapeCommentsForWork(page, awemeId, maxPages, gateway, watermark),
        );
        out.push({ awemeId, records });
      } catch (e) {
        // [T-232] 额度耗尽(通道冷却剩余超 acquire 上限)→ 立即停剩余作品,带回部分结果。
        if (e instanceof DouyinCooldownActiveError) {
          console.warn(
            `[douyin-comments] 限流额度耗尽,截断本轮评论采集:已采 ${out.length}/${awemeIds.length} 个作品(通道 ${e.channel} 冷却剩 ${Math.ceil(e.remainMs / 1000)}s)`,
          );
          return { works: out, truncated: true, cooldownRemainMs: e.remainMs };
        }
        throw e; // 非额度类异常照旧向上抛(未登录/网络等,runner 归类处理)
      }
    }
    return { works: out, truncated: false, cooldownRemainMs: 0 };
  } finally {
    await ctx.close().catch(() => {}); // 关我们自起的 Chromium(非用户浏览器)一次
  }
}

// ---------------------------------------------------------------------------
// 创作者后台「作品列表」明细导出抓取(T-030-D8a,SPEC §9b)—— 移植 TzFilm step1_download.py 的
// 导出流程,复用 openContext(.auth/) 无头 + Playwright download 事件截 bytes。
//
// DATA-2 真机验证(2026-07-02,已扫码 headless 真跑,证据见
// frontend/docs/douyin-export-debug/)踩出的真流程 —— 与最初"直接点导出"的假设不同:
//   ① data-center/content 默认落在 **直播场次** tab,其「导出数据」对无直播的号返回
//      「当前暂无数据可导出」toast → **永不触发 download 事件**(旧代码 waitForEvent 超时的真因;
//      不是没找到按钮,而是找到并点了"直播场次"的导出、但那个 tab 没数据)。
//   ② 页面首屏弹「新增直播复盘能力」引导 modal 盖住交互 → 必须先关(点「我知道了」)。
//   ③ 「刷新数据」按钮 + 出 `作品列表.xlsx` 的「导出数据」只在 **投稿作品 → 投稿列表** 子视图里,
//      故必须先点「投稿作品」tab 再点「投稿列表」子tab,才能拿到 TzFilm 那份 16 字段 per-work xlsx。
// 中文控件仍用 charCode 匹配(避字面量编码坑 + 页面重名"导出数据"有多个);但点击改用 Playwright
// **可信 locator click**(charCode 在页内标记目标元素 → locator 点被标记元素),派发真 input 事件,
// 兼顾"精确定位"与"避免脚本点击被 Chromium 拦下载"两件事。page/context 端口注入,故装配/失败分类可测。
// ---------------------------------------------------------------------------

// 中文控件 charCode 序列(避字面量编码坑;charCode 序 = 逐字 String.charCodeAt):
//   投稿作品 = 25237,31295,20316,21697 ; 投稿列表 = 25237,31295,21015,34920
//   刷新数据 = 21047,26032,25968,25454 ; 导出数据 = 23548,20986,25968,25454 ; 我知道了 = 25105,30693,36947,20102
const TAB_POSTS_CODES = [25237, 31295, 20316, 21697];
const SUBTAB_LIST_CODES = [25237, 31295, 21015, 34920];
const BTN_REFRESH_CODES = [21047, 26032, 25968, 25454];
const BTN_EXPORT_CODES = [23548, 20986, 25968, 25454];
const MODAL_GOTIT_CODES = [25105, 30693, 36947, 20102];
// 全部 = 20840,37096(发布时间日历面板·快捷选择 preset;T-036 全量导出的钥匙)
const QUICK_ALL_CODES = [20840, 37096];

/** 导出得到的不是 xlsx(登录态过期时抖音返 JSON / HTML,TzFilm 踩过)—— 校验 PK 头失败时抛。 */
export class DouyinExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DouyinExportError";
  }
}

/** xlsx 是 zip → 头 4 字节必是 PK\x03\x04(`50 4B 03 04`)。登录态过期返 JSON/HTML → 头不符。 */
export function isXlsxBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

// 一个可被 locator().click() 可信点击的目标句柄(真 Playwright Locator 的收窄子集)。
interface ExportLocator {
  click(opts?: { timeout?: number }): Promise<void>;
  count(): Promise<number>;
}

// fetchDouyinWorkListExport 只依赖 page 的这几个能力(收窄便于 fake page 单测,不起真 Chromium)。
interface ExportCapablePage {
  goto(url: string, opts?: unknown): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  // 页内跑 charCode 匹配 → 给命中元素打 data 属性标记,返回是否命中(marking,不在页内 click:
  // 页内 element.click() 是脚本点击,Chromium 会拦其触发的 download;改由下面 locator 可信点击)。
  // arg 泛型化:多数步骤传 number[](charCode 序);导出就近锚点传 {exportCodes,refreshCodes} 对象。
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
  // 对被标记元素做 Playwright 可信点击(派发真 input 事件,不被拦下载)。
  locator(selector: string): ExportLocator;
  // 等一次 download 事件,拿到临时文件路径读 bytes。
  waitForEvent(
    event: "download",
    opts?: { timeout?: number },
  ): Promise<{ path(): Promise<string> }>;
  // 真 Playwright Page 有 screenshot;fake page 没有 → 可选,仅调试落图用(可选链调用,不破坏 fake)。
  screenshot?(opts: { path: string }): Promise<unknown>;
}

interface ExportCapableContext {
  pages(): ExportCapablePage[];
  newPage(): Promise<ExportCapablePage>;
  cookies(url: string): Promise<Array<{ name: string }>>;
  close(): Promise<void>;
}

/** fetchDouyinWorkListExport 的可注入依赖(默认真 openContext + fs 读;单测注 fake page/fs)。 */
export interface FetchWorkListExportDeps {
  /** 打开(或复用)一个带登录态的 headless context(默认 openContext(.auth/, headless))。 */
  openContext?: (authDir: string, headless: boolean) => Promise<ExportCapableContext>;
  /** 读下载文件 bytes(默认 fs.readFile;单测注 fake 返 canned bytes)。 */
  readFile?: (path: string) => Promise<Uint8Array>;
  /** 等按钮/下载超时(ms;默认 40s 下载 / 每步等待照 TzFilm 节奏)。 */
  downloadTimeoutMs?: number;
  // T-038b [gate-F7 插装点⑤]:creator-center channel 限流网关(整个导出一次 acquire)。
  // 默认 instantNoopGateway(既有单测不传即不真等)。
  gateway?: DouyinChannelGate;
}

// 「当前暂无数据可导出」toast 的 charCode 序([gate-F6]:有此 toast = 内容空,非频控 →
// download 超时归 content-error 不退避,防图集导出被误判风控;charCode 避字面量编码坑,同文件惯例)。
const TOAST_NO_DATA_CODES = [
  24403, 21069, 26242, 26080, 25968, 25454, 21487, 23548, 20986,
];

export interface FetchWorkListExportOptions {
  authDir: string;
}

// 页内 charCode 匹配 → 给**命中的最深可见元素**打 `data-cos-export-target="1"` 标记(供 locator
// 可信点击),返回命中数。不在页内 click(脚本点击触发的 download 会被 Chromium 拦)。要点:
//   ① charCode 序比对仿 TzFilm(避字面量编码坑);② 只认可见(rect 有面积);③ 取**最深**匹配元素
//   (tab 文本常被 span 包一层 → 纯 leaf 判定可能落到非可点的文本壳;最深匹配 = 最具体、点击必冒泡到
//   真正的 tab/button,比 leaf-only 稳)。调用前先清旧标记。
function markElementByCharCodesInPage(codes: number[]): number {
  const ATTR = "data-cos-export-target";
  document
    .querySelectorAll(`[${ATTR}]`)
    .forEach((el) => el.removeAttribute(ATTR));
  const all = Array.from(document.querySelectorAll("*"));
  let best: Element | null = null;
  let bestDepth = -1;
  for (const el of all) {
    const t = (el.textContent || "").trim();
    if (t.length !== codes.length) continue;
    let match = true;
    for (let k = 0; k < codes.length; k++) {
      if (t.charCodeAt(k) !== codes[k]) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    const rect = el.getBoundingClientRect
      ? el.getBoundingClientRect()
      : null;
    if (!rect || rect.width === 0 || rect.height === 0) continue;
    // 取最深(DOM 深度最大)的匹配元素 —— 最具体、点击冒泡到 tab/button。
    let depth = 0;
    for (let p = el.parentElement; p; p = p.parentElement) depth += 1;
    if (depth > bestDepth) {
      bestDepth = depth;
      best = el;
    }
  }
  if (!best) return 0;
  (best as HTMLElement).scrollIntoView({ block: "center" });
  best.setAttribute(ATTR, "1");
  return 1;
}

// 页内查某 charCode 集是否存在可见匹配元素(不点、不标记)—— 供"轮询等某 tab/子tab 渲染出来"。
function hasVisibleByCharCodesInPage(codes: number[]): boolean {
  for (const el of Array.from(document.querySelectorAll("*"))) {
    const t = (el.textContent || "").trim();
    if (t.length !== codes.length) continue;
    let match = true;
    for (let k = 0; k < codes.length; k++) {
      if (t.charCodeAt(k) !== codes[k]) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    const rect = el.getBoundingClientRect
      ? el.getBoundingClientRect()
      : null;
    if (rect && rect.width > 0 && rect.height > 0) return true;
  }
  return false;
}

// 专标「投稿列表」视图的「导出数据」按钮:页面有多个"导出数据"(直播场次/投稿概览/投稿表现/投稿列表),
// 必须点投稿列表那个。锚点 = 与「刷新数据」按钮同 toolbar(刷新数据仅存在于投稿列表视图工具条)。
// 策略:找到「刷新数据」按钮,向上找公共容器,在容器内找 charCode=导出数据 的按钮并标记;找不到锚点则
// 返 0(交由调用方兜底到通用 markElementByCharCodesInPage)。
function markExportNearRefreshInPage(args: {
  exportCodes: number[];
  refreshCodes: number[];
}): number {
  const { exportCodes, refreshCodes } = args;
  const ATTR = "data-cos-export-target";
  document
    .querySelectorAll(`[${ATTR}]`)
    .forEach((el) => el.removeAttribute(ATTR));
  const matches = (el: Element, codes: number[]): boolean => {
    const t = (el.textContent || "").trim();
    if (t.length !== codes.length) return false;
    for (let k = 0; k < codes.length; k++) {
      if (t.charCodeAt(k) !== codes[k]) return false;
    }
    const rect = el.getBoundingClientRect
      ? el.getBoundingClientRect()
      : null;
    return !!rect && rect.width > 0 && rect.height > 0;
  };
  // 找「刷新数据」按钮(取最深匹配 = 具体按钮)。
  let refreshEl: Element | null = null;
  let refreshDepth = -1;
  for (const el of Array.from(document.querySelectorAll("button, [role='button']"))) {
    if (!matches(el, refreshCodes)) continue;
    let depth = 0;
    for (let p = el.parentElement; p; p = p.parentElement) depth += 1;
    if (depth > refreshDepth) {
      refreshDepth = depth;
      refreshEl = el;
    }
  }
  if (!refreshEl) return 0;
  // 从刷新按钮逐级向上,在每级容器里找同级的「导出数据」按钮(就近 = 同工具条)。
  for (let container = refreshEl.parentElement; container; container = container.parentElement) {
    const candidates = Array.from(
      container.querySelectorAll("button, [role='button']"),
    ).filter((el) => matches(el, exportCodes));
    if (candidates.length > 0) {
      const target = candidates[0]!;
      (target as HTMLElement).scrollIntoView({ block: "center" });
      target.setAttribute(ATTR, "1");
      return 1;
    }
    // 容器已到达含「导出数据」的层级即停;否则继续向上(但别一路到 body 太宽 —— 3 级足够同工具条)。
    if (container === refreshEl.parentElement?.parentElement?.parentElement) break;
  }
  return 0;
}

// [T-036] 标记工具条「发布时间」range picker 容器(点开它才有快捷选择面板)。锚定 = class 含
// datepicker 且内含 input(开始/结束日期框)的首个可见元素 —— 投稿列表工具条唯一;此时 portal
// 面板未开,不会误中面板自身。arg 占位 null(evaluate 接口要求单参)。
function markDatePickerInPage(_arg: null): number {
  const ATTR = "data-cos-export-target";
  document
    .querySelectorAll(`[${ATTR}]`)
    .forEach((el) => el.removeAttribute(ATTR));
  for (const el of Array.from(document.querySelectorAll('[class*="datepicker"]'))) {
    const rect = el.getBoundingClientRect
      ? el.getBoundingClientRect()
      : null;
    if (!rect || rect.width === 0 || rect.height === 0) continue;
    if (!el.querySelector("input")) continue;
    el.setAttribute(ATTR, "1");
    return 1;
  }
  return 0;
}

// [T-036] 在点开的日历面板「快捷选择」侧栏内标记 preset(charCode 传入,如「全部」)。
// 必须锚定 datepicker-quick-control 容器 —— 页面上「全部」还出现在体裁筛选的当前值里,
// 全 document 扫会误中(探针 v1 踩过)。
function markQuickPresetInPage(codes: number[]): number {
  const ATTR = "data-cos-export-target";
  document
    .querySelectorAll(`[${ATTR}]`)
    .forEach((el) => el.removeAttribute(ATTR));
  const panels = document.querySelectorAll('[class*="datepicker-quick-control"]');
  for (const panel of Array.from(panels)) {
    let best: Element | null = null;
    let bestDepth = -1;
    for (const el of Array.from(panel.querySelectorAll("*"))) {
      const t = (el.textContent || "").trim();
      if (t.length !== codes.length) continue;
      let match = true;
      for (let k = 0; k < codes.length; k++) {
        if (t.charCodeAt(k) !== codes[k]) {
          match = false;
          break;
        }
      }
      if (!match) continue;
      const rect = el.getBoundingClientRect
        ? el.getBoundingClientRect()
        : null;
      if (!rect || rect.width === 0 || rect.height === 0) continue;
      let depth = 0;
      for (let p = el.parentElement; p; p = p.parentElement) depth += 1;
      if (depth > bestDepth) {
        bestDepth = depth;
        best = el;
      }
    }
    if (best) {
      (best as HTMLElement).scrollIntoView({ block: "center" });
      best.setAttribute(ATTR, "1");
      return 1;
    }
  }
  return 0;
}

// charCode 标记 + locator 可信点击一条龙:命中则可信点被标记元素,返回是否点了。silent=true 时点击
// 失败也吞掉(投稿作品 tab/刷新数据 等"点不到不致命"的步骤)。
async function markAndClick(
  page: ExportCapablePage,
  codes: number[],
  opts: { silent?: boolean; timeout?: number } = {},
): Promise<boolean> {
  const hit = await page
    .evaluate(markElementByCharCodesInPage, codes)
    .catch(() => 0);
  if (!hit) return false;
  try {
    await page
      .locator('[data-cos-export-target="1"]')
      .click({ timeout: opts.timeout ?? 5_000 });
    return true;
  } catch (err) {
    if (opts.silent) return false;
    throw err;
  }
}

// 轮询等某 charCode 控件在页面可见(最多 tries 次,每次 intervalMs)。用于等 tab 切换后子视图渲染。
async function waitForVisibleByCharCodes(
  page: ExportCapablePage,
  codes: number[],
  opts: { tries?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const tries = opts.tries ?? 10;
  const intervalMs = opts.intervalMs ?? 1_000;
  for (let i = 0; i < tries; i++) {
    const ok = await page
      .evaluate(hasVisibleByCharCodesInPage, codes)
      .catch(() => false);
    if (ok) return true;
    await page.waitForTimeout(intervalMs);
  }
  return false;
}

// 调试落图(真 page 有 screenshot;fake 没有 → 可选链,不破坏 fake 单测)。失败静默,绝不干扰主流程。
async function debugShot(
  page: ExportCapablePage,
  name: string,
): Promise<void> {
  if (!page.screenshot) return;
  if (process.env.DOUYIN_EXPORT_DEBUG !== "1") return;
  try {
    const { join } = await import("node:path");
    const { mkdir } = await import("node:fs/promises");
    const dir = join(process.cwd(), "docs/douyin-export-debug");
    await mkdir(dir, { recursive: true }).catch(() => {});
    await page.screenshot({ path: join(dir, name) });
  } catch {
    /* 调试落图失败绝不影响主流程 */
  }
}

async function isLoggedInExport(ctx: ExportCapableContext): Promise<boolean> {
  const cookies = await ctx.cookies("https://creator.douyin.com");
  return cookies.some((c) => c.name === "sessionid" || c.name === "sessionid_ss");
}

/**
 * 抓创作者后台「作品列表」明细导出 xlsx bytes(T-030-D8a)。移植 TzFilm step1 导出流程到无头链路:
 *   openContext(.auth/) headless → 导航数据中心作品分析旧版 URL(强制,否则 Garfish 不加载)→
 *   等微前端就绪 → 切投稿作品/投稿列表 → **发布时间设「全部」**(T-036:默认筛选近90天 → 导出只
 *   ~38/73 行;点开 range picker 快捷选择「全部」→ 全量)→ 页内 charCode 匹配点「刷新数据」→
 *   点「导出数据」(只点一次)→ Playwright download 事件截 xlsx 临时文件 → 读 bytes →
 *   **校验 PK 头**(登录态过期返 JSON/HTML → 抛 DouyinExportError,TzFilm 踩过)。
 *   未登录 → DouyinNotLoggedInError(runner catch → needs_reconnect)。
 * 端口注入(openContext/readFile),故装配 + 失败分类可确定性单测,不碰真抖音/真 Chromium。
 * 真选择器已经真创作者中心验证(DATA-2 扫码验导航;T-036 headed 探针验日期面板:39 行 → 74 行)。
 */
export async function fetchDouyinWorkListExport(
  opts: FetchWorkListExportOptions,
  deps: FetchWorkListExportDeps = {},
): Promise<Uint8Array> {
  const openCtx =
    deps.openContext ??
    ((authDir, headless) =>
      openContext(authDir, headless) as unknown as Promise<ExportCapableContext>);
  const readFile =
    deps.readFile ??
    (async (p: string) => {
      const { readFile: rf } = await import("node:fs/promises");
      return new Uint8Array(await rf(p));
    });
  const downloadTimeoutMs = deps.downloadTimeoutMs ?? 40_000;
  const gateway = deps.gateway ?? instantNoopGateway; // [gate-F7 插装点⑤] creator-center 整个导出一次限流

  const ctx = await openCtx(opts.authDir, true);
  // [gate-F6] download 超时时探到的「当前暂无数据可导出」toast 结果(true=内容空非频控)。
  // 由下方 download 失败分支填,mapExportErr 读它决定 export-download-timeout 的最终分类。
  let sawNoDataToast = false;
  // 导出错误 → classify 输入映射:
  //   - DouyinNotLoggedInError / DouyinExportError(登录/版式/PK 头)= 内容/环境错,非频控 → content-error(不退避)。
  //   - download 超时:[T-176] 导出面板 DOM 极脆(非平台风控),classifyDouyinOutcome 已把
  //     export-download-timeout 统一判 content-error(不再顶 creator-center 退避,防污染死循环)。
  //     sawNoDataToast 仅保留作诊断信号,不再改变分类结果。
  const mapExportErr = (err: unknown): ClassifyInput => {
    if (err instanceof DouyinNotLoggedInError || err instanceof DouyinExportError) {
      return { kind: "empty-item-list" }; // content-error 家族:不动退避
    }
    const raw = err instanceof Error ? err.message : String(err ?? "");
    // waitForEvent download 超时 → export-download-timeout(→ content-error,T-176)。
    if (raw.includes("download") || raw.toLowerCase().includes("timeout")) {
      return { kind: "export-download-timeout", hasNoDataToast: sawNoDataToast };
    }
    return { kind: "net-timeout", consecutiveTimeouts: 1 }; // 兜底:net-timeout → content-error
  };

  try {
    return await withDouyinChannel(
      gateway,
      "creator-center",
      () => runExportOnce(ctx, { downloadTimeoutMs, readFile, onDownloadTimeout: (v) => { sawNoDataToast = v; } }),
      mapExportErr,
    );
  } finally {
    await ctx.close().catch(() => {}); // 关我们自起的 Chromium(非用户浏览器)
  }
}

/** fetchDouyinWorkListExport 的核心步骤(已开 ctx),抽出以便被 withDouyinChannel 包一次 acquire。
 *  download 超时时探「当前暂无数据可导出」toast 并经 onDownloadTimeout 回传([gate-F6] 分类依据)。 */
async function runExportOnce(
  ctx: ExportCapableContext,
  args: {
    downloadTimeoutMs: number;
    readFile: (path: string) => Promise<Uint8Array>;
    onDownloadTimeout: (hasNoDataToast: boolean) => void;
  },
): Promise<Uint8Array> {
  const { downloadTimeoutMs, readFile, onDownloadTimeout } = args;
  {
    if (!(await isLoggedInExport(ctx))) throw new DouyinNotLoggedInError();
    const page = ctx.pages()[0] ?? (await ctx.newPage());

    // 1) 强制导航旧版数据中心作品分析(TzFilm 坑:不设旧版 URL → Garfish 不加载,按钮找不到)。
    //    [T-202] 加退避重试:xlsx 导出这一步撞瞬时超时是真机 self.detail 跑不完的头号根因。
    await gotoWithRetry(page, CREATOR_DATA_CENTER_CONTENT, {
      timeoutMs: 60_000,
      label: "data-center-content(xlsx 导出)",
    });
    // 等 Garfish 微前端初始化(真机 ~15s;DATA-2 已验)。
    await page.waitForTimeout(15_000);
    await debugShot(page, "01-after-garfish.png");

    // 2) 关首屏引导 modal(「新增直播复盘能力」)—— 盖住交互,不关点不到 tab。找不到不致命,
    //    但 modal 存在时会拦截 tab 点击(真机踩坑:未关 modal → 点投稿作品无效 → 停在直播场次 →
    //    找不到投稿列表 → 旧修复失败)。故点完再确认它消失(轮询「我知道了」不再可见)。
    if (await markAndClick(page, MODAL_GOTIT_CODES, { silent: true, timeout: 3_000 })) {
      await page.waitForTimeout(800);
    }
    // 二次兜底:若引导 modal 仍在(多页引导 / 变体),再点一次并等其消失(最多 ~4s)。
    for (let i = 0; i < 4; i++) {
      const stillThere = await page
        .evaluate(hasVisibleByCharCodesInPage, MODAL_GOTIT_CODES)
        .catch(() => false);
      if (!stillThere) break;
      await markAndClick(page, MODAL_GOTIT_CODES, { silent: true, timeout: 2_000 });
      await page.waitForTimeout(1_000);
    }

    // 3) 切到「投稿作品」tab(真机默认落在**直播场次** tab,其导出无数据 → 永不下载,是旧超时真因)。
    //    点后**轮询等**「投稿列表」子tab 渲染出来(而非固定 sleep;真机 tab 切换 + 子视图渲染有延迟)。
    //    tab 点击可能需要重试(modal 刚关 / 渲染未稳)—— 最多试 3 轮,每轮点投稿作品 + 等子tab 出现。
    let listVisible = false;
    for (let attempt = 0; attempt < 3 && !listVisible; attempt++) {
      await markAndClick(page, TAB_POSTS_CODES, { silent: true });
      listVisible = await waitForVisibleByCharCodes(page, SUBTAB_LIST_CODES, {
        tries: 6,
        intervalMs: 1_000,
      });
    }
    if (!listVisible) {
      await debugShot(page, "02-posts-tab-failed.png");
      throw new DouyinExportError(
        "fetchDouyinWorkListExport: 切到「投稿作品」tab 后未见「投稿列表」子tab(页面未加载完 / 登录态过期 / 版式变化)—— 无法进入出 xlsx 的视图",
      );
    }

    // 4) 切到「投稿列表」子tab —— 「刷新数据」+ 出 `作品列表.xlsx` 的「导出数据」只在此视图。
    const listOk = await markAndClick(page, SUBTAB_LIST_CODES, {
      silent: true,
    });
    if (!listOk) {
      throw new DouyinExportError(
        "fetchDouyinWorkListExport: 点击「投稿列表」子tab 失败(版式变化)—— 无法进入出 xlsx 的视图",
      );
    }
    // 等投稿列表视图渲染出「导出数据」(该视图特有的导出;轮询而非固定 sleep)。
    await waitForVisibleByCharCodes(page, BTN_EXPORT_CODES, {
      tries: 6,
      intervalMs: 1_000,
    });
    await page.waitForTimeout(1_500);
    await debugShot(page, "02-after-list-subtab.png");

    // 4.5) [T-036] 发布时间筛选默认近90天 → 导出只覆盖近期作品(真机:38/73 行)。点开工具条
    //      range picker → 日历面板「快捷选择」点「全部」→ 范围清空 = 全部时间 → 导出全量
    //      (真机验:39 行 → 74 行)。整段 silent:任一步失败仍可按默认范围导出,只是覆盖少,
    //      绝不因此挡导出。「全部」点击即应用并收面板;若面板开了却没点到 preset,再点一次
    //      「投稿列表」子tab 收面板,防悬浮层遮住后面的刷新/导出按钮。
    const pickerMarked = await page
      .evaluate(markDatePickerInPage, null)
      .catch(() => 0);
    if (pickerMarked) {
      let pickerOpened = false;
      try {
        await page
          .locator('[data-cos-export-target="1"]')
          .click({ timeout: 4_000 });
        pickerOpened = true;
      } catch {
        /* silent:点不开 picker → 按默认范围导出 */
      }
      if (pickerOpened) {
        let allClicked = false;
        // portal 面板渲染有延迟 → 轮询标「全部」,标到即可信点击。
        for (let i = 0; i < 5 && !allClicked; i++) {
          await page.waitForTimeout(1_000);
          const allMarked = await page
            .evaluate(markQuickPresetInPage, QUICK_ALL_CODES)
            .catch(() => 0);
          if (!allMarked) continue;
          try {
            await page
              .locator('[data-cos-export-target="1"]')
              .click({ timeout: 4_000 });
            allClicked = true;
          } catch {
            /* silent:重试下一轮 */
          }
        }
        if (allClicked) {
          await page.waitForTimeout(4_000); // 等列表按全量范围重拉
        } else {
          // 面板可能还悬浮着 → 点一次当前子tab 收面板(无副作用),防遮挡后续按钮。
          await markAndClick(page, SUBTAB_LIST_CODES, { silent: true });
          await page.waitForTimeout(1_000);
        }
        await debugShot(page, "02b-after-daterange-all.png");
      }
    }

    // 5) 点「刷新数据」确保数据最新(找不到不致命,可能页面已最新)。
    await markAndClick(page, BTN_REFRESH_CODES, { silent: true });
    await page.waitForTimeout(4_000);

    // 6) 先挂 download 监听再可信点「导出数据」(避免竞态漏掉快下载;可信 locator click 派发真 input
    //    事件,不被 Chromium 当脚本点击拦下载)。页面此时有多个"导出数据"(直播场次/投稿概览/投稿表现/
    //    投稿列表)—— 必须点**投稿列表视图**那个,故就近锚定「刷新数据」(仅存于投稿列表工具条)同容器的
    //    导出;锚定失败(版式变化)兜底用最深匹配的通用标记。
    const downloadPromise = page.waitForEvent("download", {
      timeout: downloadTimeoutMs,
    });
    let exportMarked = await page
      .evaluate(markExportNearRefreshInPage, {
        exportCodes: BTN_EXPORT_CODES,
        refreshCodes: BTN_REFRESH_CODES,
      })
      .catch(() => 0);
    if (!exportMarked) {
      // 兜底:没锚到刷新按钮(投稿列表工具条可能无刷新)→ 退回通用最深匹配。
      exportMarked = await page
        .evaluate(markElementByCharCodesInPage, BTN_EXPORT_CODES)
        .catch(() => 0);
    }
    let clicked = false;
    if (exportMarked) {
      try {
        await page
          .locator('[data-cos-export-target="1"]')
          .click({ timeout: 5_000 });
        clicked = true;
      } catch {
        clicked = false;
      }
    }
    await debugShot(page, "03-after-export-click.png");
    if (!clicked) {
      throw new DouyinExportError(
        "fetchDouyinWorkListExport: 未找到 / 点不到投稿列表视图的「导出数据」按钮(页面未加载完 / 登录态过期 / 选择器变化)",
      );
    }

    // 7) 截下载文件 bytes(TzFilm:点击后只等下载,绝不重试点击)。download 超时时([gate-F6]:
    //    「当前暂无数据可导出」的图集/无数据号永不触发 download → 必然超时)先探 no-data toast:
    //    有 toast = 内容空非频控(content-error 不退避);无 toast = 疑似频控(export-download-timeout
    //    → throttled)。探测结果经 onDownloadTimeout 回传给 mapExportErr 定分类,原超时错照旧抛出。
    let download: { path(): Promise<string> };
    try {
      download = await downloadPromise;
    } catch (timeoutErr) {
      const hasNoDataToast = await page
        .evaluate(hasVisibleByCharCodesInPage, TOAST_NO_DATA_CODES)
        .catch(() => false);
      onDownloadTimeout(hasNoDataToast);
      await debugShot(page, "03-download-timeout.png");
      throw timeoutErr; // 原超时错向上传(withDouyinChannel 据 mapExportErr 分类后仍抛)
    }
    const path = await download.path();
    const bytes = await readFile(path);

    // 8) 校验 PK 头(登录态过期时抖音返 JSON / HTML,非真 xlsx —— TzFilm Pitfall)。
    if (!isXlsxBytes(bytes)) {
      throw new DouyinExportError(
        "fetchDouyinWorkListExport: 下载内容非 xlsx(PK 头缺失 —— 登录态可能过期,返回了 JSON/HTML)",
      );
    }
    return bytes;
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
  /** 写一条 audience_signal(C-4:ingestionRunId 必带,见 ingestAudienceSignal)。
   *  T-065:带 externalId(评论粒度幂等锚);返回 inserted=false 表示命中跨 run 唯一锚
   *  (user+source+external_id)、库里已有该评论,本次未新写。 */
  ingestSignal(input: {
    source: string;
    rawText: string;
    demandTag: string | null;
    ingestionRunId: string;
    // 评论按作品可读 (T-030 D6) — 回填该评论所属作品 (来自 aweme_id→publication);
    // 无匹配作品 → null,不报错 (F3 边界)。
    publicationId: string | null;
    // 评论点赞数 (T-042 热榜排序依据) — 采集抓的 digg_count;无值 → null。
    likeCount: number | null;
    // 评论粒度幂等锚 (T-065) — `douyin:comment:<cid>`;cid 拿不到时退化为内容 hash 锚。
    externalId: string | null;
  }): Promise<{ inserted: boolean }>;
  /** 完成该 run(status→completed)。 */
  completeRun(runId: string): Promise<void>;
  /**
   * 按 aweme_id 查对应 imported 作品的 publication_id(T-030 D6 回填 F3)。
   * 命中(publications.externalId=aweme_id)返回 publicationId,否则 null(作品未导入/
   * 未发布 → 评论仍落库,只是 publication_id 留空)。**OPTIONAL**:省略该 port 则全部评论
   * publication_id 留空(向后兼容 D2 的纯落库 fake 测试)。
   *
   * F3 诚实边界:audience_signals 表**无 aweme_id 锚**,故只有本次采集(ingest 上下文持有
   * aweme_id)能回填;**存量已入库评论无法回填**,需重采。
   */
  resolvePublicationId?(awemeId: string): Promise<string | null>;
}

export interface IngestCommentsResult {
  runId: string;
  received: number; // 收到评论条数
  written: number; // 实际新写入信号条数
  skipped: number; // 命中去重锚跳过条数(run 内 record_key 或跨 run external_id,T-065)
}

/**
 * 评论粒度幂等锚 (T-065):首选 `douyin:comment:<cid>`(抖音评论接口的稳定 cid,
 * parseCommentList 已多键兜底 cid|comment_id|id 且丢弃无 cid 脏数据 —— 实际链路必有);
 * 极端退化(手工构造/未来源无 cid)用内容 hash 锚 `douyin:comment:h:<sha256-16>`
 * (source+aweme+作者+文本,同一评论重采可复现)。
 */
export function commentExternalId(c: CommentRecord): string {
  if (c.commentId) return `douyin:comment:${c.commentId}`;
  const h = createHash("sha256")
    .update(`comment|${c.awemeId}|${c.userId}|${c.userName}|${c.text}`)
    .digest("hex")
    .slice(0, 16);
  return `douyin:comment:h:${h}`;
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
  // 评论按作品可读 (T-030 D6, F3) + 误归属修复 (T-065):按**评论自身的 aweme_id**(XHR
  // payload 携带)解析 publication,退化用本次采集的目标 awemeId。T-065 真机实锤:创作者
  // 中心评论管理页的 `item_id` 过滤不生效(每个作品导航拦到同一份全局评论列表),旧实现
  // 「整批按目标 awemeId 解析一次」把同一条评论归到 73 个不同 publication —— 现改为逐评论
  // 按其真实 aweme_id 归属(按 aweme 缓存,避免重复解析)。无匹配作品 → null,评论仍落库。
  // 省略 resolvePublicationId port(D2 fake 测试)→ 全部留空。
  const pubCache = new Map<string, string | null>();
  const resolvePub = async (aweme: string): Promise<string | null> => {
    if (!ports.resolvePublicationId) return null;
    if (!pubCache.has(aweme)) {
      pubCache.set(aweme, await ports.resolvePublicationId(aweme));
    }
    return pubCache.get(aweme) ?? null;
  };
  let written = 0;
  let skipped = 0;
  for (const c of records) {
    const externalId = commentExternalId(c); // 评论粒度幂等锚(cid 首选,T-065)
    const recordKey = externalId; // run 内 ledger 锚沿用同一 key(cid 路径与旧值一致)
    // 去重锚①:record_key 已在该 run 落过 → 跳过(不重复写信号)。
    if (await ports.recordExists(run.id, recordKey)) {
      skipped += 1;
      continue;
    }
    const { inserted } = await ports.ingestSignal({
      source: "comment", // 既有 enum(不扩 douyin_comment)
      rawText: c.text,
      demandTag: null,
      ingestionRunId: run.id, // C-4 铁律:信号写必带真 run id
      // 按评论自身 aweme_id 归属(payload 无 aweme_id 时 parseCommentList 已回填目标 awemeId)。
      publicationId: await resolvePub(c.awemeId || awemeId),
      likeCount: c.likeCount ?? null, // T-042 热榜排序依据(采集抓的 digg_count)
      externalId, // 去重锚②:跨 run 唯一(user+source+external_id,T-065)
    });
    await ports.markRecordWritten(run.id, recordKey);
    // 去重锚②命中(库里已有该 cid,前次采集写的)→ 计 skipped,不算新写。
    if (inserted) written += 1;
    else skipped += 1;
  }
  await ports.completeRun(run.id);
  return { runId: run.id, received: records.length, written, skipped };
}

// ---------------------------------------------------------------------------
// [T-235c] 指定抖音收藏夹采集 —— 用户在抖音建专门收藏夹(如「选题库」),把想跟拍的对标
//   视频收进去;系统只采集登记的指定夹,不碰其他收藏(隐私红线)。复用 fetchDouyinSearchVideos
//   (T-235b)同款范式:openContext(.auth/ 登录态)+ 先导航收藏 tab 页(建立 referer/风控
//   上下文)+ 页内 fetch(credentials:include 借登录态)+ douyinGateway 限流(每页 acquire
//   一次)+ 验证码检测跳过(返 [],不硬闯)。**只读自己账号的收藏列表**(登录态即本人授权)。
// ---------------------------------------------------------------------------

/** 一个抖音收藏夹(collects/list 程序化抽取)。 */
export interface DouyinCollectsFolder {
  /** 收藏夹 id(**必须用 collects_id_str** —— 数字版 collects_id 超 2^53 精度丢失)。 */
  collectsId: string;
  name: string;
  totalCount: number;
  /** 最近收藏时刻(unix 秒,抖音原值;缺失 0)。 */
  lastCollectTime: number;
}

/** 收藏夹内一条视频(collects/video/list 程序化抽取,数值兜底 0)。 */
export interface DouyinFavoriteVideo {
  awemeId: string;
  description: string;
  diggCount: number;
  commentCount: number;
  collectCount: number;
  shareCount: number;
  /** 时长(ms,抖音 duration 原值)。 */
  durationMs: number;
  /** 发布时间(unix 秒,抖音原值;缺失 0)。 */
  createTime: number;
  authorSecUid: string;
  authorNickname: string;
}

// collects 接口公参(SEARCH_ITEM_API / AWEME_DETAIL_API 同款 webapp 公参;页内 fetch 借登录态)。
const COLLECTS_COMMON_QUERY =
  "device_platform=webapp&aid=6383&channel=channel_pc_web&pc_client_type=1" +
  "&version_code=170400&version_name=17.4.0&cookie_enabled=true" +
  "&screen_width=1920&screen_height=1080&browser_language=zh-CN&browser_platform=Win32" +
  "&browser_name=Chrome&browser_version=126.0.0.0&browser_online=true&platform=PC";

// 收藏夹列表(真机验证 200:collects_list[] + cursor/has_more/total_number)。
const COLLECTS_LIST_API =
  `https://www.douyin.com/aweme/v1/web/collects/list/?${COLLECTS_COMMON_QUERY}` +
  "&cursor={cursor}&count=20";

// 夹内视频列表(真机验证 200:aweme_list[] + cursor/has_more)。
const COLLECTS_VIDEO_LIST_API =
  `https://www.douyin.com/aweme/v1/web/collects/video/list/?${COLLECTS_COMMON_QUERY}` +
  "&collects_id={collectsId}&cursor={cursor}&count=20";

/** 解析 collects/list JSON(纯函数可单测)。collects_id_str 优先(精度),缺则 String(collects_id)。 */
export function parseCollectsList(json: unknown): DouyinCollectsFolder[] {
  const root = (json ?? {}) as Record<string, unknown>;
  const list = Array.isArray(root.collects_list) ? (root.collects_list as unknown[]) : [];
  const out: DouyinCollectsFolder[] = [];
  for (const item of list) {
    const c = (item ?? {}) as Record<string, unknown>;
    // 身份键:collects_id_str 优先 —— 数字版 collects_id 是 19 位大整数,JSON.parse 后精度丢失。
    const collectsId = str(c.collects_id_str) || (c.collects_id != null ? String(c.collects_id) : "");
    if (!collectsId) continue; // 无 id 的脏条目跳过
    out.push({
      collectsId,
      name: str(c.collects_name).trim(),
      totalCount: num(c.total_number),
      lastCollectTime: num(c.last_collect_time),
    });
  }
  return out;
}

/** 解析 collects/video/list JSON(纯函数可单测,字段兜底同 parseSearchVideoList)。 */
export function parseCollectsVideoList(json: unknown): DouyinFavoriteVideo[] {
  const root = (json ?? {}) as Record<string, unknown>;
  const list = Array.isArray(root.aweme_list) ? (root.aweme_list as unknown[]) : [];
  const out: DouyinFavoriteVideo[] = [];
  for (const item of list) {
    const a = (item ?? {}) as Record<string, unknown>;
    const awemeId = str(a.aweme_id);
    if (!awemeId) continue; // 非视频条目/脏数据跳过
    const stats = (a.statistics ?? {}) as Record<string, unknown>;
    const author = (a.author ?? {}) as Record<string, unknown>;
    const video = (a.video ?? {}) as Record<string, unknown>;
    out.push({
      awemeId,
      description: str(a.desc).trim(),
      diggCount: num(stats.digg_count),
      commentCount: num(stats.comment_count),
      collectCount: num(stats.collect_count),
      shareCount: num(stats.share_count),
      // duration 顶层为主(collects/video/list 真机形状),video.duration 兜底(同 search 条目)。
      durationMs: num(a.duration) || num(video.duration),
      createTime: num(a.create_time),
      authorSecUid: str(author.sec_uid),
      authorNickname: str(author.nickname),
    });
  }
  return out;
}

export interface FetchCollectsFoldersOptions {
  authDir: string;
  gateway?: DouyinChannelGate;
}

export interface FetchCollectsVideosOptions {
  authDir: string;
  /** 目标收藏夹 id(collects_id_str)。 */
  collectsId: string;
  /** 最多取几条(默认 50,防灌库)。 */
  maxItems?: number;
  gateway?: DouyinChannelGate;
}

/** fetchDouyinCollects* 的可注入依赖(默认真 openContext(.auth/, headless);单测注 fake)。 */
export interface FetchCollectsDeps {
  openContext?: (
    authDir: string,
    headless: boolean,
  ) => Promise<SearchCapableContext>;
}

// 收藏 tab 页(建立 referer/风控上下文后再页内 fetch collects 接口 —— 真机验证的前置导航)。
const COLLECTS_TAB_URL = "https://www.douyin.com/user/self?showTab=favorite_collection";

// 收藏夹列表分页上限(防 has_more 恒真死循环;20/页 × 5 页 = 100 夹,远超个人现实上限)。
const COLLECTS_LIST_MAX_PAGES = 5;

/** 登录校验 + 导航收藏 tab + 验证码检测(collects 两个 fetch 函数共用前置)。
 *  未登录抛 DouyinNotLoggedInError;验证码命中返 null(调用方返空跳过,不硬闯)。 */
async function openCollectsPage(
  ctx: SearchCapableContext,
  label: string,
): Promise<SearchCapablePage | null> {
  // 登录态校验(页内 fetch credentials:include 要借它;未登录 → 提示扫码,同 search/user-posts)。
  const cookies = await ctx.cookies("https://www.douyin.com");
  const loggedIn = cookies.some(
    (c) => c.name === "sessionid" || c.name === "sessionid_ss",
  );
  if (!loggedIn) throw new DouyinNotLoggedInError();
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  // 先落到收藏 tab 页(建立 referer/风控上下文),再页内 fetch API(T-235b 搜索同款)。
  await gotoWithRetry(page as unknown as GotoCapablePage, COLLECTS_TAB_URL, {
    timeoutMs: 60_000,
    label,
  });
  await page.waitForTimeout(3000); // 等页面就绪(建立会话上下文)

  // 验证码检测:body 前 300 字含「验证」→ 跳过本次采集(返 null,不硬闯;调用方记日志)。
  const bodyHead = await page
    .evaluate(() => (document.body?.innerText ?? "").slice(0, 300))
    .catch(() => "");
  if (bodyHead.includes("验证")) {
    console.warn(`[favorites] ${label}命中验证码,跳过(返回空)`);
    return null;
  }
  return page;
}

/** 页内 fetch 一页 collects JSON(credentials:include 借登录态;fn 自包含,只引用页面全局)。 */
function fetchCollectsJson(
  page: SearchCapablePage,
  url: string,
): Promise<unknown> {
  return page.evaluate<unknown, string>(async (u: string) => {
    try {
      const r = await fetch(u, { credentials: "include" });
      return (await r.json()) as unknown;
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, url);
}

/** collects 接口 has_more 读取(number/boolean 双形状兜底;缺失当 false 防死循环)。 */
function collectsHasMore(json: unknown): boolean {
  const root = (json ?? {}) as Record<string, unknown>;
  return Boolean(root.has_more);
}

/** collects 接口下一页 cursor(缺失 → -1 = 停翻)。 */
function collectsNextCursor(json: unknown): number {
  const root = (json ?? {}) as Record<string, unknown>;
  const v = root.cursor;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : -1;
}

/**
 * 拉本人全部收藏夹列表(collects/list,cursor 分页 ≤5 页防死循环)。复用 .auth/ 登录态、
 * douyinGateway 限流(**每页 acquire 一次** creator-center gate)。未登录抛
 * DouyinNotLoggedInError;**验证码命中 → 返 [] 跳过**(不硬闯风控)。openContext 端口注入,
 * 故解析/未登录/验证码/分页分支可确定性单测。**只读自己账号的收藏夹元数据。**
 */
export async function fetchDouyinCollectsFolders(
  opts: FetchCollectsFoldersOptions,
  deps: FetchCollectsDeps = {},
): Promise<DouyinCollectsFolder[]> {
  const gateway = opts.gateway ?? instantNoopGateway;
  const openCtx =
    deps.openContext ??
    ((authDir: string, headless: boolean) =>
      openContext(authDir, headless) as unknown as Promise<SearchCapableContext>);
  const ctx = await openCtx(opts.authDir, true);
  try {
    const page = await openCollectsPage(ctx, "收藏夹列表");
    if (!page) return []; // 验证码 → 诚实空,调用方跳过本次采集

    const byId = new Map<string, DouyinCollectsFolder>();
    let cursor = 0;
    for (let i = 0; i < COLLECTS_LIST_MAX_PAGES; i++) {
      // 每翻一页 acquire 一次限流网关(降频 ≥ minInterval,防高频撞风控,同 user-posts 纪律)。
      const json = await withDouyinChannel(gateway, "creator-center", () =>
        fetchCollectsJson(
          page,
          COLLECTS_LIST_API.replace("{cursor}", String(cursor)),
        ),
      );
      for (const f of parseCollectsList(json)) byId.set(f.collectsId, f);
      if (!collectsHasMore(json)) break;
      const next = collectsNextCursor(json);
      if (next < 0 || next === cursor) break; // cursor 不前进兜底,防死循环
      cursor = next;
    }
    const folders = [...byId.values()];
    console.log(`[favorites] fetchDouyinCollectsFolders → ${folders.length} 个收藏夹`);
    return folders;
  } finally {
    await ctx.close().catch(() => {}); // 关我们自起的 Chromium
  }
}

/**
 * 拉指定收藏夹内视频(collects/video/list,分页直到 has_more 假/凑满 maxItems,默认 50)。
 * 复用 .auth/ 登录态、douyinGateway 限流(**每页 acquire 一次**)。未登录抛
 * DouyinNotLoggedInError;**验证码命中 → 返 [] 跳过**。openContext 端口注入可确定性单测。
 * **只读自己账号指定夹的收藏条目**(不碰其他收藏夹)。
 */
export async function fetchDouyinCollectsVideos(
  opts: FetchCollectsVideosOptions,
  deps: FetchCollectsDeps = {},
): Promise<DouyinFavoriteVideo[]> {
  const gateway = opts.gateway ?? instantNoopGateway;
  const maxItems = opts.maxItems ?? 50;
  const openCtx =
    deps.openContext ??
    ((authDir: string, headless: boolean) =>
      openContext(authDir, headless) as unknown as Promise<SearchCapableContext>);
  const ctx = await openCtx(opts.authDir, true);
  try {
    const page = await openCollectsPage(ctx, `收藏夹视频(${opts.collectsId})`);
    if (!page) return []; // 验证码 → 诚实空,调用方跳过该夹

    const byId = new Map<string, DouyinFavoriteVideo>();
    let cursor = 0;
    // 页数上限 = 凑满 maxItems 所需页数 + 1 兜底(20/页;防 has_more 恒真死循环)。
    const maxPages = Math.ceil(maxItems / 20) + 1;
    for (let i = 0; i < maxPages && byId.size < maxItems; i++) {
      // 每翻一页 acquire 一次限流网关(同收藏夹列表纪律)。
      const json = await withDouyinChannel(gateway, "creator-center", () =>
        fetchCollectsJson(
          page,
          COLLECTS_VIDEO_LIST_API.replace(
            "{collectsId}",
            encodeURIComponent(opts.collectsId),
          ).replace("{cursor}", String(cursor)),
        ),
      );
      for (const v of parseCollectsVideoList(json)) {
        if (byId.size >= maxItems) break; // maxItems 截断(防灌库)
        byId.set(v.awemeId, v);
      }
      if (!collectsHasMore(json)) break;
      const next = collectsNextCursor(json);
      if (next < 0 || next === cursor) break; // cursor 不前进兜底,防死循环
      cursor = next;
    }
    const videos = [...byId.values()];
    console.log(
      `[favorites] fetchDouyinCollectsVideos 夹 ${opts.collectsId} → ${videos.length} 条(上限 ${maxItems})`,
    );
    return videos;
  } finally {
    await ctx.close().catch(() => {}); // 关我们自起的 Chromium
  }
}
