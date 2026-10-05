export function imageMimeType(extension: string): string {
  const types: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    svg: "image/svg+xml", bmp: "image/bmp", avif: "image/avif"
  };
  return types[extension.toLowerCase()] ?? "application/octet-stream";
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

export function blobToDataUrl(blob: Blob, errorMessage = "图片读取失败"): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error(errorMessage)));
    reader.addEventListener("error", () => reject(reader.error ?? new Error(errorMessage)));
    reader.readAsDataURL(blob);
  });
}
