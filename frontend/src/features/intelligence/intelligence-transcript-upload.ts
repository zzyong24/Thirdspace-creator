export const MAX_TRANSCRIPT_UPLOAD_BYTES = 2 * 1024 * 1024;

export type TranscriptUploadFormat = "txt" | "md" | "srt" | "vtt";

export interface PreparedTranscriptUpload {
  format: TranscriptUploadFormat;
  fileName: string;
  text: string;
}

const SUPPORTED_FORMATS = new Set<TranscriptUploadFormat>([
  "txt",
  "md",
  "srt",
  "vtt",
]);

function transcriptFormat(fileName: string): TranscriptUploadFormat {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension || !SUPPORTED_FORMATS.has(extension as TranscriptUploadFormat)) {
    throw new Error("仅支持 TXT、Markdown、SRT 或 VTT 文件");
  }
  return extension as TranscriptUploadFormat;
}

function normalizeSubtitleText(value: string): string {
  const lines = value.split("\n");
  const output: string[] = [];
  let skipMetadataBlock = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^(WEBVTT)(\s.*)?$/i.test(line)) continue;
    if (/^(NOTE|STYLE|REGION)(\s.*)?$/i.test(line)) {
      skipMetadataBlock = true;
      continue;
    }
    if (skipMetadataBlock) {
      if (!line) skipMetadataBlock = false;
      continue;
    }
    if (!line || /^\d+$/.test(line) || line.includes("-->")) continue;
    output.push(line.replace(/<[^>]+>/g, "").trim());
  }

  return output.filter(Boolean).join("\n").trim();
}

export async function prepareTranscriptUpload(
  file: File,
): Promise<PreparedTranscriptUpload> {
  const format = transcriptFormat(file.name);
  if (file.size > MAX_TRANSCRIPT_UPLOAD_BYTES) {
    throw new Error("逐字稿文件不能超过 2 MiB");
  }

  const decoded = (await file.text())
    .replace(/^\ufeff/, "")
    .replace(/\r\n?/g, "\n");
  if (decoded.includes("\ufffd")) {
    throw new Error("文件不是有效的 UTF-8 文本");
  }

  const text =
    format === "srt" || format === "vtt"
      ? normalizeSubtitleText(decoded)
      : decoded.trim();
  if (!text) {
    throw new Error("文件没有可用正文");
  }
  if (
    text.length > 500_000 ||
    new TextEncoder().encode(text).byteLength > MAX_TRANSCRIPT_UPLOAD_BYTES
  ) {
    throw new Error("逐字稿文件不能超过 2 MiB");
  }

  return {
    format,
    fileName: file.name,
    text,
  };
}
