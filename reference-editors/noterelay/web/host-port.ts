export type Delivery = {blob: Blob; plainText?: string; filename?: string};
export const rich = (html: string, plainText: string): Delivery => ({blob: new Blob([html], {type: 'text/html'}), plainText});
export function png(dataUrl: string, filename?: string): Delivery {
  const [header, payload] = dataUrl.split(',', 2);
  if (!header?.startsWith('data:image/png;base64') || !payload) throw new Error('PNG 数据无效');
  return {blob: new Blob([Uint8Array.from(atob(payload), c => c.charCodeAt(0))], {type: 'image/png'}), filename};
}
