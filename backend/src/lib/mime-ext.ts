// mimeType → 文件扩展名(带前导点) —— 单一真值,前后端不直接依赖 mime-types 库(避 lockfile)。
//
// 用途:让磁盘上的对象有真 ext(Mac Finder / 系统文件夹预览靠 ext,不靠 mime),
// 以及「保存名」/`Content-Disposition` 友好显示。**只返常见 + 安全的**;
// 未知 mime → null(调用方自行决定:不加 ext / 兜底 `.bin`),绝不瞎猜。
//
// 维护规则:新 mime 进表时务必加单测(下方 ai-error-humanize.test 范式同款)。

const TABLE: Readonly<Record<string, string>> = {
  // 图片
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/tiff": "tiff",
  // 视频
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
  // 音频
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/flac": "flac",
  // 文档
  "application/pdf": "pdf",
  "application/json": "json",
  "application/zip": "zip",
  "application/x-tar": "tar",
  "application/gzip": "gz",
  "application/octet-stream": "bin",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/html": "html",
  "text/csv": "csv",
  // 字幕
  "application/x-subrip": "srt",
  "text/vtt": "vtt",
};

/**
 * mimeType → 扩展名(带前导点,例:`image/png` → `".png"`);未知 mime → null。
 *
 * @param mimeType 形如 `"image/png"`(可带 `; charset=…` 参数,自动剥掉)。
 * @returns `.ext`(带点),或 null。
 */
export function extForMime(mimeType: string | null | undefined): string | null {
  if (!mimeType) return null;
  const base = mimeType.split(";", 1)[0]!.trim().toLowerCase();
  if (!base) return null;
  const ext = TABLE[base];
  return ext ? `.${ext}` : null;
}

/**
 * 备用:从文件名的末段推断扩展名(无 mimeType 时用)。已有 ext(非空)→ 原样返。
 *
 * @param fileName 例:`"foo.png"` / `"bar"` / `null`
 * @returns 带前导点的 ext(例:`".png"` / `null`),或 null(无法判断)。
 */
export function extForFileName(fileName: string | null | undefined): string | null {
  if (!fileName) return null;
  const m = /\.([a-z0-9]{1,5})$/i.exec(fileName);
  return m ? `.${m[1]!.toLowerCase()}` : null;
}