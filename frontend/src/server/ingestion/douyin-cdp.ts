import type {DouyinExportPhase, DouyinExportProgress} from "@creatoros/backend/application/collection/self";
import { applyBrowserTimeoutPolicy } from "./browser-timeouts";
import { completionWaitMs, executionTimeoutMs } from "@creatoros/contract/timeout-policy";
import {commentExternalId,type CommentRecord} from "@creatoros/backend/application/collection/comment-ingestion";
import type {CommentReadDiagnostics,CommentReadReason} from '@creatoros/backend/application/collection/comment-read-diagnostics';
import {commentHttpStatus,createCommentPageEvidence,finishCommentPageEvidence,observeCommentResponse} from './douyin-cdp-page-evidence';
export {commentExternalId,ingestComments,type CommentRecord,type CommentIngestPorts,type IngestCommentsResult} from "@creatoros/backend/application/collection/comment-ingestion";
import { fetchDouyinVideoUrlViaDetail as fetchWorkerDouyinVideoUrlViaDetail, AWEME_DETAIL_API, mapDetailErr } from "@creatoros/ai-worker/douyin-transcribe-detail";
import {
  DouyinAudioFetchError, normalizeDouyinPlaybackUrl, parseDouyinVideoUrl, parseAwemeDetail,
  fetchDouyinVideoUrl as fetchWorkerDouyinVideoUrl,
  fetchDouyinVideoSource as fetchWorkerDouyinVideoSource,
  type DouyinVideoUrl, type DouyinVideoSource,
  type FetchVideoSourceDeps as WorkerFetchVideoSourceDeps,
  type FetchVideoSourceOptions as WorkerFetchVideoSourceOptions,
} from "@creatoros/ai-worker/douyin-transcribe-source";
export { DouyinAudioFetchError, normalizeDouyinPlaybackUrl, parseDouyinVideoUrl, parseAwemeDetail };
export type { DouyinVideoUrl, DouyinVideoSource };
import { resolveChromiumExecutable, launchWithBrowser, BrowserRuntimeUnavailableError } from "@creatoros/ai-worker/browser/browser-launch";
export { resolveChromiumExecutable, launchWithBrowser, BrowserRuntimeUnavailableError };
export type { LaunchWithBrowserDeps } from "@creatoros/ai-worker/browser/browser-launch";
import { bindAbortContext } from "./abort-context";
import "server-only";
import { createHash } from "node:crypto";
import type { MetricRecord } from "@creatoros/backend/modules/ingestion";
// [T-326 RT-H09] ffmpeg 路径统一解析链(env → 随包 sidecar → PATH/常见目录 → 诚实报错)——
// 与 ai-worker whisper-local PCM 解码共用同一把解析器,根治硬编码 /opt/homebrew/bin/ffmpeg。
import { streamAudioFromVideo as extractTranscribeAudio, TranscribeAudioExtractError, type StreamAudioDeps, type SpawnedAudioProcess } from "@creatoros/ai-worker";
// [T-326 B-04] 错误类抽到零依赖叶子模块(见下方 re-export 注释);本文件内部 throw/instanceof 用它。
import {
  DouyinCaptchaError,
  DouyinFavoritesBrowserLockedError,
  DouyinFavoritesCaptchaError,
  DouyinFavoritesInvalidResponseError,
  DouyinFavoritesNetworkError,
  DouyinFavoritesSessionExpiredError,
  DouyinFavoritesUpstreamError,
  DouyinNoValidResponseError,
  DouyinNotLoggedInError,
  DouyinResponseShapeChangedError,
  rehydrateDouyinFavoritesError,
} from "./douyin-errors";
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

import { gotoWithRetry, type GotoCapablePage } from "@creatoros/ai-worker/browser/navigation-retry";
export { gotoWithRetry };
export type { GotoWithRetryOptions } from "@creatoros/ai-worker/browser/navigation-retry";

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
  const data = (root.data ?? {}) as Record<string, unknown>;
  const list =
    (Array.isArray(root.aweme_list) && root.aweme_list) ||
    (Array.isArray(root.item_list) && root.item_list) ||
    (Array.isArray(data.aweme_list) && data.aweme_list) ||
    (Array.isArray(data.item_list) && data.item_list) ||
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

/**
 * [T-490] 从创作者主页的账号资料响应读取当前账号身份。
 *
 * 账号身份与作品数据解耦：零作品账号的 `aweme_list` 天然为空，但创作者主页仍会请求当前
 * 登录账号的 `user_info` / `account_info`。这里只接受“昵称 + 稳定平台标识”同时存在的
 * 资料对象，避免把页面里普通文案或推荐作者误认成当前账号；不会生成占位 ID。
 */
export function parseCreatorProfileIdentity(
  json: unknown,
): DouyinSelfIdentity | null {
  const root = (json ?? {}) as Record<string, unknown>;
  const data = (root.data ?? {}) as Record<string, unknown>;
  const result = (root.result ?? {}) as Record<string, unknown>;
  const candidates = [
    root.user_info,
    root.user,
    root.account_info,
    root.account,
    root.profile,
    data.user_info,
    data.user,
    data.account_info,
    data.account,
    data.profile,
    data,
    result.user_info,
    result.user,
    result.account_info,
    result.account,
    result.profile,
    result,
  ];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    const identity = parseSelfIdentity({
      aweme_list: [{ author: candidate }],
    });
    // 主页资料必须带稳定平台标识；只有昵称仍不足以安全归属登录态。
    if (identity && (identity.secUid || identity.douyinId)) return identity;
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



/**
 * 解析创作者中心评论 list XHR(`/aweme/v1/web/comment/list/`)—— 纯函数,字段兜底。
 * 对齐 cheat-on-content `_normalize_comment_creator` 的字段口径(cid/text/digg_count/
 * create_time/user.nickname/aweme_id 多键兜底)。评论列表键宽松匹配 comments /
 * comment_list / data.comments。无 commentId 或无正文的脏数据丢弃。
 */
function commentListValue(json:unknown):unknown[]|null {
  const root = (json ?? {}) as Record<string, unknown>;
  const data = (root.data ?? {}) as Record<string, unknown>;
  return (
    (Array.isArray(root.comments) && root.comments) ||
    (Array.isArray(root.comment_list) && root.comment_list) ||
    (Array.isArray(data.comments) && data.comments) ||
    (Array.isArray(data.comment_list) && data.comment_list) ||
    null);
}
export function parseCommentList(
  json: unknown,
  defaultAwemeId = "",
): CommentRecord[] {
  const list=commentListValue(json)??[];
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

/** 匿名 HTTP 与解析在 Worker；宿主只接现有通道限流。 */
export interface FetchDouyinVideoUrlDeps {
  signal?: AbortSignal;
  fetch: typeof fetch;
  gateway?: DouyinChannelGate;
}
export function fetchDouyinVideoUrl(awemeId: string, deps: FetchDouyinVideoUrlDeps = { fetch: (...args) => fetch(...args) }): Promise<DouyinVideoUrl> {
  return fetchWorkerDouyinVideoUrl(awemeId, {
    fetch: deps.fetch,
    signal: deps.signal,
    channel: (run, mapError, signal) => withDouyinChannel(deps.gateway ?? instantNoopGateway, "iesdouyin", run, mapError, signal),
  });
}

/** 兼容旧入口的错误类型；抽音与取消由 Worker 运行时唯一实现。 */
export type { StreamAudioDeps };
export type SpawnedProcess = SpawnedAudioProcess;
export async function streamAudioFromVideo(playUrl: string, deps?: StreamAudioDeps, signal?: AbortSignal): Promise<Uint8Array> {
  try { return await extractTranscribeAudio(playUrl, deps, signal); }
  catch (error) {
    if (error instanceof TranscribeAudioExtractError) throw new DouyinAudioFetchError(error.message);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 真连浏览器(测试不跑;需用户常驻 CDP + 已登录抖音创作者中心)
// ---------------------------------------------------------------------------

export interface FetchDouyinOptions {
  signal?: AbortSignal;
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
  /** 本次扫码任务的取消权；停止必须等待 owned context 关闭。 */
  signal?: AbortSignal;
  /** 扫码最多等多少秒(默认 240)。 */
  timeoutSec?: number;
}

export interface LoginDouyinDeps {
  openContext?: typeof openContext;
}

// 未登录抖音创作者中心 —— 类本体已抽到零依赖叶子模块 douyin-errors.ts([T-326 B-04]:
// persistence-client 的同步 instanceof 判别点不必加载本重模块);顶部 import + 此处 re-export
// 保持既有 `from "./douyin-cdp"` 的 import 路径与错误类身份(同一 class 实例)全部兼容。
export {
  DouyinCaptchaError,
  DouyinFavoritesBrowserLockedError,
  DouyinFavoritesCaptchaError,
  DouyinFavoritesInvalidResponseError,
  DouyinFavoritesNetworkError,
  DouyinFavoritesSessionExpiredError,
  DouyinFavoritesUpstreamError,
  DouyinNoValidResponseError,
  DouyinNotLoggedInError,
  DouyinResponseShapeChangedError,
} from "./douyin-errors";

// 用户绑定的是“创作者账号”，扫码入口固定打开创作者中心：首页会直接展示二维码，扫码后
// 同一持久 profile 继续供 creator.douyin.com 指标与 www.douyin.com 收藏/主页使用。
// 下游各接口仍按自己的域名校验会话；不能为了某一个下游把首次扫码降级成普通抖音首页。
const DOUYIN_LOGIN_HOME = "https://www.douyin.com/";
const CREATOR_LOGIN_HOME = "https://creator.douyin.com/creator-micro/home";
const CREATOR_SESSION_PROBE =
  "https://creator.douyin.com/aweme/v1/creator/user/info/";
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

// [T-775] 正式桌面包已随包携带 Chromium，不得依赖 Playwright CLI、全局
// Node/npm 或联网下载。ensureChromiumInstalled 只保留给本地开发/诊断环境；正式桌面端
// 缺少系统 Chrome 和内置 Chromium 时必须人话失败。
let chromiumEnsured = false;

export interface LocatePlaywrightCliDeps {
  isFile?: (candidate: string) => Promise<boolean>;
  readDir?: (dir: string) => Promise<string[]>;
  runtimeRoot?: string;
  pathApi?: Pick<typeof import("node:path"), "resolve" | "join" | "dirname">;
}

/**
 * [T-469] 从真实磁盘目录确定性定位 Playwright CLI。
 *
 * 打包混淆 runtime 不能使用动态 `require.resolve`：Turbopack 会把运行时表达式改写成无法解析
 * 的模块引用。这里从 cwd 向父级逐层扫描 hoist/直连和 pnpm 隔离目录，路径只由 fs 事实决定。
 */
export async function locatePlaywrightCli(
  startDir = process.cwd(),
  deps: LocatePlaywrightCliDeps = {},
): Promise<string | null> {
  const path = deps.pathApi ?? (await import("node:path"));
  const fs = await import("node:fs/promises");
  const isFile =
    deps.isFile ??
    ((candidate: string) =>
      fs
        .stat(candidate)
        .then((s) => s.isFile())
        .catch(() => false));
  const readDir =
    deps.readDir ??
    ((dir: string) => fs.readdir(dir).catch(() => [] as string[]));

  // [T-734] Windows production closure 明确是零 node_modules 的少文件布局，动态包放在
  // layers/browser/vendor；Next vendor 是兼容入口。下载兜底只用于开发/诊断，但定位器仍须
  // 认识真实 runtime，不能把“扫描父级 node_modules”当成唯一世界模型。
  const runtimeRoot = (deps.runtimeRoot ?? process.env.CREATOROS_RUNTIME_ROOT)?.trim();
  if (runtimeRoot) {
    for (const candidate of [
      path.join(runtimeRoot, "layers", "browser", "vendor", "playwright", "cli.js"),
      path.join(runtimeRoot, "frontend", ".next", "vendor", "playwright", "cli.js"),
    ]) {
      if (await isFile(candidate)) return candidate;
    }
  }

  const visited = new Set<string>();
  let current = path.resolve(startDir);
  while (!visited.has(current)) {
    visited.add(current);
    const nodeModules = path.join(current, "node_modules");
    const direct = path.join(nodeModules, "playwright", "cli.js");
    if (await isFile(direct)) return direct;

    const pnpmDir = path.join(nodeModules, ".pnpm");
    const entries = await readDir(pnpmDir);
    for (const entry of entries.filter((name) => name.startsWith("playwright@")).sort()) {
      const candidate = path.join(pnpmDir, entry, "node_modules", "playwright", "cli.js");
      if (await isFile(candidate)) return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

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
  if (process.env.CREATOROS_DESKTOP === "1") {
    throw new BrowserRuntimeUnavailableError();
  }
  // 未装 → playwright install chromium(首启一次性下载;之后共享缓存,app 更新也复用)。
  console.warn("[ingestion] 未检测到 Chromium,首次自动下载(playwright install chromium)…");
  const { spawn } = await import("node:child_process");
  const cli = await locatePlaywrightCli();
  if (!cli) {
    throw new Error(
      `Playwright CLI 未找到，无法自动安装 Chromium；已从 ${process.cwd()} 向父级扫描 node_modules`,
    );
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "install", "chromium"], {
      stdio: "inherit", // 进度打到 sidecar 日志(UI 侧「扫码中…」覆盖等待;进度条 UI 列后续)
      env: process.env,
      // [T-372 W5] windowsHide:Win 打包态抑制 node.exe console 黑窗。
      windowsHide: true,
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

// 用户 Chrome 不稳)。headless=false 用于扫码登录;true 用于复刷抓取。
type ReadBrowserSession = import('@creatoros/ai-worker/browser/shared-read-browser-session').ReadBrowserSession;
type ExclusiveBrowserSession = import('@creatoros/ai-worker/browser/shared-read-browser-session').ExclusiveBrowserSession;
const readSessionKey = Symbol.for('creatoros.douyinReadSessionPool');
const readSessionRegistry = globalThis as typeof globalThis & {
  [readSessionKey]?: Promise<ReturnType<typeof import('@creatoros/ai-worker/browser/shared-read-browser-session').createSharedReadBrowserSessionPool>>;
};
/** T1027：同采集profile的排他诊断会话，仅暴露本次Page与确认停止清理。 */
export async function openCommentDiagnosisSession(authDir:string,signal:AbortSignal){
  const context=await openContext(authDir,false,signal);
  return {newPage:()=>context.newPage(),close:()=>context.close()};
}

async function openContext(authDir: string, headless: false, signal?: AbortSignal): Promise<ExclusiveBrowserSession>;
async function openContext(authDir: string, headless: boolean, signal?: AbortSignal): Promise<ReadBrowserSession>;
async function openContext(authDir: string, headless: boolean, signal?: AbortSignal): Promise<ReadBrowserSession> {
  signal?.throwIfAborted();
  if (!readSessionRegistry[readSessionKey]) {
    const pending = (async () => {
      const { acquireHostBrowserProfile, resolveHostBrowserProfile } = await import('./host-browser-profile-lifecycle');
      const { openDouyinProfileContext } = await import('@creatoros/ai-worker/browser/douyin-profile-context');
      const { createSharedReadBrowserSessionPool } = await import('@creatoros/ai-worker/browser/shared-read-browser-session');
      return createSharedReadBrowserSessionPool({
        authorize: resolveHostBrowserProfile, open: async (identity, headless, hostSignal) => {
          const lease = await acquireHostBrowserProfile(identity.authDir, hostSignal);
          return openDouyinProfileContext(lease.authDir, headless, {
            signal: hostSignal, onStopped: lease.onStopped
          });
        }
      });
    })();
    readSessionRegistry[readSessionKey] = pending;
    void pending.catch(() => {
      if (readSessionRegistry[readSessionKey] === pending)
        delete readSessionRegistry[readSessionKey];
    });
  }
  const pool = await readSessionRegistry[readSessionKey]!;
  return headless ? pool.checkoutRead(authDir, signal) : pool.checkoutExclusive(authDir, signal);
}

async function isLoggedIn(
  ctx: Pick<import("@playwright/test").BrowserContext,'cookies'>,
): Promise<boolean> {
  const cookies = await ctx.cookies(CREATOR_LOGIN_HOME);
  return cookies.some((c) => c.name === "sessionid" || c.name === "sessionid_ss");
}

function isPlaywrightTargetClosed(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Target page, context or browser has been closed|TargetClosedError|Browser has been closed/i.test(
    message,
  );
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
 * 登录:headed 弹 Chromium 窗口让用户扫码。成功条件必须是抖音服务端接受该会话，不能只看
 * 本地 sessionid 是否存在——失效 Cookie 仍会留在 profile，旧实现会第一轮就误判成功并关窗。
 * 仅在用户机器上跑(server 弹窗)。返回是否登录成功。
 */
export async function loginDouyin(
  opts: LoginDouyinOptions,
  deps: LoginDouyinDeps = {},
): Promise<boolean> {
  opts.signal?.throwIfAborted();
  const timeoutSec = executionTimeoutMs((opts.timeoutSec ?? 240) * 1000) / 1000;
  const openCtx = deps.openContext ?? openContext;
  const ctx = await openCtx(opts.authDir, false, opts.signal);
  try {
    opts.signal?.throwIfAborted();
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    applyBrowserTimeoutPolicy(page);
    await page
      .goto(CREATOR_LOGIN_HOME, { waitUntil: "domcontentloaded" })
      .catch(() => {});
    let rejectedSessionCleared = false;
    for (let i = 0; i < timeoutSec; i++) {
      opts.signal?.throwIfAborted();
      try {
        if (await isLoggedIn(ctx)) {
          // 在创作者中心页面内请求同源账号资料，既验证服务端确实接受会话，也不会被
          // BrowserContext.request 缺页面反爬上下文误判。扫码成功后即可自动关窗。
          const acceptance = await probeCreatorSessionAcceptance(page);
          if (acceptance === "active") {opts.signal?.throwIfAborted();return true;}
          if (acceptance === "expired" && !rejectedSessionCleared) {
            // 这是 CreatorOS 为该采集账号维护的专用 profile。只清抖音认证 Cookie，不碰
            // 其它站点或浏览数据；否则旧 Cookie 会让登录页继续把失效会话当成已登录。
            await ctx
              .clearCookies({
                name: /^(?:sessionid(?:_ss)?|sid_guard|sid_tt|sid_ucp_v1|ssid_ucp_v1|uid_tt(?:_ss)?|passport_csrf_token(?:_default)?|odin_tt)$/,
              })
              .catch(() => {});
            rejectedSessionCleared = true;
            await page
              .goto(CREATOR_LOGIN_HOME, { waitUntil: "domcontentloaded" })
              .catch(() => {});
          }
        }
        await page.waitForTimeout(1000);
        opts.signal?.throwIfAborted();
      } catch (error) {
        // 用户主动关掉扫码窗口是一次正常取消，不应冒泡成 transport 400。
        opts.signal?.throwIfAborted();
        if (isPlaywrightTargetClosed(error)) return false;
        throw error;
      }
    }
    return false;
  } finally {
    if(opts.signal)await ctx.close(); // 新 run 不能吞停止失败；host guard close 等待真实 onStopped。
    else await ctx.close().catch(() => {}); // 保留旧同步入口的关闭兼容
  }
}

// fetchDouyinMetrics 只依赖 page/context 的这几个能力(收窄便于 fake page 单测,不起真
// Chromium)。真实 Playwright Page/BrowserContext 结构上满足(默认注入时向上转型目标)。
type MetricsResponseHandler = (resp: {
  url(): string;
  json(): Promise<unknown>;
  text?(): Promise<string>;
  finished?(): Promise<Error | null>;
}) => void;
interface MetricsCapablePage {
  on(event: "response", cb: MetricsResponseHandler): void;
  goto(url: string, opts?: unknown): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<R>(fn: () => R): Promise<R>;
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
  /** 真 Playwright Page 均提供；测试窄 fake 可省略，严格模式据可用能力检查。 */
  url?: () => string;
  title?: () => Promise<string>;
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
    signal?: AbortSignal,
  ) => Promise<MetricsCapableContext>;
}

const realMetricsOpenContext = (authDir: string, headless: boolean, signal?: AbortSignal) =>
  openContext(authDir, headless, signal) as unknown as Promise<MetricsCapableContext>;

type DouyinSessionProbeResult = "active" | "expired" | "unknown";

function classifyDouyinSessionProbe(result: {
  statusCode: number | null;
  statusMessage: string;
} | null): DouyinSessionProbeResult {
  if (!result) return "unknown";
  if (
    result.statusCode === 8 ||
    /未登录|登录.*失效|session.*expired/i.test(result.statusMessage)
  ) {
    return "expired";
  }
  return result.statusCode === 0 ? "active" : "unknown";
}

/**
 * 扫码绑定以创作者中心会话为准。必须在已打开的创作者中心页面里发同源请求，
 * 否则跨域 fetch / 脱离页面的 request context 都可能把已登录误判为 unknown。
 */
async function probeCreatorSessionAcceptance(
  page: MetricsCapablePage,
): Promise<DouyinSessionProbeResult> {
  const result = await page
    .evaluate<
      { statusCode: number | null; statusMessage: string } | null,
      string
    >(async (url) => {
      try {
        const response = await fetch(url, { credentials: "include" });
        const json = (await response.json()) as Record<string, unknown>;
        return {
          statusCode:
            typeof json.status_code === "number" ? json.status_code : null,
          statusMessage:
            typeof json.status_msg === "string" ? json.status_msg : "",
        };
      } catch {
        return null;
      }
    }, CREATOR_SESSION_PROBE)
    .catch(() => null);
  return classifyDouyinSessionProbe(result);
}

/**
 * 本地仍有 sessionid 不等于抖音服务端仍认可它。主页作品接口在会话过期时偶发只返回
 * 200 + 空 body，页面也不跳登录页；此时用同一页面只读请求收藏夹列表作为旁证。
 * 只读取 status_code/status_msg，不返回或记录响应正文、Cookie、URL。
 */
async function probeDouyinSessionAcceptance(
  page: MetricsCapablePage,
): Promise<DouyinSessionProbeResult> {
  const probeUrl = COLLECTS_LIST_API.replace("{cursor}", "0");
  const result = await page
    .evaluate<
      { statusCode: number | null; statusMessage: string } | null,
      string
    >(async (url) => {
      try {
        const response = await fetch(url, { credentials: "include" });
        const json = (await response.json()) as Record<string, unknown>;
        return {
          statusCode:
            typeof json.status_code === "number" ? json.status_code : null,
          statusMessage:
            typeof json.status_msg === "string" ? json.status_msg : "",
        };
      } catch {
        return null;
      }
    }, probeUrl)
    .catch(() => null);
  return classifyDouyinSessionProbe(result);
}

/**
 * fetchDouyinMetrics 的返回:作品指标 records + 登录用户自己的身份 identity(T-136 §D)。
 * identity 从抓取过程中拦到的作品列表 XHR 反解(每条作品的 author 就是登录用户本人);抓不到
 * 给 null(诚实降级,service 保留占位不覆盖)。records 语义不变(向后兼容:归一 helper 见 service)。
 */
export interface FetchDouyinMetricsResult {
  records: MetricRecord[];
  identity: DouyinSelfIdentity | null;
  /** 已取回部分目录但尚未确认翻到底；调用方保留已验证数据并提示继续采集。 */
  incomplete?: boolean;
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
  opts.signal?.throwIfAborted();
  const maxPages = opts.maxPages ?? 500; // 千条账号需超过40轮；仍保留有界预算与平台原限速
  const gateway = opts.gateway ?? instantNoopGateway; // [gate-F7 插装点②] creator-center 每页限流
  const openCtx = deps.openContext ?? realMetricsOpenContext;
  const ctx = await openCtx(opts.authDir, true, opts.signal);
  const lifetime = bindAbortContext(opts.signal, () => ctx.close());
  try {
    opts.signal?.throwIfAborted();
    // 登录校验(窄接口只用 ctx.cookies;真 BrowserContext 结构满足)。
    const cookies = await ctx.cookies("https://creator.douyin.com");
    const loggedIn = cookies.some(
      (c) => c.name === "sessionid" || c.name === "sessionid_ss",
    );
    if (!loggedIn) throw new DouyinNotLoggedInError();
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    applyBrowserTimeoutPolicy(page);

    const workJsons: unknown[] = [];
    const seenIds = new Set<string>();
    // [T-177 增量化] 库里已知作品集(倒序翻页 early-stop 锚);未注入 → 空集 → 退化全量。
    const known = opts.knownAwemeIds ?? new Set<string>();
    let reachedKnown = false; // 某页作品全已知(且非空)→ 已翻到旧作品,提前停翻页
    let hasMore = true; // 直到某页 work_list 明确 has_more=false 才停(比"无新响应"可靠)
    let hasMoreObserved = false;
    const readHasMore = (j: unknown): boolean | undefined => {
      const root = (j ?? {}) as Record<string, unknown>;
      const data = (root.data ?? root) as Record<string, unknown>;
      const v = root.has_more ?? data.has_more ?? root.hasMore ?? data.hasMore;
      return typeof v === "boolean" ? v : v == null ? undefined : Boolean(v);
    };
    const pending = new Set<Promise<void>>();
    let failedResponses = 0;
    const drainResponses = async () => { while (pending.size) await Promise.all([...pending]); };
    page.on("response", (resp) => {
      const url = resp.url();
      if (!WORK_LIST_HINTS.some((h) => url.includes(h))) return;
      const parsing = (async () => {
      try {
        const finished = await resp.finished?.();
        if (finished) throw finished;
        const j = resp.text ? JSON.parse(await resp.text()) : await resp.json();
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
        if (hm !== undefined) { hasMore = hm; hasMoreObserved = true; }
      } catch {
        failedResponses += 1;
      }
      })();
      pending.add(parsing);
      void parsing.finally(() => pending.delete(parsing));
    });

    // [T-202] 导航加退避重试(瞬时超时自愈,不首撞就抛)。
    await gotoWithRetry(page, CREATOR_CONTENT, {
      timeoutMs: executionTimeoutMs(60_000),
      label: "creator-content(作品列表)",
      signal:opts.signal,
    });
    await page.waitForTimeout(3000); // 等首屏 work_list XHR 回来
    await drainResponses();

    // 激进滚动翻页:window 滚到底 + 滚最高可滚容器 + End 键 + 滚轮。单一 mouse.wheel 触不到列表
    // 容器,是只抓到首页 24 条的根因。停止:某页 has_more=false(可靠),或连续 3 轮无新作品,或到上限。
    let staleRounds = 0;
    let interrupted = false;
    let pagesScrolled = 0;
    for (; pagesScrolled < maxPages; pagesScrolled++) {
      opts.signal?.throwIfAborted();
      if (!hasMore) break; // 抖音 work_list 明确翻到底
      // [T-177 增量化] 首屏(goto 后)或上一轮滚动加载的页已全是库里已知作品 → 提前停,少滚几十页。
      if (reachedKnown) break;
      const before = seenIds.size;
      // [gate-F7 插装点②] 每翻一页 acquire 一次 creator-center(把翻页真正限速,防高频撞账号风控)。
      try { await withDouyinChannel(gateway, "creator-center", async () => {
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
      }, undefined, opts.signal);
      } catch (error) {
        opts.signal?.throwIfAborted();
        if (!seenIds.size) throw error;
        interrupted = true;
        break;
      }
      await drainResponses();
      if (reachedKnown) break; // [T-177] 本轮滚动加载的页全是已知作品 → 停
      staleRounds = seenIds.size === before ? staleRounds + 1 : 0;
      if (staleRounds >= 3) break; // has_more 不返回时的兜底,防死循环
    }

    await drainResponses();
    if (!workJsons.length) throw new Error("作品目录未收到有效响应，请检查登录状态或稍后重试");
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
    opts.signal?.throwIfAborted();
    return { records, identity, ...((interrupted || failedResponses > 0 || (!reachedKnown && (pagesScrolled >= maxPages || (hasMoreObserved && hasMore)))) ? {incomplete:true} : {}) };
  } catch (error) {
    opts.signal?.throwIfAborted();
    throw error;
  } finally {
    await lifetime.close(); // 等待真实 context 停止；关闭失败不伪装已释放 profile
  }
}

/**
 * [T-330/T-490] 轻量身份读回 —— staging 登录态下同步读回登录用户是谁。
 *
 * 身份优先来自创作者主页的当前账号资料响应，与作品数量无关；因此刚注册、零作品、零指标账号
 * 也能完成绑定。主页资料没命中时才兼容回退到作品列表 author 反解。两条路径都必须拿到稳定
 * 平台标识，不猜身份、不伪造 ID。正式作品采集仍由绑定后的 refreshDouyin 独立负责。
 */
export async function fetchDouyinIdentity(opts: {
  authDir: string;
  signal?: AbortSignal;
}, deps: FetchDouyinMetricsDeps = {}): Promise<DouyinSelfIdentity | null> {
  opts.signal?.throwIfAborted();
  const openCtx = deps.openContext ?? realMetricsOpenContext;
  const ctx = await openCtx(opts.authDir, true, opts.signal);
  const lifetime=bindAbortContext(opts.signal,()=>ctx.close());
  let profileIdentity: DouyinSelfIdentity | null = null;
  try {
    opts.signal?.throwIfAborted();
    const cookies = await ctx.cookies("https://creator.douyin.com");
    const loggedIn = cookies.some(
      (c) => c.name === "sessionid" || c.name === "sessionid_ss",
    );
    if (!loggedIn) throw new DouyinNotLoggedInError();
    opts.signal?.throwIfAborted();
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    applyBrowserTimeoutPolicy(page);
    const pending: Array<Promise<void>> = [];
    page.on("response", (resp) => {
      // 只解析 user/account/profile 结构，不读取作品 author；URL 不写死，兼容创作者中心
      // 灰度接口改名。parseCreatorProfileIdentity 自身要求稳定平台标识，负责最后一道防误认。
      if(opts.signal?.aborted)return;
      const task = resp
        .json()
        .then((json) => {
          if (profileIdentity||opts.signal?.aborted) return;
          const parsed = parseCreatorProfileIdentity(json);
          if (!parsed) return;
          profileIdentity = parsed;
          console.log(
            `[douyin-identity] 从创作者主页账号资料读取 nickname=${parsed.nickname} ` +
              `secUid=${parsed.secUid || "(空)"} response=${resp.url()}`,
          );
        })
        .catch(() => {
          // HTML/图片/非 JSON 响应是正常噪声。
        });
      pending.push(task);
    });
    await gotoWithRetry(page, CREATOR_LOGIN_HOME, {
      timeoutMs: executionTimeoutMs(60_000),
      label: "creator-home(账号资料)",
      signal:opts.signal,
    });
    opts.signal?.throwIfAborted();
    await page.waitForTimeout(3000);
    opts.signal?.throwIfAborted();
    await Promise.allSettled([...pending]);
    opts.signal?.throwIfAborted();
  } catch(error) {
    opts.signal?.throwIfAborted();
    throw error;
  } finally {
    await lifetime.close();
  }
  opts.signal?.throwIfAborted();
  if (profileIdentity) return profileIdentity;

  console.warn(
    "[douyin-identity] 创作者主页未返回稳定账号资料，回退作品列表 author 兼容路径",
  );
  const { identity } = await fetchDouyinMetrics({
    authDir: opts.authDir,
    capturedAt: new Date().toISOString(),
    maxPages: 1,
    signal:opts.signal,
  }, deps);
  opts.signal?.throwIfAborted();
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
  signal?: AbortSignal;
  authDir: string;
  /** 对标博主稳定身份 sec_uid。 */
  secUid: string;
  /** 翻几页(默认 5;每页 ~18 条)。 */
  maxPages?: number;
  /** 严格证据模式：验证码必须抛结构化错误，不得返回合法空结果。 */
  strictEvidence?: boolean;
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
  opts.signal?.throwIfAborted();
  const maxPages = opts.maxPages ?? 5;
  const gateway = opts.gateway ?? instantNoopGateway;
  const openCtx = deps.openContext ?? realMetricsOpenContext;
  const ctx = await openCtx(opts.authDir, true);
  const lifetime = bindAbortContext(opts.signal, () => ctx.close());
  try {
    opts.signal?.throwIfAborted();
    // 登录态校验(蹭 douyin.com 会话;未登录 → 提示扫码,同 self.metrics)。
    const cookies = await ctx.cookies("https://www.douyin.com");
    const loggedIn = cookies.some(
      (c) => c.name === "sessionid" || c.name === "sessionid_ss",
    );
    if (!loggedIn) throw new DouyinNotLoggedInError();
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    applyBrowserTimeoutPolicy(page);

    const workJsons: unknown[] = [];
    let decodedListResponseCount = 0;
    let validListResponseCount = 0;
    let upstreamLoginRejected = false;
    let matchedListResponseCount = 0;
    let failedListResponseParseCount = 0;
    let lastListResponseParseError = "none";
    let lastListResponseBodyLength = 0;
    let lastListResponseBodyPrefix = "none";
    const pendingListResponseParses: Array<Promise<void>> = [];
    const seenIds = new Set<string>();
    let hasMore = true;
    const readHasMore = (j: unknown): boolean | undefined => {
      const root = (j ?? {}) as Record<string, unknown>;
      const data = (root.data ?? root) as Record<string, unknown>;
      const v = root.has_more ?? data.has_more;
      return typeof v === "boolean" ? v : v == null ? undefined : Boolean(v);
    };
    page.on("response", (resp) => {
      const url = resp.url();
      if (!WORK_LIST_HINTS.some((h) => url.includes(h))) return;
      matchedListResponseCount += 1;
      // 真机单页响应可超过 2MB。response 事件不会等待 async handler；若不显式
      // 收集并 await，这里仍在下载/解析时主流程就会误判 NO_VALID_RESPONSE/0 条。
      // 真机上 Playwright 的 response.json() 偶发在 2MB+ 抖音响应上提前
      // JSON.parse 并抛 SyntaxError；同一 response.text() 能取得完整合法 body。
      // 因此真 Page 优先完整读取 text 后再解析，窄测试 fake 保留 json 回退。
      const payload = (async () => {
        // response 事件在响应头到达时即触发；大 body 必须等 finished，否则部分
        // Chromium/Playwright 组合会对 text/json 报 SyntaxError 或 body unavailable。
        if (resp.finished) await resp.finished();
        if (resp.text) {
          const body = await resp.text();
          lastListResponseBodyLength = body.length;
          lastListResponseBodyPrefix = body
            .slice(0, 48)
            .replace(/[^\x20-\x7E]/g, "?");
          return JSON.parse(body) as unknown;
        }
        return await resp.json();
      })();
      const parse = payload
        .then((j) => {
          decodedListResponseCount += 1;
          workJsons.push(j);
          const root = (j ?? {}) as Record<string, unknown>;
          const data = (root.data ?? {}) as Record<string, unknown>;
          const statusMessage =
            typeof root.status_msg === "string" ? root.status_msg : "";
          if (
            root.status_code === 8 ||
            /(?:未登录|登录失效|请先登录)/.test(statusMessage)
          ) {
            // 本地 Cookie 文件存在不代表抖音服务端仍认可该会话。主页接口明确拒绝
            // 登录时必须引导重登，不能继续折叠成 NO_VALID_RESPONSE。
            upstreamLoginRejected = true;
          }
          if (
            Array.isArray(root.aweme_list) ||
            Array.isArray(root.item_list) ||
            Array.isArray(data.aweme_list) ||
            Array.isArray(data.item_list)
          ) {
            validListResponseCount += 1;
          }
          for (const w of parseWorkList(j)) seenIds.add(w.awemeId);
          const hm = readHasMore(j);
          if (hm !== undefined) hasMore = hm;
        })
        .catch((error) => {
          // 非 JSON 响应不是有效作品证据，保持计数为 0。
          failedListResponseParseCount += 1;
          lastListResponseParseError =
            error instanceof Error ? error.name : "UnknownError";
        });
      pendingListResponseParses.push(parse);
    });
    const waitForListResponseEvidence = async () => {
      // 真机主页的首个 aweme/post 可能在 DOMContentLoaded 后约 8 秒才发出，
      // 且单个 JSON 可超过 2MB。固定轮询同时覆盖“请求尚未出现”和“已出现但
      // body 尚未下载/解析”两段，避免按旧 5.5 秒窗口抢先判失败。
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await Promise.allSettled([...pendingListResponseParses]);
        if (decodedListResponseCount > 0 || upstreamLoginRejected) return;
        await page.waitForTimeout(500);
      }
      await Promise.allSettled([...pendingListResponseParses]);
    };

    const profileUrl = `https://www.douyin.com/user/${encodeURIComponent(opts.secUid)}`;
    await gotoWithRetry(page, profileUrl, {
      timeoutMs: executionTimeoutMs(60_000),
      label: `对标主页(${opts.secUid})`,
    });
    await page.waitForTimeout(3000); // 等首屏 aweme/post XHR
    await Promise.allSettled([...pendingListResponseParses]);
    if (opts.strictEvidence) {
      const finalUrl = page.url?.() ?? profileUrl;
      const title = page.title ? await page.title().catch(() => "") : "";
      const bodyHead = await page
        .evaluate(() => (document.body?.innerText ?? "").slice(0, 300))
        .catch(() => "");
      if (
        upstreamLoginRejected ||
        /(?:passport|login|oauth)/i.test(finalUrl) ||
        /抖音授权|账号登录/.test(title) ||
        /使用抖音账号登录|请扫码登录|登录后即可查看/.test(bodyHead)
      ) {
        throw new DouyinNotLoggedInError();
      }
      if (bodyHead.includes("验证")) throw new DouyinCaptchaError();
    }

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
    await waitForListResponseEvidence();

    if (
      opts.strictEvidence &&
      decodedListResponseCount === 0 &&
      matchedListResponseCount > 0 &&
      failedListResponseParseCount > 0
    ) {
      // 抖音主页偶发先返回一个 200 + 空 body，并在页面显示“服务异常”。
      // 这既不是 0 作品也不是稳定结构变化；同一会话强制重载一次，等待真实
      // aweme/post body。仍失败才交给 NO_VALID_RESPONSE，避免无限重试。
      await gotoWithRetry(
        page,
        `${profileUrl}?from_tab_name=main&creatoros_retry=1`,
        {
          timeoutMs: executionTimeoutMs(60_000),
          label: `对标主页重试(${opts.secUid})`,
        },
      );
      await page.waitForTimeout(3_000);
      await page.mouse.wheel(0, 3_000).catch(() => {});
      await page.waitForTimeout(2_500);
      await waitForListResponseEvidence();
      const retryUrl = page.url?.() ?? profileUrl;
      const retryTitle = page.title
        ? await page.title().catch(() => "")
        : "";
      const retryBody = await page
        .evaluate(() => (document.body?.innerText ?? "").slice(0, 300))
        .catch(() => "");
      if (
        upstreamLoginRejected ||
        /(?:passport|login|oauth)/i.test(retryUrl) ||
        /抖音授权|账号登录/.test(retryTitle) ||
        /使用抖音账号登录|请扫码登录|登录后即可查看/.test(retryBody)
      ) {
        throw new DouyinNotLoggedInError();
      }
    }

    if (opts.strictEvidence && decodedListResponseCount === 0) {
      // [T-567] 两轮作品接口都只有空 body 时，本地 Cookie/页面文案不足以证明登录有效。
      // 收藏接口能明确给出 status_code=8；只有它明确拒绝会话才要求重登，网络失败或
      // 未知状态仍保留 NO_VALID_RESPONSE，避免把所有上游抖动误报成登录失效。
      if (
        matchedListResponseCount > 0 &&
        failedListResponseParseCount > 0 &&
        (await probeDouyinSessionAcceptance(page)) === "expired"
      ) {
        throw new DouyinNotLoggedInError();
      }
      const finalUrl = page.url?.() ?? profileUrl;
      console.warn(
        `[benchmark] no-valid-response matched=${matchedListResponseCount} ` +
          `parseFailed=${failedListResponseParseCount} parseError=${lastListResponseParseError} ` +
          `bodyLength=${lastListResponseBodyLength} bodyPrefix=${JSON.stringify(lastListResponseBodyPrefix)} ` +
          `finalHost=${new URL(finalUrl).hostname}`,
      );
      throw new DouyinNoValidResponseError();
    }
    if (opts.strictEvidence && validListResponseCount === 0) {
      throw new DouyinResponseShapeChangedError();
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
    await lifetime?.close().catch(() => {}); // 关我们自起的 Chromium
  }
}

export interface DouyinProfilePreview {
  externalAccountId: string;
  nickname: string;
  avatarUrl: string | null;
  canonicalUrl: string;
  visibleWorkCount: number;
}

/**
 * 添加对标来源前的只读预览。稳定身份仍取 URL 中的 sec_uid；昵称/头像只从主页当前公开
 * DOM 元数据读取，作品概况复用同一账号隔离 profile 的公开作品读取，不保存 Cookie。
 */
export async function previewDouyinUserProfile(
  opts: FetchUserPostsOptions & { canonicalUrl?: string },
  deps: FetchDouyinMetricsDeps = {},
): Promise<DouyinProfilePreview> {
  const canonicalUrl =
    opts.canonicalUrl ??
    `https://www.douyin.com/user/${encodeURIComponent(opts.secUid)}`;
  const works = await fetchDouyinUserPosts(
    { ...opts, maxPages: Math.min(opts.maxPages ?? 1, 1) },
    deps,
  );
  const openCtx = deps.openContext ?? realMetricsOpenContext;
  const ctx = await openCtx(opts.authDir, true);
  try {
    const cookies = await ctx.cookies("https://www.douyin.com");
    if (
      !cookies.some(
        (cookie) =>
          cookie.name === "sessionid" || cookie.name === "sessionid_ss",
      )
    ) {
      throw new DouyinNotLoggedInError();
    }
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    applyBrowserTimeoutPolicy(page);
    await gotoWithRetry(page, canonicalUrl, {
      timeoutMs: executionTimeoutMs(60_000),
      label: `对标主页预览(${opts.secUid})`,
    });
    await page.waitForTimeout(2_000);
    const meta = await page
      .evaluate(() => {
        const title = document.title ?? "";
        const image =
          document
            .querySelector<HTMLMetaElement>('meta[property="og:image"]')
            ?.content?.trim() ?? "";
        return { title, image };
      })
      .catch(() => ({ title: "", image: "" }));
    const nickname =
      meta.title
        .replace(/\s*[-|_]\s*抖音.*$/i, "")
        .replace(/的抖音.*$/i, "")
        .trim() || "抖音博主";
    return {
      externalAccountId: opts.secUid,
      nickname,
      avatarUrl: /^https?:\/\//i.test(meta.image) ? meta.image : null,
      canonicalUrl,
      visibleWorkCount: works.length,
    };
  } finally {
    await ctx.close().catch(() => {});
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
  signal?: AbortSignal;
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
    signal?: AbortSignal,
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
  opts.signal?.throwIfAborted();
  const gateway = opts.gateway ?? instantNoopGateway;
  const openCtx =
    deps.openContext ??
    ((authDir: string, headless: boolean, signal?: AbortSignal) =>
      openContext(authDir, headless, signal) as unknown as Promise<SearchCapableContext>);
  const ctx = await openCtx(opts.authDir, true, opts.signal);
  const lifetime = bindAbortContext(opts.signal, () => ctx.close());
  try {
    opts.signal?.throwIfAborted();
    // 登录态校验(页内 fetch credentials:include 要借它;未登录 → 提示扫码,同 user-posts)。
    const cookies = await ctx.cookies("https://www.douyin.com");
    const loggedIn = cookies.some(
      (c) => c.name === "sessionid" || c.name === "sessionid_ss",
    );
    if (!loggedIn) throw new DouyinNotLoggedInError();
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    applyBrowserTimeoutPolicy(page);

    const kw = encodeURIComponent(opts.keyword);
    // 整次搜索 acquire 一次限流网关(导航 + 页内 fetch 算一次请求节奏,防高频撞风控)。
    return await withDouyinChannel(gateway, "creator-center", async () => {
      // 先落到真实搜索页(建立 referer/风控上下文),再页内 fetch API(darkhorse.py:58-64 同款)。
      await gotoWithRetry(
        page as unknown as GotoCapablePage,
        `https://www.douyin.com/search/${kw}?publish_time=1&sort_type=1&type=video`,
        { timeoutMs: executionTimeoutMs(60_000), label: `黑马搜索(${opts.keyword})`, signal:opts.signal },
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
      opts.signal?.throwIfAborted();
      return videos;
    }, undefined, opts.signal);
  } catch (error) {
    opts.signal?.throwIfAborted();
    throw error;
  } finally {
    await lifetime.close(); // 等待真实 context 停止；关闭失败不伪装已释放 profile
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

const DOUYIN_SHARE_HOSTS = ["douyin.com", "iesdouyin.com"] as const;

function isDouyinShareHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return DOUYIN_SHARE_HOSTS.some(
    (host) => normalized === host || normalized.endsWith(`.${host}`),
  );
}

export function extractDouyinShareUrl(shareText: string): string {
  const matches = shareText.match(/https?:\/\/[^\s<>"']+/giu) ?? [];
  for (const raw of matches) {
    const candidate = raw.replace(/[，。！？；、)\]}>”’…]+$/gu, "");
    try {
      const url = new URL(candidate);
      if (isDouyinShareHost(url.hostname)) return url.toString();
    } catch {
      // 继续检查下一段 URL。
    }
  }
  throw Object.assign(new DouyinAudioFetchError("分享文本中没有可识别的抖音链接"),{code:"DOUYIN_SHARE_UNSAFE_URL"});
}

function awemeIdFromDouyinUrl(url: URL): string | null {
  const pathMatch = url.pathname.match(
    /\/(?:share\/)?video\/([A-Za-z0-9_-]+)/i,
  );
  return (
    pathMatch?.[1] ??
    url.searchParams.get("modal_id") ??
    url.searchParams.get("aweme_id")
  );
}

export interface DouyinShareTarget {
  shareUrl: string;
  resolvedUrl: string;
  awemeId: string;
  canonicalUrl: string;
}

export async function resolveDouyinShareTarget(
  shareText: string,
  deps: { fetch?: typeof globalThis.fetch; signal?:AbortSignal } = {},
): Promise<DouyinShareTarget> {
  deps.signal?.throwIfAborted();
  const shareUrl = extractDouyinShareUrl(shareText);
  const request = deps.fetch ?? globalThis.fetch;
  let current = new URL(shareUrl);
  for (let hop = 0; hop <= 5; hop += 1) {
    deps.signal?.throwIfAborted();
    if (
      !["http:", "https:"].includes(current.protocol) ||
      !isDouyinShareHost(current.hostname)
    ) {
      throw Object.assign(new DouyinAudioFetchError("分享链接跳转到了非抖音域名，已停止读取"),{code:"DOUYIN_SHARE_UNSAFE_URL"});
    }
    const directId = awemeIdFromDouyinUrl(current);
    if (directId) {
      return {
        shareUrl,
        resolvedUrl: current.toString(),
        awemeId: directId,
        canonicalUrl: `https://www.douyin.com/video/${encodeURIComponent(directId)}`,
      };
    }
    if (hop === 5) break;
    const response = await request(current, {
      method: "GET",
      redirect: "manual",
      signal: deps.signal?AbortSignal.any([deps.signal,AbortSignal.timeout(executionTimeoutMs(10_000))]):AbortSignal.timeout(executionTimeoutMs(10_000)),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      },
    });
    if(response.status>=400)throw Object.assign(new Error("抖音分享读取 HTTP 失败"),{name:"DouyinShareHttpError",status:response.status});
    if (response.status < 300 || response.status >= 400) {
      const finalUrl = response.url ? new URL(response.url) : current;
      if(!isDouyinShareHost(finalUrl.hostname)||!["http:","https:"].includes(finalUrl.protocol))throw Object.assign(new DouyinAudioFetchError("分享链接跳转到了非抖音域名，已停止读取"),{code:"DOUYIN_SHARE_UNSAFE_URL"});
      const id = awemeIdFromDouyinUrl(finalUrl);
      if (id) {
        return {
          shareUrl,
          resolvedUrl: finalUrl.toString(),
          awemeId: id,
          canonicalUrl: `https://www.douyin.com/video/${encodeURIComponent(id)}`,
        };
      }
      break;
    }
    const location = response.headers.get("location");
    if (!location) break;
    current = new URL(location, current);
  }
  throw Object.assign(new DouyinAudioFetchError("抖音分享链接未解析出作品 ID，可能已失效或不是单条作品"),{code:"DOUYIN_SHARE_UNSAFE_URL"});
}

function nullableCount(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export interface ParsedDouyinSharedItem {
  item: {
    type: "video";
    platform: "douyin";
    externalId: string;
    canonicalUrl: string;
    authorId: string | null;
    authorName: string | null;
    title: string;
    summary: string | null;
    coverUrl: string | null;
    publishedAt: string | null;
    durationMs: number | null;
    metrics: {
      likeCount: number | null;
      commentCount: number | null;
      collectCount: number | null;
      shareCount: number | null;
      followerCount: number | null;
      metricSource: "douyin_aweme_detail";
      qualityFlags: string[];
    };
    snapshot: {
      finalUrl: string;
      title: string;
      contentHash: string;
      safeExtract: string | null;
      storageRef: null;
      retentionUntil: null;
      privacyClass: "public";
    };
  };
}

export function parseDouyinSharedItem(
  json: unknown,
  canonicalUrl: string,
  _capturedAt: string,
): ParsedDouyinSharedItem {
  const root = (json ?? {}) as Record<string, unknown>;
  const raw = root.aweme_detail;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DouyinAudioFetchError(
      "parseDouyinSharedItem: aweme_detail 为空(作品不存在/不可见/接口风控)",
    );
  }
  const detail = raw as Record<string, unknown>;
  const awemeId = str(detail.aweme_id);
  if (!awemeId) {
    throw new DouyinAudioFetchError(
      "parseDouyinSharedItem: 作品缺少 aweme_id",
    );
  }
  const desc = str(detail.desc).trim();
  const title = deriveWorkTitle(str(detail.title), desc) || `抖音作品 ${awemeId}`;
  const author = (detail.author ?? detail.user ?? {}) as Record<
    string,
    unknown
  >;
  const statistics = (detail.statistics ?? detail.stats ?? {}) as Record<
    string,
    unknown
  >;
  const video = (detail.video ?? {}) as Record<string, unknown>;
  const cover = (video.cover ?? video.origin_cover ?? {}) as Record<
    string,
    unknown
  >;
  const coverUrls = Array.isArray(cover.url_list) ? cover.url_list : [];
  const createTime = nullableCount(detail.create_time);
  const metrics = {
    likeCount: nullableCount(statistics.digg_count ?? statistics.like_count),
    commentCount: nullableCount(statistics.comment_count),
    collectCount: nullableCount(
      statistics.collect_count ?? statistics.favorite_count,
    ),
    shareCount: nullableCount(statistics.share_count),
    followerCount: nullableCount(author.follower_count),
    metricSource: "douyin_aweme_detail" as const,
    qualityFlags: [] as string[],
  };
  for (const [field, value] of Object.entries(metrics)) {
    if (field.endsWith("Count") && value === null) {
      metrics.qualityFlags.push(`${field}_missing`);
    }
  }
  const contentHash = createHash("sha256")
    .update(
      JSON.stringify({
        awemeId,
        title,
        desc,
      }),
    )
    .digest("hex");
  return {
    item: {
      type: "video",
      platform: "douyin",
      externalId: awemeId,
      canonicalUrl,
      authorId:
        str(author.sec_uid) || str(author.uid) || str(author.user_id) || null,
      authorName: str(author.nickname) || str(author.name) || null,
      title,
      summary: desc || null,
      coverUrl:
        typeof coverUrls[0] === "string" ? coverUrls[0] : null,
      publishedAt:
        createTime === null
          ? null
          : new Date(createTime * 1_000).toISOString(),
      durationMs: nullableCount(video.duration ?? detail.duration),
      metrics,
      snapshot: {
        finalUrl: canonicalUrl,
        title,
        contentHash,
        safeExtract: desc || null,
        storageRef: null,
        retentionUntil: null,
        privacyClass: "public",
      },
    },
  };
}

export interface FetchDouyinSharedItemOptions {
  signal?:AbortSignal;
  awemeId: string;
  canonicalUrl: string;
  authDir: string;
  capturedAt: string;
  gateway?: DouyinChannelGate;
}

export interface FetchDouyinSharedItemDeps {
  openContext?: (
    authDir: string,
    headless: boolean,
    signal?:AbortSignal,
  ) => Promise<SearchCapableContext>;
}

/**
 * 用当前账号隔离的抖音登录态读取单条作品 detail。这里只建档公开元数据与计数，不读取
 * 评论正文，也不创建逐字稿任务。
 */
export async function fetchDouyinSharedItem(
  opts: FetchDouyinSharedItemOptions,
  deps: FetchDouyinSharedItemDeps = {},
): Promise<ParsedDouyinSharedItem> {
  opts.signal?.throwIfAborted();
  const gateway = opts.gateway ?? instantNoopGateway;
  const openCtx =
    deps.openContext ??
    ((authDir: string, headless: boolean,signal?:AbortSignal) =>
      openContext(authDir, headless,signal) as unknown as Promise<SearchCapableContext>);
  const ctx = await openCtx(opts.authDir, true,opts.signal);
  const lifetime=bindAbortContext(opts.signal,()=>ctx.close());
  try {
    opts.signal?.throwIfAborted();
    const cookies = await ctx.cookies("https://www.douyin.com");
    const loggedIn = cookies.some(
      (cookie) =>
        cookie.name === "sessionid" || cookie.name === "sessionid_ss",
    );
    if (!loggedIn) throw new DouyinNotLoggedInError();
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    applyBrowserTimeoutPolicy(page);
    const id = encodeURIComponent(opts.awemeId);
    return await withDouyinChannel(
      gateway,
      "creator-center",
      async () => {
        await gotoWithRetry(
          page as unknown as GotoCapablePage,
          opts.canonicalUrl,
          { timeoutMs: executionTimeoutMs(60_000), label: `单条作品导入(${opts.awemeId})`,signal:opts.signal },
        );
        await page.waitForTimeout(2_000);
        const bodyHead = await page
          .evaluate(() => (document.body?.innerText ?? "").slice(0, 300))
          .catch(() => "");
        if (bodyHead.includes("验证")) {
          throw new DouyinCaptchaError();
        }
        const json = await page.evaluate<unknown, string>(async (url) => {
          try {
            const response = await fetch(url, { credentials: "include" });
            if(!response.ok)return {__shareHttpStatus:response.status};
            return (await response.json()) as unknown;
          } catch (error) {
            return error instanceof SyntaxError?{__shareResponseInvalid:true}:{__shareNetworkFailure:true};
          }
        }, AWEME_DETAIL_API.replace("{id}", id));
        const envelope=(json??{}) as Record<string,unknown>;
        if(typeof envelope.__shareHttpStatus==="number")throw Object.assign(new Error("抖音作品读取 HTTP 失败"),{name:"DouyinShareHttpError",status:envelope.__shareHttpStatus});
        if(envelope.__shareResponseInvalid===true)throw new DouyinAudioFetchError("抖音作品响应不是有效JSON");
        if(envelope.__shareNetworkFailure===true)throw Object.assign(new Error("抖音作品读取网络失败"),{name:"DouyinShareNetworkError"});
        if(envelope.status_code===8)throw new DouyinNotLoggedInError();
        return parseDouyinSharedItem(
          json,
          opts.canonicalUrl,
          opts.capturedAt,
        );
      },
      mapDetailErr,
      opts.signal,
    );
  } catch(error){
    opts.signal?.throwIfAborted();
    // SEMANTIC_BOUNDARY_ALLOW: Chromium 协议错误码只表示网络传输失败，不判断业务语义。
    if(error instanceof Error&&/\bnet::ERR_(?:CONNECTION_RESET|TIMED_OUT|CONNECTION_REFUSED|NETWORK_CHANGED|NAME_NOT_RESOLVED)\b/.test(error.message))throw Object.assign(new Error("抖音页面读取网络失败",{cause:error}),{name:"DouyinShareNetworkError"});
    throw error;
  } finally {
    try{await lifetime.close();}catch(error){throw Object.assign(new Error("分享读取浏览器尚未确认关闭",{cause:error}),{code:"SHARE_BROWSER_STOP_UNCONFIRMED",resourceStopUnconfirmed:true});}
  }
}

export interface FetchVideoUrlViaDetailOptions {
  signal?: AbortSignal;
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

/**
 * [T-243] 登录态回落取流:openContext(.auth/)→ 落到该作品页(建立 referer/风控上下文)→
 * 页内 fetch detail 接口(credentials:include 借登录态)→ parseAwemeDetail。
 * 未登录抛 DouyinNotLoggedInError;**验证码命中 → 抛 DouyinAudioFetchError(消息含「验证码」)**
 * 不硬闯(单作品跳过,调用方分类计数)。每次调用 acquire 一次 creator-center gate(限流纪律)。
 * openContext 端口注入,故图集/验证码/解析分支可确定性单测。
 */
export function fetchDouyinVideoUrlViaDetail(
  opts: FetchVideoUrlViaDetailOptions,
  deps: FetchVideoUrlViaDetailDeps = {},
): Promise<DouyinVideoSource> {
  return fetchWorkerDouyinVideoUrlViaDetail(opts, {
    openContext: (signal) => deps.openContext
      ? deps.openContext(opts.authDir, true)
      : openContext(opts.authDir, true, signal) as unknown as Promise<SearchCapableContext>,
    channel: (run, mapError, signal) => withDouyinChannel(
      opts.gateway ?? instantNoopGateway, "creator-center", run, mapError, signal,
    ),
  });
}

/** 组合策略在 Worker；登录浏览器取详情仍是待迁移的宿主端口。 */
export type FetchVideoSourceDeps = Partial<Pick<WorkerFetchVideoSourceDeps<DouyinChannelGate>, "fetchIesdouyin" | "fetchViaDetail">>;
export type FetchVideoSourceOptions = WorkerFetchVideoSourceOptions<DouyinChannelGate>;
export function fetchDouyinVideoSource(opts: FetchVideoSourceOptions, deps: FetchVideoSourceDeps = {}): Promise<DouyinVideoSource> {
  return fetchWorkerDouyinVideoSource(opts, {
    fetchIesdouyin: deps.fetchIesdouyin,
    fetchViaDetail: deps.fetchViaDetail ?? fetchDouyinVideoUrlViaDetail,
    channel: (run, mapError, signal) => withDouyinChannel(opts.gateway ?? instantNoopGateway, "iesdouyin", run, mapError, signal),
  });
}

/**
 * [T-862] 封面回填专用组合入口。复用 fetchDouyinVideoSource 的解析失败分类与账号隔离
 * 登录态兜底，只把真实 coverUrl 暴露给回填层：
 * - video + coverUrl → 继续下载/落库；
 * - video 无 cover 或 image-album → 返回空对象，由回填层诚实 skipped；
 * - 网络/HTTP/冷却错误 → 原样抛出，不盲目切第二通道。
 */
export async function fetchDouyinCoverUrl(
  opts: Omit<FetchVideoSourceOptions, "purpose">,
  deps: FetchVideoSourceDeps = {},
): Promise<{ coverUrl?: string }> {
  const source = await fetchDouyinVideoSource(
    { ...opts, purpose: "cover" },
    deps,
  );
  if (source.kind === "image-album" || !source.coverUrl) return {};
  return { coverUrl: source.coverUrl };
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
  status?(): number;
  request?(): {method?():string;resourceType?():string};
  json(): Promise<unknown>;
}) => void;

interface CommentCapablePage {
  url?(): string;
  isClosed?(): boolean;
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
  // 请求作品 ID 与记录作品 ID 精确核对；混合归属的页只保留确认属于当前作品的记录，
  // 不作为 watermark 或完整读取的证据。
  commentWatermark?: (awemeId: string) => Promise<Set<string>>;
  /** 多作品抓取每完成一个作品立即回调；调用方可同步落库并上报真实 M/N 进度。 */
  onWorkComplete?: (
    work: FetchCommentsForWorksResult,
    progress: { processed: number; total: number },
  ) => void | Promise<void>;
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
  onCompletion?: (complete:boolean,diagnostics:CommentReadDiagnostics)=>void,
): Promise<CommentRecord[]> {
  const byId = new Map<string, CommentRecord>();
  const seenIds = new Set<string>();
  // [T-177] 某页评论全部已在 watermark(且非空)→ 倒序下已翻到老评论,提前停翻页。
  let reachedWatermark = false;
  const pageEvidence=createCommentPageEvidence();
  let active=true,matchedResponses=0,validResponses=0,invalidResponses=0,parsedComments=0,pendingResponses=0,ignoredResponses=0;
  // 同一请求页的成功重试可以恢复；历史计数只用于诊断，不永久否决后续成功。
  type CommentPageState={sequence:number;invalid:boolean;unparseable:boolean;hasMore:boolean|null;watermark:boolean;identityUnverified?:boolean};
  const pageStates=new Map<string,CommentPageState>();
  const setPageState=(key:string,state:CommentPageState)=>{
    if((pageStates.get(key)?.sequence??-1)>state.sequence)return;
    pageStates.set(key,state);
    reachedWatermark=[...pageStates.values()].some(value=>!value.invalid&&value.watermark);
  };
  const onResponse: CommentResponseHandler = (resp) => {
    observeCommentResponse(pageEvidence,resp);
    const url = resp.url();
    if (!COMMENT_LIST_HINTS.some((h) => url.includes(h))) return;
    const sequence=++matchedResponses;
    let params:URLSearchParams;
    try{params=new URL(url).searchParams;}catch{ignoredResponses++;return;}
    // SEMANTIC_BOUNDARY_ALLOW: 仅精确核对请求/记录作品 ID 与分页键，不推断评论语义或页面归属。
    const requestIds=[...params.getAll('item_id'),...params.getAll('aweme_id')].filter(Boolean);
    if(requestIds.some(id=>id!==awemeId)){ignoredResponses++;return;}
    const requestScoped=requestIds.length>0;
    const pageKey=JSON.stringify(['cursor','offset','page','page_index'].map(key=>params.get(key)??'0'));
    pendingResponses++;
    void (async () => {
      try {
        const j = await resp.json();
        if(!active)return;
        const root=(j??{}) as Record<string,unknown>,data=(root.data??{}) as Record<string,unknown>;
        const list=commentListValue(j),status=root.status_code??data.status_code;
        if(list===null||(status!==undefined&&status!==0)){
          invalidResponses++;
          if(requestScoped)setPageState(pageKey,{sequence,invalid:true,unparseable:false,hasMore:null,watermark:false});
          return;
        }
        const rowIds=list.map(raw=>{const row=(raw??{}) as Record<string,unknown>;return [str(row.aweme_id),str(row.item_id)].filter(Boolean);});
        const rowMatches=(ids:string[])=>ids.length?ids.every(id=>id===awemeId):requestScoped;
        const batch=parseCommentList({comments:list.filter((_raw,index)=>rowMatches(rowIds[index]!))},requestScoped?awemeId:'');
        parsedComments+=batch.length;
        for (const c of batch) {
          seenIds.add(c.commentId);byId.set(c.commentId,c);
        }
        const identityVerified=(requestScoped||list.length>0)&&rowIds.every(rowMatches);
        if(!identityVerified){
          ignoredResponses++;
          // 明确属于当前作品的请求页必须保留未解决状态；完全无关的迟到请求在入口已忽略。
          if(requestScoped)setPageState(pageKey,{sequence,invalid:false,unparseable:false,hasMore:null,watermark:false,identityUnverified:true});
          return;
        }
        validResponses++;
        const hasMoreValue=root.has_more??data.has_more;
        const hasMore=hasMoreValue===0||hasMoreValue===false?false:hasMoreValue===1||hasMoreValue===true?true:null;
        setPageState(pageKey,{sequence,invalid:false,unparseable:list.length>batch.length,hasMore,
          watermark:watermark.size>0&&batch.length>0&&batch.every(c=>watermark.has(commentExternalId(c)))});
      } catch {
        if(active){invalidResponses++;if(requestScoped)setPageState(pageKey,{sequence,invalid:true,unparseable:false,hasMore:null,watermark:false});}
      }finally{pendingResponses--;}
    })();
  };
  page.on("response", onResponse);
  try {
    // item_id 过滤 → 评论管理页只显示该作品的评论(对齐 crawler.py urls_to_try)。
    // [T-202] 导航加退避重试(瞬时超时自愈)。
    await gotoWithRetry(
      {goto:async(url,opts)=>{
        const response=await page.goto(url,opts);
        pageEvidence.navigationStatus=commentHttpStatus(response);
        return response;
      },waitForTimeout:ms=>page.waitForTimeout(ms)},
      `${CREATOR_COMMENT_MANAGE}?item_id=${encodeURIComponent(awemeId)}`,
      { timeoutMs: executionTimeoutMs(60_000), label: `comment-manage(${awemeId})` },
    );
    await page.waitForTimeout(3000); // 等首屏 comment/list XHR 回来

    // 连续 3 轮无新评论只限制等待；显式 has_more=1 不能被静默覆盖为已完成。
    let staleRounds = 0;
    for (let i = 0; i < maxPages; i++) {
      // [T-177 增量化] 首屏(goto 后)或上一轮已翻到全是库里已抓过的老评论 → 提前停,不再全量重翻。
      if (reachedWatermark) break;
      const before = seenIds.size;
      // [gate-F7 插装点③] 每翻一页 acquire 一次 creator-center(评论翻页真正限速)。
      await withDouyinChannel(gateway, "creator-center", async () => {
        pageEvidence.scroll.attempts++;
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
          .catch(() => {pageEvidence.scroll.evaluateErrors++;});
        await page.mouse.wheel(0, 2000).catch(() => {pageEvidence.scroll.wheelErrors++;});
        await page.waitForTimeout(2000);
      });
      if (reachedWatermark) break; // [T-177] 本轮滚动加载的页全是老评论 → 停
      staleRounds = seenIds.size === before ? staleRounds + 1 : 0;
      if (staleRounds >= 3) break;
    }

    const states=[...pageStates.values()];
    const latest=states.filter(state=>!state.invalid&&!state.identityUnverified).sort((a,b)=>b.sequence-a.sequence)[0];
    const reason:CommentReadReason=pendingResponses>0?'response_pending':validResponses===0?
      (matchedResponses===0?'no_matching_response':ignoredResponses>0?'response_identity_unverified':'no_valid_response'):
      states.some(state=>state.invalid)?'invalid_response':states.some(state=>state.identityUnverified)?'response_identity_unverified':states.some(state=>state.unparseable)?'unparseable_records':
      reachedWatermark?'watermark_reached':latest?.hasMore===false?'pagination_exhausted':latest?.hasMore===true?'more_pages_pending':staleRounds>=3?'stable_end':'page_limit';
    // 在原监听窗口终点固定结果，诊断读取不能延长采集或改变pending/完成判断。
    active=false;page.off("response",onResponse);
    const diagnostics:CommentReadDiagnostics={matchedResponses,validResponses,invalidResponses,parsedComments,pendingResponses,ignoredResponses,reason,pageEvidence};
    await finishCommentPageEvidence(page,pageEvidence,reason);
    onCompletion?.(reason==='watermark_reached'||reason==='stable_end'||reason==='pagination_exhausted',diagnostics);
    return [...byId.values()];
  } finally {
    // 多作品复用 page 时,摘掉本作品监听,避免监听在 page 上累积/后续作品 XHR 被重复解析。
    active=false;page.off("response", onResponse);
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
    applyBrowserTimeoutPolicy(page);
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
  /** false 表示没有确认读完，部分结果可保存但不推进成功水位。 */
  complete?: boolean;
  awemeId: string;
  records: CommentRecord[];
  diagnostics?: CommentReadDiagnostics;
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
    applyBrowserTimeoutPolicy(page);
    const out: FetchCommentsForWorksResult[] = [];
    for (const awemeId of awemeIds) {
      // [T-177 增量化] 每作品抓前反查其 watermark(库里已知评论 externalId 集);无端口 → 空集退化全量。
      const watermark = deps.commentWatermark
        ? await deps.commentWatermark(awemeId)
        : new Set<string>();
      try {
        // [gate-F7 插装点④] **每作品 acquire 一次** creator-center(把 72 作品逐个导航真正限速);
        // 作品内翻页再由 scrapeCommentsForWork 内部 acquire(插装点③),两层正交、均串行到 creator-center。
        let complete=false,diagnostics:CommentReadDiagnostics|undefined;
        const records = await withDouyinChannel(gateway, "creator-center", () =>
          // 同一 context / 同一 page 逐作品导航抓取(评论管理页每作品 item_id 过滤,goto 会换页)。
          scrapeCommentsForWork(page, awemeId, maxPages, gateway, watermark,(value,detail)=>{complete=value;diagnostics=detail;}),
        );
        const work = { awemeId, records, complete,diagnostics };
        out.push(work);
        await deps.onWorkComplete?.(work, {
          processed: out.length,
          total: awemeIds.length,
        });
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
  openContext?: (authDir: string, headless: boolean, signal?: AbortSignal) => Promise<ExportCapableContext>;
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
  onProgress?: DouyinExportProgress;
  signal?: AbortSignal;
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
      .click({ timeout: executionTimeoutMs(opts.timeout, 5_000) });
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
  const intervalMs = opts.intervalMs ?? 1_000;
  const tries = Math.max(opts.tries ?? 10, Math.ceil(executionTimeoutMs((opts.tries ?? 10) * intervalMs) / Math.max(1, intervalMs)));
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
/** 只定位当前遮挡层里显式关闭控件；不解释弹窗正文或点击授权/确认。
 * 自包含页内函数：桌面压缩/混淆后仍可由Playwright序列化。 */
function markVisibleExportModalCloseInPage(_arg: null): number {
  for (const previous of document.querySelectorAll('[data-cos-export-modal-close]')) previous.removeAttribute('data-cos-export-modal-close');
  const visible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || ancestor.getAttribute('aria-hidden') === 'true') return false;
    }
    return true;
  };
  const dialogs = Array.from(document.querySelectorAll('.douyin-creator-pc-modal-wrap,[role="dialog"]')).reverse();
  for (const dialog of dialogs) {
    if (!visible(dialog)) continue;
    const controls = dialog.querySelectorAll('.douyin-creator-pc-modal-close,button[aria-label="Close"],button[aria-label="close"],button[aria-label="关闭"],[role="button"][aria-label="Close"],[role="button"][aria-label="关闭"]');
    for (const control of controls) {
      if (!visible(control) || control.hasAttribute('disabled') || control.getAttribute('aria-disabled') === 'true') continue;
      const rect = control.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      if (!hit || (hit !== control && !control.contains(hit))) continue;
      control.setAttribute('data-cos-export-modal-close', '1');
      return 1;
    }
  }
  return 0;
}

export async function fetchDouyinWorkListExport(
  opts: FetchWorkListExportOptions,
  deps: FetchWorkListExportDeps = {},
): Promise<Uint8Array> {
  opts.signal?.throwIfAborted();
  const notify = (phase: DouyinExportPhase) => {
    // 通知只记录固定机械阶段；不可因诊断失败反杀导出或泄露原始错误。
    console.info("[douyin-export-progress]", {event: "export_phase", phase});
    try { void Promise.resolve(opts.onProgress?.(phase)).catch(() => {}); } catch { /* best-effort */ }
  };
  const openCtx =
    deps.openContext ??
    ((authDir, headless, signal) =>
      openContext(authDir, headless, signal) as unknown as Promise<ExportCapableContext>);
  const readFile =
    deps.readFile ??
    (async (p: string) => {
      const { readFile: rf } = await import("node:fs/promises");
      return new Uint8Array(await rf(p));
    });
  const downloadTimeoutMs = deps.downloadTimeoutMs === 0 ? 0 : executionTimeoutMs(deps.downloadTimeoutMs, 180_000); // 大账号导出保留生成时间；注入超时仍可覆盖
  const gateway = deps.gateway ?? instantNoopGateway; // [gate-F7 插装点⑤] creator-center 整个导出一次限流

  notify("browser");
  const ctx = await openCtx(opts.authDir, true, opts.signal);
  const lifetime = bindAbortContext(opts.signal, () => ctx.close());
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
    opts.signal?.throwIfAborted();
    notify("channel");
    return await withDouyinChannel(
      gateway,
      "creator-center",
      () => runExportOnce(ctx, { notify, signal:opts.signal, downloadTimeoutMs, readFile, onDownloadTimeout: (v) => { sawNoDataToast = v; } }),
      mapExportErr,
      opts.signal,
    );
  } catch (error) {
    opts.signal?.throwIfAborted();
    throw error;
  } finally {
    notify("close");
    await lifetime.close(); // 等待真实 context 停止；关闭失败不伪装已释放 profile
  }
}

/** fetchDouyinWorkListExport 的核心步骤(已开 ctx),抽出以便被 withDouyinChannel 包一次 acquire。
 *  download 超时时探「当前暂无数据可导出」toast 并经 onDownloadTimeout 回传([gate-F6] 分类依据)。 */
async function runExportOnce(
  ctx: ExportCapableContext,
  args: {
    notify: (phase: DouyinExportPhase) => void;
    signal?: AbortSignal;
    downloadTimeoutMs: number;
    readFile: (path: string) => Promise<Uint8Array>;
    onDownloadTimeout: (hasNoDataToast: boolean) => void;
  },
): Promise<Uint8Array> {
  const { downloadTimeoutMs, readFile, onDownloadTimeout, notify } = args;
  args.signal?.throwIfAborted();
  {
    notify("login");
    if (!(await isLoggedInExport(ctx))) throw new DouyinNotLoggedInError();
    notify("page");
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    applyBrowserTimeoutPolicy(page);

    // 1) 强制导航旧版数据中心作品分析(TzFilm 坑:不设旧版 URL → Garfish 不加载,按钮找不到)。
    //    [T-202] 加退避重试:xlsx 导出这一步撞瞬时超时是真机 self.detail 跑不完的头号根因。
    notify("navigate");
    await gotoWithRetry(page, CREATOR_DATA_CENTER_CONTENT, {
      timeoutMs: executionTimeoutMs(60_000),
      label: "data-center-content(xlsx 导出)",
      signal:args.signal,
    });
    // 等 Garfish 微前端初始化(真机 ~15s;DATA-2 已验)。
    notify("initialize");
    await page.waitForTimeout(15_000);
    await debugShot(page, "01-after-garfish.png");

    // 2) 关首屏引导 modal(「新增直播复盘能力」)—— 盖住交互,不关点不到 tab。找不到不致命,
    //    但 modal 存在时会拦截 tab 点击(真机踩坑:未关 modal → 点投稿作品无效 → 停在直播场次 →
    //    找不到投稿列表 → 旧修复失败)。故点完再确认它消失(轮询「我知道了」不再可见)。
    notify("modal");
    if (await markAndClick(page, MODAL_GOTIT_CODES, { silent: true, timeout: executionTimeoutMs(3_000) })) {
      await page.waitForTimeout(800);
    }
    // 二次兜底:若引导 modal 仍在(多页引导 / 变体),再点一次并等其消失(最多 ~4s)。
    for (let i = 0; i < 4; i++) {
      args.signal?.throwIfAborted();
      const closeMarked = await page.evaluate(markVisibleExportModalCloseInPage, null).catch(() => 0);
      if (closeMarked) {
        try {
          await page.locator('[data-cos-export-modal-close="1"]').click({timeout: executionTimeoutMs(2_000)});
        } catch { args.signal?.throwIfAborted(); }
        await page.waitForTimeout(1_000);
        // 下一轮重新确认可见遮挡层；不能保留旧元素或假装已关闭。
        continue;
      }
      const stillThere = await page
        .evaluate(hasVisibleByCharCodesInPage, MODAL_GOTIT_CODES)
        .catch(() => false);
      if (!stillThere) break;
      await markAndClick(page, MODAL_GOTIT_CODES, { silent: true, timeout: executionTimeoutMs(2_000) });
      await page.waitForTimeout(1_000);
    }

    // 3) 切到「投稿作品」tab(真机默认落在**直播场次** tab,其导出无数据 → 永不下载,是旧超时真因)。
    //    点后**轮询等**「投稿列表」子tab 渲染出来(而非固定 sleep;真机 tab 切换 + 子视图渲染有延迟)。
    //    tab 点击可能需要重试(modal 刚关 / 渲染未稳)—— 最多试 3 轮,每轮点投稿作品 + 等子tab 出现。
    //    [T-463] 2026-07-22 真机偶发挂:窗口从 3×6s=18s 加大到 3×15s=45s(Garfish 微前端在弱网/
    //    低配机上首次渲染可能 30s+;子 tab 用 douyin-creator-pc-radio 组件而非 douyin-creator-pc-
    //    tabs-tab,渲染时序与主 tab 无关)。诊断脚本 tools/diag-douyin-page.mjs 确认 charCodes
    //    完全对得上,不是版式变化,是**慢**。
    let listVisible = false;
    let lastClickErr: string | null = null;
    for (let attempt = 0; attempt < 3 && !listVisible; attempt++) {
      // [T-463] 2026-07-22 补:silent 点击失败会返 false 无声吞掉。第 3 轮改非 silent 抛出,
      //   把点击的真实错误暴露给上层日志(而非泛泛 "未见投稿列表子tab" 空描述)。
      const isLast = attempt === 2;
      notify("posts_click");
      try {
        const ok = await markAndClick(page, TAB_POSTS_CODES, {
          silent: !isLast,
          timeout: executionTimeoutMs(8_000),
        });
        if (!ok && isLast) {
          lastClickErr = "markAndClick 返回 false(未标记到「投稿作品」元素或点不上)";
        }
      } catch (err) {
        lastClickErr = err instanceof Error ? err.message : String(err);
      }
      notify("posts_wait");
      listVisible = await waitForVisibleByCharCodes(page, SUBTAB_LIST_CODES, {
        tries: 15,
        intervalMs: 1_000,
      });
    }
    if (!listVisible) {
      await debugShot(page, "02-posts-tab-failed.png");
      const detail = lastClickErr ? `[点击错误] ${lastClickErr}` : "[点击无报错但子 tab 未渲染]";
      throw new DouyinExportError(
        `fetchDouyinWorkListExport: 切到「投稿作品」tab 后未见「投稿列表」子tab(页面未加载完 / 登录态过期 / 版式变化)—— 无法进入出 xlsx 的视图 ${detail}`,
      );
    }

    // 4) 切到「投稿列表」子tab —— 「刷新数据」+ 出 `作品列表.xlsx` 的「导出数据」只在此视图。
    notify("list_click");
    const listOk = await markAndClick(page, SUBTAB_LIST_CODES, {
      silent: true,
    });
    if (!listOk) {
      throw new DouyinExportError(
        "fetchDouyinWorkListExport: 点击「投稿列表」子tab 失败(版式变化)—— 无法进入出 xlsx 的视图",
      );
    }
    // 等投稿列表视图渲染出「导出数据」(该视图特有的导出;轮询而非固定 sleep)。
    notify("list_wait");
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
    notify("date");
    const pickerMarked = await page
      .evaluate(markDatePickerInPage, null)
      .catch(() => 0);
    if (pickerMarked) {
      let pickerOpened = false;
      try {
        await page
          .locator('[data-cos-export-target="1"]')
          .click({ timeout: executionTimeoutMs(4_000) });
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
              .click({ timeout: executionTimeoutMs(4_000) });
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
    notify("refresh");
    await markAndClick(page, BTN_REFRESH_CODES, { silent: true });
    await page.waitForTimeout(4_000);

    // 6) 先挂 download 监听再可信点「导出数据」(避免竞态漏掉快下载;可信 locator click 派发真 input
    //    事件,不被 Chromium 当脚本点击拦下载)。页面此时有多个"导出数据"(直播场次/投稿概览/投稿表现/
    //    投稿列表)—— 必须点**投稿列表视图**那个,故就近锚定「刷新数据」(仅存于投稿列表工具条)同容器的
    //    导出;锚定失败(版式变化)兜底用最深匹配的通用标记。
    notify("export_click");
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
    // 先准备按钮再计下载等待；监听覆盖点击 + 平台生成 + 调试截图与结算。
    const downloadPromise = page.waitForEvent("download", {
      timeout: downloadTimeoutMs === 0 ? 0 : completionWaitMs([
        executionTimeoutMs(5_000), downloadTimeoutMs,
        ...(process.env.DOUYIN_EXPORT_DEBUG === "1" ? [executionTimeoutMs()] : []),
      ]),
    });
    // 点击失败也可能晚到 download 拒绝；保留后续 await 的原错且及时附处理器。
    void downloadPromise.catch(() => {});
    let clicked = false;
    if (exportMarked) {
      try {
        await page
          .locator('[data-cos-export-target="1"]')
          .click({ timeout: executionTimeoutMs(5_000) });
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
    notify("download_event");
    let download: { path(): Promise<string> };
    try {
      download = await downloadPromise;
    } catch (timeoutErr) {
      args.signal?.throwIfAborted();
      const hasNoDataToast = await page
        .evaluate(hasVisibleByCharCodesInPage, TOAST_NO_DATA_CODES)
        .catch(() => false);
      onDownloadTimeout(hasNoDataToast);
      await debugShot(page, "03-download-timeout.png");
      throw timeoutErr; // 原超时错向上传(withDouyinChannel 据 mapExportErr 分类后仍抛)
    }
    notify("download_finish");
    const path = await download.path();
    args.signal?.throwIfAborted();
    notify("file_read");
    const bytes = await readFile(path);
    args.signal?.throwIfAborted();

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




/**
 * 评论粒度幂等锚 (T-065):首选 `douyin:comment:<cid>`(抖音评论接口的稳定 cid,
 * parseCommentList 已多键兜底 cid|comment_id|id 且丢弃无 cid 脏数据 —— 实际链路必有);
 * 极端退化(手工构造/未来源无 cid)用内容 hash 锚 `douyin:comment:h:<sha256-16>`
 * (source+aweme+作者+文本,同一评论重采可复现)。
 */


/**
 * 把一批评论落成 audience_signals(线 B 评论口径,SPEC §5 C-4)。
 * 流程照现有 metrics 落库范式:建 run → loop 评论 → record_key=`douyin:comment:${commentId}`
 * 经 ux_ingestion_records_run_key 去重(已写跳过)→ ingestAudienceSignal({source:"comment",
 * rawText:text, demandTag:null, ingestionRunId}) → 标记 record 已写 → completeRun。
 * **幂等**:同评论(同 commentId,同 run idempotencyKey)跑两次只写一次(record_key 去重锚)。
 * 导出为纯 ports 函数,可用 fake ports 单测,不依赖真浏览器/真 db。
 */


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
  signal?: AbortSignal;
  authDir: string;
  strictEvidence?: boolean;
  gateway?: DouyinChannelGate;
  diagnostics?: FavoritesDiagnostics;
}

export interface FetchCollectsVideosOptions {
  signal?: AbortSignal;
  authDir: string;
  /** 目标收藏夹 id(collects_id_str)。 */
  collectsId: string;
  /** 最多取几条(默认 50,防灌库)。 */
  maxItems?: number;
  strictEvidence?: boolean;
  gateway?: DouyinChannelGate;
  diagnostics?: FavoritesDiagnostics;
}

/** 收藏诊断仅允许内部关联字段；禁止放 Cookie、token、URL 或上游响应正文。 */
export interface FavoritesDiagnostics {
  requestId?: string;
  traceId?: string;
  accountId?: string;
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
    applyBrowserTimeoutPolicy(page);

  // 先落到收藏 tab 页(建立 referer/风控上下文),再页内 fetch API(T-235b 搜索同款)。
  await gotoWithRetry(page as unknown as GotoCapablePage, COLLECTS_TAB_URL, {
    timeoutMs: executionTimeoutMs(60_000),
    label,
    logRetries: false,
  });
  await page.waitForTimeout(3000); // 等页面就绪(建立会话上下文)

  // 验证码检测:body 前 300 字含「验证」→ 跳过本次采集(返 null,不硬闯;调用方记日志)。
  const bodyHead = await page
    .evaluate(() => (document.body?.innerText ?? "").slice(0, 300))
    .catch(() => "");
  if (bodyHead.includes("验证")) {
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
    } catch {
      // 原始浏览器错误可能含请求细节；跨边界只传固定哨兵。
      return { __creatorosFavoritesError: "network" };
    }
  }, url);
}

type CollectsResponseKind = "folders" | "videos";

function assertCollectsResponse(
  json: unknown,
  kind: CollectsResponseKind,
): asserts json is Record<string, unknown> {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new DouyinFavoritesInvalidResponseError(kind);
  }
  const root = json as Record<string, unknown>;
  if (root.__creatorosFavoritesError === "network") {
    throw new DouyinFavoritesNetworkError();
  }
  // status_code 必须由上游显式给出 number；缺失、字符串 "0"、NaN 都是未知证据。
  if (
    typeof root.status_code !== "number" ||
    !Number.isInteger(root.status_code)
  ) {
    throw new DouyinFavoritesInvalidResponseError("status_code");
  }
  if (root.status_code !== 0) {
    const statusMessage =
      typeof root.status_msg === "string" ? root.status_msg : "";
    if (
      root.status_code === 8 ||
      /未登录|登录.*失效|session.*expired/i.test(statusMessage)
    ) {
      throw new DouyinFavoritesSessionExpiredError(root.status_code);
    }
    if (/验证|验证码|captcha/i.test(statusMessage)) {
      throw new DouyinFavoritesCaptchaError();
    }
    throw new DouyinFavoritesUpstreamError(root.status_code);
  }
  const listKey = kind === "folders" ? "collects_list" : "aweme_list";
  if (!Array.isArray(root[listKey])) {
    throw new DouyinFavoritesInvalidResponseError(kind);
  }
}

function isFavoritesBrowserLocked(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  if (code === "EBUSY" || code === "EACCES") return true;
  const message =
    error instanceof Error ? `${error.name}:${error.message}` : "";
  return /SingletonLock|profile.*(?:in use|locked)|browser.*lock|正在被占用/i.test(
    message,
  );
}

function isFavoritesNetworkFailure(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  if (
    typeof code === "string" &&
    ["ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "ETIMEDOUT"].includes(code)
  ) {
    return true;
  }
  const message =
    error instanceof Error ? `${error.name}:${error.message}` : "";
  return /TimeoutError|fetch failed|network|ERR_(?:CONNECTION|NETWORK)/i.test(
    message,
  );
}

function normalizeFavoritesError(error: unknown): Error {
  const canonical = rehydrateDouyinFavoritesError(error);
  if (canonical) return canonical;
  if (isFavoritesBrowserLocked(error)) {
    return new DouyinFavoritesBrowserLockedError();
  }
  if (isFavoritesNetworkFailure(error)) {
    return new DouyinFavoritesNetworkError();
  }
  // 未识别异常仍保留既有错误，让 dispatch 走通用错误；已知收藏错因绝不降级。
  return error instanceof Error ? error : new Error("Favorites service failed");
}

function logFavoritesFailure(
  diagnostics: FavoritesDiagnostics | undefined,
  error: Error,
): void {
  const safeName = new Set([
    "DouyinFavoritesSessionExpiredError",
    "DouyinFavoritesBrowserLockedError",
    "DouyinFavoritesCaptchaError",
    "DouyinFavoritesNetworkError",
    "DouyinFavoritesUpstreamError",
    "DouyinFavoritesInvalidResponseError",
  ]).has(error.name)
    ? error.name
    : "Error";
  console.warn(
    "[favorites] request_failed",
    JSON.stringify({
      code: (error as { code?: unknown }).code ?? "UnexpectedError",
      name: safeName,
      requestId: diagnostics?.requestId ?? null,
      traceId: diagnostics?.traceId ?? null,
      accountId: diagnostics?.accountId ?? null,
    }),
  );
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
  opts.signal?.throwIfAborted();
  const gateway = opts.gateway ?? instantNoopGateway;
  const openCtx =
    deps.openContext ??
    ((authDir: string, headless: boolean) =>
      openContext(authDir, headless) as unknown as Promise<SearchCapableContext>);
  let ctx: SearchCapableContext | null = null;
  let lifetime: ReturnType<typeof bindAbortContext> | undefined;
  try {
    ctx = await openCtx(opts.authDir, true);
    const owned = ctx;
    lifetime = bindAbortContext(opts.signal, () => owned.close());
    opts.signal?.throwIfAborted();
    const page = await openCollectsPage(ctx, "收藏夹列表");
    if (!page) {
      if (opts.strictEvidence) throw new DouyinFavoritesCaptchaError();
      return [];
    }

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
      assertCollectsResponse(json, "folders");
      const parsedFolders = parseCollectsList(json);
      if (
        (json.collects_list as unknown[]).length > 0 &&
        parsedFolders.length === 0
      ) {
        throw new DouyinFavoritesInvalidResponseError("folders");
      }
      for (const f of parsedFolders) byId.set(f.collectsId, f);
      if (!collectsHasMore(json)) break;
      const next = collectsNextCursor(json);
      if (next < 0 || next === cursor) break; // cursor 不前进兜底,防死循环
      cursor = next;
    }
    const folders = [...byId.values()];
    return folders;
  } catch (error) {
    const normalized = normalizeFavoritesError(error);
    logFavoritesFailure(opts.diagnostics, normalized);
    throw normalized;
  } finally {
    await lifetime?.close().catch(() => {}); // 关我们自起的 Chromium
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
  opts.signal?.throwIfAborted();
  const gateway = opts.gateway ?? instantNoopGateway;
  const maxItems = opts.maxItems ?? 50;
  const openCtx =
    deps.openContext ??
    ((authDir: string, headless: boolean) =>
      openContext(authDir, headless) as unknown as Promise<SearchCapableContext>);
  let ctx: SearchCapableContext | null = null;
  let lifetime: ReturnType<typeof bindAbortContext> | undefined;
  try {
    ctx = await openCtx(opts.authDir, true);
    const owned = ctx;
    lifetime = bindAbortContext(opts.signal, () => owned.close());
    opts.signal?.throwIfAborted();
    const page = await openCollectsPage(ctx, `收藏夹视频(${opts.collectsId})`);
    if (!page) {
      if (opts.strictEvidence) throw new DouyinFavoritesCaptchaError();
      return [];
    }

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
      assertCollectsResponse(json, "videos");
      const parsedVideos = parseCollectsVideoList(json);
      if (
        (json.aweme_list as unknown[]).length > 0 &&
        parsedVideos.length === 0
      ) {
        throw new DouyinFavoritesInvalidResponseError("videos");
      }
      for (const v of parsedVideos) {
        if (byId.size >= maxItems) break; // maxItems 截断(防灌库)
        byId.set(v.awemeId, v);
      }
      if (!collectsHasMore(json)) break;
      const next = collectsNextCursor(json);
      if (next < 0 || next === cursor) break; // cursor 不前进兜底,防死循环
      cursor = next;
    }
    const videos = [...byId.values()];
    return videos;
  } catch (error) {
    const normalized = normalizeFavoritesError(error);
    logFavoritesFailure(opts.diagnostics, normalized);
    throw normalized;
  } finally {
    await lifetime?.close().catch(() => {}); // 关我们自起的 Chromium
  }
}

/** T-954:独立流量明细读取，复用账号profile和限速；任何退出都释放浏览器。 */
export async function fetchDouyinTraffic(opts:{authDir:string;awemeId:string;signal?:AbortSignal;gateway?:DouyinChannelGate}){
 opts.signal?.throwIfAborted();
 const ctx=await openContext(opts.authDir,true,opts.signal),lifetime=bindAbortContext(opts.signal,()=>ctx.close());
 try{
  if(!await isLoggedIn(ctx))throw new DouyinNotLoggedInError();
  const page=ctx.pages()[0]??await ctx.newPage();
  const {readDouyinTrafficPage}=await import('./douyin-traffic');
  return await withDouyinChannel(opts.gateway??instantNoopGateway,'creator-center',()=>readDouyinTrafficPage(page,opts.awemeId,opts.signal),error=>({kind:error instanceof Error&&error.name==='DouyinTrafficUnavailableError'?'ok':'net-timeout',consecutiveTimeouts:1}),opts.signal);
 }finally{await lifetime.close();}
}
