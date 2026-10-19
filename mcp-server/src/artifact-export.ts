import { createHash } from "node:crypto";
import { open, unlink } from "node:fs/promises";

export async function saveArtifactExport(value: unknown, format: string, output: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("产物导出响应缺少 data 对象。");
  }
  const result = value as Record<string, unknown>;
  if (result.format !== format) throw new Error("产物导出 format 与请求不一致。");
  if (result.encoding !== "base64" || typeof result.data !== "string") {
    throw new Error("产物导出必须返回 base64 字符串。");
  }
  const bytes = Buffer.from(result.data, "base64");
  // Node 解码会容忍非法字符、缺失填充和非零填充位；回编码只接受规范 base64。
  if (bytes.toString("base64") !== result.data) {
    throw new Error("产物导出 base64 编码无效。");
  }
  if (!Number.isSafeInteger(result.size) || result.size !== bytes.length) {
    throw new Error("产物导出 size 与实际字节数不一致。");
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (typeof result.hash !== "string" || !/^[a-f\d]{64}$/i.test(result.hash) || result.hash.toLowerCase() !== hash) {
    throw new Error("产物导出 hash 与实际字节的 SHA-256 不一致。");
  }

  // 仅 output 决定本地路径；服务端 filename 只供展示。open 失败时不清理已有文件。
  const file = await open(output, "wx");
  try {
    await file.writeFile(bytes);
    await file.close();
  } catch (error) {
    // 即使写入或首次 close 失败，也先释放句柄再清理本次创建的半文件。
    await file.close().catch(() => undefined);
    try {
      await unlink(output);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], `产物导出失败，清理输出文件失败: ${output}`);
    }
    throw error;
  }
  return {
    output,
    metadata: result.metadata,
    format: result.format,
    mime: result.mime,
    filename: result.filename,
    size: bytes.length,
    hash,
    sourceHash: result.sourceHash,
    rendererPolicy: result.rendererPolicy,
    diagnostics: result.diagnostics,
  };
}
