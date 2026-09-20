import { workbenchResultSchema } from "@creatoros/contract/agent-workbench";
import type { AgenticToolOutcome } from "@creatoros/contract/execution-worker";

const PAGE_CHARACTERS = 12_000; // 与 backend 现有 pageChatToolResult 的原 JSON 字符索引一致。
const MAX_PROGRESS_BYTES = 4096;
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;
export type PiResultContent = { type: "text"; text: string } | { type: "image"; mimeType: string; data: string };
export interface PiReceiptProjection {
  content: PiResultContent[];
  details: { toolCallId: string; totalCharacters: number; nextOffset: number | null };
}
export interface PiMediaResolver {
  /** 后端按当前账号、任务和租约解析 dataRef；本模块不直接访问文件或数据库。 */
  resolveImage?: (dataRef: string) => Promise<{ mimeType: string; data: string }>;
}

function utf8Prefix(text: string, maxBytes: number): string {
  let bytes = 0;
  let output = "";
  for (const point of text) {
    const size = Buffer.byteLength(point, "utf8");
    if (bytes + size > maxBytes) break;
    output += point;
    bytes += size;
  }
  return output;
}

export function boundProgressText(text: string): string {
  if (Buffer.byteLength(text, "utf8") <= MAX_PROGRESS_BYTES) return text;
  const suffix = "\n[进度详情已截短]";
  return utf8Prefix(text, MAX_PROGRESS_BYTES - Buffer.byteLength(suffix, "utf8")) + suffix;
}

/** 只投影给 Pi；调用方须先将完整原 outcome 结算到 executionCalls，回读继续用原 toolCallId。 */
export async function projectReceiptForPi(outcome: AgenticToolOutcome, toolCallId: string, ports: PiMediaResolver): Promise<PiReceiptProjection> {
  if (!toolCallId || toolCallId.length > 256) throw new Error("TOOL_CALL_ID_INVALID");
  const text = JSON.stringify(outcome);
  const nextOffset = text.length > PAGE_CHARACTERS ? PAGE_CHARACTERS : null;
  const notice = nextOffset === null ? "" : `\n[结果未显示完。调用 tool.result.read，toolCallId=${JSON.stringify(toolCallId)}，offset=${nextOffset} 继续读取原回执；不要重做原操作。]`;
  const content: PiResultContent[] = [{ type: "text", text: text.slice(0, PAGE_CHARACTERS) + notice }];
  const rawWorkbench = outcome.data && typeof outcome.data === "object" && !Array.isArray(outcome.data)
    ? (outcome.data as Record<string, unknown>).workbench : undefined;
  if (rawWorkbench) {
    const result = workbenchResultSchema.parse(rawWorkbench);
    if (result.status === "succeeded") for (const item of result.content) {
      if (item.type !== "image") continue;
      if (!ports.resolveImage) throw new Error("MEDIA_RESOLVER_UNAVAILABLE");
      const media = await ports.resolveImage(item.dataRef);
      if (media.mimeType !== item.mediaType || !media.mimeType.startsWith("image/") ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(media.data) ||
          Buffer.byteLength(media.data, "base64") > MAX_INLINE_IMAGE_BYTES) throw new Error("MEDIA_RESULT_INVALID");
      content.push({ type: "image", mimeType: media.mimeType, data: media.data });
    }
  }
  return { content, details: { toolCallId, totalCharacters: text.length, nextOffset } };
}
