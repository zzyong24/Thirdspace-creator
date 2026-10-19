import { blobToDataUrl } from "./imageData";

export const AVATAR_OUTPUT_SIZE = 256;
export const AVATAR_MAX_FILE_BYTES = 8 * 1024 * 1024;
export const AVATAR_MIN_EDGE = 64;
export const AVATAR_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function normalizeAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    if (Math.min(bitmap.width, bitmap.height) < AVATAR_MIN_EDGE) {
      throw new Error(`头像尺寸过小，宽和高都不能少于 ${AVATAR_MIN_EDGE} 像素`);
    }
    const canvas = createEl("canvas");
    canvas.width = AVATAR_OUTPUT_SIZE;
    canvas.height = AVATAR_OUTPUT_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前环境无法处理头像图片");
    const sourceSize = Math.min(bitmap.width, bitmap.height);
    const sourceX = (bitmap.width - sourceSize) / 2;
    const sourceY = (bitmap.height - sourceSize) / 2;
    context.drawImage(bitmap, sourceX, sourceY, sourceSize, sourceSize, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
    return blobToDataUrl(await canvasToBlob(canvas, "image/webp", .84), "头像读取失败");
  } finally {
    bitmap.close();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("头像压缩失败，请更换图片后重试")), type, quality));
}
