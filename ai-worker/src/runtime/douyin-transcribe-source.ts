import {executionTimeoutMs} from "@creatoros/contract/timeout-policy";
/** 转写取流的纯解析和匿名请求由 Worker 持有；登录浏览器仍通过窄端口注入。 */
export type DouyinSourceFailure = { kind: "empty-item-list" | "router-data-missing" } | { kind: "net-timeout"; consecutiveTimeouts: number };
export type DouyinSourceChannel = (run: () => Promise<DouyinVideoUrl>, mapError: (error: unknown) => DouyinSourceFailure, signal?: AbortSignal) => Promise<DouyinVideoUrl>;

// 手机 UA —— iesdouyin 分享页仅对移动端 UA 返回带 _ROUTER_DATA 的 HTML(对齐 skill PAGE_HEADERS)。
const DY_MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
  "EdgiOS/121.0.2277.107 Version/17.0 Mobile/15E148 Safari/604.1";

// ffmpeg 从直链抽音需带 Referer(抖音 CDN 校验来源),否则 403。对齐 skill DL_HEADERS。

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
 * 抖音详情偶尔把完整 CDN URL 错装进 `aweme/v1/play?video_id=`。若原样交给
 * ffmpeg，源站会把整个 URL 当视频 id 并返回不可解媒体。这里在进入抽音链前统一解包；
 * 普通播放地址保持原值，只继续既有 playwm → play 兼容。
 */
export function normalizeDouyinPlaybackUrl(rawUrl: string): string {
  let candidate = rawUrl.trim();
  try {
    const parsed = new URL(candidate);
    if (
      parsed.hostname === "aweme.snssdk.com" &&
      parsed.pathname.includes("/aweme/v1/play")
    ) {
      const nested = parsed.searchParams.get("video_id")?.trim() ?? "";
      if (/^https?:\/\//i.test(nested)) candidate = nested;
    }
  } catch {
    // 既有解析器会在上游保证非空；无法构造 URL 时保留原串，让 ffmpeg 的真实错误继续回显。
  }
  return candidate.replace("playwm", "play");
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
  // 去水印 + 兼容错误嵌套的完整 CDN URL。
  const playUrl = normalizeDouyinPlaybackUrl(rawUrl);

  const cover = (video.cover ?? {}) as Record<string, unknown>;
  const coverList = Array.isArray(cover.url_list) ? cover.url_list : [];
  const coverUrl =
    typeof coverList[0] === "string" ? coverList[0] : undefined;

  return coverUrl ? { playUrl, coverUrl } : { playUrl };
}

/** fetchDouyinVideoUrl 的可注入依赖(默认真全局 fetch;单测注 fake,不走网络)。 */
export interface FetchDouyinVideoUrlDeps {
  signal?: AbortSignal;
  fetch: typeof fetch;
  // T-038b [gate-F7 插装点①]:iesdouyin channel 限流网关(无 cookie,封 IP,minInterval 9s)。
  // 未注入时直接执行；生产宿主接既有共享网关。
  channel?: DouyinSourceChannel;
}

const REAL_FETCH_DEPS: FetchDouyinVideoUrlDeps = {
  fetch: (...args) => fetch(...args),
};

// iesdouyin 取直链的错误 → classify 输入映射(T-038b):
//   - 无 _ROUTER_DATA / JSON 解析失败(parseDouyinVideoUrl 抛的两条,风控残页)→ router-data-missing(throttled)。
//   - item_list 空(图集/已删除,内容性质)→ empty-item-list(content-error 不退避)。
//   - 其余(网络失败 / HTTP 非 2xx / ffmpeg 等)→ net-timeout 单次(保守,单次不 cooldown)。
function mapIesdouyinErr(err: unknown): DouyinSourceFailure {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  // `item_list 为空` 的完整错误文案也包含 `_ROUTER_DATA`。必须先判内容问题，
  // 否则隐藏/下架/图集作品会被误判成风控，给整个共享通道加 2 分钟指数冷却，
  // 连带阻塞用户手动发起的逐字稿提取。
  if (raw.includes("item_list 为空")) return { kind: "empty-item-list" };
  if (raw.includes("_ROUTER_DATA")) return { kind: "router-data-missing" };
  return { kind: "net-timeout", consecutiveTimeouts: 1 };
}

/**
 * GET iesdouyin 分享页(手机 UA)→ parseDouyinVideoUrl 抽无水印直链。fetch 可注入(默认真
 * 全局 fetch),故 D2 runner 里这层由 host 装配真 fetch,单测注 fake(返 canned HTML)。
 * 非 2xx / 无 _ROUTER_DATA → 抛 DouyinAudioFetchError(runner 标该 aweme 失败,其余继续)。
 *
 * [Bug-4 T-017] **120s 超时**(AbortSignal.timeout):iesdouyin 偶发半开连接 / IP 静默风控 /
 * 服务器不返响应,裸 await 永不 resolve → runner 卡死(封面回填看到「5/73」即此) →
 * 整批僵在某条作品等永远。30s 远超正常 (~1-3s) 但不至于让一个坏作品卡整批。
 * 超时触发 → fetch reject AbortError → 下面 try/catch 把它当失败归一,网关报 net-timeout,
 * runner 增 failed 计数继续下一条(已存在的兜底链路)。
 */
const IESDOUYIN_FETCH_TIMEOUT_MS = 120_000;

export async function fetchDouyinVideoUrl(
  awemeId: string,
  deps: FetchDouyinVideoUrlDeps = REAL_FETCH_DEPS,
): Promise<DouyinVideoUrl> {
  deps.signal?.throwIfAborted();
  const channel: DouyinSourceChannel = deps.channel ?? ((run) => run());
  // [gate-F7 插装点①] iesdouyin channel:acquire→取直链→report(classify)。报告后仍抛原错。
  return channel(
    async () => {
      deps.signal?.throwIfAborted();
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
          signal: deps.signal ? AbortSignal.any([deps.signal, AbortSignal.timeout(executionTimeoutMs(IESDOUYIN_FETCH_TIMEOUT_MS))]) : AbortSignal.timeout(executionTimeoutMs(IESDOUYIN_FETCH_TIMEOUT_MS)),
        });
      } catch (err) {
        deps.signal?.throwIfAborted();
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
      deps.signal?.throwIfAborted();
      return parseDouyinVideoUrl(html);
    },
    mapIesdouyinErr,
    deps.signal,
  );
}

export type DouyinVideoSource =
  | ({ kind?: "video" } & DouyinVideoUrl)
  | { kind: "image-album" };

const AWEME_TYPE_IMAGE_ALBUM = 68;
// SEMANTIC_BOUNDARY_ALLOW: 仅兼容协议数值格式，不进行内容或创作选择。
function numericAwemeType(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const number = Number(value.replace(/[,\s]/g, ""));
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

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
  if (numericAwemeType(d.aweme_type) === AWEME_TYPE_IMAGE_ALBUM) return { kind: "image-album" };
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
  const playUrl = normalizeDouyinPlaybackUrl(rawUrl);
  const cover = (video.cover ?? {}) as Record<string, unknown>;
  const coverList = Array.isArray(cover.url_list) ? cover.url_list : [];
  const coverUrl = typeof coverList[0] === "string" ? coverList[0] : undefined;
  return coverUrl
    ? { kind: "video", playUrl, coverUrl }
    : { kind: "video", playUrl };
}

export interface FetchVideoUrlViaDetailOptions<Gate = unknown> {
  signal?: AbortSignal;
  awemeId: string;
  /** 按号登录态目录(.auth/douyin/<accountId>);detail 接口页内 fetch 借它的 cookie。 */
  authDir: string;
  gateway?: Gate;
}

/** 匿名请求默认由 Worker 执行；登录详情需要宿主明确注入。 */
export interface FetchVideoSourceDeps<Gate = unknown> {
  channel?: DouyinSourceChannel;
  /** 首选:iesdouyin 匿名分享页(无 cookie,快)。默认 fetchDouyinVideoUrl。 */
  fetchIesdouyin?: (awemeId: string) => Promise<DouyinVideoUrl>;
  /** 回落:宿主持有登录浏览器的 detail 接口；此端口不代表浏览器寿命已迁入 Worker。 */
  fetchViaDetail: (
    opts: FetchVideoUrlViaDetailOptions<Gate>,
  ) => Promise<DouyinVideoSource>;
}

export interface FetchVideoSourceOptions<Gate = unknown> {
  signal?: AbortSignal;
  awemeId: string;
  /** 登录态目录(回落路径用;iesdouyin 匿名路径不需要)。 */
  authDir: string;
  /** iesdouyin 匿名 channel 的限流网关(首选路径)。 */
  gateway?: Gate;
  /** 固定日志域：共享兜底能力被逐字稿与封面回填复用，但日志必须说清真实调用方。 */
  purpose?: "transcribe" | "cover";
}

/**
 * [T-243] 组合取流入口(transcribe-runner 的 fetchVideoUrl 端口绑它):
 *   ① fetchDouyinVideoUrl(iesdouyin 匿名,快)——成功 → { kind:"video", ... }。
 *   ② 解析类失败(消息含 parseDouyinVideoUrl:item_list 空 / _ROUTER_DATA 缺失 / JSON 解析失败 /
 *      无播放地址 —— 页面拿到了但解出不来,重试同路无意义)→ 回落登录态 detail 路径。
 *   网络/HTTP 类失败(请求 iesdouyin 失败 / 非 2xx)不回落 —— 那是瞬时/风控问题,回落只会
 *   双倍撞风控;交给现有 gateway 退避语义。
 */
export async function fetchDouyinVideoSource<Gate = unknown>(
  opts: FetchVideoSourceOptions<Gate>,
  deps: FetchVideoSourceDeps<Gate>,
): Promise<DouyinVideoSource> {
  opts.signal?.throwIfAborted();
  const fetchIesdouyin =
    deps.fetchIesdouyin ??
    ((awemeId: string) =>
      fetchDouyinVideoUrl(awemeId, {
        fetch: (...args) => fetch(...args),
        signal: opts.signal,
        channel: deps.channel,
      }));
  const fetchViaDetail = deps.fetchViaDetail;

  try {
    const url = await fetchIesdouyin(opts.awemeId);
    opts.signal?.throwIfAborted();
    return { kind: "video", ...url };
  } catch (err) {
    opts.signal?.throwIfAborted();
    const msg = err instanceof Error ? err.message : String(err ?? "");
    const parseFailed =
      err instanceof DouyinAudioFetchError && msg.includes("parseDouyinVideoUrl");
    if (!parseFailed) throw err;
    const logScope = opts.purpose === "cover" ? "douyin-cover-backfill" : "transcribe";
    console.log(
      `[${logScope}] aweme ${opts.awemeId} iesdouyin 解析失败,回落登录态 detail 路径:${msg}`,
    );
    return fetchViaDetail({
      awemeId: opts.awemeId,
      authDir: opts.authDir,
      gateway: opts.gateway,
      signal: opts.signal,
    });
  }
}

