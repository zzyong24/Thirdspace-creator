export interface ScriptSelectionSection {
  id: string;
  originalText: string;
}

export type ScriptSelectionMatchStrategy =
  | "id"
  | "text"
  | "position"
  | "whole_text";

export interface ResolvedCurrentScriptSelection {
  sectionId: string;
  originalText: string;
  matchStrategy: ScriptSelectionMatchStrategy;
}

interface ResolveCurrentScriptSelectionInput {
  currentVersionId: string;
  requestedVersionId?: string;
  requestedSectionId: string;
  requestedExcerpt: string;
  requestedSectionIndex?: number;
  /**
   * 兼容尚未携带 sectionIndex 的旧桌面包：服务端可从请求所指的历史版本中恢复用户当时
   * 明确点选的段落位置，再把这个位置绑定到当前版本。这里只恢复结构位置，不复用旧正文。
   */
  requestedVersionSections?: readonly ScriptSelectionSection[];
  contentDataSections: readonly ScriptSelectionSection[];
  structuredSections: readonly ScriptSelectionSection[];
  contentText?: string | null;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * 把浏览器表达的“用户刚才点了哪一段”重新绑定到服务端当前稿面。
 *
 * `contentData.sections` 与 `script_sections` 是同一稿面的两种历史存储形态，不能直接
 * 合并后再按正文找唯一值，否则同一段的双份记录会被误判为冲突。当前版本有结构化
 * contentData 时以它为权威；只有它缺席时才回退 script_sections。
 */
export function resolveCurrentScriptSelectionFromTruth(
  input: ResolveCurrentScriptSelectionInput,
): ResolvedCurrentScriptSelection | null {
  const sections =
    input.contentDataSections.length > 0
      ? input.contentDataSections
      : input.structuredSections;

  const byId = sections.find(
    (section) => section.id === input.requestedSectionId,
  );
  if (byId) {
    return {
      sectionId: byId.id,
      originalText: byId.originalText,
      matchStrategy: "id",
    };
  }

  const excerpt = normalize(input.requestedExcerpt);
  if (excerpt) {
    const byText = sections.filter(
      (section) => normalize(section.originalText) === excerpt,
    );
    if (byText.length === 1) {
      return {
        sectionId: byText[0].id,
        originalText: byText[0].originalText,
        matchStrategy: "text",
      };
    }
  }

  let requestedPosition = Number.isInteger(input.requestedSectionIndex)
    ? input.requestedSectionIndex
    : undefined;
  if (
    requestedPosition === undefined &&
    input.requestedVersionId &&
    input.requestedVersionId !== input.currentVersionId &&
    input.requestedVersionSections?.length
  ) {
    const historicalById = input.requestedVersionSections.findIndex(
      (section) => section.id === input.requestedSectionId,
    );
    if (historicalById >= 0) {
      requestedPosition = historicalById;
    } else if (excerpt) {
      const historicalTextMatches = input.requestedVersionSections
        .map((section, index) => ({ section, index }))
        .filter(({ section }) => normalize(section.originalText) === excerpt);
      if (historicalTextMatches.length === 1) {
        requestedPosition = historicalTextMatches[0].index;
      }
    }
  }

  // sectionId 会在“采纳局部改稿→保存新版本”后重建，但用户仍在连续修改刚才选中的同序段。
  // 所有工具又必须以当前稿面为准，因此这里把浏览器携带的稳定 sectionIndex 重新绑定到
  // **当前版本**的该位置，并返回当前正文。若当前稿已删掉这个位置则自然失败，绝不退化整稿。
  // 旧客户端没有 sectionIndex 时，上面只从它明确指向的历史版本恢复位置；绝不按关键词猜段落。
  // SEMANTIC_BOUNDARY_ALLOW:这里只落实用户明确选中的结构位置，不做内容语义或创作判断。
  if (
    Number.isInteger(requestedPosition) &&
    (requestedPosition ?? -1) >= 0 &&
    (requestedPosition ?? -1) < sections.length
  ) {
    const section = sections[requestedPosition!];
    return {
      sectionId: section.id,
      originalText: section.originalText,
      matchStrategy: "position",
    };
  }

  if (
    input.requestedSectionId === "script-content-text" &&
    typeof input.contentText === "string" &&
    input.contentText.trim()
  ) {
    return {
      sectionId: input.requestedSectionId,
      originalText: input.contentText,
      matchStrategy: "whole_text",
    };
  }

  return null;
}
