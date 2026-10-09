import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseWechatNativeReport, type WechatNativeReportInput } from "./wechat-native-report-parser";

const selection = { startDate: "2026-10-01", endDate: "2026-10-02",
  timeZone: "Asia/Shanghai", meaning: "statisticsDates" } as const;
const dailyHeader = ["时间", "播放", "推荐", "喜欢", "评论", "分享", "关注"];
const followersHeader = ["时间", "净增关注", "新增关注", "取消关注", "关注者总数"];
const workHeader = ["视频描述", "视频ID", "发布时间", "完播率", "平均播放时长", "播放量",
  "推荐", "喜欢", "评论量", "分享量", "关注量", "转发聊天和朋友圈", "设为铃声",
  "设为状态", "设为朋友圈封面", "企微链接点击次数", "企微链接点击人数", "添加到通讯录次数", "添加到通讯录人数"];
const encode = (text: string) => new TextEncoder().encode(text);
const csvField = (value: string) => /[",\r\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
const csvText = (rows: string[][]) => rows.map(row => row.map(csvField).join(",")).join("\r\n");
const input = (kind: WechatNativeReportInput["kind"], bytes: Uint8Array): WechatNativeReportInput => ({
  platform: kind.startsWith("official") ? "wechatOfficial" : "wechatVideo", kind, bytes,
  filename: kind + ".xls", selection: kind === "channelsWorks"
    ? { ...selection, meaning: "publishedDates" } : selection,
  sourcePath: kind === "officialContent" ? "/misc/appmsganalysis" : kind === "officialFollowers"
    ? "/misc/useranalysis" : kind === "channelsFollowers" ? "/platform/statistic/follower" : "/platform/statistic/post",
});
const dailyRows = [
  ["2026/10/02", "0", "2", "3", "0", "-", ""],
  ["2026/10/01", "10", "4", "5", "6", "7", "8"],
];
const daily = () => encode("\uFEFF" + csvText([["测试统计说明"], ["仅为合成协议夹具"], dailyHeader, ...dailyRows]));
function works(rows = 13): Uint8Array {
  return encode(csvText([workHeader, ...Array.from({ length: rows }, (_, index) => [
    index === 0 ? '合成描述有逗号,和"引号"\r\n第二行' : "合成作品",
    "synthetic_video_" + index.toString().padStart(3, "0"),
    "2026/10/01 12:34:56", index === 1 ? "-" : "25%", index === 1 ? "" : "1.25秒",
    "0", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14",
  ])]));
}
const html = (extra = "") => encode("<!doctype html><html><body>" + extra +
  "<table><tr><td colspan='5'>合成用户增长</td></tr><tr><th>时间</th><th>新关注人数</th>" +
  "<th>取消关注人数</th><th>净增关注人数</th><th>累积关注人数</th></tr>" +
  "<tr></tr><tr><td>2026-10-01</td><td>0</td><td>2</td><td>-2</td><td>10</td></tr>" +
  "<tr></tr><tr><td>2026-10-02</td><td>1</td><td>1</td><td>0</td><td>10</td></tr></table></body></html>");
function biff(options: { drift?: boolean } = {}): Uint8Array {
  const grid: (string | number)[][] = Array.from({ length: 7 }, () => Array<string | number>(16).fill(""));
  grid[0]![1] = "合成公众号内容分析";
  [
    [1, ["日期", "渠道", "阅读人数"]],
    [5, ["日期", "分享人数", "跳转阅读原文人数", "微信收藏人数", "发表篇数"]],
    [11, ["传播渠道", "发表日期", "内容标题", "阅读人数", "阅读人数占比"]],
  ].forEach(([offset, labels]) => (labels as string[]).forEach((label, i) => { grid[2]![Number(offset) + i] = label; }));
  [
    ["2026-10-01", "合成渠道甲", 0], ["2026-10-01", "合成渠道乙", 2],
    ["2026-10-02", "合成渠道甲", 3], ["2026-10-02", "合成渠道乙", 4],
  ].forEach((values, r) => values.forEach((value, c) => { grid[r + 3]![c + 1] = value; }));
  [
    ["2026-10-01", 0, 1, 2, 3], ["2026-10-02", 4, 5, 6, 7],
  ].forEach((values, r) => values.forEach((value, c) => { grid[r + 3]![c + 5] = value; }));
  [
    ["合成渠道甲", "2026-09-01", "旧发表内容在当前统计窗口仍有阅读", 2, 0.25],
    ["合成渠道乙", "2026-09-02", "合成旧内容乙", 3, 0.75],
  ].forEach((values, r) => values.forEach((value, c) => { grid[r + 3]![c + 11] = value; }));
  if (options.drift) grid[2]![4] = "未经核实新增列";
  const sheet = XLSX.utils.aoa_to_sheet(grid);
  sheet.P4!.z = "0.0%"; sheet.P5!.z = "0.0%";
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "合成");
  return new Uint8Array(XLSX.write(book, { type: "array", bookType: "biff8" }) as ArrayBuffer);
}

describe("微信原生报表有限协议解析", () => {
  it("账号每日CSV区分推荐/喜欢、真实0/未知，包含原始字节摘要且保留BOM原文件字节", () => {
    const bytes = daily(), report = parseWechatNativeReport(input("channelsDaily", bytes));
    expect(report).toMatchObject({ scope: "accountDaily", accumulation: "daily", receivedBytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"), selection });
    expect(report.tables[0]!.columns.map(c => [c.label, c.unit])).toEqual([
      ["时间", "date"], ["播放", "count"], ["推荐", "count"], ["喜欢", "count"],
      ["评论", "count"], ["分享", "count"], ["关注", "people"],
    ]);
    expect(report.tables[0]!.rows[0]).toEqual([
      { raw: "2026/10/02", value: "2026-10-02" }, { raw: "0", value: 0 },
      { raw: "2", value: 2 }, { raw: "3", value: 3 }, { raw: "0", value: 0 },
      { raw: "-", value: null }, { raw: "", value: null },
    ]);
  });
  it("关注者CSV保留负净增，其他人数必须非负整数", () => {
    const bytes = encode(csvText([["测试说明"], ["合成范围"], followersHeader,
      ["2026/10/01", "-2", "0", "2", "10"], ["2026/10/02", "0", "1", "1", "10"]]));
    const report = parseWechatNativeReport(input("channelsFollowers", bytes));
    expect(report.tables[0]!.columns[1]!.unit).toBe("signedCount");
    expect(report.tables[0]!.rows[0]![1]).toEqual({ raw: "-2", value: -2 });
    const bad = encode(csvText([["说明"], ["说明"], followersHeader,
      ["2026/10/01", "-2", "-1", "2", "10"], ["2026/10/02", "0", "1", "1", "10"]]));
    expect(() => parseWechatNativeReport(input("channelsFollowers", bad))).toThrow("REPORT_SCHEMA");
  });
  it("跨页13条作品保留19列、ID、嵌入换行引号、比例与秒，不声明累计窗口", () => {
    const report = parseWechatNativeReport(input("channelsWorks", works()));
    expect(report).toMatchObject({ scope: "workSelection", accumulation: "sourceUnspecified",
      selection: { meaning: "publishedDates" } });
    expect(report.tables[0]!.rows).toHaveLength(13);
    expect(report.tables[0]!.columns).toHaveLength(19);
    expect(report.tables[0]!.rows[0]!.slice(0, 5)).toEqual([
      { raw: '合成描述有逗号,和"引号"\r\n第二行', value: '合成描述有逗号,和"引号"\r\n第二行' },
      { raw: "synthetic_video_000", value: "synthetic_video_000" },
      { raw: "2026/10/01 12:34:56", value: "2026-10-01T12:34:56+08:00" },
      { raw: "25%", value: 0.25 }, { raw: "1.25秒", value: 1.25 },
    ]);
    expect(report.tables[0]!.rows[1]![3]).toEqual({ raw: "-", value: null });
    expect(report.tables[0]!.rows[1]![4]).toEqual({ raw: "", value: null });
    expect(report.tables[0]!.columns[16]!.unit).toBe("people");
  });
  it("真实容器选择OLE内容和HTML增长，完整保留三个不同长度区块", () => {
    const report = parseWechatNativeReport(input("officialContent", biff()));
    expect(report.tables.map(t => t.rows.length)).toEqual([4, 2, 2]);
    expect(report.tables.map(t => t.columns.length)).toEqual([3, 5, 5]);
    expect(report.tables[0]!.rows[0]![2]).toEqual({ raw: "0", value: 0 });
    expect(report.tables[2]!.rows[0]![4]).toEqual({ raw: "25.0%", value: 0.25 });
    // 来源区块的“发表日期”不是当前报表统计日期，不把旧文章合法阅读拒绝掉。
    expect(report.tables[2]!.rows[0]![1]!.value).toBe("2026-09-01");
    const growth = parseWechatNativeReport(input("officialFollowers", html("<script>throw new Error('不可执行');</script>")));
    expect(growth.tables[0]!.rows).toHaveLength(2);
    expect(growth.tables[0]!.rows[0]![3]).toEqual({ raw: "-2", value: -2 });
    expect(() => parseWechatNativeReport(input("officialContent", html()))).toThrow("REPORT_FORMAT");
    expect(() => parseWechatNativeReport(input("officialFollowers", biff()))).toThrow("REPORT_FORMAT");
  });
  it("拒绝统计日期缺失、重复、越界及7天冒充30天，作品日期只校验选择范围", () => {
    const seven = encode(csvText([["说明"], ["说明"], dailyHeader, dailyRows[0]!]));
    expect(() => parseWechatNativeReport(input("channelsDaily", seven))).toThrow("REPORT_DATE_RANGE");
    const thirty = { ...input("channelsDaily", seven),
      selection: { ...selection, startDate: "2026-09-03" } };
    expect(() => parseWechatNativeReport(thirty)).toThrow("REPORT_DATE_RANGE");
    const repeated = encode(csvText([["说明"], ["说明"], dailyHeader, ...dailyRows, dailyRows[0]!]));
    expect(() => parseWechatNativeReport(input("channelsDaily", repeated))).toThrow("REPORT_DATE_RANGE");
    const outside = { ...input("channelsWorks", works()), selection: { ...selection,
      startDate: "2026-10-02", endDate: "2026-10-02", meaning: "publishedDates" as const } };
    expect(() => parseWechatNativeReport(outside)).toThrow("REPORT_DATE_RANGE");
    expect(() => parseWechatNativeReport({ ...input("channelsDaily", daily()),
      selection: { ...selection, startDate: "2026-02-30" } })).toThrow("REPORT_DATE_RANGE");
  });
  it("格式漂移、错误身份来源/窗口只报稳定错误，不泄露原文", () => {
    expect(() => parseWechatNativeReport(input("officialContent", biff({ drift: true })))).toThrow("REPORT_SCHEMA");
    expect(() => parseWechatNativeReport({ ...input("channelsDaily", daily()),
      sourcePath: "/misc/useranalysis" })).toThrow("REPORT_SCHEMA");
    expect(() => parseWechatNativeReport({ ...input("channelsWorks", works()),
      selection })).toThrow("REPORT_DATE_RANGE");
    expect(() => parseWechatNativeReport({ ...input("channelsWorks", works()),
      filename: "../secret.csv" })).toThrow("REPORT_SCHEMA");
    const drift = encode(csvText([["说明"], ["说明"], ["时间", "偷偷改了字段"], ["私密正文", "123"]]));
    expect(() => parseWechatNativeReport(input("channelsDaily", drift))).toThrow(/^REPORT_SCHEMA$/);
  });
  it("拒绝无效UTF8、错误引号、未知格式、超大字节/字段/行和不合法单位值", () => {
    expect(() => parseWechatNativeReport(input("channelsWorks", Uint8Array.from([0xff, 0xfe])))).toThrow("REPORT_FORMAT");
    expect(() => parseWechatNativeReport(input("channelsWorks", encode('"未闭合')))).toThrow("REPORT_FORMAT");
    expect(() => parseWechatNativeReport(input("channelsWorks", encode('"关闭"x')))).toThrow("REPORT_FORMAT");
    expect(() => parseWechatNativeReport(input("officialContent", new Uint8Array([0x50, 0x4b])))).toThrow("REPORT_FORMAT");
    expect(() => parseWechatNativeReport(input("channelsWorks", new Uint8Array(25 * 1024 * 1024 + 1)))).toThrow("REPORT_TOO_LARGE");
    expect(() => parseWechatNativeReport(input("channelsWorks", encode("x".repeat(100001))))).toThrow("REPORT_TOO_LARGE");
    expect(() => parseWechatNativeReport(input("channelsWorks", works(10001)))).toThrow("REPORT_TOO_LARGE");
    expect(() => parseWechatNativeReport(input("channelsWorks", encode(new TextDecoder().decode(works()).replaceAll("25%", "101%"))))).toThrow("REPORT_SCHEMA");
    expect(() => parseWechatNativeReport(input("channelsWorks", encode(new TextDecoder().decode(works()).replaceAll("1.25秒", "-1秒"))))).toThrow("REPORT_SCHEMA");
  });
});
