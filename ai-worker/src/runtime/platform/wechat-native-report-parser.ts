import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import * as XLSX from "xlsx";
import {
  platformNativeReportPayload,
  type NativeReportKind,
  type NativeReportPayload,
} from "@creatoros/contract";

export type WechatNativeReportInput = Pick<
  NativeReportPayload, "platform" | "kind" | "filename" | "sourcePath" | "selection"
> & { bytes: Uint8Array; expectedRows?: number };

export class WechatNativeReportError extends Error {
  constructor(readonly code: "REPORT_TOO_LARGE" | "REPORT_FORMAT" | "REPORT_SCHEMA" | "REPORT_DATE_RANGE" | "REPORT_ROW_COUNT_MISMATCH") {
    super(code);
    this.name = "WechatNativeReportError";
  }
}

type Unit = NativeReportPayload["tables"][number]["columns"][number]["unit"];
type Table = NativeReportPayload["tables"][number];
type Cell = { raw: string; number?: number; serialDate?: string };
type Field = readonly [label: string, unit: Unit];
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_ROWS = 10000;
const MAX_COLUMNS = 32;
const MAX_CELL = 100000;
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * SEMANTIC_BOUNDARY_ALLOW: 已实测原生报表的有限协议/单位和日期校验，
 * 不理解内容语义、不选作品、不推断账号归属或指标累计口径。
 * 仅消费调用者提供的字节；不接触浏览器、文件系统、登录环境或数据库。
 */
const FIELDS: Record<NativeReportKind, readonly Field[]> = {
  officialContent: [],
  officialFollowers: [
    ["时间", "date"], ["新关注人数", "people"], ["取消关注人数", "people"],
    ["净增关注人数", "signedCount"], ["累积关注人数", "people"],
  ],
  channelsDaily: [
    ["时间", "date"], ["播放", "count"], ["推荐", "count"], ["喜欢", "count"],
    ["评论", "count"], ["分享", "count"], ["关注", "people"],
  ],
  channelsFollowers: [
    ["时间", "date"], ["净增关注", "signedCount"], ["新增关注", "people"],
    ["取消关注", "people"], ["关注者总数", "people"],
  ],
  channelsWorks: [
    ["视频描述", "text"], ["视频ID", "opaqueId"], ["发布时间", "date"],
    ["完播率", "ratio"], ["平均播放时长", "seconds"], ["播放量", "count"],
    ["推荐", "count"], ["喜欢", "count"], ["评论量", "count"],
    ["分享量", "count"], ["关注量", "people"], ["转发聊天和朋友圈", "count"],
    ["设为铃声", "count"], ["设为状态", "count"], ["设为朋友圈封面", "count"],
    ["企微链接点击次数", "count"], ["企微链接点击人数", "people"],
    ["添加到通讯录次数", "count"], ["添加到通讯录人数", "people"],
  ],
};
const CONTENT_BLOCKS: readonly {
  key: string; label: string; offset: number; fields: readonly Field[]; statistical: boolean;
}[] = [
  { key: "readTrend", label: "阅读趋势", offset: 1, statistical: true,
    fields: [["日期", "date"], ["渠道", "text"], ["阅读人数", "people"]] },
  { key: "interactionTrend", label: "分享等趋势", offset: 5, statistical: true,
    fields: [["日期", "date"], ["分享人数", "people"], ["跳转阅读原文人数", "people"],
      ["微信收藏人数", "people"], ["发表篇数", "count"]] },
  { key: "readSources", label: "阅读来源", offset: 11, statistical: false,
    fields: [["传播渠道", "text"], ["发表日期", "date"], ["内容标题", "text"],
      ["阅读人数", "people"], ["阅读人数占比", "ratio"]] },
];
const PATHS: Record<NativeReportKind, NativeReportPayload["sourcePath"]> = {
  officialContent: "/misc/appmsganalysis", officialFollowers: "/misc/useranalysis",
  channelsDaily: "/platform/statistic/post", channelsFollowers: "/platform/statistic/follower",
  channelsWorks: "/platform/statistic/post",
};
const LABELS: Record<NativeReportKind, string> = {
  officialContent: "公众号内容分析", officialFollowers: "公众号用户增长",
  channelsDaily: "全部视频每日数据", channelsFollowers: "关注者增长", channelsWorks: "单篇视频",
};

function fail(code: WechatNativeReportError["code"]): never { throw new WechatNativeReportError(code); }
function cell(raw: string, number?: number, serialDate?: string): Cell {
  if (raw.length > MAX_CELL) fail("REPORT_TOO_LARGE");
  return { raw, number, serialDate };
}
function datePart(raw: string): string {
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(raw);
  if (!match) fail("REPORT_DATE_RANGE");
  const day = [match[1], match[2]!.padStart(2, "0"), match[3]!.padStart(2, "0")].join("-");
  const parsed = new Date(day + "T00:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) fail("REPORT_DATE_RANGE");
  if (!match[4]) return day;
  if (Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6] ?? "0") > 59) fail("REPORT_DATE_RANGE");
  return day + "T" + match[4].padStart(2, "0") + ":" + match[5] + ":" + (match[6] ?? "00") + "+08:00";
}
function normalized(input: Cell, unit: Unit): Table["rows"][number][number] {
  const raw = input.raw, text = raw.trim();
  if (text === "" || text === "-") return { raw, value: null };
  if (unit === "text" || unit === "opaqueId") return { raw, value: raw };
  if (unit === "date") return { raw, value: input.serialDate ?? datePart(text) };
  let value: number;
  if (input.number !== undefined) value = input.number;
  else {
    let numeric = text;
    if (unit === "ratio" && /%$/.test(numeric)) {
      numeric = numeric.slice(0, -1).trim();
      if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(numeric)) fail("REPORT_SCHEMA");
      value = Number(numeric) / 100;
    } else {
      if (unit === "seconds") numeric = numeric.replace(/秒$/, "").trim();
      if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(numeric)) fail("REPORT_SCHEMA");
      value = Number(numeric);
    }
  }
  if (!Number.isFinite(value) || (unit !== "signedCount" && value < 0) ||
      (unit === "ratio" && value > 1) ||
      (["people", "count", "signedCount"].includes(unit) && !Number.isSafeInteger(value))) fail("REPORT_SCHEMA");
  return { raw, value };
}
function table(key: string, label: string, fields: readonly Field[], rows: readonly Cell[][]): Table {
  if (rows.length > MAX_ROWS || fields.length > MAX_COLUMNS) fail("REPORT_TOO_LARGE");
  return {
    key, label,
    columns: fields.map(([name, unit]) => ({ key: name, label: name, unit })),
    rows: rows.map(row => {
      if (row.length !== fields.length) fail("REPORT_SCHEMA");
      return row.map((value, index) => normalized(value, fields[index]![1]));
    }),
  };
}
function headerMatches(row: readonly Cell[] | undefined, fields: readonly Field[]): boolean {
  return !!row && row.length === fields.length && fields.every(([name], index) => row[index]!.raw.trim() === name);
}
function decode(bytes: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""); }
  catch { return fail("REPORT_FORMAT"); }
}

/** 有限状态 CSV 解码：保留引号内逗号、双引号及 CR/LF，不按物理行拆作品。 */
function csv(text: string): Cell[][] {
  const rows: Cell[][] = [];
  let row: Cell[] = [], field = "", quoted = false, closedQuote = false;
  const endField = () => {
    row.push(cell(field)); field = ""; closedQuote = false;
    if (row.length > MAX_COLUMNS) fail("REPORT_TOO_LARGE");
  };
  const endRow = () => {
    endField();
    if (row.some(value => value.raw !== "")) rows.push(row);
    row = [];
    if (rows.length > MAX_ROWS + 3) fail("REPORT_TOO_LARGE");
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index++; } else { quoted = false; closedQuote = true; }
      } else field += char;
    } else if (char === ",") endField();
    else if (char === "\n" || char === "\r") {
      endRow();
      if (char === "\r" && text[index + 1] === "\n") index++;
    } else if (char === '"') {
      if (field !== "" || closedQuote) fail("REPORT_FORMAT");
      quoted = true;
    } else {
      if (closedQuote) fail("REPORT_FORMAT");
      field += char;
    }
    if (field.length > MAX_CELL) fail("REPORT_TOO_LARGE");
  }
  if (quoted) fail("REPORT_FORMAT");
  if (field !== "" || row.length || closedQuote) endRow();
  return rows;
}

function parseCsv(kind: NativeReportKind, text: string): Table[] {
  const rows = csv(text), fields = FIELDS[kind];
  const header = kind === "channelsWorks" ? 0 : 2;
  if (!headerMatches(rows[header], fields)) fail("REPORT_SCHEMA");
  return [table(kind, LABELS[kind], fields, rows.slice(header + 1))];
}

function parseHtml(text: string): Table[] {
  const dom = new JSDOM(text); // 默认无 runScripts、无资源加载；只提取表格纯文本。
  try {
    const tables = dom.window.document.querySelectorAll("table");
    if (tables.length !== 1) fail("REPORT_SCHEMA");
    const rows: Cell[][] = [];
    for (const tr of tables[0]!.querySelectorAll("tr")) {
      if (tr.closest("table") !== tables[0]) fail("REPORT_SCHEMA");
      const values = [...tr.children].filter(node => node.tagName === "TD" || node.tagName === "TH");
      if (values.length > MAX_COLUMNS) fail("REPORT_TOO_LARGE");
      if (values.length) rows.push(values.map(node => cell(node.textContent ?? "")));
      if (rows.length > MAX_ROWS + 4) fail("REPORT_TOO_LARGE");
    }
    const fields = FIELDS.officialFollowers;
    const header = rows.slice(0, 4).findIndex(row => headerMatches(row, fields));
    if (header < 0) fail("REPORT_SCHEMA");
    return [table("officialFollowers", LABELS.officialFollowers, fields, rows.slice(header + 1))];
  } finally { dom.window.close(); }
}

function workbookCell(sheet: XLSX.WorkSheet, row: number, column: number, unit?: Unit): Cell {
  const value = sheet[XLSX.utils.encode_cell({ r: row, c: column })] as XLSX.CellObject | undefined;
  if (!value || value.t === "z") return cell("");
  if (value.f || !["s", "n", "b"].includes(value.t)) fail("REPORT_SCHEMA");
  const raw = value.w ?? String(value.v ?? "");
  const numeric = value.t === "n" && typeof value.v === "number" ? value.v : undefined;
  let serialDate: string | undefined;
  // SEMANTIC_BOUNDARY_ALLOW: 原生BIFF发表日期实测YYYYMMDD；仅解码日期协议，保留raw。
  if (unit === "date" && value.t === "s" && /^\d{8}$/.test(raw)) {
    serialDate = datePart(raw.slice(0,4)+"-"+raw.slice(4,6)+"-"+raw.slice(6,8));
  }
  if (unit === "date" && numeric !== undefined) {
    const date = XLSX.SSF.parse_date_code(numeric);
    if (!date) fail("REPORT_DATE_RANGE");
    serialDate = datePart([String(date.y), String(date.m).padStart(2, "0"), String(date.d).padStart(2, "0")].join("-"));
  }
  return cell(raw, numeric, serialDate);
}
function parseBiff(bytes: Uint8Array): { tables: Table[]; statistical: Table[] } {
  let book: XLSX.WorkBook;
  try { book = XLSX.read(bytes, { type: "array", cellText: true, cellHTML: false, cellFormula: true, bookVBA: false, WTF: true, nodim: true, sheetRows: MAX_ROWS + 4 }); }
  catch { return fail("REPORT_FORMAT"); }
  if (book.SheetNames.length !== 1) fail("REPORT_SCHEMA");
  const sheet = book.Sheets[book.SheetNames[0]!]!;
  if (!sheet["!ref"]) fail("REPORT_SCHEMA");
  const range = XLSX.utils.decode_range(sheet["!fullref"] ?? sheet["!ref"]);
  if (range.e.r > MAX_ROWS + 3 || range.e.c >= MAX_COLUMNS) fail("REPORT_TOO_LARGE");
  const usedHeaderColumns = new Set<number>();
  for (const block of CONTENT_BLOCKS) {
    const header = block.fields.map((_, index) => workbookCell(sheet, 2, block.offset + index));
    if (!headerMatches(header, block.fields)) fail("REPORT_SCHEMA");
    block.fields.forEach((_, index) => usedHeaderColumns.add(block.offset + index));
  }
  // 已核对的横向区块之外出现列名/行数据属于格式漂移，不能静默漏字段。
  for (let column = 0; column <= range.e.c; column++) {
    if (usedHeaderColumns.has(column)) continue;
    for (let row = 2; row <= range.e.r; row++) if (workbookCell(sheet, row, column).raw.trim()) fail("REPORT_SCHEMA");
  }
  const tables = CONTENT_BLOCKS.map(block => {
    const rows: Cell[][] = [];
    for (let row = 3; row <= range.e.r; row++) {
      const values = block.fields.map(([, unit], index) => workbookCell(sheet, row, block.offset + index, unit));
      if (values.every(value => value.raw.trim() === "")) continue;
      rows.push(values);
    }
    return table(block.key, block.label, block.fields, rows);
  });
  return { tables, statistical: tables.filter((_, index) => CONTENT_BLOCKS[index]!.statistical) };
}

function validateWindow(tables: readonly Table[], selection: NativeReportPayload["selection"], daily: boolean): void {
  const first = datePart(selection.startDate), last = datePart(selection.endDate);
  if (first.length !== 10 || last.length !== 10 || first > last || selection.timeZone !== "Asia/Shanghai" ||
      selection.meaning !== (daily ? "statisticsDates" : "publishedDates")) fail("REPORT_DATE_RANGE");
  const start = Date.parse(first + "T00:00:00Z"), end = Date.parse(last + "T00:00:00Z");
  const days = (end - start) / 86400000 + 1;
  if (daily && days > MAX_ROWS) fail("REPORT_TOO_LARGE");
  for (const current of tables) {
    const dateIndex = current.columns.findIndex(column => column.unit === "date");
    if (dateIndex < 0) fail("REPORT_SCHEMA");
    const seen = new Set<string>();
    for (const row of current.rows) {
      const value = row[dateIndex]!.value;
      if (typeof value !== "string") fail("REPORT_DATE_RANGE");
      const day = value.slice(0, 10);
      if (day < first || day > last) fail("REPORT_DATE_RANGE");
      if (daily && current.key !== "readTrend" && seen.has(day)) fail("REPORT_DATE_RANGE");
      seen.add(day);
    }
    // 阅读趋势同一天按渠道多行；其日期集合仍须完整匹配统计日期选择。
    if (daily && (seen.size !== days || !seen.has(first) || !seen.has(last))) fail("REPORT_DATE_RANGE");
  }
}

/** 错误只返回稳定代码，不携带用户报表正文、数值、文件内容或账号ID。 */
export function parseWechatNativeReport(input: WechatNativeReportInput): NativeReportPayload {
  try {
    if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) fail("REPORT_FORMAT");
    if (input.bytes.byteLength > MAX_BYTES) fail("REPORT_TOO_LARGE");
    if (!Object.hasOwn(FIELDS, input.kind) || input.sourcePath !== PATHS[input.kind] ||
        input.platform !== (input.kind.startsWith("official") ? "wechatOfficial" : "wechatVideo") ||
        !input.filename || input.filename.length > 200 || /[/\\\x00-\x1f]/.test(input.filename)) fail("REPORT_SCHEMA");
    const work = input.kind === "channelsWorks";
    let tables: Table[], statistical: Table[];
    const ole = OLE.every((byte, index) => input.bytes[index] === byte);
    if (ole) {
      if (input.kind !== "officialContent") fail("REPORT_FORMAT");
      ({ tables, statistical } = parseBiff(input.bytes));
    } else {
      const text = decode(input.bytes);
      const html = /^\s*<(?:!doctype\s+html|html|table)(?:\s|>)/i.test(text);
      if (html) {
        if (input.kind !== "officialFollowers") fail("REPORT_FORMAT");
        tables = parseHtml(text); statistical = tables;
      } else {
        if (input.platform !== "wechatVideo") fail("REPORT_FORMAT");
        tables = parseCsv(input.kind, text); statistical = tables;
      }
    }
    if (tables.reduce((count, current) => count + current.rows.length, 0) > MAX_ROWS) fail("REPORT_TOO_LARGE");
    if (input.expectedRows !== undefined && (!work || !Number.isSafeInteger(input.expectedRows) ||
        input.expectedRows < 0 || tables.length !== 1 || tables[0]!.rows.length !== input.expectedRows)) fail("REPORT_ROW_COUNT_MISMATCH");
    validateWindow(statistical, input.selection, !work);
    const payload = {
      platform: input.platform, kind: input.kind, scope: work ? "workSelection" : "accountDaily",
      selection: input.selection, accumulation: work ? "sourceUnspecified" : "daily",
      sourcePath: input.sourcePath, filename: input.filename,
      sha256: createHash("sha256").update(input.bytes).digest("hex"), receivedBytes: input.bytes.byteLength,
      tables,
    };
    const parsed = platformNativeReportPayload.safeParse(payload);
    if (!parsed.success) fail("REPORT_SCHEMA");
    return parsed.data;
  } catch (error) {
    if (error instanceof WechatNativeReportError) throw error;
    return fail("REPORT_SCHEMA");
  }
}
