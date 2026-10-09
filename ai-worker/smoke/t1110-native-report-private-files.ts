/**
 * 只读本机实文件；仅输出格式/字节/摘要/表头/行数，不输出作品、ID或指标值。
 * 运行：pnpm --filter @creatoros/backend exec tsx ../ai-worker/smoke/t1110-native-report-private-files.ts [公众号目录] [视频号目录]
 * 缺失文件、摘要漂移或新解析器不通过均真实失败，不能用历史metadata代签。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseWechatNativeReport, type WechatNativeReportInput } from "../src/runtime/platform/wechat-native-report-parser";

const directories = [
  process.argv[2] ?? "/Users/zyongzhu/CreatorOS-local-acceptance/wechat-browser-export-20261009",
  process.argv[3] ?? "/Users/zyongzhu/CreatorOS-local-acceptance/channels-native-export-20261009",
];
type Witness = { kind: WechatNativeReportInput["kind"]; directory: number; filename: string;
  bytes: number; sha256: string; rowCounts: number[]; range: readonly [string, string] };
const witnesses: Witness[] = [
  { kind: "officialContent", directory: 0, filename: "公众号-内容分析数据.xls", bytes: 45056,
    sha256: "3eb0c69ff39436218960cb93f31bb90414f2d5659f340e03d5f7f1c7440cffa9",
    rowCounts: [240, 30, 60], range: ["2026-09-09", "2026-10-08"] },
  { kind: "officialFollowers", directory: 0, filename: "公众号-用户增长数据.xls", bytes: 7401,
    sha256: "8b0b502db829d7cf653edd5eab7e55a7856c6b303c672b491e50841d8fb62098",
    rowCounts: [31], range: ["2026-09-08", "2026-10-08"] },
  { kind: "channelsDaily", directory: 1, filename: "视频号-全部视频数据.csv", bytes: 1100,
    sha256: "21a6e7523ddcac8d33267d2a12329a0c07221a9ed843b8fc0ef41d8f699165e6",
    rowCounts: [30], range: ["2026-09-09", "2026-10-08"] },
  { kind: "channelsFollowers", directory: 1, filename: "视频号-关注者增长数据.csv", bytes: 998,
    sha256: "6733792b2d42a34387826280098024b2817dee66c971379485bf59788f4ec3ad",
    rowCounts: [30], range: ["2026-09-09", "2026-10-08"] },
  { kind: "channelsWorks", directory: 1, filename: "视频号-单篇视频数据.csv", bytes: 5102,
    sha256: "dddc5af37a11792c59acecdfa0a1a324817067d494cea3bc1da01086d3f246eb",
    rowCounts: [13], range: ["2026-09-09", "2026-10-08"] },
];
let failures = 0;
for (const witness of witnesses) {
  let bytes: Uint8Array;
  try { bytes = await readFile(join(directories[witness.directory]!, witness.filename)); }
  catch {
    failures++;
    process.stdout.write(JSON.stringify({ kind: witness.kind, status: "FAILED", code: "FILE_UNAVAILABLE" }) + "\n");
    continue;
  }
  try {
    const work = witness.kind === "channelsWorks", official = witness.kind.startsWith("official");
    const report = parseWechatNativeReport({
      kind: witness.kind, bytes, platform: official ? "wechatOfficial" : "wechatVideo",
      filename: witness.filename, sourcePath: witness.kind === "officialContent" ? "/misc/appmsganalysis"
        : witness.kind === "officialFollowers" ? "/misc/useranalysis"
          : witness.kind === "channelsFollowers" ? "/platform/statistic/follower" : "/platform/statistic/post",
      selection: { startDate: witness.range[0], endDate: witness.range[1], timeZone: "Asia/Shanghai",
        meaning: work ? "publishedDates" : "statisticsDates" },
    });
    if (report.receivedBytes !== witness.bytes || report.sha256 !== witness.sha256 ||
        JSON.stringify(report.tables.map(table => table.rows.length)) !== JSON.stringify(witness.rowCounts)) {
      failures++;
      process.stdout.write(JSON.stringify({ kind: witness.kind, status: "FAILED", code: "WITNESS_METADATA_MISMATCH" }) + "\n");
      continue;
    }
    const nativeIdIndex = report.tables[0]!.columns.findIndex(column => column.unit === "opaqueId");
    const idCount = nativeIdIndex < 0 ? undefined :
      new Set(report.tables[0]!.rows.map(row => row[nativeIdIndex]!.value)).size;
    if (work && idCount !== 13) {
      failures++;
      process.stdout.write(JSON.stringify({ kind: witness.kind, status: "FAILED", code: "WITNESS_ID_COUNT_MISMATCH" }) + "\n");
      continue;
    }
    process.stdout.write(JSON.stringify({
      kind: witness.kind, status: "PASS", receivedBytes: report.receivedBytes, sha256: report.sha256,
      scope: report.scope, accumulation: report.accumulation, selection: report.selection, nativeIdCount: idCount,
      tables: report.tables.map(table => ({
        key: table.key, headers: table.columns.map(column => ({ label: column.label, unit: column.unit })),
        rows: table.rows.length,
      })),
    }) + "\n");
  } catch (error) {
    failures++;
    const code = error instanceof Error && /^REPORT_[A-Z_]+$/.test(error.message) ? error.message : "PARSER_FAILED";
    process.stdout.write(JSON.stringify({ kind: witness.kind, status: "FAILED", code }) + "\n");
  }
}
process.exitCode = failures === 0 ? 0 : 1;
