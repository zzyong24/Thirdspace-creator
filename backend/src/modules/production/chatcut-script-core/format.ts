/** 来源：04格式/逐行parser、34轨道别名。只改本地单位t和明确身份元信息；未知行不可静默跳过。
 * SEMANTIC_BOUNDARY_ALLOW: 格式与明确ID解析，不理解文本语义或自动选择来源。
 */
export const SCRIPT_BODY_MARKER = '<!-- markdown-state:body -->';
export const TRACK_ALIAS_RE = /^([VA])([1-9]\d*)$/;
export const ROW_PATTERNS = {
  trackHeader: /^##\s+([VAP][1-9]\d*)(?:\s+—\s+.*?)?(?:\s+<!--.*-->)?\s*$/,
  sourceHeader: /^###\s+(.+?)\s+<!-- markdown-state:source:([^:]+):([^ ]+) -->\s*$/,
  segment: /^\[s(\d+)\]\s+(.*)$/,
  gap: /^\[gap\s+(~~)?(\d+)t(~~)?\]\s*$/,
  clip: /^\[c(\d+)\]\s+(\d+)t\s+source=(\d+)\.\.(\d+)t\s+rate=(\d+(?:\.\d+)?)(?:\s+<!-- markdown-state:item:([^ ]+) -->)?\s*$/,
  fresh: /^\[clip source=(\d+)\.\.(\d+)t rate=(\d+(?:\.\d+)?)\]\s*$/,
  silence: /^\[silence=(\d+)t\]\s+<!-- markdown-state:range:(\d+)\.\.(\d+) -->\s*$/,
  comment: /^<!--[\s\S]*?-->$/,
  speaker: /^@(\S.*)$/,
};
export function decodeIdentity(value: string): string | null { try { return decodeURIComponent(value); } catch { return null; } }
export function encodeIdentity(value: string): string { return encodeURIComponent(value); }
export function markerValues(md: string, name: string): string[] {
  const header = md.includes(SCRIPT_BODY_MARKER) ? md.slice(0, md.indexOf(SCRIPT_BODY_MARKER)) : md;
  return [...header.matchAll(new RegExp(`<!--\\s*markdown-state:${name}:([^\\n]*?)\\s*-->`, 'g'))].map(m => m[1]!.trim());
}
export function unstrike(value: string): { line: string; dropped: boolean } {
  const match = /^~~(.+)~~$/.exec(value);
  return match ? { line: match[1]!.trim(), dropped: true } : { line: value, dropped: false };
}
