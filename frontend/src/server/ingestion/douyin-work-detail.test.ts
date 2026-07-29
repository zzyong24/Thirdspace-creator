import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  parseDouyinWorkListXlsx,
  detailToRawMetrics,
  matchDetailsToPublications,
  toDetailMetricRecords,
  visibilityFromDetailStatus,
  type DouyinWorkDetail,
  type PublicationCatalogEntry,
} from "./douyin-work-detail";

// T-030-D8a 确定性测试(SPEC §9b):xlsx 解析 + 字段映射 + title/pub_date 匹配。
// 全程 fake IO —— 用真 exceljs 在内存现构 xlsx buffer 喂进解析器,不碰真抖音/真下载。

// 抖音创作者后台「作品列表」真实表头(16 列,对齐 TzFilm parse_xlsx 注释)。
const HEADERS_STANDARD = [
  "作品名称",
  "发布时间",
  "体裁",
  "审核状态",
  "播放量",
  "完播率",
  "5s完播率",
  "封面点击率",
  "2s跳出率",
  "平均播放时长",
  "点赞量",
  "分享量",
  "评论量",
  "收藏量",
  "主页访问量",
  "粉丝增量",
];

/** 用 exceljs 在内存现构一个含给定表头 + 数据行的 xlsx,返回 bytes(喂解析器)。 */
async function buildXlsx(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("作品列表");
  ws.addRow([...headers]);
  for (const r of rows) ws.addRow([...r]);
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

describe("parseDouyinWorkListXlsx — 16 字段容错解析(移植 TzFilm parse_xlsx)", () => {
  it("标准表头 + 2 行 → 抽出 16 字段,百分数/时长/计数类型正确", async () => {
    const bytes = await buildXlsx(HEADERS_STANDARD, [
      // 完播率 12.5 (已是百分数,原样) / 5s完播 0.08 (小数 → 8) / 封面CTR 30 / 2s跳出 0.15 (→15)
      [
        "如何写好一条短视频",
        "2026-06-21 08:15",
        "1-3min视频",
        "已通过",
        "12,345", // 播放量带千分位逗号
        12.5, // 完播率(百分数)
        0.08, // 5s完播率(小数 → 8%)
        30, // 封面点击率
        0.15, // 2s跳出率(小数 → 15%)
        17.4, // 平均播放时长(秒)
        44,
        7,
        6,
        40,
        120,
        10,
      ],
      [
        "第二条作品",
        "2026-06-22 09:00",
        "图文",
        "仅自己可见",
        "0",
        "-", // 完播率缺失 → 0
        "", // 5s完播缺失 → 0
        66.67,
        0,
        23,
        0,
        0,
        1,
        0,
        5,
        2,
      ],
    ]);

    const details = await parseDouyinWorkListXlsx(bytes);
    expect(details).toHaveLength(2);

    const [a, b] = details;
    // 第一行:字符串字段
    expect(a!.title).toBe("如何写好一条短视频");
    expect(a!.pubDate).toBe("2026-06-21 08:15");
    expect(a!.genre).toBe("1-3min视频");
    expect(a!.status).toBe("已通过");
    // 计数(千分位逗号清掉 → int)
    expect(a!.plays).toBe(12345);
    // 百分数归一:12.5 原样;0.08 → 8;30 原样;0.15 → 15
    expect(a!.finishRate).toBe(12.5);
    expect(a!.finish5sRate).toBe(8);
    expect(a!.coverCtr).toBe(30);
    expect(a!.bounce2sRate).toBe(15);
    // 时长(秒,保留 1 位)
    expect(a!.avgDurationSec).toBe(17.4);
    // 计数
    expect(a!.likes).toBe(44);
    expect(a!.shares).toBe(7);
    expect(a!.comments).toBe(6);
    expect(a!.favorites).toBe(40);
    expect(a!.profileVisits).toBe(120);
    expect(a!.followerGain).toBe(10);

    // 第二行:缺失值兜底 0
    expect(b!.plays).toBe(0);
    expect(b!.finishRate).toBe(0); // "-" → 0
    expect(b!.finish5sRate).toBe(0); // "" → 0
    expect(b!.coverCtr).toBe(66.67);
    expect(b!.status).toBe("仅自己可见");
    expect(b!.followerGain).toBe(2);
  });

  it("[T-403] 封面点击率:真机 xlsx 值区分无数据/真0/小数/100%(用户 2026-07-18 导出实证)", async () => {
    // 真机 `作品列表.xlsx` 封面点击率列真实取值:"-"(抖音无数据)/"0.000000"(真0)/
    // "1"(=100% 小数)/"0.592233"(=59.22%)。其余明细列给合法值避免整行被跳过。
    const rowFor = (coverCtr: unknown): unknown[] => [
      "标题",
      "2026-07-18",
      "3-5min视频",
      "已通过",
      "5985",
      0.0117, // 完播率
      0.2704, // 5s完播率
      coverCtr, // 封面点击率(被测)
      0.4615, // 2s跳出率
      8.4,
      10,
      1,
      1,
      1,
      1,
      1,
    ];
    const bytes = await buildXlsx(HEADERS_STANDARD, [
      rowFor("-"),
      rowFor("0.000000"),
      rowFor("1"),
      rowFor("0.592233"),
    ]);
    const [noData, real0, full, frac] = await parseDouyinWorkListXlsx(bytes);
    expect(noData!.coverCtr).toBeNull(); // "-" → null(无数据,非 0)
    expect(real0!.coverCtr).toBe(0); // "0.000000" → 真 0
    expect(full!.coverCtr).toBe(100); // "1" → 100%(修 asPct n≥1 当 1% 的边界 bug)
    expect(frac!.coverCtr).toBe(59.22); // 0.592233 → 59.22%

    // detailToRawMetrics:无数据(null)不落 ctr 键 → 复盘卡显「暂无」;真 0 落 ctr:0。
    expect("ctr" in detailToRawMetrics(noData!)).toBe(false);
    expect(detailToRawMetrics(real0!).ctr).toBe(0);
    expect(detailToRawMetrics(full!).ctr).toBe(100);
  });

  it("列序变化 + 表头带后缀仍容错匹配(仿 TzFilm 关键词模糊匹配)", async () => {
    // 打乱列序 + 表头加后缀("(次)" / "（%）"),关键词子串匹配应仍命中。
    const shuffled = [
      "发布时间",
      "播放量(次)",
      "作品名称",
      "点赞量",
      "完播率（%）",
      "封面点击率（%）",
      "粉丝增量",
      "评论量",
    ];
    const bytes = await buildXlsx(shuffled, [
      ["2026-06-21", 9999, "标题在第三列", 88, 5.5, 42, 3, 12],
    ]);
    const details = await parseDouyinWorkListXlsx(bytes);
    expect(details).toHaveLength(1);
    const d = details[0]!;
    // 尽管列序全乱、表头带后缀,关键词匹配仍把值抽到正确字段
    expect(d.title).toBe("标题在第三列");
    expect(d.pubDate).toBe("2026-06-21");
    expect(d.plays).toBe(9999);
    expect(d.likes).toBe(88);
    expect(d.finishRate).toBe(5.5);
    expect(d.coverCtr).toBe(42);
    expect(d.followerGain).toBe(3);
    expect(d.comments).toBe(12);
  });

  it("空文件 / 仅表头无数据行 → []", async () => {
    const empty = await buildXlsx(HEADERS_STANDARD, []);
    expect(await parseDouyinWorkListXlsx(empty)).toEqual([]);
  });

  it("空行(整行皆空)被跳过", async () => {
    const bytes = await buildXlsx(HEADERS_STANDARD, [
      ["有效作品", "2026-06-21", "视频", "已通过", 100, 10, 5, 20, 3, 15, 1, 1, 1, 1, 1, 1],
      [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ]);
    const details = await parseDouyinWorkListXlsx(bytes);
    expect(details).toHaveLength(1);
    expect(details[0]!.title).toBe("有效作品");
  });
});

describe("detailToRawMetrics — 明细 → 复盘读侧键位(0/fixture → 真)", () => {
  it("映射到复盘 view-model 读的键(plays/ctr/finish_rate/…)+ 明细独有键", () => {
    const d: DouyinWorkDetail = {
      title: "t",
      pubDate: "2026-06-21",
      genre: "视频",
      status: "已通过",
      plays: 12345,
      finishRate: 12.5,
      finish5sRate: 8,
      coverCtr: 30,
      bounce2sRate: 15,
      avgDurationSec: 17.4,
      likes: 44,
      shares: 7,
      comments: 6,
      favorites: 40,
      profileVisits: 120,
      followerGain: 10,
    };
    const raw = detailToRawMetrics(d);
    // 复盘核心指标读侧键(analytics-review-view-model.ts):完播率 finish_rate、封面点击率 ctr
    expect(raw.plays).toBe(12345);
    expect(raw.ctr).toBe(30); // 封面点击率 → ctr(复盘卡从 0/fixture 变真)
    expect(raw.finish_rate).toBe(12.5); // 完播率 → finish_rate
    expect(raw.avg_duration_sec).toBe(17.4);
    expect(raw.likes).toBe(44);
    expect(raw.comments).toBe(6);
    expect(raw.shares).toBe(7);
    expect(raw.favorites).toBe(40);
    expect(raw.follower_gain).toBe(10);
    // 明细独有键(承载,供漏斗 / 后续消费)
    expect(raw.finish_5s_rate).toBe(8);
    expect(raw.bounce_2s_rate).toBe(15);
    expect(raw.profile_visits).toBe(120);
    // [T-329] 体裁(字符串键)—— 明细 16 列最后一个未进 rawMetrics 的字段,补齐。
    expect(raw.genre).toBe("视频");
  });

  // [T-329] genre 空串 → 不落键(诚实:没有体裁就不摆空字符串假键)。
  it("genre 为空串时不落 genre 键", () => {
    const d: DouyinWorkDetail = {
      title: "t",
      pubDate: "2026-06-21",
      genre: "",
      status: "已通过",
      plays: 1,
      finishRate: 0,
      finish5sRate: 0,
      coverCtr: 0,
      bounce2sRate: 0,
      avgDurationSec: 0,
      likes: 0,
      shares: 0,
      comments: 0,
      favorites: 0,
      profileVisits: 0,
      followerGain: 0,
    };
    const raw = detailToRawMetrics(d);
    expect("genre" in raw).toBe(false);
  });
});

describe("matchDetailsToPublications — 按 title/pub_date 匹配作品(无 aweme_id 维度)", () => {
  const detail = (title: string, pubDate: string): DouyinWorkDetail => ({
    title,
    pubDate,
    genre: "",
    status: "",
    plays: 0,
    finishRate: 0,
    finish5sRate: 0,
    coverCtr: 0,
    bounce2sRate: 0,
    avgDurationSec: 0,
    likes: 0,
    shares: 0,
    comments: 0,
    favorites: 0,
    profileVisits: 0,
    followerGain: 0,
  });

  const catalog: PublicationCatalogEntry[] = [
    { id: "pub-a", platform: "douyin", title: "作品甲", publishedAt: "2026-06-21T08:15:49.000Z" },
    { id: "pub-b", platform: "douyin", title: "作品乙", publishedAt: "2026-06-22T09:00:00.000Z" },
    // 同名两条 → 需 pub_date 消歧
    { id: "pub-c1", platform: "douyin", title: "重名作品", publishedAt: "2026-06-01T00:00:00.000Z" },
    { id: "pub-c2", platform: "douyin", title: "重名作品", publishedAt: "2026-06-15T00:00:00.000Z" },
    // 非 douyin 平台 → 不参与匹配
    { id: "pub-x", platform: "youtube", title: "作品甲", publishedAt: null },
  ];

  it("title 精确匹配(单条)→ 命中该 publication", () => {
    const matches = matchDetailsToPublications([detail("作品甲", "2026-06-21 08:15")], catalog);
    expect(matches[0]!.publicationId).toBe("pub-a");
  });

  it("title 带空白差异仍匹配(归一去空白)", () => {
    const matches = matchDetailsToPublications([detail(" 作品乙 ", "2026-06-22")], catalog);
    expect(matches[0]!.publicationId).toBe("pub-b");
  });

  it("同名多条 → 用发布日(pub_date 同日)消歧", () => {
    const matches = matchDetailsToPublications([detail("重名作品", "2026-06-15 10:00")], catalog);
    expect(matches[0]!.publicationId).toBe("pub-c2");
  });

  it("匹配不上(作品未导入/title 对不上)→ publicationId=null(诚实跳过)", () => {
    const matches = matchDetailsToPublications([detail("查无此作品", "2026-06-21")], catalog);
    expect(matches[0]!.publicationId).toBeNull();
  });

  it("只在 douyin 平台匹配(youtube 同名不误命中)", () => {
    // "作品甲" 在 douyin(pub-a)和 youtube(pub-x)都有 → 只应命中 douyin
    const matches = matchDetailsToPublications([detail("作品甲", "2026-06-21")], catalog);
    expect(matches[0]!.publicationId).toBe("pub-a");
  });

  // T-034 断裂修复:导入作品 title 是完整多行 caption,xlsx「作品名称」是首行(可能被截)。
  it("catalog 是多行完整 caption、xlsx 是首行 → 首行归一命中", () => {
    const multiline: PublicationCatalogEntry[] = [
      {
        id: "pub-ml",
        platform: "douyin",
        title:
          "越喂越笨:我给 AI 配了 80 个工具\n给 AI 配的工具越多、喂的资料越多,它反而越笨。\n#AI新星计划",
        publishedAt: "2026-07-01T00:12:00.000Z",
      },
    ];
    const matches = matchDetailsToPublications(
      [detail("越喂越笨:我给 AI 配了 80 个工具", "2026-07-01 08:12")],
      multiline,
    );
    expect(matches[0]!.publicationId).toBe("pub-ml");
  });

  it("xlsx 首行带截断省略号 → 去省略号后前缀命中(唯一)", () => {
    const cat: PublicationCatalogEntry[] = [
      {
        id: "pub-trunc",
        platform: "douyin",
        title: "口播视频自动剪辑工具:12分钟剪到5分钟的完整实操教程",
        publishedAt: "2026-06-20T00:00:00.000Z",
      },
    ];
    // 抖音后台把长标题截成「…前缀…」
    const matches = matchDetailsToPublications(
      [detail("口播视频自动剪辑工具:12分钟剪到5分钟…", "2026-06-20 10:00")],
      cat,
    );
    expect(matches[0]!.publicationId).toBe("pub-trunc");
  });

  it("前缀兜底要求唯一:多条前缀命中且无法用发布日消歧 → 诚实跳过", () => {
    const cat: PublicationCatalogEntry[] = [
      { id: "p1", platform: "douyin", title: "知识库一站式方案演示 A 版", publishedAt: null },
      { id: "p2", platform: "douyin", title: "知识库一站式方案演示 B 版", publishedAt: null },
    ];
    // "知识库一站式方案演示" 是两条的公共前缀,无发布日消歧 → 不硬猜
    const matches = matchDetailsToPublications(
      [detail("知识库一站式方案演示", "2026-06-01 10:00")],
      cat,
    );
    expect(matches[0]!.publicationId).toBeNull();
  });

  it("短标题不走前缀兜底(避免误伤):<8 归一字符前缀不命中", () => {
    const cat: PublicationCatalogEntry[] = [
      { id: "ps", platform: "douyin", title: "关于AI的一些长标题内容延展", publishedAt: null },
    ];
    // 明细 "关于AI" 归一后 <8 字符 → 不启用前缀兜底,精确/首行都不中 → null
    const matches = matchDetailsToPublications([detail("关于AI", "2026-06-01")], cat);
    expect(matches[0]!.publicationId).toBeNull();
  });

  // ── [T-036] 全量导出后真机 15 miss 的三类根因回归(时区跨日/同题多发时刻/双轨 extId/无标题) ──

  it("[T-036] 北京 0-8 点发布(UTC 前一日)→ 北京日归一命中(时区跨日,真机 6 例)", () => {
    // 真机:「奇点已至」xlsx 2026-03-28 00:54:02(北京) vs published_at 2026-03-27T16:54:02Z。
    // 双轨同名同刻 → 还需 externalId 优先(fixture 轨匹到也会被落库丢弃)。
    const cat: PublicationCatalogEntry[] = [
      { id: "dy-pub-36", platform: "douyin", title: "奇点已至", publishedAt: "2026-03-27T16:54:02.000Z" },
      { id: "pub-f0ea420f-274", platform: "douyin", title: "奇点已至", publishedAt: "2026-03-27T16:54:02.000Z", externalId: "aweme-274" },
    ];
    const matches = matchDetailsToPublications([detail("奇点已至", "2026-03-28 00:54:02")], cat);
    expect(matches[0]!.publicationId).toBe("pub-f0ea420f-274");
  });

  it("[T-036] 同题同日发两遍 → 北京时刻(HH:mm:ss)消歧到各自 publication(真机 Hermes 半成品两连发)", () => {
    const cat: PublicationCatalogEntry[] = [
      { id: "pub-1717", platform: "douyin", title: "Hermes似乎真是个半成品！", publishedAt: "2026-04-19T09:17:31.000Z", externalId: "a-1717" },
      { id: "pub-1647", platform: "douyin", title: "Hermes似乎真是个半成品！", publishedAt: "2026-04-19T08:47:38.000Z", externalId: "a-1647" },
    ];
    const matches = matchDetailsToPublications(
      [
        detail("Hermes似乎真是个半成品！", "2026-04-19 16:47:38"),
        detail("Hermes似乎真是个半成品！", "2026-04-19 17:17:31"),
      ],
      cat,
    );
    expect(matches[0]!.publicationId).toBe("pub-1647");
    expect(matches[1]!.publicationId).toBe("pub-1717");
  });

  it("[T-036] xlsx「无标题」↔ catalog 占位「抖音作品 {id}」→ 无题池按北京时刻唯一锚定(真机 5 例)", () => {
    const cat: PublicationCatalogEntry[] = [
      // published_at 2026-05-06T04:55:51Z = 北京 12:55:51,与 xlsx 秒级全等。
      { id: "pub-656", platform: "douyin", title: "抖音作品 7636638044263183281", publishedAt: "2026-05-06T04:55:51.000Z", externalId: "7636638044263183281" },
      { id: "pub-normal", platform: "douyin", title: "同日正常标题作品", publishedAt: "2026-05-06T05:00:00.000Z", externalId: "x-1" },
    ];
    const matches = matchDetailsToPublications([detail("无标题", "2026-05-06 12:55:51")], cat);
    expect(matches[0]!.publicationId).toBe("pub-656");
  });

  it("[T-036] 「无标题」多候选同刻分不出 → 诚实跳过(不硬猜)", () => {
    const cat: PublicationCatalogEntry[] = [
      { id: "u1", platform: "douyin", title: "抖音作品 111", publishedAt: "2026-05-06T04:55:51.000Z" },
      { id: "u2", platform: "douyin", title: "抖音作品 222", publishedAt: "2026-05-06T04:55:51.000Z" },
    ];
    const matches = matchDetailsToPublications([detail("无标题", "2026-05-06 12:55:51")], cat);
    expect(matches[0]!.publicationId).toBeNull();
  });
});

describe("toDetailMetricRecords — 匹配上的明细 → MetricRecord[](未匹配跳过)", () => {
  const d = (title: string): DouyinWorkDetail => ({
    title,
    pubDate: "2026-06-21",
    genre: "",
    status: "",
    plays: 100,
    finishRate: 10,
    finish5sRate: 5,
    coverCtr: 20,
    bounce2sRate: 3,
    avgDurationSec: 15,
    likes: 1,
    shares: 1,
    comments: 1,
    favorites: 1,
    profileVisits: 1,
    followerGain: 1,
  });

  it("匹配上 → 带 externalId 的 MetricRecord;未匹配 / 无 externalId → 跳过", () => {
    const matches = [
      { detail: d("命中"), publicationId: "pub-1" },
      { detail: d("未匹配"), publicationId: null },
      { detail: d("无锚"), publicationId: "pub-noexternal" },
    ];
    const externalIdOf = (pubId: string) =>
      pubId === "pub-1" ? "aweme-111" : null; // pub-noexternal 无 externalId
    const records = toDetailMetricRecords(matches, externalIdOf, "2026-07-01T00:00:00.000Z");

    // 只有 pub-1(有 externalId 锚)产 record;另两条诚实跳过
    expect(records).toHaveLength(1);
    const r = records[0]!;
    expect(r.platform).toBe("douyin");
    expect(r.externalId).toBe("aweme-111");
    expect(r.recordKey).toBe("douyin:detail:aweme-111:2026-07-01T00:00:00.000Z");
    expect(r.capturedAt).toBe("2026-07-01T00:00:00.000Z");
    // rawMetrics 带复盘读侧键
    expect(r.metrics.plays).toBe(100);
    expect(r.metrics.ctr).toBe(20);
    expect(r.metrics.finish_rate).toBe(10);
  });
});

// [T-073] 可见性判定:明细「审核状态」列 → hidden / visible / unknown(诚实不瞎标)。
describe("visibilityFromDetailStatus ([T-073] 审核状态 → 可见性)", () => {
  it("「仅自己可见」及各隐藏口径 → hidden", () => {
    expect(visibilityFromDetailStatus("仅自己可见")).toBe("hidden");
    expect(visibilityFromDetailStatus("仅我可见")).toBe("hidden");
    expect(visibilityFromDetailStatus("已隐藏")).toBe("hidden");
    expect(visibilityFromDetailStatus("私密")).toBe("hidden");
    // 带前后缀/空白仍命中(findCol 同款子串容错口径)
    expect(visibilityFromDetailStatus(" 已通过(仅自己可见) ")).toBe("hidden");
  });

  it("「已通过」→ visible", () => {
    expect(visibilityFromDetailStatus("已通过")).toBe("visible");
  });

  it("[T-206] 真机 xlsx 实际字面量:「公开」→ visible,「自见」→ hidden", () => {
    // 真机诊断:明细「审核状态」列实际值是「公开」/「自见」(非「已通过」/「仅自己可见」)。
    expect(visibilityFromDetailStatus("公开")).toBe("visible");
    expect(visibilityFromDetailStatus("自见")).toBe("hidden");
    // 「自见」不被「仅自己可见」等旧口径误伤;带空白仍命中。
    expect(visibilityFromDetailStatus(" 自见 ")).toBe("hidden");
    expect(visibilityFromDetailStatus(" 公开 ")).toBe("visible");
  });

  it("判定不了(审核中/未通过/空)→ unknown,消费侧不动既有标记", () => {
    expect(visibilityFromDetailStatus("审核中")).toBe("unknown");
    expect(visibilityFromDetailStatus("未通过")).toBe("unknown");
    expect(visibilityFromDetailStatus("")).toBe("unknown");
    expect(visibilityFromDetailStatus("  ")).toBe("unknown");
  });
});
