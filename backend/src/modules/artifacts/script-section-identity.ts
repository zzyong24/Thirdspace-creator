/**
 * 给历史脚本的无 ID 段落补上确定、用户不可见的技术锚点。
 *
 * 旧版 script.draft 只保存 heading/body，稿面读侧曾临时生成 `script-saved-N`，
 * 但执行侧会把无 ID 段落直接丢弃。这里收口同一规则：已有且唯一的真实 ID 优先；
 * 缺失或重复时按有效无-ID段顺序生成兼容 ID。空壳对象不进入稿面，也不占段落位置。
 *
 * SEMANTIC_BOUNDARY_ALLOW: 这里只生成技术主键并保持用户明确段落顺序，不做内容语义、
 * 创作判断或相似度匹配。
 */

const SCRIPT_TEXT_KEYS = [
  "heading",
  "body",
  "narration",
  "text",
  "content",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasVisibleScriptContent(section: Record<string, unknown>): boolean {
  return SCRIPT_TEXT_KEYS.some(
    (key) =>
      typeof section[key] === "string" &&
      (section[key] as string).trim().length > 0,
  );
}

export function canonicalizeScriptSectionRecords(
  raw: unknown,
): Array<Record<string, unknown> & { id: string }> {
  if (!Array.isArray(raw)) return [];
  const records = raw.filter(
    (value): value is Record<string, unknown> =>
      isRecord(value) && hasVisibleScriptContent(value),
  );
  const reservedIds = new Set(
    records
      .map((section) =>
        typeof section.id === "string" ? section.id.trim() : "",
      )
      .filter(Boolean),
  );
  const usedIds = new Set<string>();
  let generatedIndex = 0;

  return records.map((section) => {
    const suppliedId =
      typeof section.id === "string" ? section.id.trim() : "";
    let id = suppliedId && !usedIds.has(suppliedId) ? suppliedId : "";
    if (!id) {
      do {
        id = `script-saved-${generatedIndex++}`;
      } while (reservedIds.has(id) || usedIds.has(id));
    }
    usedIds.add(id);
    return section.id === id
      ? (section as Record<string, unknown> & { id: string })
      : { ...section, id };
  });
}

export function canonicalizeScriptContentData(
  contentData: Record<string, unknown>,
): Record<string, unknown> {
  if (!Array.isArray(contentData.sections)) return contentData;
  return {
    ...contentData,
    sections: canonicalizeScriptSectionRecords(contentData.sections),
  };
}
