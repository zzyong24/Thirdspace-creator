import type { MetricRecord } from "../../modules/ingestion";

// 创作者后台「作品列表」明细导出解析 + 映射(T-030-D8a,SPEC §9b/§10)。
//
// 逻辑移植自 TzFilm-Douyin-Tool `douyin/step2_save_to_db.py:parse_xlsx()`(已跑通,但那边
// 走 AppleScript + 用户真 Chrome + openpyxl;我们只移植**字段映射 / 容错匹配 / 数值归一**这套
// 纯逻辑,运行时用 exceljs + Playwright 无头链路,见 douyin-cdp.ts `fetchDouyinWorkListExport`)。
//
// 分层:① parseDouyinWorkListXlsx —— 纯解析(不碰浏览器 / 不碰网络),喂 xlsx bytes 出 16 字段
//        结构化明细,**可单测**(测试用 exceljs 现构含中文表头 + 数据行的 buffer 喂进去);
//       ② toDetailMetricRecords —— 把明细映射进现有指标 ingest 路径(rawMetrics),供复盘核心
//        指标 / 漏斗读真值(不再 0/fixture)。明细导出**无 aweme_id 维度**(是全量列表),故落库
//        侧按 title/pub_date 匹配作品的 publication(见 persistence-client 装配,匹配不上跳过)。

// ---------------------------------------------------------------------------
// 结构化明细(16 字段) —— 与 TzFilm parse_xlsx 输出同构
// ---------------------------------------------------------------------------

/** 一条作品的后台明细(16 字段)。数值已归一:百分数→0-100,时长→秒,计数→整数。 */
export interface DouyinWorkDetail {
  /** 作品名称(标题)。 */
  title: string;
  /** 发布时间(原样保留导出字符串,如 "2026-06-21 08:15" —— 落库侧据此 + title 匹配作品)。 */
  pubDate: string;
  /** 体裁(视频总时长分档:1min-视频 / 1-3min视频 / 图文 等;归一去空白)。 */
  genre: string;
  /** 审核状态(如 "已通过" / "仅自己可见";落库不删,消费侧过滤)。 */
  status: string;
  /** 播放量。 */
  plays: number;
  /** 完播率(0-100 百分数)。 */
  finishRate: number;
  /** 5s 完播率(0-100 百分数)。 */
  finish5sRate: number;
  /** 封面点击率(0-100 百分数)。 */
  /** 封面点击率(0-100 百分数);**null = 抖音无数据**(区别于真 0,复盘卡显「暂无」不显 0.0%)。 */
  coverCtr: number | null;
  /** 2s 跳出率(0-100 百分数)。 */
  bounce2sRate: number;
  /** 平均播放时长(秒,保留 1 位小数)。 */
  avgDurationSec: number;
  /** 点赞量。 */
  likes: number;
  /** 分享量。 */
  shares: number;
  /** 评论量。 */
  comments: number;
  /** 收藏量。 */
  favorites: number;
  /** 主页访问量。 */
  profileVisits: number;
  /** 粉丝增量(涨粉)。 */
  followerGain: number;
}

// ---------------------------------------------------------------------------
// 数值归一 helper(移植 TzFilm safe_float / safe_int / as_pct 语义)
// ---------------------------------------------------------------------------

/** 单元格 → float:清掉 %、逗号、空白;`-`/空/None → 缺省。 */
function safeFloat(v: unknown, def = 0): number {
  if (v === null || v === undefined) return def;
  if (typeof v === "number") return Number.isFinite(v) ? v : def;
  const s = String(v).trim();
  if (s === "" || s === "-" || s === "None" || s === "null") return def;
  const n = Number(s.replace(/%/g, "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : def;
}

/** 单元格 → int(截断小数)。 */
function safeInt(v: unknown, def = 0): number {
  return Math.trunc(safeFloat(v, def));
}

/**
 * 百分比字段归一到 0-100(移植 TzFilm as_pct):导出里有时是 0.05、有时是 5,统一转百分数。
 * v<1 视为小数(乘 100);否则视为已是百分数(原样,保留 2 位)。
 */
function asPct(v: unknown): number {
  const n = safeFloat(v);
  return n < 1 ? Math.round(n * 10000) / 100 : Math.round(n * 100) / 100;
}

/**
 * [T-403] 「率」列(封面点击率等)专用:区分**无数据**与**真 0**,并修 asPct 的边界 bug。
 *
 * 真机 xlsx 实证(2026-07-18 用户导出的 `作品列表.xlsx`):封面点击率列取值有 `"-"`(抖音无
 * 数据,8/29 条)、`"0.000000"`(真 0)、`"1"`(=100%)、`"0.592233"`(=59.22%)。两个 bug:
 *   ① asPct 把 `"-"` 经 safeFloat 归 0 → 与真 0 混同 → UI 全显「0.0%」(用户那条 44244 播放
 *      作品即 `"-"`,被误显 0.0%);
 *   ② asPct 的 `n≥1 原样` 分支把 `"1"`(=100% 小数)错当「1%」——该列恒是 0–1 小数,应恒 ×100。
 * 修:`"-"`/空/非数值 → `null`(无数据,落库侧不带该键 → 复盘卡显「暂无·待采集」而非 0.0%);
 *   数值一律按 0–1 小数 ×100(>1 容错视为已是百分数,几乎不出现)。
 */
function asRatePct(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "" || s === "-" || s === "—" || s === "None" || s === "null") {
    return null;
  }
  const n = Number(s.replace(/%/g, "").replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return null;
  return Math.round((n <= 1 ? n * 100 : n) * 100) / 100;
}

/** 单元格 → 去空白/换行的字符串(标题/体裁/状态用)。 */
function cellStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

// ---------------------------------------------------------------------------
// 中文表头容错匹配(移植 TzFilm `col(keywords)`) —— 应对列序变化 / 表头微调
// ---------------------------------------------------------------------------

/**
 * 在表头里按关键词**模糊子串**匹配列下标(依次尝试每个关键词,任一命中即返回该列)。
 * 仿 TzFilm parse_xlsx 的 `col([...])`:列序变化 / 表头带后缀("播放量(次)")仍能命中。
 * 未命中返回 -1(调用方决定用缺省列或记 0)。
 */
function findCol(headers: readonly string[], keywords: readonly string[]): number {
  for (const kw of keywords) {
    for (let i = 0; i < headers.length; i++) {
      if (headers[i]!.includes(kw)) return i;
    }
  }
  return -1;
}

/** 按列下标取单元格(下标 -1 或越界 → undefined)。 */
function at(row: readonly unknown[], idx: number): unknown {
  return idx >= 0 && idx < row.length ? row[idx] : undefined;
}

// ---------------------------------------------------------------------------
// ① 解析 xlsx bytes → DouyinWorkDetail[](纯,可单测)
// ---------------------------------------------------------------------------

/** parseDouyinWorkListXlsx 的可注入依赖(默认真 exceljs;单测直接用真 exceljs 现构 buffer)。 */

/**
 * 解析创作者后台「作品列表.xlsx」bytes → 结构化明细(16 字段)。**纯函数**(输入定则输出定,
 * 唯一 IO 是 exceljs 读内存 buffer,可注入)。逻辑忠实移植 TzFilm parse_xlsx:
 *   - 第一行为表头,按**中文关键词容错匹配**列下标(列序变化 / 表头带后缀仍命中);
 *   - 百分数(完播/5s完播/封面CTR/2s跳出)→ asPct 归一 0-100;
 *   - 平均播放时长 → 秒(保留 1 位);计数(播放/点赞/分享/评论/收藏/主页访问/粉丝增量)→ int;
 *   - 空行(整行皆空)跳过。
 * 空文件 / 无表头 → 返回 []。
 */

/** exceljs 单元格值归一:富文本 / 超链接对象 → 纯文本;其余原样。 */
export function normalizeCell(v: unknown): unknown {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return o.richText
        .map((seg) => (seg && typeof seg === "object" ? String((seg as Record<string, unknown>).text ?? "") : ""))
        .join("");
    }
    if (typeof o.text === "string") return o.text;
    if (o.result !== undefined) return o.result; // 公式单元格取计算结果
    if (o.hyperlink !== undefined && typeof o.text === "string") return o.text;
  }
  return v;
}

/** 取第一个非负下标;都负则返回 fallback(容错匹配未命中时的缺省列)。 */
function firstNonNeg(idx: number, fallback: number): number {
  return idx >= 0 ? idx : fallback;
}

// ---------------------------------------------------------------------------
// ①b 可见性判定(T-073)—— 明细「审核状态」列 → 平台侧可见性
// ---------------------------------------------------------------------------

/**
 * 从明细「审核状态」列判定作品在抖音端的可见性(纯函数,可单测):
 *   - "hidden":状态含 仅自己可见 / 仅我可见 / 已隐藏 / 私密(平台侧不对外展示);
 *   - "visible":状态为「已通过」(审核通过 = 公开可见);
 *   - "unknown":其余(审核中 / 未通过 / 空串等)—— 诚实不判定,消费侧不动既有标记。
 * 落库侧据此同步 publication.hidden_at + project.platform_ref.hidden(见
 * persistence-client self.detail);列表读侧默认过滤 hidden,可切「显示已隐藏」。
 */
export type DetailVisibility = "hidden" | "visible" | "unknown";

// [T-206] 真机诊断实证:抖音明细 xlsx「审核状态」列实际字面量是 **"公开" / "自见"**(不是早先
//   假设的「已通过」/「仅自己可见」)。不补齐 → 75 条全判 unknown、隐藏一个不标、列表过滤空转。
//   「自见」= 仅自己可见(平台侧不对外 = hidden);「公开」= 对外可见(= visible)。旧字面量保留兼容。
const HIDDEN_STATUS_HINTS = [
  "仅自己可见",
  "仅我可见",
  "自见", // [T-206] 抖音明细列实际短写 = 仅自己可见
  "已隐藏",
  "私密",
] as const;
const VISIBLE_STATUS_HINTS = ["已通过", "公开"] as const; // [T-206] 「公开」= 抖音明细列实际值

export function visibilityFromDetailStatus(status: string): DetailVisibility {
  const s = (status ?? "").trim();
  if (!s) return "unknown";
  if (HIDDEN_STATUS_HINTS.some((h) => s.includes(h))) return "hidden";
  if (VISIBLE_STATUS_HINTS.some((h) => s.includes(h))) return "visible";
  return "unknown";
}

// ---------------------------------------------------------------------------
// ② 映射 DouyinWorkDetail[] → MetricRecord[](喂复盘,SPEC §10)
// ---------------------------------------------------------------------------

/**
 * 一条明细 → rawMetrics 键位(与现有 canonical seed / 复盘 view-model 读侧对齐):
 *   plays / ctr / finish_rate / avg_duration_sec / likes / comments / shares /
 *   favorites / follower_gain —— **复盘核心指标(完播率/封面CTR)从 0/fixture 变真**;
 *   外加明细独有键(5s完播 / 2s跳出 / 主页访问)承载 D8a 新字段,供漏斗 / 后续消费。
 * 注:复盘 view-model 读「封面点击率」用的键是 `ctr`(见 analytics-review-view-model.ts),
 *   故 coverCtr 映射到 `ctr`(而非 cover_ctr),这样复盘卡即刻显真值。
 * [T-329] 补 `genre`(体裁,字符串,如 "1-3min视频"/"图文")——此前明细 16 列唯一
 *   没进 rawMetrics 的字段;仅在非空时带上(空串不落假键)。复盘「热门作品发布列表」
 *   行内展示体裁(不做指标卡)。
 */
export function detailToRawMetrics(
  d: DouyinWorkDetail,
): Record<string, number | string> {
  return {
    plays: d.plays,
    // [T-403] 封面点击率 → 复盘读侧键 `ctr`。**null(抖音无数据)时不落该键** —— 复盘 view-model
    //   按「携带帧数 n」聚合,无帧携带 ctr → 卡显「暂无·待采集」,不再把无数据误显 0.0%。
    ...(d.coverCtr !== null ? { ctr: d.coverCtr } : {}),
    finish_rate: d.finishRate, // 完播率 → 复盘读侧键 `finish_rate`
    avg_duration_sec: d.avgDurationSec,
    likes: d.likes,
    comments: d.comments,
    shares: d.shares,
    favorites: d.favorites,
    follower_gain: d.followerGain,
    // 明细独有(复盘漏斗 / 后续消费;当前 view-model 未读也无害,是承载不是渲染)。
    finish_5s_rate: d.finish5sRate,
    bounce_2s_rate: d.bounce2sRate,
    profile_visits: d.profileVisits,
    // [T-329] 体裁(字符串键;空串不带,诚实不落空键)。
    ...(d.genre ? { genre: d.genre } : {}),
  };
}

/**
 * 一次作品匹配结果:把 DouyinWorkDetail 绑到一个真实 publication(按 title/pub_date)。
 * publicationId=null 表示没匹配上(未导入/未发布)——落库侧诚实跳过(不硬造 publication)。
 */
export interface DetailMatch {
  detail: DouyinWorkDetail;
  publicationId: string | null;
}

/** 落库侧需要的作品目录项(persistence-client 从 publishing.listPublicationsForUser 装配)。 */
export interface PublicationCatalogEntry {
  id: string;
  platform: string;
  title: string;
  /** 发布时刻 ISO/UTC(可空;与明细 pubDate 比较时先转北京时间 —— xlsx 的发布时间是北京时间,
   *  北京 0-8 点发布的作品 UTC 日期是前一天,直接比 UTC 日会 miss,T-036 真机踩过 6 例)。 */
  publishedAt?: string | null;
  /** aweme_id(imported 采集轨有;fixture/演示 pub 无)。同名同刻多候选时优先有它的轨 ——
   *  落库锚就是 externalId,匹到无它的轨整条明细会被 toDetailMetricRecords 丢弃(T-036)。 */
  externalId?: string | null;
}

/** title 归一:去空白、去首尾引号 —— 导出标题可能带装饰,匹配时放宽。 */
function normTitle(s: string): string {
  return s.replace(/\s+/g, "").trim();
}

/**
 * 「作品名称」归一(比 normTitle 更宽) —— 应对抖音后台 xlsx 的截断/首行口径:
 *   - 只取**首行**(caption 是多行时,后台「作品名称」列常只落第一行);
 *   - 去掉尾部省略号(截断标记 "…" / "..." / 全角 "。。。");
 *   - 再走 normTitle 去空白。
 * 我们导入的作品 title 是**完整 desc**(多行),而 xlsx「作品名称」是 desc 首行(可能被截),
 * 故精确匹配失败时用「首行+去省略号」再比一次(prefix 双向兜底见 matchDetailsToPublications)。
 */
function normTitleFirstLine(s: string): string {
  const firstLine = s.split(/[\r\n]/)[0] ?? s;
  const noEllipsis = firstLine.replace(/(\.{3}|…+|。{3,})\s*$/u, "");
  return normTitle(noEllipsis);
}

/** pubDate 归一到 YYYY-MM-DD(明细 "2026-06-21 08:15" 直接取日期前缀 —— xlsx 已是北京时间)。 */
function normDay(s: string | null | undefined): string {
  if (!s) return "";
  const m = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (!m) return "";
  const y = m[1]!;
  const mo = m[2]!.padStart(2, "0");
  const d = m[3]!.padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

// 北京时区偏移(抖音后台 xlsx 的发布时间是北京时间;publishedAt 存的是 UTC ISO)。
const CN_OFFSET_MS = 8 * 3_600_000;

/** publishedAt(ISO/UTC)→ 北京日 YYYY-MM-DD。非 ISO(解析失败)回退 normDay 正则(容错)。 */
function cnDayFromIso(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return normDay(iso);
  return new Date(t + CN_OFFSET_MS).toISOString().slice(0, 10);
}

/** publishedAt(ISO/UTC)→ 北京时刻 HH:mm:ss(同题同日多发的最后消歧维度)。 */
function cnClockFromIso(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t + CN_OFFSET_MS).toISOString().slice(11, 19);
}

/** 明细 pubDate("2026-04-19 16:47:38" / "…16:47")→ HH:mm:ss(缺秒补 00;无时刻返 "")。 */
function clockFromDetail(pubDate: string | null | undefined): string {
  if (!pubDate) return "";
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(pubDate);
  if (!m) return "";
  return `${m[1]!.padStart(2, "0")}:${m[2]!}:${m[3] ?? "00"}`;
}

// xlsx「作品名称」的无标题字面值(desc 为空的作品) + catalog 占位标题(auto-fill 前的
// 「抖音作品 {aweme_id}」)—— 两侧都无真标题可比,走无题池按日+时刻锚定(T-036)。
const UNTITLED_TITLE = "无标题";
function isPlaceholderTitle(title: string): boolean {
  const n = normTitle(title);
  return n === UNTITLED_TITLE || /^抖音作品\d+$/.test(n);
}

/**
 * 多候选消歧(T-036 重构):北京日同日收窄 → 北京时刻(HH:mm:ss)精确消歧(同题同日多发,
 * 真机「Hermes似乎真是个半成品!」4-19 发两遍)→ 仍多义(双轨 fixture+imported published_at
 * 完全相同)时优先有 externalId 的轨(匹到无 externalId 的轨,明细会被落库丢弃)→ 还分不出
 * 就诚实 null。单候选直接命中(信 title,不苛求日期)。
 */
function disambiguate(
  pool: readonly PublicationCatalogEntry[],
  detail: DouyinWorkDetail,
): string | null {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0]!.id;
  const day = normDay(detail.pubDate);
  if (!day) return null;
  let p = pool.filter((c) => cnDayFromIso(c.publishedAt) === day);
  if (p.length === 0) return null;
  if (p.length === 1) return p[0]!.id;
  const clock = clockFromDetail(detail.pubDate);
  if (clock) {
    const hits = p.filter((c) => cnClockFromIso(c.publishedAt) === clock);
    if (hits.length > 0) p = hits;
  }
  if (p.length === 1) return p[0]!.id;
  const withExt = p.filter((c) => c.externalId);
  if (withExt.length === 1) return withExt[0]!.id;
  return null;
}

/**
 * 按 title(+ 可选 pub_date 同日)把明细匹配到 publication。**无 aweme_id 维度**(导出是全量
 * 列表),故:先按归一 title 精确匹配 douyin 作品;若同 title 多条,再用 pub_date 同日消歧;
 * 仍无匹配 → publicationId=null(落库侧跳过,诚实,不硬造)。纯函数,可单测。
 */
export function matchDetailsToPublications(
  details: readonly DouyinWorkDetail[],
  catalog: readonly PublicationCatalogEntry[],
): DetailMatch[] {
  // 只在 douyin 平台作品里匹配(明细来自抖音后台)。
  const dyPubs = catalog.filter((p) => p.platform === "douyin");
  // title → 候选 publications(同名可能多条,留待 pub_date 消歧)。第一层:完整归一 title。
  const byTitle = new Map<string, PublicationCatalogEntry[]>();
  // 第二层:「首行 + 去省略号」归一(应对 xlsx「作品名称」只落 caption 首行/被截断的口径)。
  const byFirstLine = new Map<string, PublicationCatalogEntry[]>();
  for (const p of dyPubs) {
    const key = normTitle(p.title);
    if (key) {
      const arr = byTitle.get(key) ?? [];
      arr.push(p);
      byTitle.set(key, arr);
    }
    const flKey = normTitleFirstLine(p.title);
    if (flKey) {
      const arr = byFirstLine.get(flKey) ?? [];
      arr.push(p);
      byFirstLine.set(flKey, arr);
    }
  }

  return details.map((detail): DetailMatch => {
    // ⓪ [T-036] 「无标题」行(desc 为空的作品):与 catalog 占位标题(「抖音作品 {id}」)两侧都
    //    无真标题可比 → 在无题池里按北京日+时刻唯一锚定(真机 5 例全是这种)。
    if (normTitle(detail.title) === UNTITLED_TITLE) {
      const pool = dyPubs.filter((p) => isPlaceholderTitle(p.title));
      return { detail, publicationId: disambiguate(pool, detail) };
    }
    // ① 完整归一 title 精确匹配(最强,原行为)。
    const exact = disambiguate(byTitle.get(normTitle(detail.title)) ?? [], detail);
    if (exact) return { detail, publicationId: exact };
    // ② 首行归一匹配(xlsx「作品名称」=多行 caption 首行时;两侧都取首行再比)。
    const dFirst = normTitleFirstLine(detail.title);
    const fl = disambiguate(byFirstLine.get(dFirst) ?? [], detail);
    if (fl) return { detail, publicationId: fl };
    // ③ 前缀双向兜底(截断:一侧是另一侧前缀)。仅当明细首行足够长(≥8 归一字符),避免
    //    短标题误伤;唯一命中才认(多义走 disambiguate 的日/时刻/externalId 收窄,仍分不出
    //    则诚实跳过)。
    if (dFirst.length >= 8) {
      const prefixHits = dyPubs.filter((p) => {
        const pFirst = normTitleFirstLine(p.title);
        if (!pFirst) return false;
        return pFirst.startsWith(dFirst) || dFirst.startsWith(pFirst);
      });
      const pf = disambiguate(prefixHits, detail);
      if (pf) return { detail, publicationId: pf };
    }
    // 仍无唯一匹配 → 诚实跳过(不硬造)。
    return { detail, publicationId: null };
  });
}

/**
 * 匹配上的明细 → MetricRecord[](喂 ingestMetrics:resolvePublication→appendSnapshot)。
 * 明细无 aweme_id,但 ingestMetrics 靠 (platform, externalId) 找 publication;为让明细也走
 * 同一 ingest fan-out,externalId 复用已匹配 publication 的 externalId —— 由落库侧从 catalog
 * 提供(见 persistence-client 装配)。未匹配(publicationId=null)的明细**不产 record**(跳过)。
 * capturedAt 是 Analytics 幂等锚(同刻同作品唯一)。
 */
export function toDetailMetricRecords(
  matches: readonly DetailMatch[],
  externalIdOf: (publicationId: string) => string | null,
  capturedAt: string,
): MetricRecord[] {
  const out: MetricRecord[] = [];
  for (const m of matches) {
    if (!m.publicationId) continue; // 未匹配 → 诚实跳过
    const externalId = externalIdOf(m.publicationId);
    if (!externalId) continue; // 无 externalId 锚 → 无法经 resolvePublication 落,跳过
    out.push({
      recordKey: `douyin:detail:${externalId}:${capturedAt}`,
      platform: "douyin",
      externalId,
      capturedAt,
      metrics: detailToRawMetrics(m.detail),
    });
  }
  return out;
}

export function parseDouyinWorkDetailRows(rows: unknown[][]): DouyinWorkDetail[] {
  if (rows.length === 0) return [];

  const headers = rows[0]!.map((h) => cellStr(h));
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c !== "" && c != null));
  if (dataRows.length === 0) return [];

  // 列定位(容错关键词;缺省列号对齐 TzFilm 的 `or N` 兜底)。
  const titleIdx = firstNonNeg(findCol(headers, ["作品名称", "名称", "标题"]), 0);
  const dateIdx = firstNonNeg(findCol(headers, ["发布时间", "时间"]), 1);
  const genreIdx = findCol(headers, ["体裁", "类型"]);
  const statusIdx = findCol(headers, ["审核状态", "状态"]);
  const playIdx = firstNonNeg(findCol(headers, ["播放量", "播放"]), 4);
  const finishIdx = findCol(headers, ["完播率"]);
  const finish5sIdx = findCol(headers, ["5s完播", "5秒完播"]);
  const coverCtrIdx = findCol(headers, ["封面点击"]);
  const bounceIdx = findCol(headers, ["2s跳出", "2秒跳出", "跳出"]);
  const durIdx = findCol(headers, ["平均播放时长", "时长"]);
  const likeIdx = findCol(headers, ["点赞量", "点赞"]);
  const shareIdx = findCol(headers, ["分享量", "分享"]);
  const commentIdx = findCol(headers, ["评论量", "评论"]);
  const favIdx = findCol(headers, ["收藏量", "收藏"]);
  const profileIdx = findCol(headers, ["主页访问量", "主页访问"]);
  const followerIdx = findCol(headers, ["粉丝增量", "涨粉"]);

  // 5s完播 / 封面点击 关键词都含「点击」「完播」易撞车,故先匹配更具体的 5s / 封面。
  return dataRows.map((row): DouyinWorkDetail => {
    return {
      title: cellStr(at(row, titleIdx)) || "Unknown",
      pubDate: cellStr(at(row, dateIdx)),
      genre: cellStr(at(row, genreIdx)).replace(/\n/g, "").replace(/\s/g, ""),
      status: cellStr(at(row, statusIdx)),
      plays: safeInt(at(row, playIdx)),
      finishRate: asPct(at(row, finishIdx)),
      finish5sRate: asPct(at(row, finish5sIdx)),
      coverCtr: asRatePct(at(row, coverCtrIdx)),
      bounce2sRate: asPct(at(row, bounceIdx)),
      avgDurationSec: Math.round(safeFloat(at(row, durIdx)) * 10) / 10,
      likes: safeInt(at(row, likeIdx)),
      shares: safeInt(at(row, shareIdx)),
      comments: safeInt(at(row, commentIdx)),
      favorites: safeInt(at(row, favIdx)),
      profileVisits: safeInt(at(row, profileIdx)),
      followerGain: safeInt(at(row, followerIdx)),
    };
  });
}
