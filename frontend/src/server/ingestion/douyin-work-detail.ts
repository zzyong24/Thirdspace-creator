import "server-only";
import type { MetricRecord } from "@creatoros/backend/modules/ingestion";

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
  coverCtr: number;
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
export interface ParseWorkListDeps {
  /** exceljs 模块(默认动态引入;server-only,不进客户端 bundle)。 */
  loadExcelJS?: () => Promise<typeof import("exceljs")>;
}

/**
 * 解析创作者后台「作品列表.xlsx」bytes → 结构化明细(16 字段)。**纯函数**(输入定则输出定,
 * 唯一 IO 是 exceljs 读内存 buffer,可注入)。逻辑忠实移植 TzFilm parse_xlsx:
 *   - 第一行为表头,按**中文关键词容错匹配**列下标(列序变化 / 表头带后缀仍命中);
 *   - 百分数(完播/5s完播/封面CTR/2s跳出)→ asPct 归一 0-100;
 *   - 平均播放时长 → 秒(保留 1 位);计数(播放/点赞/分享/评论/收藏/主页访问/粉丝增量)→ int;
 *   - 空行(整行皆空)跳过。
 * 空文件 / 无表头 → 返回 []。
 */
export async function parseDouyinWorkListXlsx(
  bytes: Uint8Array,
  deps: ParseWorkListDeps = {},
): Promise<DouyinWorkDetail[]> {
  const loadExcelJS =
    deps.loadExcelJS ?? (() => import("exceljs"));
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  // exceljs 接受 Node Buffer;把 Uint8Array 包成 Buffer(不复制底层,零成本)。
  // cast:@types/node 5.9 的 Buffer 类型带 resizable 等新成员,Buffer.from(ArrayBuffer,…)
  // 返回 Buffer<ArrayBufferLike> 会被判"缺成员";运行时确是合法 Buffer,故窄化到 exceljs 签名。
  const nodeBuffer = Buffer.from(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ) as unknown as Parameters<typeof wb.xlsx.load>[0];
  await wb.xlsx.load(nodeBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  // 收集所有行为二维数组(exceljs row.values 下标从 1 开始,[0] 是占位 → 丢弃)。
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
    // exceljs 富文本单元格 → { richText:[{text}] } / 超链接 → { text };归一成纯文本。
    rows.push(vals.map(normalizeCell));
  });
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
      coverCtr: asPct(at(row, coverCtrIdx)),
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

/** exceljs 单元格值归一:富文本 / 超链接对象 → 纯文本;其余原样。 */
function normalizeCell(v: unknown): unknown {
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
// ② 映射 DouyinWorkDetail[] → MetricRecord[](喂复盘,SPEC §10)
// ---------------------------------------------------------------------------

/**
 * 一条明细 → rawMetrics 键位(与现有 canonical seed / 复盘 view-model 读侧对齐):
 *   plays / ctr / finish_rate / avg_duration_sec / likes / comments / shares /
 *   favorites / follower_gain —— **复盘核心指标(完播率/封面CTR)从 0/fixture 变真**;
 *   外加明细独有键(5s完播 / 2s跳出 / 主页访问)承载 D8a 新字段,供漏斗 / 后续消费。
 * 注:复盘 view-model 读「封面点击率」用的键是 `ctr`(见 analytics-review-view-model.ts),
 *   故 coverCtr 映射到 `ctr`(而非 cover_ctr),这样复盘卡即刻显真值。
 */
export function detailToRawMetrics(d: DouyinWorkDetail): Record<string, number> {
  return {
    plays: d.plays,
    ctr: d.coverCtr, // 封面点击率 → 复盘读侧键 `ctr`(0/fixture → 真)
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
  /** 发布时刻 ISO(可空;明细 pubDate 与之做「日」级前缀匹配)。 */
  publishedAt?: string | null;
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

/** pubDate 归一到 YYYY-MM-DD(明细 "2026-06-21 08:15" / publishedAt ISO 都取日期前缀)。 */
function normDay(s: string | null | undefined): string {
  if (!s) return "";
  const m = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (!m) return "";
  const y = m[1]!;
  const mo = m[2]!.padStart(2, "0");
  const d = m[3]!.padStart(2, "0");
  return `${y}-${mo}-${d}`;
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

  // 同一批候选里用发布日消歧(明细 pubDate 与 publishedAt 同日);单条直接命中。
  const pick = (
    candidates: readonly PublicationCatalogEntry[],
    detail: DouyinWorkDetail,
  ): string | null => {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0]!.id;
    const day = normDay(detail.pubDate);
    const hit = candidates.find(
      (c) => normDay(c.publishedAt) === day && day !== "",
    );
    return hit ? hit.id : null;
  };

  return details.map((detail): DetailMatch => {
    // ① 完整归一 title 精确匹配(最强,原行为)。
    const exact = pick(byTitle.get(normTitle(detail.title)) ?? [], detail);
    if (exact) return { detail, publicationId: exact };
    // ② 首行归一匹配(xlsx「作品名称」=多行 caption 首行时;两侧都取首行再比)。
    const dFirst = normTitleFirstLine(detail.title);
    const fl = pick(byFirstLine.get(dFirst) ?? [], detail);
    if (fl) return { detail, publicationId: fl };
    // ③ 前缀双向兜底(截断:一侧是另一侧前缀)。仅当明细首行足够长(≥8 归一字符),避免
    //    短标题误伤;唯一命中才认(多义则弃,交给 pub_date 也无法消歧的情况诚实跳过)。
    if (dFirst.length >= 8) {
      const prefixHits = dyPubs.filter((p) => {
        const pFirst = normTitleFirstLine(p.title);
        if (!pFirst) return false;
        return pFirst.startsWith(dFirst) || dFirst.startsWith(pFirst);
      });
      const day = normDay(detail.pubDate);
      // 先按发布日收窄(有同日候选优先),再要求唯一。
      const sameDay = prefixHits.filter(
        (p) => normDay(p.publishedAt) === day && day !== "",
      );
      const pool = sameDay.length > 0 ? sameDay : prefixHits;
      if (pool.length === 1) return { detail, publicationId: pool[0]!.id };
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
