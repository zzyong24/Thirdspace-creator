'use client';

import {isDesktopRuntimeClient} from '@/lib/desktop-updater';

export type EditorFileOutcome = 'saved' | 'cancelled' | 'download-started';
const MAX_NATIVE_BYTES = 100 * 1024 * 1024;
let nativeSaveInFlight = false;

/** 保存已生成的同一份成稿；桌面直接交给系统保存面板，避免 WebKit 下载路径阻塞。 */
export async function saveEditorFile(blob: Blob, filename: string, assertCurrent: () => void): Promise<EditorFileOutcome> {
  assertCurrent();
  if (!isDesktopRuntimeClient()) {
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
    return 'download-started';
  }
  if (nativeSaveInFlight) throw new Error('已有保存面板打开，请先完成或取消。');
  if (!['text/html', 'image/png', 'application/zip'].includes(blob.type)) throw new Error('不支持的导出文件类型。');
  if (blob.size > MAX_NATIVE_BYTES) throw new Error('产物超过单次导出大小限制。');
  nativeSaveInFlight = true;
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pieces: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      pieces.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
    }
    const bytesBase64 = btoa(pieces.join(''));
    const {invoke} = await import('@tauri-apps/api/core');
    assertCurrent();
    const outcome = await invoke<'saved' | 'cancelled'>('export_workbench_artifact', {
      bytesBase64, mime: blob.type, suggestedName: filename,
    });
    if (outcome !== 'saved' && outcome !== 'cancelled') throw new Error('保存回执无效，请核对目标文件。');
    return outcome;
  } finally {
    nativeSaveInFlight = false;
  }
}

export function editorFileMessage(outcome: EditorFileOutcome): string {
  return outcome === 'saved' ? '文件已保存。' : outcome === 'cancelled' ? '已取消保存。' : '已开始下载。';
}
