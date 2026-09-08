import "server-only";
import {normalizeCell,parseDouyinWorkDetailRows,type DouyinWorkDetail} from "@creatoros/backend/application/collection/douyin-work-detail";
export * from "@creatoros/backend/application/collection/douyin-work-detail";
export interface ParseWorkListDeps {
  /** exceljs 模块(默认动态引入;server-only,不进客户端 bundle)。 */
  loadExcelJS?: () => Promise<typeof import("exceljs")>;
}
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
  return parseDouyinWorkDetailRows(rows);
}
