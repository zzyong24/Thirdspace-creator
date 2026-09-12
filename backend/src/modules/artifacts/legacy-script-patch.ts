import {createHash} from "node:crypto";

/** 纯文稿的共享读取顺序；不判断语义、不分段。 */
export function extractLegacyScriptText(contentText: string | null | undefined, contentData: unknown): string {
  const data = contentData && typeof contentData === "object" ? contentData as Record<string, unknown> : {};
  return [data.transcript, contentText, data.body].find((value): value is string => typeof value === "string" && Boolean(value.trim())) ?? "";
}
export const legacyScriptHash = (text: string): string => createHash("sha256").update(text).digest("hex");
export const LEGACY_SCRIPT_RANGE_PREFIX = "script-text-range:";
/** SEMANTIC_BOUNDARY_ALLOW: 只验证模型已选择的原文逐字唯一命中，不推断创作目标。范围为 JS UTF-16 索引。 */
export function createLegacyScriptRange(text: string, original: string): string {
  const start = text.indexOf(original);
  if (!original.trim() || start < 0 || text.indexOf(original, start + 1) >= 0 || original === text) throw new Error("原文片段必须在当前稿中逐字唯一出现，且不能是整篇稿件");
  return `${LEGACY_SCRIPT_RANGE_PREFIX}${legacyScriptHash(text)}:${start}:${start + original.length}`;
}
export function applyLegacyScriptRange(text: string, ref: string, original: string, replacement: string): string {
  const match = /^script-text-range:([a-f0-9]{64}):(0|[1-9]\d*):(0|[1-9]\d*)$/.exec(ref);
  const start = Number(match?.[2]), end = Number(match?.[3]);
  if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > text.length || match[1] !== legacyScriptHash(text) || text.slice(start, end) !== original || createLegacyScriptRange(text, original) !== ref) throw new Error("原文片段锚点已失效，请重新读取当前稿");
  if (!replacement.trim() || replacement === original) throw new Error("局部改稿没有可写入的修改");
  return text.slice(0, start) + replacement + text.slice(end);
}
