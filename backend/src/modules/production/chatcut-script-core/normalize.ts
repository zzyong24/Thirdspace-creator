/** 来源：28-code normalizeWithMap / stripWhitespaceFromNormalized；仅把首命中改为唯一命中。
 * SEMANTIC_BOUNDARY_ALLOW: 仅恢复同一冻结素材的拼错协议锚点，不跨素材、不做语义相似或创作删留。
 */
export function normalizeWithMap(text: string): { norm: string; normToOrig: number[] } {
  const norm: string[] = [], normToOrig: number[] = []; let lastWasSpace = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!.toLowerCase();
    if (/[\p{P}\p{S}\s]/u.test(ch)) {
      if (!lastWasSpace) { norm.push(' '); normToOrig.push(i); lastWasSpace = true; }
    } else { norm.push(ch); normToOrig.push(i); lastWasSpace = false; }
  }
  while (norm.at(-1) === ' ') { norm.pop(); normToOrig.pop(); }
  return { norm: norm.join(''), normToOrig };
}
export function stripWhitespaceFromNormalized(n: { norm: string; normToOrig: number[] }) {
  const norm: string[] = [], normToOrig: number[] = [];
  for (let i = 0; i < n.norm.length; i++) if (n.norm[i] !== ' ') { norm.push(n.norm[i]!); normToOrig.push(n.normToOrig[i]!); }
  return { norm: norm.join(''), normToOrig };
}
export function sameAnchorText(a: string, b: string): boolean {
  const left = normalizeWithMap(a), right = normalizeWithMap(b);
  return left.norm === right.norm || stripWhitespaceFromNormalized(left).norm === stripWhitespaceFromNormalized(right).norm;
}
export function uniqueTextAnchor<T extends { text: string }>(values: T[], text: string): T | undefined {
  // 原示例声称uniquely却返回首项；确证唯一才恢复，不猜重复句。
  const matches = values.filter(v => sameAnchorText(v.text, text));
  return matches.length === 1 ? matches[0] : undefined;
}
